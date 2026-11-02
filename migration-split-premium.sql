-- Split target premium between the advisor and whoever presented.
--
-- When a sale is logged on an appointment someone else presented, the
-- premium can be split between the two of them (50/50 unless they change
-- it), matching the split on the carrier application.
--   * appointments.split_user_id: who shares the sale (always the presenter)
--   * appointments.split_percent: their share, 1-99 (the advisor keeps the rest)
-- The sale counts as a sale for both people; the dollars are shared. Only
-- sales logged from today on are split (nothing old changes).
--
-- Rules the database keeps:
--   * Only a sale can be split; un-marking the sale drops the split.
--   * Only with the presenter, and changing the presenter drops it.
--   * Both people need an F&G writing number in PaceLedger (only licensed,
--     appointed agents can share a commission).
-- The presenter can set the split when they log it (log_presented_appointment).
-- This week's top 3 counts the sale for both, and the "made a sale" post
-- names both.
--
-- Run in the Supabase SQL Editor (New query -> paste -> Run) BEFORE merging
-- the website change. Safe to run more than once.

begin;

-- 1) Columns ---------------------------------------------------------------------
alter table public.appointments add column if not exists split_user_id uuid references public.profiles(id) on delete set null;
alter table public.appointments add column if not exists split_percent smallint;
do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_split_shape') then
    alter table public.appointments add constraint appointments_split_shape check (
      (split_user_id is null and split_percent is null)
      or (split_user_id is not null and split_percent between 1 and 99 and split_user_id <> user_id));
  end if;
end
$do$;
create index if not exists appointments_split_user_idx on public.appointments (split_user_id) where split_user_id is not null;

-- 2) The rules ---------------------------------------------------------------------
create or replace function public.appointments_split_rules()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Only a sale is split, only with whoever presented it (not the advisor),
  -- and only with a share. Anything else just isn't split.
  if not coalesce(new.officially_sold, false)
     or new.split_user_id is null or new.split_percent is null
     or new.split_user_id is distinct from new.presenter_id
     or new.split_user_id = new.user_id then
    new.split_user_id := null;
    new.split_percent := null;
    return new;
  end if;
  if new.split_percent < 1 or new.split_percent > 99 then
    raise exception 'bad_split';
  end if;
  -- Checked when the split is set or changed: both are licensed and appointed.
  if tg_op = 'INSERT' or new.split_user_id is distinct from old.split_user_id or new.split_percent is distinct from old.split_percent then
    if not exists (select 1 from public.profiles p where p.id = new.user_id and coalesce(btrim(p.fg_writing_number), '') <> '')
       or not exists (select 1 from public.profiles p where p.id = new.split_user_id and coalesce(btrim(p.fg_writing_number), '') <> '') then
      raise exception 'split_needs_writing_numbers';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.appointments_split_rules() from public, anon, authenticated;
drop trigger if exists appointments_split_rules on public.appointments;
create trigger appointments_split_rules
  before insert or update on public.appointments
  for each row execute function public.appointments_split_rules();

-- 3) A presenter logging the sale can split it -----------------------------------------
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
  -- The presenter's share of the premium (0 or empty: no split).
  v_split integer := nullif(p_data->>'splitPercent', '')::integer;
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
    outcome_logged_by = me,
    split_user_id = case when v_sold and v_split between 1 and 99 then me end,
    split_percent = case when v_sold and v_split between 1 and 99 then v_split end
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

-- 4) This week's top 3: a split sale counts for both ----------------------------------
create or replace function public.pl_weekly_counts(p_week_start date)
returns table (category text, user_id uuid, n integer)
language sql stable security definer set search_path = public
as $$
  select 'pace'::text, a.user_id, count(*)::int
    from public.appointments a
   where a.week_of = p_week_start and not coalesce(a.is_follow_up, false)
   group by a.user_id
  union all
  -- A split sale counts as a sale for both people.
  select 'sales', s.user_id, count(*)::int
    from (
      select a.user_id
        from public.appointments a
       where a.officially_sold and a.appointment_date between p_week_start and p_week_start + 6
      union all
      select a.split_user_id
        from public.appointments a
       where a.officially_sold and a.split_user_id is not null
         and a.appointment_date between p_week_start and p_week_start + 6
    ) s
   group by s.user_id
  union all
  select 'recruits', r.user_id, count(*)::int
    from (
      select a.user_id
        from public.appointments a
       where a.officially_recruited
         and a.appointment_date between p_week_start and p_week_start + 6
         and a.appointment_date < public.recruits_switch_date()
      union all
      select i.upline_id
        from public.recruit_invites i
       where i.used_at is not null and i.used_by is not null and i.solar_system_id is null
         and i.used_at >= public.recruits_from_signups_since()
         and (i.used_at at time zone 'America/Chicago')::date between p_week_start and p_week_start + 6
         and not public.signup_already_counted(i.appointment_id)
    ) r
   group by r.user_id;
$$;
revoke all on function public.pl_weekly_counts(date) from public, anon, authenticated;

-- 5) "Made a sale" posts name both people ------------------------------------------------
create or replace function public.post_appointment_wins()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  had_sale boolean;
begin
  if tg_op = 'DELETE' then
    delete from public.wins where ref in ('sale:' || old.id, 'recruit:' || old.id);
    return old;
  end if;

  if coalesce(new.officially_sold, false) and (tg_op = 'INSERT' or not coalesce(old.officially_sold, false)) then
    select exists (select 1 from public.appointments x where x.user_id = new.user_id and x.officially_sold and x.id <> new.id) into had_sale;
    insert into public.wins (user_id, kind, ref, detail)
      values (new.user_id, case when had_sale then 'sale' else 'first_sale' end, 'sale:' || new.id,
              case when new.split_user_id is not null then jsonb_build_object('with', new.split_user_id) else '{}'::jsonb end)
      on conflict (ref) do nothing;
  elsif tg_op = 'UPDATE' and coalesce(old.officially_sold, false) and not coalesce(new.officially_sold, false) then
    delete from public.wins where ref = 'sale:' || new.id;
  elsif tg_op = 'UPDATE' and coalesce(new.officially_sold, false) and new.split_user_id is distinct from old.split_user_id then
    -- The split changed after the sale was posted: the post names both people (or just one).
    update public.wins
       set detail = (detail - 'with') || case when new.split_user_id is not null then jsonb_build_object('with', new.split_user_id) else '{}'::jsonb end
     where ref = 'sale:' || new.id;
  end if;

  -- From the switch on, recruits post when they sign up (with their name).
  if coalesce(new.officially_recruited, false) and (tg_op = 'INSERT' or not coalesce(old.officially_recruited, false))
     and coalesce(new.appointment_date, public.pl_today()) < public.recruits_switch_date() then
    insert into public.wins (user_id, kind, ref, detail)
      values (new.user_id, 'recruit', 'recruit:' || new.id, public.recruit_win_detail(new.id, new.user_id, new.client_name))
      on conflict (ref) do nothing;
  elsif tg_op = 'UPDATE' and coalesce(old.officially_recruited, false) and not coalesce(new.officially_recruited, false) then
    delete from public.wins where ref = 'recruit:' || new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists post_appointment_wins_trigger on public.appointments;
create trigger post_appointment_wins_trigger
  after insert or update of officially_sold, officially_recruited, split_user_id or delete on public.appointments
  for each row execute procedure public.post_appointment_wins();

commit;
