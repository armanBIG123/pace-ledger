-- What the challenges migration needs beyond stubs/base.sql: the appointment
-- and invite columns it counts from, and the production helpers it calls
-- (copied from supabase/migrations/20261110180404_baseline.sql).
alter table public.appointments add column week_of date not null default '2026-11-14',
  add column is_follow_up boolean not null default false,
  add column created_at timestamptz not null default now();
create table public.recruit_invites (id uuid primary key default gen_random_uuid(), upline_id uuid not null, appointment_id uuid,
  used_at timestamptz, used_by uuid, solar_system_id uuid);
create or replace function public.recruits_from_signups_since() returns timestamptz language sql immutable as $$select '2026-10-24 05:17:44.52145+00'::timestamptz$$;
create or replace function public.recruits_switch_date() returns date language sql stable as $$
  select (public.recruits_from_signups_since() at time zone 'America/Chicago')::date;
$$;
alter table public.appointments add column officially_recruited boolean not null default false, add column appointment_date date;
create or replace function public.signup_already_counted(p_appointment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_appointment is not null and exists (
    select 1 from public.appointments a
    where a.id = p_appointment and coalesce(a.officially_recruited, false)
      and a.appointment_date < public.recruits_switch_date()
  );
$$;
CREATE OR REPLACE FUNCTION "public"."stamp_solar_system"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    if new.solar_system_id is null or not public.pl_is_galaxy_admin() then
      new.solar_system_id := case when auth.uid() is null then coalesce(new.solar_system_id, public.pl_big_system())
                                  else public.pl_writer_system() end;
    end if;
  else
    new.solar_system_id := old.solar_system_id;
  end if;
  return new;
end;
$$;
grant select, insert, update, delete on all tables in schema public to authenticated;
