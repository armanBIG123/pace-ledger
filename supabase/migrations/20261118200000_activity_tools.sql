-- Activity tools: a switch per person in Manage Team for PaceLedger's
-- activity side (Today's pace, Clients, appointments, follow-ups,
-- Calendar, Growth, and the Team views). With them off, someone sees only
-- Contracting (licensing, the producer agreement and contracting form),
-- Resources, Chat and MegaPhone, plus Manage Team for Super Managers.
--
-- profiles.activity_tools: true or false, or null for their solar
-- system's default. solar_systems.activity_tools_default: on for Big
-- Insurance Network, off for Big Huge Business (BHB uses PaceLedger for
-- contracting; a super admin turns the tools on for anyone who needs them).
-- Super admins always have everything. Only super admins can flip it.

alter table public.solar_systems add column if not exists activity_tools_default boolean not null default true;
update public.solar_systems set activity_tools_default = false where short_name = 'BHB';

alter table public.profiles add column if not exists activity_tools boolean;

-- Only super admins change activity_tools (not Super Managers, not yourself).
CREATE OR REPLACE FUNCTION "public"."protect_profile_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  acting public.profiles%rowtype;
begin
  -- Server-side work (sign-up, account deletion, service role), and the
  -- app's own trusted functions (your name, the header switch).
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;
  if coalesce(current_setting('pl.trusted_profile_edit', true), '') = 'on' then
    return new;
  end if;
  select * into acting from public.profiles where id = auth.uid();

  if acting.role = 'super_admin' then
    return new;
  end if;

  if acting.role = 'super_manager' and old.id <> acting.id then
    if new.solar_system_id is distinct from old.solar_system_id
       or new.viewing_system_id is distinct from old.viewing_system_id then
      raise exception 'Only super admins can move people between solar systems.';
    end if;
    if new.role is distinct from old.role
       and not (old.role in ('advisor', 'manager') and new.role in ('advisor', 'manager')) then
      raise exception 'Only super admins can make someone a Super Manager or super admin.';
    end if;
    if new.activity_tools is distinct from old.activity_tools then
      raise exception 'Only super admins can turn activity tools on or off.';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role
     or new.manager_id is distinct from old.manager_id
     or new.display_name is distinct from old.display_name
     or new.email is distinct from old.email
     or new.hierarchy_tier is distinct from old.hierarchy_tier
     or new.solar_system_id is distinct from old.solar_system_id
     or new.viewing_system_id is distinct from old.viewing_system_id
     or new.activity_tools is distinct from old.activity_tools then
    raise exception 'Not authorized to change this field';
  end if;
  return new;
end;
$$;

-- Manage Team → Edit saves it with everything else, in the activity log.
CREATE OR REPLACE FUNCTION "public"."pl_admin_save_person"("p_user" "uuid", "p_changes" "jsonb", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
  v_tools boolean;
  ch_tools boolean := false;
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
  -- Activity tools: true / false, or null for the solar system's default.
  if ch ? 'activity_tools' then
    if jsonb_typeof(ch->'activity_tools') not in ('boolean', 'null') then
      raise exception 'bad_activity_tools';
    end if;
    v_tools := (ch->>'activity_tools')::boolean;
    ch_tools := v_tools is distinct from cur.activity_tools;
    if ch_tools and acting.role <> 'super_admin' then
      raise exception 'not_allowed_tools';
    end if;
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
    hierarchy_tier = case when ch_tier then v_tier else hierarchy_tier end,
    activity_tools = case when ch_tools then v_tools else activity_tools end
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
  if ch_tools then
    insert into public.audit_log (actor_id, actor_name, action, target_name, target_id, details, reason)
    values (me, acting.display_name,
            case when v_tools then 'Turned on activity tools' when v_tools = false then 'Turned off activity tools' else 'Reset activity tools' end,
            saved.display_name, p_user, null, v_reason);
  end if;

  return to_jsonb(saved) || jsonb_build_object(
    'phone', (select phone from public.person_contacts where user_id = p_user));
end;
$$;
