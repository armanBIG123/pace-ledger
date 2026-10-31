-- Contracting in PaceLedger: producer agreements and secure contracting info.
--
-- What this adds:
--   * Agents sign BIG's producer agreement inside PaceLedger (DocuSeal), and
--     a super admin countersigns. Every signed version is kept and can't be
--     changed or deleted.
--   * Once countersigned, the agent sends their contracting info (SSN,
--     banking, driver's license, E&O, AML, background questions). It is
--     encrypted on their phone with BIG's public key before it's sent. The
--     database only ever holds scrambled text; the key that unscrambles it
--     lives only in the "contracting" edge function's secrets.
--   * Only the contracting team (super admins you add) can open it, only
--     after two-step login, one field at a time, and every view and copy is
--     logged.
--   * It's deleted when a super admin marks it entered in SureLC, when the
--     agent withdraws it, or automatically 72 hours after it was sent.
--
-- Nothing changes for anyone until a super admin finishes setup and turns
-- contracting on (Team & admin -> Profiles -> Contracting -> Setup).
--
-- Run this in the Supabase SQL Editor (New query -> paste -> Run) BEFORE
-- merging the website change. Safe to run more than once. It runs as one
-- piece: if anything stops it, nothing is changed.

begin;

-- 1) Two-step login --------------------------------------------------------------
-- True when this sign-in passed two-step login (an authenticator code) in the
-- last 12 hours.
create or replace function public.pl_aal2() returns boolean
language sql stable set search_path = public as $$
  select case
    when coalesce(auth.jwt()->>'aal', '') <> 'aal2' then false
    when jsonb_typeof(auth.jwt()->'amr') is distinct from 'array' then false
    else exists (
      select 1 from jsonb_array_elements(auth.jwt()->'amr') a
       where a->>'method' = 'totp'
         and coalesce(nullif(a->>'timestamp', '')::bigint, 0) > extract(epoch from now())::bigint - 12 * 3600)
  end;
$$;

-- 2) The contracting team --------------------------------------------------------
create table if not exists public.contracting_staff (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now()
);
alter table public.contracting_staff enable row level security;
revoke all on public.contracting_staff from anon, authenticated;

create or replace function public.pl_is_contracting_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.contracting_staff s join public.profiles p on p.id = s.user_id
     where s.user_id = auth.uid() and p.role = 'super_admin');
$$;

-- Stops unless the caller is on the contracting team and passed two-step login.
create or replace function public.pl_contracting_check() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if not public.pl_is_contracting_staff() then raise exception 'not_contracting_staff'; end if;
  if not public.pl_aal2() then raise exception 'two_step_required'; end if;
end;
$$;

-- 3) Settings (one row) ----------------------------------------------------------
create table if not exists public.contracting_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  paused boolean not null default false,
  public_key jsonb,
  key_id text,
  key_set_at timestamptz,
  key_set_by uuid references public.profiles(id) on delete set null,
  key_verified_at timestamptz,
  agreement_version text,
  docuseal_template_id bigint,
  last_review_at timestamptz,
  last_review_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.contracting_settings (id) values (true) on conflict (id) do nothing;
alter table public.contracting_settings enable row level security;
revoke all on public.contracting_settings from anon;
revoke insert, update, delete on public.contracting_settings from authenticated;
drop policy if exists "contracting settings: signed-in people read" on public.contracting_settings;
create policy "contracting settings: signed-in people read" on public.contracting_settings
  for select to authenticated using (true);

-- 4) Signed producer agreements (kept for good) ----------------------------------
create table if not exists public.producer_agreements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  version text not null,
  election text check (election is null or election in ('Exclusive', 'Non-Exclusive')),
  docuseal_submission_id bigint not null unique,
  docuseal_template_id bigint,
  agent_submitter_id bigint,
  big_submitter_id bigint,
  status text not null default 'sent' check (status in ('sent', 'agent_signed', 'completed', 'declined', 'voided')),
  agent_name text not null,
  agent_email text not null,
  agent_signed_at timestamptz,
  countersigned_at timestamptz,
  countersigned_by uuid references public.profiles(id) on delete set null,
  countersigner_name text,
  countersign_notified_at timestamptz,
  pdf_path text,
  pdf_sha256 text,
  audit_path text,
  audit_sha256 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists producer_agreements_user_idx on public.producer_agreements (user_id, created_at desc);
alter table public.producer_agreements enable row level security;
revoke all on public.producer_agreements from anon;
revoke insert, update, delete on public.producer_agreements from authenticated;
drop policy if exists "producer agreements: yours, or super admins" on public.producer_agreements;
create policy "producer agreements: yours, or super admins" on public.producer_agreements
  for select to authenticated using (user_id = auth.uid() or public.pl_admin_of(user_id));

-- A completed agreement can't be changed, and no agreement can be deleted.
create or replace function public.producer_agreements_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Signed agreements are kept. They can''t be deleted.';
  end if;
  if old.status = 'completed'
     and (to_jsonb(new) - 'user_id' - 'updated_at') is distinct from (to_jsonb(old) - 'user_id' - 'updated_at') then
    raise exception 'A completed agreement can''t be changed.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists producer_agreements_guard on public.producer_agreements;
create trigger producer_agreements_guard before update or delete on public.producer_agreements
  for each row execute function public.producer_agreements_guard();

-- Signed PDFs and audit certificates. Only the edge function writes here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agreements', 'agreements', false, 20971520, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "agreements: yours, or super admins" on storage.objects;
create policy "agreements: yours, or super admins" on storage.objects for select to authenticated
  using (case
    when bucket_id <> 'agreements' then false
    when (storage.foldername(name))[1] = auth.uid()::text then true
    when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.pl_admin_of(((storage.foldername(name))[1])::uuid)
    else false end);

-- 5) Where each agent is in contracting -------------------------------------------
create table if not exists public.contracting_cases (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  info_sent_at timestamptz,
  expires_at timestamptz,
  notified_at timestamptz,
  info_deleted_at timestamptz,
  delete_reason text check (delete_reason is null or delete_reason in ('entered', 'withdrawn', 'expired', 'kill_switch')),
  entered_at timestamptz,
  entered_by uuid references public.profiles(id) on delete set null,
  review_sent_at timestamptz,
  agent_signed_at timestamptz,
  sent_to_carrier_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.contracting_cases enable row level security;
revoke all on public.contracting_cases from anon;
revoke insert, update, delete on public.contracting_cases from authenticated;
drop policy if exists "contracting cases: yours, or the contracting team" on public.contracting_cases;
create policy "contracting cases: yours, or the contracting team" on public.contracting_cases
  for select to authenticated using (user_id = auth.uid() or (public.pl_is_contracting_staff() and public.pl_aal2()));

-- 6) The encrypted info. Nobody signed in can read these tables directly: only
--    the functions below and the edge function. ---------------------------------
create table if not exists public.contracting_secrets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  key_id text not null,
  wrapped_key text not null check (char_length(wrapped_key) between 100 and 2000),
  fields jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table if not exists public.contracting_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.contracting_secrets(user_id) on delete cascade,
  kind text not null check (kind in ('dl_front', 'eo_certificate', 'aml_certificate', 'background_doc')),
  mime text not null check (mime in ('image/jpeg', 'image/png', 'application/pdf')),
  size integer not null check (size between 1 and 4194304),
  name jsonb not null,
  iv text not null check (char_length(iv) between 12 and 32),
  ct text not null check (char_length(ct) between 16 and 5600000),
  created_at timestamptz not null default now()
);
create index if not exists contracting_files_user_idx on public.contracting_files (user_id);
alter table public.contracting_secrets enable row level security;
alter table public.contracting_files enable row level security;
revoke all on public.contracting_secrets from anon, authenticated;
revoke all on public.contracting_files from anon, authenticated;

-- 7) The access log: who did what, never the data itself. Rows can't be
--    changed or deleted. ------------------------------------------------------------
create table if not exists public.contracting_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  agent_name text,
  actor_id uuid,
  actor_name text,
  action text not null check (char_length(action) <= 40),
  detail text check (detail is null or char_length(detail) <= 200),
  at timestamptz not null default now()
);
create index if not exists contracting_log_user_idx on public.contracting_log (user_id, at desc);
alter table public.contracting_log enable row level security;
revoke all on public.contracting_log from anon;
revoke insert, update, delete on public.contracting_log from authenticated;
drop policy if exists "contracting log: the contracting team" on public.contracting_log;
create policy "contracting log: the contracting team" on public.contracting_log
  for select to authenticated using (public.pl_is_contracting_staff() and public.pl_aal2());
create or replace function public.contracting_log_guard() returns trigger
language plpgsql as $$
begin
  raise exception 'The contracting log can''t be changed.';
end;
$$;
drop trigger if exists contracting_log_guard on public.contracting_log;
create trigger contracting_log_guard before update or delete on public.contracting_log
  for each row execute function public.contracting_log_guard();

create or replace function public.pl_contracting_log(p_user uuid, p_action text, p_detail text default null)
returns void
language sql security definer set search_path = public as $$
  insert into public.contracting_log (user_id, agent_name, actor_id, actor_name, action, detail)
  values (p_user, (select display_name from public.profiles where id = p_user), auth.uid(),
          (select display_name from public.profiles where id = auth.uid()), p_action, left(p_detail, 200));
$$;
revoke all on function public.pl_contracting_log(uuid, text, text) from public, anon, authenticated;

create or replace function public.pl_central_today() returns date
language sql stable as $$ select (now() at time zone 'America/Chicago')::date; $$;

-- 8) Deleting the info -----------------------------------------------------------
-- Deletes an agent's encrypted info and records why. A submission that never
-- reached SureLC also clears "contracting info sent" on their licensing path,
-- so they can send it again.
create or replace function public.pl_contracting_delete(p_user uuid, p_reason text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  was_submitted boolean;
begin
  select submitted_at is not null into was_submitted from public.contracting_secrets where user_id = p_user;
  if not found then return false; end if;
  delete from public.contracting_secrets where user_id = p_user;
  if was_submitted then
    update public.contracting_cases
       set info_deleted_at = now(), delete_reason = p_reason, updated_at = now(),
           entered_at = case when p_reason = 'entered' then now() else entered_at end,
           entered_by = case when p_reason = 'entered' then auth.uid() else entered_by end
     where user_id = p_user;
    if p_reason <> 'entered' then
      update public.licensing_progress set profile_submitted_on = null where user_id = p_user;
    end if;
  end if;
  return was_submitted;
end;
$$;
revoke all on function public.pl_contracting_delete(uuid, text) from public, anon, authenticated;

-- Run every 10 minutes (below): deletes anything past its time. Drafts that
-- were never sent go after 2 hours; sent info after 72 hours.
create or replace function public.contracting_purge_expired()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n integer := 0;
begin
  for r in select user_id, submitted_at from public.contracting_secrets where expires_at <= now() loop
    if r.submitted_at is not null then
      perform public.pl_contracting_delete(r.user_id, 'expired');
      insert into public.contracting_log (user_id, agent_name, action, detail)
      values (r.user_id, (select display_name from public.profiles where id = r.user_id), 'expired', 'Deleted automatically 72 hours after it was sent');
    else
      delete from public.contracting_secrets where user_id = r.user_id;
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.contracting_purge_expired() from public, anon, authenticated;

do $do$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'PaceLedger: pg_cron is not available (%). Info still can''t be opened after 72 hours; it is deleted the next time anyone opens contracting.', sqlerrm;
end
$do$;
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'pl-contracting-purge';
    perform cron.schedule('pl-contracting-purge', '*/10 * * * *', 'select public.contracting_purge_expired()');
  end if;
end
$do$;

-- 9) Agents: sending and withdrawing ---------------------------------------------
create or replace function public.pl_contracting_field_ok(p_key text, p_val jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(p_val) = 'object'
     and jsonb_typeof(p_val->'iv') = 'string' and char_length(p_val->>'iv') between 12 and 32
     and jsonb_typeof(p_val->'ct') = 'string'
     and char_length(p_val->>'ct') between 16 and case when p_key = 'background' then 80000 else 4000 end;
$$;

-- Step 1 of sending: the agent's wrapped key. Starts a fresh draft.
create or replace function public.contracting_start(p_key_id text, p_wrapped_key text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  s public.contracting_settings;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  select * into s from public.contracting_settings where id;
  if not s.enabled then raise exception 'contracting_off'; end if;
  if s.paused then raise exception 'contracting_paused'; end if;
  if s.key_id is null or p_key_id is distinct from s.key_id then raise exception 'key_changed'; end if;
  if not exists (select 1 from public.producer_agreements where user_id = me and status = 'completed') then
    raise exception 'agreement_not_countersigned';
  end if;
  if exists (select 1 from public.contracting_secrets where user_id = me and submitted_at is not null) then
    raise exception 'already_sent';
  end if;
  if p_wrapped_key is null or char_length(p_wrapped_key) not between 100 and 2000 then raise exception 'bad_key'; end if;
  delete from public.contracting_secrets where user_id = me;
  insert into public.contracting_secrets (user_id, key_id, wrapped_key, expires_at)
  values (me, p_key_id, p_wrapped_key, now() + interval '2 hours');
end;
$$;

-- Step 2: each file (already encrypted on the phone), one at a time.
create or replace function public.contracting_put_file(p_kind text, p_mime text, p_size integer, p_name jsonb, p_iv text, p_ct text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  new_id uuid;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from public.contracting_secrets where user_id = me and submitted_at is null and expires_at > now()) then
    raise exception 'no_draft';
  end if;
  if p_kind not in ('dl_front', 'eo_certificate', 'aml_certificate', 'background_doc') then raise exception 'bad_file'; end if;
  if not public.pl_contracting_field_ok('file', p_name) then raise exception 'bad_file'; end if;
  if (select count(*) from public.contracting_files where user_id = me) >= 10 then raise exception 'too_many_files'; end if;
  if p_kind <> 'background_doc' and exists (select 1 from public.contracting_files where user_id = me and kind = p_kind) then
    raise exception 'too_many_files';
  end if;
  if coalesce((select sum(size) from public.contracting_files where user_id = me), 0) + coalesce(p_size, 0) > 20971520 then
    raise exception 'files_too_big';
  end if;
  insert into public.contracting_files (user_id, kind, mime, size, name, iv, ct)
  values (me, p_kind, p_mime, p_size, p_name, p_iv, p_ct)
  returning id into new_id;
  return new_id;
end;
$$;

-- Step 3: the fields. Sends it: the 72 hours start now.
create or replace function public.contracting_submit(p_fields jsonb)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  k text;
  v jsonb;
  allowed text[] := array['first_name', 'middle_name', 'last_name', 'ssn', 'dob', 'gender', 'email', 'phone',
    'street', 'city', 'state', 'zip', 'dl_number', 'dl_state', 'dl_expires',
    'bank_name', 'account_type', 'routing', 'account',
    'eo_has', 'eo_carrier', 'eo_policy', 'eo_amount', 'eo_expires',
    'aml_done', 'aml_provider', 'aml_date', 'background'];
  required text[] := array['first_name', 'last_name', 'ssn', 'dob', 'gender', 'email', 'phone',
    'street', 'city', 'state', 'zip', 'dl_number', 'dl_state', 'dl_expires',
    'bank_name', 'account_type', 'routing', 'account', 'eo_has', 'aml_done', 'background'];
  until_at timestamptz := now() + interval '72 hours';
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if (select paused from public.contracting_settings where id) then raise exception 'contracting_paused'; end if;
  if not exists (select 1 from public.contracting_secrets where user_id = me and submitted_at is null and expires_at > now()) then
    raise exception 'no_draft';
  end if;
  if jsonb_typeof(p_fields) <> 'object' then raise exception 'bad_fields'; end if;
  for k, v in select * from jsonb_each(p_fields) loop
    if not (k = any(allowed)) or not public.pl_contracting_field_ok(k, v) then raise exception 'bad_fields'; end if;
  end loop;
  foreach k in array required loop
    if not (p_fields ? k) then raise exception 'missing_fields'; end if;
  end loop;

  update public.contracting_secrets
     set fields = p_fields, submitted_at = now(), expires_at = until_at
   where user_id = me;

  insert into public.contracting_cases (user_id, info_sent_at, expires_at)
  values (me, now(), until_at)
  on conflict (user_id) do update
     set info_sent_at = now(), expires_at = until_at, notified_at = null, info_deleted_at = null, delete_reason = null,
         entered_at = null, entered_by = null, review_sent_at = null, agent_signed_at = null, sent_to_carrier_at = null,
         updated_at = now();

  insert into public.licensing_progress (user_id) values (me) on conflict (user_id) do nothing;
  update public.licensing_progress
     set profile_submitted_on = public.pl_central_today(),
         contracting_sent_on = coalesce(contracting_sent_on, public.pl_central_today())
   where user_id = me;

  perform public.pl_contracting_log(me, 'sent', 'Sent contracting info, encrypted on their device');
  return until_at;
end;
$$;

-- Throws away a draft that didn't finish sending.
create or replace function public.contracting_discard_draft()
returns void
language sql security definer set search_path = public as $$
  delete from public.contracting_secrets where user_id = auth.uid() and submitted_at is null;
$$;

create or replace function public.contracting_withdraw()
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if not public.pl_contracting_delete(me, 'withdrawn') then return false; end if;
  perform public.pl_contracting_log(me, 'withdrawn', 'Withdrew their info; it was deleted');
  return true;
end;
$$;

-- 10) The contracting team --------------------------------------------------------
-- Counts for the badge on Profiles. No two-step login needed: no names or data.
create or replace function public.contracting_counts()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pl_is_contracting_staff() then return null; end if;
  return jsonb_build_object(
    'countersign', (select count(*) from public.producer_agreements a
                     where a.status = 'agent_signed'
                       and a.created_at = (select max(b.created_at) from public.producer_agreements b where b.user_id = a.user_id)),
    'to_enter', (select count(*) from public.contracting_secrets where submitted_at is not null and expires_at > now()),
    'oldest_expires_at', (select min(expires_at) from public.contracting_secrets where submitted_at is not null and expires_at > now()));
end;
$$;

create or replace function public.contracting_queue()
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.pl_contracting_check();
  perform public.contracting_purge_expired();
  return coalesce((
    select jsonb_agg(row_to_json(q) order by q.sort_key, q.sort_time)
    from (
      select p.id as user_id, p.display_name as name, p.npn,
             ss.short_name as solar_system,
             up.display_name as upline,
             a.id as agreement_id, a.status as agreement_status, a.version, a.election,
             a.agent_signed_at, a.countersigned_at,
             c.info_sent_at, c.info_deleted_at, c.delete_reason, c.entered_at, c.review_sent_at, c.agent_signed_at as surelc_signed_at, c.sent_to_carrier_at,
             s.expires_at, (s.user_id is not null) as has_info,
             (select count(*) from public.contracting_files f where f.user_id = s.user_id) as files,
             p.fg_writing_number is not null and p.fg_writing_number <> '' as has_writing_number,
             case
               when s.user_id is not null then 0
               when a.status = 'agent_signed' then 1
               when c.entered_at is not null and c.sent_to_carrier_at is null then 2
               when a.status = 'completed' and c.info_sent_at is null then 3
               when a.status = 'sent' then 4
               else 5 end as sort_key,
             coalesce(s.expires_at, a.agent_signed_at, c.entered_at, a.created_at) as sort_time
        from public.profiles p
        left join lateral (select * from public.producer_agreements x where x.user_id = p.id order by x.created_at desc limit 1) a on true
        left join public.contracting_cases c on c.user_id = p.id
        left join public.contracting_secrets s on s.user_id = p.id and s.submitted_at is not null
        left join public.solar_systems ss on ss.id = p.solar_system_id
        left join public.profiles up on up.id = p.manager_id
       where a.id is not null or c.user_id is not null
    ) q), '[]'::jsonb);
end;
$$;

-- One agent's record: what's there, never the values. Opening it is logged.
create or replace function public.contracting_case(p_user uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  sec public.contracting_secrets;
begin
  perform public.pl_contracting_check();
  perform public.contracting_purge_expired();
  select * into sec from public.contracting_secrets where user_id = p_user and submitted_at is not null;
  if found and not exists (
    select 1 from public.contracting_log
     where user_id = p_user and actor_id = me and action = 'opened' and at > now() - interval '10 minutes') then
    perform public.pl_contracting_log(p_user, 'opened', 'Opened their contracting info');
  end if;
  return jsonb_build_object(
    'person', (select jsonb_build_object('id', p.id, 'name', p.display_name, 'npn', p.npn, 'email', u.email,
                      'solar_system', ss.short_name, 'upline', up.display_name, 'writing_number', p.fg_writing_number)
                 from public.profiles p left join auth.users u on u.id = p.id
                 left join public.solar_systems ss on ss.id = p.solar_system_id
                 left join public.profiles up on up.id = p.manager_id
                where p.id = p_user),
    'agreements', coalesce((select jsonb_agg(to_jsonb(a) - 'agent_submitter_id' - 'big_submitter_id' order by a.created_at desc)
                              from public.producer_agreements a where a.user_id = p_user), '[]'::jsonb),
    'case', (select to_jsonb(c) from public.contracting_cases c where c.user_id = p_user),
    'info', case when sec.user_id is null then null else jsonb_build_object(
              'sent_at', sec.submitted_at, 'expires_at', sec.expires_at, 'key_id', sec.key_id,
              'fields', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb) from jsonb_object_keys(sec.fields) k),
              'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'mime', f.mime, 'size', f.size) order by f.kind, f.created_at), '[]'::jsonb)
                          from public.contracting_files f where f.user_id = p_user)) end,
    'log', (select coalesce(jsonb_agg(jsonb_build_object('at', l.at, 'actor', l.actor_name, 'action', l.action, 'detail', l.detail) order by l.at desc), '[]'::jsonb)
              from (select * from public.contracting_log where user_id = p_user order by at desc limit 100) l));
end;
$$;

create or replace function public.contracting_mark_entered(p_user uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.pl_contracting_check();
  if not public.pl_contracting_delete(p_user, 'entered') then raise exception 'nothing_to_enter'; end if;
  perform public.pl_contracting_log(p_user, 'entered', 'Marked entered in SureLC; the info was deleted');
  return (select to_jsonb(c) from public.contracting_cases c where c.user_id = p_user);
end;
$$;

-- The steps after SureLC: 'review_sent', 'agent_signed', 'sent_to_carrier'.
-- p_on false takes the step back (to fix a mis-click).
create or replace function public.contracting_mark_step(p_user uuid, p_step text, p_on boolean default true)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.contracting_cases;
begin
  perform public.pl_contracting_check();
  select * into c from public.contracting_cases where user_id = p_user;
  if not found or c.entered_at is null then raise exception 'not_entered_yet'; end if;
  if p_step = 'review_sent' then
    if not p_on and c.agent_signed_at is not null then raise exception 'undo_later_step_first'; end if;
    update public.contracting_cases set review_sent_at = case when p_on then coalesce(review_sent_at, now()) end, updated_at = now() where user_id = p_user;
  elsif p_step = 'agent_signed' then
    if p_on and c.review_sent_at is null then raise exception 'earlier_step_first'; end if;
    if not p_on and c.sent_to_carrier_at is not null then raise exception 'undo_later_step_first'; end if;
    update public.contracting_cases set agent_signed_at = case when p_on then coalesce(agent_signed_at, now()) end, updated_at = now() where user_id = p_user;
  elsif p_step = 'sent_to_carrier' then
    if p_on and c.agent_signed_at is null then raise exception 'earlier_step_first'; end if;
    update public.contracting_cases set sent_to_carrier_at = case when p_on then coalesce(sent_to_carrier_at, now()) end, updated_at = now() where user_id = p_user;
  else
    raise exception 'unknown_step';
  end if;
  perform public.pl_contracting_log(p_user, case when p_on then p_step else 'undo_' || p_step end, null);
  return (select to_jsonb(x) from public.contracting_cases x where x.user_id = p_user);
end;
$$;

-- Kill switch: deletes every pending submission and pauses the form.
create or replace function public.contracting_kill_switch()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n integer := 0;
begin
  perform public.pl_contracting_check();
  for r in select user_id, submitted_at from public.contracting_secrets loop
    if r.submitted_at is not null then
      perform public.pl_contracting_delete(r.user_id, 'kill_switch');
      perform public.pl_contracting_log(r.user_id, 'kill_switch', 'Deleted by the kill switch');
      n := n + 1;
    else
      delete from public.contracting_secrets where user_id = r.user_id;
    end if;
  end loop;
  update public.contracting_settings set paused = true, updated_at = now() where id;
  perform public.pl_contracting_log(null, 'kill_switch', format('Kill switch: deleted %s submission(s) and paused the form', n));
  return n;
end;
$$;

-- 11) Setup (contracting team only) -----------------------------------------------
create or replace function public.contracting_set_paused(p_paused boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.pl_contracting_check();
  update public.contracting_settings set paused = p_paused, updated_at = now() where id;
  perform public.pl_contracting_log(null, case when p_paused then 'paused' else 'unpaused' end, null);
end;
$$;

create or replace function public.contracting_set_enabled(p_enabled boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.contracting_settings;
begin
  perform public.pl_contracting_check();
  select * into s from public.contracting_settings where id;
  if p_enabled and (s.key_id is null or s.key_verified_at is null) then raise exception 'key_not_ready'; end if;
  if p_enabled and (s.agreement_version is null or s.docuseal_template_id is null) then raise exception 'agreement_not_ready'; end if;
  update public.contracting_settings set enabled = p_enabled, updated_at = now() where id;
  perform public.pl_contracting_log(null, case when p_enabled then 'turned_on' else 'turned_off' end, null);
end;
$$;

-- A new encryption key pair is made in the browser; only its public half
-- comes here. Not allowed while any info is waiting (it would become
-- unreadable).
create or replace function public.contracting_set_key(p_public_key jsonb, p_key_id text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.pl_contracting_check();
  if exists (select 1 from public.contracting_secrets) then raise exception 'info_pending'; end if;
  if jsonb_typeof(p_public_key) <> 'object' or p_public_key->>'kty' <> 'RSA' or p_public_key->>'alg' <> 'RSA-OAEP-256'
     or char_length(coalesce(p_public_key->>'n', '')) < 340 or p_public_key ? 'd' then
    raise exception 'bad_key';
  end if;
  if p_key_id !~ '^[0-9a-f]{16}$' then raise exception 'bad_key'; end if;
  update public.contracting_settings
     set public_key = p_public_key, key_id = p_key_id, key_set_at = now(), key_set_by = auth.uid(), key_verified_at = null,
         enabled = false, updated_at = now()
   where id;
  perform public.pl_contracting_log(null, 'new_key', 'Made a new encryption key ' || p_key_id);
end;
$$;

create or replace function public.contracting_set_agreement(p_version text, p_template_id bigint)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.pl_contracting_check();
  if p_version !~ '^[A-Za-z0-9][A-Za-z0-9 ._-]{1,40}$' then raise exception 'bad_version'; end if;
  if p_template_id is null or p_template_id <= 0 then raise exception 'bad_template'; end if;
  update public.contracting_settings set agreement_version = p_version, docuseal_template_id = p_template_id, updated_at = now() where id;
  perform public.pl_contracting_log(null, 'agreement', format('Agreement version %s, DocuSeal template %s', p_version, p_template_id));
end;
$$;

-- Super admins and whether each is on the contracting team. The very first
-- person can be added by any super admin with two-step login; after that,
-- only the team can change the team.
create or replace function public.pl_contracting_team_check() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from public.contracting_staff) then
    perform public.pl_contracting_check();
  else
    if not public.pl_is_galaxy_admin() then raise exception 'not_contracting_staff'; end if;
    if not public.pl_aal2() then raise exception 'two_step_required'; end if;
  end if;
end;
$$;

create or replace function public.contracting_staff_list()
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.pl_contracting_team_check();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'on', s.user_id is not null) order by p.display_name)
      from public.profiles p left join public.contracting_staff s on s.user_id = p.id
     where p.role = 'super_admin'), '[]'::jsonb);
end;
$$;

create or replace function public.contracting_set_staff(p_user uuid, p_on boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.pl_contracting_team_check();
  if p_on then
    if not exists (select 1 from public.profiles where id = p_user and role = 'super_admin') then raise exception 'super_admins_only'; end if;
    insert into public.contracting_staff (user_id, added_by) values (p_user, auth.uid()) on conflict (user_id) do nothing;
  else
    delete from public.contracting_staff where user_id = p_user;
  end if;
  perform public.pl_contracting_log(null, case when p_on then 'staff_added' else 'staff_removed' end,
    (select display_name from public.profiles where id = p_user));
end;
$$;

create or replace function public.contracting_mark_reviewed()
returns timestamptz
language plpgsql security definer set search_path = public as $$
begin
  perform public.pl_contracting_check();
  update public.contracting_settings set last_review_at = now(), last_review_by = auth.uid(), updated_at = now() where id;
  perform public.pl_contracting_log(null, 'access_review', 'Reviewed the contracting team and the access log');
  return now();
end;
$$;

-- The team-wide log (setup changes, kill switch, reviews).
create or replace function public.contracting_admin_log()
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.pl_contracting_check();
  return coalesce((
    select jsonb_agg(jsonb_build_object('at', l.at, 'agent', l.agent_name, 'actor', l.actor_name, 'action', l.action, 'detail', l.detail) order by l.at desc)
      from (select * from public.contracting_log order by at desc limit 300) l), '[]'::jsonb);
end;
$$;

-- 12) Who can call what -----------------------------------------------------------
do $do$
declare f text;
begin
  foreach f in array array[
    'pl_aal2()', 'pl_is_contracting_staff()', 'pl_contracting_check()', 'pl_contracting_team_check()',
    'contracting_start(text, text)', 'contracting_put_file(text, text, integer, jsonb, text, text)', 'contracting_submit(jsonb)',
    'contracting_discard_draft()', 'contracting_withdraw()', 'contracting_counts()', 'contracting_queue()', 'contracting_case(uuid)',
    'contracting_mark_entered(uuid)', 'contracting_mark_step(uuid, text, boolean)', 'contracting_kill_switch()',
    'contracting_set_paused(boolean)', 'contracting_set_enabled(boolean)', 'contracting_set_key(jsonb, text)',
    'contracting_set_agreement(text, bigint)', 'contracting_staff_list()', 'contracting_set_staff(uuid, boolean)',
    'contracting_mark_reviewed()', 'contracting_admin_log()']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end
$do$;

-- Old flags say "Waiting on InsuraCloud"; the reason is now "Waiting on contracting".
do $do$
begin
  if to_regclass('public.person_flags') is not null then
    update public.person_flags set reason = 'Waiting on contracting' where reason = 'Waiting on InsuraCloud';
  end if;
end
$do$;

commit;
