-- Team edits and lengths.
--
-- 1) Leaders can fix their team's appointments: the person someone reports
--    to, and super admins, can change an appointment's time and details
--    (date, start, end, time zone, presenter, trainee, client, notes, type).
--    They can't log how it went, delete it, or move it to someone else:
--    those stay with whoever booked it. It goes through one checked function
--    rather than opening the table up.
-- 2) A follow-up that a presenter books when logging how it went now gets
--    the same length as the appointment it follows (it was always 1 hour).
-- 3) Trainings have a length too, so they show when they end. Trainings
--    already posted get 1 hour.
--
-- Run this in your Supabase SQL Editor (New query -> paste -> Run),
-- BEFORE merging the website change. Safe to run more than once.

-- 1) Leaders fix their team's appointments --------------------------------------------
create or replace function public.leader_update_appointment(p_appointment uuid, p_fields jsonb, p_reschedule boolean default false)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  a public.appointments%rowtype;
  was_reschedule boolean;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  select * into a from public.appointments where id = p_appointment for update;
  if not found then raise exception 'not_found'; end if;
  -- The person they report to, or a super admin. (Your own go through the
  -- normal save.)
  if a.user_id = me or not (
    exists (select 1 from public.profiles b where b.id = a.user_id and b.manager_id = me)
    or exists (select 1 from public.profiles s where s.id = me and s.role = 'super_admin')
  ) then
    raise exception 'not_allowed';
  end if;
  was_reschedule := a.status = 'needs_reschedule';

  -- Only the time and the details. Anything not sent stays as it is.
  update public.appointments set
    appointment_date = coalesce(nullif(p_fields->>'appointment_date', '')::date, appointment_date),
    appointment_time = coalesce(nullif(p_fields->>'appointment_time', '')::time, appointment_time),
    appointment_timezone = case when p_fields ? 'appointment_timezone' then nullif(p_fields->>'appointment_timezone', '') else appointment_timezone end,
    duration_minutes = coalesce(nullif(p_fields->>'duration_minutes', '')::int, duration_minutes),
    date_set_option = coalesce(nullif(p_fields->>'date_set_option', ''), date_set_option),
    category = coalesce(nullif(p_fields->>'category', ''), category),
    presenter = coalesce(nullif(btrim(p_fields->>'presenter'), ''), presenter),
    presenter_id = case when p_fields ? 'presenter_id' then nullif(p_fields->>'presenter_id', '')::uuid else presenter_id end,
    trainee = case when p_fields ? 'trainee' then nullif(btrim(p_fields->>'trainee'), '') else trainee end,
    trainee_id = case when p_fields ? 'trainee_id' then nullif(p_fields->>'trainee_id', '')::uuid else trainee_id end,
    client_name = coalesce(nullif(btrim(p_fields->>'client_name'), ''), client_name),
    client_email = case when p_fields ? 'client_email' then nullif(btrim(p_fields->>'client_email'), '') else client_email end,
    client_phone = case when p_fields ? 'client_phone' then nullif(btrim(p_fields->>'client_phone'), '') else client_phone end,
    notes = case when p_fields ? 'notes' then nullif(btrim(p_fields->>'notes'), '') else notes end,
    presentation_type = case when p_fields ? 'presentation_type' then nullif(p_fields->>'presentation_type', '') else presentation_type end,
    presentation_type_secondary = case when p_fields ? 'presentation_type_secondary' then nullif(p_fields->>'presentation_type_secondary', '') else presentation_type_secondary end
  where id = a.id
  returning * into a;

  -- Rebooking one that needs rescheduling counts it as set this week and
  -- starts its outcome fresh, the same as when the advisor does it.
  if p_reschedule and was_reschedule then
    update public.appointments set
      week_of = coalesce(nullif(p_fields->>'week_of', '')::date, week_of),
      status = null, outcome = null, follow_up_scheduled = null,
      officially_recruited = false, officially_sold = false, target_premium = null,
      follow_up_completed_at = null, follow_up_appointment_date = null,
      follow_up_appointment_time = null, follow_up_appointment_timezone = null
    where id = a.id
    returning * into a;
  end if;

  return to_jsonb(a);
end;
$$;

revoke all on function public.leader_update_appointment(uuid, jsonb, boolean) from public, anon;
grant execute on function public.leader_update_appointment(uuid, jsonb, boolean) to authenticated;

-- 2) A presenter's follow-up keeps the appointment's length ---------------------------
-- The same function as in migration-calls-presenter-links.sql, with the
-- length added to the follow-up it books.
create or replace function public.log_presented_appointment(p_appointment uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  a public.appointments%rowtype;
  v_outcome text := nullif(p_data->>'outcome', '');
  v_follow boolean := (p_data->>'followUpScheduled')::boolean;
  v_sold boolean := coalesce((p_data->>'officiallySold')::boolean, false);
  v_recruited boolean := coalesce((p_data->>'officiallyRecruited')::boolean, false);
  v_premium numeric := nullif(p_data->>'targetPremium', '')::numeric;
  v_tax boolean := (p_data->>'interestedTax')::boolean;
  v_home boolean := (p_data->>'interestedInsurance')::boolean;
  v_status text;
  v_fu_date date;
  v_fu_time time;
  v_fu_tz text;
  v_dso text := nullif(p_data->>'followUpDateSetOption', '');
  v_week date := nullif(p_data->>'followUpWeekOf', '')::date;
  v_local date;
  v_new public.appointments%rowtype;
  v_same_follow boolean := false;
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  select * into a from public.appointments where id = p_appointment for update;
  if not found then
    raise exception 'not_found';
  end if;
  if a.presenter_id is distinct from me or a.user_id = me then
    raise exception 'not_presenter';
  end if;
  -- The advisor's own log stands; a presenter can only change their own.
  if a.follow_up_completed_at is not null and a.outcome_logged_by is distinct from me then
    raise exception 'already_logged';
  end if;
  if v_outcome is not null and v_outcome not in ('went_well', 'no_show', 'rescheduled', 'not_interested') then
    raise exception 'bad_outcome';
  end if;
  if v_premium is not null and (v_premium < 0 or v_premium > 100000000) then
    raise exception 'bad_premium';
  end if;

  v_status := case
    when v_follow is true then 'needs_follow_up'
    when v_outcome = 'rescheduled' then 'needs_reschedule'
    when v_outcome = 'no_show' then 'not_completed'
    when v_outcome in ('went_well', 'not_interested') then 'completed'
    else null end;

  if v_follow is true then
    v_fu_date := nullif(p_data->>'followUpDate', '')::date;
    v_fu_time := nullif(p_data->>'followUpTime', '')::time;
    if v_fu_date is null or v_fu_time is null then
      raise exception 'follow_up_time_needed';
    end if;
    v_fu_tz := a.appointment_timezone;
    -- Saving again with the same follow-up doesn't book it twice.
    v_same_follow := a.follow_up_scheduled is true
      and a.follow_up_appointment_date = v_fu_date and a.follow_up_appointment_time = v_fu_time;
  end if;

  update public.appointments set
    outcome = v_outcome,
    follow_up_scheduled = v_follow,
    officially_recruited = v_recruited,
    officially_sold = v_sold,
    interested_tax = v_tax,
    interested_insurance = v_home,
    target_premium = case when v_sold and v_premium > 0 then v_premium else null end,
    follow_up_completed_at = now(),
    status = v_status,
    follow_up_appointment_date = case when v_follow is true then v_fu_date end,
    follow_up_appointment_time = case when v_follow is true then v_fu_time end,
    follow_up_appointment_timezone = case when v_follow is true then v_fu_tz end,
    outcome_logged_by = me
  where id = a.id
  returning * into a;

  -- A follow-up the presenter booked goes on the advisor's list, "set"
  -- today, carrying over the same things as when the advisor books one.
  if v_follow is true and not v_same_follow then
    v_local := (now() at time zone coalesce(nullif(a.appointment_timezone, ''), 'America/Chicago'))::date;
    if v_dso is null or v_dso not in ('weekend', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday') then
      v_dso := case extract(dow from v_local)::int when 1 then 'monday' when 2 then 'tuesday' when 3 then 'wednesday'
                 when 4 then 'thursday' when 5 then 'friday' else 'weekend' end;
    end if;
    if v_week is null or extract(dow from v_week)::int <> 6 or abs(v_week - v_local) > 14 then
      v_week := v_local - ((extract(dow from v_local)::int + 1) % 7);
    end if;
    insert into public.appointments (
      user_id, date_set_option, category, week_of, appointment_date, appointment_time, appointment_timezone,
      presenter, trainee, client_name, client_email, client_phone, prospect_id, notes,
      presentation_type, presentation_type_secondary, zoom_url, is_follow_up, duration_minutes
    ) values (
      a.user_id, v_dso, case when v_dso = 'weekend' then 'weekend' else 'weekday' end, v_week, v_fu_date, v_fu_time, v_fu_tz,
      a.presenter, a.trainee, a.client_name, a.client_email, a.client_phone, a.prospect_id,
      'Follow-up to appointment on ' || to_char(a.appointment_date, 'Dy, Mon FMDD'),
      a.presentation_type, a.presentation_type_secondary, a.zoom_url, true, a.duration_minutes
    ) returning * into v_new;
  end if;

  return jsonb_build_object('appointment', to_jsonb(a), 'followUp', case when v_new.id is null then null else to_jsonb(v_new) end);
end;
$$;

revoke all on function public.log_presented_appointment(uuid, jsonb) from public, anon;
grant execute on function public.log_presented_appointment(uuid, jsonb) to authenticated;

-- 3) Trainings have a length ----------------------------------------------------------
alter table public.trainings add column if not exists duration_minutes integer not null default 60;
alter table public.trainings drop constraint if exists trainings_duration_valid;
alter table public.trainings add constraint trainings_duration_valid check (duration_minutes between 5 and 720);

notify pgrst, 'reload schema';
