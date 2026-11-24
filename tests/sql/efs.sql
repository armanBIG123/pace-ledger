\set ON_ERROR_STOP 1
-- Elite Financial Services: a third solar system with activity tools off and
-- no BIG contracting.
-- People (stubs/base.sql): BIG: Morgan (super admin), Dana, Jordan, Riley. BHB: Sam, Casey.
create or replace function pg_temp.expect_error(sql text, want text) returns void language plpgsql as $$
begin execute sql; raise exception 'EXPECTED ERROR % but it worked: %', want, sql;
exception when others then if position(want in sqlerrm) = 0 then raise exception 'WRONG ERROR for %: got "%" want "%"', sql, sqlerrm, want; end if;
  raise notice 'ok (error %)', want; end $$;
create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if; raise notice 'ok %', what; end $$;

\echo == 1 the solar system (once, though the migration ran twice)
select pg_temp.check((select count(*) = 3 from public.solar_systems), 'three solar systems');
select pg_temp.check((select count(*) = 1 from public.solar_systems where short_name = 'EFS' and name = 'Elite Financial Services'
  and email_name = 'Elite Financial Services' and notify_email is null), 'Elite Financial Services (EFS), its Super Managers get its emails');
select pg_temp.check((select not activity_tools_default and not contracting from public.solar_systems where short_name = 'EFS'), 'EFS: activity tools off, no BIG contracting');
select pg_temp.check((select bool_and(contracting) from public.solar_systems where short_name in ('BIG', 'BHB')), 'BIG and BHB still contract through BIG');
select pg_temp.check((select activity_tools_default from public.solar_systems where short_name = 'BIG')
  and (select not activity_tools_default from public.solar_systems where short_name = 'BHB'), 'BIG on and BHB off, as before');

\echo == 2 no BIG producer agreement or contracting form from EFS
insert into auth.users (id) values ('77777777-7777-7777-7777-777777777777');
insert into public.profiles (id, display_name, role, solar_system_id)
  values ('77777777-7777-7777-7777-777777777777', 'Ellis Vaughn', 'advisor', (select id from public.solar_systems where short_name = 'EFS'));
select pg_temp.check(not public.pl_contracts_here('77777777-7777-7777-7777-777777777777') and public.pl_contracts_here('22222222-2222-2222-2222-222222222222')
  and public.pl_contracts_here('66666666-6666-6666-6666-666666666666'), 'EFS doesn''t contract here; BIG and BHB do');
select pg_temp.expect_error($$insert into public.producer_agreements (user_id) values ('77777777-7777-7777-7777-777777777777')$$, 'contracting_not_here');
select pg_temp.expect_error($$insert into public.contracting_secrets (user_id) values ('77777777-7777-7777-7777-777777777777')$$, 'contracting_not_here');
insert into public.producer_agreements (user_id) values ('22222222-2222-2222-2222-222222222222'), ('66666666-6666-6666-6666-666666666666');
insert into public.contracting_secrets (user_id) values ('22222222-2222-2222-2222-222222222222');
select pg_temp.check((select count(*) = 2 from public.producer_agreements), 'BIG and BHB agents still sign and send');
\echo ALL EFS SQL TESTS PASSED
