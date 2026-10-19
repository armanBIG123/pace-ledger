-- Team wins, high-fives and the weekly top 3 (Today).
--
-- 1) wins: posted automatically by the database when someone makes a sale
--    (or their first sale), recruits someone, joins the team, gets licensed
--    and appointed, or is promoted. Nobody types them, and taking a sale
--    or recruit back off an appointment removes its post.
-- 2) win_reactions: the high-fives (clap, fire, muscle). You can add or
--    take back your own.
-- 3) weekly_top3(): the week's top 3 for appointments set, sales and
--    recruits. It returns names and counts only, never clients or premium.
--
-- Everyone signed in can see the wins and the top 3 (the whole agency).
-- Posts show names only: no client names, no premium amounts. Super admins
-- can delete a post.
--
-- Run this in your Supabase SQL Editor (New query -> paste -> Run),
-- BEFORE merging the website change. Safe to run more than once. It also
-- posts the last 45 days of wins so the wall isn't empty on day one.

-- 1) Wins ------------------------------------------------------------------
create table if not exists public.wins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('sale', 'first_sale', 'recruit', 'joined', 'licensed', 'promotion')),
  ref text not null unique,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists wins_occurred_idx on public.wins (occurred_at desc);
create index if not exists wins_user_idx on public.wins (user_id, occurred_at desc);

alter table public.wins enable row level security;
drop policy if exists "everyone sees wins" on public.wins;
create policy "everyone sees wins" on public.wins for select to authenticated using (true);
drop policy if exists "super admins remove wins" on public.wins;
create policy "super admins remove wins" on public.wins for delete to authenticated
  using (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'));
revoke all on public.wins from anon;
revoke insert, update on public.wins from authenticated;
grant select, delete on public.wins to authenticated;

-- 2) High-fives ------------------------------------------------------------
create table if not exists public.win_reactions (
  win_id uuid not null references public.wins(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('clap', 'fire', 'muscle')),
  created_at timestamptz not null default now(),
  primary key (win_id, user_id, emoji)
);
create index if not exists win_reactions_user_idx on public.win_reactions (user_id);
create index if not exists win_reactions_created_idx on public.win_reactions (created_at desc);

alter table public.win_reactions enable row level security;
drop policy if exists "everyone sees high-fives" on public.win_reactions;
create policy "everyone sees high-fives" on public.win_reactions for select to authenticated using (true);
drop policy if exists "add your own high-five" on public.win_reactions;
create policy "add your own high-five" on public.win_reactions for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "take back your own high-five" on public.win_reactions;
create policy "take back your own high-five" on public.win_reactions for delete to authenticated using (user_id = auth.uid());
revoke all on public.win_reactions from anon;
revoke update on public.win_reactions from authenticated;
grant select, insert, delete on public.win_reactions to authenticated;

-- Posting wins automatically -------------------------------------------------
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
    insert into public.wins (user_id, kind, ref)
      values (new.user_id, case when had_sale then 'sale' else 'first_sale' end, 'sale:' || new.id)
      on conflict (ref) do nothing;
  elsif tg_op = 'UPDATE' and coalesce(old.officially_sold, false) and not coalesce(new.officially_sold, false) then
    delete from public.wins where ref = 'sale:' || new.id;
  end if;

  if coalesce(new.officially_recruited, false) and (tg_op = 'INSERT' or not coalesce(old.officially_recruited, false)) then
    insert into public.wins (user_id, kind, ref) values (new.user_id, 'recruit', 'recruit:' || new.id)
      on conflict (ref) do nothing;
  elsif tg_op = 'UPDATE' and coalesce(old.officially_recruited, false) and not coalesce(new.officially_recruited, false) then
    delete from public.wins where ref = 'recruit:' || new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists post_appointment_wins_trigger on public.appointments;
create trigger post_appointment_wins_trigger
  after insert or update of officially_sold, officially_recruited or delete on public.appointments
  for each row execute procedure public.post_appointment_wins();

create or replace function public.tier_rank(t text)
returns integer
language sql
immutable
as $$
  select coalesce(array_position(array['UA','FA','SA','AD','FD','SFD','DFD','EFD','FVC','EVC'], t), 0);
$$;

create or replace function public.post_profile_wins()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.wins (user_id, kind, ref, detail, occurred_at)
      values (new.id, 'joined', 'joined:' || new.id, jsonb_build_object('upline_id', new.manager_id), coalesce(new.created_at, now()))
      on conflict (ref) do nothing;
    return new;
  end if;
  if new.licensed_at is not null and old.licensed_at is null then
    insert into public.wins (user_id, kind, ref) values (new.id, 'licensed', 'licensed:' || new.id)
      on conflict (ref) do nothing;
  end if;
  if new.hierarchy_tier is distinct from old.hierarchy_tier and public.tier_rank(new.hierarchy_tier) > public.tier_rank(old.hierarchy_tier) and new.hierarchy_tier <> 'UA' then
    insert into public.wins (user_id, kind, ref, detail)
      values (new.id, 'promotion', 'promotion:' || new.id || ':' || new.hierarchy_tier, jsonb_build_object('tier', new.hierarchy_tier))
      on conflict (ref) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists post_profile_wins_trigger on public.profiles;
create trigger post_profile_wins_trigger
  after insert or update of licensed_at, hierarchy_tier on public.profiles
  for each row execute procedure public.post_profile_wins();

-- The last 45 days, so the wall isn't empty on day one ----------------------
insert into public.wins (user_id, kind, ref, occurred_at)
select s.user_id, case when s.rn = 1 then 'first_sale' else 'sale' end, 'sale:' || s.id,
       (s.appointment_date + time '12:00') at time zone 'America/Chicago'
from (
  select id, user_id, appointment_date, row_number() over (partition by user_id order by appointment_date, created_at) as rn
  from public.appointments where officially_sold and appointment_date is not null
) s
where s.appointment_date >= current_date - 45
on conflict (ref) do nothing;

insert into public.wins (user_id, kind, ref, occurred_at)
select a.user_id, 'recruit', 'recruit:' || a.id, (a.appointment_date + time '12:00') at time zone 'America/Chicago'
from public.appointments a
where a.officially_recruited and a.appointment_date >= current_date - 45
on conflict (ref) do nothing;

insert into public.wins (user_id, kind, ref, detail, occurred_at)
select p.id, 'joined', 'joined:' || p.id, jsonb_build_object('upline_id', p.manager_id), p.created_at
from public.profiles p where p.created_at >= now() - interval '45 days'
on conflict (ref) do nothing;

insert into public.wins (user_id, kind, ref, occurred_at)
select p.id, 'licensed', 'licensed:' || p.id, p.licensed_at
from public.profiles p where p.licensed_at >= now() - interval '45 days'
on conflict (ref) do nothing;

insert into public.wins (user_id, kind, ref, detail, occurred_at)
select p.id, 'promotion', 'promotion:' || p.id || ':' || p.hierarchy_tier, jsonb_build_object('tier', p.hierarchy_tier), p.hierarchy_tier_changed_at
from public.profiles p
where p.hierarchy_tier is not null and p.hierarchy_tier <> 'UA'
  and p.hierarchy_tier_changed_at >= now() - interval '45 days'
  and p.hierarchy_tier_changed_at > p.created_at + interval '1 hour'
on conflict (ref) do nothing;

-- 3) This week's top 3 -------------------------------------------------------
-- p_week_start: the Saturday the PaceLedger week starts on.
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
    select 'recruits', a.user_id, count(*)::int
      from public.appointments a
     where a.officially_recruited and a.appointment_date between p_week_start and p_week_start + 6
     group by a.user_id
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
