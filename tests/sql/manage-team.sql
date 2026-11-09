\set ON_ERROR_STOP 1
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, false); end $$;
create or replace function pg_temp.expect_error(sql text, want text) returns void language plpgsql as $$
begin execute sql; raise exception 'EXPECTED ERROR % but it worked: %', want, sql;
exception when others then if position(want in sqlerrm) = 0 then raise exception 'WRONG ERROR for %: got "%" want "%"', sql, sqlerrm, want; end if;
  raise notice 'ok (error %)', want; end $$;
create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if; raise notice 'ok %', what; end $$;
grant execute on all functions in schema pg_temp to authenticated;
set role authenticated;

\echo == 1 Morgan (super admin) changes Jordan comp level: needs a reason
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select pg_temp.expect_error($$select public.pl_admin_save_person('22222222-2222-2222-2222-222222222222', '{"hierarchy_tier":"FA"}', null)$$, 'reason_required');
select pg_temp.expect_error($$select public.pl_admin_save_person('22222222-2222-2222-2222-222222222222', '{"hierarchy_tier":"FA"}', '   ')$$, 'reason_required');
select pg_temp.expect_error($$select public.pl_admin_save_person('22222222-2222-2222-2222-222222222222', '{"hierarchy_tier":"XX"}', 'x')$$, 'bad_level');
select (public.pl_admin_save_person('22222222-2222-2222-2222-222222222222', '{"hierarchy_tier":"FA"}', 'Got licensed  and contracted')->>'hierarchy_tier') as tier \gset
select pg_temp.check(:'tier' = 'FA', 'level saved');
select pg_temp.check((select count(*) = 1 from public.audit_log where target_id = '22222222-2222-2222-2222-222222222222' and action = 'Changed comp level'
  and details = 'UA → FA' and reason = 'Got licensed and contracted' and actor_name = 'Morgan Lee' and target_name = 'Jordan Ellis'), 'logged with reason');
-- saving the same level again: no change, no reason needed, nothing logged
select public.pl_admin_save_person('22222222-2222-2222-2222-222222222222', '{"hierarchy_tier":"FA","role":"advisor"}', null);
select pg_temp.check((select count(*) = 1 from public.audit_log), 'nothing new logged when nothing changed');

\echo == 2 name and phone: no reason needed; appointments follow the name
select (public.pl_admin_save_person('44444444-4444-4444-4444-444444444444', '{"display_name":"  Riley   Dynamite Park ","phone":"+1 (214) 555-0187"}', '')->>'phone') as ph \gset
select pg_temp.check(:'ph' = '2145550187', 'phone cleaned to 10 digits');
select pg_temp.check((select display_name = 'Riley Dynamite Park' from public.profiles where id = '44444444-4444-4444-4444-444444444444'), 'name saved, quotes gone, spaces tidied');
reset role;
select pg_temp.check((select presenter = 'Riley Dynamite Park' from public.appointments where presenter_id = '44444444-4444-4444-4444-444444444444'), 'appointments show the new name');
select pg_temp.check((select count(*) = 2 from public.audit_log where target_id = '44444444-4444-4444-4444-444444444444' and action in ('Changed name', 'Changed phone')), 'name + phone logged');
select pg_temp.check((select details = 'Riley "Dynamite" Park → Riley Dynamite Park' from public.audit_log where action = 'Changed name'), 'name log shows old → new');
select pg_temp.check((select details = 'added' and reason is null from public.audit_log where action = 'Changed phone'), 'phone log says added, no number');
set role authenticated;
select pg_temp.expect_error($$select public.pl_admin_save_person('44444444-4444-4444-4444-444444444444', '{"phone":"555-0187"}', null)$$, 'phone_digits');
select pg_temp.expect_error($$select public.pl_admin_save_person('44444444-4444-4444-4444-444444444444', '{"display_name":" R "}', null)$$, 'name_required');
select public.pl_admin_save_person('44444444-4444-4444-4444-444444444444', '{"phone":""}', null);
select pg_temp.check((select phone is null from public.person_contacts where user_id = '44444444-4444-4444-4444-444444444444'), 'blank phone clears it');

\echo == 3 reports-to rules
select pg_temp.expect_error($$select public.pl_admin_save_person('33333333-3333-3333-3333-333333333333', '{"manager_id":"22222222-2222-2222-2222-222222222222"}', 'x')$$, 'upline_loop');
select pg_temp.expect_error($$select public.pl_admin_save_person('33333333-3333-3333-3333-333333333333', '{"manager_id":"33333333-3333-3333-3333-333333333333"}', 'x')$$, 'bad_upline');
select pg_temp.expect_error($$select public.pl_admin_save_person('22222222-2222-2222-2222-222222222222', '{"manager_id":"55555555-5555-5555-5555-555555555555"}', 'x')$$, 'bad_upline');
select public.pl_admin_save_person('22222222-2222-2222-2222-222222222222', '{"manager_id":"11111111-1111-1111-1111-111111111111","role":"manager"}', 'Leads his own team now');
select pg_temp.check((select manager_id = '11111111-1111-1111-1111-111111111111' and role = 'manager' from public.profiles where id = '22222222-2222-2222-2222-222222222222'), 'upline + role saved together');
select pg_temp.check((select details = 'Advisor → Manager' from public.audit_log where action = 'Changed role'), 'role log uses labels');
select pg_temp.check((select details = 'now reports to Morgan Lee' and reason = 'Leads his own team now' from public.audit_log where action = 'Changed reports-to'), 'reports-to log');
select pg_temp.expect_error($$select public.pl_admin_save_person('11111111-1111-1111-1111-111111111111', '{"role":"advisor"}', 'x')$$, 'last_admin');

\echo == 4 a Super Manager: only their solar system, not themselves, Advisor/Manager only
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select pg_temp.expect_error($$select public.pl_admin_save_person('22222222-2222-2222-2222-222222222222', '{"display_name":"X Y"}', null)$$, 'not_allowed');
select pg_temp.expect_error($$select public.pl_admin_save_person('55555555-5555-5555-5555-555555555555', '{"hierarchy_tier":"SFD"}', 'x')$$, 'not_allowed');
select pg_temp.expect_error($$select public.pl_admin_save_person('66666666-6666-6666-6666-666666666666', '{"role":"super_manager"}', 'x')$$, 'not_allowed_role');
select public.pl_admin_save_person('55555555-5555-5555-5555-555555555555', '{"display_name":"Sam Ortiz Jr"}', null);
select public.pl_admin_save_person('66666666-6666-6666-6666-666666666666', '{"hierarchy_tier":"FA","role":"manager","phone":"2145550100"}', 'Passed the exam');
select pg_temp.check((select hierarchy_tier = 'FA' and role = 'manager' from public.profiles where id = '66666666-6666-6666-6666-666666666666'), 'super manager saves inside their system');

\echo == 5 advisors and managers cannot use it
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select pg_temp.expect_error($$select public.pl_admin_save_person('44444444-4444-4444-4444-444444444444', '{"display_name":"X Y"}', null)$$, 'not_allowed');

\echo == 6 who can see a phone number
-- Riley (under Dana) adds her own number
select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
select pg_temp.expect_error($$select public.set_my_phone('12345')$$, 'phone_digits');
select public.set_my_phone('(214) 555-0199');
select pg_temp.check((select phone = '2145550199' from public.person_contacts where user_id = '44444444-4444-4444-4444-444444444444'), 'she sees her own');
select pg_temp.expect_error($$update public.person_contacts set phone = '2145550000' where user_id = '44444444-4444-4444-4444-444444444444'$$, 'permission denied');
select pg_temp.expect_error($$insert into public.person_contacts (user_id, phone) values ('22222222-2222-2222-2222-222222222222', '2145550000')$$, 'permission denied');
-- Dana (her upline) sees it; Jordan (a teammate, now under Morgan) does not; Morgan does
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select pg_temp.check((select count(*) = 1 from public.person_contacts where user_id = '44444444-4444-4444-4444-444444444444'), 'her upline sees it');
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select pg_temp.check((select count(*) = 0 from public.person_contacts where user_id = '44444444-4444-4444-4444-444444444444'), 'a teammate does not');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select pg_temp.check((select count(*) = 2 from public.person_contacts), 'a super admin sees every number (Riley, Casey)');
-- Sam (BHB Super Manager) sees Casey's, not Riley's
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select pg_temp.check((select count(*) = 1 and bool_and(user_id = '66666666-6666-6666-6666-666666666666') from public.person_contacts), 'a Super Manager sees only their solar system');
\echo ALL MANAGE TEAM SQL TESTS PASSED
