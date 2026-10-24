-- Team wins, round two.
--
--   * Six reactions instead of three: 👏 🔥 💪 plus 🎉 🙌 💯.
--   * New wins that post on their own, from what PaceLedger already records:
--       - "Brianna hit 33 appointments this week" (her own plus ones she
--         presented, the same count as the week tracker, follow-ups not
--         counted), the moment the 33rd is booked.
--       - "Tasha got a policy issued": a sale with its requirements complete
--         and its effective date arrived.
--       - "Priya passed the Texas licensing exam", when the pass date is
--         saved.
--       - "Last week's winners": #1 for appointments set, sales and
--         recruits, posted for the week that just ended (Saturday to Friday).
--   * Live: new wins and high-fives show up without refreshing.
--
-- Nothing here needs a schedule: a policy whose effective date arrives, and
-- last week's winners, are posted the first time anyone opens Team wins
-- after that (dated when they happened, so they sit in the right place).
--
-- Run this in the Supabase SQL Editor (New query -> paste -> Run) BEFORE
-- merging the website change. Safe to run more than once.

-- 1) Six reactions -----------------------------------------------------------
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.win_reactions'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%emoji%'
  loop
    execute format('alter table public.win_reactions drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.win_reactions add constraint win_reactions_emoji_check
  check (emoji in ('clap', 'fire', 'muscle', 'party', 'raise', 'hundred'));

-- 2) The new kinds of win ----------------------------------------------------
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.wins'::regclass and contype = 'c' and conname <> 'wins_user_needed'
              and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.wins drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.wins add constraint wins_kind_check
  check (kind in ('sale', 'first_sale', 'recruit', 'joined', 'licensed', 'promotion', 'pace', 'issued', 'exam', 'winners'));
-- "Last week's winners" is the whole agency's, not one person's.
alter table public.wins alter column user_id drop not null;
alter table public.wins drop constraint if exists wins_user_needed;
alter table public.wins add constraint wins_user_needed check (user_id is not null or kind = 'winners');

-- Today and this week (Saturday to Friday), Central time, like the app.
create or replace function public.pl_today()
returns date language sql stable as $$
  select (now() at time zone 'America/Chicago')::date;
$$;
create or replace function public.pl_week_start(d date)
returns date language sql immutable as $$
  select d - ((extract(dow from d)::int + 1) % 7);
$$;

-- 3) Hit 33 this week, and policy issued (from appointments) ----------------
create or replace function public.post_more_appointment_wins()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  today date := public.pl_today();
  person uuid;
  n integer;
begin
  if tg_op = 'DELETE' then
    delete from public.wins where ref = 'issued:' || old.id;
    return old;
  end if;

  -- Never get in the way of saving the appointment.
  begin
    -- Policy issued: a sale, requirements complete, effective date arrived.
    if coalesce(new.officially_sold, false) and coalesce(new.requirements_completed, false)
       and new.effective_date is not null and new.effective_date <= today then
      if new.effective_date >= today - 30 then
        insert into public.wins (user_id, kind, ref, detail)
          values (new.user_id, 'issued', 'issued:' || new.id, jsonb_build_object('appointment_id', new.id))
          on conflict (ref) do nothing;
      end if;
    elsif tg_op = 'UPDATE' then
      delete from public.wins where ref = 'issued:' || new.id;
    end if;

    -- 33 this week, for whoever set it and whoever presents it.
    if not coalesce(new.is_follow_up, false) and new.week_of is not null
       and new.week_of >= public.pl_week_start(today) - 7 then
      foreach person in array array_remove(array[new.user_id, nullif(new.presenter_id, new.user_id)], null) loop
        select count(*) into n from public.appointments a
         where a.week_of = new.week_of and not coalesce(a.is_follow_up, false)
           and (a.user_id = person or (a.presenter_id = person and a.user_id <> person));
        if n >= 33 and exists (select 1 from public.profiles p where p.id = person) then
          insert into public.wins (user_id, kind, ref, detail)
            values (person, 'pace', 'pace:' || person || ':' || new.week_of, jsonb_build_object('week_of', new.week_of, 'n', 33))
            on conflict (ref) do nothing;
        end if;
      end loop;
    end if;
  exception when others then
    raise warning 'post_more_appointment_wins: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists post_more_appointment_wins_trigger on public.appointments;
create trigger post_more_appointment_wins_trigger
  after insert or delete or update of officially_sold, requirements_completed, effective_date, week_of, presenter_id, is_follow_up, user_id
  on public.appointments
  for each row execute procedure public.post_more_appointment_wins();

-- 4) Passed the licensing exam ------------------------------------------------
create or replace function public.post_exam_win()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  begin
    if new.exam_passed_on is not null and (tg_op = 'INSERT' or old.exam_passed_on is null)
       and new.exam_passed_on >= public.pl_today() - 14 then
      insert into public.wins (user_id, kind, ref, detail)
        values (new.user_id, 'exam', 'exam:' || new.user_id, jsonb_build_object('state', new.resident_state))
        on conflict (ref) do nothing;
    elsif tg_op = 'UPDATE' and old.exam_passed_on is not null and new.exam_passed_on is null then
      delete from public.wins where ref = 'exam:' || new.user_id;
    end if;
  exception when others then
    raise warning 'post_exam_win: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists post_exam_win_trigger on public.licensing_progress;
create trigger post_exam_win_trigger
  after insert or update of exam_passed_on on public.licensing_progress
  for each row execute procedure public.post_exam_win();

-- 5) Posted when Team wins opens: policies whose effective date has arrived,
--    and last week's winners. Returns how many were posted.
create or replace function public.post_due_wins()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  today date := public.pl_today();
  this_week date := public.pl_week_start(today);
  last_week date := public.pl_week_start(today) - 7;
  posted integer := 0;
  k integer;
  d jsonb;
begin
  if auth.uid() is null then return 0; end if;

  insert into public.wins (user_id, kind, ref, detail, occurred_at)
  select a.user_id, 'issued', 'issued:' || a.id, jsonb_build_object('appointment_id', a.id),
         least(now(), (a.effective_date::timestamp + interval '8 hours') at time zone 'America/Chicago')
    from public.appointments a
   where coalesce(a.officially_sold, false) and coalesce(a.requirements_completed, false)
     and a.effective_date between today - 7 and today
     and exists (select 1 from public.profiles p where p.id = a.user_id)
  on conflict (ref) do nothing;
  get diagnostics k = row_count;
  posted := posted + k;

  if not exists (select 1 from public.wins where ref = 'winners:' || last_week) then
    with t as (select * from public.weekly_top3(last_week)),
         m as (select category, max(n) as mx from t group by category),
         firsts as (select t.* from t join m on m.category = t.category and t.n = m.mx)
    select jsonb_build_object(
             'week_start', last_week, 'week_end', last_week + 6,
             'pace', coalesce((select jsonb_agg(jsonb_build_object('user_id', f.user_id, 'name', f.display_name, 'n', f.n) order by f.display_name) from firsts f where f.category = 'pace'), '[]'::jsonb),
             'sales', coalesce((select jsonb_agg(jsonb_build_object('user_id', f.user_id, 'name', f.display_name, 'n', f.n) order by f.display_name) from firsts f where f.category = 'sales'), '[]'::jsonb),
             'recruits', coalesce((select jsonb_agg(jsonb_build_object('user_id', f.user_id, 'name', f.display_name, 'n', f.n) order by f.display_name) from firsts f where f.category = 'recruits'), '[]'::jsonb))
      into d;
    if jsonb_array_length(d->'pace') + jsonb_array_length(d->'sales') + jsonb_array_length(d->'recruits') > 0 then
      insert into public.wins (user_id, kind, ref, detail, occurred_at)
        values (null, 'winners', 'winners:' || last_week, d, this_week::timestamp at time zone 'America/Chicago')
        on conflict (ref) do nothing;
      get diagnostics k = row_count;
      posted := posted + k;
    end if;
  end if;
  return posted;
end;
$$;
revoke all on function public.post_due_wins() from public, anon;
grant execute on function public.post_due_wins() to authenticated;

-- 6) Live: new wins and high-fives show up without refreshing -----------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wins') then
      alter publication supabase_realtime add table public.wins;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'win_reactions') then
      alter publication supabase_realtime add table public.win_reactions;
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';
