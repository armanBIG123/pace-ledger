-- Phone numbers, presenters logging results, and prospects linked to their
-- appointments.
--
-- 1) Phone numbers: an optional phone on each prospect and each appointment
--    (the client's), for the Call and Text buttons. Same people can see
--    them as can see the prospect or appointment today.
-- 2) Presenters can log the result: log_presented_appointment() lets the
--    person who presented someone else's appointment save how it went
--    (outcome, sold and premium, recruited, follow-up, interests) on that
--    one appointment only. The sale or recruit still belongs to the advisor
--    who booked it. outcome_logged_by records who logged it, so the advisor
--    sees "Logged by Dynamite Jones". A follow-up the presenter books goes
--    on the advisor's list, the same as when the advisor books one. Once the
--    advisor has logged it themselves, the presenter can't change it.
-- 3) Prospects linked to appointments: appointments.prospect_id. Picking a
--    name from your list links them for good, so "Rob" and "Robert" can't
--    split one person in two. An appointment can only link to a prospect of
--    the same advisor. Existing appointments are linked once, below, where
--    exactly one of that advisor's prospects has the same name.
--
-- Run this in your Supabase SQL Editor (New query -> paste -> Run),
-- BEFORE merging the website change. Safe to run more than once.

-- 1) Phone numbers ---------------------------------------------------------
alter table public.prospects add column if not exists phone text;
alter table public.appointments add column if not exists client_phone text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'prospects_phone_length') then
    alter table public.prospects add constraint prospects_phone_length check (phone is null or char_length(phone) <= 40);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'appointments_client_phone_length') then
    alter table public.appointments add constraint appointments_client_phone_length check (client_phone is null or char_length(client_phone) <= 40);
  end if;
end;
$$;

-- 3) Prospect links (before 2, which copies the link onto follow-ups) ------
alter table public.appointments add column if not exists prospect_id uuid references public.prospects(id) on delete set null;
create index if not exists appointments_prospect_idx on public.appointments (prospect_id) where prospect_id is not null;

-- Only your own prospects: a link to anyone else's is dropped, never an error.
create or replace function public.appointments_keep_prospect_own()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.prospect_id is not null
     and not exists (select 1 from public.prospects p where p.id = new.prospect_id and p.user_id = new.user_id) then
    new.prospect_id := null;
  end if;
  return new;
end;
$$;
drop trigger if exists appointments_keep_prospect_own on public.appointments;
create trigger appointments_keep_prospect_own
  before insert or update of prospect_id, user_id on public.appointments
  for each row execute function public.appointments_keep_prospect_own();

-- Link existing appointments where exactly one of that advisor's prospects
-- has the same name (ignoring capitals and extra spaces).
update public.appointments a
   set prospect_id = m.pid
  from (
    select a2.id as aid, (array_agg(p.id))[1] as pid, count(*) as n
      from public.appointments a2
      join public.prospects p
        on p.user_id = a2.user_id
       and lower(regexp_replace(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '\s+', ' ', 'g'))
         = lower(regexp_replace(btrim(coalesce(a2.client_name, '')), '\s+', ' ', 'g'))
     where a2.prospect_id is null
     group by a2.id
  ) m
 where a.id = m.aid and m.n = 1;

-- 2) Presenters log the result ----------------------------------------------
alter table public.appointments add column if not exists outcome_logged_by uuid references auth.users(id) on delete set null;

-- p_data: { outcome, officiallySold, targetPremium, officiallyRecruited,
--   followUpScheduled, followUpDate, followUpTime, interestedTax,
--   interestedInsurance, followUpDateSetOption, followUpWeekOf }
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
      presentation_type, presentation_type_secondary, zoom_url, is_follow_up
    ) values (
      a.user_id, v_dso, case when v_dso = 'weekend' then 'weekend' else 'weekday' end, v_week, v_fu_date, v_fu_time, v_fu_tz,
      a.presenter, a.trainee, a.client_name, a.client_email, a.client_phone, a.prospect_id,
      'Follow-up to appointment on ' || to_char(a.appointment_date, 'Dy, Mon FMDD'),
      a.presentation_type, a.presentation_type_secondary, a.zoom_url, true
    ) returning * into v_new;
  end if;

  return jsonb_build_object('appointment', to_jsonb(a), 'followUp', case when v_new.id is null then null else to_jsonb(v_new) end);
end;
$$;

revoke all on function public.log_presented_appointment(uuid, jsonb) from public, anon;
grant execute on function public.log_presented_appointment(uuid, jsonb) to authenticated;
