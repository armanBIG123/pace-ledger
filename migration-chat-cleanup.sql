-- Chat cleanup: messages older than 90 days are deleted automatically.
--
-- The cleanup runs every time someone posts in Chat, so there's nothing to
-- schedule. A message that's still waiting on a report is kept until a
-- super admin removes it or keeps it, so nothing is lost before it's
-- reviewed. Read markers, blocks and the chat-rules agreements aren't
-- affected.
--
-- Run this in your Supabase SQL Editor (New query -> paste -> Run), after
-- migration-chat.sql. Safe to run more than once. It also deletes anything
-- that's already more than 90 days old.

create index if not exists chat_messages_created_idx on public.chat_messages (created_at);

create or replace function public.chat_cleanup()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.chat_messages m
   where m.created_at < now() - interval '90 days'
     and not exists (select 1 from public.chat_reports r where r.message_id = m.id and r.resolved_at is null);
  return null;
end;
$$;
revoke all on function public.chat_cleanup() from public, anon, authenticated;

drop trigger if exists chat_cleanup_after_post on public.chat_messages;
create trigger chat_cleanup_after_post
  after insert on public.chat_messages
  for each statement execute function public.chat_cleanup();

-- Anything already past 90 days.
delete from public.chat_messages m
 where m.created_at < now() - interval '90 days'
   and not exists (select 1 from public.chat_reports r where r.message_id = m.id and r.resolved_at is null);
