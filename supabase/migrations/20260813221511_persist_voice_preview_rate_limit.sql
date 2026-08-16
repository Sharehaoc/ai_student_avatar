create table public.voice_preview_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now()
);

create or replace function public.consume_voice_preview_rate_limit(
  p_user_id uuid,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
  current_window_started_at timestamptz;
begin
  if p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'Voice preview rate limits must be positive';
  end if;

  insert into public.voice_preview_rate_limits (
    user_id,
    window_started_at,
    request_count,
    updated_at
  ) values (
    p_user_id,
    now(),
    1,
    now()
  )
  on conflict (user_id) do update
  set window_started_at = case
        when public.voice_preview_rate_limits.window_started_at
          <= now() - pg_catalog.make_interval(secs => p_window_seconds)
          then now()
        else public.voice_preview_rate_limits.window_started_at
      end,
      request_count = case
        when public.voice_preview_rate_limits.window_started_at
          <= now() - pg_catalog.make_interval(secs => p_window_seconds)
          then 1
        else least(public.voice_preview_rate_limits.request_count + 1, p_limit + 1)
      end,
      updated_at = now()
  returning request_count, window_started_at
  into current_count, current_window_started_at;

  allowed := current_count <= p_limit;
  retry_after_seconds := case
    when allowed then null
    else greatest(
      1,
      ceil(extract(epoch from (
        current_window_started_at
          + pg_catalog.make_interval(secs => p_window_seconds)
          - now()
      )))::integer
    )
  end;
  return next;
end;
$$;

alter table public.voice_preview_rate_limits enable row level security;
revoke all on table public.voice_preview_rate_limits from public, anon, authenticated;
revoke all on function public.consume_voice_preview_rate_limit(uuid, integer, integer)
  from public, anon, authenticated;
