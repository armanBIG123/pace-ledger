-- Solar systems, organized: run AFTER migration-solar-systems.sql.
--
-- Super admins no longer switch solar systems from a bar under the header.
-- Everywhere in PaceLedger they see their own solar system (Big Insurance
-- Network), like before. Only Org Chart and Manage Team have tabs for
-- each solar system; those two screens ask for the one picked on each
-- request (the x-pl-system header), so nothing else changes while you
-- look at another solar system, and closing the screen ends it.
--
-- Everything a super admin posts (Chat, MegaPhone, Resources, trainings)
-- goes to their own solar system.
--
-- Run this in the Supabase SQL Editor (New query -> paste -> Run) before
-- merging the website change. Safe to run more than once. It runs as one
-- piece: if anything stops it, nothing is changed.

begin;

-- The solar system a super admin's Org Chart or Manage Team tab asks for
-- (null if none, or if it isn't a valid id).
create or replace function public.pl_scope_header() returns uuid
language sql stable set search_path = public as $$
  select case when h ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then h::uuid end
    from (select nullif(current_setting('request.headers', true), '')::json ->> 'x-pl-system' as h) x;
$$;
revoke all on function public.pl_scope_header() from public;
grant execute on function public.pl_scope_header() to anon, authenticated;

-- Can the signed-in person see things from solar system s? Their own. A
-- super admin: their own, or the one an Org Chart / Manage Team tab asks for.
create or replace function public.pl_sees_system(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select coalesce(s, public.pl_big_system()) =
           case when me.role = 'super_admin' then coalesce(public.pl_scope_header(), me.solar_system_id)
                else me.solar_system_id end
      from public.profiles me where me.id = auth.uid()), false);
$$;

-- Where new posts go (Chat, MegaPhone, Resources, trainings): your own
-- solar system, for everyone.
create or replace function public.pl_writer_system() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce((select solar_system_id from public.profiles where id = auth.uid()), public.pl_big_system());
$$;

-- The header switch is gone.
drop function if exists public.set_viewing_system(uuid);

-- Super admins (Manage Team): move someone, and everyone under them, to
-- another solar system. They report to no one there until a leader is
-- picked. (Done here because the person leaves the tab you're looking at.)
create or replace function public.move_to_solar_system(p_person uuid, p_system uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.pl_is_galaxy_admin() then raise exception 'not_allowed'; end if;
  if p_person = auth.uid() then raise exception 'not_yourself'; end if;
  if not exists (select 1 from public.solar_systems where id = p_system) then raise exception 'no_such_solar_system'; end if;
  update public.profiles set solar_system_id = p_system, manager_id = null where id = p_person;
  if not found then raise exception 'no_such_person'; end if;
end;
$$;
revoke all on function public.move_to_solar_system(uuid, uuid) from public, anon;
grant execute on function public.move_to_solar_system(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
