-- Solar systems: one PaceLedger, walled off by partner group.
--
--   Galaxy        = all of PaceLedger.
--   Solar system  = one partner group: Big Insurance Network (BIG, everyone
--                   today) and Big Huge Business (BHB).
--
-- Everyone belongs to one solar system, set by their invite link (whoever
-- joins through a BHB person's link is in BHB). They only ever see people,
-- appointments, pace, Chat, Team wins, MegaPhone, Resources and calendars
-- from their own solar system.
--
-- Roles:
--   super_admin    You, Dynamite, Pam: the whole Galaxy. A switch in the
--                  header picks which solar system you're looking at (or
--                  all of them). Your own appointments always show.
--   super_manager  New. A super admin inside their own solar system only:
--                  approve promotions, fix licensing, levels and who reports
--                  to whom, post Resources, MegaPhone and trainings, remove
--                  advisors and managers. They can't make anyone a Super
--                  Manager or super admin, can't change their own role, and
--                  can't see the Profiles tab.
--   manager, advisor  As today, inside their own solar system.
--
-- BHB starts with a copy of BIG's Resources (documents, links, upcoming
-- trainings). From then on each solar system's are its own.
--
-- How it works: every table gets one extra "solar system wall" rule that
-- every other rule must also pass, so nothing that works today changes
-- inside a solar system, and nothing crosses between them.
--
-- Run this in the Supabase SQL Editor (New query -> paste -> Run) BEFORE
-- merging the website change. Safe to run more than once. It runs as one
-- piece: if anything stops it, nothing is changed.

begin;

-- 0) A helper for this file: change one exact piece of an existing
--    function, and stop if the function isn't what this file expects.
create or replace function public.pl_patch_function(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $$
declare
  def text := pg_get_functiondef(p_fn);
begin
  if position(p_old in def) = 0 then
    if position(p_new in def) > 0 then return; end if; -- already done
    raise exception 'PaceLedger: % is different from what this update expects. Nothing was changed. Send this message to Claude. (Looking for: %)', p_fn, left(p_old, 160);
  end if;
  execute replace(def, p_old, p_new);
end;
$$;

-- 1) Solar systems -------------------------------------------------------------
create table if not exists public.solar_systems (
  id uuid primary key default gen_random_uuid(),
  short_name text not null unique check (short_name ~ '^[A-Z0-9]{2,8}$'),
  name text not null,
  email_name text not null,   -- the name on emails to clients and recruits
  notify_email text,          -- where promotion submissions go (null: its Super Managers)
  created_at timestamptz not null default now()
);
insert into public.solar_systems (short_name, name, email_name, notify_email) values
  ('BIG', 'Big Insurance Network', 'Big Insurance Network', 'agency@biginsurancenetwork.com'),
  ('BHB', 'Big Huge Business', 'Big Huge Business', null)
on conflict (short_name) do nothing;

alter table public.profiles add column if not exists solar_system_id uuid references public.solar_systems(id);
alter table public.profiles add column if not exists viewing_system_id uuid references public.solar_systems(id) on delete set null;
update public.profiles set solar_system_id = (select id from public.solar_systems where short_name = 'BIG') where solar_system_id is null;
alter table public.profiles alter column solar_system_id set not null;
create index if not exists profiles_solar_system_idx on public.profiles (solar_system_id);

-- The Super Manager role.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.profiles'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.profiles add constraint profiles_role_check
  check (role in ('advisor', 'manager', 'super_manager', 'super_admin'));

-- 2) Who's looking -------------------------------------------------------------
create or replace function public.pl_big_system() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.solar_systems where short_name = 'BIG';
$$;
create or replace function public.pl_system_of(p uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select solar_system_id from public.profiles where id = p;
$$;
create or replace function public.pl_is_galaxy_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'super_admin' from public.profiles where id = auth.uid()), false);
$$;
create or replace function public.pl_is_super_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'super_manager' from public.profiles where id = auth.uid()), false);
$$;
create or replace function public.pl_is_system_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('super_admin', 'super_manager') from public.profiles where id = auth.uid()), false);
$$;
create or replace function public.pl_home_system() returns uuid
language sql stable security definer set search_path = public as $$
  select solar_system_id from public.profiles where id = auth.uid();
$$;
-- Where new posts go (Chat, MegaPhone, Resources, trainings): your own
-- solar system; for a super admin, the one picked in the header.
create or replace function public.pl_writer_system() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select coalesce(case when role = 'super_admin' then viewing_system_id end, solar_system_id) from public.profiles where id = auth.uid()),
    public.pl_big_system());
$$;
-- Can the signed-in person see things from solar system s? Their own; a
-- super admin: the one picked in the header, or all of them.
create or replace function public.pl_sees_system(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when me.role = 'super_admin'
                then me.viewing_system_id is null or coalesce(s, public.pl_big_system()) = me.viewing_system_id
                else coalesce(s, public.pl_big_system()) = me.solar_system_id end
      from public.profiles me where me.id = auth.uid()), false);
$$;
create or replace function public.pl_sees_person(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p is not null and (p = auth.uid() or public.pl_sees_system(public.pl_system_of(p)));
$$;
-- Super-admin powers over this person: a super admin, or a Super Manager
-- in the same solar system.
create or replace function public.pl_admin_of(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select me.role = 'super_admin' or (me.role = 'super_manager' and me.solar_system_id = public.pl_system_of(p))
      from public.profiles me where me.id = auth.uid()), false);
$$;
do $$
declare f text;
begin
  foreach f in array array['pl_big_system()', 'pl_system_of(uuid)', 'pl_is_galaxy_admin()', 'pl_is_super_manager()', 'pl_is_system_admin()',
                           'pl_home_system()', 'pl_writer_system()', 'pl_sees_system(uuid)', 'pl_sees_person(uuid)', 'pl_admin_of(uuid)'] loop
    -- The rules below call these for every request, signed in or not
    -- (signed out, they're always false).
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

alter table public.solar_systems enable row level security;
drop policy if exists "solar systems: your own, or all for super admins" on public.solar_systems;
create policy "solar systems: your own, or all for super admins" on public.solar_systems for select to authenticated
  using (public.pl_is_galaxy_admin() or id = public.pl_home_system());
drop policy if exists "solar systems: super admins edit" on public.solar_systems;
create policy "solar systems: super admins edit" on public.solar_systems for all to authenticated
  using (public.pl_is_galaxy_admin()) with check (public.pl_is_galaxy_admin());
grant select, insert, update on public.solar_systems to authenticated;

-- Super admins: which solar system to look at (null = the whole Galaxy).
create or replace function public.set_viewing_system(p_system uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.pl_is_galaxy_admin() then raise exception 'not_allowed'; end if;
  perform set_config('pl.trusted_profile_edit', 'on', true);
  update public.profiles set viewing_system_id = p_system where id = auth.uid();
end;
$$;
revoke all on function public.set_viewing_system(uuid) from public, anon;
grant execute on function public.set_viewing_system(uuid) to authenticated;

-- 3) People: which solar system they're in, and who can change what --------
-- A new person is in their upline's solar system.
create or replace function public.assign_solar_system()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.solar_system_id is null then
    new.solar_system_id := coalesce(public.pl_system_of(new.manager_id), public.pl_big_system());
  end if;
  return new;
end;
$$;
drop trigger if exists assign_solar_system_trigger on public.profiles;
create trigger assign_solar_system_trigger before insert on public.profiles
  for each row execute procedure public.assign_solar_system();

-- Someone reports to someone in their own solar system (or no one).
create or replace function public.keep_reporting_in_system()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(current_setting('pl.moving_tree', true), '') = 'on' then return new; end if;
  if new.manager_id is not null and public.pl_system_of(new.manager_id) is distinct from new.solar_system_id then
    raise exception 'They can only report to someone in their own solar system.';
  end if;
  return new;
end;
$$;
drop trigger if exists keep_reporting_in_system_trigger on public.profiles;
create trigger keep_reporting_in_system_trigger before insert or update of manager_id, solar_system_id on public.profiles
  for each row execute procedure public.keep_reporting_in_system();

-- Moving someone to another solar system moves their whole team with them.
create or replace function public.move_team_with_leader()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.solar_system_id is distinct from old.solar_system_id then
    perform set_config('pl.moving_tree', 'on', true);
    perform set_config('pl.trusted_profile_edit', 'on', true);
    with recursive below(id, depth) as (
      select p.id, 1 from public.profiles p where p.manager_id = new.id
      union all
      select p.id, b.depth + 1 from public.profiles p join below b on p.manager_id = b.id where b.depth < 60
    )
    update public.profiles set solar_system_id = new.solar_system_id
     where id in (select id from below) and solar_system_id is distinct from new.solar_system_id;
    perform set_config('pl.moving_tree', 'off', true);
    perform set_config('pl.trusted_profile_edit', 'off', true);
  end if;
  return new;
end;
$$;
drop trigger if exists move_team_with_leader_trigger on public.profiles;
create trigger move_team_with_leader_trigger after update of solar_system_id on public.profiles
  for each row execute procedure public.move_team_with_leader();

-- Who can change a person's role, upline, name, level and solar system.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  acting public.profiles%rowtype;
begin
  -- Server-side work (sign-up, account deletion, service role), and the
  -- app's own trusted functions (your name, the header switch).
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;
  if coalesce(current_setting('pl.trusted_profile_edit', true), '') = 'on' then
    return new;
  end if;
  select * into acting from public.profiles where id = auth.uid();

  if acting.role = 'super_admin' then
    return new;
  end if;

  if acting.role = 'super_manager' and old.id <> acting.id then
    if new.solar_system_id is distinct from old.solar_system_id
       or new.viewing_system_id is distinct from old.viewing_system_id then
      raise exception 'Only super admins can move people between solar systems.';
    end if;
    if new.role is distinct from old.role
       and not (old.role in ('advisor', 'manager') and new.role in ('advisor', 'manager')) then
      raise exception 'Only super admins can make someone a Super Manager or super admin.';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role
     or new.manager_id is distinct from old.manager_id
     or new.display_name is distinct from old.display_name
     or new.email is distinct from old.email
     or new.hierarchy_tier is distinct from old.hierarchy_tier
     or new.solar_system_id is distinct from old.solar_system_id
     or new.viewing_system_id is distinct from old.viewing_system_id then
    raise exception 'Not authorized to change this field';
  end if;
  return new;
end;
$$;

-- Your own name (Your account): trusted, so the guard above lets it through.
select public.pl_patch_function('public.update_my_profile(text,text,text)'::regprocedure,
$x$  update public.profiles
     set display_name = new_name$x$,
$x$  perform set_config('pl.trusted_profile_edit', 'on', true);
  update public.profiles
     set display_name = new_name$x$);

-- 4) Sign-up links -------------------------------------------------------------
-- A super admin can make a link for someone to lead a solar system: they
-- join that solar system as its Super Manager, reporting to no one.
alter table public.recruit_invites add column if not exists solar_system_id uuid references public.solar_systems(id);
alter table public.recruit_invites add column if not exists invite_role text check (invite_role in ('advisor', 'super_manager'));
drop policy if exists "only super admins make leader links" on public.recruit_invites;
create policy "only super admins make leader links" on public.recruit_invites as restrictive for insert
  with check ((solar_system_id is null and invite_role is null) or public.pl_is_galaxy_admin());

select public.pl_patch_function('public.handle_new_user()'::regprocedure,
$x$  insert into public.profiles (id, display_name, email, role, manager_id, hierarchy_tier)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), inv.invitee_name, split_part(new.email, '@', 1)),
    new.email,
    'advisor',
    inv.upline_id,
    'UA'
  );$x$,
$x$  insert into public.profiles (id, display_name, email, role, manager_id, hierarchy_tier, solar_system_id)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), inv.invitee_name, split_part(new.email, '@', 1)),
    new.email,
    case when inv.solar_system_id is not null then coalesce(inv.invite_role, 'advisor') else 'advisor' end,
    case when inv.solar_system_id is not null then null else inv.upline_id end,
    'UA',
    coalesce(inv.solar_system_id, public.pl_system_of(inv.upline_id))
  );$x$);

select public.pl_patch_function('public.get_signup_invite(text)'::regprocedure,
$x$    'valid', true,$x$,
$x$    'valid', true,
    'systemName', (select s.name from public.solar_systems s where s.id = coalesce(inv.solar_system_id, public.pl_system_of(inv.upline_id))),
    'leadsSystem', inv.solar_system_id is not null and inv.invite_role = 'super_manager',$x$);

-- A leader link isn't a recruit for the person who made it.
select public.pl_patch_function('public.post_signup_recruit_win()'::regprocedure,
$x$  if new.used_at is not null and old.used_at is null and new.used_by is not null$x$,
$x$  if new.solar_system_id is null and new.used_at is not null and old.used_at is null and new.used_by is not null$x$);
select public.pl_patch_function('public.recruit_signups(date,date)'::regprocedure,
$x$      or exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin')
    )$x$,
$x$      or (public.pl_admin_of(i.upline_id) and public.pl_sees_person(i.upline_id))
    )
    and i.solar_system_id is null$x$);
select public.pl_patch_function('public.team_open_invites()'::regprocedure,
$x$      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')$x$,
$x$      or (public.pl_admin_of(i.upline_id) and public.pl_sees_person(i.upline_id))$x$);

-- 5) Super-admin powers for Super Managers, inside their solar system ----------
select public.pl_patch_function('public.admin_update_licensing(uuid,jsonb)'::regprocedure,
$x$  if not exists (select 1 from public.profiles where id = me and role = 'super_admin') then$x$,
$x$  if not public.pl_admin_of(p_user) then$x$);
select public.pl_patch_function('public.mark_contracting_step(uuid,text)'::regprocedure,
$x$    or exists (select 1 from public.profiles p where p.id = me and p.role = 'super_admin')$x$,
$x$    or public.pl_admin_of(p_user)$x$);
select public.pl_patch_function('public.set_appointment_trainee(uuid,uuid)'::regprocedure,
$x$    or exists (select 1 from public.profiles p where p.id = me and p.role = 'super_admin')$x$,
$x$    or public.pl_admin_of(a.user_id)$x$);
select public.pl_patch_function('public.leader_update_appointment(uuid,jsonb,boolean)'::regprocedure,
$x$    or exists (select 1 from public.profiles s where s.id = me and s.role = 'super_admin')$x$,
$x$    or public.pl_admin_of(a.user_id)$x$);
select public.pl_patch_function('public.check_appointment_conflict(uuid,date,time without time zone,text,uuid,integer)'::regprocedure,
$x$  v_admin boolean := exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin');$x$,
$x$  v_admin boolean := public.pl_admin_of(p_presenter_id);$x$);
select public.pl_patch_function('public.is_team_leader(uuid)'::regprocedure,
$x$role in ('manager', 'super_admin')$x$,
$x$role in ('manager', 'super_manager', 'super_admin')$x$);

-- Promotions: a super admin, or a Super Manager for someone else in their
-- solar system (never their own).
create or replace function public.pl_can_decide_promotion(p_request uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select me.role = 'super_admin'
        or (me.role = 'super_manager' and r.user_id <> me.id and me.solar_system_id = public.pl_system_of(r.user_id))
      from public.profiles me, public.promotion_requests r
     where me.id = auth.uid() and r.id = p_request), false);
$$;
revoke all on function public.pl_can_decide_promotion(uuid) from public, anon;
grant execute on function public.pl_can_decide_promotion(uuid) to authenticated;
select public.pl_patch_function('public.approve_promotion(uuid)'::regprocedure,
$x$  if me_role is distinct from 'super_admin' then
    raise exception 'Only super admins can approve promotions.';$x$,
$x$  if not public.pl_can_decide_promotion(p_request) then
    raise exception 'Only super admins can approve promotions.';$x$);
select public.pl_patch_function('public.send_back_promotion(uuid,text)'::regprocedure,
$x$  if me_role is distinct from 'super_admin' then
    raise exception 'Only super admins can send a promotion back.';$x$,
$x$  if not public.pl_can_decide_promotion(p_request) then
    raise exception 'Only super admins can send a promotion back.';$x$);

-- 6) Things that belong to a solar system rather than a person -----------------
alter table public.announcements add column if not exists solar_system_id uuid references public.solar_systems(id);
alter table public.chat_messages add column if not exists solar_system_id uuid references public.solar_systems(id);
alter table public.documents add column if not exists solar_system_id uuid references public.solar_systems(id);
alter table public.important_links add column if not exists solar_system_id uuid references public.solar_systems(id);
alter table public.trainings add column if not exists solar_system_id uuid references public.solar_systems(id);
alter table public.wins add column if not exists solar_system_id uuid references public.solar_systems(id);
alter table public.documents add column if not exists copied_from uuid;
alter table public.important_links add column if not exists copied_from uuid;
alter table public.trainings add column if not exists copied_from uuid;

update public.announcements set solar_system_id = public.pl_big_system() where solar_system_id is null;
update public.chat_messages set solar_system_id = public.pl_big_system() where solar_system_id is null;
update public.documents set solar_system_id = public.pl_big_system() where solar_system_id is null;
update public.important_links set solar_system_id = public.pl_big_system() where solar_system_id is null;
update public.trainings set solar_system_id = public.pl_big_system() where solar_system_id is null;
update public.wins w set solar_system_id = coalesce(public.pl_system_of(w.user_id), public.pl_big_system()) where solar_system_id is null;

create index if not exists announcements_system_idx on public.announcements (solar_system_id);
create index if not exists chat_messages_system_idx on public.chat_messages (solar_system_id, channel, created_at desc);
create index if not exists documents_system_idx on public.documents (solar_system_id);
create index if not exists important_links_system_idx on public.important_links (solar_system_id);
create index if not exists trainings_system_idx on public.trainings (solar_system_id, training_date);
create index if not exists wins_system_idx on public.wins (solar_system_id, occurred_at desc);

-- New posts go to the writer's solar system, and stay there.
create or replace function public.stamp_solar_system()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.solar_system_id is null or not public.pl_is_galaxy_admin() then
      new.solar_system_id := case when auth.uid() is null then coalesce(new.solar_system_id, public.pl_big_system())
                                  else public.pl_writer_system() end;
    end if;
  else
    new.solar_system_id := old.solar_system_id;
  end if;
  return new;
end;
$$;
do $$
declare t text;
begin
  foreach t in array array['announcements', 'chat_messages', 'documents', 'important_links', 'trainings'] loop
    execute format('drop trigger if exists stamp_solar_system_trigger on public.%I', t);
    execute format('create trigger stamp_solar_system_trigger before insert or update on public.%I for each row execute procedure public.stamp_solar_system()', t);
  end loop;
end $$;

-- A win is in the solar system of the person it's about.
create or replace function public.stamp_win_system()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.solar_system_id is null then
    new.solar_system_id := coalesce(public.pl_system_of(new.user_id), public.pl_big_system());
  end if;
  return new;
end;
$$;
drop trigger if exists stamp_win_system_trigger on public.wins;
create trigger stamp_win_system_trigger before insert on public.wins
  for each row execute procedure public.stamp_win_system();

-- 7) The wall: every table, every rule, inside the viewer's solar system ------
do $$
declare
  t record;
begin
  for t in select * from (values
    -- table, who it belongs to
    ('prospects', 'user_id'), ('business_plans', 'user_id'), ('client_intake_candidates', 'advisor_id'),
    ('coaching_notes', 'advisor_id'), ('licensing_progress', 'user_id'), ('onboarding_progress', 'user_id'),
    ('team_checklist', 'user_id'), ('manager_availability_blocks', 'user_id'), ('promotion_requests', 'user_id'),
    ('announcement_confirmations', 'user_id'), ('chat_reads', 'user_id'),
    ('chat_blocks', 'blocker_id'), ('chat_rules', 'user_id')
  ) v(tbl, col) loop
    execute format('drop policy if exists "solar system wall" on public.%I', t.tbl);
    execute format('create policy "solar system wall" on public.%I as restrictive for all using (public.pl_sees_person(%I)) with check (public.pl_sees_person(%I))', t.tbl, t.col, t.col);
  end loop;
end $$;

drop policy if exists "solar system wall" on public.audit_log;
create policy "solar system wall" on public.audit_log as restrictive for all
  using (public.pl_sees_person(actor_id) or (actor_id is null and public.pl_is_galaxy_admin()))
  with check (public.pl_sees_person(actor_id) or (actor_id is null and public.pl_is_galaxy_admin()));

drop policy if exists "solar system wall" on public.profiles;
create policy "solar system wall" on public.profiles as restrictive for all
  using (id = auth.uid() or public.pl_sees_system(solar_system_id))
  with check (id = auth.uid() or public.pl_sees_system(solar_system_id) or public.pl_is_galaxy_admin());

drop policy if exists "solar system wall" on public.appointments;
create policy "solar system wall" on public.appointments as restrictive for all
  using (user_id = auth.uid() or presenter_id = auth.uid() or trainee_id = auth.uid() or public.pl_sees_person(user_id))
  with check (user_id = auth.uid() or presenter_id = auth.uid() or trainee_id = auth.uid() or public.pl_sees_person(user_id));

drop policy if exists "solar system wall" on public.recruit_invites;
create policy "solar system wall" on public.recruit_invites as restrictive for all
  using (created_by = auth.uid() or public.pl_sees_person(upline_id))
  with check (created_by = auth.uid() or public.pl_sees_person(upline_id));

-- Notes ride on their appointment (which has its own wall).
drop policy if exists "solar system wall" on public.follow_up_notes;
create policy "solar system wall" on public.follow_up_notes as restrictive for all
  using (exists (select 1 from public.appointments ap where ap.id = follow_up_notes.appointment_id))
  with check (exists (select 1 from public.appointments ap where ap.id = follow_up_notes.appointment_id));
drop policy if exists "solar system wall" on public.policy_notes;
create policy "solar system wall" on public.policy_notes as restrictive for all
  using (exists (select 1 from public.appointments ap where ap.id = policy_notes.appointment_id))
  with check (exists (select 1 from public.appointments ap where ap.id = policy_notes.appointment_id));

-- Chat: one solar system's at a time (for super admins, the one picked in
-- the header, or their own when looking at all of them).
drop policy if exists "solar system wall" on public.chat_messages;
create policy "solar system wall" on public.chat_messages as restrictive for all
  using (solar_system_id = public.pl_writer_system())
  with check (solar_system_id = public.pl_writer_system());
drop policy if exists "solar system wall" on public.chat_reports;
create policy "solar system wall" on public.chat_reports as restrictive for all
  using (exists (select 1 from public.chat_messages m where m.id = chat_reports.message_id))
  with check (exists (select 1 from public.chat_messages m where m.id = chat_reports.message_id));

do $$
declare t text;
begin
  foreach t in array array['announcements', 'documents', 'important_links', 'trainings', 'wins'] loop
    execute format('drop policy if exists "solar system wall" on public.%I', t);
    execute format('create policy "solar system wall" on public.%I as restrictive for all using (public.pl_sees_system(solar_system_id)) with check (public.pl_sees_system(solar_system_id))', t);
  end loop;
end $$;
drop policy if exists "solar system wall" on public.win_reactions;
create policy "solar system wall" on public.win_reactions as restrictive for all
  using (exists (select 1 from public.wins w where w.id = win_reactions.win_id))
  with check (exists (select 1 from public.wins w where w.id = win_reactions.win_id));

-- The name lists the app reads (they run as the database, so they need
-- the wall written in).
create or replace view public.org_directory as
  select id, display_name, manager_id, role, solar_system_id from public.profiles
   where id = auth.uid() or public.pl_sees_system(solar_system_id);
create or replace view public.manager_directory as
  select id, display_name from public.profiles
   where role in ('manager', 'super_manager', 'super_admin') and (id = auth.uid() or public.pl_sees_system(solar_system_id));
create or replace view public.zoom_connected_managers as
  select p.id, p.display_name from public.profiles p join public.zoom_connections zc on zc.user_id = p.id
   where p.role in ('manager', 'super_manager', 'super_admin') and (p.id = auth.uid() or public.pl_sees_system(p.solar_system_id));
revoke all on public.org_directory, public.manager_directory, public.zoom_connected_managers from anon;
grant select on public.org_directory, public.manager_directory, public.zoom_connected_managers to authenticated;

-- 8) Super Managers: the super-admin rules, inside their solar system ---------
-- (The wall above keeps every one of these inside their own solar system.)
do $$
declare
  t record;
begin
  for t in select * from (values
    ('announcement_confirmations', 'select'), ('announcements', 'select'), ('announcements', 'insert'), ('announcements', 'update'),
    ('announcements', 'delete'), ('appointments', 'select'), ('audit_log', 'select'), ('chat_reports', 'select'),
    ('client_intake_candidates', 'select'), ('coaching_notes', 'select'), ('documents', 'insert'), ('documents', 'update'),
    ('documents', 'delete'), ('important_links', 'insert'), ('important_links', 'update'), ('important_links', 'delete'),
    ('licensing_progress', 'select'), ('manager_availability_blocks', 'select'), ('manager_availability_blocks', 'delete'),
    ('onboarding_progress', 'select'), ('policy_notes', 'select'), ('promotion_requests', 'select'), ('prospects', 'select'),
    ('recruit_invites', 'select'), ('recruit_invites', 'delete'), ('trainings', 'insert'), ('trainings', 'delete'), ('wins', 'delete')
  ) v(tbl, cmd) loop
    execute format('drop policy if exists %I on public.%I', 'super managers: ' || t.cmd, t.tbl);
    if t.cmd = 'insert' then
      execute format('create policy %I on public.%I for insert with check (public.pl_is_super_manager())', 'super managers: ' || t.cmd, t.tbl);
    elsif t.cmd = 'update' then
      execute format('create policy %I on public.%I for update using (public.pl_is_super_manager()) with check (public.pl_is_super_manager())', 'super managers: ' || t.cmd, t.tbl);
    else
      execute format('create policy %I on public.%I for %s using (public.pl_is_super_manager())', 'super managers: ' || t.cmd, t.tbl, t.cmd);
    end if;
  end loop;
end $$;
-- Notes they add are their own.
drop policy if exists "super managers: insert" on public.coaching_notes;
create policy "super managers: insert" on public.coaching_notes for insert
  with check (author_id = auth.uid() and public.pl_is_super_manager());
drop policy if exists "super managers: insert" on public.policy_notes;
create policy "super managers: insert" on public.policy_notes for insert
  with check (author_id = auth.uid() and public.pl_is_super_manager());
drop policy if exists "super managers: insert" on public.manager_availability_blocks;
create policy "super managers: insert" on public.manager_availability_blocks for insert
  with check (user_id = auth.uid() and public.pl_is_super_manager());
drop policy if exists "super managers: insert" on public.recruit_invites;
create policy "super managers: insert" on public.recruit_invites for insert
  with check (created_by = auth.uid() and used_at is null and used_by is null and public.pl_is_super_manager());
-- People: edit (the guard on profiles decides which fields), and remove
-- advisors and managers (not themselves).
drop policy if exists "super managers: update" on public.profiles;
create policy "super managers: update" on public.profiles for update
  using (public.pl_is_super_manager()) with check (public.pl_is_super_manager());
drop policy if exists "super managers: delete" on public.profiles;
create policy "super managers: delete" on public.profiles for delete
  using (public.pl_is_super_manager() and id <> auth.uid() and role in ('advisor', 'manager'));

-- Resources files: each solar system's new uploads go in its own folder
-- (BHB/...). Files from before stay where they are, shared by the copies.
create or replace function public.pl_home_short() returns text
language sql stable security definer set search_path = public as $$
  select s.short_name from public.solar_systems s where s.id = public.pl_writer_system();
$$;
revoke all on function public.pl_home_short() from public;
grant execute on function public.pl_home_short() to anon, authenticated;
drop policy if exists "authenticated users can view documents" on storage.objects;
create policy "authenticated users can view documents" on storage.objects for select
  using (bucket_id = 'documents' and auth.role() = 'authenticated'
         and (public.pl_is_galaxy_admin() or (storage.foldername(name))[1] is null
              or (storage.foldername(name))[1] = (select s.short_name from public.solar_systems s where s.id = public.pl_home_system())));
drop policy if exists "super managers: upload documents" on storage.objects;
create policy "super managers: upload documents" on storage.objects for insert
  with check (bucket_id = 'documents' and public.pl_is_super_manager() and (storage.foldername(name))[1] = public.pl_home_short());
drop policy if exists "super managers: delete documents" on storage.objects;
create policy "super managers: delete documents" on storage.objects for delete
  using (bucket_id = 'documents' and public.pl_is_super_manager() and (storage.foldername(name))[1] = public.pl_home_short());

-- Deleting a document: the file goes too, unless another solar system's
-- copy still uses it. Returns the file to remove, or null.
create or replace function public.delete_document(p_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  d public.documents%rowtype;
begin
  select * into d from public.documents where id = p_id;
  if not found then return null; end if;
  if not (public.pl_is_galaxy_admin() or (public.pl_is_super_manager() and d.solar_system_id = public.pl_home_system())) then
    raise exception 'not_allowed';
  end if;
  delete from public.documents where id = p_id;
  if exists (select 1 from public.documents x where x.file_path = d.file_path) then return null; end if;
  return d.file_path;
end;
$$;
revoke all on function public.delete_document(uuid) from public, anon;
grant execute on function public.delete_document(uuid) to authenticated;

-- 9) Chat --------------------------------------------------------------------
select public.pl_patch_function('public.chat_unread_counts()'::regprocedure,
$x$       where m.channel = c.channel$x$,
$x$       where m.channel = c.channel and m.solar_system_id = public.pl_writer_system()$x$);
select public.pl_patch_function('public.chat_unread_counts()'::regprocedure,
$x$              when exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin')
              then (select count(*) from public.chat_reports where resolved_at is null) else 0 end)$x$,
$x$              when public.pl_is_system_admin()
              then (select count(*) from public.chat_reports cr join public.chat_messages cm on cm.id = cr.message_id
                     where cr.resolved_at is null and cm.solar_system_id = public.pl_writer_system()) else 0 end)$x$);
select public.pl_patch_function('public.delete_chat_message(uuid)'::regprocedure,
$x$  select coalesce(role = 'super_admin', false) into is_admin from public.profiles where id = me;$x$,
$x$  is_admin := public.pl_admin_of(author);$x$);
select public.pl_patch_function('public.resolve_chat_report(uuid,boolean)'::regprocedure,
$x$  if not exists (select 1 from public.profiles where id = me and role = 'super_admin') then$x$,
$x$  if not public.pl_admin_of((select m.user_id from public.chat_messages m join public.chat_reports r on r.message_id = m.id where r.id = p_report)) then$x$);

-- 10) Team wins and the top 3, per solar system --------------------------------
-- Each person's numbers for a week (appointments set, sales, recruits).
create or replace function public.pl_weekly_counts(p_week_start date)
returns table (category text, user_id uuid, n integer)
language sql stable security definer set search_path = public
as $$
  select 'pace'::text, a.user_id, count(*)::int
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

-- One solar system's top 3 (null: whoever the viewer can see).
create or replace function public.pl_weekly_top3_in(p_week_start date, p_system uuid)
returns table (category text, user_id uuid, display_name text, n integer)
language sql stable security definer set search_path = public
as $$
  with ranked as (
    select c.category, c.user_id, p.display_name, c.n,
           row_number() over (partition by c.category order by c.n desc, p.display_name) as r
      from public.pl_weekly_counts(p_week_start) c join public.profiles p on p.id = c.user_id
     where c.n > 0
       and (case when p_system is null then public.pl_sees_system(p.solar_system_id) else p.solar_system_id = p_system end)
  )
  select category, user_id, display_name, n from ranked where r <= 3 order by category, r;
$$;
revoke all on function public.pl_weekly_top3_in(date, uuid) from public, anon, authenticated;

create or replace function public.weekly_top3(p_week_start date)
returns table (category text, user_id uuid, display_name text, n integer)
language sql stable security definer set search_path = public
as $$
  select t.* from public.pl_weekly_top3_in(p_week_start, null) t where auth.uid() is not null;
$$;
revoke all on function public.weekly_top3(date) from public, anon;
grant execute on function public.weekly_top3(date) to authenticated;

-- Posted when Team wins opens: policies issued by date, and last week's
-- winners for each solar system.
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
  s record;
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

  for s in select id, short_name from public.solar_systems loop
    if exists (select 1 from public.wins where ref = 'winners:' || s.short_name || ':' || last_week)
       or (s.short_name = 'BIG' and exists (select 1 from public.wins where ref = 'winners:' || last_week)) then
      continue;
    end if;
    with t as (select * from public.pl_weekly_top3_in(last_week, s.id)),
         m as (select category, max(n) as mx from t group by category),
         firsts as (select t.* from t join m on m.category = t.category and t.n = m.mx)
    select jsonb_build_object(
             'week_start', last_week, 'week_end', last_week + 6,
             'pace', coalesce((select jsonb_agg(jsonb_build_object('user_id', f.user_id, 'name', f.display_name, 'n', f.n) order by f.display_name) from firsts f where f.category = 'pace'), '[]'::jsonb),
             'sales', coalesce((select jsonb_agg(jsonb_build_object('user_id', f.user_id, 'name', f.display_name, 'n', f.n) order by f.display_name) from firsts f where f.category = 'sales'), '[]'::jsonb),
             'recruits', coalesce((select jsonb_agg(jsonb_build_object('user_id', f.user_id, 'name', f.display_name, 'n', f.n) order by f.display_name) from firsts f where f.category = 'recruits'), '[]'::jsonb))
      into d;
    if jsonb_array_length(d->'pace') + jsonb_array_length(d->'sales') + jsonb_array_length(d->'recruits') > 0 then
      insert into public.wins (user_id, kind, ref, detail, occurred_at, solar_system_id)
        values (null, 'winners', 'winners:' || s.short_name || ':' || last_week, d, this_week::timestamp at time zone 'America/Chicago', s.id)
        on conflict (ref) do nothing;
      get diagnostics k = row_count;
      posted := posted + k;
    end if;
  end loop;
  return posted;
end;
$$;
revoke all on function public.post_due_wins() from public, anon;
grant execute on function public.post_due_wins() to authenticated;

-- 11) BHB starts with a copy of BIG's Resources ------------------------------
-- Documents (sharing the same files), links and upcoming trainings. Only
-- once: anything already copied isn't copied again.
do $$
declare
  big uuid := public.pl_big_system();
  bhb uuid := (select id from public.solar_systems where short_name = 'BHB');
begin
  insert into public.documents (title, file_path, file_size, file_type, uploaded_by, uploaded_by_name, created_at, solar_system_id, copied_from)
  select d.title, d.file_path, d.file_size, d.file_type, d.uploaded_by, d.uploaded_by_name, d.created_at, bhb, d.id
    from public.documents d
   where d.solar_system_id = big
     and not exists (select 1 from public.documents x where x.copied_from = d.id and x.solar_system_id = bhb);

  insert into public.important_links (title, url, created_by, created_by_name, created_at, solar_system_id, copied_from)
  select l.title, l.url, l.created_by, l.created_by_name, l.created_at, bhb, l.id
    from public.important_links l
   where l.solar_system_id = big
     and not exists (select 1 from public.important_links x where x.copied_from = l.id and x.solar_system_id = bhb);

  insert into public.trainings (title, training_date, training_time, timezone, zoom_url, notes, created_by, created_by_name,
                                recurring_group_id, duration_minutes, solar_system_id, copied_from)
  select t.title, t.training_date, t.training_time, t.timezone, t.zoom_url, t.notes, t.created_by, t.created_by_name,
         case when t.recurring_group_id is null then null else md5(t.recurring_group_id::text || ':' || bhb::text)::uuid end,
         t.duration_minutes, bhb, t.id
    from public.trainings t
   where t.solar_system_id = big and t.training_date >= public.pl_today()
     and not exists (select 1 from public.trainings x where x.copied_from = t.id and x.solar_system_id = bhb);
end $$;

drop function public.pl_patch_function(regprocedure, text, text);

notify pgrst, 'reload schema';

commit;
