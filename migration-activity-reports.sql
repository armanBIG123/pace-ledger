-- Daily and weekly activity reports by email.
--
-- Every morning at 7 AM Central, PaceLedger emails yesterday's numbers.
-- Every Saturday at 7 AM it also emails the week just finished (Saturday to
-- Friday), compared with the week before. Each email has company totals,
-- each leader's team and each agent:
--   * Team members added       people who signed up through a recruit link
--                              (credited to the person they joined under)
--   * Appointments set         new appointments, counted on the day they
--                              were set, the same as Pace (not follow-ups)
--   * Appointments completed   appointments that took place that day with
--                              an outcome of Went well or Not interested
--                              (follow-ups included)
--   * Applications submitted   appointments logged as Sold that day
--   * Total target premium     the target premium on those sales (a split
--                              sale counts for both people, premium shared)
-- Everything comes from what's already logged in PaceLedger; nobody
-- reports anything extra.
--
-- Who gets them: super admins choose in PaceLedger (Team & admin, Team
-- overview, Email reports). It starts with agency@, arman@ and dynamite@
-- biginsurancenetwork.com.
--
-- How it runs: the database calls the activity-report edge function once
-- an hour (pg_cron + pg_net). The function sends whatever is due and never
-- sends the same report twice.
--
-- Run this in the Supabase SQL Editor (New query -> paste -> Run) after
-- deploying the activity-report edge function. Safe to run more than once.

-- 1) Settings: who gets the reports, and which ones ----------------------------
create table if not exists public.report_settings (
  id boolean primary key default true check (id),
  recipients text[] not null default array[
    'agency@biginsurancenetwork.com', 'arman@biginsurancenetwork.com', 'dynamite@biginsurancenetwork.com'
  ],
  daily_on boolean not null default true,
  weekly_on boolean not null default true,
  last_error text,
  last_error_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
insert into public.report_settings (id) values (true) on conflict (id) do nothing;
alter table public.report_settings enable row level security;
drop policy if exists "super admins read report settings" on public.report_settings;
create policy "super admins read report settings" on public.report_settings for select
  using (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'));
revoke insert, update, delete on public.report_settings from anon, authenticated;

-- 2) What was sent: each report once per period ---------------------------------
create table if not exists public.report_sends (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('daily', 'weekly')),
  period_start date not null,
  period_end date not null,
  test boolean not null default false,
  status text not null default 'sending' check (status in ('sending', 'sent')),
  sent_to text,
  sent_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create unique index if not exists report_sends_once on public.report_sends (kind, period_start) where not test;
create index if not exists report_sends_recent on public.report_sends (created_at desc);
alter table public.report_sends enable row level security;
drop policy if exists "super admins read report sends" on public.report_sends;
create policy "super admins read report sends" on public.report_sends for select
  using (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'));
revoke insert, update, delete on public.report_sends from anon, authenticated;

-- 3) The schedule's key ---------------------------------------------------------
-- Only the database's hourly job and the edge function read it (no policy:
-- nobody signed in can see it). Made here; nothing to copy anywhere.
create table if not exists public.report_cron (
  id boolean primary key default true check (id),
  token text not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
);
insert into public.report_cron (id) values (true) on conflict (id) do nothing;
alter table public.report_cron enable row level security;
revoke all on public.report_cron from anon, authenticated;

-- 4) Super admins: save who gets them and which ones ----------------------------
create or replace function public.pl_report_save_settings(p_recipients text[], p_daily boolean, p_weekly boolean)
returns public.report_settings
language plpgsql
security definer set search_path = public
as $$
declare
  clean text[];
  bad text;
  saved public.report_settings;
begin
  if not exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  -- Trimmed, lower-case, no repeats, in the order given.
  select coalesce(array_agg(e order by first_at), '{}') into clean
    from (select lower(btrim(x)) as e, min(o) as first_at
            from unnest(coalesce(p_recipients, '{}')) with ordinality as t(x, o)
           where btrim(coalesce(x, '')) <> ''
           group by lower(btrim(x))) s;
  select e into bad from unnest(clean) e where e !~ '^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$' or char_length(e) > 254 limit 1;
  if bad is not null then raise exception 'bad_email: %', bad using errcode = '22023'; end if;
  if cardinality(clean) > 20 then raise exception 'too_many' using errcode = '22023'; end if;
  update public.report_settings
     set recipients = clean, daily_on = coalesce(p_daily, daily_on), weekly_on = coalesce(p_weekly, weekly_on),
         updated_at = now(), updated_by = auth.uid()
   where id
  returning * into saved;
  return saved;
end;
$$;
revoke all on function public.pl_report_save_settings(text[], boolean, boolean) from public, anon;
grant execute on function public.pl_report_save_settings(text[], boolean, boolean) to authenticated;

-- 5) The numbers for a period (Central time dates, both days included) -----------
-- One row per person with what's credited to them, every sale (a split sale
-- once for each person, with their share), and the company totals.
create or replace function public.pl_activity_report(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  tz constant text := 'America/Chicago';
  today date := (now() at time zone 'America/Chicago')::date;
  result jsonb;
begin
  -- The edge function (service role), a super admin, or the SQL Editor.
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin')
     and not exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'bad_range' using errcode = '22023';
  end if;

  with
  signups as (
    select i.upline_id as user_id
      from public.recruit_invites i
     where i.used_at is not null and i.used_by is not null
       and (i.used_at at time zone tz)::date between p_from and p_to
  ),
  -- The day an appointment was set, as Pace counts it: its week (Saturday)
  -- and the day picked when it was logged. The weekend batch goes on the
  -- day it was entered if that was the weekend, otherwise on the Sunday.
  set_days as (
    select a.user_id,
           case a.date_set_option
             when 'monday' then a.week_of + 2
             when 'tuesday' then a.week_of + 3
             when 'wednesday' then a.week_of + 4
             when 'thursday' then a.week_of + 5
             when 'friday' then a.week_of + 6
             else case when (a.created_at at time zone tz)::date in (a.week_of, a.week_of + 1)
                       then (a.created_at at time zone tz)::date else a.week_of + 1 end
           end as d
      from public.appointments a
     where not coalesce(a.is_follow_up, false)
       and a.week_of between p_from - 7 and p_to
  ),
  set_ as (select user_id from set_days where d between p_from and p_to),
  done as (
    select a.user_id
      from public.appointments a
     where a.appointment_date between p_from and p_to
       and a.follow_up_completed_at is not null
       and a.outcome in ('went_well', 'not_interested')
  ),
  sold as (
    select a.id, a.user_id, coalesce(a.target_premium, 0)::numeric as premium,
           case when a.split_user_id is not null and a.split_user_id <> a.user_id
                     and a.split_percent > 0 and a.split_percent < 100
                then a.split_percent else 0 end as pct,
           a.split_user_id
      from public.appointments a
     where coalesce(a.officially_sold, false)
       and a.appointment_date between p_from and p_to
  ),
  -- Same as the app (lib/credit.js): each person gets the sale and their share.
  credit as (
    select s.id, s.user_id, case when s.pct > 0 then round(s.premium * (100 - s.pct) / 100, 2) else s.premium end as premium from sold s
    union all
    select s.id, s.split_user_id, round(s.premium * s.pct / 100, 2) from sold s where s.pct > 0
  ),
  per as (
    select p.id, p.display_name, p.manager_id, p.role, ss.short_name as system, ss.name as system_name,
           (select count(*) from signups x where x.user_id = p.id)::int as added,
           (select count(*) from set_ x where x.user_id = p.id)::int as set_n,
           (select count(*) from done x where x.user_id = p.id)::int as completed
      from public.profiles p
      left join public.solar_systems ss on ss.id = p.solar_system_id
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'people', coalesce((select jsonb_agg(jsonb_build_object(
        'id', per.id, 'name', per.display_name, 'manager_id', per.manager_id, 'role', per.role,
        'system', per.system, 'system_name', per.system_name,
        'added', per.added, 'set', per.set_n, 'completed', per.completed) order by per.display_name, per.id) from per), '[]'::jsonb),
    'sales', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'user_id', c.user_id, 'premium', c.premium) order by c.id, c.user_id)
        from credit c where c.user_id is not null), '[]'::jsonb),
    'company', jsonb_build_object(
      'added', (select count(*) from signups),
      'set', (select count(*) from set_),
      'completed', (select count(*) from done),
      'apps', (select count(*) from sold),
      'premium', (select coalesce(sum(premium), 0) from sold),
      -- Appointments in the period with no outcome logged yet (not in Completed).
      'not_logged', (select count(*) from public.appointments a
                      where a.appointment_date between p_from and least(p_to, today - 1)
                        and a.follow_up_completed_at is null)
    )
  ) into result;
  return result;
end;
$$;
revoke all on function public.pl_activity_report(date, date) from public, anon;
grant execute on function public.pl_activity_report(date, date) to authenticated, service_role;

-- 6) Once an hour: send whatever is due ------------------------------------------
-- The function sends at 7 AM Central or later and keeps track of what it
-- sent, so an hourly call covers daylight saving time and retries on its own.
do $do$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'PaceLedger: pg_cron is not available (%). Turn on pg_cron in Database -> Extensions, then run this again.', sqlerrm;
end
$do$;
do $do$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'PaceLedger: pg_net is not available (%). Turn on pg_net in Database -> Extensions, then run this again.', sqlerrm;
end
$do$;
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'pl-activity-reports';
    perform cron.schedule('pl-activity-reports', '7 * * * *', $job$
      select net.http_post(
        url := 'https://ifiqjixvvexaiooozjaa.supabase.co/functions/v1/activity-report',
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'x-report-token', (select token from public.report_cron where id)),
        body := '{"action":"run"}'::jsonb,
        timeout_milliseconds := 60000
      );
    $job$);
    raise notice 'PaceLedger: email reports are scheduled (every hour at :07; they send at 7 AM Central).';
  end if;
end
$do$;

-- Check: is it scheduled, and yesterday's company numbers.
select case when exists (select 1 from pg_extension where extname = 'pg_cron')
                 and exists (select 1 from pg_extension where extname = 'pg_net')
            then 'Scheduled: sends at 7 AM Central'
            else 'Not scheduled yet: turn on pg_cron and pg_net in Database -> Extensions, then run this again' end as email_reports,
       public.pl_activity_report((now() at time zone 'America/Chicago')::date - 1,
                                 (now() at time zone 'America/Chicago')::date - 1) -> 'company' as yesterday;
