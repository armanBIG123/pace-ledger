-- Elite Financial Services (EFS): a third solar system, its own organization,
-- walled off from Big Insurance Network and Big Huge Business like they are
-- from each other.
--   * Activity tools start off for everyone in it (Contracting, Resources and
--     Chat), until a super admin turns them on for someone in Manage Team.
--   * Its Resources start empty.
--   * Contracting in PaceLedger is BIG's (BIG's producer agreement, and the
--     contracting form goes to BIG's team), so it's off for EFS: its people
--     see the licensing steps with "Get your contracting link from your
--     manager" instead, and the database refuses a BIG agreement or
--     contracting form from anyone in a solar system without it.
-- Safe to run again.

-- 1. Which solar systems contract through BIG in PaceLedger.
alter table public.solar_systems add column if not exists contracting boolean not null default true;

-- 2. Elite Financial Services. Promotion submissions and urgent Chat help go
--    to its Super Managers (no agency inbox).
insert into public.solar_systems (short_name, name, email_name, notify_email, activity_tools_default, contracting)
values ('EFS', 'Elite Financial Services', 'Elite Financial Services', null, false, false)
on conflict (short_name) do nothing;

-- 3. No BIG producer agreement or contracting form for someone whose solar
--    system doesn't contract through BIG.
create or replace function public.pl_contracts_here(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select s.contracting from public.profiles p join public.solar_systems s on s.id = p.solar_system_id where p.id = p_user), true);
$$;
revoke all on function public.pl_contracts_here(uuid) from public, anon;
grant execute on function public.pl_contracts_here(uuid) to authenticated;

create or replace function public.contracting_here_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.pl_contracts_here(new.user_id) then
    raise exception 'contracting_not_here';
  end if;
  return new;
end;
$$;
drop trigger if exists contracting_here_guard on public.producer_agreements;
create trigger contracting_here_guard before insert on public.producer_agreements
  for each row execute function public.contracting_here_guard();
drop trigger if exists contracting_here_guard on public.contracting_secrets;
create trigger contracting_here_guard before insert on public.contracting_secrets
  for each row execute function public.contracting_here_guard();
