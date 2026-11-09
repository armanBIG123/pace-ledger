\set ON_ERROR_STOP 0
create or replace function pg_temp.chk(c boolean, m text) returns text language sql as $$ select case when c then 'ok   ' else 'FAIL ' end || m $$;
-- the day
with r as (select public.pl_activity_report('2026-11-06','2026-11-06') j)
select pg_temp.chk((j->'company') = '{"added":1,"set":1,"completed":4,"apps":2,"premium":1500,"not_logged":1}'::jsonb, 'company totals for Friday (sold appointments count as completed too): ' || (j->'company')::text) from r
union all
select pg_temp.chk((select x from jsonb_array_elements(j->'people') x where x->>'name' = 'Tasha Tee') @> '{"added":1,"set":1,"completed":1}', 'Tasha: 1 added (the evening sign-up, not the one the night before), 1 set, 1 completed') from r
union all
select pg_temp.chk((select x from jsonb_array_elements(j->'people') x where x->>'name' = 'Lee El') @> '{"completed":2,"set":0}', 'Lee: 2 completed (went well + not interested follow-up), no-show and unlogged left out') from r
union all
select pg_temp.chk(jsonb_array_length(j->'people') = 8, 'everyone is listed') from r
union all
select pg_temp.chk((select jsonb_agg(jsonb_build_object('u', right(x->>'user_id', 1), 'p', (x->>'premium')::numeric) order by x->>'user_id') from jsonb_array_elements(j->'sales') x)
   = '[{"u":"2","p":400},{"u":"4","p":600},{"u":"8","p":500}]', 'split sale: Tasha 600, Dana 400; Cy 500: ' || (j->'sales')::text) from r
union all
select pg_temp.chk((select x->>'system' from jsonb_array_elements(j->'people') x where x->>'name' = 'Cy Sea') = 'BHB', 'solar system comes with each person') from r;
-- the week
with r as (select public.pl_activity_report('2026-10-31','2026-11-06') j)
select pg_temp.chk((j->'company'->>'set')::int = 4, 'week: 4 set (weekend batch on Sat/Sun, late weekend entry on Sunday, earlier week and follow-up left out): ' || (j->'company')::text) from r
union all
select pg_temp.chk((j->'company'->>'apps')::int = 3 and (j->'company'->>'premium')::numeric = 1750.50, 'week: 3 apps, $1,750.50 (a split with yourself is not a split)') from r
union all
select pg_temp.chk((j->'company'->>'added')::int = 2 and (j->'company'->>'completed')::int = 6, 'week: 2 added, 6 completed') from r
union all
select pg_temp.chk((select count(*) from jsonb_array_elements(j->'sales') x where x->>'id' like 'c0000000%3') = 1, 'self-split counted once') from r;
-- Sunday alone
select pg_temp.chk((public.pl_activity_report('2026-11-01','2026-11-01')->'company'->>'set')::int = 2, 'Sunday: the weekend entry made Sunday and the one entered Tuesday');
select pg_temp.chk((public.pl_activity_report('2026-10-31','2026-10-31')->'company'->>'set')::int = 0, 'Saturday: none');
-- bad range
do $$ begin perform public.pl_activity_report('2026-01-01','2026-06-01'); raise notice 'FAIL too long a range should fail'; exception when others then raise notice 'ok    too long a range fails: %', sqlerrm; end $$;
-- who can run it
\c - authenticator
create or replace function pg_temp.chk(c boolean, m text) returns text language sql as $$ select case when c then 'ok   ' else 'FAIL ' end || m $$;
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', false);
do $$ begin perform public.pl_activity_report('2026-11-06','2026-11-06'); raise notice 'FAIL an advisor ran it'; exception when others then raise notice 'ok    an advisor cannot: %', sqlerrm; end $$;
do $$ begin perform public.pl_report_save_settings(array['x@y.com'], true, true); raise notice 'FAIL an advisor saved settings'; exception when others then raise notice 'ok    an advisor cannot save settings: %', sqlerrm; end $$;
select pg_temp.chk((select count(*) from report_settings) = 0, 'an advisor cannot read the settings');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', false);
select pg_temp.chk((public.pl_activity_report('2026-11-06','2026-11-06')->'company'->>'apps')::int = 2, 'a super admin can');
select pg_temp.chk((select cardinality(recipients) from report_settings) = 3, 'a super admin reads the settings: 3 recipients to start');
select pg_temp.chk(r.recipients = array['pam@big.com','arman@biginsurancenetwork.com'] and r.daily_on and not r.weekly_on and r.updated_by = 'a0000000-0000-0000-0000-000000000001',
  'save: trimmed, lower-case, repeats dropped, order kept: ' || r.recipients::text)
  from public.pl_report_save_settings(array[' Pam@BIG.com ', 'arman@biginsurancenetwork.com', 'PAM@big.com', ''], true, false) r;
do $$ begin perform public.pl_report_save_settings(array['not-an-email'], true, true); raise notice 'FAIL a bad email saved'; exception when others then raise notice 'ok    a bad email is refused: %', sqlerrm; end $$;
do $$ begin perform public.pl_report_save_settings(array['a@b.co;c@d.co'], true, true); raise notice 'FAIL two emails in one saved'; exception when others then raise notice 'ok    two emails in one box refused: %', sqlerrm; end $$;
do $$ declare n int; begin select count(*) into n from report_cron; if n = 0 then raise notice 'ok    nobody signed in can read the schedule key (0 rows)'; else raise notice 'FAIL signed-in user read the key'; end if; exception when others then raise notice 'ok    nobody signed in can read the schedule key: %', sqlerrm; end $$;
do $$ begin update report_settings set daily_on = false; if found then raise notice 'FAIL edited settings directly'; else raise notice 'ok    no direct edits (0 rows)'; end if; exception when others then raise notice 'ok    no direct edits: %', sqlerrm; end $$;
reset role;
set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select pg_temp.chk((public.pl_activity_report('2026-11-06','2026-11-06')->'company'->>'apps')::int = 2, 'the edge function (service role) can');
select pg_temp.chk((select count(*) from report_cron) = 1, 'the edge function reads the schedule key');
