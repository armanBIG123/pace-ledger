-- Manage Team: edit one person at a time, with a reason, and phone numbers.
--
-- From Pam's feedback (Nov 2026):
--   * Each person can have a phone number. They add it in Your account, or
--     a super admin adds it in Manage Team. Who can see it: the person,
--     everyone above them (their upline, any depth), and super admins
--     (Super Managers inside their own solar system).
--   * Manage Team saves one person at a time with a Save button. A super
--     admin (or a Super Manager, inside their solar system) can change a
--     person's name, phone, role, reports-to and comp level there.
--   * A role, reports-to or comp level change needs a reason. Every change
--     goes in the activity log with who did it, when, and the reason.
--
-- Run in the Supabase SQL Editor (New query -> paste -> Run) BEFORE merging
-- the website change. Safe to run more than once. Until it's run, Manage
-- Team says saving needs this update and phone numbers stay hidden.

begin;

-- 1) The activity log: the reason, and which person it was about ----------
alter table public.audit_log add column if not exists reason text;
alter table public.audit_log add column if not exists target_id uuid;
create index if not exists audit_log_target_idx on public.audit_log (target_id, created_at desc);

-- 2) Phone numbers, kept apart from profiles (which everyone can read) -----
create table if not exists public.person_contacts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  phone text check (phone is null or phone ~ '^[0-9]{10}$'),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.person_contacts enable row level security;

drop policy if exists "contacts: who can see" on public.person_contacts;
create policy "contacts: who can see" on public.person_contacts for select to authenticated
  using (user_id = auth.uid()
         or public.pl_admin_of(user_id)
         or user_id in (select public.my_downline_ids()));
drop policy if exists "solar system wall" on public.person_contacts;
create policy "solar system wall" on public.person_contacts as restrictive for all
  using (public.pl_sees_person(user_id)) with check (public.pl_sees_person(user_id));
-- Changes only go through the two functions below.
revoke insert, update, delete on public.person_contacts from public, anon, authenticated;
grant select on public.person_contacts to authenticated;

-- 10 digits; a leading 1 is dropped; blank clears it.
create or replace function public.pl_clean_phone(p text)
returns text
language plpgsql immutable
as $$
declare
  d text := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
begin
  if d = '' then
    return null;
  end if;
  if char_length(d) = 11 and left(d, 1) = '1' then
    d := substr(d, 2);
  end if;
  if char_length(d) <> 10 then
    raise exception 'phone_digits';
  end if;
  return d;
end;
$$;

-- 3) Your own phone number (Your account) ---------------------------------
create or replace function public.set_my_phone(p_phone text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  v text := public.pl_clean_phone(p_phone);
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  insert into public.person_contacts (user_id, phone, updated_at, updated_by)
  values (me, v, now(), me)
  on conflict (user_id) do update set phone = excluded.phone, updated_at = now(), updated_by = me;
  return v;
end;
$$;
revoke all on function public.set_my_phone(text) from public, anon;
grant execute on function public.set_my_phone(text) to authenticated;

-- 4) Manage Team: save one person ------------------------------------------
-- p_changes holds any of: display_name, phone, role, manager_id,
-- hierarchy_tier ("" clears manager_id, hierarchy_tier and phone). Keys left
-- out stay as they are. p_reason is required when the role, reports-to or
-- comp level changes. Returns the saved person, with their phone.
create or replace function public.pl_admin_save_person(p_user uuid, p_changes jsonb, p_reason text default null)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  acting public.profiles%rowtype;
  cur public.profiles%rowtype;
  saved public.profiles%rowtype;
  ch jsonb := coalesce(p_changes, '{}'::jsonb);
  v_reason text := nullif(btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g')), '');
  v_name text;
  v_role text;
  v_mgr uuid;
  v_tier text;
  v_phone text;
  v_old_phone text;
  ch_role boolean := false;
  ch_mgr boolean := false;
  ch_tier boolean := false;
  ch_phone boolean := false;
  mgr_name text;
  role_label constant jsonb := '{"advisor":"Advisor","manager":"Manager","super_manager":"Super Manager","super_admin":"Super Admin"}';
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  select * into acting from public.profiles where id = me;
  if not found or acting.role not in ('super_admin', 'super_manager') or not public.pl_admin_of(p_user) then
    raise exception 'not_allowed';
  end if;
  select * into cur from public.profiles where id = p_user for update;
  if not found then
    raise exception 'no_profile';
  end if;

  if ch ? 'display_name' then
    v_name := btrim(regexp_replace(coalesce(ch->>'display_name', ''), '\s+', ' ', 'g'));
    if char_length(v_name) < 2 then
      raise exception 'name_required';
    end if;
    if char_length(v_name) > 80 then
      raise exception 'name_too_long';
    end if;
  end if;

  if ch ? 'role' then
    v_role := ch->>'role';
    if v_role is null or v_role not in ('advisor', 'manager', 'super_manager', 'super_admin') then
      raise exception 'bad_role';
    end if;
    ch_role := v_role is distinct from cur.role;
  end if;
  if ch ? 'manager_id' then
    v_mgr := nullif(ch->>'manager_id', '')::uuid;
    ch_mgr := v_mgr is distinct from cur.manager_id;
  end if;
  if ch ? 'hierarchy_tier' then
    v_tier := nullif(ch->>'hierarchy_tier', '');
    if v_tier is not null and v_tier not in ('UA', 'FA', 'SA', 'AD', 'FD', 'SFD', 'DFD', 'EFD', 'FVC', 'EVC') then
      raise exception 'bad_level';
    end if;
    ch_tier := v_tier is distinct from cur.hierarchy_tier;
  end if;
  if ch ? 'phone' then
    v_phone := public.pl_clean_phone(ch->>'phone');
    select phone into v_old_phone from public.person_contacts where user_id = p_user;
    ch_phone := v_phone is distinct from v_old_phone;
  end if;

  -- Super Managers: not their own role, upline or level, and only between
  -- Advisor and Manager.
  if acting.role = 'super_manager' then
    if p_user = me and (ch_role or ch_mgr or ch_tier) then
      raise exception 'not_allowed';
    end if;
    if ch_role and not (cur.role in ('advisor', 'manager') and v_role in ('advisor', 'manager')) then
      raise exception 'not_allowed_role';
    end if;
  end if;
  if ch_role and cur.role = 'super_admin'
     and (select count(*) from public.profiles where role = 'super_admin') <= 1 then
    raise exception 'last_admin';
  end if;
  if ch_mgr and v_mgr is not null then
    if v_mgr = p_user
       or not exists (select 1 from public.profiles m where m.id = v_mgr
                      and m.solar_system_id is not distinct from cur.solar_system_id) then
      raise exception 'bad_upline';
    end if;
    if exists (
      with recursive below(id, depth) as (
        select p.id, 1 from public.profiles p where p.manager_id = p_user
        union all
        select p.id, b.depth + 1 from public.profiles p join below b on p.manager_id = b.id where b.depth < 60
      )
      select 1 from below where id = v_mgr
    ) then
      raise exception 'upline_loop';
    end if;
  end if;

  if (ch_role or ch_mgr or ch_tier) and v_reason is null then
    raise exception 'reason_required';
  end if;
  if char_length(coalesce(v_reason, '')) > 500 then
    raise exception 'reason_too_long';
  end if;

  -- Checked above, so the guard on profiles lets this one update through
  -- (as it does for Your account).
  perform set_config('pl.trusted_profile_edit', 'on', true);
  update public.profiles set
    display_name = coalesce(v_name, display_name),
    role = case when ch_role then v_role else role end,
    manager_id = case when ch_mgr then v_mgr else manager_id end,
    hierarchy_tier = case when ch_tier then v_tier else hierarchy_tier end
  where id = p_user
  returning * into saved;
  perform set_config('pl.trusted_profile_edit', '', true);

  if ch_phone then
    insert into public.person_contacts (user_id, phone, updated_at, updated_by)
    values (p_user, v_phone, now(), me)
    on conflict (user_id) do update set phone = excluded.phone, updated_at = now(), updated_by = me;
  end if;

  -- A new name shows on the appointments they present or train on, too.
  if saved.display_name is distinct from cur.display_name then
    update public.appointments set presenter = saved.display_name where presenter_id = p_user and presenter is distinct from saved.display_name;
    update public.appointments set trainee = saved.display_name where trainee_id = p_user and trainee is distinct from saved.display_name;
    insert into public.audit_log (actor_id, actor_name, action, target_name, target_id, details, reason)
    values (me, acting.display_name, 'Changed name', saved.display_name, p_user, cur.display_name || ' → ' || saved.display_name, v_reason);
  end if;
  if ch_phone then
    insert into public.audit_log (actor_id, actor_name, action, target_name, target_id, details, reason)
    values (me, acting.display_name, 'Changed phone', saved.display_name, p_user,
            case when v_old_phone is null then 'added' when v_phone is null then 'removed' else 'changed' end, v_reason);
  end if;
  if ch_role then
    insert into public.audit_log (actor_id, actor_name, action, target_name, target_id, details, reason)
    values (me, acting.display_name, 'Changed role', saved.display_name, p_user,
            coalesce(role_label->>cur.role, cur.role) || ' → ' || coalesce(role_label->>v_role, v_role), v_reason);
  end if;
  if ch_mgr then
    select display_name into mgr_name from public.profiles where id = v_mgr;
    insert into public.audit_log (actor_id, actor_name, action, target_name, target_id, details, reason)
    values (me, acting.display_name, 'Changed reports-to', saved.display_name, p_user,
            'now reports to ' || coalesce(mgr_name, 'nobody'), v_reason);
  end if;
  if ch_tier then
    insert into public.audit_log (actor_id, actor_name, action, target_name, target_id, details, reason)
    values (me, acting.display_name, 'Changed comp level', saved.display_name, p_user,
            coalesce(cur.hierarchy_tier, 'none') || ' → ' || coalesce(v_tier, 'none'), v_reason);
  end if;

  return to_jsonb(saved) || jsonb_build_object(
    'phone', (select phone from public.person_contacts where user_id = p_user));
end;
$$;
revoke all on function public.pl_admin_save_person(uuid, jsonb, text) from public, anon;
grant execute on function public.pl_admin_save_person(uuid, jsonb, text) to authenticated;

commit;

-- Check: should list the table, the two columns and the three functions.
select 'table' as what, 'person_contacts' as name where to_regclass('public.person_contacts') is not null
union all
select 'column', column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'audit_log' and column_name in ('reason', 'target_id')
union all
select 'function', proname from pg_proc where proname in ('pl_clean_phone', 'set_my_phone', 'pl_admin_save_person');
