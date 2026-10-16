-- Client intake forms: super admins can see everyone's.
--
-- Until now a client intake form could be seen by the advisor who sent it
-- and by the people above that advisor on the team. This lets super admins
-- see every advisor's forms too (Team & admin -> Client Forms).
--
-- Read only: super admins can't change or delete someone else's form.
-- Only the advisor who sent it can remove it, same as before.
--
-- Run this in your Supabase SQL Editor (New query -> paste -> Run).
-- Safe to run more than once.

drop policy if exists "super admins see all client intake forms" on public.client_intake_candidates;
create policy "super admins see all client intake forms"
  on public.client_intake_candidates for select
  using (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin'));

-- Newest completed forms first.
create index if not exists client_intake_candidates_status_submitted_idx
  on public.client_intake_candidates (status, submitted_at desc);
