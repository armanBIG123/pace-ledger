-- Calendar privacy: you see someone's calendar only if they're on your
-- team (below you), or you're a super admin.
--
-- 1) Blocked-out times (My schedule): yours, your team's, and super admins
--    see everyone's. Until now everyone could see everyone's, with the
--    reason they typed.
-- 2) The people above you show as unavailable on your calendar, without
--    the reason, so you can still book around them.
-- 3) Booking still stops a double-booking of a busy presenter, but only
--    says why to people allowed to see that calendar.
-- 4) Appointments were already limited to your own, ones you present,
--    your team's, and super admins. This adds the ones you sit in on as
--    the trainee, which the app already expects (Today, Calendar and your
--    observation sales on Growth → My path).
--
-- Run this in your Supabase SQL Editor (New query -> paste -> Run),
-- BEFORE merging the website change. Safe to run more than once.

-- 1) Blocked-out times ----------------------------------------------------------
drop policy if exists "everyone can view schedule blocks" on public.manager_availability_blocks;
drop policy if exists "schedule blocks: yours, your team's, or super admins" on public.manager_availability_blocks;
create policy "schedule blocks: yours, your team's, or super admins" on public.manager_availability_blocks
  for select to authenticated
  using (
    user_id = auth.uid()
    or user_id in (select public.my_downline_ids())
    or exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin')
  );

-- 2) The people above you, as "unavailable" with no reason ----------------------
create or replace function public.my_upline_ids()
returns setof uuid
language sql
stable security definer set search_path = public
as $$
  with recursive up(id, depth) as (
    select p.manager_id, 1 from public.profiles p where p.id = auth.uid() and p.manager_id is not null
    union all
    select p.manager_id, u.depth + 1
    from public.profiles p join up u on p.id = u.id
    where p.manager_id is not null and u.depth < 50
  )
  select distinct id from up where id <> auth.uid();
$$;

-- The same columns as the table, without the reason (label).
create or replace function public.upline_busy_times(p_start date, p_end date)
returns setof jsonb
language sql
stable security definer set search_path = public
as $$
  select to_jsonb(b) - 'label'
  from public.manager_availability_blocks b
  where b.user_id in (select public.my_upline_ids())
    and b.block_date between p_start and p_end
  order by b.block_date, b.start_time;
$$;

revoke all on function public.my_upline_ids() from public, anon;
grant execute on function public.my_upline_ids() to authenticated;
revoke all on function public.upline_busy_times(date, date) from public, anon;
grant execute on function public.upline_busy_times(date, date) to authenticated;

-- 3) The double-booking check: the same as before, except the reason for
--    a blocked-out time only goes to the presenter, people above them and
--    super admins.
create or replace function public.check_appointment_conflict(p_presenter_id uuid, p_date date, p_time time without time zone, p_timezone text DEFAULT NULL::text, p_exclude_appointment_id uuid DEFAULT NULL::uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_block_label text;
  v_tz text := coalesce(p_timezone, 'America/New_York');
  p_at timestamptz := (p_date::text || ' ' || p_time::text)::timestamp at time zone v_tz;
begin
  -- Existing appointment at the same real instant, regardless of which
  -- time zone either appointment was entered in. Falls back to a naive
  -- same-zone match for any legacy row saved before appointment_at
  -- existed (appointment_at is null on those).
  --
  -- Checks all three roles a person can be tied up in, not just
  -- "presenter": the advisor who booked it (user_id), the presenter, and
  -- the trainee sitting in.
  if exists (
    select 1 from appointments
    where (presenter_id = p_presenter_id or user_id = p_presenter_id or trainee_id = p_presenter_id)
      and (p_exclude_appointment_id is null or id <> p_exclude_appointment_id)
      and (
        (appointment_at is not null and appointment_at = p_at)
        or (appointment_at is null and appointment_date = p_date and appointment_time = p_time)
      )
  ) then
    return jsonb_build_object('conflict', true, 'reason', 'appointment');
  end if;

  -- A My Schedule block covering that same instant. Falls back to a naive
  -- same-zone comparison for any block saved before time zones were saved
  -- (start_at/end_at are null on those).
  select label into v_block_label
  from manager_availability_blocks b
  where b.user_id = p_presenter_id
    and (
      (b.start_at is not null and b.end_at is not null and p_at >= b.start_at and p_at < b.end_at)
      or (b.start_at is null and b.block_date = p_date and p_time >= b.start_time and p_time < b.end_time)
    )
  limit 1;

  if found then
    return jsonb_build_object('conflict', true, 'reason', 'unavailable', 'label',
      case when p_presenter_id = auth.uid()
             or p_presenter_id in (select public.my_downline_ids())
             or exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin')
           then v_block_label end);
  end if;

  return jsonb_build_object('conflict', false);
end;
$function$;

-- 4) Appointments you sit in on as the trainee --------------------------------
drop policy if exists "people can see appointments where they're the trainee" on public.appointments;
create policy "people can see appointments where they're the trainee" on public.appointments
  for select to authenticated
  using (trainee_id = auth.uid());
