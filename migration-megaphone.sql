-- MegaPhone: announcements from super admins.
--
-- Super admins post an announcement in Chat -> MegaPhone: what it says, how
-- long it shows, and who sees it (everyone, or leaders only). It's the
-- first thing on Today (and on the Team overview for leaders) until each
-- person checks "I've read and understand this". Important ones can pop up
-- over PaceLedger until they're confirmed.
--
-- Who sees what (enforced here, not just in the app):
-- - Announcements: super admins see all of them. Everyone else sees the
--   ones meant for them: for everyone, or for leaders if they lead anyone.
-- - Confirmations: your own, the people below you, and super admins see
--   everyone's. Nobody can confirm for someone else.
--
-- Run this in your Supabase SQL Editor (New query -> paste -> Run),
-- BEFORE merging the website change. Safe to run more than once.

-- 1) Tables ------------------------------------------------------------------------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience text not null default 'everyone',
  must_confirm boolean not null default false,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  ended_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'announcements_valid') then
    alter table public.announcements add constraint announcements_valid check (
      char_length(btrim(title)) between 1 and 120
      and char_length(btrim(body)) between 1 and 2000
      and audience in ('everyone', 'leaders')
      and ends_at > starts_at
    );
  end if;
end;
$$;
create index if not exists announcements_created_idx on public.announcements (created_at desc);

create table if not exists public.announcement_confirmations (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
create index if not exists announcement_confirmations_user_idx on public.announcement_confirmations (user_id);

-- 2) Who counts as a leader: a manager, a super admin, or anyone with someone
--    reporting to them.
create or replace function public.is_team_leader(p_user uuid)
returns boolean
language sql
stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = p_user and role in ('manager', 'super_admin'))
      or exists (select 1 from public.profiles where manager_id = p_user);
$$;
revoke all on function public.is_team_leader(uuid) from public, anon;
grant execute on function public.is_team_leader(uuid) to authenticated;

-- 3) Who posted it, when, and when someone confirmed: filled in by the
--    database, never by the app.
create or replace function public.announcements_stamp()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_by_name := (select display_name from public.profiles where id = auth.uid());
    new.created_at := now();
    new.starts_at := now();
    new.ended_at := null;
  else
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
    new.starts_at := old.starts_at;
    -- "End now" saves the database's time.
    if new.ended_at is not null and old.ended_at is null then
      new.ended_at := now();
    elsif new.ended_at is not null then
      new.ended_at := old.ended_at;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists announcements_stamp on public.announcements;
create trigger announcements_stamp before insert or update on public.announcements
  for each row execute function public.announcements_stamp();

create or replace function public.announcement_confirm_stamp()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.user_id := auth.uid();
  new.confirmed_at := now();
  return new;
end;
$$;
drop trigger if exists announcement_confirm_stamp on public.announcement_confirmations;
create trigger announcement_confirm_stamp before insert on public.announcement_confirmations
  for each row execute function public.announcement_confirm_stamp();

-- 4) Rules ---------------------------------------------------------------------------
alter table public.announcements enable row level security;
alter table public.announcement_confirmations enable row level security;

drop policy if exists "announcements: read the ones for you" on public.announcements;
create policy "announcements: read the ones for you" on public.announcements for select to authenticated
  using (
    exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin')
    or (starts_at <= now() and (audience = 'everyone' or public.is_team_leader(auth.uid())))
  );
drop policy if exists "announcements: super admins post" on public.announcements;
create policy "announcements: super admins post" on public.announcements for insert to authenticated
  with check (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'));
drop policy if exists "announcements: super admins edit" on public.announcements;
create policy "announcements: super admins edit" on public.announcements for update to authenticated
  using (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'))
  with check (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'));
drop policy if exists "announcements: super admins delete" on public.announcements;
create policy "announcements: super admins delete" on public.announcements for delete to authenticated
  using (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'));

drop policy if exists "announcement confirmations: yours, your team's, or super admins" on public.announcement_confirmations;
create policy "announcement confirmations: yours, your team's, or super admins" on public.announcement_confirmations for select to authenticated
  using (
    user_id = auth.uid()
    or user_id in (select public.my_downline_ids())
    or exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin')
  );
-- You can only confirm for yourself, and only announcements you can see.
drop policy if exists "announcement confirmations: confirm your own" on public.announcement_confirmations;
create policy "announcement confirmations: confirm your own" on public.announcement_confirmations for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.announcements a where a.id = announcement_confirmations.announcement_id)
  );
