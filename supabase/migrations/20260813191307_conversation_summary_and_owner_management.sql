begin;

create or replace function public.build_local_conversation_summary(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_user_message text;
begin
  select left(m.content, 500)
    into first_user_message
  from public.messages m
  where m.conversation_id = p_conversation_id
    and m.role = 'USER'
  order by m.sequence
  limit 1;

  if first_user_message is null then
    return null;
  end if;

  return jsonb_build_object(
    'oneLine', first_user_message,
    'topics', '[]'::jsonb,
    'actionItems', '[]'::jsonb,
    'provider', 'local-extractive',
    'model', 'first-user-message-v1',
    'generatedAt', now()
  );
end;
$$;

revoke all on function public.build_local_conversation_summary(uuid)
  from public, anon, authenticated;

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
      duration_seconds = billable_seconds,
      summary = coalesce(
        c.summary,
        case
          when final_status = 'ENDED'::public.conversation_status
            then public.build_local_conversation_summary(p_conversation_id)
          else null
        end
      )
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

revoke all on function public.finalize_voice_session(uuid, boolean)
  from public, anon, authenticated;

commit;
