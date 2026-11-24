-- What the Elite Financial Services migration needs beyond stubs/base.sql
-- (and the activity tools migration): the rest of solar_systems as it is
-- live, and the two contracting tables it guards.
alter table public.solar_systems alter column id set default gen_random_uuid(),
  add column email_name text, add column notify_email text,
  add constraint solar_systems_short_name_key unique (short_name);
update public.solar_systems set email_name = name;
alter table public.solar_systems alter column email_name set not null;
create table public.producer_agreements (id uuid primary key default gen_random_uuid(), user_id uuid, version text not null default 'BIG-IAA-2026.1',
  docuseal_submission_id bigint not null default 1, agent_name text not null default 'x', agent_email text not null default 'x@example.com');
create table public.contracting_secrets (user_id uuid primary key, key_id text not null default 'k', wrapped_key text not null default 'w',
  expires_at timestamptz not null default now() + interval '2 hours');
