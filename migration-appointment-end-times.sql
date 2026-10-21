-- Appointment end times.
--
-- Every appointment now has a length (duration_minutes), so PaceLedger shows
-- when it ends: Calendar, Today, Pipeline, and the Zoom meeting and invites
-- made for it.
-- - Appointments already booked keep 30 minutes, the length their Zoom
--   meeting and calendar invite were made with. New ones start at 1 hour,
--   and the end time can be changed when booking or editing.
-- - The double-booking check now covers the whole appointment: a presenter
--   booked 6:00 to 7:00 PM can't also be booked at 6:30 (before, only the
--   exact same start time was caught). Blocked-out times work the same way.
-- - When it stops a booking, it says when the presenter is busy, but only to
--   people allowed to see that calendar: the presenter, the people above or
--   below them, and super admins. Everyone else is just told it's taken.
--
-- Run this in your Supabase SQL Editor (New query -> paste -> Run),
-- BEFORE merging the website change. Safe to run more than once.

-- 1) How long each appointment is ----------------------------------------------------
-- The ones already there get 30 minutes; new ones default to 60.
alter table public.appointments add column if not exists duration_minutes integer not null default 30;
alter table public.appointments alter column duration_minutes set default 60;
alter table public.appointments drop constraint if exists appointments_duration_valid;
alter table public.appointments add constraint appointments_duration_valid check (duration_minutes between 5 and 720);

-- 2) The double-booking check, over the whole appointment -----------------------------
-- Same inputs as before plus the new appointment's length (p_duration).
drop function if exists public.check_appointment_conflict(uuid, date, time without time zone, text, uuid);
create or replace function public.check_appointment_conflict(
  p_presenter_id uuid,
  p_date date,
  p_time time without time zone,
  p_timezone text default null,
  p_exclude_appointment_id uuid default null,
  p_duration integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tz text := coalesce(p_timezone, 'America/New_York');
  v_len integer := least(greatest(coalesce(p_duration, 60), 5), 720);
  v_start timestamptz := (p_date + p_time) at time zone v_tz;
  v_end timestamptz := v_start + make_interval(mins => v_len);
  v_admin boolean := exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin');
  v_may_see boolean;
  v_hit record;
  v_block record;
begin
  -- Another appointment this person is tied up in (they booked it, they're
  -- presenting, or they're sitting in as the trainee) that overlaps this
  -- one, compared as real instants whatever time zone each was entered in.
  -- Old rows saved before time zones existed (appointment_at is null) are
  -- read in this booking's time zone, as before.
  select t.s, t.e into v_hit
  from public.appointments x
  cross join lateral (
    select coalesce(x.appointment_at, (x.appointment_date + x.appointment_time) at time zone v_tz) as s
  ) b
  cross join lateral (
    select b.s, b.s + make_interval(mins => coalesce(x.duration_minutes, 30)) as e
  ) t
  where (x.presenter_id = p_presenter_id or x.user_id = p_presenter_id or x.trainee_id = p_presenter_id)
    and (p_exclude_appointment_id is null or x.id <> p_exclude_appointment_id)
    and t.s < v_end
    and t.e > v_start
  order by t.s
  limit 1;

  if found then
    v_may_see := p_presenter_id = auth.uid()
      or p_presenter_id in (select public.my_upline_ids())
      or p_presenter_id in (select public.my_downline_ids())
      or v_admin;
    return jsonb_build_object('conflict', true, 'reason', 'appointment',
      'starts_at', case when v_may_see then v_hit.s end,
      'ends_at', case when v_may_see then v_hit.e end);
  end if;

  -- A blocked-out time (My schedule) that overlaps it. Blocks saved before
  -- time zones were (start_at/end_at are null) are read in this booking's
  -- time zone.
  select b.label,
         coalesce(b.start_at, (b.block_date + b.start_time) at time zone v_tz) as s,
         coalesce(b.end_at, (b.block_date + b.end_time) at time zone v_tz) as e
  into v_block
  from public.manager_availability_blocks b
  where b.user_id = p_presenter_id
    and coalesce(b.start_at, (b.block_date + b.start_time) at time zone v_tz) < v_end
    and coalesce(b.end_at, (b.block_date + b.end_time) at time zone v_tz) > v_start
  order by 2
  limit 1;

  if found then
    v_may_see := p_presenter_id = auth.uid()
      or p_presenter_id in (select public.my_upline_ids())
      or p_presenter_id in (select public.my_downline_ids())
      or v_admin;
    -- The reason they typed only goes to them, the people above them and
    -- super admins (the same as on the Calendar).
    return jsonb_build_object('conflict', true, 'reason', 'unavailable',
      'label', case when p_presenter_id = auth.uid()
                      or p_presenter_id in (select public.my_downline_ids())
                      or v_admin
                    then v_block.label end,
      'starts_at', case when v_may_see then v_block.s end,
      'ends_at', case when v_may_see then v_block.e end);
  end if;

  return jsonb_build_object('conflict', false);
end;
$function$;

revoke all on function public.check_appointment_conflict(uuid, date, time without time zone, text, uuid, integer) from public, anon;
grant execute on function public.check_appointment_conflict(uuid, date, time without time zone, text, uuid, integer) to authenticated;

-- 3) Let the website see the new column and check right away -------------------------
notify pgrst, 'reload schema';
