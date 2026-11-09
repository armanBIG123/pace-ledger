do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create schema if not exists extensions;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
create table public.solar_systems (id uuid primary key, short_name text, name text);
create table public.profiles (id uuid primary key, display_name text not null, manager_id uuid references public.profiles(id), role text not null,
  solar_system_id uuid references public.solar_systems(id), email text, created_at timestamptz default now());
create table public.appointments (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  date_set_option text not null default 'monday', week_of date not null, appointment_date date not null, created_at timestamptz not null default now(),
  is_follow_up boolean default false, outcome text, follow_up_completed_at timestamptz, officially_sold boolean default false, target_premium numeric,
  split_user_id uuid references public.profiles(id) on delete set null, split_percent smallint);
create table public.recruit_invites (id uuid primary key default gen_random_uuid(), upline_id uuid references public.profiles(id), created_by uuid,
  used_by uuid, used_at timestamptz, appointment_id uuid);
grant usage on schema public to authenticated, service_role, anon;
grant select on all tables in schema public to authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
-- like Supabase: new tables are open to these roles until revoked (RLS decides)
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
-- The login PostgREST uses: it switches to authenticated or service_role.
do $$ begin if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if; end $$;
grant authenticated, service_role to authenticator;
