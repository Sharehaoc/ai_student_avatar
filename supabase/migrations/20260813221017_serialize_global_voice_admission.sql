create or replace function public.reserve_voice_admission(
  p_conversation_id uuid,
  p_user_id uuid,
  p_global_concurrency_limit integer,
  p_setup_rate_per_minute integer
)
returns table (
  allowed boolean,
  code text,
  remaining_seconds integer,
  active_sessions integer,
  concurrency_limit integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_row public.conversations%rowtype;
  policy public.usage_policies%rowtype;
  tenant_active integer;
  global_active integer;
  recent_setups integer;
  existing_status public.voice_admission_status;
begin
  if p_global_concurrency_limit <= 0 or p_setup_rate_per_minute <= 0 then
    raise exception 'Voice admission limits must be positive';
  end if;

  select c.* into conversation_row
  from public.conversations c
  where c.id = p_conversation_id
    and c.visitor_user_id = p_user_id
    and c.status in ('PENDING', 'CONNECTING');

  if not found then
    raise exception 'Conversation is unavailable';
  end if;

  -- All tenants share the same global limit and setup-rate budget. A transaction-
  -- scoped advisory lock serializes the count-and-reserve section across tenants.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('student-ai-avatar:voice-admission-global', 0)
  );

  select p.* into policy
  from public.usage_policies p
  where p.tenant_id = conversation_row.tenant_id
  for update of p;

  if not found or not policy.voice_enabled then
    return query select false, 'VOICE_POWER_OFF', null::integer, 0, 1, null::integer;
    return;
  end if;

  select va.status into existing_status
  from public.voice_admissions va
  where va.conversation_id = p_conversation_id
    and va.status in ('RESERVED', 'ACTIVE')
    and va.expires_at > now();

  select count(*)::integer into tenant_active
  from public.voice_admissions va
  where va.tenant_id = conversation_row.tenant_id
    and va.status in ('RESERVED', 'ACTIVE')
    and va.expires_at > now();

  if existing_status is not null then
    return query select true, 'ALLOWED',
      greatest(policy.included_seconds - policy.used_seconds, 0),
      tenant_active, policy.tenant_concurrency_limit, null::integer;
    return;
  end if;

  if policy.used_seconds >= policy.included_seconds then
    return query select false, 'TENANT_QUOTA_EXHAUSTED', 0,
      tenant_active, policy.tenant_concurrency_limit, null::integer;
    return;
  end if;

  if tenant_active >= policy.tenant_concurrency_limit then
    return query select false, 'TENANT_CONCURRENCY_LIMIT',
      greatest(policy.included_seconds - policy.used_seconds, 0),
      tenant_active, policy.tenant_concurrency_limit, 30;
    return;
  end if;

  select count(*)::integer into global_active
  from public.voice_admissions va
  where va.status in ('RESERVED', 'ACTIVE')
    and va.expires_at > now();

  if global_active >= p_global_concurrency_limit then
    return query select false, 'GLOBAL_CONCURRENCY_LIMIT',
      greatest(policy.included_seconds - policy.used_seconds, 0),
      global_active, p_global_concurrency_limit, 30;
    return;
  end if;

  select count(*)::integer into recent_setups
  from public.voice_admissions va
  where va.reserved_at > now() - interval '1 minute';

  if recent_setups >= p_setup_rate_per_minute then
    return query select false, 'CALL_SETUP_RATE_LIMIT',
      greatest(policy.included_seconds - policy.used_seconds, 0),
      recent_setups, p_setup_rate_per_minute, 60;
    return;
  end if;

  insert into public.voice_admissions (
    tenant_id,
    conversation_id,
    visitor_user_id,
    status,
    expires_at
  ) values (
    conversation_row.tenant_id,
    conversation_row.id,
    conversation_row.visitor_user_id,
    'RESERVED',
    now() + interval '2 minutes'
  )
  on conflict (conversation_id) do update
  set status = 'RESERVED',
      reserved_at = now(),
      expires_at = now() + interval '2 minutes',
      connected_at = null,
      ended_at = null;

  update public.conversations
  set status = 'CONNECTING'
  where id = conversation_row.id;

  return query select true, 'ALLOWED',
    greatest(policy.included_seconds - policy.used_seconds, 0),
    tenant_active + 1, policy.tenant_concurrency_limit, null::integer;
end;
$$;

revoke all on function public.reserve_voice_admission(uuid, uuid, integer, integer)
  from public, anon, authenticated;
