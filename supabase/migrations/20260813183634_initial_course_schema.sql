begin;

create type public.membership_role as enum ('OWNER', 'VISITOR');
create type public.conversation_status as enum ('PENDING', 'CONNECTING', 'ACTIVE', 'ENDED', 'FAILED');
create type public.message_role as enum ('USER', 'ASSISTANT');
create type public.voice_admission_status as enum ('RESERVED', 'ACTIVE', 'ENDED', 'FAILED');

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  display_name text not null check (char_length(display_name) between 1 and 100),
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_memberships (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.membership_role not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create unique index one_owner_per_tenant
  on public.tenant_memberships (tenant_id)
  where role = 'OWNER';

create table public.personas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  description text not null check (char_length(description) between 1 and 1000),
  active_version_id uuid,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index personas_tenant_id_idx on public.personas (tenant_id);
alter table public.personas add constraint personas_id_tenant_unique unique (id, tenant_id);

create table public.persona_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  persona_id uuid not null references public.personas(id) on delete cascade,
  version integer not null check (version > 0),
  system_prompt text not null check (char_length(system_prompt) between 1 and 30000),
  opening_message text not null check (char_length(opening_message) between 1 and 1000),
  voice_snapshot jsonb not null,
  pronunciation_fixes jsonb not null default '{}'::jsonb,
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (persona_id, version),
  unique (id, persona_id, tenant_id),
  foreign key (persona_id, tenant_id) references public.personas(id, tenant_id) on delete cascade,
  check (jsonb_typeof(voice_snapshot) = 'object'),
  check (jsonb_typeof(pronunciation_fixes) = 'object')
);

alter table public.personas
  add constraint personas_active_version_fk
  foreign key (active_version_id, id, tenant_id)
  references public.persona_versions(id, persona_id, tenant_id);

create or replace function public.persona_version_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'PersonaVersion is immutable; create a new version instead';
end;
$$;

create trigger persona_versions_no_update
before update on public.persona_versions
for each row execute function public.persona_version_immutable();

create table public.usage_policies (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  voice_enabled boolean not null default false,
  included_seconds integer not null default 0 check (included_seconds >= 0),
  used_seconds integer not null default 0 check (used_seconds >= 0),
  tenant_concurrency_limit integer not null default 1 check (tenant_concurrency_limit > 0),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  visitor_user_id uuid not null references auth.users(id),
  persona_id uuid not null references public.personas(id),
  persona_version_id uuid not null references public.persona_versions(id),
  status public.conversation_status not null default 'PENDING',
  prompt_snapshot jsonb not null,
  voice_snapshot jsonb not null,
  summary jsonb,
  started_at timestamptz not null default now(),
  connected_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  created_at timestamptz not null default now(),
  foreign key (persona_version_id, persona_id, tenant_id)
    references public.persona_versions(id, persona_id, tenant_id),
  check (jsonb_typeof(prompt_snapshot) = 'object'),
  check (jsonb_typeof(voice_snapshot) = 'object')
);

create index conversations_visitor_idx
  on public.conversations (visitor_user_id, created_at desc);
create index conversations_tenant_idx
  on public.conversations (tenant_id, created_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique check (char_length(event_id) between 1 and 128),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  turn_id text not null check (char_length(turn_id) between 1 and 128),
  sequence integer not null check (sequence >= 0),
  role public.message_role not null,
  content text not null check (char_length(content) between 1 and 10000),
  created_at timestamptz not null,
  unique (conversation_id, sequence)
);

create index messages_conversation_idx
  on public.messages (conversation_id, sequence);

create table public.voice_admissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null unique references public.conversations(id) on delete cascade,
  visitor_user_id uuid not null references auth.users(id),
  status public.voice_admission_status not null default 'RESERVED',
  reserved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  connected_at timestamptz,
  ended_at timestamptz
);

create index voice_admissions_active_tenant_idx
  on public.voice_admissions (tenant_id, expires_at)
  where status in ('RESERVED', 'ACTIVE');

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

revoke all on function public.reserve_voice_admission(uuid, uuid, integer, integer) from public, anon, authenticated;

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.personas enable row level security;
alter table public.persona_versions enable row level security;
alter table public.usage_policies enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.voice_admissions enable row level security;

revoke all on table public.tenants from anon, authenticated;
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.tenant_memberships from anon, authenticated;
revoke all on table public.personas from anon, authenticated;
revoke all on table public.persona_versions from anon, authenticated;
revoke all on table public.usage_policies from anon, authenticated;
revoke all on table public.conversations from anon, authenticated;
revoke all on table public.messages from anon, authenticated;
revoke all on table public.voice_admissions from anon, authenticated;

commit;
