-- Today's checklist for leaders (Team → Overview).
--
-- Each day PaceLedger suggests a leader's most important tasks for their
-- team. This table remembers which ones they checked off, plus tasks they
-- add themselves (their unfinished ones carry over to the next day).
--
-- Who can see it: only the person it belongs to. It's deleted with their
-- account.
--
-- Run this in your Supabase SQL Editor (New query -> paste -> Run),
-- BEFORE merging the website change. Safe to run more than once.

create table if not exists public.team_checklist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  item_key text not null check (length(item_key) between 1 and 120),
  label text check (label is null or length(label) <= 200),
  custom boolean not null default false,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, day, item_key)
);

create index if not exists team_checklist_user_day_idx on public.team_checklist (user_id, day);

alter table public.team_checklist enable row level security;

drop policy if exists "see own checklist" on public.team_checklist;
create policy "see own checklist" on public.team_checklist for select
  using (auth.uid() = user_id);
drop policy if exists "add to own checklist" on public.team_checklist;
create policy "add to own checklist" on public.team_checklist for insert
  with check (auth.uid() = user_id);
drop policy if exists "update own checklist" on public.team_checklist;
create policy "update own checklist" on public.team_checklist for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "delete from own checklist" on public.team_checklist;
create policy "delete from own checklist" on public.team_checklist for delete
  using (auth.uid() = user_id);

revoke all on public.team_checklist from anon;
grant select, insert, update, delete on public.team_checklist to authenticated;
