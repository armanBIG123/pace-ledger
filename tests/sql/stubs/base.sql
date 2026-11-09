create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to authenticated; grant select on storage.objects to authenticated;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
create or replace function auth.email() returns text language sql stable as $$ select auth.jwt()->>'email' $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='supabase_admin') then create role supabase_admin nologin; end if; end $$;
-- Just enough of PaceLedger to test migration-manage-team-edits.sql.
create table public.solar_systems (id uuid primary key, short_name text, name text);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade, display_name text not null, email text,
  role text not null check (role in ('advisor','manager','super_manager','super_admin')),
  manager_id uuid references public.profiles(id), hierarchy_tier text, solar_system_id uuid, viewing_system_id uuid,
  created_at timestamptz not null default now());
alter table public.profiles enable row level security;
create policy "read" on public.profiles for select using (auth.role() = 'authenticated');
create policy "admins update" on public.profiles for update using (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'));
create table public.appointments (id uuid primary key default gen_random_uuid(), user_id uuid not null, client_name text not null default 'C',
  presenter text not null default '', presenter_id uuid, trainee text, trainee_id uuid);
alter table public.appointments enable row level security;
create policy own on public.appointments for all using (auth.uid() = user_id);
create table public.audit_log (id uuid primary key default gen_random_uuid(), actor_id uuid, actor_name text, action text not null,
  target_name text, details text, created_at timestamptz not null default now());
alter table public.audit_log enable row level security;
create policy "admins read" on public.audit_log for select using (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role in ('super_admin','super_manager')));
grant select, insert, update, delete on all tables in schema public to authenticated;
create or replace function public.my_downline_ids() returns setof uuid language sql stable security definer set search_path = public as $$
  with recursive d(id) as (select id from public.profiles where manager_id = auth.uid()
    union select p.id from public.profiles p join d on p.manager_id = d.id)
  select id from d;
$$;
create or replace function public.pl_big_system() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.solar_systems where short_name = 'BIG';
$$;
create or replace function public.pl_system_of(p uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select solar_system_id from public.profiles where id = p;
$$;
create or replace function public.pl_is_galaxy_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'super_admin' from public.profiles where id = auth.uid()), false);
$$;
create or replace function public.pl_is_super_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'super_manager' from public.profiles where id = auth.uid()), false);
$$;
create or replace function public.pl_is_system_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('super_admin', 'super_manager') from public.profiles where id = auth.uid()), false);
$$;
create or replace function public.pl_home_system() returns uuid
language sql stable security definer set search_path = public as $$
  select solar_system_id from public.profiles where id = auth.uid();
$$;
-- Where new posts go (Chat, MegaPhone, Resources, trainings): your own
-- solar system; for a super admin, the one picked in the header.
create or replace function public.pl_writer_system() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select coalesce(case when role = 'super_admin' then viewing_system_id end, solar_system_id) from public.profiles where id = auth.uid()),
    public.pl_big_system());
$$;
-- Can the signed-in person see things from solar system s? Their own; a
-- super admin: the one picked in the header, or all of them.
create or replace function public.pl_sees_system(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when me.role = 'super_admin'
                then me.viewing_system_id is null or coalesce(s, public.pl_big_system()) = me.viewing_system_id
                else coalesce(s, public.pl_big_system()) = me.solar_system_id end
      from public.profiles me where me.id = auth.uid()), false);
$$;
create or replace function public.pl_sees_person(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p is not null and (p = auth.uid() or public.pl_sees_system(public.pl_system_of(p)));
$$;
-- Super-admin powers over this person: a super admin, or a Super Manager
-- in the same solar system.
create or replace function public.pl_admin_of(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select me.role = 'super_admin' or (me.role = 'super_manager' and me.solar_system_id = public.pl_system_of(p))
      from public.profiles me where me.id = auth.uid()), false);
$$;

-- Who can change a person's role, upline, name, level and solar system.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  acting public.profiles%rowtype;
begin
  -- Server-side work (sign-up, account deletion, service role), and the
  -- app's own trusted functions (your name, the header switch).
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;
  if coalesce(current_setting('pl.trusted_profile_edit', true), '') = 'on' then
    return new;
  end if;
  select * into acting from public.profiles where id = auth.uid();

  if acting.role = 'super_admin' then
    return new;
  end if;

  if acting.role = 'super_manager' and old.id <> acting.id then
    if new.solar_system_id is distinct from old.solar_system_id
       or new.viewing_system_id is distinct from old.viewing_system_id then
      raise exception 'Only super admins can move people between solar systems.';
    end if;
    if new.role is distinct from old.role
       and not (old.role in ('advisor', 'manager') and new.role in ('advisor', 'manager')) then
      raise exception 'Only super admins can make someone a Super Manager or super admin.';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role
     or new.manager_id is distinct from old.manager_id
     or new.display_name is distinct from old.display_name
     or new.email is distinct from old.email
     or new.hierarchy_tier is distinct from old.hierarchy_tier
     or new.solar_system_id is distinct from old.solar_system_id
     or new.viewing_system_id is distinct from old.viewing_system_id then
    raise exception 'Not authorized to change this field';
  end if;
  return new;
end;
$$;

create trigger protect_profile_fields_trigger before update on public.profiles for each row execute procedure public.protect_profile_fields();
create policy "solar system wall" on public.profiles as restrictive for all
  using (id = auth.uid() or public.pl_sees_system(solar_system_id))
  with check (id = auth.uid() or public.pl_sees_system(solar_system_id) or public.pl_is_galaxy_admin());
drop policy if exists "super managers: update" on public.profiles;
create policy "super managers: update" on public.profiles for update using (public.pl_is_super_manager()) with check (public.pl_is_super_manager());
-- Two solar systems. BIG: Morgan (super admin), Dana (manager under Morgan), Jordan + Riley (advisors under Dana).
-- BHB: Sam (super manager), Casey (advisor under Sam).
insert into public.solar_systems values ('aaaaaaaa-0000-0000-0000-000000000001','BIG','Big Insurance Network'),('aaaaaaaa-0000-0000-0000-000000000002','BHB','BHB');
insert into auth.users values ('11111111-1111-1111-1111-111111111111','m'),('33333333-3333-3333-3333-333333333333','d'),('22222222-2222-2222-2222-222222222222','j'),
  ('44444444-4444-4444-4444-444444444444','r'),('55555555-5555-5555-5555-555555555555','s'),('66666666-6666-6666-6666-666666666666','c');
insert into public.profiles (id, display_name, role, manager_id, hierarchy_tier, solar_system_id) values
 ('11111111-1111-1111-1111-111111111111','Morgan Lee','super_admin',null,'EVC','aaaaaaaa-0000-0000-0000-000000000001'),
 ('33333333-3333-3333-3333-333333333333','Dana Brooks','manager','11111111-1111-1111-1111-111111111111','FD','aaaaaaaa-0000-0000-0000-000000000001'),
 ('22222222-2222-2222-2222-222222222222','Jordan Ellis','advisor','33333333-3333-3333-3333-333333333333','UA','aaaaaaaa-0000-0000-0000-000000000001'),
 ('44444444-4444-4444-4444-444444444444','Riley "Dynamite" Park','advisor','33333333-3333-3333-3333-333333333333','FA','aaaaaaaa-0000-0000-0000-000000000001'),
 ('55555555-5555-5555-5555-555555555555','Sam Ortiz','super_manager',null,'FD','aaaaaaaa-0000-0000-0000-000000000002'),
 ('66666666-6666-6666-6666-666666666666','Casey Ng','advisor','55555555-5555-5555-5555-555555555555','UA','aaaaaaaa-0000-0000-0000-000000000002');
insert into public.appointments (user_id, client_name, presenter, presenter_id, trainee, trainee_id) values
 ('22222222-2222-2222-2222-222222222222','Client A','Riley "Dynamite" Park','44444444-4444-4444-4444-444444444444','Jordan Ellis','22222222-2222-2222-2222-222222222222');
