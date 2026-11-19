\set ON_ERROR_STOP 1
-- Challenges: who can start them, what the board counts, and when an
-- appointment counts as set.
-- People (stubs/base.sql): BIG: Morgan (super admin), Dana (manager), Jordan + Riley (advisors).
-- BHB: Sam (Super Manager), Casey (advisor).
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', case when p is null then '' else json_build_object('sub', p, 'role', 'authenticated')::text end, false); end $$;
create or replace function pg_temp.expect_error(sql text, want text) returns void language plpgsql as $$
begin execute sql; raise exception 'EXPECTED ERROR % but it worked: %', want, sql;
exception when others then if position(want in sqlerrm) = 0 then raise exception 'WRONG ERROR for %: got "%" want "%"', sql, sqlerrm, want; end if;
  raise notice 'ok (error %)', want; end $$;
create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if; raise notice 'ok %', what; end $$;
-- the board as one line per category: "appointments: 1 Riley 3, 2 Jordan 3"
create or replace function pg_temp.board(c uuid) returns text language sql as $$
  select coalesce(string_agg(m, ' | ' order by m), '') from (
    select b.metric || ': ' || string_agg(b.place || ' ' || split_part(b.display_name, ' ', 1) || ' ' || b.n, ', ' order by b.place) || ' (' || max(b.people) || ')' as m
      from public.challenge_board(c) b group by b.metric) x;
$$;
grant execute on all functions in schema pg_temp to authenticated;

\echo == 1 the BIG Bird Blitz is set up (once, though the migration ran twice)
select pg_temp.check((select count(*) = 1 from public.challenges where title = 'BIG Bird Blitz'), 'one BIG Bird Blitz');
select pg_temp.check((select solar_system_id = 'aaaaaaaa-0000-0000-0000-000000000001' and theme = 'thanksgiving'
  and metrics = array['appointments', 'recruits'] from public.challenges where title = 'BIG Bird Blitz'), 'BIG, Thanksgiving, appointments and recruits');
select pg_temp.check((select starts_at = '2026-11-19 06:00Z' and ends_at = '2026-12-01 06:00Z' and show_until = '2026-12-08 06:00Z'
  from public.challenges where title = 'BIG Bird Blitz'), 'Nov 19 to the end of Nov 30 (Central); winners Dec 1 to Dec 7');

\echo == 2 when an appointment counts as set
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
set role authenticated;
insert into public.appointments (user_id, client_name) values ('22222222-2222-2222-2222-222222222222', 'Set test');
select pg_temp.check((select set_at between now() - interval '1 minute' and now() + interval '1 minute' from public.appointments where client_name = 'Set test'), 'set when it''s booked');
select set_at as first_set from public.appointments where client_name = 'Set test' \gset
update public.appointments set set_at = '2026-11-25' where client_name = 'Set test';
select pg_temp.check((select set_at = :'first_set' from public.appointments where client_name = 'Set test'), 'nobody changes it by hand');
update public.appointments set client_name = 'Set test' where client_name = 'Set test';
select pg_temp.check((select set_at = :'first_set' from public.appointments where client_name = 'Set test'), 'an edit leaves it');
select pg_sleep(0.02);
update public.appointments set week_of = '2026-11-21' where client_name = 'Set test';
select pg_temp.check((select set_at > :'first_set' from public.appointments where client_name = 'Set test'), 'a reschedule into a new week sets it again');
reset role;
delete from public.appointments where client_name = 'Set test';

\echo == 3 who can start one
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
set role authenticated;
select pg_temp.expect_error($$insert into public.challenges (title, starts_at, ends_at, show_until) values ('Mine', now(), now() + interval '1 day', now() + interval '2 days')$$, 'row-level security');
update public.challenges set title = 'Hacked' where title = 'BIG Bird Blitz';
select pg_temp.check((select count(*) = 1 from public.challenges where title = 'BIG Bird Blitz'), 'an advisor can''t change one');
delete from public.challenges;
select pg_temp.check((select count(*) = 1 from public.challenges), 'or remove one');
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select pg_temp.expect_error($$insert into public.challenges (title, starts_at, ends_at, show_until) values ('BHB push', now(), now() + interval '1 day', now() + interval '2 days')$$, 'row-level security');
select pg_temp.check((select count(*) = 0 from public.challenges), 'BHB doesn''t see BIG''s challenges');
select pg_temp.as_user('66666666-6666-6666-6666-666666666666');
select pg_temp.check((select count(*) = 0 from public.challenges), 'nor do BHB advisors');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select pg_temp.expect_error($$insert into public.challenges (title, metrics, starts_at, ends_at, show_until) values ('Sales', array['sales'], now(), now() + interval '1 day', now() + interval '2 days')$$, 'challenges_metrics');
select pg_temp.expect_error($$insert into public.challenges (title, starts_at, ends_at, show_until) values ('Backwards', now(), now() - interval '1 day', now() + interval '2 days')$$, 'challenges_dates');
select pg_temp.expect_error($$insert into public.challenges (title, starts_at, ends_at, show_until) values ('  ', now(), now() + interval '1 day', now() + interval '2 days')$$, 'challenges_title');
insert into public.challenges (title, theme, starts_at, ends_at, show_until, created_by_name)
  values ('Test push', 'classic', now() - interval '3 days', now() + interval '3 days', now() + interval '9 days', 'Someone else');
select pg_temp.check((select solar_system_id = 'aaaaaaaa-0000-0000-0000-000000000001' and created_by_name = 'Morgan Lee'
  from public.challenges where title = 'Test push'), 'a super admin starts one: BIG, posted by them');
update public.challenges set tagline = 'Go!', created_by_name = 'X', solar_system_id = 'aaaaaaaa-0000-0000-0000-000000000002' where title = 'Test push';
select pg_temp.check((select tagline = 'Go!' and created_by_name = 'Morgan Lee' and solar_system_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  from public.challenges where title = 'Test push'), 'and changes it (not who posted it or where)');
select id as t from public.challenges where title = 'Test push' \gset
reset role;

\echo == 4 the board
-- fixed moments for the test (set_at is the database's in real life)
alter table public.appointments disable trigger appointments_set_at;
delete from public.appointments;   -- the stub's own sample
insert into public.appointments (user_id, client_name, set_at, created_at, is_follow_up) values
 ('22222222-2222-2222-2222-222222222222', 'J1', now() - interval '2 days', now() - interval '2 days', false),
 ('22222222-2222-2222-2222-222222222222', 'J2', now() - interval '1 day', now() - interval '1 day', false),
 ('22222222-2222-2222-2222-222222222222', 'J3', now() - interval '1 hour', now() - interval '1 hour', false),
 ('44444444-4444-4444-4444-444444444444', 'R1', now() - interval '2 days', now() - interval '2 days', false),
 ('44444444-4444-4444-4444-444444444444', 'R2', now() - interval '30 hours', now() - interval '30 hours', false),
 ('44444444-4444-4444-4444-444444444444', 'R3', now() - interval '2 hours', now() - interval '2 hours', false),
 ('33333333-3333-3333-3333-333333333333', 'D1', now() - interval '3 hours', now() - interval '3 hours', false),
 ('33333333-3333-3333-3333-333333333333', 'D follow-up', now() - interval '3 hours', now() - interval '3 hours', true),
 ('33333333-3333-3333-3333-333333333333', 'D before', now() - interval '4 days', now() - interval '4 days', false),
 ('33333333-3333-3333-3333-333333333333', 'D after', now() + interval '4 days', now() - interval '1 hour', false),
 ('11111111-1111-1111-1111-111111111111', 'M old row', null, now() - interval '1 hour', false),
 ('66666666-6666-6666-6666-666666666666', 'C1', now() - interval '1 hour', now() - interval '1 hour', false),
 ('66666666-6666-6666-6666-666666666666', 'C2', now() - interval '1 hour', now() - interval '1 hour', false),
 ('66666666-6666-6666-6666-666666666666', 'C3', now() - interval '1 hour', now() - interval '1 hour', false),
 ('66666666-6666-6666-6666-666666666666', 'C4', now() - interval '1 hour', now() - interval '1 hour', false);
alter table public.appointments enable trigger appointments_set_at;
insert into public.recruit_invites (upline_id, used_at, used_by, solar_system_id) values
 ('33333333-3333-3333-3333-333333333333', now() - interval '1 day', gen_random_uuid(), null),
 ('33333333-3333-3333-3333-333333333333', now() - interval '5 hours', gen_random_uuid(), null),
 ('22222222-2222-2222-2222-222222222222', now() - interval '6 hours', gen_random_uuid(), null),
 ('22222222-2222-2222-2222-222222222222', now() - interval '5 days', gen_random_uuid(), null),
 ('22222222-2222-2222-2222-222222222222', null, null, null),
 ('44444444-4444-4444-4444-444444444444', now() - interval '6 hours', null, null),
 ('11111111-1111-1111-1111-111111111111', now() - interval '6 hours', gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000002'),
 ('66666666-6666-6666-6666-666666666666', now() - interval '6 hours', gen_random_uuid(), null);

set role authenticated;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select pg_temp.board(:'t') as b \gset
\echo :b
select pg_temp.check(:'b' = 'appointments: 1 Riley 3, 2 Jordan 3, 3 Dana 1 (4) | recruits: 1 Dana 2, 2 Jordan 1 (2)',
  'top 3: a tie goes to whoever got there first; no follow-ups, nothing outside the dates, no BHB, no Super Manager invites');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select pg_temp.check(pg_temp.board(:'t') = 'appointments: 1 Riley 3, 2 Jordan 3, 3 Dana 1, 4 Morgan 1 (4) | recruits: 1 Dana 2, 2 Jordan 1 (2)',
  'you see your own place too (an older appointment counts from when it was made)');
select pg_temp.as_user('66666666-6666-6666-6666-666666666666');
select pg_temp.check(pg_temp.board(:'t') = '', 'someone in BHB gets nothing');
select pg_temp.as_user(null);
select pg_temp.check(pg_temp.board(:'t') = '', 'nor does someone signed out');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into public.challenges (title, starts_at, ends_at, show_until) values ('Later', now() + interval '1 day', now() + interval '2 days', now() + interval '3 days');
select pg_temp.check(pg_temp.board((select id from public.challenges where title = 'Later')) = '', 'nothing before it starts');
update public.challenges set metrics = array['recruits'] where id = :'t';
select pg_temp.check(pg_temp.board(:'t') = 'recruits: 1 Dana 2, 2 Jordan 1 (2)', 'only the categories it counts');
delete from public.challenges where id = :'t';
select pg_temp.check((select count(*) = 0 from public.challenges where id = :'t'), 'a super admin removes one');
\echo ALL CHALLENGES SQL TESTS PASSED
