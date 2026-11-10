-- A test address for the commission system (Minkoo, Nov 10, 2026).
--
-- POST .../functions/v1/commissions-ingest-test with its own key (made in
-- PaceLedger → Pay → Setup). It runs the same checks as the live address and
-- answers the same way, then undoes everything: no payouts, lines, matches
-- or log rows are saved, so fake data never reaches anyone's pay. The live
-- key doesn't work here and the test key doesn't work on the live address.
--
-- Safe to run more than once.

alter table public.commission_settings
  add column if not exists test_key_hash text,
  add column if not exists test_key_hint text,
  add column if not exists test_key_made_by uuid,
  add column if not exists test_key_made_at timestamptz,
  add column if not exists test_last_at timestamptz,
  add column if not exists test_last_result jsonb;

-- A new test key, shown once. The old test key stops working; the live key
-- is untouched.
create or replace function public.pl_commission_new_test_key()
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
  v_key := 'plt_' || encode(gen_random_bytes(24), 'hex');
  insert into public.commission_settings (id, test_key_hash, test_key_hint, test_key_made_by, test_key_made_at)
  values (1, encode(digest(v_key, 'sha256'), 'hex'), right(v_key, 4), auth.uid(), now())
  on conflict (id) do update set test_key_hash = excluded.test_key_hash, test_key_hint = excluded.test_key_hint,
    test_key_made_by = excluded.test_key_made_by, test_key_made_at = excluded.test_key_made_at;
  return v_key;
end;
$$;
revoke all on function public.pl_commission_new_test_key() from public, anon;
grant execute on function public.pl_commission_new_test_key() to authenticated;

-- The test address. Inside a block that always ends in an error (and so is
-- always undone), the test key briefly stands in for the live key and the
-- real pl_commission_ingest runs: same checks, same answer. Other calls never
-- see the stand-in (it's never committed), so the live address keeps working.
-- Errors from the real import (bad_body, too_many) come through as they are.
create or replace function public.pl_commission_ingest_test(p_key text, p_body jsonb)
returns jsonb
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_hash text;
  r jsonb;
begin
  select test_key_hash into v_hash from public.commission_settings where id = 1;
  if v_hash is null then
    raise exception 'no_test_key';
  end if;
  if p_key is null or encode(digest(p_key, 'sha256'), 'hex') <> v_hash then
    raise exception 'bad_key';
  end if;
  begin
    update public.commission_settings set key_hash = v_hash where id = 1;
    r := public.pl_commission_ingest(p_key, p_body);
    raise exception using errcode = 'PLTST', message = 'test_undo';
  exception when sqlstate 'PLTST' then
    null; -- everything above is undone; r keeps the answer
  end;
  r := coalesce(r, '{}'::jsonb) || jsonb_build_object('test', true, 'saved', false);
  update public.commission_settings set test_last_at = now(), test_last_result = r where id = 1;
  return r;
end;
$$;
revoke all on function public.pl_commission_ingest_test(text, jsonb) from public, anon, authenticated;
grant execute on function public.pl_commission_ingest_test(text, jsonb) to service_role;

-- Where things stand, now with the test key and the last test send.
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
    'unmatched', (select count(distinct agent_code) from public.commission_lines where user_id is null and upper(agent_code) <> 'COMPANY'),
    'hasTestKey', s.test_key_hash is not null, 'testKeyHint', s.test_key_hint, 'testKeyMadeAt', s.test_key_made_at,
    'testLastAt', s.test_last_at, 'testLastResult', s.test_last_result);
end;
$$;
