begin;

create or replace function public.append_voice_message(
  p_event_id text,
  p_conversation_id uuid,
  p_turn_id text,
  p_role public.message_role,
  p_content text,
  p_created_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_sequence integer;
  next_sequence integer;
begin
  select m.sequence into existing_sequence
  from public.messages m
  where m.event_id = p_event_id
    and m.conversation_id = p_conversation_id;

  if found then
    return existing_sequence;
  end if;

  perform 1
  from public.conversations c
  where c.id = p_conversation_id
    and c.status in ('CONNECTING', 'ACTIVE')
  for update;

  if not found then
    return null;
  end if;

  select coalesce(max(m.sequence), -1) + 1 into next_sequence
  from public.messages m
  where m.conversation_id = p_conversation_id;

  insert into public.messages (
    event_id,
    tenant_id,
    conversation_id,
    turn_id,
    sequence,
    role,
    content,
    created_at
  )
  select
    p_event_id,
    c.tenant_id,
    c.id,
    p_turn_id,
    next_sequence,
    p_role,
    p_content,
    p_created_at
  from public.conversations c
  where c.id = p_conversation_id
  on conflict (event_id) do nothing;

  if found then
    return next_sequence;
  end if;

  select m.sequence into existing_sequence
  from public.messages m
  where m.event_id = p_event_id
    and m.conversation_id = p_conversation_id;
  return existing_sequence;
end;
$$;

create or replace function public.activate_voice_session(p_conversation_id uuid)
returns table (
  conversation_id uuid,
  status public.conversation_status,
  duration_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_row public.conversations%rowtype;
  remaining_seconds integer;
begin
  select c.* into conversation_row
  from public.conversations c
  where c.id = p_conversation_id
    and c.status in ('CONNECTING', 'ACTIVE')
  for update;

  if not found then
    return;
  end if;

  select greatest(p.included_seconds - p.used_seconds, 0) into remaining_seconds
  from public.usage_policies p
  where p.tenant_id = conversation_row.tenant_id;

  if remaining_seconds is null or remaining_seconds <= 0 then
    return;
  end if;

  update public.conversations c
  set status = 'ACTIVE',
      connected_at = coalesce(c.connected_at, now())
  where c.id = p_conversation_id;

  update public.voice_admissions va
  set status = 'ACTIVE',
      connected_at = coalesce(va.connected_at, now()),
      expires_at = now() + make_interval(secs => remaining_seconds + 120)
  where va.conversation_id = p_conversation_id;

  return query
  select c.id, c.status, c.duration_seconds
  from public.conversations c
  where c.id = p_conversation_id;
end;
$$;

create or replace function public.finalize_voice_session(
  p_conversation_id uuid,
  p_failed boolean
)
returns table (
  conversation_id uuid,
  status public.conversation_status,
  duration_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_row public.conversations%rowtype;
  billable_seconds integer;
  final_status public.conversation_status;
begin
  select c.* into conversation_row
  from public.conversations c
  where c.id = p_conversation_id
  for update;

  if not found then
    return;
  end if;

  if conversation_row.status in ('ENDED', 'FAILED') then
    return query select
      conversation_row.id,
      conversation_row.status,
      conversation_row.duration_seconds;
    return;
  end if;

  if conversation_row.status not in ('CONNECTING', 'ACTIVE') then
    return;
  end if;

  billable_seconds := case
    when conversation_row.connected_at is null then 0
    else greatest(ceil(extract(epoch from (now() - conversation_row.connected_at)))::integer, 0)
  end;
  final_status := case
    when p_failed then 'FAILED'::public.conversation_status
    else 'ENDED'::public.conversation_status
  end;

  update public.conversations c
  set status = final_status,
      ended_at = now(),
      duration_seconds = billable_seconds
  where c.id = p_conversation_id;

  update public.voice_admissions va
  set status = case
        when p_failed then 'FAILED'::public.voice_admission_status
        else 'ENDED'::public.voice_admission_status
      end,
      ended_at = now(),
      expires_at = now()
  where va.conversation_id = p_conversation_id;

  update public.usage_policies p
  set used_seconds = least(p.included_seconds, p.used_seconds + billable_seconds),
      updated_at = now()
  where p.tenant_id = conversation_row.tenant_id;

  return query select c.id, c.status, c.duration_seconds
  from public.conversations c
  where c.id = p_conversation_id;
end;
$$;

revoke all on function public.append_voice_message(text, uuid, text, public.message_role, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.activate_voice_session(uuid)
  from public, anon, authenticated;
revoke all on function public.finalize_voice_session(uuid, boolean)
  from public, anon, authenticated;

commit;
