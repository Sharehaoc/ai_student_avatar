begin;

alter table public.profiles
  add column email text,
  add column last_seen_at timestamptz;

create unique index profiles_email_unique
  on public.profiles (lower(email))
  where email is not null;

alter table public.personas
  add column avatar_path text
  check (avatar_path is null or char_length(avatar_path) between 1 and 500);

create unique index one_persona_per_tenant
  on public.personas (tenant_id);

create table public.persona_drafts (
  persona_id uuid primary key,
  tenant_id uuid not null,
  system_prompt text not null check (char_length(system_prompt) between 1 and 30000),
  opening_message text not null check (char_length(opening_message) between 1 and 1000),
  voice_snapshot jsonb not null,
  pronunciation_fixes jsonb not null default '{}'::jsonb,
  updated_by_user_id uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  foreign key (persona_id, tenant_id)
    references public.personas(id, tenant_id) on delete cascade,
  check (jsonb_typeof(voice_snapshot) = 'object'),
  check (jsonb_typeof(pronunciation_fixes) = 'object')
);

create index persona_drafts_tenant_id_idx
  on public.persona_drafts (tenant_id);

insert into public.persona_drafts (
  persona_id,
  tenant_id,
  system_prompt,
  opening_message,
  voice_snapshot,
  pronunciation_fixes,
  updated_by_user_id,
  updated_at
)
select
  p.id,
  p.tenant_id,
  pv.system_prompt,
  pv.opening_message,
  pv.voice_snapshot,
  pv.pronunciation_fixes,
  pv.created_by_user_id,
  pv.created_at
from public.personas p
join public.persona_versions pv
  on pv.id = p.active_version_id
 and pv.persona_id = p.id
 and pv.tenant_id = p.tenant_id;

alter table public.persona_drafts enable row level security;
revoke all on table public.persona_drafts from anon, authenticated;

create or replace function public.publish_persona_draft(p_owner_user_id uuid)
returns table (
  persona_id uuid,
  version integer,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  draft_row record;
  next_version integer;
  new_version_id uuid;
  published_time timestamptz := now();
begin
  select p.id, p.tenant_id, d.system_prompt, d.opening_message,
         d.voice_snapshot, d.pronunciation_fixes
    into draft_row
  from public.personas p
  join public.tenant_memberships tm
    on tm.tenant_id = p.tenant_id
   and tm.user_id = p_owner_user_id
   and tm.role = 'OWNER'
  join public.persona_drafts d
    on d.persona_id = p.id
   and d.tenant_id = p.tenant_id
  limit 1
  for update of p, d;

  if not found then
    return;
  end if;

  select coalesce(max(pv.version), 0) + 1
    into next_version
  from public.persona_versions pv
  where pv.persona_id = draft_row.id;

  insert into public.persona_versions (
    tenant_id,
    persona_id,
    version,
    system_prompt,
    opening_message,
    voice_snapshot,
    pronunciation_fixes,
    created_by_user_id,
    created_at
  ) values (
    draft_row.tenant_id,
    draft_row.id,
    next_version,
    draft_row.system_prompt,
    draft_row.opening_message,
    draft_row.voice_snapshot,
    draft_row.pronunciation_fixes,
    p_owner_user_id,
    published_time
  ) returning id into new_version_id;

  update public.personas
  set active_version_id = new_version_id,
      is_published = true,
      updated_at = published_time
  where id = draft_row.id;

  return query select draft_row.id, next_version, published_time;
end;
$$;

revoke all on function public.publish_persona_draft(uuid)
  from public, anon, authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'persona-avatars',
  'persona-avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

commit;
