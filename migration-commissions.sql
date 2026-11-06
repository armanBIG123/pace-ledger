-- Commissions, part 1: receive what Minkoo's commission system sends, and
-- show each person the lines that pay them.
--
-- Minkoo's system calls the commissions-ingest edge function (same JSON it
-- sends InsuraCloud today, with an x-api-key header). The function hands
-- the body to pl_commission_ingest() below, which checks the key, stores
-- every payout ("disbursement") and line, and works out who each one is for.
--
--   * A line pays one person: agentCode, matched to the agent with that
--     NPN (then F&G writing number, then a super admin's manual link).
--     "COMPANY" is the agency's own share.
--   * One premium on one policy makes a line per level; the writing agent
--     is whoever the A line pays. Lines of one premium share the recordId
--     up to its last "~".
--   * rate is in hundredths of a percent (4000 = 40%).
--   * The daily resend of the last 7 days is safe: the same id with the
--     same values changes nothing; with new values (APPROVED -> PROCESSED,
--     paid in a payout) it's updated.
--
-- Who sees what: you, your lines and payouts. Anyone with a team, their
-- whole downline's too. Super admins, everything, including the COMPANY
-- lines, the Unmatched list, the webhook key and the log of calls. Super
-- Managers, everyone in their solar system.
--
-- Run in the Supabase SQL Editor (New query -> paste -> Run) BEFORE merging
-- the website change. Safe to run more than once.

begin;

-- pgcrypto (Supabase keeps it in the "extensions" schema) for the key.
create extension if not exists pgcrypto with schema extensions;

-- 1) Payouts --------------------------------------------------------------
create table if not exists public.commission_disbursements (
  record_id text primary key,
  disbursed_date date,
  agent_code text not null,
  user_id uuid references public.profiles(id) on delete set null,
  amount numeric(14,4) not null default 0,
  positive_amount numeric(14,4),
  negative_amount numeric(14,4),
  ledger_count integer,
  status text,
  processed_at timestamptz,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists commission_disb_user_idx on public.commission_disbursements (user_id, disbursed_date desc);
create index if not exists commission_disb_code_idx on public.commission_disbursements (agent_code);

-- 2) Lines ------------------------------------------------------------------
create table if not exists public.commission_lines (
  record_id text primary key,
  event_id text not null,             -- one premium on one policy
  level text,                         -- A, FA, SA ... EVC, GEN1 ... GEN6
  disbursement_record_id text,        -- the payout it was paid in (null: not yet)
  paid_on date,                       -- that payout's date
  agent_code text not null,           -- who it pays ('COMPANY': the agency)
  user_id uuid references public.profiles(id) on delete set null,
  writer_code text,                   -- who the A line pays: the writing agent
  writer_user_id uuid references public.profiles(id) on delete set null,
  amount numeric(14,4) not null,
  rate numeric(12,4),                 -- hundredths of a percent
  type text,
  label text,
  carrier text,
  policy_number text,
  insured_name text,
  status text,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists commission_lines_user_idx on public.commission_lines (user_id, paid_on desc);
create index if not exists commission_lines_event_idx on public.commission_lines (event_id);
create index if not exists commission_lines_disb_idx on public.commission_lines (disbursement_record_id);
create index if not exists commission_lines_code_idx on public.commission_lines (agent_code);
create index if not exists commission_lines_writer_idx on public.commission_lines (writer_code);

-- 3) Codes a super admin linked by hand -------------------------------------
create table if not exists public.commission_agent_links (
  agent_code text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  linked_by uuid,
  linked_at timestamptz not null default now()
);

-- 4) Every call, for the super admins' log ----------------------------------
create table if not exists public.commission_receipts (
  id bigserial primary key,
  received_at timestamptz not null default now(),
  disbursements integer not null default 0,
  lines integer not null default 0,
  new_rows integer not null default 0,
  updated_rows integer not null default 0,
  unchanged_rows integer not null default 0,
  rejected integer not null default 0,
  problems jsonb
);

-- 5) The webhook key: only its hash is kept ---------------------------------
create table if not exists public.commission_settings (
  id integer primary key check (id = 1),
  key_hash text,
  key_hint text,
  key_made_by uuid,
  key_made_at timestamptz
);

-- 6) Who can read what -------------------------------------------------------
alter table public.commission_disbursements enable row level security;
alter table public.commission_lines enable row level security;
alter table public.commission_agent_links enable row level security;
alter table public.commission_receipts enable row level security;
alter table public.commission_settings enable row level security;

drop policy if exists "commissions: who can see" on public.commission_lines;
create policy "commissions: who can see" on public.commission_lines for select to authenticated
  using (user_id = auth.uid()
         or user_id in (select public.my_downline_ids())
         or public.pl_is_galaxy_admin()
         or (user_id is not null and public.pl_admin_of(user_id)));
drop policy if exists "commissions: who can see" on public.commission_disbursements;
create policy "commissions: who can see" on public.commission_disbursements for select to authenticated
  using (user_id = auth.uid()
         or user_id in (select public.my_downline_ids())
         or public.pl_is_galaxy_admin()
         or (user_id is not null and public.pl_admin_of(user_id)));
drop policy if exists "commissions: super admins" on public.commission_agent_links;
create policy "commissions: super admins" on public.commission_agent_links for select to authenticated
  using (public.pl_is_galaxy_admin());
drop policy if exists "commissions: super admins" on public.commission_receipts;
create policy "commissions: super admins" on public.commission_receipts for select to authenticated
  using (public.pl_is_galaxy_admin());
-- commission_settings: no policy, so nobody reads the hash (status comes
-- from pl_commission_status). Changes only through the functions below.
revoke insert, update, delete on public.commission_disbursements, public.commission_lines,
  public.commission_agent_links, public.commission_receipts, public.commission_settings from public, anon, authenticated;
grant select on public.commission_disbursements, public.commission_lines, public.commission_agent_links, public.commission_receipts to authenticated;

-- 7) Helpers -----------------------------------------------------------------
-- Text to a number, or null if it isn't one ("73.2487", 500, "-28.8").
create or replace function public.pl_commission_num(p text)
returns numeric language plpgsql immutable as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  return btrim(p)::numeric;
exception when others then
  return null;
end;
$$;

-- Who a code is: a super admin's link, else the one agent with that NPN,
-- else the one with that F&G writing number. COMPANY and unknown: null.
create or replace function public.pl_commission_user(p_code text)
returns uuid language sql stable security definer set search_path = public as $$
  select case when p_code is null or upper(p_code) = 'COMPANY' then null else coalesce(
    (select l.user_id from public.commission_agent_links l where l.agent_code = p_code),
    (select case when count(*) = 1 then min(p.id::text)::uuid end from public.profiles p
       where nullif(regexp_replace(coalesce(p.npn, ''), '[^0-9]', '', 'g'), '') = p_code),
    (select case when count(*) = 1 then min(p.id::text)::uuid end from public.profiles p
       where upper(btrim(coalesce(p.fg_writing_number, ''))) = upper(p_code) and btrim(coalesce(p.fg_writing_number, '')) <> '')
  ) end;
$$;

-- 8) Receiving a call ----------------------------------------------------------
-- p_key: the x-api-key header. p_body: the JSON as sent, with
-- "disbursements" and "ledgers" (or "ledger"); agentCode (or carrierCode).
-- Only the edge function (service role) can call this.
create or replace function public.pl_commission_ingest(p_key text, p_body jsonb)
returns jsonb
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_hash text;
  d jsonb;
  l jsonb;
  v_lines jsonb;
  v_id text;
  v_code text;
  v_amount numeric;
  v_date date;
  v_inserted boolean;
  n_disb integer := 0;
  n_lines integer := 0;
  n_new integer := 0;
  n_upd integer := 0;
  n_same integer := 0;
  bad jsonb := '[]'::jsonb;
  events text[] := '{}';
  codes text[] := '{}';
begin
  select key_hash into v_hash from public.commission_settings where id = 1;
  if v_hash is null then
    raise exception 'no_key';
  end if;
  if p_key is null or encode(digest(p_key, 'sha256'), 'hex') <> v_hash then
    raise exception 'bad_key';
  end if;
  if p_body is null or jsonb_typeof(p_body) <> 'object' then
    raise exception 'bad_body';
  end if;
  v_lines := coalesce(p_body->'ledgers', p_body->'ledger', '[]'::jsonb);
  if jsonb_typeof(coalesce(p_body->'disbursements', '[]'::jsonb)) <> 'array' or jsonb_typeof(v_lines) <> 'array' then
    raise exception 'bad_body';
  end if;
  if jsonb_array_length(coalesce(p_body->'disbursements', '[]'::jsonb)) + jsonb_array_length(v_lines) > 5000 then
    raise exception 'too_many';
  end if;

  -- Payouts
  for d in select value from jsonb_array_elements(coalesce(p_body->'disbursements', '[]'::jsonb)) loop
    v_id := nullif(btrim(coalesce(d->>'recordId', '')), '');
    v_code := nullif(btrim(coalesce(d->>'agentCode', d->>'carrierCode', '')), '');
    v_amount := public.pl_commission_num(d->>'amountOriginal');
    begin
      v_date := nullif(btrim(coalesce(d->>'disbursedDate', '')), '')::date;
    exception when others then
      v_date := null;
    end;
    if v_id is null or v_code is null or v_amount is null or char_length(v_id) > 200 then
      bad := bad || jsonb_build_object('kind', 'disbursement', 'recordId', left(coalesce(v_id, ''), 200),
        'problem', case when v_id is null then 'no recordId' when v_code is null then 'no agentCode' else 'amountOriginal is not a number' end);
      continue;
    end if;
    n_disb := n_disb + 1;
    codes := codes || v_code;
    insert into public.commission_disbursements as t (record_id, disbursed_date, agent_code, user_id, amount, positive_amount,
      negative_amount, ledger_count, status, processed_at)
    values (v_id, v_date, v_code, public.pl_commission_user(v_code), v_amount, public.pl_commission_num(d->>'positiveAmount'),
      public.pl_commission_num(d->>'negativeAmount'), public.pl_commission_num(d->>'ledgerCount')::integer,
      upper(nullif(btrim(coalesce(d->>'status', '')), '')),
      case when coalesce(d->>'processedAt', '') ~ '^\d{4}-\d{2}-\d{2}' then (d->>'processedAt')::timestamptz end)
    on conflict (record_id) do update set
      disbursed_date = excluded.disbursed_date, agent_code = excluded.agent_code, user_id = excluded.user_id,
      amount = excluded.amount, positive_amount = excluded.positive_amount, negative_amount = excluded.negative_amount,
      ledger_count = excluded.ledger_count, status = excluded.status, processed_at = excluded.processed_at, updated_at = now()
    where (t.disbursed_date, t.agent_code, t.amount, t.positive_amount, t.negative_amount, t.ledger_count, t.status, t.processed_at)
      is distinct from (excluded.disbursed_date, excluded.agent_code, excluded.amount, excluded.positive_amount,
                        excluded.negative_amount, excluded.ledger_count, excluded.status, excluded.processed_at)
    returning (xmax = 0) into v_inserted;
    if not found then n_same := n_same + 1; elsif v_inserted then n_new := n_new + 1; else n_upd := n_upd + 1; end if;
    -- Lines that came before their payout get its date now.
    update public.commission_lines set paid_on = v_date, updated_at = now()
     where disbursement_record_id = v_id and paid_on is distinct from v_date and v_date is not null;
  end loop;

  -- Lines
  for l in select value from jsonb_array_elements(v_lines) loop
    v_id := nullif(btrim(coalesce(l->>'recordId', '')), '');
    v_code := nullif(btrim(coalesce(l->>'agentCode', l->>'carrierCode', '')), '');
    v_amount := public.pl_commission_num(l->>'amount');
    if v_id is null or v_code is null or v_amount is null or char_length(v_id) > 200 then
      bad := bad || jsonb_build_object('kind', 'line', 'recordId', left(coalesce(v_id, ''), 200),
        'problem', case when v_id is null then 'no recordId' when v_code is null then 'no agentCode' else 'amount is not a number' end);
      continue;
    end if;
    n_lines := n_lines + 1;
    codes := codes || v_code;
    declare
      v_event text := case when position('~' in v_id) > 0 then regexp_replace(v_id, '~[^~]*$', '') else v_id end;
      v_level text := upper(coalesce(nullif(btrim(coalesce(l->>'commissionLevel', '')), ''), case when position('~' in v_id) > 0 then substring(v_id from '[^~]*$') end));
      v_disb text := nullif(btrim(coalesce(l->>'disbursementRecordId', '')), '');
      v_paid date;
    begin
      events := events || v_event;
      if v_disb is not null then
        select disbursed_date into v_paid from public.commission_disbursements where record_id = v_disb;
        if v_paid is null and v_disb ~ '^\d{4}-\d{2}-\d{2}' then
          begin v_paid := left(v_disb, 10)::date; exception when others then v_paid := null; end;
        end if;
      end if;
      insert into public.commission_lines as t (record_id, event_id, level, disbursement_record_id, paid_on, agent_code, user_id,
        amount, rate, type, label, carrier, policy_number, insured_name, status)
      values (v_id, v_event, v_level, v_disb, v_paid, v_code, public.pl_commission_user(v_code), v_amount,
        public.pl_commission_num(l->>'rate'), upper(nullif(btrim(coalesce(l->>'type', '')), '')), nullif(btrim(coalesce(l->>'label', '')), ''),
        nullif(btrim(coalesce(l->>'carrier', '')), ''), nullif(btrim(coalesce(l->>'policyNumber', '')), ''),
        nullif(btrim(coalesce(l->>'insuredName', '')), ''), upper(nullif(btrim(coalesce(l->>'status', '')), '')))
      on conflict (record_id) do update set
        event_id = excluded.event_id, level = excluded.level, disbursement_record_id = excluded.disbursement_record_id,
        paid_on = excluded.paid_on, agent_code = excluded.agent_code, user_id = excluded.user_id, amount = excluded.amount,
        rate = excluded.rate, type = excluded.type, label = excluded.label, carrier = excluded.carrier,
        policy_number = excluded.policy_number, insured_name = excluded.insured_name, status = excluded.status, updated_at = now()
      where (t.level, t.disbursement_record_id, t.paid_on, t.agent_code, t.amount, t.rate, t.type, t.label, t.carrier,
             t.policy_number, t.insured_name, t.status)
        is distinct from (excluded.level, excluded.disbursement_record_id, excluded.paid_on, excluded.agent_code, excluded.amount,
             excluded.rate, excluded.type, excluded.label, excluded.carrier, excluded.policy_number, excluded.insured_name, excluded.status)
      returning (xmax = 0) into v_inserted;
      if not found then n_same := n_same + 1; elsif v_inserted then n_new := n_new + 1; else n_upd := n_upd + 1; end if;
    end;
  end loop;

  -- The writing agent: whoever the A line of the same premium pays.
  if array_length(events, 1) > 0 then
    update public.commission_lines t
       set writer_code = a.agent_code, writer_user_id = a.user_id
      from public.commission_lines a
     where t.event_id = any(events) and a.event_id = t.event_id and a.level = 'A'
       and (t.writer_code is distinct from a.agent_code or t.writer_user_id is distinct from a.user_id);
  end if;

  insert into public.commission_receipts (disbursements, lines, new_rows, updated_rows, unchanged_rows, rejected, problems)
  values (n_disb, n_lines, n_new, n_upd, n_same, jsonb_array_length(bad),
          case when jsonb_array_length(bad) > 0 then (select jsonb_agg(x) from (select x from jsonb_array_elements(bad) x limit 50) s) end);
  -- Keep the log to its last 2,000 calls.
  delete from public.commission_receipts where id < (select min(id) from (select id from public.commission_receipts order by id desc limit 2000) k);

  -- Same answer shape as InsuraCloud's, plus what changed.
  return jsonb_build_object('success', true, 'disbImported', n_disb, 'ledgerImported', n_lines,
    'new', n_new, 'updated', n_upd, 'unchanged', n_same, 'rejected', jsonb_array_length(bad),
    'problems', case when jsonb_array_length(bad) > 0 then (select jsonb_agg(x) from (select x from jsonb_array_elements(bad) x limit 20) s) end);
end;
$$;
revoke all on function public.pl_commission_ingest(text, jsonb) from public, anon, authenticated;
grant execute on function public.pl_commission_ingest(text, jsonb) to service_role;

-- 9) Super admins: the key, the log, the Unmatched list ---------------------------
-- A new key for Minkoo's webhook, shown once. The old one stops working.
create or replace function public.pl_commission_new_key()
returns text
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_key text;
begin
  if not public.pl_is_galaxy_admin() then
    raise exception 'not_allowed';
  end if;
  v_key := 'plc_' || encode(gen_random_bytes(24), 'hex');
  insert into public.commission_settings (id, key_hash, key_hint, key_made_by, key_made_at)
  values (1, encode(digest(v_key, 'sha256'), 'hex'), right(v_key, 4), auth.uid(), now())
  on conflict (id) do update set key_hash = excluded.key_hash, key_hint = excluded.key_hint,
    key_made_by = excluded.key_made_by, key_made_at = excluded.key_made_at;
  return v_key;
end;
$$;
revoke all on function public.pl_commission_new_key() from public, anon;
grant execute on function public.pl_commission_new_key() to authenticated;

-- Where things stand: the key (its last 4), the last call, how many codes
-- match no one.
create or replace function public.pl_commission_status()
returns jsonb
language plpgsql stable
security definer set search_path = public
as $$
declare
  s public.commission_settings%rowtype;
  r public.commission_receipts%rowtype;
begin
  if not public.pl_is_galaxy_admin() then
    raise exception 'not_allowed';
  end if;
  select * into s from public.commission_settings where id = 1;
  select * into r from public.commission_receipts order by id desc limit 1;
  return jsonb_build_object(
    'hasKey', s.key_hash is not null, 'keyHint', s.key_hint, 'keyMadeAt', s.key_made_at,
    'keyMadeBy', (select display_name from public.profiles where id = s.key_made_by),
    'lastAt', r.received_at, 'calls', (select count(*) from public.commission_receipts),
    'lines', (select count(*) from public.commission_lines),
    'unmatched', (select count(distinct agent_code) from public.commission_lines where user_id is null and upper(agent_code) <> 'COMPANY'));
end;
$$;
revoke all on function public.pl_commission_status() from public, anon;
grant execute on function public.pl_commission_status() to authenticated;

-- Match again everyone not matched yet (an agent added their NPN since).
-- Returns how many lines found their person.
create or replace function public.pl_commission_rematch()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  n integer;
begin
  if not public.pl_is_galaxy_admin() then
    raise exception 'not_allowed';
  end if;
  update public.commission_lines set user_id = public.pl_commission_user(agent_code), updated_at = now()
   where user_id is null and upper(agent_code) <> 'COMPANY' and public.pl_commission_user(agent_code) is not null;
  get diagnostics n = row_count;
  update public.commission_disbursements set user_id = public.pl_commission_user(agent_code), updated_at = now()
   where user_id is null and public.pl_commission_user(agent_code) is not null;
  update public.commission_lines t set writer_user_id = a.user_id
    from public.commission_lines a
   where a.event_id = t.event_id and a.level = 'A' and t.writer_user_id is distinct from a.user_id;
  return n;
end;
$$;
revoke all on function public.pl_commission_rematch() from public, anon;
grant execute on function public.pl_commission_rematch() to authenticated;

-- Codes that match no one: how many lines and dollars each, and the
-- latest client, so a super admin can tell who it is.
create or replace function public.pl_commission_unmatched()
returns table (agent_code text, lines bigint, total numeric, last_seen timestamptz, sample_client text)
language plpgsql stable
security definer set search_path = public
as $$
begin
  if not public.pl_is_galaxy_admin() then
    raise exception 'not_allowed';
  end if;
  return query
    select l.agent_code, count(*), sum(l.amount), max(l.first_seen_at),
           (array_agg(l.insured_name order by l.first_seen_at desc))[1]
      from public.commission_lines l
     where l.user_id is null and upper(l.agent_code) <> 'COMPANY'
     group by l.agent_code
     order by max(l.first_seen_at) desc;
end;
$$;
revoke all on function public.pl_commission_unmatched() from public, anon;
grant execute on function public.pl_commission_unmatched() to authenticated;

-- A super admin links a code to a person (null p_user: unlink).
create or replace function public.pl_commission_link_code(p_code text, p_user uuid)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  n integer;
begin
  if not public.pl_is_galaxy_admin() then
    raise exception 'not_allowed';
  end if;
  if coalesce(btrim(p_code), '') = '' or upper(p_code) = 'COMPANY' then
    raise exception 'bad_code';
  end if;
  if p_user is null then
    delete from public.commission_agent_links where agent_code = p_code;
  else
    if not exists (select 1 from public.profiles where id = p_user) then
      raise exception 'no_profile';
    end if;
    insert into public.commission_agent_links (agent_code, user_id, linked_by) values (p_code, p_user, auth.uid())
    on conflict (agent_code) do update set user_id = excluded.user_id, linked_by = excluded.linked_by, linked_at = now();
  end if;
  update public.commission_lines set user_id = public.pl_commission_user(agent_code), updated_at = now() where agent_code = p_code;
  get diagnostics n = row_count;
  update public.commission_disbursements set user_id = public.pl_commission_user(agent_code), updated_at = now() where agent_code = p_code;
  update public.commission_lines set writer_user_id = public.pl_commission_user(writer_code) where writer_code = p_code;
  insert into public.audit_log (actor_id, actor_name, action, target_name, details)
  values (auth.uid(), (select display_name from public.profiles where id = auth.uid()),
          case when p_user is null then 'Unlinked a commission code' else 'Linked a commission code' end,
          (select display_name from public.profiles where id = p_user), 'code ending ' || right(p_code, 4));
  return n;
end;
$$;
revoke all on function public.pl_commission_link_code(text, uuid) from public, anon;
grant execute on function public.pl_commission_link_code(text, uuid) to authenticated;

-- 10) Totals per person, for the Team and Agency views --------------------------
-- Runs as the person asking, so it only counts lines they can see.
-- paid: lines paid out between the dates. coming: approved, not paid yet.
create or replace function public.pl_commission_totals(p_from date, p_to date)
returns table (user_id uuid, agent_code text, paid numeric, coming numeric, chargebacks numeric, lines bigint)
language sql stable
security invoker set search_path = public
as $$
  select l.user_id, case when l.user_id is null then l.agent_code end,
         coalesce(sum(l.amount) filter (where l.paid_on between p_from and p_to), 0),
         coalesce(sum(l.amount) filter (where l.paid_on is null and coalesce(l.status, '') <> 'PROCESSED'), 0),
         coalesce(sum(l.amount) filter (where l.amount < 0 and (l.paid_on between p_from and p_to or l.paid_on is null)), 0),
         count(*)
    from public.commission_lines l
   group by 1, 2;
$$;
revoke all on function public.pl_commission_totals(date, date) from public, anon;
grant execute on function public.pl_commission_totals(date, date) to authenticated;

commit;

-- Check: should list 5 tables and 9 functions.
select 'table' as what, c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in ('commission_disbursements', 'commission_lines', 'commission_agent_links', 'commission_receipts', 'commission_settings')
union all
select 'function', proname from pg_proc where proname in ('pl_commission_num', 'pl_commission_user', 'pl_commission_ingest', 'pl_commission_new_key',
  'pl_commission_status', 'pl_commission_rematch', 'pl_commission_unmatched', 'pl_commission_link_code', 'pl_commission_totals')
order by 1, 2;
