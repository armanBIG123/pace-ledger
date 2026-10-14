-- Promotions: submit for approval, then approve, all in PaceLedger.
--
-- When someone meets every requirement for their next level, their direct
-- manager presses "Submit for approval" in Team Pace -> Promotion. The
-- submit-promotion function saves the submission here and emails the agency
-- (agency@biginsurancenetwork.com). A super admin then approves it, which
-- changes the person's level, or sends it back.
--
-- Who can see a submission: the person it's for, whoever submitted it,
-- everyone above them on the team, and super admins. Nobody can add or
-- change rows directly. Submissions come only from the submit-promotion
-- function, and approving or sending back goes through the two functions
-- below, which check you're a super admin.
--
-- Run this in your Supabase SQL Editor (New query -> paste -> Run),
-- BEFORE deploying the submit-promotion function. Safe to run more than once.

create table if not exists public.promotion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_tier text,
  to_tier text not null check (to_tier in ('FA', 'SA', 'AD', 'FD', 'SFD', 'DFD', 'EFD', 'FVC', 'EVC')),
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'sent_back')),
  results jsonb not null default '[]'::jsonb,
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_by_name text,
  submitted_at timestamptz not null default now(),
  emailed_to text,
  emailed_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  decided_by_name text,
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 500)
);

-- One submission waiting per person per level, so the agency never gets
-- the same promotion twice.
create unique index if not exists promotion_requests_one_waiting
  on public.promotion_requests (user_id, to_tier) where status = 'submitted';
create index if not exists promotion_requests_user_idx on public.promotion_requests (user_id, submitted_at desc);
create index if not exists promotion_requests_submitter_idx on public.promotion_requests (submitted_by, emailed_at);

alter table public.promotion_requests enable row level security;

drop policy if exists "see promotion submissions" on public.promotion_requests;
create policy "see promotion submissions" on public.promotion_requests for select
  using (
    auth.uid() = user_id
    or auth.uid() = submitted_by
    or user_id in (select public.my_downline_ids())
    or exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin')
  );

revoke all on public.promotion_requests from anon;
revoke insert, update, delete on public.promotion_requests from authenticated;
grant select on public.promotion_requests to authenticated;

-- Approve: gives the person their new level and marks the submission
-- approved, in one step. Super admins only, only while it's waiting, and
-- only if the person is still at the level it was submitted from.
create or replace function public.approve_promotion(p_request uuid)
returns public.promotion_requests
language plpgsql
security definer set search_path = public
as $$
declare
  r public.promotion_requests;
  me_name text;
  me_role text;
  cur text;
begin
  select display_name, role into me_name, me_role from public.profiles where id = auth.uid();
  if me_role is distinct from 'super_admin' then
    raise exception 'Only super admins can approve promotions.';
  end if;
  select * into r from public.promotion_requests where id = p_request for update;
  if not found then
    raise exception 'That submission wasn''t found.';
  end if;
  if r.status <> 'submitted' then
    raise exception 'That submission was already %.', replace(r.status, '_', ' ');
  end if;
  select hierarchy_tier into cur from public.profiles where id = r.user_id for update;
  if cur is distinct from r.from_tier then
    raise exception 'Their level changed since this was submitted. Send it back, then submit again.';
  end if;
  update public.profiles set hierarchy_tier = r.to_tier where id = r.user_id;
  update public.promotion_requests
     set status = 'approved', decided_by = auth.uid(), decided_by_name = me_name, decided_at = now()
   where id = r.id
  returning * into r;
  return r;
end;
$$;

-- Send back: the submission stops waiting, with a short reason the
-- manager can see. They can submit again once it's fixed.
create or replace function public.send_back_promotion(p_request uuid, p_note text)
returns public.promotion_requests
language plpgsql
security definer set search_path = public
as $$
declare
  r public.promotion_requests;
  me_name text;
  me_role text;
begin
  select display_name, role into me_name, me_role from public.profiles where id = auth.uid();
  if me_role is distinct from 'super_admin' then
    raise exception 'Only super admins can send a promotion back.';
  end if;
  update public.promotion_requests
     set status = 'sent_back', decided_by = auth.uid(), decided_by_name = me_name, decided_at = now(),
         decision_note = nullif(left(btrim(coalesce(p_note, '')), 500), '')
   where id = p_request and status = 'submitted'
  returning * into r;
  if not found then
    raise exception 'That submission isn''t waiting for approval any more.';
  end if;
  return r;
end;
$$;

revoke all on function public.approve_promotion(uuid) from public, anon;
revoke all on function public.send_back_promotion(uuid, text) from public, anon;
grant execute on function public.approve_promotion(uuid) to authenticated;
grant execute on function public.send_back_promotion(uuid, text) to authenticated;
