\set ON_ERROR_STOP 1
\set c1 `cat "$FIXTURES/call1.json"`
\set c2 `cat "$FIXTURES/call2.json"`
\set c3 `cat "$FIXTURES/call3.json"`
\set c4 `cat "$FIXTURES/call4.json"`
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, false); end $$;
create or replace function pg_temp.expect_error(sql text, want text) returns void language plpgsql as $$
begin execute sql; raise exception 'EXPECTED ERROR % but it worked: %', want, left(sql, 120);
exception when others then if position(want in sqlerrm) = 0 then raise exception 'WRONG ERROR for %: got "%" want "%"', left(sql, 120), sqlerrm, want; end if;
  raise notice 'ok (error %)', want; end $$;
create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if; raise notice 'ok %', what; end $$;
grant execute on all functions in schema pg_temp to authenticated, service_role;

\echo == 1 a super admin makes the key
set role authenticated;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select pg_temp.expect_error($$select public.pl_commission_new_key()$$, 'not_allowed');
select pg_temp.expect_error($$select public.pl_commission_ingest('x', '{}')$$, 'permission denied');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select public.pl_commission_new_key() as key \gset
select pg_temp.check(:'key' ~ '^plc_[0-9a-f]{48}$', 'key looks right');
select pg_temp.check((public.pl_commission_status()->>'hasKey')::boolean and public.pl_commission_status()->>'keyHint' = right(:'key', 4), 'status shows the last 4 only');

\echo == 2 Minkoo sends: payouts, then 100 + 100 + 40 lines
reset role; set role service_role;
select pg_temp.expect_error($$select public.pl_commission_ingest('plc_wrong', '{}')$$, 'bad_key');
select pg_temp.expect_error($$select public.pl_commission_ingest(null, '{}')$$, 'bad_key');
select public.pl_commission_ingest(:'key', :'c1'::jsonb) as r1 \gset
select pg_temp.check((:'r1'::jsonb)->>'disbImported' = '3' and (:'r1'::jsonb)->>'new' = '3' and ((:'r1'::jsonb)->>'success')::boolean, 'call 1: 3 payouts in, same answer shape as InsuraCloud');
select public.pl_commission_ingest(:'key', :'c2'::jsonb) as r2 \gset
select public.pl_commission_ingest(:'key', :'c3'::jsonb) as r3 \gset
select public.pl_commission_ingest(:'key', :'c4'::jsonb) as r4 \gset
select pg_temp.check((:'r2'::jsonb)->>'ledgerImported' = '100' and (:'r4'::jsonb)->>'ledgerImported' = '40', 'calls 2-4: 240 lines');
reset role;
select pg_temp.check((select count(*) = 240 from public.commission_lines) and (select count(*) = 3 from public.commission_disbursements), 'all stored');
select pg_temp.check((select count(*) = 16 from public.commission_lines where event_id = (select event_id from public.commission_lines limit 1)), 'a premium is 16 lines');
-- each payout equals the sum of its lines, and its lines got its date
select pg_temp.check((select bool_and(d.amount = (select sum(l.amount) from public.commission_lines l where l.disbursement_record_id = d.record_id)
  and (select bool_and(l.paid_on = d.disbursed_date) from public.commission_lines l where l.disbursement_record_id = d.record_id)) from public.commission_disbursements d), 'payouts add up, lines dated by their payout');
-- matching: Jordan by NPN, Dana by NPN with a dash, Riley by F&G number, 90000005 nobody, COMPANY nobody
select pg_temp.check((select count(*) = 3 from public.commission_lines where user_id = '22222222-2222-2222-2222-222222222222'), 'Jordan matched by NPN (3 lines)');
select pg_temp.check((select count(*) = 60 from public.commission_lines where user_id = '33333333-3333-3333-3333-333333333333'), 'Dana matched by NPN typed with a dash (60 lines)');
select pg_temp.check((select count(*) = 11 from public.commission_lines where user_id = '44444444-4444-4444-4444-444444444444'), 'Riley matched by F&G writing number (11)');
select pg_temp.check((select count(*) = 166 from public.commission_lines where user_id is null), 'COMPANY (161) and one unknown code (5) unmatched');
-- the writing agent: whoever the A line pays
select pg_temp.check((select bool_and(t.writer_code = a.agent_code) from public.commission_lines t join public.commission_lines a on a.event_id = t.event_id and a.level = 'A'), 'every line knows its writer');
select pg_temp.check((select count(*) = 3 and bool_and(level in ('AD', 'FD', 'SFD')) from public.commission_lines where writer_user_id = '22222222-2222-2222-2222-222222222222'
  and user_id = '44444444-4444-4444-4444-444444444444'), 'the upline''s overrides on Jordan''s sale are tagged as his sale');
select pg_temp.check((select bool_and(amount <= 0) from public.commission_lines where event_id in (select event_id from public.commission_lines where amount < 0)), 'the chargeback premium is all negative (FA is $0)');

\echo == 3 the daily resend changes nothing; a line getting paid updates
set role service_role;
select public.pl_commission_ingest(:'key', :'c2'::jsonb) as r5 \gset
select pg_temp.check((:'r5'::jsonb)->>'unchanged' = '100' and (:'r5'::jsonb)->>'new' = '0' and (:'r5'::jsonb)->>'updated' = '0', 'resend: 100 unchanged');
reset role;
select record_id as rid, amount as amt from public.commission_lines where user_id = '44444444-4444-4444-4444-444444444444' and status = 'APPROVED' order by record_id limit 1 \gset
set role service_role;
select public.pl_commission_ingest(:'key', jsonb_build_object('ledgers', jsonb_build_array(jsonb_build_object(
  'recordId', :'rid', 'disbursementRecordId', '2026-11-03~90000004', 'agentCode', '90000004', 'amount', :'amt', 'type', 'PREMIUM', 'carrier', 'FIDELITY',
  'commissionLevel', split_part(:'rid', '~', array_length(string_to_array(:'rid', '~'), 1)), 'rate', 4000, 'status', 'PROCESSED')))) as r6 \gset
select pg_temp.check((:'r6'::jsonb)->>'updated' = '1', 'approved -> processed is an update');
reset role;
select pg_temp.check((select status = 'PROCESSED' and paid_on = '2026-11-03' from public.commission_lines where record_id = :'rid'), 'dated from the payout id until the payout itself arrives');
set role service_role;
select public.pl_commission_ingest(:'key', '{"disbursements":[{"recordId":"2026-11-03~90000004","disbursedDate":"2026-11-04","agentCode":"90000004","amountOriginal":"10","status":"PROCESSED"}]}');
reset role;
select pg_temp.check((select paid_on = '2026-11-04' from public.commission_lines where record_id = :'rid'), 'then takes the payout''s own date');

\echo == 4 InsuraCloud documented spelling works too; bad rows are reported, not fatal
set role service_role;
select public.pl_commission_ingest(:'key', '{"ledger":[{"recordId":"T1~9~A","carrierCode":"90000001","amount":"12.50","rate":"4000","status":"APPROVED"},{"recordId":"T2~9~A","agentCode":"90000001","amount":"lots"},{"amount":"1"}]}') as r7 \gset
select pg_temp.check((:'r7'::jsonb)->>'ledgerImported' = '1' and (:'r7'::jsonb)->>'rejected' = '2', 'ledger + carrierCode accepted; 2 bad rows rejected');
select pg_temp.expect_error(format($$select public.pl_commission_ingest(%L, '[1,2]')$$, :'key'), 'bad_body');
reset role;
select pg_temp.check((select level = 'A' and user_id = '22222222-2222-2222-2222-222222222222' and rate = 4000 from public.commission_lines where record_id = 'T1~9~A'), 'level read from the id when it isn''t sent');
select pg_temp.check((select rejected = 2 and problems is not null from public.commission_receipts order by id desc limit 1), 'the log keeps what was wrong');

\echo == 5 who sees what
set role authenticated;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select pg_temp.check((select count(*) = 4 and bool_and(user_id = '22222222-2222-2222-2222-222222222222') from public.commission_lines), 'Jordan sees only his own lines');
select pg_temp.check((select count(*) = 1 from public.commission_disbursements), 'and his own payout');
select pg_temp.expect_error($$select public.pl_commission_status()$$, 'not_allowed');
select pg_temp.expect_error($$update public.commission_lines set amount = 1$$, 'permission denied');
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select pg_temp.check((select count(*) = 4 + 60 + 11 from public.commission_lines), 'Dana sees hers and her team''s (Jordan, Riley)');
select pg_temp.check((select count(*) = 0 from public.commission_lines where agent_code = 'COMPANY'), 'not the agency share');
select pg_temp.check((select paid > 0 and lines = 60 from public.pl_commission_totals('2026-10-01', '2026-10-31') where user_id = '33333333-3333-3333-3333-333333333333'), 'totals for her team');
select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
select pg_temp.check((select count(*) = 11 from public.commission_lines), 'Riley: only hers');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select pg_temp.check((select count(*) = 241 from public.commission_lines), 'the super admin sees everything, COMPANY too');
select pg_temp.check((select company.coming < 0 or company.coming > 0 from public.pl_commission_totals('2026-10-01', '2026-10-31') company where agent_code = 'COMPANY'), 'agency share totals');

\echo == 6 the Unmatched list and linking a code
select pg_temp.check((select count(*) = 1 and min(lines) = 5 from public.pl_commission_unmatched()), 'one unknown code, 5 lines');
select pg_temp.check((public.pl_commission_status()->>'unmatched')::int = 1, 'status counts it');
select public.pl_commission_link_code('90000005', '66666666-6666-6666-6666-666666666666');
select pg_temp.check((select count(*) = 0 from public.pl_commission_unmatched()), 'linked: nothing unmatched');
select pg_temp.expect_error($$select public.pl_commission_link_code('COMPANY', '66666666-6666-6666-6666-666666666666')$$, 'bad_code');
reset role;
select pg_temp.check((select count(*) = 5 from public.commission_lines where user_id = '66666666-6666-6666-6666-666666666666'), 'Casey has the 5 lines');
select pg_temp.check((select count(*) = 1 from public.audit_log where action = 'Linked a commission code' and details = 'code ending 0005'), 'linking is in the activity log');
set role authenticated;
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select pg_temp.check((select count(*) = 5 from public.commission_lines), 'a Super Manager sees only their solar system (Casey)');
select pg_temp.expect_error($$select public.pl_commission_link_code('x', null)$$, 'not_allowed');
-- an agent adds their NPN later: rematch finds them
reset role;
update public.commission_lines set user_id = null where user_id = '44444444-4444-4444-4444-444444444444';
set role authenticated;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select pg_temp.check(public.pl_commission_rematch() = 11, 'rematch finds Riley again');
\echo == 7 a new key turns the old one off
select public.pl_commission_new_key() as key2 \gset
reset role; set role service_role;
select pg_temp.expect_error(format($$select public.pl_commission_ingest(%L, '{}')$$, :'key'), 'bad_key');
select pg_temp.check((public.pl_commission_ingest(:'key2', '{}')->>'success')::boolean, 'the new key works');
\echo ALL COMMISSION SQL TESTS PASSED
