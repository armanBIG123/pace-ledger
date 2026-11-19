-- Challenges: a banner on Today for pushes like the BIG Bird Blitz, with the
-- live top 3 in each category and the winners once it ends.
-- Safe to run again.

-- 1. When an appointment was set. Pace counts an appointment in the week it
--    was set (week_of), and a reschedule counts again in the week it's
--    rebooked; a challenge needs the moment. Set by the database: now()
--    when it's booked, and again when a reschedule moves it to a new week.
--    Older rows stay empty and count from when they were created.
alter table public.appointments add column if not exists set_at timestamptz;

create or replace function public.appointments_set_at() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.set_at := now();
  elsif new.week_of is distinct from old.week_of then
    new.set_at := now();
  else
    new.set_at := old.set_at;   -- nobody sets it by hand
  end if;
  return new;
end;
$$;
drop trigger if exists appointments_set_at on public.appointments;
create trigger appointments_set_at before insert or update on public.appointments
  for each row execute function public.appointments_set_at();
create index if not exists appointments_set_moment_idx on public.appointments ((coalesce(set_at, created_at)));

-- 2. The challenges. Super admins start, change and remove them; everyone in
--    the solar system sees them.
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  tagline text,
  metrics text[] not null default array['appointments', 'recruits'],
  theme text not null default 'classic',
  starts_at timestamptz not null,
  ends_at timestamptz not null,          -- winners show from here
  show_until timestamptz not null,       -- the banner comes down
  solar_system_id uuid references public.solar_systems(id) on delete cascade,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint challenges_title check (char_length(btrim(title)) between 1 and 40),
  constraint challenges_tagline check (tagline is null or char_length(btrim(tagline)) <= 100),
  constraint challenges_metrics check (cardinality(metrics) between 1 and 2 and metrics <@ array['appointments', 'recruits']),
  constraint challenges_theme check (theme in ('thanksgiving', 'classic')),
  constraint challenges_dates check (ends_at > starts_at and show_until > ends_at)
);
create index if not exists challenges_system_idx on public.challenges (solar_system_id, show_until);

create or replace function public.challenges_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_by_name := (select display_name from public.profiles where id = auth.uid());
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists challenges_stamp on public.challenges;
create trigger challenges_stamp before insert or update on public.challenges
  for each row execute function public.challenges_stamp();
-- The solar system: the poster's (a super admin's: the one they're viewing).
drop trigger if exists stamp_solar_system_trigger on public.challenges;
create trigger stamp_solar_system_trigger before insert or update on public.challenges
  for each row execute function public.stamp_solar_system();

alter table public.challenges enable row level security;
drop policy if exists "challenges: read" on public.challenges;
create policy "challenges: read" on public.challenges for select to authenticated using (true);
drop policy if exists "challenges: super admins post" on public.challenges;
create policy "challenges: super admins post" on public.challenges for insert to authenticated
  with check (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'));
drop policy if exists "challenges: super admins edit" on public.challenges;
create policy "challenges: super admins edit" on public.challenges for update to authenticated
  using (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'))
  with check (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'));
drop policy if exists "challenges: super admins delete" on public.challenges;
create policy "challenges: super admins delete" on public.challenges for delete to authenticated
  using (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'));
drop policy if exists "solar system wall" on public.challenges;
create policy "solar system wall" on public.challenges as restrictive
  using (public.pl_sees_system(solar_system_id)) with check (public.pl_sees_system(solar_system_id));
grant select, insert, update, delete on public.challenges to authenticated;

-- 3. The board: the top 3 in each category, plus your own row wherever you
--    are. Appointments set: new appointments (not follow-ups) by when they
--    were set. Recruits: people who signed up with their invite link, the
--    same as the weekly top 3. Only people in the challenge's solar system.
--    A tie goes to whoever got there first.
create or replace function public.challenge_board(p_challenge uuid)
returns table (metric text, place int, user_id uuid, display_name text, n int, people int)
language sql stable security definer set search_path = public as $$
  with c as (
    select ch.* from public.challenges ch
     where ch.id = p_challenge and auth.uid() is not null
       and public.pl_sees_system(ch.solar_system_id) and ch.starts_at <= now()
  ),
  ev as (
    select 'appointments'::text as metric, a.user_id, coalesce(a.set_at, a.created_at) as at
      from public.appointments a, c
     where 'appointments' = any (c.metrics) and not coalesce(a.is_follow_up, false)
       and coalesce(a.set_at, a.created_at) >= c.starts_at and coalesce(a.set_at, a.created_at) < c.ends_at
    union all
    select 'recruits', i.upline_id, i.used_at
      from public.recruit_invites i, c
     where 'recruits' = any (c.metrics) and i.used_at is not null and i.used_by is not null and i.solar_system_id is null
       and i.used_at >= c.starts_at and i.used_at < c.ends_at
       and not public.signup_already_counted(i.appointment_id)
  ),
  tally as (
    select e.metric, e.user_id, count(*)::int as n, max(e.at) as reached
      from ev e join public.profiles p on p.id = e.user_id, c
     where coalesce(p.solar_system_id, public.pl_big_system()) = coalesce(c.solar_system_id, public.pl_big_system())
     group by e.metric, e.user_id
  ),
  ranked as (
    select t.metric, t.user_id, t.n,
           row_number() over (partition by t.metric order by t.n desc, t.reached, t.user_id)::int as place,
           count(*) over (partition by t.metric)::int as people
      from tally t
  )
  select r.metric, r.place, r.user_id, p.display_name, r.n, r.people
    from ranked r join public.profiles p on p.id = r.user_id
   where r.place <= 3 or r.user_id = auth.uid()
   order by r.metric, r.place;
$$;
revoke all on function public.challenge_board(uuid) from public, anon;
grant execute on function public.challenge_board(uuid) to authenticated;

-- 4. The BIG Bird Blitz: Thursday, Nov 19 through Monday, Nov 30 (Central),
--    winners on Today from Tuesday, Dec 1 for a week. Big Insurance Network.
insert into public.challenges (title, tagline, metrics, theme, starts_at, ends_at, show_until, solar_system_id)
select 'BIG Bird Blitz', 'Close out November strong. Most appointments set and most new recruits win.',
       array['appointments', 'recruits'], 'thanksgiving',
       '2026-11-19 00:00 America/Chicago', '2026-12-01 00:00 America/Chicago', '2026-12-08 00:00 America/Chicago',
       public.pl_big_system()
 where public.pl_big_system() is not null
   and not exists (select 1 from public.challenges where title = 'BIG Bird Blitz');
