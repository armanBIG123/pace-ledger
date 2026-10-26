-- Presenting hours and open times (like Calendly, inside PaceLedger).
--
-- Anyone who presents for their team sets, once, when they present each
-- week (for example Mon-Thu 6-9 PM and Sat 10 AM-2 PM), how long a
-- presentation runs, and a few rules (how much notice, how far ahead, a
-- break between). From then on PaceLedger works out their open times by
-- itself: their hours, minus every appointment they're already presenting
-- and every time they've blocked out (sitting in on a training doesn't
-- count). When an advisor logs an appointment with them, the form shows those
-- open times to tap. Nobody keeps a calendar up to date by hand.
--
-- What other people see: only which times are open. Never what someone is
-- doing, or why a time isn't open.
--
-- Double-booking: two advisors could tap the same open time a second apart.
-- The database now settles it: when a booking would put a presenter in two
-- places at once, it's refused ("presenter_busy"), one booking at a time per
-- presenter, so the second one is told to pick another time.
--
-- Run this in the Supabase SQL Editor (New query -> paste -> Run) before
-- merging the website change. Safe to run more than once. It runs as one
-- piece: if anything stops it, nothing is changed.

begin;

-- 1) Presenting hours ------------------------------------------------------------
create table if not exists public.presenter_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  timezone text not null default 'America/Chicago',
  slot_minutes integer not null default 60 check (slot_minutes between 15 and 240),
  step_minutes integer not null default 30 check (step_minutes in (15, 30, 60)),
  buffer_minutes integer not null default 0 check (buffer_minutes between 0 and 60),
  notice_minutes integer not null default 120 check (notice_minutes between 0 and 10080),
  horizon_days integer not null default 14 check (horizon_days between 1 and 60),
  use_google boolean not null default false,  -- also skip times busy on their Google Calendar
  accepting boolean not null default true,    -- taking bookings right now
  updated_at timestamptz not null default now()
);
create table if not exists public.presenter_hours (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),  -- 0 = Sunday, in their time zone
  start_time time not null,
  end_time time not null,
  constraint presenter_hours_order check (end_time > start_time)
);
create index if not exists presenter_hours_user_idx on public.presenter_hours (user_id, weekday);

alter table public.presenter_settings enable row level security;
alter table public.presenter_hours enable row level security;
-- Yours to see (and your super admin's or Super Manager's, to help set them
-- up). Everyone else only ever sees open times, through
-- presenter_open_slots(). Changes go through save_presenting_hours().
drop policy if exists "presenting hours: yours or your admin's" on public.presenter_settings;
create policy "presenting hours: yours or your admin's" on public.presenter_settings for select to authenticated
  using (user_id = auth.uid() or public.pl_admin_of(user_id));
drop policy if exists "presenting hours: yours or your admin's" on public.presenter_hours;
create policy "presenting hours: yours or your admin's" on public.presenter_hours for select to authenticated
  using (user_id = auth.uid() or public.pl_admin_of(user_id));
drop policy if exists "solar system wall" on public.presenter_settings;
create policy "solar system wall" on public.presenter_settings as restrictive for all
  using (public.pl_sees_person(user_id)) with check (public.pl_sees_person(user_id));
drop policy if exists "solar system wall" on public.presenter_hours;
create policy "solar system wall" on public.presenter_hours as restrictive for all
  using (public.pl_sees_person(user_id)) with check (public.pl_sees_person(user_id));
revoke all on public.presenter_settings, public.presenter_hours from anon, authenticated;
grant select on public.presenter_settings, public.presenter_hours to authenticated;

-- Looking up someone's busy times quickly.
create index if not exists appointments_presenter_at_idx on public.appointments (presenter_id, appointment_at) where presenter_id is not null;
create index if not exists appointments_user_at_idx on public.appointments (user_id, appointment_at) where presenter_id is null;
create index if not exists manager_availability_blocks_user_start_idx on public.manager_availability_blocks (user_id, start_at);

-- 2) When someone is busy ----------------------------------------------------------
-- Every appointment they're presenting, and every time they've blocked out,
-- that overlaps [p_from, p_to). Sitting in on a training (the trainee) or
-- booking one for someone else to present doesn't take up their time; old
-- rows with no presenter count for the person who booked them. The same
-- rules as the double-booking check (migration-trainings-dont-block.sql). Old rows
-- from before time zones are read in the presenter's time zone. Only for
-- the functions below; nobody can call it directly.
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
revoke all on function public.pl_presenter_busy(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;

-- 3) Open times ----------------------------------------------------------------------
-- A presenter's open times from p_from (their today at the earliest) for
-- p_days days, never past how far ahead they take bookings. Anyone in the
-- same solar system can ask (setting presenting hours is saying "book me").
-- p_exclude: the appointment being moved, so its own time shows as open.
-- Returns { ok, has_hours, accepting, timezone, slot_minutes, step_minutes,
-- buffer_minutes, use_google, last_day, slots: [[start, end], ...] }.
create or replace function public.presenter_open_slots(p_presenter uuid, p_from date default null, p_days integer default 14, p_exclude uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  st public.presenter_settings%rowtype;
  v_has_hours boolean;
  v_today date;
  v_from date;
  v_to date;
  v_earliest timestamptz;
  v_slots jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;
  if p_presenter is null or not (p_presenter = auth.uid() or public.pl_sees_person(p_presenter)) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  select * into st from public.presenter_settings where user_id = p_presenter;
  v_has_hours := exists (select 1 from public.presenter_hours where user_id = p_presenter);
  if st.user_id is null or not v_has_hours then
    return jsonb_build_object('ok', true, 'has_hours', false, 'accepting', false, 'slots', '[]'::jsonb);
  end if;
  if not st.accepting then
    return jsonb_build_object('ok', true, 'has_hours', true, 'accepting', false, 'timezone', st.timezone, 'slots', '[]'::jsonb);
  end if;

  v_today := (now() at time zone st.timezone)::date;
  v_from := greatest(coalesce(p_from, v_today), v_today);
  v_to := least(v_from + least(greatest(coalesce(p_days, 14), 1), 60) - 1, v_today + st.horizon_days - 1);
  v_earliest := now() + make_interval(mins => st.notice_minutes);

  with days as (
    select d::date as d from generate_series(v_from, v_to, interval '1 day') as g(d)
  ),
  cand as (
    -- Every start in their hours, as wall-clock time in their time zone
    -- (so daylight saving is handled), every step_minutes.
    select (lt at time zone st.timezone) as s,
           (lt at time zone st.timezone) + make_interval(mins => st.slot_minutes) as e
      from days
      join public.presenter_hours h on h.user_id = p_presenter and h.weekday = extract(dow from days.d)
     cross join lateral generate_series(days.d + h.start_time,
                                        -- "until midnight" is kept as 23:59:59
                                        (case when h.end_time >= time '23:59:59' then (days.d + 1)::timestamp else days.d + h.end_time end)
                                          - make_interval(mins => st.slot_minutes),
                                        make_interval(mins => st.step_minutes)) as lt
  ),
  busy as (
    select b.s, b.e from public.pl_presenter_busy(
      p_presenter,
      (select min(s) from cand) - make_interval(mins => st.buffer_minutes),
      (select max(e) from cand) + make_interval(mins => st.buffer_minutes),
      p_exclude) b
  ),
  open as (
    select distinct c.s, c.e from cand c
     where c.s >= v_earliest
       and not exists (
         select 1 from busy b
          where b.s < c.e + make_interval(mins => st.buffer_minutes)
            and b.e > c.s - make_interval(mins => st.buffer_minutes))
  )
  select coalesce(jsonb_agg(jsonb_build_array(s, e) order by s), '[]'::jsonb) into v_slots from open;

  return jsonb_build_object(
    'ok', true, 'has_hours', true, 'accepting', true,
    'timezone', st.timezone, 'slot_minutes', st.slot_minutes, 'step_minutes', st.step_minutes,
    'buffer_minutes', st.buffer_minutes, 'use_google', st.use_google,
    'first_day', v_from, 'last_day', v_to, 'horizon_end', v_today + st.horizon_days - 1,
    'slots', v_slots);
end;
$$;
revoke all on function public.presenter_open_slots(uuid, date, integer, uuid) from public, anon;
grant execute on function public.presenter_open_slots(uuid, date, integer, uuid) to authenticated;

-- 4) Saving your presenting hours -------------------------------------------------------
-- p_settings: { timezone, slot_minutes, step_minutes, buffer_minutes,
--               notice_minutes, horizon_days, use_google, accepting }
-- p_hours:    [{ weekday: 0-6, start: "18:00", end: "21:00" }, ...]
-- Replaces your hours in one go. No hours at all: nobody can book you from
-- open times (typing a time still works).
create or replace function public.save_presenting_hours(p_settings jsonb, p_hours jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_tz text := coalesce(nullif(btrim(p_settings ->> 'timezone'), ''), 'America/Chicago');
  v_hours jsonb := coalesce(p_hours, '[]'::jsonb);
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from pg_timezone_names where name = v_tz) then raise exception 'bad_timezone'; end if;
  if jsonb_typeof(v_hours) <> 'array' or jsonb_array_length(v_hours) > 42 then raise exception 'bad_hours'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_hours) x
     where coalesce(x ->> 'weekday', '') !~ '^[0-6]$'
        or coalesce(x ->> 'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
        or coalesce(x ->> 'end', '') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?|24:00)$'
  ) then raise exception 'bad_hours'; end if;
  if exists (select 1 from jsonb_array_elements(v_hours) x where (x ->> 'end')::time <= (x ->> 'start')::time and x ->> 'end' <> '24:00') then
    raise exception 'end_before_start';
  end if;
  if exists (
    with h as (
      select (x ->> 'weekday')::int as wd, (x ->> 'start')::time as st,
             case when x ->> 'end' = '24:00' then time '23:59:59' else (x ->> 'end')::time end as en, n
        from jsonb_array_elements(v_hours) with ordinality as t(x, n)
    )
    select 1 from h a join h b on a.wd = b.wd and a.n < b.n and a.st < b.en and b.st < a.en
  ) then raise exception 'overlapping_hours'; end if;

  insert into public.presenter_settings as ps (user_id, timezone, slot_minutes, step_minutes, buffer_minutes, notice_minutes, horizon_days, use_google, accepting, updated_at)
  values (me, v_tz,
          coalesce((p_settings ->> 'slot_minutes')::int, 60), coalesce((p_settings ->> 'step_minutes')::int, 30),
          coalesce((p_settings ->> 'buffer_minutes')::int, 0), coalesce((p_settings ->> 'notice_minutes')::int, 120),
          coalesce((p_settings ->> 'horizon_days')::int, 14), coalesce((p_settings ->> 'use_google')::boolean, false),
          coalesce((p_settings ->> 'accepting')::boolean, true), now())
  on conflict (user_id) do update set
    timezone = excluded.timezone, slot_minutes = excluded.slot_minutes, step_minutes = excluded.step_minutes,
    buffer_minutes = excluded.buffer_minutes, notice_minutes = excluded.notice_minutes, horizon_days = excluded.horizon_days,
    use_google = excluded.use_google, accepting = excluded.accepting, updated_at = now();

  delete from public.presenter_hours where user_id = me;
  insert into public.presenter_hours (user_id, weekday, start_time, end_time)
  select me, (x ->> 'weekday')::smallint, (x ->> 'start')::time,
         case when x ->> 'end' = '24:00' then time '23:59:59' else (x ->> 'end')::time end
    from jsonb_array_elements(v_hours) x;

  return jsonb_build_object('ok', true, 'hours', jsonb_array_length(v_hours));
end;
$$;
revoke all on function public.save_presenting_hours(jsonb, jsonb) from public, anon;
grant execute on function public.save_presenting_hours(jsonb, jsonb) to authenticated;

-- 5) No double-booking a presenter --------------------------------------------------------
-- When an appointment puts a manager in to present for someone else (or
-- moves one), and they're already busy then, it's refused with
-- "presenter_busy". Bookings for the same presenter take turns, so two
-- people tapping the same open time can't both get it. Left alone: your own
-- appointments with yourself presenting, follow-ups booked from "How did it
-- go?", times already past, edits that don't change the time or presenter,
-- and server-side work.
create or replace function public.guard_presenter_booking()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_old_start timestamptz;
  v_hit record;
begin
  if auth.uid() is null then return new; end if;
  if new.presenter_id is null or new.presenter_id = new.user_id or coalesce(new.is_follow_up, false) then return new; end if;
  v_start := case when new.appointment_date is not null and new.appointment_time is not null and new.appointment_timezone is not null
                  then (new.appointment_date + new.appointment_time) at time zone new.appointment_timezone end;
  if v_start is null or v_start < now() then return new; end if;
  if tg_op = 'UPDATE' then
    v_old_start := case when old.appointment_date is not null and old.appointment_time is not null and old.appointment_timezone is not null
                        then (old.appointment_date + old.appointment_time) at time zone old.appointment_timezone end;
    if new.presenter_id is not distinct from old.presenter_id and v_start is not distinct from v_old_start
       and coalesce(new.duration_minutes, 60) = coalesce(old.duration_minutes, 60) then
      return new;
    end if;
  end if;
  v_end := v_start + make_interval(mins => least(greatest(coalesce(new.duration_minutes, 60), 5), 720));

  perform pg_advisory_xact_lock(hashtextextended('paceledger:presenter:' || new.presenter_id::text, 0));
  select b.s, b.e into v_hit from public.pl_presenter_busy(new.presenter_id, v_start, v_end, new.id) b order by b.s limit 1;
  if found then
    raise exception 'presenter_busy' using errcode = 'P0001',
      detail = json_build_object('starts_at', v_hit.s, 'ends_at', v_hit.e)::text;
  end if;
  return new;
end;
$$;
drop trigger if exists presenter_booking_guard on public.appointments;
create trigger presenter_booking_guard
  before insert or update of presenter_id, appointment_date, appointment_time, appointment_timezone, duration_minutes
  on public.appointments for each row execute function public.guard_presenter_booking();

notify pgrst, 'reload schema';

commit;
