-- Trainings don't block booking.
--
-- The double-booking check used to count every appointment a person was
-- part of: the ones they're presenting, the ones they booked for someone
-- else to present, and the ones they sit in on as the trainee. So an
-- advisor sitting in on a training at 7 PM couldn't set their own
-- appointment at 7 PM ("You're already booked 7:00 - 8:00 PM").
--
-- Now only the appointments a person is presenting take up their time
-- (and, for old appointments saved with no presenter, the ones they
-- booked, since they presented those themselves). Blocked-out time still
-- counts, the same as before.
--
-- 1) The double-booking check, when an appointment is saved.
-- 2) Presenting hours' open times (if migration-presenter-availability.sql
--    has been run): the same rule, so sitting in on a training doesn't
--    take open times away either.
--
-- Run this in your Supabase SQL Editor (New query -> paste -> Run).
-- Safe to run more than once, before or after presenting hours are set up.
-- The website doesn't need to change for it.

begin;

create or replace function public.pl_patch_function(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $$
declare
  def text := pg_get_functiondef(p_fn);
begin
  if position(p_old in def) = 0 then
    if position(p_new in def) > 0 then return; end if; -- already done
    raise exception 'PaceLedger: % is different from what this update expects. Nothing was changed. Send this message to Claude. (Looking for: %)', p_fn, left(p_old, 160);
  end if;
  execute replace(def, p_old, p_new);
end;
$$;

-- 1) The double-booking check ------------------------------------------------------------
select public.pl_patch_function(
  'public.check_appointment_conflict(uuid,date,time without time zone,text,uuid,integer)'::regprocedure,
$x$  where (x.presenter_id = p_presenter_id or x.user_id = p_presenter_id or x.trainee_id = p_presenter_id)$x$,
$x$  -- Only appointments they're presenting: booking one for someone else to
  -- present, or sitting in on one as the trainee (training), doesn't take
  -- up their time. Old rows with no presenter: the person who booked it.
  where (x.presenter_id = p_presenter_id or (x.presenter_id is null and x.user_id = p_presenter_id))$x$);

-- 2) Open times ------------------------------------------------------------------------
do $do$
begin
  if to_regclass('public.presenter_settings') is null then
    return; -- presenting hours aren't set up yet: nothing to change
  end if;
  execute $fn$
create or replace function public.pl_presenter_busy(p_presenter uuid, p_from timestamptz, p_to timestamptz, p_exclude uuid default null)
returns table (s timestamptz, e timestamptz)
language sql stable security definer set search_path = public
as $$
  with tz as (
    select coalesce((select timezone from public.presenter_settings where user_id = p_presenter), 'America/Chicago') as name
  )
  select t.s, t.e
    from public.appointments x
   cross join tz
   cross join lateral (select coalesce(x.appointment_at, (x.appointment_date + x.appointment_time) at time zone coalesce(x.appointment_timezone, tz.name)) as s) b
   cross join lateral (select b.s, b.s + make_interval(mins => coalesce(x.duration_minutes, 30)) as e) t
   where (x.presenter_id = p_presenter or (x.presenter_id is null and x.user_id = p_presenter))
     and (p_exclude is null or x.id <> p_exclude)
     and (x.appointment_at is null or (x.appointment_at < p_to and x.appointment_at > p_from - interval '13 hours'))
     and t.s < p_to and t.e > p_from
  union all
  select k.s, k.e
    from public.manager_availability_blocks bl
   cross join tz
   cross join lateral (
     select coalesce(bl.start_at, (bl.block_date + bl.start_time) at time zone coalesce(bl.timezone, tz.name)) as s,
            coalesce(bl.end_at, (bl.block_date + bl.end_time) at time zone coalesce(bl.timezone, tz.name)) as e
   ) k
   where bl.user_id = p_presenter
     and k.s < p_to and k.e > p_from;
$$;
$fn$;
  revoke all on function public.pl_presenter_busy(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;
  -- Busy-time lookups: the trainee one isn't needed now, and only old rows
  -- with no presenter are looked up by who booked them.
  drop index if exists public.appointments_trainee_at_idx;
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'appointments_user_at_idx' and indexdef !~* 'where') then
    drop index public.appointments_user_at_idx;
  end if;
  create index if not exists appointments_user_at_idx on public.appointments (user_id, appointment_at) where presenter_id is null;
end
$do$;

drop function public.pl_patch_function(regprocedure, text, text);

notify pgrst, 'reload schema';

commit;
