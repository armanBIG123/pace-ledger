-- Client intake: remember how and when each form was sent.
--
-- PaceLedger can now text, email or copy a client's intake link from one
-- window (Follow-up, the appointment window, + New, right after Log how it
-- went, and when booking). These columns let Follow-up and Today say
-- "Texted Oct 22", and nudge you when a client hasn't filled it in.
--
--   sent_at, sent_via  the last time it went out, and how: text, email or copy
--   emailed_at         the last time PaceLedger emailed it (send-intake-link)
--   email_send_count   how many times PaceLedger has emailed it
--
-- Advisors already own their own forms (they can read and change them), so
-- no new permissions are needed. Safe to run more than once.

-- The first time this runs, forms made before it are marked "link copied"
-- on the day they were made: until now, copying the link was the only way
-- to send one.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'client_intake_candidates' and column_name = 'sent_via'
  ) then
    alter table public.client_intake_candidates
      add column sent_at timestamptz,
      add column sent_via text;
    update public.client_intake_candidates set sent_at = created_at, sent_via = 'copy';
  end if;
end $$;

alter table public.client_intake_candidates
  add column if not exists emailed_at timestamptz,
  add column if not exists email_send_count integer not null default 0;

do $$
begin
  alter table public.client_intake_candidates
    add constraint client_intake_candidates_sent_via_check
    check (sent_via is null or sent_via in ('text', 'email', 'copy'));
exception when duplicate_object then null;
end $$;

-- For the "how many forms has this person emailed today" limit.
create index if not exists client_intake_candidates_advisor_emailed_idx
  on public.client_intake_candidates (advisor_id, emailed_at);

notify pgrst, 'reload schema';
