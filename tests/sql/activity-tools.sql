\set ON_ERROR_STOP 1
-- Activity tools: BHB starts off, BIG on; only super admins turn them on or off.
-- People (stubs/base.sql): BIG: Morgan (super admin), Dana (manager), Jordan + Riley (advisors).
-- BHB: Sam (Super Manager), Casey (advisor under Sam).
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, false); end $$;
create or replace function pg_temp.expect_error(sql text, want text) returns void language plpgsql as $$
begin execute sql; raise exception 'EXPECTED ERROR % but it worked: %', want, sql;
exception when others then if position(want in sqlerrm) = 0 then raise exception 'WRONG ERROR for %: got "%" want "%"', sql, sqlerrm, want; end if;
  raise notice 'ok (error %)', want; end $$;
create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if; raise notice 'ok %', what; end $$;
grant execute on all functions in schema pg_temp to authenticated;
-- everyone can update their own row (as in the app), so the guard is what stops them
create policy "own row" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

\echo == 1 the defaults
select pg_temp.check((select activity_tools_default from public.solar_systems where short_name = 'BIG'), 'BIG: on by default');
select pg_temp.check((select not activity_tools_default from public.solar_systems where short_name = 'BHB'), 'BHB: off by default');
select pg_temp.check((select bool_and(activity_tools is null) from public.profiles), 'nobody has their own setting yet');

set role authenticated;
\echo == 2 a Super Manager can't turn them on, even in their own solar system
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select pg_temp.expect_error($$select public.pl_admin_save_person('66666666-6666-6666-6666-666666666666', '{"activity_tools":true}', null)$$, 'not_allowed_tools');
select pg_temp.expect_error($$update public.profiles set activity_tools = true where id = '66666666-6666-6666-6666-666666666666'$$, 'Only super admins can turn activity tools on or off');
select pg_temp.expect_error($$update public.profiles set activity_tools = true where id = '55555555-5555-5555-5555-555555555555'$$, 'Not authorized');
-- sending today's value is not a change, so their other edits still save
select public.pl_admin_save_person('66666666-6666-6666-6666-666666666666', '{"display_name":"Casey Ngo","activity_tools":null}', null);
select pg_temp.check((select display_name = 'Casey Ngo' and activity_tools is null from public.profiles where id = '66666666-6666-6666-6666-666666666666'), 'a Super Manager still edits the rest');

\echo == 3 nobody turns their own on
select pg_temp.as_user('66666666-6666-6666-6666-666666666666');
select pg_temp.expect_error($$update public.profiles set activity_tools = true where id = '66666666-6666-6666-6666-666666666666'$$, 'Not authorized');
select pg_temp.expect_error($$select public.pl_admin_save_person('66666666-6666-6666-6666-666666666666', '{"activity_tools":true}', null)$$, 'not_allowed');

\echo == 4 a super admin turns them on, off and back to the default
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select pg_temp.expect_error($$select public.pl_admin_save_person('66666666-6666-6666-6666-666666666666', '{"activity_tools":"yes"}', null)$$, 'bad_activity_tools');
select pg_temp.expect_error($$select public.pl_admin_save_person('66666666-6666-6666-6666-666666666666', '{"activity_tools":1}', null)$$, 'bad_activity_tools');
select (public.pl_admin_save_person('66666666-6666-6666-6666-666666666666', '{"activity_tools":true}', null)->>'activity_tools') as t \gset
select pg_temp.check(:'t' = 'true', 'turned on, no reason needed');
select pg_temp.check((select count(*) = 1 from public.audit_log where target_id = '66666666-6666-6666-6666-666666666666'
  and action = 'Turned on activity tools' and actor_name = 'Morgan Lee' and target_name = 'Casey Ngo'), 'logged: Turned on activity tools');
select public.pl_admin_save_person('66666666-6666-6666-6666-666666666666', '{"activity_tools":true}', null);
select pg_temp.check((select count(*) = 1 from public.audit_log where action like '%activity tools'), 'saving it on again logs nothing');
select public.pl_admin_save_person('22222222-2222-2222-2222-222222222222', '{"activity_tools":false}', null);
select pg_temp.check((select activity_tools = false from public.profiles where id = '22222222-2222-2222-2222-222222222222'), 'turned off for someone in BIG');
select pg_temp.check((select count(*) = 1 from public.audit_log where action = 'Turned off activity tools' and target_id = '22222222-2222-2222-2222-222222222222'), 'logged: Turned off activity tools');
select public.pl_admin_save_person('22222222-2222-2222-2222-222222222222', '{"activity_tools":null}', null);
select pg_temp.check((select activity_tools is null from public.profiles where id = '22222222-2222-2222-2222-222222222222'), 'back to the solar system default');
select pg_temp.check((select count(*) = 1 from public.audit_log where action = 'Reset activity tools'), 'logged: Reset activity tools');
-- with other changes in the same save
select public.pl_admin_save_person('44444444-4444-4444-4444-444444444444', '{"activity_tools":false,"hierarchy_tier":"SA"}', 'Moving to contracting only');
select pg_temp.check((select activity_tools = false and hierarchy_tier = 'SA' from public.profiles where id = '44444444-4444-4444-4444-444444444444'), 'saved with a level change');
select pg_temp.check((select count(*) = 2 from public.audit_log where target_id = '44444444-4444-4444-4444-444444444444' and reason = 'Moving to contracting only'), 'both logged with the reason');
-- a super admin can also set it directly
update public.profiles set activity_tools = true where id = '55555555-5555-5555-5555-555555555555';
select pg_temp.check((select activity_tools from public.profiles where id = '55555555-5555-5555-5555-555555555555'), 'a super admin may update it directly');

\echo == 5 advisors and managers can't use the save at all
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select pg_temp.expect_error($$select public.pl_admin_save_person('44444444-4444-4444-4444-444444444444', '{"activity_tools":true}', null)$$, 'not_allowed');
\echo ALL ACTIVITY TOOLS SQL TESTS PASSED
