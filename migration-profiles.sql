-- Profiles (Team & admin -> Profiles), for super admins only.
--
-- Individuals: everyone on the team, with the licensing and contracting
--   steps PaceLedger already tracks. Super admins can flag someone, add
--   notes, and fix their steps and numbers (admin_update_licensing()).
-- Entities: subsidiary agencies that super admins add, each with the
--   9-step subsidiary checklist in 3 phases, documents, notes and a flag.
--
-- Nothing here is visible to managers or advisors.
--
-- Run this in your Supabase SQL Editor (New query -> paste -> Run),
-- BEFORE merging the website change. Safe to run more than once.

-- 1) Entities --------------------------------------------------------------
create table if not exists public.entity_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  partner_id uuid references auth.users(id) on delete set null,
  partner_name text,
  formed_in text not null default 'Nevada',
  operating_states text[] not null default '{}',
  nv_entity_number text,
  ein text,
  entity_npn text,
  resident_license_number text,
  eo_carrier text,
  eo_policy_number text,
  eo_expires_on date,
  fg_writing_number text,
  bank_name text,
  contact_email text,
  contact_phone text,
  flag_reason text,
  flagged_at timestamptz,
  flagged_by_name text,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'entity_profiles_sizes') then
    alter table public.entity_profiles add constraint entity_profiles_sizes check (
      char_length(btrim(name)) between 1 and 160
      and coalesce(char_length(partner_name), 0) <= 120
      and char_length(formed_in) <= 40
      and cardinality(operating_states) <= 60
      and coalesce(char_length(nv_entity_number), 0) <= 60
      and coalesce(char_length(ein), 0) <= 20
      and coalesce(char_length(entity_npn), 0) <= 20
      and coalesce(char_length(resident_license_number), 0) <= 60
      and coalesce(char_length(eo_carrier), 0) <= 120
      and coalesce(char_length(eo_policy_number), 0) <= 60
      and coalesce(char_length(fg_writing_number), 0) <= 40
      and coalesce(char_length(bank_name), 0) <= 120
      and coalesce(char_length(contact_email), 0) <= 200
      and coalesce(char_length(contact_phone), 0) <= 40
      and coalesce(char_length(flag_reason), 0) <= 500
    );
  end if;
end;
$$;
create index if not exists entity_profiles_partner_idx on public.entity_profiles (partner_id) where partner_id is not null;

-- Checklist ticks: one row per ticked item (no row = not ticked).
create table if not exists public.entity_checks (
  entity_id uuid not null references public.entity_profiles(id) on delete cascade,
  item text not null,
  done_on date not null default current_date,
  done_by uuid references auth.users(id) on delete set null,
  done_by_name text,
  created_at timestamptz not null default now(),
  primary key (entity_id, item)
);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'entity_checks_item_key') then
    alter table public.entity_checks add constraint entity_checks_item_key check (item ~ '^[A-Za-z0-9_]{1,60}$');
  end if;
end;
$$;

-- Documents (the files live in the private "profile-docs" bucket).
create table if not exists public.entity_documents (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entity_profiles(id) on delete cascade,
  step text,
  file_path text not null unique,
  file_name text not null,
  size_bytes bigint,
  content_type text,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists entity_documents_entity_idx on public.entity_documents (entity_id, created_at desc);

-- 2) Notes and flags (people and entities) ----------------------------------
create table if not exists public.profile_notes (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid references public.entity_profiles(id) on delete cascade,
  person_id uuid references auth.users(id) on delete cascade,
  body text not null,
  author_id uuid references auth.users(id) on delete set null,
  author_name text,
  created_at timestamptz not null default now()
);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profile_notes_one_subject') then
    alter table public.profile_notes add constraint profile_notes_one_subject check ((entity_id is null) <> (person_id is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profile_notes_body_size') then
    alter table public.profile_notes add constraint profile_notes_body_size check (char_length(btrim(body)) between 1 and 4000);
  end if;
end;
$$;
create index if not exists profile_notes_entity_idx on public.profile_notes (entity_id, created_at desc) where entity_id is not null;
create index if not exists profile_notes_person_idx on public.profile_notes (person_id, created_at desc) where person_id is not null;

create table if not exists public.person_flags (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null,
  flagged_by uuid references auth.users(id) on delete set null,
  flagged_by_name text,
  flagged_at timestamptz not null default now()
);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'person_flags_reason_size') then
    alter table public.person_flags add constraint person_flags_reason_size check (char_length(btrim(reason)) between 1 and 500);
  end if;
end;
$$;

-- 3) Who did it and when (filled in by the database, never by the app) -------
create or replace function public.profiles_tab_my_name()
returns text
language sql stable
security definer set search_path = public
as $$
  select display_name from public.profiles where id = auth.uid()
$$;

create or replace function public.entity_profiles_stamp()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_by_name := public.profiles_tab_my_name();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  if new.flag_reason is not null and btrim(new.flag_reason) = '' then
    new.flag_reason := null;
  end if;
  if tg_op = 'INSERT' or new.flag_reason is distinct from old.flag_reason then
    if new.flag_reason is null then
      new.flagged_at := null;
      new.flagged_by_name := null;
    else
      new.flagged_at := now();
      new.flagged_by_name := public.profiles_tab_my_name();
    end if;
  else
    new.flagged_at := old.flagged_at;
    new.flagged_by_name := old.flagged_by_name;
  end if;
  return new;
end;
$$;
drop trigger if exists entity_profiles_stamp on public.entity_profiles;
create trigger entity_profiles_stamp before insert or update on public.entity_profiles
  for each row execute function public.entity_profiles_stamp();

create or replace function public.profiles_tab_stamp_row()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_table_name = 'entity_checks' then
    new.done_by := auth.uid();
    new.done_by_name := public.profiles_tab_my_name();
  elsif tg_table_name = 'entity_documents' then
    new.uploaded_by := auth.uid();
    new.uploaded_by_name := public.profiles_tab_my_name();
    new.created_at := now();
  elsif tg_table_name = 'profile_notes' then
    new.author_id := auth.uid();
    new.author_name := public.profiles_tab_my_name();
    new.created_at := now();
  elsif tg_table_name = 'person_flags' then
    new.flagged_by := auth.uid();
    new.flagged_by_name := public.profiles_tab_my_name();
    new.flagged_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists entity_checks_stamp on public.entity_checks;
create trigger entity_checks_stamp before insert or update on public.entity_checks
  for each row execute function public.profiles_tab_stamp_row();
drop trigger if exists entity_documents_stamp on public.entity_documents;
create trigger entity_documents_stamp before insert on public.entity_documents
  for each row execute function public.profiles_tab_stamp_row();
drop trigger if exists profile_notes_stamp on public.profile_notes;
create trigger profile_notes_stamp before insert on public.profile_notes
  for each row execute function public.profiles_tab_stamp_row();
drop trigger if exists person_flags_stamp on public.person_flags;
create trigger person_flags_stamp before insert or update on public.person_flags
  for each row execute function public.profiles_tab_stamp_row();

-- 4) Super admins only ----------------------------------------------------------
alter table public.entity_profiles enable row level security;
alter table public.entity_checks enable row level security;
alter table public.entity_documents enable row level security;
alter table public.profile_notes enable row level security;
alter table public.person_flags enable row level security;

drop policy if exists "entity_profiles: super admins" on public.entity_profiles;
create policy "entity_profiles: super admins" on public.entity_profiles for all to authenticated
  using (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'))
  with check (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'));
drop policy if exists "entity_checks: super admins" on public.entity_checks;
create policy "entity_checks: super admins" on public.entity_checks for all to authenticated
  using (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'))
  with check (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'));
drop policy if exists "entity_documents: super admins" on public.entity_documents;
create policy "entity_documents: super admins" on public.entity_documents for all to authenticated
  using (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'))
  with check (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'));
drop policy if exists "profile_notes: super admins" on public.profile_notes;
create policy "profile_notes: super admins" on public.profile_notes for all to authenticated
  using (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'))
  with check (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'));
drop policy if exists "person_flags: super admins" on public.person_flags;
create policy "person_flags: super admins" on public.person_flags for all to authenticated
  using (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'))
  with check (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'));

-- Private files: operating agreements, approvals, formation documents,
-- licenses, E&O certificates. PDF, photos or Word, 25 MB at most.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-docs', 'profile-docs', false, 26214400, array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile-docs: super admins add" on storage.objects;
create policy "profile-docs: super admins add" on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-docs' and exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'));
drop policy if exists "profile-docs: super admins open" on storage.objects;
create policy "profile-docs: super admins open" on storage.objects for select to authenticated
  using (bucket_id = 'profile-docs' and exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'));
drop policy if exists "profile-docs: super admins delete" on storage.objects;
create policy "profile-docs: super admins delete" on storage.objects for delete to authenticated
  using (bucket_id = 'profile-docs' and exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'));

-- 5) Super admins fix a person's licensing and contracting steps --------------
-- p_data may hold any of: course_started_on, course_completed_on, exam_on,
-- exam_passed_on, contracting_sent_on, profile_submitted_on (dates, or ""
-- to clear), npn, fg_writing_number. Keys left out stay as they are.
create or replace function public.admin_update_licensing(p_user uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  r public.licensing_progress;
  pr public.profiles;
  v_npn text := nullif(regexp_replace(coalesce(p_data->>'npn', ''), '[\s-]', '', 'g'), '');
  v_fg text := nullif(btrim(coalesce(p_data->>'fg_writing_number', '')), '');
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  if not exists (select 1 from public.profiles where id = me and role = 'super_admin') then
    raise exception 'not_allowed';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'no_profile';
  end if;
  if p_data ? 'npn' and v_npn is not null and v_npn !~ '^[0-9]{1,15}$' then
    raise exception 'npn_digits';
  end if;
  if p_data ? 'fg_writing_number' and v_fg is not null and char_length(v_fg) > 40 then
    raise exception 'fg_too_long';
  end if;

  insert into public.licensing_progress (user_id) values (p_user) on conflict (user_id) do nothing;
  update public.licensing_progress set
    course_started_on = case when p_data ? 'course_started_on' then nullif(p_data->>'course_started_on', '')::date else course_started_on end,
    course_completed_on = case when p_data ? 'course_completed_on' then nullif(p_data->>'course_completed_on', '')::date else course_completed_on end,
    exam_on = case when p_data ? 'exam_on' then nullif(p_data->>'exam_on', '')::date else exam_on end,
    exam_passed_on = case when p_data ? 'exam_passed_on' then nullif(p_data->>'exam_passed_on', '')::date else exam_passed_on end,
    contracting_sent_on = case when p_data ? 'contracting_sent_on' then nullif(p_data->>'contracting_sent_on', '')::date else contracting_sent_on end,
    contracting_sent_by = case
      when not (p_data ? 'contracting_sent_on') then contracting_sent_by
      when nullif(p_data->>'contracting_sent_on', '') is null then null
      else coalesce(contracting_sent_by, me) end,
    profile_submitted_on = case when p_data ? 'profile_submitted_on' then nullif(p_data->>'profile_submitted_on', '')::date else profile_submitted_on end
  where user_id = p_user
  returning * into r;

  if p_data ? 'npn' or p_data ? 'fg_writing_number' then
    update public.profiles set
      npn = case when p_data ? 'npn' then v_npn else npn end,
      fg_writing_number = case when p_data ? 'fg_writing_number' then v_fg else fg_writing_number end
    where id = p_user
    returning * into pr;
  else
    select * into pr from public.profiles where id = p_user;
  end if;

  return jsonb_build_object('progress', to_jsonb(r), 'npn', pr.npn, 'fg_writing_number', pr.fg_writing_number, 'licensed_at', pr.licensed_at);
end;
$$;

revoke all on function public.admin_update_licensing(uuid, jsonb) from public, anon;
grant execute on function public.admin_update_licensing(uuid, jsonb) to authenticated;
revoke all on function public.profiles_tab_my_name() from public, anon;
grant execute on function public.profiles_tab_my_name() to authenticated;
