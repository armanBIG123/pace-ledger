-- Recruits count from sign-ups.
--
-- Until now a recruit counted only when someone answered "Officially
-- recruited? Yes" on a follow-up. Now a recruit counts on its own the moment
-- someone signs up through a recruit link:
--   * credited to the person they join under (the link's upline),
--   * in the week (Saturday to Friday, Central time) they signed up,
--   * in Track Production, Pipeline's Won count and this week's top 3,
--   * with one team win post: "Tasha recruited Marcus Reed".
-- The prospect the recruit came from (if the link was sent from their
-- appointment) moves to Recruited.
--
-- Weeks before the switch keep their numbers: appointments marked
-- "Officially recruited" before the day this runs still count, and a
-- sign-up whose appointment was already counted that way isn't counted
-- twice.
--
-- Run this in the Supabase SQL Editor (New query -> paste -> Run) BEFORE
-- merging the website change. Safe to run more than once: the switch time
-- is set the first time and never moves.

-- 1) When the switch happened ------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'recruits_from_signups_since'
  ) then
    execute format(
      'create function public.recruits_from_signups_since() returns timestamptz language sql immutable as %L',
      format('select %L::timestamptz', now())
    );
  end if;
end $$;
revoke all on function public.recruits_from_signups_since() from public, anon;
grant execute on function public.recruits_from_signups_since() to authenticated;

-- The day of the switch (Central time): appointment counts stop here.
create or replace function public.recruits_switch_date()
returns date
language sql
stable
as $$
  select (public.recruits_from_signups_since() at time zone 'America/Chicago')::date;
$$;
revoke all on function public.recruits_switch_date() from public, anon;
grant execute on function public.recruits_switch_date() to authenticated;

-- A sign-up that already counted the old way (its appointment was marked
-- "Officially recruited" before the switch).
create or replace function public.signup_already_counted(p_appointment uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select p_appointment is not null and exists (
    select 1 from public.appointments a
    where a.id = p_appointment and coalesce(a.officially_recruited, false)
      and a.appointment_date < public.recruits_switch_date()
  );
$$;
revoke all on function public.signup_already_counted(uuid) from public, anon;
grant execute on function public.signup_already_counted(uuid) to authenticated;

-- 2) Sign-ups between two dates ----------------------------------------------
-- Who sees one: the person the recruit joined under, whoever made the link,
-- anyone above the person they joined under, and super admins.
create or replace function public.recruit_signups(p_start date, p_end date)
returns table (
  invite_id uuid, upline_id uuid, created_by uuid, recruit_id uuid,
  recruit_name text, signed_up_at timestamptz, appointment_id uuid
)
language sql
stable
security definer set search_path = public
as $$
  select i.id, i.upline_id, i.created_by, i.used_by, p.display_name, i.used_at, i.appointment_id
  from public.recruit_invites i
  left join public.profiles p on p.id = i.used_by
  where auth.uid() is not null
    and i.used_at is not null and i.used_by is not null
    and i.used_at >= public.recruits_from_signups_since()
    and (i.used_at at time zone 'America/Chicago')::date between p_start and p_end
    and not public.signup_already_counted(i.appointment_id)
    and (
      i.upline_id = auth.uid()
      or i.created_by = auth.uid()
      or i.upline_id in (select public.my_downline_ids())
      or exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin')
    )
  order by i.used_at;
$$;
revoke all on function public.recruit_signups(date, date) from public, anon;
grant execute on function public.recruit_signups(date, date) to authenticated;

-- 3) This week's top 3: recruits from sign-ups ------------------------------
create or replace function public.weekly_top3(p_week_start date)
returns table (category text, user_id uuid, display_name text, n integer)
language sql
stable
security definer set search_path = public
as $$
  with counts as (
    select 'pace'::text as category, a.user_id, count(*)::int as n
      from public.appointments a
     where a.week_of = p_week_start and not coalesce(a.is_follow_up, false)
     group by a.user_id
    union all
    select 'sales', a.user_id, count(*)::int
      from public.appointments a
     where a.officially_sold and a.appointment_date between p_week_start and p_week_start + 6
     group by a.user_id
    union all
    select 'recruits', r.user_id, count(*)::int
      from (
        -- before the switch: "Officially recruited" on the appointment
        select a.user_id
          from public.appointments a
         where a.officially_recruited
           and a.appointment_date between p_week_start and p_week_start + 6
           and a.appointment_date < public.recruits_switch_date()
        union all
        -- from the switch on: people who signed up through a recruit link
        select i.upline_id
          from public.recruit_invites i
         where i.used_at is not null and i.used_by is not null
           and i.used_at >= public.recruits_from_signups_since()
           and (i.used_at at time zone 'America/Chicago')::date between p_week_start and p_week_start + 6
           and not public.signup_already_counted(i.appointment_id)
      ) r
     group by r.user_id
  ),
  ranked as (
    select c.category, c.user_id, p.display_name, c.n,
           row_number() over (partition by c.category order by c.n desc, p.display_name) as r
      from counts c join public.profiles p on p.id = c.user_id
     where auth.uid() is not null and c.n > 0
  )
  select category, user_id, display_name, n from ranked where r <= 3 order by category, r;
$$;
revoke all on function public.weekly_top3(date) from public, anon;
grant execute on function public.weekly_top3(date) to authenticated;

-- 4) The win post, and the prospect moving to Recruited ----------------------
-- One post per sign-up, credited to the recruiter ("Tasha recruited Marcus
-- Reed"); it takes the place of the plain "Welcome Marcus" post.
create or replace function public.post_signup_recruit_win()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.used_at is not null and old.used_at is null and new.used_by is not null
     and new.used_at >= public.recruits_from_signups_since()
     and not public.signup_already_counted(new.appointment_id) then
    delete from public.wins where ref = 'joined:' || new.used_by;
    insert into public.wins (user_id, kind, ref, detail, occurred_at)
      values (new.upline_id, 'recruit', 'signup:' || new.used_by, jsonb_build_object('recruit_id', new.used_by), new.used_at)
      on conflict (ref) do nothing;
    if new.appointment_id is not null then
      update public.prospects pr set marked_recruited = true
        from public.appointments a
       where a.id = new.appointment_id and pr.id = a.prospect_id
         and not coalesce(pr.marked_recruited, false);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists post_signup_recruit_win_trigger on public.recruit_invites;
create trigger post_signup_recruit_win_trigger
  after update of used_at on public.recruit_invites
  for each row execute procedure public.post_signup_recruit_win();

notify pgrst, 'reload schema';
