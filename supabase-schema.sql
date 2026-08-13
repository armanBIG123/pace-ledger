-- PaceLedger database schema for Supabase
-- Run this once in your Supabase project: Dashboard -> SQL Editor -> New query -> paste -> Run

-- One row per person, linked to Supabase's built-in auth.users table.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('advisor', 'manager')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Any logged-in person can see the list of names/roles (needed so managers
-- can see the advisor roster). Nothing sensitive lives in this table.
create policy "profiles are viewable by any authenticated user"
  on profiles for select
  using (auth.role() = 'authenticated');

-- You can only ever create your own profile row, at signup.
create policy "users can insert their own profile"
  on profiles for insert
  with check (auth.uid() = id);

-- One row per logged appointment.
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date_set_option text not null,
  category text not null,
  week_of date not null,
  appointment_date date not null,
  appointment_time time not null,
  presenter text not null,
  trainee text,
  client_name text not null,
  notes text,
  created_at timestamptz not null default now()
);

alter table appointments enable row level security;

-- Advisors can fully manage (read/add/delete) only their own rows.
create policy "advisors manage their own appointments"
  on appointments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Managers can read everyone's appointments (but not edit/delete them).
create policy "managers can view all appointments"
  on appointments for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'manager'
    )
  );

create index if not exists appointments_week_of_idx on appointments (week_of);
create index if not exists appointments_user_id_idx on appointments (user_id);
