-- Chat: General, Work and Urgent help, shared by everyone in the agency.
--
-- 1) chat_messages: the messages. Nobody can write to this table directly;
--    posting and deleting go through the functions below, which check who
--    you are, mask filtered words and limit how fast anyone can post.
-- 2) chat_rules: who has agreed to the chat rules. Apple requires people
--    to agree to them before they can see or post anything.
-- 3) chat_blocks: people you've blocked. Their messages disappear for you
--    (the database hides them, not just the screen).
-- 4) chat_reports: messages someone reported. Super admins see them in
--    Chat -> Reports and either remove the message or keep it.
-- 5) chat_reads: the last time you read each chat, for the unread counts.
-- 6) chat_filter_words: words that are masked with **** when posted. Add
--    your own with:  insert into public.chat_filter_words values ('word');
--
-- A deleted message keeps its place ("Message removed") but its text is
-- erased. A report keeps a copy of the text so a super admin can still see
-- what was reported.
--
-- Run this in your Supabase SQL Editor (New query -> paste -> Run),
-- BEFORE merging the website change. Safe to run more than once.

-- 1) Messages --------------------------------------------------------------
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('general', 'work', 'urgent')),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) <= 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  notified_at timestamptz,
  notified_to text,
  constraint chat_messages_body_present check (deleted_at is not null or char_length(btrim(body)) > 0)
);
create index if not exists chat_messages_channel_idx on public.chat_messages (channel, created_at desc);
create index if not exists chat_messages_user_idx on public.chat_messages (user_id, created_at desc);

-- 2) Agreeing to the chat rules ----------------------------------------------
create table if not exists public.chat_rules (
  user_id uuid primary key references auth.users(id) on delete cascade,
  accepted_at timestamptz not null default now()
);

-- 3) Blocking ----------------------------------------------------------------
create table if not exists public.chat_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists chat_blocks_blocked_idx on public.chat_blocks (blocked_id);

-- 4) Reports -----------------------------------------------------------------
create table if not exists public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 500),
  message_body text not null,
  message_author uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  emailed_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  outcome text check (outcome in ('removed', 'kept')),
  unique (message_id, reporter_id)
);
create index if not exists chat_reports_open_idx on public.chat_reports (created_at desc) where resolved_at is null;

-- 5) Read markers --------------------------------------------------------------
create table if not exists public.chat_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('general', 'work', 'urgent')),
  last_read_at timestamptz not null default now(),
  primary key (user_id, channel)
);

-- 6) Filtered words ------------------------------------------------------------
-- Lowercase letters only. A word also catches longer words that start with
-- it (fuck -> fucking), so keep them specific.
create table if not exists public.chat_filter_words (
  word text primary key check (word ~ '^[a-z]{3,30}$')
);
insert into public.chat_filter_words (word) values
  ('fuck'), ('motherfuck'), ('shit'), ('bullshit'), ('dipshit'), ('bitch'), ('cunt'),
  ('asshole'), ('dumbass'), ('jackass'), ('bastard'), ('slut'), ('whore')
on conflict do nothing;

-- Who can see what -------------------------------------------------------------
alter table public.chat_messages enable row level security;
alter table public.chat_rules enable row level security;
alter table public.chat_blocks enable row level security;
alter table public.chat_reports enable row level security;
alter table public.chat_reads enable row level security;
alter table public.chat_filter_words enable row level security;

-- Everyone signed in sees the chat, except messages from people they blocked.
drop policy if exists "everyone sees chat, minus people you blocked" on public.chat_messages;
create policy "everyone sees chat, minus people you blocked" on public.chat_messages for select to authenticated
  using (not exists (select 1 from public.chat_blocks b where b.blocker_id = auth.uid() and b.blocked_id = chat_messages.user_id));

drop policy if exists "see your own agreement" on public.chat_rules;
create policy "see your own agreement" on public.chat_rules for select to authenticated using (user_id = auth.uid());

drop policy if exists "see your own blocks" on public.chat_blocks;
create policy "see your own blocks" on public.chat_blocks for select to authenticated using (blocker_id = auth.uid());
drop policy if exists "block someone" on public.chat_blocks;
create policy "block someone" on public.chat_blocks for insert to authenticated with check (blocker_id = auth.uid());
drop policy if exists "unblock someone" on public.chat_blocks;
create policy "unblock someone" on public.chat_blocks for delete to authenticated using (blocker_id = auth.uid());

drop policy if exists "reporters and super admins see reports" on public.chat_reports;
create policy "reporters and super admins see reports" on public.chat_reports for select to authenticated
  using (reporter_id = auth.uid() or exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'));

drop policy if exists "see your own read markers" on public.chat_reads;
create policy "see your own read markers" on public.chat_reads for select to authenticated using (user_id = auth.uid());

revoke all on public.chat_messages, public.chat_rules, public.chat_blocks, public.chat_reports, public.chat_reads, public.chat_filter_words from anon;
revoke all on public.chat_messages, public.chat_rules, public.chat_reports, public.chat_reads, public.chat_filter_words from authenticated;
grant select on public.chat_messages, public.chat_rules, public.chat_reports, public.chat_reads to authenticated;
revoke update on public.chat_blocks from authenticated;
grant select, insert, delete on public.chat_blocks to authenticated;

-- Masking -------------------------------------------------------------------------
create or replace function public.chat_mask(p_text text)
returns text
language plpgsql
stable
security definer set search_path = public
as $$
declare
  w text;
  masked text := p_text;
begin
  for w in select word from public.chat_filter_words loop
    masked := regexp_replace(masked, '\m' || w || '\w*', '****', 'gi');
  end loop;
  return masked;
end;
$$;
revoke all on function public.chat_mask(text) from public, anon, authenticated;

-- Agreeing to the rules --------------------------------------------------------
create or replace function public.accept_chat_rules()
returns timestamptz
language plpgsql
security definer set search_path = public
as $$
declare
  accepted timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  insert into public.chat_rules (user_id) values (auth.uid())
  on conflict (user_id) do update set accepted_at = public.chat_rules.accepted_at
  returning accepted_at into accepted;
  return accepted;
end;
$$;

-- Posting -------------------------------------------------------------------------
create or replace function public.post_chat_message(p_channel text, p_body text)
returns public.chat_messages
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  clean text;
  recent int;
  saved public.chat_messages%rowtype;
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  if not exists (select 1 from public.profiles where id = me) then
    raise exception 'no_profile';
  end if;
  if not exists (select 1 from public.chat_rules where user_id = me) then
    raise exception 'rules_not_accepted';
  end if;
  if p_channel is null or p_channel not in ('general', 'work', 'urgent') then
    raise exception 'bad_channel';
  end if;
  clean := regexp_replace(coalesce(p_body, ''), E'\r\n?', E'\n', 'g');
  clean := regexp_replace(clean, E'\n{4,}', E'\n\n\n', 'g');
  clean := btrim(clean, E' \t\n');
  if clean = '' then
    raise exception 'empty';
  end if;
  if char_length(clean) > 2000 then
    raise exception 'too_long';
  end if;
  select count(*) into recent from public.chat_messages
   where user_id = me and created_at > now() - interval '1 minute';
  if recent >= 15 then
    raise exception 'slow_down';
  end if;

  insert into public.chat_messages (channel, user_id, body)
  values (p_channel, me, public.chat_mask(clean))
  returning * into saved;

  -- Posting counts as reading that chat.
  insert into public.chat_reads (user_id, channel, last_read_at) values (me, p_channel, saved.created_at)
  on conflict (user_id, channel) do update set last_read_at = greatest(public.chat_reads.last_read_at, excluded.last_read_at);
  return saved;
end;
$$;

-- Deleting: your own messages, or any message if you're a super admin ----------
create or replace function public.delete_chat_message(p_message uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  author uuid;
  is_admin boolean;
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  select user_id into author from public.chat_messages where id = p_message and deleted_at is null;
  if not found then
    return;
  end if;
  select coalesce(role = 'super_admin', false) into is_admin from public.profiles where id = me;
  if author is distinct from me and not coalesce(is_admin, false) then
    raise exception 'not_allowed';
  end if;
  update public.chat_messages set deleted_at = now(), deleted_by = me, body = '' where id = p_message;
  update public.chat_reports set resolved_at = now(), resolved_by = me, outcome = 'removed'
   where message_id = p_message and resolved_at is null;
end;
$$;

-- Reporting -------------------------------------------------------------------------
create or replace function public.report_chat_message(p_message uuid, p_reason text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  msg public.chat_messages%rowtype;
  rid uuid;
  today int;
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  select * into msg from public.chat_messages where id = p_message;
  if not found or msg.deleted_at is not null then
    raise exception 'not_found';
  end if;
  if msg.user_id = me then
    raise exception 'own_message';
  end if;
  select count(*) into today from public.chat_reports where reporter_id = me and created_at > now() - interval '1 day';
  if today >= 20 then
    raise exception 'slow_down';
  end if;
  insert into public.chat_reports (message_id, reporter_id, reason, message_body, message_author)
  values (p_message, me, left(btrim(coalesce(p_reason, '')), 500), msg.body, msg.user_id)
  on conflict (message_id, reporter_id) do update set reason = excluded.reason
  returning id into rid;
  return rid;
end;
$$;

-- Super admins: remove the reported message, or keep it ------------------------
create or replace function public.resolve_chat_report(p_report uuid, p_remove boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  msg uuid;
begin
  if not exists (select 1 from public.profiles where id = me and role = 'super_admin') then
    raise exception 'not_allowed';
  end if;
  select message_id into msg from public.chat_reports where id = p_report;
  if not found then
    raise exception 'not_found';
  end if;
  if p_remove then
    update public.chat_messages set deleted_at = coalesce(deleted_at, now()), deleted_by = coalesce(deleted_by, me), body = ''
     where id = msg;
    update public.chat_reports set resolved_at = now(), resolved_by = me, outcome = 'removed'
     where message_id = msg and resolved_at is null;
  else
    update public.chat_reports set resolved_at = now(), resolved_by = me, outcome = 'kept'
     where message_id = msg and resolved_at is null;
  end if;
end;
$$;

-- Read markers and unread counts ------------------------------------------------
create or replace function public.mark_chat_read(p_channel text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null or p_channel not in ('general', 'work', 'urgent') then
    return;
  end if;
  insert into public.chat_reads (user_id, channel, last_read_at) values (auth.uid(), p_channel, now())
  on conflict (user_id, channel) do update set last_read_at = greatest(public.chat_reads.last_read_at, excluded.last_read_at);
end;
$$;

-- { general, work, urgent, reports }: messages from other people you haven't
-- read yet (from the last 7 days if you've never opened that chat), and for
-- super admins, reports still waiting.
create or replace function public.chat_unread_counts()
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  with c(channel) as (values ('general'), ('work'), ('urgent')),
  counts as (
    select c.channel, (
      select count(*) from public.chat_messages m
       where m.channel = c.channel
         and m.user_id <> auth.uid()
         and m.deleted_at is null
         and m.created_at > coalesce(r.last_read_at, now() - interval '7 days')
         and not exists (select 1 from public.chat_blocks b where b.blocker_id = auth.uid() and b.blocked_id = m.user_id)
    ) as n
    from c left join public.chat_reads r on r.user_id = auth.uid() and r.channel = c.channel
  )
  select jsonb_object_agg(channel, n)
         || jsonb_build_object('reports', case
              when exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin')
              then (select count(*) from public.chat_reports where resolved_at is null) else 0 end)
    from counts
   where auth.uid() is not null;
$$;

revoke all on function public.accept_chat_rules() from public, anon;
revoke all on function public.post_chat_message(text, text) from public, anon;
revoke all on function public.delete_chat_message(uuid) from public, anon;
revoke all on function public.report_chat_message(uuid, text) from public, anon;
revoke all on function public.resolve_chat_report(uuid, boolean) from public, anon;
revoke all on function public.mark_chat_read(text) from public, anon;
revoke all on function public.chat_unread_counts() from public, anon;
grant execute on function public.accept_chat_rules() to authenticated;
grant execute on function public.post_chat_message(text, text) to authenticated;
grant execute on function public.delete_chat_message(uuid) to authenticated;
grant execute on function public.report_chat_message(uuid, text) to authenticated;
grant execute on function public.resolve_chat_report(uuid, boolean) to authenticated;
grant execute on function public.mark_chat_read(text) to authenticated;
grant execute on function public.chat_unread_counts() to authenticated;

-- Live updates: new messages show up without refreshing ------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end;
$$;
