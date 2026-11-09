-- Extras for the commissions test, on top of base.sql.
create schema if not exists extensions;
do $$ begin if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if; end $$;
grant usage on schema public to service_role;
alter table public.profiles add column if not exists npn text, add column if not exists fg_writing_number text;
-- Jordan: NPN 90000001. Dana: NPN written with a dash. Riley: only an F&G writing number.
update public.profiles set npn = '90000001' where display_name = 'Jordan Ellis';
update public.profiles set npn = '9000-0002' where display_name = 'Dana Brooks';
update public.profiles set fg_writing_number = '90000004' where display_name like 'Riley%';
