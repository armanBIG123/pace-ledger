


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."accept_chat_rules"() RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  accepted timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  insert into public.chat_rules (user_id) values (auth.uid())
  on conflict (user_id) do update set accepted_at = public.chat_rules.accepted_at
  returning accepted_at into accepted;
  return accepted;
end;
$$;


ALTER FUNCTION "public"."accept_chat_rules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_licensing"("p_user" "uuid", "p_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  me uuid := auth.uid();
  r public.licensing_progress;
  pr public.profiles;
  v_npn text := nullif(regexp_replace(coalesce(p_data->>'npn', ''), '[\s-]', '', 'g'), '');
  v_fg text := nullif(btrim(coalesce(p_data->>'fg_writing_number', '')), '');
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  if not public.pl_admin_of(p_user) then
    raise exception 'not_allowed';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'no_profile';
  end if;
  if p_data ? 'npn' and v_npn is not null and v_npn !~ '^[0-9]{1,15}$' then
    raise exception 'npn_digits';
  end if;
  if p_data ? 'fg_writing_number' and v_fg is not null and char_length(v_fg) > 40 then
    raise exception 'fg_too_long';
  end if;

  insert into public.licensing_progress (user_id) values (p_user) on conflict (user_id) do nothing;
  update public.licensing_progress set
    course_started_on = case when p_data ? 'course_started_on' then nullif(p_data->>'course_started_on', '')::date else course_started_on end,
    course_completed_on = case when p_data ? 'course_completed_on' then nullif(p_data->>'course_completed_on', '')::date else course_completed_on end,
    exam_on = case when p_data ? 'exam_on' then nullif(p_data->>'exam_on', '')::date else exam_on end,
    exam_passed_on = case when p_data ? 'exam_passed_on' then nullif(p_data->>'exam_passed_on', '')::date else exam_passed_on end,
    contracting_sent_on = case when p_data ? 'contracting_sent_on' then nullif(p_data->>'contracting_sent_on', '')::date else contracting_sent_on end,
    contracting_sent_by = case
      when not (p_data ? 'contracting_sent_on') then contracting_sent_by
      when nullif(p_data->>'contracting_sent_on', '') is null then null
      else coalesce(contracting_sent_by, me) end,
    profile_submitted_on = case when p_data ? 'profile_submitted_on' then nullif(p_data->>'profile_submitted_on', '')::date else profile_submitted_on end
  where user_id = p_user
  returning * into r;

  if p_data ? 'npn' or p_data ? 'fg_writing_number' then
    update public.profiles set
      npn = case when p_data ? 'npn' then v_npn else npn end,
      fg_writing_number = case when p_data ? 'fg_writing_number' then v_fg else fg_writing_number end
    where id = p_user
    returning * into pr;
  else
    select * into pr from public.profiles where id = p_user;
  end if;

  return jsonb_build_object('progress', to_jsonb(r), 'npn', pr.npn, 'fg_writing_number', pr.fg_writing_number, 'licensed_at', pr.licensed_at);
end;
$_$;


ALTER FUNCTION "public"."admin_update_licensing"("p_user" "uuid", "p_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."announcement_confirm_stamp"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.user_id := auth.uid();
  new.confirmed_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."announcement_confirm_stamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."announcements_stamp"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_by_name := (select display_name from public.profiles where id = auth.uid());
    new.created_at := now();
    new.starts_at := now();
    new.ended_at := null;
  else
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
    new.starts_at := old.starts_at;
    -- "End now" saves the database's time.
    if new.ended_at is not null and old.ended_at is null then
      new.ended_at := now();
    elsif new.ended_at is not null then
      new.ended_at := old.ended_at;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."announcements_stamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."appointments_keep_prospect_own"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.prospect_id is not null
     and not exists (select 1 from public.prospects p where p.id = new.prospect_id and p.user_id = new.user_id) then
    new.prospect_id := null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."appointments_keep_prospect_own"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."appointments_split_rules"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Only a sale is split, only with whoever presented it (not the advisor),
  -- and only with a share. Anything else just isn't split.
  if not coalesce(new.officially_sold, false)
     or new.split_user_id is null or new.split_percent is null
     or new.split_user_id is distinct from new.presenter_id
     or new.split_user_id = new.user_id then
    new.split_user_id := null;
    new.split_percent := null;
    return new;
  end if;
  if new.split_percent < 1 or new.split_percent > 99 then
    raise exception 'bad_split';
  end if;
  -- Checked when the split is set or changed: both are licensed and appointed.
  if tg_op = 'INSERT' or new.split_user_id is distinct from old.split_user_id or new.split_percent is distinct from old.split_percent then
    if not exists (select 1 from public.profiles p where p.id = new.user_id and coalesce(btrim(p.fg_writing_number), '') <> '')
       or not exists (select 1 from public.profiles p where p.id = new.split_user_id and coalesce(btrim(p.fg_writing_number), '') <> '') then
      raise exception 'split_needs_writing_numbers';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."appointments_split_rules"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."promotion_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "from_tier" "text",
    "to_tier" "text" NOT NULL,
    "status" "text" DEFAULT 'submitted'::"text" NOT NULL,
    "results" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "submitted_by" "uuid",
    "submitted_by_name" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "emailed_to" "text",
    "emailed_at" timestamp with time zone,
    "decided_by" "uuid",
    "decided_by_name" "text",
    "decided_at" timestamp with time zone,
    "decision_note" "text",
    CONSTRAINT "promotion_requests_decision_note_check" CHECK ((("decision_note" IS NULL) OR ("length"("decision_note") <= 500))),
    CONSTRAINT "promotion_requests_status_check" CHECK (("status" = ANY (ARRAY['submitted'::"text", 'approved'::"text", 'sent_back'::"text"]))),
    CONSTRAINT "promotion_requests_to_tier_check" CHECK (("to_tier" = ANY (ARRAY['FA'::"text", 'SA'::"text", 'AD'::"text", 'FD'::"text", 'SFD'::"text", 'DFD'::"text", 'EFD'::"text", 'FVC'::"text", 'EVC'::"text"])))
);


ALTER TABLE "public"."promotion_requests" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_promotion"("p_request" "uuid") RETURNS "public"."promotion_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  r public.promotion_requests;
  me_name text;
  me_role text;
  cur text;
begin
  select display_name, role into me_name, me_role from public.profiles where id = auth.uid();
  if not public.pl_can_decide_promotion(p_request) then
    raise exception 'Only super admins can approve promotions.';
  end if;
  select * into r from public.promotion_requests where id = p_request for update;
  if not found then
    raise exception 'That submission wasn''t found.';
  end if;
  if r.status <> 'submitted' then
    raise exception 'That submission was already %.', replace(r.status, '_', ' ');
  end if;
  select hierarchy_tier into cur from public.profiles where id = r.user_id for update;
  if cur is distinct from r.from_tier then
    raise exception 'Their level changed since this was submitted. Send it back, then submit again.';
  end if;
  update public.profiles set hierarchy_tier = r.to_tier where id = r.user_id;
  update public.promotion_requests
     set status = 'approved', decided_by = auth.uid(), decided_by_name = me_name, decided_at = now()
   where id = r.id
  returning * into r;
  return r;
end;
$$;


ALTER FUNCTION "public"."approve_promotion"("p_request" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_solar_system"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.solar_system_id is null then
    new.solar_system_id := coalesce(public.pl_system_of(new.manager_id), public.pl_big_system());
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."assign_solar_system"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chat_cleanup"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  delete from public.chat_messages m
   where m.created_at < now() - interval '90 days'
     and not exists (select 1 from public.chat_reports r where r.message_id = m.id and r.resolved_at is null);
  return null;
end;
$$;


ALTER FUNCTION "public"."chat_cleanup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chat_mask"("p_text" "text") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  w text;
  masked text := p_text;
begin
  for w in select word from public.chat_filter_words loop
    masked := regexp_replace(masked, '\m' || w || '\w*', '****', 'gi');
  end loop;
  return masked;
end;
$$;


ALTER FUNCTION "public"."chat_mask"("p_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chat_unread_counts"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with c(channel) as (values ('general'), ('work'), ('urgent')),
  counts as (
    select c.channel, (
      select count(*) from public.chat_messages m
       where m.channel = c.channel and m.solar_system_id = public.pl_writer_system()
         and m.user_id <> auth.uid()
         and m.deleted_at is null
         and m.created_at > coalesce(r.last_read_at, now() - interval '7 days')
         and not exists (select 1 from public.chat_blocks b where b.blocker_id = auth.uid() and b.blocked_id = m.user_id)
    ) as n
    from c left join public.chat_reads r on r.user_id = auth.uid() and r.channel = c.channel
  )
  select jsonb_object_agg(channel, n)
         || jsonb_build_object('reports', case
              when public.pl_is_system_admin()
              then (select count(*) from public.chat_reports cr join public.chat_messages cm on cm.id = cr.message_id
                     where cr.resolved_at is null and cm.solar_system_id = public.pl_writer_system()) else 0 end)
    from counts
   where auth.uid() is not null;
$$;


ALTER FUNCTION "public"."chat_unread_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_appointment_conflict"("p_presenter_id" "uuid", "p_date" "date", "p_time" time without time zone, "p_timezone" "text" DEFAULT NULL::"text", "p_exclude_appointment_id" "uuid" DEFAULT NULL::"uuid", "p_duration" integer DEFAULT 60) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_tz text := coalesce(p_timezone, 'America/New_York');
  v_len integer := least(greatest(coalesce(p_duration, 60), 5), 720);
  v_start timestamptz := (p_date + p_time) at time zone v_tz;
  v_end timestamptz := v_start + make_interval(mins => v_len);
  v_admin boolean := public.pl_admin_of(p_presenter_id);
  v_may_see boolean;
  v_hit record;
  v_block record;
begin
  -- Another appointment this person is tied up in (they booked it, they're
  -- presenting, or they're sitting in as the trainee) that overlaps this
  -- one, compared as real instants whatever time zone each was entered in.
  -- Old rows saved before time zones existed (appointment_at is null) are
  -- read in this booking's time zone, as before.
  select t.s, t.e into v_hit
  from public.appointments x
  cross join lateral (
    select coalesce(x.appointment_at, (x.appointment_date + x.appointment_time) at time zone v_tz) as s
  ) b
  cross join lateral (
    select b.s, b.s + make_interval(mins => coalesce(x.duration_minutes, 30)) as e
  ) t
  -- Only appointments they're presenting: booking one for someone else to
  -- present, or sitting in on one as the trainee (training), doesn't take
  -- up their time. Old rows with no presenter: the person who booked it.
  where (x.presenter_id = p_presenter_id or (x.presenter_id is null and x.user_id = p_presenter_id))
    and (p_exclude_appointment_id is null or x.id <> p_exclude_appointment_id)
    and t.s < v_end
    and t.e > v_start
  order by t.s
  limit 1;

  if found then
    v_may_see := p_presenter_id = auth.uid()
      or p_presenter_id in (select public.my_upline_ids())
      or p_presenter_id in (select public.my_downline_ids())
      or v_admin;
    return jsonb_build_object('conflict', true, 'reason', 'appointment',
      'starts_at', case when v_may_see then v_hit.s end,
      'ends_at', case when v_may_see then v_hit.e end);
  end if;

  -- A blocked-out time (My schedule) that overlaps it. Blocks saved before
  -- time zones were (start_at/end_at are null) are read in this booking's
  -- time zone.
  select b.label,
         coalesce(b.start_at, (b.block_date + b.start_time) at time zone v_tz) as s,
         coalesce(b.end_at, (b.block_date + b.end_time) at time zone v_tz) as e
  into v_block
  from public.manager_availability_blocks b
  where b.user_id = p_presenter_id
    and coalesce(b.start_at, (b.block_date + b.start_time) at time zone v_tz) < v_end
    and coalesce(b.end_at, (b.block_date + b.end_time) at time zone v_tz) > v_start
  order by 2
  limit 1;

  if found then
    v_may_see := p_presenter_id = auth.uid()
      or p_presenter_id in (select public.my_upline_ids())
      or p_presenter_id in (select public.my_downline_ids())
      or v_admin;
    -- The reason they typed only goes to them, the people above them and
    -- super admins (the same as on the Calendar).
    return jsonb_build_object('conflict', true, 'reason', 'unavailable',
      'label', case when p_presenter_id = auth.uid()
                      or p_presenter_id in (select public.my_downline_ids())
                      or v_admin
                    then v_block.label end,
      'starts_at', case when v_may_see then v_block.s end,
      'ends_at', case when v_may_see then v_block.e end);
  end if;

  return jsonb_build_object('conflict', false);
end;
$$;


ALTER FUNCTION "public"."check_appointment_conflict"("p_presenter_id" "uuid", "p_date" "date", "p_time" time without time zone, "p_timezone" "text", "p_exclude_appointment_id" "uuid", "p_duration" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_appointment_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.appointment_date is not null and new.appointment_time is not null and new.appointment_timezone is not null then
    new.appointment_at := (new.appointment_date::text || ' ' || new.appointment_time::text)::timestamp
      at time zone new.appointment_timezone;
  else
    new.appointment_at := null;
  end if;

  if new.follow_up_appointment_date is not null and new.follow_up_appointment_time is not null and new.follow_up_appointment_timezone is not null then
    new.follow_up_appointment_at := (new.follow_up_appointment_date::text || ' ' || new.follow_up_appointment_time::text)::timestamp
      at time zone new.follow_up_appointment_timezone;
  else
    new.follow_up_appointment_at := null;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."compute_appointment_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_schedule_block_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.block_date is not null and new.start_time is not null and new.timezone is not null then
    new.start_at := (new.block_date::text || ' ' || new.start_time::text)::timestamp at time zone new.timezone;
  else
    new.start_at := null;
  end if;
  if new.block_date is not null and new.end_time is not null and new.timezone is not null then
    new.end_at := (new.block_date::text || ' ' || new.end_time::text)::timestamp at time zone new.timezone;
  else
    new.end_at := null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."compute_schedule_block_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_training_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.training_date is not null and new.training_time is not null and new.timezone is not null then
    new.training_at := (new.training_date::text || ' ' || new.training_time::text)::timestamp
      at time zone new.timezone;
  else
    new.training_at := null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."compute_training_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contracting_admin_log"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.pl_contracting_check();
  return coalesce((
    select jsonb_agg(jsonb_build_object('at', l.at, 'agent', l.agent_name, 'actor', l.actor_name, 'action', l.action, 'detail', l.detail) order by l.at desc)
      from (select * from public.contracting_log order by at desc limit 300) l), '[]'::jsonb);
end;
$$;


ALTER FUNCTION "public"."contracting_admin_log"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contracting_case"("p_user" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  me uuid := auth.uid();
  sec public.contracting_secrets;
begin
  perform public.pl_contracting_check();
  perform public.contracting_purge_expired();
  select * into sec from public.contracting_secrets where user_id = p_user and submitted_at is not null;
  if found and not exists (
    select 1 from public.contracting_log
     where user_id = p_user and actor_id = me and action = 'opened' and at > now() - interval '10 minutes') then
    perform public.pl_contracting_log(p_user, 'opened', 'Opened their contracting info');
  end if;
  return jsonb_build_object(
    'person', (select jsonb_build_object('id', p.id, 'name', p.display_name, 'npn', p.npn, 'email', u.email,
                      'solar_system', ss.short_name, 'upline', up.display_name, 'writing_number', p.fg_writing_number)
                 from public.profiles p left join auth.users u on u.id = p.id
                 left join public.solar_systems ss on ss.id = p.solar_system_id
                 left join public.profiles up on up.id = p.manager_id
                where p.id = p_user),
    'agreements', coalesce((select jsonb_agg(to_jsonb(a) - 'agent_submitter_id' - 'big_submitter_id' order by a.created_at desc)
                              from public.producer_agreements a where a.user_id = p_user), '[]'::jsonb),
    'case', (select to_jsonb(c) from public.contracting_cases c where c.user_id = p_user),
    'info', case when sec.user_id is null then null else jsonb_build_object(
              'sent_at', sec.submitted_at, 'expires_at', sec.expires_at, 'key_id', sec.key_id,
              'fields', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb) from jsonb_object_keys(sec.fields) k),
              'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'mime', f.mime, 'size', f.size) order by f.kind, f.created_at), '[]'::jsonb)
                          from public.contracting_files f where f.user_id = p_user)) end,
    'log', (select coalesce(jsonb_agg(jsonb_build_object('at', l.at, 'actor', l.actor_name, 'action', l.action, 'detail', l.detail) order by l.at desc), '[]'::jsonb)
              from (select * from public.contracting_log where user_id = p_user order by at desc limit 100) l));
end;
$$;


ALTER FUNCTION "public"."contracting_case"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contracting_counts"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.pl_is_contracting_staff() then return null; end if;
  return jsonb_build_object(
    'countersign', (select count(*) from public.producer_agreements a
                     where a.status = 'agent_signed'
                       and a.created_at = (select max(b.created_at) from public.producer_agreements b where b.user_id = a.user_id)),
    'to_enter', (select count(*) from public.contracting_secrets where submitted_at is not null and expires_at > now()),
    'oldest_expires_at', (select min(expires_at) from public.contracting_secrets where submitted_at is not null and expires_at > now()));
end;
$$;


ALTER FUNCTION "public"."contracting_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contracting_discard_draft"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  delete from public.contracting_secrets where user_id = auth.uid() and submitted_at is null;
$$;


ALTER FUNCTION "public"."contracting_discard_draft"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contracting_kill_switch"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  r record;
  n integer := 0;
begin
  perform public.pl_contracting_check();
  for r in select user_id, submitted_at from public.contracting_secrets loop
    if r.submitted_at is not null then
      perform public.pl_contracting_delete(r.user_id, 'kill_switch');
      perform public.pl_contracting_log(r.user_id, 'kill_switch', 'Deleted by the kill switch');
      n := n + 1;
    else
      delete from public.contracting_secrets where user_id = r.user_id;
    end if;
  end loop;
  update public.contracting_settings set paused = true, updated_at = now() where id;
  perform public.pl_contracting_log(null, 'kill_switch', format('Kill switch: deleted %s submission(s) and paused the form', n));
  return n;
end;
$$;


ALTER FUNCTION "public"."contracting_kill_switch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contracting_log_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  raise exception 'The contracting log can''t be changed.';
end;
$$;


ALTER FUNCTION "public"."contracting_log_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contracting_mark_entered"("p_user" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.pl_contracting_check();
  if not public.pl_contracting_delete(p_user, 'entered') then raise exception 'nothing_to_enter'; end if;
  perform public.pl_contracting_log(p_user, 'entered', 'Marked entered in SureLC; the info was deleted');
  return (select to_jsonb(c) from public.contracting_cases c where c.user_id = p_user);
end;
$$;


ALTER FUNCTION "public"."contracting_mark_entered"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contracting_mark_reviewed"() RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.pl_contracting_check();
  update public.contracting_settings set last_review_at = now(), last_review_by = auth.uid(), updated_at = now() where id;
  perform public.pl_contracting_log(null, 'access_review', 'Reviewed the contracting team and the access log');
  return now();
end;
$$;


ALTER FUNCTION "public"."contracting_mark_reviewed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contracting_mark_step"("p_user" "uuid", "p_step" "text", "p_on" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  c public.contracting_cases;
begin
  perform public.pl_contracting_check();
  select * into c from public.contracting_cases where user_id = p_user;
  if not found or c.entered_at is null then raise exception 'not_entered_yet'; end if;
  if p_step = 'review_sent' then
    if not p_on and c.agent_signed_at is not null then raise exception 'undo_later_step_first'; end if;
    update public.contracting_cases set review_sent_at = case when p_on then coalesce(review_sent_at, now()) end, updated_at = now() where user_id = p_user;
  elsif p_step = 'agent_signed' then
    if p_on and c.review_sent_at is null then raise exception 'earlier_step_first'; end if;
    if not p_on and c.sent_to_carrier_at is not null then raise exception 'undo_later_step_first'; end if;
    update public.contracting_cases set agent_signed_at = case when p_on then coalesce(agent_signed_at, now()) end, updated_at = now() where user_id = p_user;
  elsif p_step = 'sent_to_carrier' then
    if p_on and c.agent_signed_at is null then raise exception 'earlier_step_first'; end if;
    update public.contracting_cases set sent_to_carrier_at = case when p_on then coalesce(sent_to_carrier_at, now()) end, updated_at = now() where user_id = p_user;
  else
    raise exception 'unknown_step';
  end if;
  perform public.pl_contracting_log(p_user, case when p_on then p_step else 'undo_' || p_step end, null);
  return (select to_jsonb(x) from public.contracting_cases x where x.user_id = p_user);
end;
$$;


ALTER FUNCTION "public"."contracting_mark_step"("p_user" "uuid", "p_step" "text", "p_on" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contracting_purge_expired"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  r record;
  n integer := 0;
begin
  for r in select user_id, submitted_at from public.contracting_secrets where expires_at <= now() loop
    if r.submitted_at is not null then
      perform public.pl_contracting_delete(r.user_id, 'expired');
      insert into public.contracting_log (user_id, agent_name, action, detail)
      values (r.user_id, (select display_name from public.profiles where id = r.user_id), 'expired', 'Deleted automatically 72 hours after it was sent');
    else
      delete from public.contracting_secrets where user_id = r.user_id;
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;


ALTER FUNCTION "public"."contracting_purge_expired"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contracting_put_file"("p_kind" "text", "p_mime" "text", "p_size" integer, "p_name" "jsonb", "p_iv" "text", "p_ct" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  me uuid := auth.uid();
  new_id uuid;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from public.contracting_secrets where user_id = me and submitted_at is null and expires_at > now()) then
    raise exception 'no_draft';
  end if;
  if p_kind not in ('dl_front', 'eo_certificate', 'aml_certificate', 'background_doc', 'bank_doc') then raise exception 'bad_file'; end if;
  if not public.pl_contracting_field_ok('file', p_name) then raise exception 'bad_file'; end if;
  if (select count(*) from public.contracting_files where user_id = me) >= 10 then raise exception 'too_many_files'; end if;
  if p_kind <> 'background_doc' and exists (select 1 from public.contracting_files where user_id = me and kind = p_kind) then
    raise exception 'too_many_files';
  end if;
  if coalesce((select sum(size) from public.contracting_files where user_id = me), 0) + coalesce(p_size, 0) > 20971520 then
    raise exception 'files_too_big';
  end if;
  insert into public.contracting_files (user_id, kind, mime, size, name, iv, ct)
  values (me, p_kind, p_mime, p_size, p_name, p_iv, p_ct)
  returning id into new_id;
  return new_id;
end;
$$;


ALTER FUNCTION "public"."contracting_put_file"("p_kind" "text", "p_mime" "text", "p_size" integer, "p_name" "jsonb", "p_iv" "text", "p_ct" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contracting_queue"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.pl_contracting_check();
  perform public.contracting_purge_expired();
  return coalesce((
    select jsonb_agg(row_to_json(q) order by q.sort_key, q.sort_time)
    from (
      select p.id as user_id, p.display_name as name, p.npn,
             ss.short_name as solar_system,
             up.display_name as upline,
             a.id as agreement_id, a.status as agreement_status, a.version, a.election,
             a.agent_signed_at, a.countersigned_at,
             c.info_sent_at, c.info_deleted_at, c.delete_reason, c.entered_at, c.review_sent_at, c.agent_signed_at as surelc_signed_at, c.sent_to_carrier_at,
             s.expires_at, (s.user_id is not null) as has_info,
             (select count(*) from public.contracting_files f where f.user_id = s.user_id) as files,
             p.fg_writing_number is not null and p.fg_writing_number <> '' as has_writing_number,
             case
               when s.user_id is not null then 0
               when a.status = 'agent_signed' then 1
               when c.entered_at is not null and c.sent_to_carrier_at is null then 2
               when a.status = 'completed' and c.info_sent_at is null then 3
               when a.status = 'sent' then 4
               else 5 end as sort_key,
             coalesce(s.expires_at, a.agent_signed_at, c.entered_at, a.created_at) as sort_time
        from public.profiles p
        left join lateral (select * from public.producer_agreements x where x.user_id = p.id order by x.created_at desc limit 1) a on true
        left join public.contracting_cases c on c.user_id = p.id
        left join public.contracting_secrets s on s.user_id = p.id and s.submitted_at is not null
        left join public.solar_systems ss on ss.id = p.solar_system_id
        left join public.profiles up on up.id = p.manager_id
       where a.id is not null or c.user_id is not null
    ) q), '[]'::jsonb);
end;
$$;


ALTER FUNCTION "public"."contracting_queue"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contracting_set_agreement"("p_version" "text", "p_template_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
begin
  perform public.pl_contracting_check();
  if p_version !~ '^[A-Za-z0-9][A-Za-z0-9 ._-]{1,40}$' then raise exception 'bad_version'; end if;
  if p_template_id is null or p_template_id <= 0 then raise exception 'bad_template'; end if;
  update public.contracting_settings set agreement_version = p_version, docuseal_template_id = p_template_id, updated_at = now() where id;
  perform public.pl_contracting_log(null, 'agreement', format('Agreement version %s, DocuSeal template %s', p_version, p_template_id));
end;
$_$;


ALTER FUNCTION "public"."contracting_set_agreement"("p_version" "text", "p_template_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contracting_set_enabled"("p_enabled" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  s public.contracting_settings;
begin
  perform public.pl_contracting_check();
  select * into s from public.contracting_settings where id;
  if p_enabled and (s.key_id is null or s.key_verified_at is null) then raise exception 'key_not_ready'; end if;
  if p_enabled and (s.agreement_version is null or s.docuseal_template_id is null) then raise exception 'agreement_not_ready'; end if;
  update public.contracting_settings set enabled = p_enabled, updated_at = now() where id;
  perform public.pl_contracting_log(null, case when p_enabled then 'turned_on' else 'turned_off' end, null);
end;
$$;


ALTER FUNCTION "public"."contracting_set_enabled"("p_enabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contracting_set_key"("p_public_key" "jsonb", "p_key_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
begin
  perform public.pl_contracting_check();
  if exists (select 1 from public.contracting_secrets) then raise exception 'info_pending'; end if;
  if jsonb_typeof(p_public_key) <> 'object' or p_public_key->>'kty' <> 'RSA' or p_public_key->>'alg' <> 'RSA-OAEP-256'
     or char_length(coalesce(p_public_key->>'n', '')) < 340 or p_public_key ? 'd' then
    raise exception 'bad_key';
  end if;
  if p_key_id !~ '^[0-9a-f]{16}$' then raise exception 'bad_key'; end if;
  update public.contracting_settings
     set public_key = p_public_key, key_id = p_key_id, key_set_at = now(), key_set_by = auth.uid(), key_verified_at = null,
         enabled = false, updated_at = now()
   where id;
  perform public.pl_contracting_log(null, 'new_key', 'Made a new encryption key ' || p_key_id);
end;
$_$;


ALTER FUNCTION "public"."contracting_set_key"("p_public_key" "jsonb", "p_key_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contracting_set_paused"("p_paused" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.pl_contracting_check();
  update public.contracting_settings set paused = p_paused, updated_at = now() where id;
  perform public.pl_contracting_log(null, case when p_paused then 'paused' else 'unpaused' end, null);
end;
$$;


ALTER FUNCTION "public"."contracting_set_paused"("p_paused" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contracting_set_staff"("p_user" "uuid", "p_on" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.pl_contracting_team_check();
  if p_on then
    if not exists (select 1 from public.profiles where id = p_user and role = 'super_admin') then raise exception 'super_admins_only'; end if;
    insert into public.contracting_staff (user_id, added_by) values (p_user, auth.uid()) on conflict (user_id) do nothing;
  else
    delete from public.contracting_staff where user_id = p_user;
  end if;
  perform public.pl_contracting_log(null, case when p_on then 'staff_added' else 'staff_removed' end,
    (select display_name from public.profiles where id = p_user));
end;
$$;


ALTER FUNCTION "public"."contracting_set_staff"("p_user" "uuid", "p_on" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contracting_staff_list"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.pl_contracting_team_check();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'on', s.user_id is not null) order by p.display_name)
      from public.profiles p left join public.contracting_staff s on s.user_id = p.id
     where p.role = 'super_admin'), '[]'::jsonb);
end;
$$;


ALTER FUNCTION "public"."contracting_staff_list"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contracting_start"("p_key_id" "text", "p_wrapped_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  me uuid := auth.uid();
  s public.contracting_settings;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  select * into s from public.contracting_settings where id;
  if not s.enabled then raise exception 'contracting_off'; end if;
  if s.paused then raise exception 'contracting_paused'; end if;
  if s.key_id is null or p_key_id is distinct from s.key_id then raise exception 'key_changed'; end if;
  if not exists (select 1 from public.producer_agreements where user_id = me and status = 'completed') then
    raise exception 'agreement_not_countersigned';
  end if;
  if exists (select 1 from public.contracting_secrets where user_id = me and submitted_at is not null) then
    raise exception 'already_sent';
  end if;
  if p_wrapped_key is null or char_length(p_wrapped_key) not between 100 and 2000 then raise exception 'bad_key'; end if;
  delete from public.contracting_secrets where user_id = me;
  insert into public.contracting_secrets (user_id, key_id, wrapped_key, expires_at)
  values (me, p_key_id, p_wrapped_key, now() + interval '2 hours');
end;
$$;


ALTER FUNCTION "public"."contracting_start"("p_key_id" "text", "p_wrapped_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contracting_submit"("p_fields" "jsonb") RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  me uuid := auth.uid();
  k text;
  v jsonb;
  allowed text[] := array['first_name', 'middle_name', 'last_name', 'ssn', 'dob', 'gender', 'email', 'phone',
    'street', 'city', 'state', 'zip', 'dl_number', 'dl_state', 'dl_expires',
    'bank_name', 'account_type', 'routing', 'account',
    'eo_has', 'eo_carrier', 'eo_policy', 'eo_amount', 'eo_expires',
    'aml_done', 'aml_provider', 'aml_date', 'background'];
  required text[] := array['first_name', 'last_name', 'ssn', 'dob', 'gender', 'email', 'phone',
    'street', 'city', 'state', 'zip', 'dl_number', 'dl_state', 'dl_expires',
    'bank_name', 'account_type', 'routing', 'account', 'eo_has', 'aml_done', 'background'];
  until_at timestamptz := now() + interval '72 hours';
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if (select paused from public.contracting_settings where id) then raise exception 'contracting_paused'; end if;
  if not exists (select 1 from public.contracting_secrets where user_id = me and submitted_at is null and expires_at > now()) then
    raise exception 'no_draft';
  end if;
  if jsonb_typeof(p_fields) <> 'object' then raise exception 'bad_fields'; end if;
  for k, v in select * from jsonb_each(p_fields) loop
    if not (k = any(allowed)) or not public.pl_contracting_field_ok(k, v) then raise exception 'bad_fields'; end if;
  end loop;
  foreach k in array required loop
    if not (p_fields ? k) then raise exception 'missing_fields'; end if;
  end loop;

  update public.contracting_secrets
     set fields = p_fields, submitted_at = now(), expires_at = until_at
   where user_id = me;

  insert into public.contracting_cases (user_id, info_sent_at, expires_at)
  values (me, now(), until_at)
  on conflict (user_id) do update
     set info_sent_at = now(), expires_at = until_at, notified_at = null, info_deleted_at = null, delete_reason = null,
         entered_at = null, entered_by = null, review_sent_at = null, agent_signed_at = null, sent_to_carrier_at = null,
         updated_at = now();

  insert into public.licensing_progress (user_id) values (me) on conflict (user_id) do nothing;
  update public.licensing_progress
     set profile_submitted_on = public.pl_central_today(),
         contracting_sent_on = coalesce(contracting_sent_on, public.pl_central_today())
   where user_id = me;

  perform public.pl_contracting_log(me, 'sent', 'Sent contracting info, encrypted on their device');
  return until_at;
end;
$$;


ALTER FUNCTION "public"."contracting_submit"("p_fields" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contracting_withdraw"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if not public.pl_contracting_delete(me, 'withdrawn') then return false; end if;
  perform public.pl_contracting_log(me, 'withdrawn', 'Withdrew their info; it was deleted');
  return true;
end;
$$;


ALTER FUNCTION "public"."contracting_withdraw"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_chat_message"("p_message" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  me uuid := auth.uid();
  author uuid;
  is_admin boolean;
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  select user_id into author from public.chat_messages where id = p_message and deleted_at is null;
  if not found then
    return;
  end if;
  is_admin := public.pl_admin_of(author);
  if author is distinct from me and not coalesce(is_admin, false) then
    raise exception 'not_allowed';
  end if;
  update public.chat_messages set deleted_at = now(), deleted_by = me, body = '' where id = p_message;
  update public.chat_reports set resolved_at = now(), resolved_by = me, outcome = 'removed'
   where message_id = p_message and resolved_at is null;
end;
$$;


ALTER FUNCTION "public"."delete_chat_message"("p_message" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_document"("p_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  d public.documents%rowtype;
begin
  select * into d from public.documents where id = p_id;
  if not found then return null; end if;
  if not (public.pl_is_galaxy_admin() or (public.pl_is_super_manager() and d.solar_system_id = public.pl_home_system())) then
    raise exception 'not_allowed';
  end if;
  delete from public.documents where id = p_id;
  if exists (select 1 from public.documents x where x.file_path = d.file_path) then return null; end if;
  return d.file_path;
end;
$$;


ALTER FUNCTION "public"."delete_document"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."entity_profiles_stamp"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_by_name := public.profiles_tab_my_name();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  if new.flag_reason is not null and btrim(new.flag_reason) = '' then
    new.flag_reason := null;
  end if;
  if tg_op = 'INSERT' or new.flag_reason is distinct from old.flag_reason then
    if new.flag_reason is null then
      new.flagged_at := null;
      new.flagged_by_name := null;
    else
      new.flagged_at := now();
      new.flagged_by_name := public.profiles_tab_my_name();
    end if;
  else
    new.flagged_at := old.flagged_at;
    new.flagged_by_name := old.flagged_by_name;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."entity_profiles_stamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_client_intake_by_token"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row record;
begin
  select id, advisor_name, client_name, status, responses
  into v_row
  from client_intake_candidates
  where token = p_token;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  return jsonb_build_object(
    'found', true,
    'advisorName', v_row.advisor_name,
    'clientName', v_row.client_name,
    'status', v_row.status,
    'responses', v_row.responses
  );
end;
$$;


ALTER FUNCTION "public"."get_client_intake_by_token"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_signup_invite"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  inv public.recruit_invites%rowtype;
  up_name text;
  up_manager uuid;
  cur uuid;
  nm text;
  mg uuid;
  chain text[] := '{}';
  n int := 0;
begin
  if p_token is null or length(p_token) < 32 then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;
  select * into inv from public.recruit_invites where token = p_token;
  if not found then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;
  if inv.used_at is not null then
    return jsonb_build_object('valid', false, 'reason', 'used');
  end if;
  if inv.expires_at < now() then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;
  select display_name, manager_id into up_name, up_manager from public.profiles where id = inv.upline_id;
  if not found then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;
  cur := up_manager;
  while cur is not null and n < 12 loop
    select display_name, manager_id into nm, mg from public.profiles where id = cur;
    exit when not found;
    chain := chain || nm;
    cur := mg;
    n := n + 1;
  end loop;
  return jsonb_build_object(
    'valid', true,
    'systemName', (select s.name from public.solar_systems s where s.id = coalesce(inv.solar_system_id, public.pl_system_of(inv.upline_id))),
    'leadsSystem', inv.solar_system_id is not null and inv.invite_role = 'super_manager',
    'inviteeName', inv.invitee_name,
    'uplineName', up_name,
    'aboveUpline', to_jsonb(chain),
    'expiresAt', inv.expires_at
  );
end;
$$;


ALTER FUNCTION "public"."get_signup_invite"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_presenter_booking"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_old_start timestamptz;
  v_hit record;
begin
  if auth.uid() is null then return new; end if;
  if new.presenter_id is null or new.presenter_id = new.user_id or coalesce(new.is_follow_up, false) then return new; end if;
  v_start := case when new.appointment_date is not null and new.appointment_time is not null and new.appointment_timezone is not null
                  then (new.appointment_date + new.appointment_time) at time zone new.appointment_timezone end;
  if v_start is null or v_start < now() then return new; end if;
  if tg_op = 'UPDATE' then
    v_old_start := case when old.appointment_date is not null and old.appointment_time is not null and old.appointment_timezone is not null
                        then (old.appointment_date + old.appointment_time) at time zone old.appointment_timezone end;
    if new.presenter_id is not distinct from old.presenter_id and v_start is not distinct from v_old_start
       and coalesce(new.duration_minutes, 60) = coalesce(old.duration_minutes, 60) then
      return new;
    end if;
  end if;
  v_end := v_start + make_interval(mins => least(greatest(coalesce(new.duration_minutes, 60), 5), 720));

  perform pg_advisory_xact_lock(hashtextextended('paceledger:presenter:' || new.presenter_id::text, 0));
  select b.s, b.e into v_hit from public.pl_presenter_busy(new.presenter_id, v_start, v_end, new.id) b order by b.s limit 1;
  if found then
    raise exception 'presenter_busy' using errcode = 'P0001',
      detail = json_build_object('starts_at', v_hit.s, 'ends_at', v_hit.e)::text;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."guard_presenter_booking"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_profile_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'Profiles are created automatically at sign-up';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."guard_profile_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  tok text := nullif(new.raw_user_meta_data->>'invite_token', '');
  inv public.recruit_invites%rowtype;
begin
  if tok is null then
    raise exception 'PaceLedger accounts can only be created from an invitation link';
  end if;
  select * into inv from public.recruit_invites where token = tok for update;
  if not found or inv.used_at is not null or inv.expires_at < now() then
    raise exception 'This invitation link is not valid anymore';
  end if;

  insert into public.profiles (id, display_name, email, role, manager_id, hierarchy_tier, solar_system_id)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), inv.invitee_name, split_part(new.email, '@', 1)),
    new.email,
    case when inv.solar_system_id is not null then coalesce(inv.invite_role, 'advisor') else 'advisor' end,
    case when inv.solar_system_id is not null then null else inv.upline_id end,
    'UA',
    coalesce(inv.solar_system_id, public.pl_system_of(inv.upline_id))
  );
  update public.recruit_invites set used_at = now(), used_by = new.id where id = inv.id;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_team_leader"("p_user" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from public.profiles where id = p_user and role in ('manager', 'super_manager', 'super_admin'))
      or exists (select 1 from public.profiles where manager_id = p_user);
$$;


ALTER FUNCTION "public"."is_team_leader"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."keep_reporting_in_system"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if coalesce(current_setting('pl.moving_tree', true), '') = 'on' then return new; end if;
  if new.manager_id is not null and public.pl_system_of(new.manager_id) is distinct from new.solar_system_id then
    raise exception 'They can only report to someone in their own solar system.';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."keep_reporting_in_system"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."leader_update_appointment"("p_appointment" "uuid", "p_fields" "jsonb", "p_reschedule" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  me uuid := auth.uid();
  a public.appointments%rowtype;
  was_reschedule boolean;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  select * into a from public.appointments where id = p_appointment for update;
  if not found then raise exception 'not_found'; end if;
  -- The person they report to, or a super admin. (Your own go through the
  -- normal save.)
  if a.user_id = me or not (
    exists (select 1 from public.profiles b where b.id = a.user_id and b.manager_id = me)
    or public.pl_admin_of(a.user_id)
  ) then
    raise exception 'not_allowed';
  end if;
  was_reschedule := a.status = 'needs_reschedule';

  -- Only the time and the details. Anything not sent stays as it is.
  update public.appointments set
    appointment_date = coalesce(nullif(p_fields->>'appointment_date', '')::date, appointment_date),
    appointment_time = coalesce(nullif(p_fields->>'appointment_time', '')::time, appointment_time),
    appointment_timezone = case when p_fields ? 'appointment_timezone' then nullif(p_fields->>'appointment_timezone', '') else appointment_timezone end,
    duration_minutes = coalesce(nullif(p_fields->>'duration_minutes', '')::int, duration_minutes),
    date_set_option = coalesce(nullif(p_fields->>'date_set_option', ''), date_set_option),
    category = coalesce(nullif(p_fields->>'category', ''), category),
    presenter = coalesce(nullif(btrim(p_fields->>'presenter'), ''), presenter),
    presenter_id = case when p_fields ? 'presenter_id' then nullif(p_fields->>'presenter_id', '')::uuid else presenter_id end,
    trainee = case when p_fields ? 'trainee' then nullif(btrim(p_fields->>'trainee'), '') else trainee end,
    trainee_id = case when p_fields ? 'trainee_id' then nullif(p_fields->>'trainee_id', '')::uuid else trainee_id end,
    client_name = coalesce(nullif(btrim(p_fields->>'client_name'), ''), client_name),
    client_email = case when p_fields ? 'client_email' then nullif(btrim(p_fields->>'client_email'), '') else client_email end,
    client_phone = case when p_fields ? 'client_phone' then nullif(btrim(p_fields->>'client_phone'), '') else client_phone end,
    notes = case when p_fields ? 'notes' then nullif(btrim(p_fields->>'notes'), '') else notes end,
    presentation_type = case when p_fields ? 'presentation_type' then nullif(p_fields->>'presentation_type', '') else presentation_type end,
    presentation_type_secondary = case when p_fields ? 'presentation_type_secondary' then nullif(p_fields->>'presentation_type_secondary', '') else presentation_type_secondary end
  where id = a.id
  returning * into a;

  -- Rebooking one that needs rescheduling counts it as set this week and
  -- starts its outcome fresh, the same as when the advisor does it.
  if p_reschedule and was_reschedule then
    update public.appointments set
      week_of = coalesce(nullif(p_fields->>'week_of', '')::date, week_of),
      status = null, outcome = null, follow_up_scheduled = null,
      officially_recruited = false, officially_sold = false, target_premium = null,
      follow_up_completed_at = null, follow_up_appointment_date = null,
      follow_up_appointment_time = null, follow_up_appointment_timezone = null
    where id = a.id
    returning * into a;
  end if;

  return to_jsonb(a);
end;
$$;


ALTER FUNCTION "public"."leader_update_appointment"("p_appointment" "uuid", "p_fields" "jsonb", "p_reschedule" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_presented_appointment"("p_appointment" "uuid", "p_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  me uuid := auth.uid();
  a public.appointments%rowtype;
  v_outcome text := nullif(p_data->>'outcome', '');
  v_follow boolean := (p_data->>'followUpScheduled')::boolean;
  v_sold boolean := coalesce((p_data->>'officiallySold')::boolean, false);
  v_recruited boolean := coalesce((p_data->>'officiallyRecruited')::boolean, false);
  v_premium numeric := nullif(p_data->>'targetPremium', '')::numeric;
  v_tax boolean := (p_data->>'interestedTax')::boolean;
  v_home boolean := (p_data->>'interestedInsurance')::boolean;
  v_status text;
  v_fu_date date;
  v_fu_time time;
  v_fu_tz text;
  v_dso text := nullif(p_data->>'followUpDateSetOption', '');
  v_week date := nullif(p_data->>'followUpWeekOf', '')::date;
  v_local date;
  v_new public.appointments%rowtype;
  v_same_follow boolean := false;
  -- The presenter's share of the premium (0 or empty: no split).
  v_split integer := nullif(p_data->>'splitPercent', '')::integer;
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  select * into a from public.appointments where id = p_appointment for update;
  if not found then
    raise exception 'not_found';
  end if;
  if a.presenter_id is distinct from me or a.user_id = me then
    raise exception 'not_presenter';
  end if;
  -- The advisor's own log stands; a presenter can only change their own.
  if a.follow_up_completed_at is not null and a.outcome_logged_by is distinct from me then
    raise exception 'already_logged';
  end if;
  if v_outcome is not null and v_outcome not in ('went_well', 'no_show', 'rescheduled', 'not_interested') then
    raise exception 'bad_outcome';
  end if;
  if v_premium is not null and (v_premium < 0 or v_premium > 100000000) then
    raise exception 'bad_premium';
  end if;

  v_status := case
    when v_follow is true then 'needs_follow_up'
    when v_outcome = 'rescheduled' then 'needs_reschedule'
    when v_outcome = 'no_show' then 'not_completed'
    when v_outcome in ('went_well', 'not_interested') then 'completed'
    else null end;

  if v_follow is true then
    v_fu_date := nullif(p_data->>'followUpDate', '')::date;
    v_fu_time := nullif(p_data->>'followUpTime', '')::time;
    if v_fu_date is null or v_fu_time is null then
      raise exception 'follow_up_time_needed';
    end if;
    v_fu_tz := a.appointment_timezone;
    -- Saving again with the same follow-up doesn't book it twice.
    v_same_follow := a.follow_up_scheduled is true
      and a.follow_up_appointment_date = v_fu_date and a.follow_up_appointment_time = v_fu_time;
  end if;

  update public.appointments set
    outcome = v_outcome,
    follow_up_scheduled = v_follow,
    officially_recruited = v_recruited,
    officially_sold = v_sold,
    interested_tax = v_tax,
    interested_insurance = v_home,
    target_premium = case when v_sold and v_premium > 0 then v_premium else null end,
    follow_up_completed_at = now(),
    status = v_status,
    follow_up_appointment_date = case when v_follow is true then v_fu_date end,
    follow_up_appointment_time = case when v_follow is true then v_fu_time end,
    follow_up_appointment_timezone = case when v_follow is true then v_fu_tz end,
    outcome_logged_by = me,
    split_user_id = case when v_sold and v_split between 1 and 99 then me end,
    split_percent = case when v_sold and v_split between 1 and 99 then v_split end
  where id = a.id
  returning * into a;

  -- A follow-up the presenter booked goes on the advisor's list, "set"
  -- today, carrying over the same things as when the advisor books one.
  if v_follow is true and not v_same_follow then
    v_local := (now() at time zone coalesce(nullif(a.appointment_timezone, ''), 'America/Chicago'))::date;
    if v_dso is null or v_dso not in ('weekend', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday') then
      v_dso := case extract(dow from v_local)::int when 1 then 'monday' when 2 then 'tuesday' when 3 then 'wednesday'
                 when 4 then 'thursday' when 5 then 'friday' else 'weekend' end;
    end if;
    if v_week is null or extract(dow from v_week)::int <> 6 or abs(v_week - v_local) > 14 then
      v_week := v_local - ((extract(dow from v_local)::int + 1) % 7);
    end if;
    insert into public.appointments (
      user_id, date_set_option, category, week_of, appointment_date, appointment_time, appointment_timezone,
      presenter, trainee, client_name, client_email, client_phone, prospect_id, notes,
      presentation_type, presentation_type_secondary, zoom_url, is_follow_up, duration_minutes
    ) values (
      a.user_id, v_dso, case when v_dso = 'weekend' then 'weekend' else 'weekday' end, v_week, v_fu_date, v_fu_time, v_fu_tz,
      a.presenter, a.trainee, a.client_name, a.client_email, a.client_phone, a.prospect_id,
      'Follow-up to appointment on ' || to_char(a.appointment_date, 'Dy, Mon FMDD'),
      a.presentation_type, a.presentation_type_secondary, a.zoom_url, true, a.duration_minutes
    ) returning * into v_new;
  end if;

  return jsonb_build_object('appointment', to_jsonb(a), 'followUp', case when v_new.id is null then null else to_jsonb(v_new) end);
end;
$$;


ALTER FUNCTION "public"."log_presented_appointment"("p_appointment" "uuid", "p_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_chat_read"("p_channel" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null or p_channel not in ('general', 'work', 'urgent') then
    return;
  end if;
  insert into public.chat_reads (user_id, channel, last_read_at) values (auth.uid(), p_channel, now())
  on conflict (user_id, channel) do update set last_read_at = greatest(public.chat_reads.last_read_at, excluded.last_read_at);
end;
$$;


ALTER FUNCTION "public"."mark_chat_read"("p_channel" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."licensing_progress" (
    "user_id" "uuid" NOT NULL,
    "resident_state" "text",
    "course_provider" "text",
    "course_started_on" "date",
    "course_completed_on" "date",
    "exam_on" "date",
    "exam_attempts" integer DEFAULT 0 NOT NULL,
    "exam_passed_on" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "contracting_sent_on" "date",
    "contracting_sent_by" "uuid",
    "profile_submitted_on" "date",
    CONSTRAINT "licensing_progress_course_provider_check" CHECK ((("course_provider" IS NULL) OR ("length"("course_provider") <= 80))),
    CONSTRAINT "licensing_progress_exam_attempts_check" CHECK ((("exam_attempts" >= 0) AND ("exam_attempts" <= 20))),
    CONSTRAINT "licensing_progress_resident_state_check" CHECK ((("resident_state" IS NULL) OR ("length"("resident_state") <= 40)))
);


ALTER TABLE "public"."licensing_progress" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_contracting_step"("p_user" "uuid", "p_step" "text") RETURNS "public"."licensing_progress"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  me uuid := auth.uid();
  r public.licensing_progress;
begin
  if me is null then
    raise exception 'Sign in first.';
  end if;
  if not (
    p_user = me
    or p_user in (select public.my_downline_ids())
    or public.pl_admin_of(p_user)
  ) then
    raise exception 'You can only update people on your team.';
  end if;
  if p_step not in ('sent', 'unsent', 'submitted', 'unsubmitted') then
    raise exception 'Unknown step.';
  end if;

  insert into public.licensing_progress (user_id) values (p_user) on conflict (user_id) do nothing;

  if p_step = 'sent' then
    update public.licensing_progress
       set contracting_sent_on = coalesce(contracting_sent_on, current_date), contracting_sent_by = coalesce(contracting_sent_by, me)
     where user_id = p_user returning * into r;
  elsif p_step = 'unsent' then
    update public.licensing_progress
       set contracting_sent_on = null, contracting_sent_by = null, profile_submitted_on = null
     where user_id = p_user returning * into r;
  elsif p_step = 'submitted' then
    update public.licensing_progress
       set profile_submitted_on = coalesce(profile_submitted_on, current_date),
           contracting_sent_on = coalesce(contracting_sent_on, current_date)
     where user_id = p_user returning * into r;
  else
    update public.licensing_progress set profile_submitted_on = null
     where user_id = p_user returning * into r;
  end if;
  return r;
end;
$$;


ALTER FUNCTION "public"."mark_contracting_step"("p_user" "uuid", "p_step" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_team_with_leader"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.solar_system_id is distinct from old.solar_system_id then
    perform set_config('pl.moving_tree', 'on', true);
    perform set_config('pl.trusted_profile_edit', 'on', true);
    with recursive below(id, depth) as (
      select p.id, 1 from public.profiles p where p.manager_id = new.id
      union all
      select p.id, b.depth + 1 from public.profiles p join below b on p.manager_id = b.id where b.depth < 60
    )
    update public.profiles set solar_system_id = new.solar_system_id
     where id in (select id from below) and solar_system_id is distinct from new.solar_system_id;
    perform set_config('pl.moving_tree', 'off', true);
    perform set_config('pl.trusted_profile_edit', 'off', true);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."move_team_with_leader"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_to_solar_system"("p_person" "uuid", "p_system" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.pl_is_galaxy_admin() then raise exception 'not_allowed'; end if;
  if p_person = auth.uid() then raise exception 'not_yourself'; end if;
  if not exists (select 1 from public.solar_systems where id = p_system) then raise exception 'no_such_solar_system'; end if;
  update public.profiles set solar_system_id = p_system, manager_id = null where id = p_person;
  if not found then raise exception 'no_such_person'; end if;
end;
$$;


ALTER FUNCTION "public"."move_to_solar_system"("p_person" "uuid", "p_system" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_downline_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with recursive downline(id, depth) as (
    select p.id, 1 from public.profiles p where p.manager_id = auth.uid()
    union all
    select p.id, d.depth + 1
    from public.profiles p join downline d on p.manager_id = d.id
    where d.depth < 50
  )
  select distinct id from downline where id <> auth.uid();
$$;


ALTER FUNCTION "public"."my_downline_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_upline_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with recursive up(id, depth) as (
    select p.manager_id, 1 from public.profiles p where p.id = auth.uid() and p.manager_id is not null
    union all
    select p.manager_id, u.depth + 1
    from public.profiles p join up u on p.id = u.id
    where p.manager_id is not null and u.depth < 50
  )
  select distinct id from up where id <> auth.uid();
$$;


ALTER FUNCTION "public"."my_upline_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pgrst_set_no_store"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  perform set_config('response.headers', '[{"Cache-Control": "no-store"}]', true);
end;
$$;


ALTER FUNCTION "public"."pgrst_set_no_store"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_aal2"() RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select case
    when coalesce(auth.jwt()->>'aal', '') <> 'aal2' then false
    when jsonb_typeof(auth.jwt()->'amr') is distinct from 'array' then false
    else exists (
      select 1 from jsonb_array_elements(auth.jwt()->'amr') a
       where a->>'method' = 'totp'
         and coalesce(nullif(a->>'timestamp', '')::bigint, 0) > extract(epoch from now())::bigint - 12 * 3600)
  end;
$$;


ALTER FUNCTION "public"."pl_aal2"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_activity_report"("p_from" "date", "p_to" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  tz constant text := 'America/Chicago';
  today date := (now() at time zone 'America/Chicago')::date;
  result jsonb;
begin
  -- The edge function (service role), a super admin, or the SQL Editor.
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin')
     and not exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'bad_range' using errcode = '22023';
  end if;

  with
  signups as (
    select i.upline_id as user_id
      from public.recruit_invites i
     where i.used_at is not null and i.used_by is not null
       and (i.used_at at time zone tz)::date between p_from and p_to
  ),
  -- The day an appointment was set, as Pace counts it: its week (Saturday)
  -- and the day picked when it was logged. The weekend batch goes on the
  -- day it was entered if that was the weekend, otherwise on the Sunday.
  set_days as (
    select a.user_id,
           case a.date_set_option
             when 'monday' then a.week_of + 2
             when 'tuesday' then a.week_of + 3
             when 'wednesday' then a.week_of + 4
             when 'thursday' then a.week_of + 5
             when 'friday' then a.week_of + 6
             else case when (a.created_at at time zone tz)::date in (a.week_of, a.week_of + 1)
                       then (a.created_at at time zone tz)::date else a.week_of + 1 end
           end as d
      from public.appointments a
     where not coalesce(a.is_follow_up, false)
       and a.week_of between p_from - 7 and p_to
  ),
  set_ as (select user_id from set_days where d between p_from and p_to),
  done as (
    select a.user_id
      from public.appointments a
     where a.appointment_date between p_from and p_to
       and a.follow_up_completed_at is not null
       and a.outcome in ('went_well', 'not_interested')
  ),
  sold as (
    select a.id, a.user_id, coalesce(a.target_premium, 0)::numeric as premium,
           case when a.split_user_id is not null and a.split_user_id <> a.user_id
                     and a.split_percent > 0 and a.split_percent < 100
                then a.split_percent else 0 end as pct,
           a.split_user_id
      from public.appointments a
     where coalesce(a.officially_sold, false)
       and a.appointment_date between p_from and p_to
  ),
  -- Same as the app (lib/credit.js): each person gets the sale and their share.
  credit as (
    select s.id, s.user_id, case when s.pct > 0 then round(s.premium * (100 - s.pct) / 100, 2) else s.premium end as premium from sold s
    union all
    select s.id, s.split_user_id, round(s.premium * s.pct / 100, 2) from sold s where s.pct > 0
  ),
  per as (
    select p.id, p.display_name, p.manager_id, p.role, ss.short_name as system, ss.name as system_name,
           (select count(*) from signups x where x.user_id = p.id)::int as added,
           (select count(*) from set_ x where x.user_id = p.id)::int as set_n,
           (select count(*) from done x where x.user_id = p.id)::int as completed
      from public.profiles p
      left join public.solar_systems ss on ss.id = p.solar_system_id
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'people', coalesce((select jsonb_agg(jsonb_build_object(
        'id', per.id, 'name', per.display_name, 'manager_id', per.manager_id, 'role', per.role,
        'system', per.system, 'system_name', per.system_name,
        'added', per.added, 'set', per.set_n, 'completed', per.completed) order by per.display_name, per.id) from per), '[]'::jsonb),
    'sales', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'user_id', c.user_id, 'premium', c.premium) order by c.id, c.user_id)
        from credit c where c.user_id is not null), '[]'::jsonb),
    'company', jsonb_build_object(
      'added', (select count(*) from signups),
      'set', (select count(*) from set_),
      'completed', (select count(*) from done),
      'apps', (select count(*) from sold),
      'premium', (select coalesce(sum(premium), 0) from sold),
      -- Appointments in the period with no outcome logged yet (not in Completed).
      'not_logged', (select count(*) from public.appointments a
                      where a.appointment_date between p_from and least(p_to, today - 1)
                        and a.follow_up_completed_at is null)
    )
  ) into result;
  return result;
end;
$$;


ALTER FUNCTION "public"."pl_activity_report"("p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_admin_of"("p" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((
    select me.role = 'super_admin' or (me.role = 'super_manager' and me.solar_system_id = public.pl_system_of(p))
      from public.profiles me where me.id = auth.uid()), false);
$$;


ALTER FUNCTION "public"."pl_admin_of"("p" "uuid") OWNER TO "postgres";


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


ALTER FUNCTION "public"."pl_admin_save_person"("p_user" "uuid", "p_changes" "jsonb", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_big_system"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select id from public.solar_systems where short_name = 'BIG';
$$;


ALTER FUNCTION "public"."pl_big_system"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_can_decide_promotion"("p_request" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((
    select me.role = 'super_admin'
        or (me.role = 'super_manager' and r.user_id <> me.id and me.solar_system_id = public.pl_system_of(r.user_id))
      from public.profiles me, public.promotion_requests r
     where me.id = auth.uid() and r.id = p_request), false);
$$;


ALTER FUNCTION "public"."pl_can_decide_promotion"("p_request" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_central_today"() RETURNS "date"
    LANGUAGE "sql" STABLE
    AS $$ select (now() at time zone 'America/Chicago')::date; $$;


ALTER FUNCTION "public"."pl_central_today"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_clean_phone"("p" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
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


ALTER FUNCTION "public"."pl_clean_phone"("p" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_commission_ingest"("p_key" "text", "p_body" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $_$
declare
  v_hash text;
  d jsonb;
  l jsonb;
  v_lines jsonb;
  v_id text;
  v_code text;
  v_amount numeric;
  v_date date;
  v_inserted boolean;
  n_disb integer := 0;
  n_lines integer := 0;
  n_new integer := 0;
  n_upd integer := 0;
  n_same integer := 0;
  bad jsonb := '[]'::jsonb;
  events text[] := '{}';
  codes text[] := '{}';
begin
  select key_hash into v_hash from public.commission_settings where id = 1;
  if v_hash is null then
    raise exception 'no_key';
  end if;
  if p_key is null or encode(digest(p_key, 'sha256'), 'hex') <> v_hash then
    raise exception 'bad_key';
  end if;
  if p_body is null or jsonb_typeof(p_body) <> 'object' then
    raise exception 'bad_body';
  end if;
  v_lines := coalesce(p_body->'ledgers', p_body->'ledger', '[]'::jsonb);
  if jsonb_typeof(coalesce(p_body->'disbursements', '[]'::jsonb)) <> 'array' or jsonb_typeof(v_lines) <> 'array' then
    raise exception 'bad_body';
  end if;
  if jsonb_array_length(coalesce(p_body->'disbursements', '[]'::jsonb)) + jsonb_array_length(v_lines) > 5000 then
    raise exception 'too_many';
  end if;

  -- Payouts
  for d in select value from jsonb_array_elements(coalesce(p_body->'disbursements', '[]'::jsonb)) loop
    v_id := nullif(btrim(coalesce(d->>'recordId', '')), '');
    v_code := nullif(btrim(coalesce(d->>'agentCode', d->>'carrierCode', '')), '');
    v_amount := public.pl_commission_num(d->>'amountOriginal');
    begin
      v_date := nullif(btrim(coalesce(d->>'disbursedDate', '')), '')::date;
    exception when others then
      v_date := null;
    end;
    if v_id is null or v_code is null or v_amount is null or char_length(v_id) > 200 then
      bad := bad || jsonb_build_object('kind', 'disbursement', 'recordId', left(coalesce(v_id, ''), 200),
        'problem', case when v_id is null then 'no recordId' when v_code is null then 'no agentCode' else 'amountOriginal is not a number' end);
      continue;
    end if;
    n_disb := n_disb + 1;
    codes := codes || v_code;
    insert into public.commission_disbursements as t (record_id, disbursed_date, agent_code, user_id, amount, positive_amount,
      negative_amount, ledger_count, status, processed_at)
    values (v_id, v_date, v_code, public.pl_commission_user(v_code), v_amount, public.pl_commission_num(d->>'positiveAmount'),
      public.pl_commission_num(d->>'negativeAmount'), public.pl_commission_num(d->>'ledgerCount')::integer,
      upper(nullif(btrim(coalesce(d->>'status', '')), '')),
      case when coalesce(d->>'processedAt', '') ~ '^\d{4}-\d{2}-\d{2}' then (d->>'processedAt')::timestamptz end)
    on conflict (record_id) do update set
      disbursed_date = excluded.disbursed_date, agent_code = excluded.agent_code, user_id = excluded.user_id,
      amount = excluded.amount, positive_amount = excluded.positive_amount, negative_amount = excluded.negative_amount,
      ledger_count = excluded.ledger_count, status = excluded.status, processed_at = excluded.processed_at, updated_at = now()
    where (t.disbursed_date, t.agent_code, t.amount, t.positive_amount, t.negative_amount, t.ledger_count, t.status, t.processed_at)
      is distinct from (excluded.disbursed_date, excluded.agent_code, excluded.amount, excluded.positive_amount,
                        excluded.negative_amount, excluded.ledger_count, excluded.status, excluded.processed_at)
    returning (xmax = 0) into v_inserted;
    if not found then n_same := n_same + 1; elsif v_inserted then n_new := n_new + 1; else n_upd := n_upd + 1; end if;
    -- Lines that came before their payout get its date now.
    update public.commission_lines set paid_on = v_date, updated_at = now()
     where disbursement_record_id = v_id and paid_on is distinct from v_date and v_date is not null;
  end loop;

  -- Lines
  for l in select value from jsonb_array_elements(v_lines) loop
    v_id := nullif(btrim(coalesce(l->>'recordId', '')), '');
    v_code := nullif(btrim(coalesce(l->>'agentCode', l->>'carrierCode', '')), '');
    v_amount := public.pl_commission_num(l->>'amount');
    if v_id is null or v_code is null or v_amount is null or char_length(v_id) > 200 then
      bad := bad || jsonb_build_object('kind', 'line', 'recordId', left(coalesce(v_id, ''), 200),
        'problem', case when v_id is null then 'no recordId' when v_code is null then 'no agentCode' else 'amount is not a number' end);
      continue;
    end if;
    n_lines := n_lines + 1;
    codes := codes || v_code;
    declare
      v_event text := case when position('~' in v_id) > 0 then regexp_replace(v_id, '~[^~]*$', '') else v_id end;
      v_level text := upper(coalesce(nullif(btrim(coalesce(l->>'commissionLevel', '')), ''), case when position('~' in v_id) > 0 then substring(v_id from '[^~]*$') end));
      v_disb text := nullif(btrim(coalesce(l->>'disbursementRecordId', '')), '');
      v_paid date;
    begin
      events := events || v_event;
      if v_disb is not null then
        select disbursed_date into v_paid from public.commission_disbursements where record_id = v_disb;
        if v_paid is null and v_disb ~ '^\d{4}-\d{2}-\d{2}' then
          begin v_paid := left(v_disb, 10)::date; exception when others then v_paid := null; end;
        end if;
      end if;
      insert into public.commission_lines as t (record_id, event_id, level, disbursement_record_id, paid_on, agent_code, user_id,
        amount, rate, type, label, carrier, policy_number, insured_name, status)
      values (v_id, v_event, v_level, v_disb, v_paid, v_code, public.pl_commission_user(v_code), v_amount,
        public.pl_commission_num(l->>'rate'), upper(nullif(btrim(coalesce(l->>'type', '')), '')), nullif(btrim(coalesce(l->>'label', '')), ''),
        nullif(btrim(coalesce(l->>'carrier', '')), ''), nullif(btrim(coalesce(l->>'policyNumber', '')), ''),
        nullif(btrim(coalesce(l->>'insuredName', '')), ''), upper(nullif(btrim(coalesce(l->>'status', '')), '')))
      on conflict (record_id) do update set
        event_id = excluded.event_id, level = excluded.level, disbursement_record_id = excluded.disbursement_record_id,
        paid_on = excluded.paid_on, agent_code = excluded.agent_code, user_id = excluded.user_id, amount = excluded.amount,
        rate = excluded.rate, type = excluded.type, label = excluded.label, carrier = excluded.carrier,
        policy_number = excluded.policy_number, insured_name = excluded.insured_name, status = excluded.status, updated_at = now()
      where (t.level, t.disbursement_record_id, t.paid_on, t.agent_code, t.amount, t.rate, t.type, t.label, t.carrier,
             t.policy_number, t.insured_name, t.status)
        is distinct from (excluded.level, excluded.disbursement_record_id, excluded.paid_on, excluded.agent_code, excluded.amount,
             excluded.rate, excluded.type, excluded.label, excluded.carrier, excluded.policy_number, excluded.insured_name, excluded.status)
      returning (xmax = 0) into v_inserted;
      if not found then n_same := n_same + 1; elsif v_inserted then n_new := n_new + 1; else n_upd := n_upd + 1; end if;
    end;
  end loop;

  -- The writing agent: whoever the A line of the same premium pays.
  if array_length(events, 1) > 0 then
    update public.commission_lines t
       set writer_code = a.agent_code, writer_user_id = a.user_id
      from public.commission_lines a
     where t.event_id = any(events) and a.event_id = t.event_id and a.level = 'A'
       and (t.writer_code is distinct from a.agent_code or t.writer_user_id is distinct from a.user_id);
  end if;

  insert into public.commission_receipts (disbursements, lines, new_rows, updated_rows, unchanged_rows, rejected, problems)
  values (n_disb, n_lines, n_new, n_upd, n_same, jsonb_array_length(bad),
          case when jsonb_array_length(bad) > 0 then (select jsonb_agg(x) from (select x from jsonb_array_elements(bad) x limit 50) s) end);
  -- Keep the log to its last 2,000 calls.
  delete from public.commission_receipts where id < (select min(id) from (select id from public.commission_receipts order by id desc limit 2000) k);

  -- Same answer shape as InsuraCloud's, plus what changed.
  return jsonb_build_object('success', true, 'disbImported', n_disb, 'ledgerImported', n_lines,
    'new', n_new, 'updated', n_upd, 'unchanged', n_same, 'rejected', jsonb_array_length(bad),
    'problems', case when jsonb_array_length(bad) > 0 then (select jsonb_agg(x) from (select x from jsonb_array_elements(bad) x limit 20) s) end);
end;
$_$;


ALTER FUNCTION "public"."pl_commission_ingest"("p_key" "text", "p_body" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_commission_link_code"("p_code" "text", "p_user" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  n integer;
begin
  if not public.pl_is_galaxy_admin() then
    raise exception 'not_allowed';
  end if;
  if coalesce(btrim(p_code), '') = '' or upper(p_code) = 'COMPANY' then
    raise exception 'bad_code';
  end if;
  if p_user is null then
    delete from public.commission_agent_links where agent_code = p_code;
  else
    if not exists (select 1 from public.profiles where id = p_user) then
      raise exception 'no_profile';
    end if;
    insert into public.commission_agent_links (agent_code, user_id, linked_by) values (p_code, p_user, auth.uid())
    on conflict (agent_code) do update set user_id = excluded.user_id, linked_by = excluded.linked_by, linked_at = now();
  end if;
  update public.commission_lines set user_id = public.pl_commission_user(agent_code), updated_at = now() where agent_code = p_code;
  get diagnostics n = row_count;
  update public.commission_disbursements set user_id = public.pl_commission_user(agent_code), updated_at = now() where agent_code = p_code;
  update public.commission_lines set writer_user_id = public.pl_commission_user(writer_code) where writer_code = p_code;
  insert into public.audit_log (actor_id, actor_name, action, target_name, details)
  values (auth.uid(), (select display_name from public.profiles where id = auth.uid()),
          case when p_user is null then 'Unlinked a commission code' else 'Linked a commission code' end,
          (select display_name from public.profiles where id = p_user), 'code ending ' || right(p_code, 4));
  return n;
end;
$$;


ALTER FUNCTION "public"."pl_commission_link_code"("p_code" "text", "p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_commission_new_key"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_key text;
begin
  if not public.pl_is_galaxy_admin() then
    raise exception 'not_allowed';
  end if;
  v_key := 'plc_' || encode(gen_random_bytes(24), 'hex');
  insert into public.commission_settings (id, key_hash, key_hint, key_made_by, key_made_at)
  values (1, encode(digest(v_key, 'sha256'), 'hex'), right(v_key, 4), auth.uid(), now())
  on conflict (id) do update set key_hash = excluded.key_hash, key_hint = excluded.key_hint,
    key_made_by = excluded.key_made_by, key_made_at = excluded.key_made_at;
  return v_key;
end;
$$;


ALTER FUNCTION "public"."pl_commission_new_key"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_commission_num"("p" "text") RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  return btrim(p)::numeric;
exception when others then
  return null;
end;
$$;


ALTER FUNCTION "public"."pl_commission_num"("p" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_commission_rematch"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  n integer;
begin
  if not public.pl_is_galaxy_admin() then
    raise exception 'not_allowed';
  end if;
  update public.commission_lines set user_id = public.pl_commission_user(agent_code), updated_at = now()
   where user_id is null and upper(agent_code) <> 'COMPANY' and public.pl_commission_user(agent_code) is not null;
  get diagnostics n = row_count;
  update public.commission_disbursements set user_id = public.pl_commission_user(agent_code), updated_at = now()
   where user_id is null and public.pl_commission_user(agent_code) is not null;
  update public.commission_lines t set writer_user_id = a.user_id
    from public.commission_lines a
   where a.event_id = t.event_id and a.level = 'A' and t.writer_user_id is distinct from a.user_id;
  return n;
end;
$$;


ALTER FUNCTION "public"."pl_commission_rematch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_commission_status"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  s public.commission_settings%rowtype;
  r public.commission_receipts%rowtype;
begin
  if not public.pl_is_galaxy_admin() then
    raise exception 'not_allowed';
  end if;
  select * into s from public.commission_settings where id = 1;
  select * into r from public.commission_receipts order by id desc limit 1;
  return jsonb_build_object(
    'hasKey', s.key_hash is not null, 'keyHint', s.key_hint, 'keyMadeAt', s.key_made_at,
    'keyMadeBy', (select display_name from public.profiles where id = s.key_made_by),
    'lastAt', r.received_at, 'calls', (select count(*) from public.commission_receipts),
    'lines', (select count(*) from public.commission_lines),
    'unmatched', (select count(distinct agent_code) from public.commission_lines where user_id is null and upper(agent_code) <> 'COMPANY'));
end;
$$;


ALTER FUNCTION "public"."pl_commission_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_commission_totals"("p_from" "date", "p_to" "date") RETURNS TABLE("user_id" "uuid", "agent_code" "text", "paid" numeric, "coming" numeric, "chargebacks" numeric, "lines" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select l.user_id, case when l.user_id is null then l.agent_code end,
         coalesce(sum(l.amount) filter (where l.paid_on between p_from and p_to), 0),
         coalesce(sum(l.amount) filter (where l.paid_on is null and coalesce(l.status, '') <> 'PROCESSED'), 0),
         coalesce(sum(l.amount) filter (where l.amount < 0 and (l.paid_on between p_from and p_to or l.paid_on is null)), 0),
         count(*)
    from public.commission_lines l
   group by 1, 2;
$$;


ALTER FUNCTION "public"."pl_commission_totals"("p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_commission_unmatched"() RETURNS TABLE("agent_code" "text", "lines" bigint, "total" numeric, "last_seen" timestamp with time zone, "sample_client" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.pl_is_galaxy_admin() then
    raise exception 'not_allowed';
  end if;
  return query
    select l.agent_code, count(*), sum(l.amount), max(l.first_seen_at),
           (array_agg(l.insured_name order by l.first_seen_at desc))[1]
      from public.commission_lines l
     where l.user_id is null and upper(l.agent_code) <> 'COMPANY'
     group by l.agent_code
     order by max(l.first_seen_at) desc;
end;
$$;


ALTER FUNCTION "public"."pl_commission_unmatched"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_commission_user"("p_code" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case when p_code is null or upper(p_code) = 'COMPANY' then null else coalesce(
    (select l.user_id from public.commission_agent_links l where l.agent_code = p_code),
    (select case when count(*) = 1 then min(p.id::text)::uuid end from public.profiles p
       where nullif(regexp_replace(coalesce(p.npn, ''), '[^0-9]', '', 'g'), '') = p_code),
    (select case when count(*) = 1 then min(p.id::text)::uuid end from public.profiles p
       where upper(btrim(coalesce(p.fg_writing_number, ''))) = upper(p_code) and btrim(coalesce(p.fg_writing_number, '')) <> '')
  ) end;
$$;


ALTER FUNCTION "public"."pl_commission_user"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_contracting_check"() RETURNS "void"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if not public.pl_is_contracting_staff() then raise exception 'not_contracting_staff'; end if;
  if not public.pl_aal2() then raise exception 'two_step_required'; end if;
end;
$$;


ALTER FUNCTION "public"."pl_contracting_check"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_contracting_delete"("p_user" "uuid", "p_reason" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  was_submitted boolean;
begin
  select submitted_at is not null into was_submitted from public.contracting_secrets where user_id = p_user;
  if not found then return false; end if;
  delete from public.contracting_secrets where user_id = p_user;
  if was_submitted then
    update public.contracting_cases
       set info_deleted_at = now(), delete_reason = p_reason, updated_at = now(),
           entered_at = case when p_reason = 'entered' then now() else entered_at end,
           entered_by = case when p_reason = 'entered' then auth.uid() else entered_by end
     where user_id = p_user;
    if p_reason <> 'entered' then
      update public.licensing_progress set profile_submitted_on = null where user_id = p_user;
    end if;
  end if;
  return was_submitted;
end;
$$;


ALTER FUNCTION "public"."pl_contracting_delete"("p_user" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_contracting_field_ok"("p_key" "text", "p_val" "jsonb") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select jsonb_typeof(p_val) = 'object'
     and jsonb_typeof(p_val->'iv') = 'string' and char_length(p_val->>'iv') between 12 and 32
     and jsonb_typeof(p_val->'ct') = 'string'
     and char_length(p_val->>'ct') between 16 and case when p_key = 'background' then 80000 else 4000 end;
$$;


ALTER FUNCTION "public"."pl_contracting_field_ok"("p_key" "text", "p_val" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_contracting_log"("p_user" "uuid", "p_action" "text", "p_detail" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  insert into public.contracting_log (user_id, agent_name, actor_id, actor_name, action, detail)
  values (p_user, (select display_name from public.profiles where id = p_user), auth.uid(),
          (select display_name from public.profiles where id = auth.uid()), p_action, left(p_detail, 200));
$$;


ALTER FUNCTION "public"."pl_contracting_log"("p_user" "uuid", "p_action" "text", "p_detail" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_contracting_team_check"() RETURNS "void"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from public.contracting_staff) then
    perform public.pl_contracting_check();
  else
    if not public.pl_is_galaxy_admin() then raise exception 'not_contracting_staff'; end if;
    if not public.pl_aal2() then raise exception 'two_step_required'; end if;
  end if;
end;
$$;


ALTER FUNCTION "public"."pl_contracting_team_check"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_edit_training_series"("p_group" "uuid", "p_from" "date", "p_shift_days" integer, "p_title" "text", "p_time" time without time zone, "p_duration" integer, "p_timezone" "text", "p_zoom_url" "text", "p_notes" "text") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  n integer;
begin
  if not public.pl_is_system_admin() then
    raise exception 'not_allowed';
  end if;
  if p_group is null or p_from is null or coalesce(trim(p_title), '') = '' or p_time is null then
    raise exception 'bad_training';
  end if;
  if p_duration is null or p_duration < 5 or p_duration > 720 then
    raise exception 'bad_length';
  end if;
  if abs(coalesce(p_shift_days, 0)) > 60 then
    raise exception 'bad_shift';
  end if;
  update public.trainings
     set title = trim(p_title),
         training_time = p_time,
         duration_minutes = p_duration,
         timezone = coalesce(nullif(trim(coalesce(p_timezone, '')), ''), timezone),
         zoom_url = nullif(trim(coalesce(p_zoom_url, '')), ''),
         notes = nullif(trim(coalesce(p_notes, '')), ''),
         training_date = training_date + coalesce(p_shift_days, 0)
   where recurring_group_id = p_group
     and training_date >= p_from;
  get diagnostics n = row_count;
  return n;
end;
$$;


ALTER FUNCTION "public"."pl_edit_training_series"("p_group" "uuid", "p_from" "date", "p_shift_days" integer, "p_title" "text", "p_time" time without time zone, "p_duration" integer, "p_timezone" "text", "p_zoom_url" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_home_short"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select s.short_name from public.solar_systems s where s.id = public.pl_writer_system();
$$;


ALTER FUNCTION "public"."pl_home_short"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_home_system"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select solar_system_id from public.profiles where id = auth.uid();
$$;


ALTER FUNCTION "public"."pl_home_system"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_is_contracting_staff"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.contracting_staff s join public.profiles p on p.id = s.user_id
     where s.user_id = auth.uid() and p.role = 'super_admin');
$$;


ALTER FUNCTION "public"."pl_is_contracting_staff"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_is_galaxy_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((select role = 'super_admin' from public.profiles where id = auth.uid()), false);
$$;


ALTER FUNCTION "public"."pl_is_galaxy_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_is_super_manager"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((select role = 'super_manager' from public.profiles where id = auth.uid()), false);
$$;


ALTER FUNCTION "public"."pl_is_super_manager"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_is_system_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((select role in ('super_admin', 'super_manager') from public.profiles where id = auth.uid()), false);
$$;


ALTER FUNCTION "public"."pl_is_system_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_presenter_busy"("p_presenter" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_exclude" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("s" timestamp with time zone, "e" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with tz as (
    select coalesce((select timezone from public.presenter_settings where user_id = p_presenter), 'America/Chicago') as name
  )
  select t.s, t.e
    from public.appointments x
   cross join tz
   cross join lateral (select coalesce(x.appointment_at, (x.appointment_date + x.appointment_time) at time zone coalesce(x.appointment_timezone, tz.name)) as s) b
   cross join lateral (select b.s, b.s + make_interval(mins => coalesce(x.duration_minutes, 30)) as e) t
   where (x.presenter_id = p_presenter or (x.presenter_id is null and x.user_id = p_presenter))
     and (p_exclude is null or x.id <> p_exclude)
     and (x.appointment_at is null or (x.appointment_at < p_to and x.appointment_at > p_from - interval '13 hours'))
     and t.s < p_to and t.e > p_from
  union all
  select k.s, k.e
    from public.manager_availability_blocks bl
   cross join tz
   cross join lateral (
     select coalesce(bl.start_at, (bl.block_date + bl.start_time) at time zone coalesce(bl.timezone, tz.name)) as s,
            coalesce(bl.end_at, (bl.block_date + bl.end_time) at time zone coalesce(bl.timezone, tz.name)) as e
   ) k
   where bl.user_id = p_presenter
     and k.s < p_to and k.e > p_from;
$$;


ALTER FUNCTION "public"."pl_presenter_busy"("p_presenter" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_exclude" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "recipients" "text"[] DEFAULT ARRAY['agency@biginsurancenetwork.com'::"text", 'arman@biginsurancenetwork.com'::"text", 'dynamite@biginsurancenetwork.com'::"text"] NOT NULL,
    "daily_on" boolean DEFAULT true NOT NULL,
    "weekly_on" boolean DEFAULT true NOT NULL,
    "last_error" "text",
    "last_error_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "report_settings_id_check" CHECK ("id")
);


ALTER TABLE "public"."report_settings" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_report_save_settings"("p_recipients" "text"[], "p_daily" boolean, "p_weekly" boolean) RETURNS "public"."report_settings"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  clean text[];
  bad text;
  saved public.report_settings;
begin
  if not exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'super_admin') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  -- Trimmed, lower-case, no repeats, in the order given.
  select coalesce(array_agg(e order by first_at), '{}') into clean
    from (select lower(btrim(x)) as e, min(o) as first_at
            from unnest(coalesce(p_recipients, '{}')) with ordinality as t(x, o)
           where btrim(coalesce(x, '')) <> ''
           group by lower(btrim(x))) s;
  select e into bad from unnest(clean) e where e !~ '^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$' or char_length(e) > 254 limit 1;
  if bad is not null then raise exception 'bad_email: %', bad using errcode = '22023'; end if;
  if cardinality(clean) > 20 then raise exception 'too_many' using errcode = '22023'; end if;
  update public.report_settings
     set recipients = clean, daily_on = coalesce(p_daily, daily_on), weekly_on = coalesce(p_weekly, weekly_on),
         updated_at = now(), updated_by = auth.uid()
   where id
  returning * into saved;
  return saved;
end;
$_$;


ALTER FUNCTION "public"."pl_report_save_settings"("p_recipients" "text"[], "p_daily" boolean, "p_weekly" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_scope_header"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $_$
  select case when h ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then h::uuid end
    from (select nullif(current_setting('request.headers', true), '')::json ->> 'x-pl-system' as h) x;
$_$;


ALTER FUNCTION "public"."pl_scope_header"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_sees_person"("p" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p is not null and (p = auth.uid() or public.pl_sees_system(public.pl_system_of(p)));
$$;


ALTER FUNCTION "public"."pl_sees_person"("p" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_sees_system"("s" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((
    select coalesce(s, public.pl_big_system()) =
           case when me.role = 'super_admin' then coalesce(public.pl_scope_header(), me.solar_system_id)
                else me.solar_system_id end
      from public.profiles me where me.id = auth.uid()), false);
$$;


ALTER FUNCTION "public"."pl_sees_system"("s" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_system_of"("p" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select solar_system_id from public.profiles where id = p;
$$;


ALTER FUNCTION "public"."pl_system_of"("p" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_tidy_name"("p" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
declare
  s text;
  words text[];
  outw text[] := '{}';
  w text;
  res text;
  c text;
  prev text;
  n int;
  had_capital boolean;
begin
  if p is null then return null; end if;
  s := regexp_replace(btrim(p), '\s+', ' ', 'g');
  if s = '' then return s; end if;
  -- Typed in all capitals: start again from lower case.
  if length(regexp_replace(s, '[^[:alpha:]]', '', 'g')) >= 2 and s = upper(s) and s <> lower(s) then
    s := lower(s);
  end if;
  had_capital := s <> lower(s);
  words := string_to_array(s, ' ');
  n := array_length(words, 1);
  for i in 1..n loop
    w := words[i];
    if i > 1 and lower(w) in ('ii', 'iii', 'iv', 'vi', 'vii', 'viii') then
      w := upper(w);
    elsif w <> lower(w) or w !~ '[[:alpha:]]' then
      null; -- already has a capital, or isn't a word
    elsif i < n and (i > 1 or had_capital) and w in ('de', 'del', 'della', 'der', 'den', 'di', 'da', 'das', 'do', 'dos', 'du', 'la', 'le', 'van', 'von', 'ter', 'y', 'e', 'bin') then
      null; -- "de la", "van", ... inside a name (or typed that way on purpose)
    else
      res := '';
      prev := '';
      for k in 1..length(w) loop
        c := substr(w, k, 1);
        if k = 1 or prev in ('-', '''', '’', '.') then res := res || upper(c); else res := res || c; end if;
        prev := c;
      end loop;
      if res ~ '^Mc[[:lower:]]{2,}' then res := 'Mc' || upper(substr(res, 3, 1)) || substr(res, 4); end if;
      w := res;
    end if;
    outw := outw || w;
  end loop;
  return array_to_string(outw, ' ');
end;
$$;


ALTER FUNCTION "public"."pl_tidy_name"("p" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_today"() RETURNS "date"
    LANGUAGE "sql" STABLE
    AS $$
  select (now() at time zone 'America/Chicago')::date;
$$;


ALTER FUNCTION "public"."pl_today"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_week_start"("d" "date") RETURNS "date"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select d - ((extract(dow from d)::int + 1) % 7);
$$;


ALTER FUNCTION "public"."pl_week_start"("d" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_weekly_counts"("p_week_start" "date") RETURNS TABLE("category" "text", "user_id" "uuid", "n" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select 'pace'::text, a.user_id, count(*)::int
    from public.appointments a
   where a.week_of = p_week_start and not coalesce(a.is_follow_up, false)
   group by a.user_id
  union all
  -- A split sale counts as a sale for both people.
  select 'sales', s.user_id, count(*)::int
    from (
      select a.user_id
        from public.appointments a
       where a.officially_sold and a.appointment_date between p_week_start and p_week_start + 6
      union all
      select a.split_user_id
        from public.appointments a
       where a.officially_sold and a.split_user_id is not null
         and a.appointment_date between p_week_start and p_week_start + 6
    ) s
   group by s.user_id
  union all
  select 'recruits', r.user_id, count(*)::int
    from (
      select a.user_id
        from public.appointments a
       where a.officially_recruited
         and a.appointment_date between p_week_start and p_week_start + 6
         and a.appointment_date < public.recruits_switch_date()
      union all
      select i.upline_id
        from public.recruit_invites i
       where i.used_at is not null and i.used_by is not null and i.solar_system_id is null
         and i.used_at >= public.recruits_from_signups_since()
         and (i.used_at at time zone 'America/Chicago')::date between p_week_start and p_week_start + 6
         and not public.signup_already_counted(i.appointment_id)
    ) r
   group by r.user_id;
$$;


ALTER FUNCTION "public"."pl_weekly_counts"("p_week_start" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_weekly_top3_in"("p_week_start" "date", "p_system" "uuid") RETURNS TABLE("category" "text", "user_id" "uuid", "display_name" "text", "n" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with ranked as (
    select c.category, c.user_id, p.display_name, c.n,
           row_number() over (partition by c.category order by c.n desc, p.display_name) as r
      from public.pl_weekly_counts(p_week_start) c join public.profiles p on p.id = c.user_id
     where c.n > 0
       and (case when p_system is null then public.pl_sees_system(p.solar_system_id) else p.solar_system_id = p_system end)
  )
  select category, user_id, display_name, n from ranked where r <= 3 order by category, r;
$$;


ALTER FUNCTION "public"."pl_weekly_top3_in"("p_week_start" "date", "p_system" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pl_writer_system"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((select solar_system_id from public.profiles where id = auth.uid()), public.pl_big_system());
$$;


ALTER FUNCTION "public"."pl_writer_system"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_appointment_wins"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  had_sale boolean;
begin
  if tg_op = 'DELETE' then
    delete from public.wins where ref in ('sale:' || old.id, 'recruit:' || old.id);
    return old;
  end if;

  if coalesce(new.officially_sold, false) and (tg_op = 'INSERT' or not coalesce(old.officially_sold, false)) then
    select exists (select 1 from public.appointments x where x.user_id = new.user_id and x.officially_sold and x.id <> new.id) into had_sale;
    insert into public.wins (user_id, kind, ref, detail)
      values (new.user_id, case when had_sale then 'sale' else 'first_sale' end, 'sale:' || new.id,
              case when new.split_user_id is not null then jsonb_build_object('with', new.split_user_id) else '{}'::jsonb end)
      on conflict (ref) do nothing;
  elsif tg_op = 'UPDATE' and coalesce(old.officially_sold, false) and not coalesce(new.officially_sold, false) then
    delete from public.wins where ref = 'sale:' || new.id;
  elsif tg_op = 'UPDATE' and coalesce(new.officially_sold, false) and new.split_user_id is distinct from old.split_user_id then
    -- The split changed after the sale was posted: the post names both people (or just one).
    update public.wins
       set detail = (detail - 'with') || case when new.split_user_id is not null then jsonb_build_object('with', new.split_user_id) else '{}'::jsonb end
     where ref = 'sale:' || new.id;
  end if;

  -- From the switch on, recruits post when they sign up (with their name).
  if coalesce(new.officially_recruited, false) and (tg_op = 'INSERT' or not coalesce(old.officially_recruited, false))
     and coalesce(new.appointment_date, public.pl_today()) < public.recruits_switch_date() then
    insert into public.wins (user_id, kind, ref, detail)
      values (new.user_id, 'recruit', 'recruit:' || new.id, public.recruit_win_detail(new.id, new.user_id, new.client_name))
      on conflict (ref) do nothing;
  elsif tg_op = 'UPDATE' and coalesce(old.officially_recruited, false) and not coalesce(new.officially_recruited, false) then
    delete from public.wins where ref = 'recruit:' || new.id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."post_appointment_wins"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "notified_at" timestamp with time zone,
    "notified_to" "text",
    "solar_system_id" "uuid",
    CONSTRAINT "chat_messages_body_check" CHECK (("char_length"("body") <= 2000)),
    CONSTRAINT "chat_messages_body_present" CHECK ((("deleted_at" IS NOT NULL) OR ("char_length"("btrim"("body")) > 0))),
    CONSTRAINT "chat_messages_channel_check" CHECK (("channel" = ANY (ARRAY['general'::"text", 'work'::"text", 'urgent'::"text"])))
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_chat_message"("p_channel" "text", "p_body" "text") RETURNS "public"."chat_messages"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  me uuid := auth.uid();
  clean text;
  recent int;
  saved public.chat_messages%rowtype;
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  if not exists (select 1 from public.profiles where id = me) then
    raise exception 'no_profile';
  end if;
  if not exists (select 1 from public.chat_rules where user_id = me) then
    raise exception 'rules_not_accepted';
  end if;
  if p_channel is null or p_channel not in ('general', 'work', 'urgent') then
    raise exception 'bad_channel';
  end if;
  clean := regexp_replace(coalesce(p_body, ''), E'\r\n?', E'\n', 'g');
  clean := regexp_replace(clean, E'\n{4,}', E'\n\n\n', 'g');
  clean := btrim(clean, E' \t\n');
  if clean = '' then
    raise exception 'empty';
  end if;
  if char_length(clean) > 2000 then
    raise exception 'too_long';
  end if;
  select count(*) into recent from public.chat_messages
   where user_id = me and created_at > now() - interval '1 minute';
  if recent >= 15 then
    raise exception 'slow_down';
  end if;

  insert into public.chat_messages (channel, user_id, body)
  values (p_channel, me, public.chat_mask(clean))
  returning * into saved;

  -- Posting counts as reading that chat.
  insert into public.chat_reads (user_id, channel, last_read_at) values (me, p_channel, saved.created_at)
  on conflict (user_id, channel) do update set last_read_at = greatest(public.chat_reads.last_read_at, excluded.last_read_at);
  return saved;
end;
$$;


ALTER FUNCTION "public"."post_chat_message"("p_channel" "text", "p_body" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_due_wins"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  today date := public.pl_today();
  this_week date := public.pl_week_start(today);
  last_week date := public.pl_week_start(today) - 7;
  posted integer := 0;
  k integer;
  d jsonb;
  s record;
begin
  if auth.uid() is null then return 0; end if;

  insert into public.wins (user_id, kind, ref, detail, occurred_at)
  select a.user_id, 'issued', 'issued:' || a.id, jsonb_build_object('appointment_id', a.id),
         least(now(), (a.effective_date::timestamp + interval '8 hours') at time zone 'America/Chicago')
    from public.appointments a
   where coalesce(a.officially_sold, false) and coalesce(a.requirements_completed, false)
     and a.effective_date between today - 7 and today
     and exists (select 1 from public.profiles p where p.id = a.user_id)
  on conflict (ref) do nothing;
  get diagnostics k = row_count;
  posted := posted + k;

  for s in select id, short_name from public.solar_systems loop
    if exists (select 1 from public.wins where ref = 'winners:' || s.short_name || ':' || last_week)
       or (s.short_name = 'BIG' and exists (select 1 from public.wins where ref = 'winners:' || last_week)) then
      continue;
    end if;
    with t as (select * from public.pl_weekly_top3_in(last_week, s.id)),
         m as (select category, max(n) as mx from t group by category),
         firsts as (select t.* from t join m on m.category = t.category and t.n = m.mx)
    select jsonb_build_object(
             'week_start', last_week, 'week_end', last_week + 6,
             'pace', coalesce((select jsonb_agg(jsonb_build_object('user_id', f.user_id, 'name', f.display_name, 'n', f.n) order by f.display_name) from firsts f where f.category = 'pace'), '[]'::jsonb),
             'sales', coalesce((select jsonb_agg(jsonb_build_object('user_id', f.user_id, 'name', f.display_name, 'n', f.n) order by f.display_name) from firsts f where f.category = 'sales'), '[]'::jsonb),
             'recruits', coalesce((select jsonb_agg(jsonb_build_object('user_id', f.user_id, 'name', f.display_name, 'n', f.n) order by f.display_name) from firsts f where f.category = 'recruits'), '[]'::jsonb))
      into d;
    if jsonb_array_length(d->'pace') + jsonb_array_length(d->'sales') + jsonb_array_length(d->'recruits') > 0 then
      insert into public.wins (user_id, kind, ref, detail, occurred_at, solar_system_id)
        values (null, 'winners', 'winners:' || s.short_name || ':' || last_week, d, this_week::timestamp at time zone 'America/Chicago', s.id)
        on conflict (ref) do nothing;
      get diagnostics k = row_count;
      posted := posted + k;
    end if;
  end loop;
  return posted;
end;
$$;


ALTER FUNCTION "public"."post_due_wins"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_exam_win"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  begin
    if new.exam_passed_on is not null and (tg_op = 'INSERT' or old.exam_passed_on is null)
       and new.exam_passed_on >= public.pl_today() - 14 then
      insert into public.wins (user_id, kind, ref, detail)
        values (new.user_id, 'exam', 'exam:' || new.user_id, jsonb_build_object('state', new.resident_state))
        on conflict (ref) do nothing;
    elsif tg_op = 'UPDATE' and old.exam_passed_on is not null and new.exam_passed_on is null then
      delete from public.wins where ref = 'exam:' || new.user_id;
    end if;
  exception when others then
    raise warning 'post_exam_win: %', sqlerrm;
  end;
  return new;
end;
$$;


ALTER FUNCTION "public"."post_exam_win"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_more_appointment_wins"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  today date := public.pl_today();
  person uuid;
  n integer;
begin
  if tg_op = 'DELETE' then
    delete from public.wins where ref = 'issued:' || old.id;
    return old;
  end if;

  -- Never get in the way of saving the appointment.
  begin
    -- Policy issued: a sale, requirements complete, effective date arrived.
    if coalesce(new.officially_sold, false) and coalesce(new.requirements_completed, false)
       and new.effective_date is not null and new.effective_date <= today then
      if new.effective_date >= today - 30 then
        insert into public.wins (user_id, kind, ref, detail)
          values (new.user_id, 'issued', 'issued:' || new.id, jsonb_build_object('appointment_id', new.id))
          on conflict (ref) do nothing;
      end if;
    elsif tg_op = 'UPDATE' then
      delete from public.wins where ref = 'issued:' || new.id;
    end if;

    -- 33 this week, for whoever set it and whoever presents it.
    if not coalesce(new.is_follow_up, false) and new.week_of is not null
       and new.week_of >= public.pl_week_start(today) - 7 then
      foreach person in array array_remove(array[new.user_id, nullif(new.presenter_id, new.user_id)], null) loop
        select count(*) into n from public.appointments a
         where a.week_of = new.week_of and not coalesce(a.is_follow_up, false)
           and (a.user_id = person or (a.presenter_id = person and a.user_id <> person));
        if n >= 33 and exists (select 1 from public.profiles p where p.id = person) then
          insert into public.wins (user_id, kind, ref, detail)
            values (person, 'pace', 'pace:' || person || ':' || new.week_of, jsonb_build_object('week_of', new.week_of, 'n', 33))
            on conflict (ref) do nothing;
        end if;
      end loop;
    end if;
  exception when others then
    raise warning 'post_more_appointment_wins: %', sqlerrm;
  end;
  return new;
end;
$$;


ALTER FUNCTION "public"."post_more_appointment_wins"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_profile_wins"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    insert into public.wins (user_id, kind, ref, detail, occurred_at)
      values (new.id, 'joined', 'joined:' || new.id, jsonb_build_object('upline_id', new.manager_id), coalesce(new.created_at, now()))
      on conflict (ref) do nothing;
    return new;
  end if;
  if new.licensed_at is not null and old.licensed_at is null then
    insert into public.wins (user_id, kind, ref) values (new.id, 'licensed', 'licensed:' || new.id)
      on conflict (ref) do nothing;
  end if;
  if new.hierarchy_tier is distinct from old.hierarchy_tier and public.tier_rank(new.hierarchy_tier) > public.tier_rank(old.hierarchy_tier) and new.hierarchy_tier <> 'UA' then
    insert into public.wins (user_id, kind, ref, detail)
      values (new.id, 'promotion', 'promotion:' || new.id || ':' || new.hierarchy_tier, jsonb_build_object('tier', new.hierarchy_tier))
      on conflict (ref) do nothing;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."post_profile_wins"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_signup_recruit_win"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.solar_system_id is null and new.used_at is not null and old.used_at is null and new.used_by is not null
     and new.used_at >= public.recruits_from_signups_since() then
    if public.signup_already_counted(new.appointment_id) then
      update public.wins set detail = (detail - 'name') || jsonb_build_object('recruit_id', new.used_by)
       where ref = 'recruit:' || new.appointment_id;
    else
      delete from public.wins where ref = 'joined:' || new.used_by;
      insert into public.wins (user_id, kind, ref, detail, occurred_at)
        values (new.upline_id, 'recruit', 'signup:' || new.used_by, jsonb_build_object('recruit_id', new.used_by), new.used_at)
        on conflict (ref) do nothing;
      if new.appointment_id is not null then
        update public.prospects pr set marked_recruited = true
          from public.appointments a
         where a.id = new.appointment_id and pr.id = a.prospect_id
           and not coalesce(pr.marked_recruited, false);
      end if;
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."post_signup_recruit_win"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prepare_recruit_invite"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  new.created_at := now();
  new.expires_at := now() + interval '30 days';
  new.used_at := null;
  new.used_by := null;
  new.emailed_to := null;
  new.emailed_at := null;
  new.email_send_count := 0;
  return new;
end;
$$;


ALTER FUNCTION "public"."prepare_recruit_invite"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."presenter_open_slots"("p_presenter" "uuid", "p_from" "date" DEFAULT NULL::"date", "p_days" integer DEFAULT 14, "p_exclude" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  st public.presenter_settings%rowtype;
  v_has_hours boolean;
  v_today date;
  v_from date;
  v_to date;
  v_earliest timestamptz;
  v_slots jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;
  if p_presenter is null or not (p_presenter = auth.uid() or public.pl_sees_person(p_presenter)) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  select * into st from public.presenter_settings where user_id = p_presenter;
  v_has_hours := exists (select 1 from public.presenter_hours where user_id = p_presenter);
  if st.user_id is null or not v_has_hours then
    return jsonb_build_object('ok', true, 'has_hours', false, 'accepting', false, 'slots', '[]'::jsonb);
  end if;
  if not st.accepting then
    return jsonb_build_object('ok', true, 'has_hours', true, 'accepting', false, 'timezone', st.timezone, 'slots', '[]'::jsonb);
  end if;

  v_today := (now() at time zone st.timezone)::date;
  v_from := greatest(coalesce(p_from, v_today), v_today);
  v_to := least(v_from + least(greatest(coalesce(p_days, 14), 1), 60) - 1, v_today + st.horizon_days - 1);
  v_earliest := now() + make_interval(mins => st.notice_minutes);

  with days as (
    select d::date as d from generate_series(v_from, v_to, interval '1 day') as g(d)
  ),
  cand as (
    -- Every start in their hours, as wall-clock time in their time zone
    -- (so daylight saving is handled), every step_minutes.
    select (lt at time zone st.timezone) as s,
           (lt at time zone st.timezone) + make_interval(mins => st.slot_minutes) as e
      from days
      join public.presenter_hours h on h.user_id = p_presenter and h.weekday = extract(dow from days.d)
     cross join lateral generate_series(days.d + h.start_time,
                                        -- "until midnight" is kept as 23:59:59
                                        (case when h.end_time >= time '23:59:59' then (days.d + 1)::timestamp else days.d + h.end_time end)
                                          - make_interval(mins => st.slot_minutes),
                                        make_interval(mins => st.step_minutes)) as lt
  ),
  busy as (
    select b.s, b.e from public.pl_presenter_busy(
      p_presenter,
      (select min(s) from cand) - make_interval(mins => st.buffer_minutes),
      (select max(e) from cand) + make_interval(mins => st.buffer_minutes),
      p_exclude) b
  ),
  open as (
    select distinct c.s, c.e from cand c
     where c.s >= v_earliest
       and not exists (
         select 1 from busy b
          where b.s < c.e + make_interval(mins => st.buffer_minutes)
            and b.e > c.s - make_interval(mins => st.buffer_minutes))
  )
  select coalesce(jsonb_agg(jsonb_build_array(s, e) order by s), '[]'::jsonb) into v_slots from open;

  return jsonb_build_object(
    'ok', true, 'has_hours', true, 'accepting', true,
    'timezone', st.timezone, 'slot_minutes', st.slot_minutes, 'step_minutes', st.step_minutes,
    'buffer_minutes', st.buffer_minutes, 'use_google', st.use_google,
    'first_day', v_from, 'last_day', v_to, 'horizon_end', v_today + st.horizon_days - 1,
    'slots', v_slots);
end;
$$;


ALTER FUNCTION "public"."presenter_open_slots"("p_presenter" "uuid", "p_from" "date", "p_days" integer, "p_exclude" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_reporting_loop"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  loops boolean;
begin
  if new.manager_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.manager_id is not distinct from old.manager_id then return new; end if;
  -- One reporting change at a time, so two admins editing at the same
  -- moment can't each pass the check and still make a loop together.
  perform pg_advisory_xact_lock(hashtext('paceledger_reporting_lines'));
  if new.manager_id = new.id then
    raise exception 'Someone can''t report to themselves.';
  end if;
  -- Walk up from the new upline; if we reach this person, it's a loop.
  with recursive chain(id, depth) as (
    select new.manager_id, 1
    union all
    select p.manager_id, c.depth + 1
    from public.profiles p join chain c on p.id = c.id
    where p.manager_id is not null and c.depth < 60
  )
  select exists (select 1 from chain where id = new.id) into loops;
  if loops then
    raise exception 'That would create a reporting loop: the person you picked already reports up to them.';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_reporting_loop"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."producer_agreements_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Signed agreements are kept. They can''t be deleted.';
  end if;
  if old.status = 'completed'
     and (to_jsonb(new) - 'user_id' - 'updated_at') is distinct from (to_jsonb(old) - 'user_id' - 'updated_at') then
    raise exception 'A completed agreement can''t be changed.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."producer_agreements_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."profiles_tab_my_name"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select display_name from public.profiles where id = auth.uid()
$$;


ALTER FUNCTION "public"."profiles_tab_my_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."profiles_tab_stamp_row"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_table_name = 'entity_checks' then
    new.done_by := auth.uid();
    new.done_by_name := public.profiles_tab_my_name();
  elsif tg_table_name = 'entity_documents' then
    new.uploaded_by := auth.uid();
    new.uploaded_by_name := public.profiles_tab_my_name();
    new.created_at := now();
  elsif tg_table_name = 'profile_notes' then
    new.author_id := auth.uid();
    new.author_name := public.profiles_tab_my_name();
    new.created_at := now();
  elsif tg_table_name = 'person_flags' then
    new.flagged_by := auth.uid();
    new.flagged_by_name := public.profiles_tab_my_name();
    new.flagged_at := now();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."profiles_tab_stamp_row"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prospects_keep_referrer_own"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.referred_by_id is not null
     and (new.referred_by_id = new.id
          or not exists (select 1 from public.prospects p where p.id = new.referred_by_id and p.user_id = new.user_id)) then
    new.referred_by_id := null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."prospects_keep_referrer_own"() OWNER TO "postgres";


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
    return new;
  end if;

  if new.role is distinct from old.role
     or new.manager_id is distinct from old.manager_id
     or new.display_name is distinct from old.display_name
     or new.email is distinct from old.email
     or new.hierarchy_tier is distinct from old.hierarchy_tier
     or new.solar_system_id is distinct from old.solar_system_id
     or new.viewing_system_id is distinct from old.viewing_system_id then
    raise exception 'Not authorized to change this field';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."protect_profile_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recruit_signups"("p_start" "date", "p_end" "date") RETURNS TABLE("invite_id" "uuid", "upline_id" "uuid", "created_by" "uuid", "recruit_id" "uuid", "recruit_name" "text", "signed_up_at" timestamp with time zone, "appointment_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select i.id, i.upline_id, i.created_by, i.used_by, p.display_name, i.used_at, i.appointment_id
  from public.recruit_invites i
  left join public.profiles p on p.id = i.used_by
  where auth.uid() is not null
    and i.used_at is not null and i.used_by is not null
    and i.used_at >= public.recruits_from_signups_since()
    and (i.used_at at time zone 'America/Chicago')::date between p_start and p_end
    and not public.signup_already_counted(i.appointment_id)
    and (
      i.upline_id = auth.uid()
      or i.created_by = auth.uid()
      or i.upline_id in (select public.my_downline_ids())
      or (public.pl_admin_of(i.upline_id) and public.pl_sees_person(i.upline_id))
    )
    and i.solar_system_id is null
  order by i.used_at;
$$;


ALTER FUNCTION "public"."recruit_signups"("p_start" "date", "p_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recruit_win_detail"("p_appointment" "uuid", "p_upline" "uuid", "p_client" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (select jsonb_build_object('recruit_id', i.used_by)
       from public.recruit_invites i
      where i.appointment_id = p_appointment and i.used_by is not null
      order by i.used_at desc limit 1),
    (select jsonb_build_object('recruit_id', p.id)
       from public.profiles p
      where p.manager_id = p_upline and lower(trim(p.display_name)) = lower(trim(coalesce(p_client, '')))
      order by p.created_at desc limit 1),
    case when nullif(trim(coalesce(p_client, '')), '') is not null
         then jsonb_build_object('name', trim(p_client)) else '{}'::jsonb end
  );
$$;


ALTER FUNCTION "public"."recruit_win_detail"("p_appointment" "uuid", "p_upline" "uuid", "p_client" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recruits_from_signups_since"() RETURNS timestamp with time zone
    LANGUAGE "sql" IMMUTABLE
    AS $$select '2026-10-24 05:17:44.52145+00'::timestamptz$$;


ALTER FUNCTION "public"."recruits_from_signups_since"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recruits_switch_date"() RETURNS "date"
    LANGUAGE "sql" STABLE
    AS $$
  select (public.recruits_from_signups_since() at time zone 'America/Chicago')::date;
$$;


ALTER FUNCTION "public"."recruits_switch_date"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_user_storage"("target" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'storage'
    AS $$
begin
  begin
    update storage.objects set owner_id = null where owner_id = target::text;
  exception when undefined_column then null;
  end;
  begin
    update storage.objects set owner = null where owner = target;
  exception when undefined_column then null;
  end;
end;
$$;


ALTER FUNCTION "public"."release_user_storage"("target" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_chat_message"("p_message" "uuid", "p_reason" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  me uuid := auth.uid();
  msg public.chat_messages%rowtype;
  rid uuid;
  today int;
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  select * into msg from public.chat_messages where id = p_message;
  if not found or msg.deleted_at is not null then
    raise exception 'not_found';
  end if;
  if msg.user_id = me then
    raise exception 'own_message';
  end if;
  select count(*) into today from public.chat_reports where reporter_id = me and created_at > now() - interval '1 day';
  if today >= 20 then
    raise exception 'slow_down';
  end if;
  insert into public.chat_reports (message_id, reporter_id, reason, message_body, message_author)
  values (p_message, me, left(btrim(coalesce(p_reason, '')), 500), msg.body, msg.user_id)
  on conflict (message_id, reporter_id) do update set reason = excluded.reason
  returning id into rid;
  return rid;
end;
$$;


ALTER FUNCTION "public"."report_chat_message"("p_message" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_chat_report"("p_report" "uuid", "p_remove" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  me uuid := auth.uid();
  msg uuid;
begin
  if not public.pl_admin_of((select m.user_id from public.chat_messages m join public.chat_reports r on r.message_id = m.id where r.id = p_report)) then
    raise exception 'not_allowed';
  end if;
  select message_id into msg from public.chat_reports where id = p_report;
  if not found then
    raise exception 'not_found';
  end if;
  if p_remove then
    update public.chat_messages set deleted_at = coalesce(deleted_at, now()), deleted_by = coalesce(deleted_by, me), body = ''
     where id = msg;
    update public.chat_reports set resolved_at = now(), resolved_by = me, outcome = 'removed'
     where message_id = msg and resolved_at is null;
  else
    update public.chat_reports set resolved_at = now(), resolved_by = me, outcome = 'kept'
     where message_id = msg and resolved_at is null;
  end if;
end;
$$;


ALTER FUNCTION "public"."resolve_chat_report"("p_report" "uuid", "p_remove" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_presenting_hours"("p_settings" "jsonb", "p_hours" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  me uuid := auth.uid();
  v_tz text := coalesce(nullif(btrim(p_settings ->> 'timezone'), ''), 'America/Chicago');
  v_hours jsonb := coalesce(p_hours, '[]'::jsonb);
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from pg_timezone_names where name = v_tz) then raise exception 'bad_timezone'; end if;
  if jsonb_typeof(v_hours) <> 'array' or jsonb_array_length(v_hours) > 42 then raise exception 'bad_hours'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_hours) x
     where coalesce(x ->> 'weekday', '') !~ '^[0-6]$'
        or coalesce(x ->> 'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
        or coalesce(x ->> 'end', '') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?|24:00)$'
  ) then raise exception 'bad_hours'; end if;
  if exists (select 1 from jsonb_array_elements(v_hours) x where (x ->> 'end')::time <= (x ->> 'start')::time and x ->> 'end' <> '24:00') then
    raise exception 'end_before_start';
  end if;
  if exists (
    with h as (
      select (x ->> 'weekday')::int as wd, (x ->> 'start')::time as st,
             case when x ->> 'end' = '24:00' then time '23:59:59' else (x ->> 'end')::time end as en, n
        from jsonb_array_elements(v_hours) with ordinality as t(x, n)
    )
    select 1 from h a join h b on a.wd = b.wd and a.n < b.n and a.st < b.en and b.st < a.en
  ) then raise exception 'overlapping_hours'; end if;

  insert into public.presenter_settings as ps (user_id, timezone, slot_minutes, step_minutes, buffer_minutes, notice_minutes, horizon_days, use_google, accepting, updated_at)
  values (me, v_tz,
          coalesce((p_settings ->> 'slot_minutes')::int, 60), coalesce((p_settings ->> 'step_minutes')::int, 30),
          coalesce((p_settings ->> 'buffer_minutes')::int, 0), coalesce((p_settings ->> 'notice_minutes')::int, 120),
          coalesce((p_settings ->> 'horizon_days')::int, 14), coalesce((p_settings ->> 'use_google')::boolean, false),
          coalesce((p_settings ->> 'accepting')::boolean, true), now())
  on conflict (user_id) do update set
    timezone = excluded.timezone, slot_minutes = excluded.slot_minutes, step_minutes = excluded.step_minutes,
    buffer_minutes = excluded.buffer_minutes, notice_minutes = excluded.notice_minutes, horizon_days = excluded.horizon_days,
    use_google = excluded.use_google, accepting = excluded.accepting, updated_at = now();

  delete from public.presenter_hours where user_id = me;
  insert into public.presenter_hours (user_id, weekday, start_time, end_time)
  select me, (x ->> 'weekday')::smallint, (x ->> 'start')::time,
         case when x ->> 'end' = '24:00' then time '23:59:59' else (x ->> 'end')::time end
    from jsonb_array_elements(v_hours) x;

  return jsonb_build_object('ok', true, 'hours', jsonb_array_length(v_hours));
end;
$_$;


ALTER FUNCTION "public"."save_presenting_hours"("p_settings" "jsonb", "p_hours" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_back_promotion"("p_request" "uuid", "p_note" "text") RETURNS "public"."promotion_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  r public.promotion_requests;
  me_name text;
  me_role text;
begin
  select display_name, role into me_name, me_role from public.profiles where id = auth.uid();
  if not public.pl_can_decide_promotion(p_request) then
    raise exception 'Only super admins can send a promotion back.';
  end if;
  update public.promotion_requests
     set status = 'sent_back', decided_by = auth.uid(), decided_by_name = me_name, decided_at = now(),
         decision_note = nullif(left(btrim(coalesce(p_note, '')), 500), '')
   where id = p_request and status = 'submitted'
  returning * into r;
  if not found then
    raise exception 'That submission isn''t waiting for approval any more.';
  end if;
  return r;
end;
$$;


ALTER FUNCTION "public"."send_back_promotion"("p_request" "uuid", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_appointment_trainee"("p_appointment" "uuid", "p_trainee" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  me uuid := auth.uid();
  a record;
  trainee_name text;
  ok_team boolean;
begin
  if me is null then
    raise exception 'Sign in first.';
  end if;
  select id, user_id, presenter_id, appointment_at into a from public.appointments where id = p_appointment for update;
  if not found then
    raise exception 'That appointment wasn''t found.';
  end if;
  if not (
    a.user_id = me
    or a.presenter_id = me
    or a.user_id in (select public.my_downline_ids())
    or public.pl_admin_of(a.user_id)
  ) then
    raise exception 'You can only change appointments on your team.';
  end if;
  if a.appointment_at is null or a.appointment_at <= now() then
    raise exception 'Trainees can only be added to appointments that haven''t started yet.';
  end if;

  if p_trainee is null then
    update public.appointments set trainee_id = null, trainee = null where id = a.id;
    return jsonb_build_object('ok', true, 'traineeId', null, 'trainee', null);
  end if;

  if a.presenter_id is null or p_trainee = a.presenter_id then
    raise exception 'Pick someone other than the presenter.';
  end if;
  with recursive below(id, depth) as (
    select p.id, 1 from public.profiles p where p.manager_id = a.presenter_id
    union all
    select p.id, b.depth + 1 from public.profiles p join below b on p.manager_id = b.id where b.depth < 50
  )
  select exists (select 1 from below where below.id = p_trainee) into ok_team;
  if not ok_team then
    raise exception 'The trainee has to be on the presenter''s team.';
  end if;
  if exists (
    select 1 from public.appointments x
    where x.id <> a.id and x.appointment_at = a.appointment_at
      and (x.user_id = p_trainee or x.presenter_id = p_trainee or x.trainee_id = p_trainee)
  ) then
    raise exception 'They''re already on another appointment at that time.';
  end if;

  select display_name into trainee_name from public.profiles where id = p_trainee;
  update public.appointments set trainee_id = p_trainee, trainee = trainee_name where id = a.id;
  return jsonb_build_object('ok', true, 'traineeId', p_trainee, 'trainee', trainee_name);
end;
$$;


ALTER FUNCTION "public"."set_appointment_trainee"("p_appointment" "uuid", "p_trainee" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_my_avatar"("p_path" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  me uuid := auth.uid();
  old_path text;
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  -- Only a photo in your own folder.
  if p_path is not null and p_path !~ ('^' || me::text || '/[A-Za-z0-9_-]{1,40}\.(jpg|jpeg|png|webp)$') then
    raise exception 'bad_path';
  end if;
  select avatar_path into old_path from public.profiles where id = me for update;
  if not found then
    raise exception 'no_profile';
  end if;
  update public.profiles set avatar_path = p_path where id = me;
  return case when old_path is distinct from p_path then old_path end;
end;
$_$;


ALTER FUNCTION "public"."set_my_avatar"("p_path" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_my_phone"("p_phone" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."set_my_phone"("p_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."signup_already_counted"("p_appointment" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p_appointment is not null and exists (
    select 1 from public.appointments a
    where a.id = p_appointment and coalesce(a.officially_recruited, false)
      and a.appointment_date < public.recruits_switch_date()
  );
$$;


ALTER FUNCTION "public"."signup_already_counted"("p_appointment" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stamp_licensed_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  now_licensed boolean := coalesce(btrim(new.npn), '') <> '' and coalesce(btrim(new.fg_writing_number), '') <> '';
  was_licensed boolean := false;
begin
  if tg_op = 'UPDATE' then
    new.licensed_at := old.licensed_at;
    was_licensed := coalesce(btrim(old.npn), '') <> '' and coalesce(btrim(old.fg_writing_number), '') <> '';
  else
    new.licensed_at := null;
  end if;
  -- Only at the moment someone goes from not licensed to licensed (people
  -- licensed before this update keep an empty date rather than a wrong one).
  if now_licensed and not was_licensed and new.licensed_at is null then
    new.licensed_at := now();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."stamp_licensed_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stamp_note_author_name"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  nm text;
begin
  if auth.uid() is not null then
    select display_name into nm from public.profiles where id = auth.uid();
    if nm is not null then new.author_name := nm; end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."stamp_note_author_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stamp_solar_system"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    if new.solar_system_id is null or not public.pl_is_galaxy_admin() then
      new.solar_system_id := case when auth.uid() is null then coalesce(new.solar_system_id, public.pl_big_system())
                                  else public.pl_writer_system() end;
    end if;
  else
    new.solar_system_id := old.solar_system_id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."stamp_solar_system"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stamp_win_system"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.solar_system_id is null then
    new.solar_system_id := coalesce(public.pl_system_of(new.user_id), public.pl_big_system());
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."stamp_win_system"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_client_intake_response"("p_token" "text", "p_responses" "jsonb", "p_final" boolean DEFAULT false) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_status text;
begin
  select status into v_status from client_intake_candidates where token = p_token;

  if not found or v_status = 'submitted' then
    return false;
  end if;

  update client_intake_candidates
  set responses = p_responses,
      status = case when p_final then 'submitted' else status end,
      submitted_at = case when p_final then now() else submitted_at end
  where token = p_token;

  return true;
end;
$$;


ALTER FUNCTION "public"."submit_client_intake_response"("p_token" "text", "p_responses" "jsonb", "p_final" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."team_open_invites"() RETURNS TABLE("id" "uuid", "invitee_name" "text", "upline_id" "uuid", "created_by" "uuid", "created_at" timestamp with time zone, "expires_at" timestamp with time zone, "emailed_to" "text", "emailed_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select i.id, i.invitee_name, i.upline_id, i.created_by, i.created_at, i.expires_at, i.emailed_to, i.emailed_at
  from public.recruit_invites i
  where i.used_at is null
    and i.expires_at > now()
    and (
      i.created_by = auth.uid()
      or i.upline_id = auth.uid()
      or i.created_by in (select public.my_downline_ids())
      or i.upline_id in (select public.my_downline_ids())
      or (public.pl_admin_of(i.upline_id) and public.pl_sees_person(i.upline_id))
    )
  order by i.created_at desc
  limit 500;
$$;


ALTER FUNCTION "public"."team_open_invites"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tidy_appointment_names"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    new.client_name := public.pl_tidy_name(new.client_name);
    new.presenter := public.pl_tidy_name(new.presenter);
    new.trainee := public.pl_tidy_name(new.trainee);
  else
    if new.client_name is distinct from old.client_name then new.client_name := public.pl_tidy_name(new.client_name); end if;
    if new.presenter is distinct from old.presenter then new.presenter := public.pl_tidy_name(new.presenter); end if;
    if new.trainee is distinct from old.trainee then new.trainee := public.pl_tidy_name(new.trainee); end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."tidy_appointment_names"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tidy_intake_name"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    new.client_name := public.pl_tidy_name(new.client_name);
  elsif new.client_name is distinct from old.client_name then
    new.client_name := public.pl_tidy_name(new.client_name);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."tidy_intake_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tidy_invitee_name"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    new.invitee_name := public.pl_tidy_name(new.invitee_name);
  elsif new.invitee_name is distinct from old.invitee_name then
    new.invitee_name := public.pl_tidy_name(new.invitee_name);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."tidy_invitee_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tidy_profile_name"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    new.display_name := public.pl_tidy_name(new.display_name);
  elsif new.display_name is distinct from old.display_name then
    new.display_name := public.pl_tidy_name(new.display_name);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."tidy_profile_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tidy_prospect_names"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    new.first_name := public.pl_tidy_name(new.first_name);
    new.last_name := public.pl_tidy_name(new.last_name);
  else
    if new.first_name is distinct from old.first_name then new.first_name := public.pl_tidy_name(new.first_name); end if;
    if new.last_name is distinct from old.last_name then new.last_name := public.pl_tidy_name(new.last_name); end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."tidy_prospect_names"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tier_rank"("t" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select coalesce(array_position(array['UA','FA','SA','AD','FD','SFD','DFD','EFD','FVC','EVC'], t), 0);
$$;


ALTER FUNCTION "public"."tier_rank"("t" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_licensing_progress"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_licensing_progress"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."track_hierarchy_tier_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if TG_OP = 'INSERT' then
    new.hierarchy_tier_changed_at := now();
  elsif new.hierarchy_tier is distinct from old.hierarchy_tier then
    new.hierarchy_tier_changed_at := now();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."track_hierarchy_tier_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_my_profile"("p_display_name" "text", "p_npn" "text", "p_fg_writing_number" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  me uuid := auth.uid();
  new_name text := btrim(regexp_replace(coalesce(p_display_name, ''), '\s+', ' ', 'g'));
  new_npn text := nullif(regexp_replace(coalesce(p_npn, ''), '[\s-]', '', 'g'), '');
  new_fg text := nullif(btrim(coalesce(p_fg_writing_number, '')), '');
  old_name text;
  saved public.profiles%rowtype;
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  if char_length(new_name) < 2 then
    raise exception 'name_required';
  end if;
  if char_length(new_name) > 80 then
    raise exception 'name_too_long';
  end if;
  if new_npn is not null and new_npn !~ '^[0-9]{1,15}$' then
    raise exception 'npn_digits';
  end if;
  if new_fg is not null and char_length(new_fg) > 40 then
    raise exception 'fg_too_long';
  end if;

  select display_name into old_name from public.profiles where id = me;
  if not found then
    raise exception 'no_profile';
  end if;

  perform set_config('pl.trusted_profile_edit', 'on', true);
  update public.profiles
     set display_name = new_name, npn = new_npn, fg_writing_number = new_fg
   where id = me
  returning * into saved;

  if old_name is distinct from new_name then
    update public.appointments set presenter = new_name where presenter_id = me and presenter is distinct from new_name;
    update public.appointments set trainee = new_name where trainee_id = me and trainee is distinct from new_name;
  end if;

  return jsonb_build_object(
    'display_name', saved.display_name,
    'npn', saved.npn,
    'fg_writing_number', saved.fg_writing_number,
    'licensed_at', saved.licensed_at
  );
end;
$_$;


ALTER FUNCTION "public"."update_my_profile"("p_display_name" "text", "p_npn" "text", "p_fg_writing_number" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upline_busy_times"("p_start" "date", "p_end" "date") RETURNS SETOF "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select to_jsonb(b) - 'label'
  from public.manager_availability_blocks b
  where b.user_id in (select public.my_upline_ids())
    and b.block_date between p_start and p_end
  order by b.block_date, b.start_time;
$$;


ALTER FUNCTION "public"."upline_busy_times"("p_start" "date", "p_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."weekly_top3"("p_week_start" "date") RETURNS TABLE("category" "text", "user_id" "uuid", "display_name" "text", "n" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select t.* from public.pl_weekly_top3_in(p_week_start, null) t where auth.uid() is not null;
$$;


ALTER FUNCTION "public"."weekly_top3"("p_week_start" "date") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcement_confirmations" (
    "announcement_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "confirmed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."announcement_confirmations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "audience" "text" DEFAULT 'everyone'::"text" NOT NULL,
    "must_confirm" boolean DEFAULT false NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "ended_at" timestamp with time zone,
    "created_by" "uuid",
    "created_by_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "solar_system_id" "uuid",
    CONSTRAINT "announcements_valid" CHECK (((("char_length"("btrim"("title")) >= 1) AND ("char_length"("btrim"("title")) <= 120)) AND (("char_length"("btrim"("body")) >= 1) AND ("char_length"("btrim"("body")) <= 2000)) AND ("audience" = ANY (ARRAY['everyone'::"text", 'leaders'::"text"])) AND ("ends_at" > "starts_at")))
);


ALTER TABLE "public"."announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date_set_option" "text" NOT NULL,
    "category" "text" NOT NULL,
    "week_of" "date" NOT NULL,
    "appointment_date" "date" NOT NULL,
    "appointment_time" time without time zone NOT NULL,
    "presenter" "text" NOT NULL,
    "trainee" "text",
    "client_name" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "outcome" "text",
    "follow_up_scheduled" boolean,
    "result" "text",
    "interested_tax" boolean,
    "interested_insurance" boolean,
    "follow_up_completed_at" timestamp with time zone,
    "status" "text",
    "presentation_type" "text",
    "target_premium" numeric,
    "appointment_timezone" "text",
    "appointment_at" timestamp with time zone,
    "is_follow_up" boolean DEFAULT false NOT NULL,
    "follow_up_appointment_date" "date",
    "follow_up_appointment_time" time without time zone,
    "follow_up_appointment_timezone" "text",
    "follow_up_appointment_at" timestamp with time zone,
    "effective_date" "date",
    "requirements_completed" boolean DEFAULT false NOT NULL,
    "presentation_type_secondary" "text",
    "officially_recruited" boolean DEFAULT false NOT NULL,
    "officially_sold" boolean DEFAULT false NOT NULL,
    "zoom_url" "text",
    "presenter_id" "uuid",
    "trainee_id" "uuid",
    "client_intake_requested" boolean DEFAULT false NOT NULL,
    "client_email" "text",
    "client_phone" "text",
    "invitee_emails" "text"[],
    "invite_method" "text",
    "invite_sent_at" timestamp with time zone,
    "prospect_id" "uuid",
    "outcome_logged_by" "uuid",
    "duration_minutes" integer DEFAULT 60 NOT NULL,
    "split_user_id" "uuid",
    "split_percent" smallint,
    CONSTRAINT "appointments_client_phone_length" CHECK ((("client_phone" IS NULL) OR ("char_length"("client_phone") <= 40))),
    CONSTRAINT "appointments_duration_valid" CHECK ((("duration_minutes" >= 5) AND ("duration_minutes" <= 720))),
    CONSTRAINT "appointments_split_shape" CHECK (((("split_user_id" IS NULL) AND ("split_percent" IS NULL)) OR (("split_user_id" IS NOT NULL) AND (("split_percent" >= 1) AND ("split_percent" <= 99)) AND ("split_user_id" <> "user_id"))))
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid",
    "actor_name" "text" NOT NULL,
    "action" "text" NOT NULL,
    "target_name" "text",
    "details" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reason" "text",
    "target_id" "uuid"
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_plans" (
    "user_id" "uuid" NOT NULL,
    "mortgage_rent" numeric,
    "household" numeric,
    "food" numeric,
    "car" numeric,
    "entertainment" numeric,
    "child_care" numeric,
    "education" numeric,
    "investments_savings" numeric,
    "other_expenses" numeric,
    "target_premium" numeric DEFAULT 3600 NOT NULL,
    "commission_rate" numeric DEFAULT 50 NOT NULL,
    "income_goal_override" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "marketing_goals" "text",
    "marketing_strategies" "text",
    "marketing_tactics" "text"
);


ALTER TABLE "public"."business_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_blocks" (
    "blocker_id" "uuid" NOT NULL,
    "blocked_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chat_blocks_check" CHECK (("blocker_id" <> "blocked_id"))
);


ALTER TABLE "public"."chat_blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_filter_words" (
    "word" "text" NOT NULL,
    CONSTRAINT "chat_filter_words_word_check" CHECK (("word" ~ '^[a-z]{3,30}$'::"text"))
);


ALTER TABLE "public"."chat_filter_words" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_reads" (
    "user_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chat_reads_channel_check" CHECK (("channel" = ANY (ARRAY['general'::"text", 'work'::"text", 'urgent'::"text"])))
);


ALTER TABLE "public"."chat_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "reason" "text" DEFAULT ''::"text" NOT NULL,
    "message_body" "text" NOT NULL,
    "message_author" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "emailed_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "outcome" "text",
    CONSTRAINT "chat_reports_outcome_check" CHECK (("outcome" = ANY (ARRAY['removed'::"text", 'kept'::"text"]))),
    CONSTRAINT "chat_reports_reason_check" CHECK (("char_length"("reason") <= 500))
);


ALTER TABLE "public"."chat_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_rules" (
    "user_id" "uuid" NOT NULL,
    "accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."chat_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_intake_candidates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "advisor_id" "uuid" NOT NULL,
    "advisor_name" "text",
    "source_appointment_id" "uuid",
    "client_name" "text" NOT NULL,
    "token" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "responses" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "submitted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone,
    "sent_via" "text",
    "emailed_at" timestamp with time zone,
    "email_send_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "client_intake_candidates_sent_via_check" CHECK ((("sent_via" IS NULL) OR ("sent_via" = ANY (ARRAY['text'::"text", 'email'::"text", 'copy'::"text"]))))
);


ALTER TABLE "public"."client_intake_candidates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coaching_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "advisor_id" "uuid" NOT NULL,
    "week_of" "date" NOT NULL,
    "author_id" "uuid",
    "author_name" "text" NOT NULL,
    "note" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."coaching_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commission_agent_links" (
    "agent_code" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "linked_by" "uuid",
    "linked_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."commission_agent_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commission_disbursements" (
    "record_id" "text" NOT NULL,
    "disbursed_date" "date",
    "agent_code" "text" NOT NULL,
    "user_id" "uuid",
    "amount" numeric(14,4) DEFAULT 0 NOT NULL,
    "positive_amount" numeric(14,4),
    "negative_amount" numeric(14,4),
    "ledger_count" integer,
    "status" "text",
    "processed_at" timestamp with time zone,
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."commission_disbursements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commission_lines" (
    "record_id" "text" NOT NULL,
    "event_id" "text" NOT NULL,
    "level" "text",
    "disbursement_record_id" "text",
    "paid_on" "date",
    "agent_code" "text" NOT NULL,
    "user_id" "uuid",
    "writer_code" "text",
    "writer_user_id" "uuid",
    "amount" numeric(14,4) NOT NULL,
    "rate" numeric(12,4),
    "type" "text",
    "label" "text",
    "carrier" "text",
    "policy_number" "text",
    "insured_name" "text",
    "status" "text",
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."commission_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commission_receipts" (
    "id" bigint NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "disbursements" integer DEFAULT 0 NOT NULL,
    "lines" integer DEFAULT 0 NOT NULL,
    "new_rows" integer DEFAULT 0 NOT NULL,
    "updated_rows" integer DEFAULT 0 NOT NULL,
    "unchanged_rows" integer DEFAULT 0 NOT NULL,
    "rejected" integer DEFAULT 0 NOT NULL,
    "problems" "jsonb"
);


ALTER TABLE "public"."commission_receipts" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."commission_receipts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."commission_receipts_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."commission_receipts_id_seq" OWNED BY "public"."commission_receipts"."id";



CREATE TABLE IF NOT EXISTS "public"."commission_settings" (
    "id" integer NOT NULL,
    "key_hash" "text",
    "key_hint" "text",
    "key_made_by" "uuid",
    "key_made_at" timestamp with time zone,
    CONSTRAINT "commission_settings_id_check" CHECK (("id" = 1))
);


ALTER TABLE "public"."commission_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contracting_cases" (
    "user_id" "uuid" NOT NULL,
    "info_sent_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "notified_at" timestamp with time zone,
    "info_deleted_at" timestamp with time zone,
    "delete_reason" "text",
    "entered_at" timestamp with time zone,
    "entered_by" "uuid",
    "review_sent_at" timestamp with time zone,
    "agent_signed_at" timestamp with time zone,
    "sent_to_carrier_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contracting_cases_delete_reason_check" CHECK ((("delete_reason" IS NULL) OR ("delete_reason" = ANY (ARRAY['entered'::"text", 'withdrawn'::"text", 'expired'::"text", 'kill_switch'::"text"]))))
);


ALTER TABLE "public"."contracting_cases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contracting_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "mime" "text" NOT NULL,
    "size" integer NOT NULL,
    "name" "jsonb" NOT NULL,
    "iv" "text" NOT NULL,
    "ct" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contracting_files_ct_check" CHECK ((("char_length"("ct") >= 16) AND ("char_length"("ct") <= 5600000))),
    CONSTRAINT "contracting_files_iv_check" CHECK ((("char_length"("iv") >= 12) AND ("char_length"("iv") <= 32))),
    CONSTRAINT "contracting_files_kind_check" CHECK (("kind" = ANY (ARRAY['dl_front'::"text", 'eo_certificate'::"text", 'aml_certificate'::"text", 'background_doc'::"text", 'bank_doc'::"text"]))),
    CONSTRAINT "contracting_files_mime_check" CHECK (("mime" = ANY (ARRAY['image/jpeg'::"text", 'image/png'::"text", 'application/pdf'::"text"]))),
    CONSTRAINT "contracting_files_size_check" CHECK ((("size" >= 1) AND ("size" <= 4194304)))
);


ALTER TABLE "public"."contracting_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contracting_log" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "agent_name" "text",
    "actor_id" "uuid",
    "actor_name" "text",
    "action" "text" NOT NULL,
    "detail" "text",
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contracting_log_action_check" CHECK (("char_length"("action") <= 40)),
    CONSTRAINT "contracting_log_detail_check" CHECK ((("detail" IS NULL) OR ("char_length"("detail") <= 200)))
);


ALTER TABLE "public"."contracting_log" OWNER TO "postgres";


ALTER TABLE "public"."contracting_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."contracting_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."contracting_secrets" (
    "user_id" "uuid" NOT NULL,
    "key_id" "text" NOT NULL,
    "wrapped_key" "text" NOT NULL,
    "fields" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "submitted_at" timestamp with time zone,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contracting_secrets_wrapped_key_check" CHECK ((("char_length"("wrapped_key") >= 100) AND ("char_length"("wrapped_key") <= 2000)))
);


ALTER TABLE "public"."contracting_secrets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contracting_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "paused" boolean DEFAULT false NOT NULL,
    "public_key" "jsonb",
    "key_id" "text",
    "key_set_at" timestamp with time zone,
    "key_set_by" "uuid",
    "key_verified_at" timestamp with time zone,
    "agreement_version" "text",
    "docuseal_template_id" bigint,
    "last_review_at" timestamp with time zone,
    "last_review_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contracting_settings_id_check" CHECK ("id")
);


ALTER TABLE "public"."contracting_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contracting_staff" (
    "user_id" "uuid" NOT NULL,
    "added_by" "uuid",
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."contracting_staff" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_size" bigint,
    "uploaded_by" "uuid",
    "uploaded_by_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "file_type" "text" DEFAULT 'pdf'::"text" NOT NULL,
    "solar_system_id" "uuid",
    "copied_from" "uuid"
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entity_checks" (
    "entity_id" "uuid" NOT NULL,
    "item" "text" NOT NULL,
    "done_on" "date" DEFAULT CURRENT_DATE NOT NULL,
    "done_by" "uuid",
    "done_by_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "entity_checks_item_key" CHECK (("item" ~ '^[A-Za-z0-9_]{1,60}$'::"text"))
);


ALTER TABLE "public"."entity_checks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entity_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "step" "text",
    "file_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "size_bytes" bigint,
    "content_type" "text",
    "uploaded_by" "uuid",
    "uploaded_by_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."entity_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entity_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "partner_id" "uuid",
    "partner_name" "text",
    "formed_in" "text" DEFAULT 'Nevada'::"text" NOT NULL,
    "operating_states" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "nv_entity_number" "text",
    "ein" "text",
    "entity_npn" "text",
    "resident_license_number" "text",
    "eo_carrier" "text",
    "eo_policy_number" "text",
    "eo_expires_on" "date",
    "fg_writing_number" "text",
    "bank_name" "text",
    "contact_email" "text",
    "contact_phone" "text",
    "flag_reason" "text",
    "flagged_at" timestamp with time zone,
    "flagged_by_name" "text",
    "archived_at" timestamp with time zone,
    "created_by" "uuid",
    "created_by_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "entity_profiles_sizes" CHECK (((("char_length"("btrim"("name")) >= 1) AND ("char_length"("btrim"("name")) <= 160)) AND (COALESCE("char_length"("partner_name"), 0) <= 120) AND ("char_length"("formed_in") <= 40) AND ("cardinality"("operating_states") <= 60) AND (COALESCE("char_length"("nv_entity_number"), 0) <= 60) AND (COALESCE("char_length"("ein"), 0) <= 20) AND (COALESCE("char_length"("entity_npn"), 0) <= 20) AND (COALESCE("char_length"("resident_license_number"), 0) <= 60) AND (COALESCE("char_length"("eo_carrier"), 0) <= 120) AND (COALESCE("char_length"("eo_policy_number"), 0) <= 60) AND (COALESCE("char_length"("fg_writing_number"), 0) <= 40) AND (COALESCE("char_length"("bank_name"), 0) <= 120) AND (COALESCE("char_length"("contact_email"), 0) <= 200) AND (COALESCE("char_length"("contact_phone"), 0) <= 40) AND (COALESCE("char_length"("flag_reason"), 0) <= 500)))
);


ALTER TABLE "public"."entity_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."follow_up_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "author_id" "uuid",
    "author_name" "text",
    "note" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."follow_up_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."google_calendar_connections" (
    "user_id" "uuid" NOT NULL,
    "refresh_token" "text" NOT NULL,
    "access_token" "text",
    "access_token_expires_at" timestamp with time zone,
    "google_email" "text",
    "connected_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."google_calendar_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."important_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "url" "text" NOT NULL,
    "created_by" "uuid",
    "created_by_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "solar_system_id" "uuid",
    "copied_from" "uuid"
);


ALTER TABLE "public"."important_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."manager_availability_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_name" "text",
    "block_date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "label" "text",
    "recurring_group_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "timezone" "text",
    "start_at" timestamp with time zone,
    "end_at" timestamp with time zone
);


ALTER TABLE "public"."manager_availability_blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "role" "text" DEFAULT 'advisor'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email" "text",
    "manager_id" "uuid",
    "calendly_url" "text",
    "zoom_url" "text",
    "hierarchy_tier" "text",
    "npn" "text",
    "fg_writing_number" "text",
    "hierarchy_tier_changed_at" timestamp with time zone,
    "licensed_at" timestamp with time zone,
    "avatar_path" "text",
    "solar_system_id" "uuid" NOT NULL,
    "viewing_system_id" "uuid",
    CONSTRAINT "profiles_avatar_path_length" CHECK ((("avatar_path" IS NULL) OR ("char_length"("avatar_path") <= 200))),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['advisor'::"text", 'manager'::"text", 'super_manager'::"text", 'super_admin'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."manager_directory" AS
 SELECT "id",
    "display_name"
   FROM "public"."profiles"
  WHERE (("role" = ANY (ARRAY['manager'::"text", 'super_manager'::"text", 'super_admin'::"text"])) AND (("id" = "auth"."uid"()) OR "public"."pl_sees_system"("solar_system_id")));


ALTER VIEW "public"."manager_directory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."onboarding_progress" (
    "user_id" "uuid" NOT NULL,
    "steps" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "done_count" integer DEFAULT 0 NOT NULL,
    "total_count" integer DEFAULT 0 NOT NULL,
    "next_step" "text",
    "visibility" "text" DEFAULT 'auto'::"text" NOT NULL,
    "completed_at" timestamp with time zone,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "onboarding_progress_visibility_check" CHECK (("visibility" = ANY (ARRAY['auto'::"text", 'shown'::"text", 'hidden'::"text"])))
);


ALTER TABLE "public"."onboarding_progress" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."org_directory" AS
 SELECT "id",
    "display_name",
    "manager_id",
    "role",
    "solar_system_id"
   FROM "public"."profiles"
  WHERE (("id" = "auth"."uid"()) OR "public"."pl_sees_system"("solar_system_id"));


ALTER VIEW "public"."org_directory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."person_contacts" (
    "user_id" "uuid" NOT NULL,
    "phone" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "person_contacts_phone_check" CHECK ((("phone" IS NULL) OR ("phone" ~ '^[0-9]{10}$'::"text")))
);


ALTER TABLE "public"."person_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."person_flags" (
    "user_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "flagged_by" "uuid",
    "flagged_by_name" "text",
    "flagged_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "person_flags_reason_size" CHECK ((("char_length"("btrim"("reason")) >= 1) AND ("char_length"("btrim"("reason")) <= 500)))
);


ALTER TABLE "public"."person_flags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."policy_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "author_name" "text" NOT NULL,
    "note" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."policy_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."presenter_hours" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "weekday" smallint NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    CONSTRAINT "presenter_hours_order" CHECK (("end_time" > "start_time")),
    CONSTRAINT "presenter_hours_weekday_check" CHECK ((("weekday" >= 0) AND ("weekday" <= 6)))
);


ALTER TABLE "public"."presenter_hours" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."presenter_settings" (
    "user_id" "uuid" NOT NULL,
    "timezone" "text" DEFAULT 'America/Chicago'::"text" NOT NULL,
    "slot_minutes" integer DEFAULT 60 NOT NULL,
    "step_minutes" integer DEFAULT 30 NOT NULL,
    "buffer_minutes" integer DEFAULT 0 NOT NULL,
    "notice_minutes" integer DEFAULT 120 NOT NULL,
    "horizon_days" integer DEFAULT 14 NOT NULL,
    "use_google" boolean DEFAULT false NOT NULL,
    "accepting" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "presenter_settings_buffer_minutes_check" CHECK ((("buffer_minutes" >= 0) AND ("buffer_minutes" <= 60))),
    CONSTRAINT "presenter_settings_horizon_days_check" CHECK ((("horizon_days" >= 1) AND ("horizon_days" <= 60))),
    CONSTRAINT "presenter_settings_notice_minutes_check" CHECK ((("notice_minutes" >= 0) AND ("notice_minutes" <= 10080))),
    CONSTRAINT "presenter_settings_slot_minutes_check" CHECK ((("slot_minutes" >= 15) AND ("slot_minutes" <= 240))),
    CONSTRAINT "presenter_settings_step_minutes_check" CHECK (("step_minutes" = ANY (ARRAY[15, 30, 60])))
);


ALTER TABLE "public"."presenter_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."producer_agreements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "version" "text" NOT NULL,
    "election" "text",
    "docuseal_submission_id" bigint NOT NULL,
    "docuseal_template_id" bigint,
    "agent_submitter_id" bigint,
    "big_submitter_id" bigint,
    "status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "agent_name" "text" NOT NULL,
    "agent_email" "text" NOT NULL,
    "agent_signed_at" timestamp with time zone,
    "countersigned_at" timestamp with time zone,
    "countersigned_by" "uuid",
    "countersigner_name" "text",
    "countersign_notified_at" timestamp with time zone,
    "pdf_path" "text",
    "pdf_sha256" "text",
    "audit_path" "text",
    "audit_sha256" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "producer_agreements_election_check" CHECK ((("election" IS NULL) OR ("election" = ANY (ARRAY['Exclusive'::"text", 'Non-Exclusive'::"text"])))),
    CONSTRAINT "producer_agreements_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'agent_signed'::"text", 'completed'::"text", 'declined'::"text", 'voided'::"text"])))
);


ALTER TABLE "public"."producer_agreements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_id" "uuid",
    "person_id" "uuid",
    "body" "text" NOT NULL,
    "author_id" "uuid",
    "author_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profile_notes_body_size" CHECK ((("char_length"("btrim"("body")) >= 1) AND ("char_length"("btrim"("body")) <= 4000))),
    CONSTRAINT "profile_notes_one_subject" CHECK ((("entity_id" IS NULL) <> ("person_id" IS NULL)))
);


ALTER TABLE "public"."profile_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prospects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "age" integer,
    "relationship_strength" integer DEFAULT 5 NOT NULL,
    "char_age_25_plus" boolean DEFAULT false NOT NULL,
    "char_married_or_relationship" boolean DEFAULT false NOT NULL,
    "char_has_dependents" boolean DEFAULT false NOT NULL,
    "char_homeowner" boolean DEFAULT false NOT NULL,
    "char_currently_working" boolean DEFAULT false NOT NULL,
    "char_ambitious" boolean DEFAULT false NOT NULL,
    "char_dissatisfied" boolean DEFAULT false NOT NULL,
    "char_coachable" boolean DEFAULT false NOT NULL,
    "char_entrepreneur" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "marked_sold" boolean DEFAULT false NOT NULL,
    "marked_recruited" boolean DEFAULT false NOT NULL,
    "source" "text",
    "email" "text",
    "phone" "text",
    "referred_by_id" "uuid",
    CONSTRAINT "prospects_phone_length" CHECK ((("phone" IS NULL) OR ("char_length"("phone") <= 40)))
);


ALTER TABLE "public"."prospects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recruit_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token" "text" NOT NULL,
    "upline_id" "uuid" NOT NULL,
    "invitee_name" "text",
    "appointment_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '30 days'::interval) NOT NULL,
    "used_at" timestamp with time zone,
    "used_by" "uuid",
    "emailed_to" "text",
    "emailed_at" timestamp with time zone,
    "email_send_count" integer DEFAULT 0 NOT NULL,
    "solar_system_id" "uuid",
    "invite_role" "text",
    CONSTRAINT "recruit_invites_invite_role_check" CHECK (("invite_role" = ANY (ARRAY['advisor'::"text", 'super_manager'::"text"]))),
    CONSTRAINT "recruit_invites_token_check" CHECK (("length"("token") >= 32))
);


ALTER TABLE "public"."recruit_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_cron" (
    "id" boolean DEFAULT true NOT NULL,
    "token" "text" DEFAULT ("replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text") || "replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text")) NOT NULL,
    CONSTRAINT "report_cron_id_check" CHECK ("id")
);


ALTER TABLE "public"."report_cron" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_sends" (
    "id" bigint NOT NULL,
    "kind" "text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "test" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'sending'::"text" NOT NULL,
    "sent_to" "text",
    "sent_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone,
    CONSTRAINT "report_sends_kind_check" CHECK (("kind" = ANY (ARRAY['daily'::"text", 'weekly'::"text"]))),
    CONSTRAINT "report_sends_status_check" CHECK (("status" = ANY (ARRAY['sending'::"text", 'sent'::"text"])))
);


ALTER TABLE "public"."report_sends" OWNER TO "postgres";


ALTER TABLE "public"."report_sends" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."report_sends_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."solar_systems" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "short_name" "text" NOT NULL,
    "name" "text" NOT NULL,
    "email_name" "text" NOT NULL,
    "notify_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "solar_systems_short_name_check" CHECK (("short_name" ~ '^[A-Z0-9]{2,8}$'::"text"))
);


ALTER TABLE "public"."solar_systems" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_checklist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "day" "date" NOT NULL,
    "item_key" "text" NOT NULL,
    "label" "text",
    "custom" boolean DEFAULT false NOT NULL,
    "done" boolean DEFAULT false NOT NULL,
    "done_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "team_checklist_item_key_check" CHECK ((("length"("item_key") >= 1) AND ("length"("item_key") <= 120))),
    CONSTRAINT "team_checklist_label_check" CHECK ((("label" IS NULL) OR ("length"("label") <= 200)))
);


ALTER TABLE "public"."team_checklist" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trainings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "training_date" "date" NOT NULL,
    "training_time" time without time zone NOT NULL,
    "timezone" "text" NOT NULL,
    "zoom_url" "text",
    "notes" "text",
    "created_by" "uuid",
    "created_by_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recurring_group_id" "uuid",
    "training_at" timestamp with time zone,
    "duration_minutes" integer DEFAULT 60 NOT NULL,
    "solar_system_id" "uuid",
    "copied_from" "uuid",
    CONSTRAINT "trainings_duration_valid" CHECK ((("duration_minutes" >= 5) AND ("duration_minutes" <= 720)))
);


ALTER TABLE "public"."trainings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."win_reactions" (
    "win_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "win_reactions_emoji_check" CHECK (("emoji" = ANY (ARRAY['clap'::"text", 'fire'::"text", 'muscle'::"text", 'party'::"text", 'raise'::"text", 'hundred'::"text"])))
);


ALTER TABLE "public"."win_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "kind" "text" NOT NULL,
    "ref" "text" NOT NULL,
    "detail" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "solar_system_id" "uuid",
    CONSTRAINT "wins_kind_check" CHECK (("kind" = ANY (ARRAY['sale'::"text", 'first_sale'::"text", 'recruit'::"text", 'joined'::"text", 'licensed'::"text", 'promotion'::"text", 'pace'::"text", 'issued'::"text", 'exam'::"text", 'winners'::"text"]))),
    CONSTRAINT "wins_user_needed" CHECK ((("user_id" IS NOT NULL) OR ("kind" = 'winners'::"text")))
);


ALTER TABLE "public"."wins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zoom_connections" (
    "user_id" "uuid" NOT NULL,
    "refresh_token" "text" NOT NULL,
    "access_token" "text",
    "access_token_expires_at" timestamp with time zone,
    "zoom_email" "text",
    "connected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "zoom_user_id" "text"
);


ALTER TABLE "public"."zoom_connections" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."zoom_connected_managers" AS
 SELECT "p"."id",
    "p"."display_name"
   FROM ("public"."profiles" "p"
     JOIN "public"."zoom_connections" "zc" ON (("zc"."user_id" = "p"."id")))
  WHERE (("p"."role" = ANY (ARRAY['manager'::"text", 'super_manager'::"text", 'super_admin'::"text"])) AND (("p"."id" = "auth"."uid"()) OR "public"."pl_sees_system"("p"."solar_system_id")));


ALTER VIEW "public"."zoom_connected_managers" OWNER TO "postgres";


ALTER TABLE ONLY "public"."commission_receipts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."commission_receipts_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."announcement_confirmations"
    ADD CONSTRAINT "announcement_confirmations_pkey" PRIMARY KEY ("announcement_id", "user_id");



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_plans"
    ADD CONSTRAINT "business_plans_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."chat_blocks"
    ADD CONSTRAINT "chat_blocks_pkey" PRIMARY KEY ("blocker_id", "blocked_id");



ALTER TABLE ONLY "public"."chat_filter_words"
    ADD CONSTRAINT "chat_filter_words_pkey" PRIMARY KEY ("word");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_reads"
    ADD CONSTRAINT "chat_reads_pkey" PRIMARY KEY ("user_id", "channel");



ALTER TABLE ONLY "public"."chat_reports"
    ADD CONSTRAINT "chat_reports_message_id_reporter_id_key" UNIQUE ("message_id", "reporter_id");



ALTER TABLE ONLY "public"."chat_reports"
    ADD CONSTRAINT "chat_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_rules"
    ADD CONSTRAINT "chat_rules_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."client_intake_candidates"
    ADD CONSTRAINT "client_intake_candidates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_intake_candidates"
    ADD CONSTRAINT "client_intake_candidates_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."coaching_notes"
    ADD CONSTRAINT "coaching_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commission_agent_links"
    ADD CONSTRAINT "commission_agent_links_pkey" PRIMARY KEY ("agent_code");



ALTER TABLE ONLY "public"."commission_disbursements"
    ADD CONSTRAINT "commission_disbursements_pkey" PRIMARY KEY ("record_id");



ALTER TABLE ONLY "public"."commission_lines"
    ADD CONSTRAINT "commission_lines_pkey" PRIMARY KEY ("record_id");



ALTER TABLE ONLY "public"."commission_receipts"
    ADD CONSTRAINT "commission_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commission_settings"
    ADD CONSTRAINT "commission_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contracting_cases"
    ADD CONSTRAINT "contracting_cases_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."contracting_files"
    ADD CONSTRAINT "contracting_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contracting_log"
    ADD CONSTRAINT "contracting_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contracting_secrets"
    ADD CONSTRAINT "contracting_secrets_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."contracting_settings"
    ADD CONSTRAINT "contracting_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contracting_staff"
    ADD CONSTRAINT "contracting_staff_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entity_checks"
    ADD CONSTRAINT "entity_checks_pkey" PRIMARY KEY ("entity_id", "item");



ALTER TABLE ONLY "public"."entity_documents"
    ADD CONSTRAINT "entity_documents_file_path_key" UNIQUE ("file_path");



ALTER TABLE ONLY "public"."entity_documents"
    ADD CONSTRAINT "entity_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entity_profiles"
    ADD CONSTRAINT "entity_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."follow_up_notes"
    ADD CONSTRAINT "follow_up_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."google_calendar_connections"
    ADD CONSTRAINT "google_calendar_connections_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."important_links"
    ADD CONSTRAINT "important_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."licensing_progress"
    ADD CONSTRAINT "licensing_progress_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."manager_availability_blocks"
    ADD CONSTRAINT "manager_availability_blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_progress"
    ADD CONSTRAINT "onboarding_progress_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."person_contacts"
    ADD CONSTRAINT "person_contacts_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."person_flags"
    ADD CONSTRAINT "person_flags_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."policy_notes"
    ADD CONSTRAINT "policy_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."presenter_hours"
    ADD CONSTRAINT "presenter_hours_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."presenter_settings"
    ADD CONSTRAINT "presenter_settings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."producer_agreements"
    ADD CONSTRAINT "producer_agreements_docuseal_submission_id_key" UNIQUE ("docuseal_submission_id");



ALTER TABLE ONLY "public"."producer_agreements"
    ADD CONSTRAINT "producer_agreements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_notes"
    ADD CONSTRAINT "profile_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotion_requests"
    ADD CONSTRAINT "promotion_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prospects"
    ADD CONSTRAINT "prospects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recruit_invites"
    ADD CONSTRAINT "recruit_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recruit_invites"
    ADD CONSTRAINT "recruit_invites_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."report_cron"
    ADD CONSTRAINT "report_cron_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_sends"
    ADD CONSTRAINT "report_sends_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_settings"
    ADD CONSTRAINT "report_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."solar_systems"
    ADD CONSTRAINT "solar_systems_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."solar_systems"
    ADD CONSTRAINT "solar_systems_short_name_key" UNIQUE ("short_name");



ALTER TABLE ONLY "public"."team_checklist"
    ADD CONSTRAINT "team_checklist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_checklist"
    ADD CONSTRAINT "team_checklist_user_id_day_item_key_key" UNIQUE ("user_id", "day", "item_key");



ALTER TABLE ONLY "public"."trainings"
    ADD CONSTRAINT "trainings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."win_reactions"
    ADD CONSTRAINT "win_reactions_pkey" PRIMARY KEY ("win_id", "user_id", "emoji");



ALTER TABLE ONLY "public"."wins"
    ADD CONSTRAINT "wins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wins"
    ADD CONSTRAINT "wins_ref_key" UNIQUE ("ref");



ALTER TABLE ONLY "public"."zoom_connections"
    ADD CONSTRAINT "zoom_connections_pkey" PRIMARY KEY ("user_id");



CREATE INDEX "announcement_confirmations_user_idx" ON "public"."announcement_confirmations" USING "btree" ("user_id");



CREATE INDEX "announcements_created_idx" ON "public"."announcements" USING "btree" ("created_at" DESC);



CREATE INDEX "announcements_system_idx" ON "public"."announcements" USING "btree" ("solar_system_id");



CREATE INDEX "appointments_presenter_at_idx" ON "public"."appointments" USING "btree" ("presenter_id", "appointment_at") WHERE ("presenter_id" IS NOT NULL);



CREATE INDEX "appointments_prospect_idx" ON "public"."appointments" USING "btree" ("prospect_id") WHERE ("prospect_id" IS NOT NULL);



CREATE INDEX "appointments_split_user_idx" ON "public"."appointments" USING "btree" ("split_user_id") WHERE ("split_user_id" IS NOT NULL);



CREATE INDEX "appointments_user_at_idx" ON "public"."appointments" USING "btree" ("user_id", "appointment_at") WHERE ("presenter_id" IS NULL);



CREATE INDEX "appointments_user_id_idx" ON "public"."appointments" USING "btree" ("user_id");



CREATE INDEX "appointments_week_of_idx" ON "public"."appointments" USING "btree" ("week_of");



CREATE INDEX "audit_log_created_at_idx" ON "public"."audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "audit_log_target_idx" ON "public"."audit_log" USING "btree" ("target_id", "created_at" DESC);



CREATE INDEX "chat_blocks_blocked_idx" ON "public"."chat_blocks" USING "btree" ("blocked_id");



CREATE INDEX "chat_messages_channel_idx" ON "public"."chat_messages" USING "btree" ("channel", "created_at" DESC);



CREATE INDEX "chat_messages_created_idx" ON "public"."chat_messages" USING "btree" ("created_at");



CREATE INDEX "chat_messages_system_idx" ON "public"."chat_messages" USING "btree" ("solar_system_id", "channel", "created_at" DESC);



CREATE INDEX "chat_messages_user_idx" ON "public"."chat_messages" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "chat_reports_open_idx" ON "public"."chat_reports" USING "btree" ("created_at" DESC) WHERE ("resolved_at" IS NULL);



CREATE INDEX "client_intake_candidates_advisor_emailed_idx" ON "public"."client_intake_candidates" USING "btree" ("advisor_id", "emailed_at");



CREATE INDEX "client_intake_candidates_advisor_id_idx" ON "public"."client_intake_candidates" USING "btree" ("advisor_id");



CREATE INDEX "client_intake_candidates_status_submitted_idx" ON "public"."client_intake_candidates" USING "btree" ("status", "submitted_at" DESC);



CREATE INDEX "coaching_notes_advisor_week_idx" ON "public"."coaching_notes" USING "btree" ("advisor_id", "week_of");



CREATE INDEX "commission_disb_code_idx" ON "public"."commission_disbursements" USING "btree" ("agent_code");



CREATE INDEX "commission_disb_user_idx" ON "public"."commission_disbursements" USING "btree" ("user_id", "disbursed_date" DESC);



CREATE INDEX "commission_lines_code_idx" ON "public"."commission_lines" USING "btree" ("agent_code");



CREATE INDEX "commission_lines_disb_idx" ON "public"."commission_lines" USING "btree" ("disbursement_record_id");



CREATE INDEX "commission_lines_event_idx" ON "public"."commission_lines" USING "btree" ("event_id");



CREATE INDEX "commission_lines_user_idx" ON "public"."commission_lines" USING "btree" ("user_id", "paid_on" DESC);



CREATE INDEX "commission_lines_writer_idx" ON "public"."commission_lines" USING "btree" ("writer_code");



CREATE INDEX "contracting_files_user_idx" ON "public"."contracting_files" USING "btree" ("user_id");



CREATE INDEX "contracting_log_user_idx" ON "public"."contracting_log" USING "btree" ("user_id", "at" DESC);



CREATE INDEX "documents_system_idx" ON "public"."documents" USING "btree" ("solar_system_id");



CREATE INDEX "entity_documents_entity_idx" ON "public"."entity_documents" USING "btree" ("entity_id", "created_at" DESC);



CREATE INDEX "entity_profiles_partner_idx" ON "public"."entity_profiles" USING "btree" ("partner_id") WHERE ("partner_id" IS NOT NULL);



CREATE INDEX "follow_up_notes_appointment_id_idx" ON "public"."follow_up_notes" USING "btree" ("appointment_id");



CREATE INDEX "important_links_system_idx" ON "public"."important_links" USING "btree" ("solar_system_id");



CREATE INDEX "manager_availability_blocks_date_idx" ON "public"."manager_availability_blocks" USING "btree" ("block_date");



CREATE INDEX "manager_availability_blocks_user_idx" ON "public"."manager_availability_blocks" USING "btree" ("user_id");



CREATE INDEX "manager_availability_blocks_user_start_idx" ON "public"."manager_availability_blocks" USING "btree" ("user_id", "start_at");



CREATE INDEX "policy_notes_appointment_id_idx" ON "public"."policy_notes" USING "btree" ("appointment_id");



CREATE INDEX "presenter_hours_user_idx" ON "public"."presenter_hours" USING "btree" ("user_id", "weekday");



CREATE INDEX "producer_agreements_user_idx" ON "public"."producer_agreements" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "profile_notes_entity_idx" ON "public"."profile_notes" USING "btree" ("entity_id", "created_at" DESC) WHERE ("entity_id" IS NOT NULL);



CREATE INDEX "profile_notes_person_idx" ON "public"."profile_notes" USING "btree" ("person_id", "created_at" DESC) WHERE ("person_id" IS NOT NULL);



CREATE INDEX "profiles_manager_id_idx" ON "public"."profiles" USING "btree" ("manager_id");



CREATE INDEX "profiles_solar_system_idx" ON "public"."profiles" USING "btree" ("solar_system_id");



CREATE UNIQUE INDEX "promotion_requests_one_waiting" ON "public"."promotion_requests" USING "btree" ("user_id", "to_tier") WHERE ("status" = 'submitted'::"text");



CREATE INDEX "promotion_requests_submitter_idx" ON "public"."promotion_requests" USING "btree" ("submitted_by", "emailed_at");



CREATE INDEX "promotion_requests_user_idx" ON "public"."promotion_requests" USING "btree" ("user_id", "submitted_at" DESC);



CREATE INDEX "prospects_referred_by_idx" ON "public"."prospects" USING "btree" ("referred_by_id") WHERE ("referred_by_id" IS NOT NULL);



CREATE INDEX "prospects_user_id_idx" ON "public"."prospects" USING "btree" ("user_id");



CREATE INDEX "recruit_invites_appointment_idx" ON "public"."recruit_invites" USING "btree" ("appointment_id");



CREATE INDEX "recruit_invites_created_by_idx" ON "public"."recruit_invites" USING "btree" ("created_by");



CREATE INDEX "recruit_invites_emailed_idx" ON "public"."recruit_invites" USING "btree" ("created_by", "emailed_at");



CREATE UNIQUE INDEX "report_sends_once" ON "public"."report_sends" USING "btree" ("kind", "period_start") WHERE (NOT "test");



CREATE INDEX "report_sends_recent" ON "public"."report_sends" USING "btree" ("created_at" DESC);



CREATE INDEX "team_checklist_user_day_idx" ON "public"."team_checklist" USING "btree" ("user_id", "day");



CREATE INDEX "trainings_date_idx" ON "public"."trainings" USING "btree" ("training_date");



CREATE INDEX "trainings_recurring_group_idx" ON "public"."trainings" USING "btree" ("recurring_group_id");



CREATE INDEX "trainings_system_idx" ON "public"."trainings" USING "btree" ("solar_system_id", "training_date");



CREATE INDEX "win_reactions_created_idx" ON "public"."win_reactions" USING "btree" ("created_at" DESC);



CREATE INDEX "win_reactions_user_idx" ON "public"."win_reactions" USING "btree" ("user_id");



CREATE INDEX "wins_occurred_idx" ON "public"."wins" USING "btree" ("occurred_at" DESC);



CREATE INDEX "wins_system_idx" ON "public"."wins" USING "btree" ("solar_system_id", "occurred_at" DESC);



CREATE INDEX "wins_user_idx" ON "public"."wins" USING "btree" ("user_id", "occurred_at" DESC);



CREATE OR REPLACE TRIGGER "announcement_confirm_stamp" BEFORE INSERT ON "public"."announcement_confirmations" FOR EACH ROW EXECUTE FUNCTION "public"."announcement_confirm_stamp"();



CREATE OR REPLACE TRIGGER "announcements_stamp" BEFORE INSERT OR UPDATE ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."announcements_stamp"();



CREATE OR REPLACE TRIGGER "appointments_keep_prospect_own" BEFORE INSERT OR UPDATE OF "prospect_id", "user_id" ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."appointments_keep_prospect_own"();



CREATE OR REPLACE TRIGGER "appointments_split_rules" BEFORE INSERT OR UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."appointments_split_rules"();



CREATE OR REPLACE TRIGGER "assign_solar_system_trigger" BEFORE INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."assign_solar_system"();



CREATE OR REPLACE TRIGGER "chat_cleanup_after_post" AFTER INSERT ON "public"."chat_messages" FOR EACH STATEMENT EXECUTE FUNCTION "public"."chat_cleanup"();



CREATE OR REPLACE TRIGGER "contracting_log_guard" BEFORE DELETE OR UPDATE ON "public"."contracting_log" FOR EACH ROW EXECUTE FUNCTION "public"."contracting_log_guard"();



CREATE OR REPLACE TRIGGER "entity_checks_stamp" BEFORE INSERT OR UPDATE ON "public"."entity_checks" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_tab_stamp_row"();



CREATE OR REPLACE TRIGGER "entity_documents_stamp" BEFORE INSERT ON "public"."entity_documents" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_tab_stamp_row"();



CREATE OR REPLACE TRIGGER "entity_profiles_stamp" BEFORE INSERT OR UPDATE ON "public"."entity_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."entity_profiles_stamp"();



CREATE OR REPLACE TRIGGER "guard_profile_insert_trigger" BEFORE INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."guard_profile_insert"();



CREATE OR REPLACE TRIGGER "keep_reporting_in_system_trigger" BEFORE INSERT OR UPDATE OF "manager_id", "solar_system_id" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."keep_reporting_in_system"();



CREATE OR REPLACE TRIGGER "move_team_with_leader_trigger" AFTER UPDATE OF "solar_system_id" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."move_team_with_leader"();



CREATE OR REPLACE TRIGGER "person_flags_stamp" BEFORE INSERT OR UPDATE ON "public"."person_flags" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_tab_stamp_row"();



CREATE OR REPLACE TRIGGER "post_appointment_wins_trigger" AFTER INSERT OR DELETE OR UPDATE OF "officially_sold", "officially_recruited", "split_user_id" ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."post_appointment_wins"();



CREATE OR REPLACE TRIGGER "post_exam_win_trigger" AFTER INSERT OR UPDATE OF "exam_passed_on" ON "public"."licensing_progress" FOR EACH ROW EXECUTE FUNCTION "public"."post_exam_win"();



CREATE OR REPLACE TRIGGER "post_more_appointment_wins_trigger" AFTER INSERT OR DELETE OR UPDATE OF "officially_sold", "requirements_completed", "effective_date", "week_of", "presenter_id", "is_follow_up", "user_id" ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."post_more_appointment_wins"();



CREATE OR REPLACE TRIGGER "post_profile_wins_trigger" AFTER INSERT OR UPDATE OF "licensed_at", "hierarchy_tier" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."post_profile_wins"();



CREATE OR REPLACE TRIGGER "post_signup_recruit_win_trigger" AFTER UPDATE OF "used_at" ON "public"."recruit_invites" FOR EACH ROW EXECUTE FUNCTION "public"."post_signup_recruit_win"();



CREATE OR REPLACE TRIGGER "prepare_recruit_invite_trigger" BEFORE INSERT ON "public"."recruit_invites" FOR EACH ROW EXECUTE FUNCTION "public"."prepare_recruit_invite"();



CREATE OR REPLACE TRIGGER "presenter_booking_guard" BEFORE INSERT OR UPDATE OF "presenter_id", "appointment_date", "appointment_time", "appointment_timezone", "duration_minutes" ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."guard_presenter_booking"();



CREATE OR REPLACE TRIGGER "prevent_reporting_loop_trigger" BEFORE INSERT OR UPDATE OF "manager_id" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_reporting_loop"();



CREATE OR REPLACE TRIGGER "producer_agreements_guard" BEFORE DELETE OR UPDATE ON "public"."producer_agreements" FOR EACH ROW EXECUTE FUNCTION "public"."producer_agreements_guard"();



CREATE OR REPLACE TRIGGER "profile_notes_stamp" BEFORE INSERT ON "public"."profile_notes" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_tab_stamp_row"();



CREATE OR REPLACE TRIGGER "prospects_keep_referrer_own" BEFORE INSERT OR UPDATE OF "referred_by_id", "user_id" ON "public"."prospects" FOR EACH ROW EXECUTE FUNCTION "public"."prospects_keep_referrer_own"();



CREATE OR REPLACE TRIGGER "protect_profile_fields_trigger" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_profile_fields"();



CREATE OR REPLACE TRIGGER "set_appointment_at" BEFORE INSERT OR UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."compute_appointment_at"();



CREATE OR REPLACE TRIGGER "set_hierarchy_tier_changed_at" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."track_hierarchy_tier_change"();



CREATE OR REPLACE TRIGGER "set_schedule_block_at" BEFORE INSERT OR UPDATE ON "public"."manager_availability_blocks" FOR EACH ROW EXECUTE FUNCTION "public"."compute_schedule_block_at"();



CREATE OR REPLACE TRIGGER "set_training_at" BEFORE INSERT OR UPDATE ON "public"."trainings" FOR EACH ROW EXECUTE FUNCTION "public"."compute_training_at"();



CREATE OR REPLACE TRIGGER "stamp_coaching_note_author" BEFORE INSERT ON "public"."coaching_notes" FOR EACH ROW EXECUTE FUNCTION "public"."stamp_note_author_name"();



CREATE OR REPLACE TRIGGER "stamp_licensed_at_trigger" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."stamp_licensed_at"();



CREATE OR REPLACE TRIGGER "stamp_policy_note_author" BEFORE INSERT ON "public"."policy_notes" FOR EACH ROW EXECUTE FUNCTION "public"."stamp_note_author_name"();



CREATE OR REPLACE TRIGGER "stamp_solar_system_trigger" BEFORE INSERT OR UPDATE ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."stamp_solar_system"();



CREATE OR REPLACE TRIGGER "stamp_solar_system_trigger" BEFORE INSERT OR UPDATE ON "public"."chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."stamp_solar_system"();



CREATE OR REPLACE TRIGGER "stamp_solar_system_trigger" BEFORE INSERT OR UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."stamp_solar_system"();



CREATE OR REPLACE TRIGGER "stamp_solar_system_trigger" BEFORE INSERT OR UPDATE ON "public"."important_links" FOR EACH ROW EXECUTE FUNCTION "public"."stamp_solar_system"();



CREATE OR REPLACE TRIGGER "stamp_solar_system_trigger" BEFORE INSERT OR UPDATE ON "public"."trainings" FOR EACH ROW EXECUTE FUNCTION "public"."stamp_solar_system"();



CREATE OR REPLACE TRIGGER "stamp_win_system_trigger" BEFORE INSERT ON "public"."wins" FOR EACH ROW EXECUTE FUNCTION "public"."stamp_win_system"();



CREATE OR REPLACE TRIGGER "tidy_names_trigger" BEFORE INSERT OR UPDATE OF "client_name", "presenter", "trainee" ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."tidy_appointment_names"();



CREATE OR REPLACE TRIGGER "tidy_names_trigger" BEFORE INSERT OR UPDATE OF "client_name" ON "public"."client_intake_candidates" FOR EACH ROW EXECUTE FUNCTION "public"."tidy_intake_name"();



CREATE OR REPLACE TRIGGER "tidy_names_trigger" BEFORE INSERT OR UPDATE OF "display_name" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."tidy_profile_name"();



CREATE OR REPLACE TRIGGER "tidy_names_trigger" BEFORE INSERT OR UPDATE OF "first_name", "last_name" ON "public"."prospects" FOR EACH ROW EXECUTE FUNCTION "public"."tidy_prospect_names"();



CREATE OR REPLACE TRIGGER "tidy_names_trigger" BEFORE INSERT OR UPDATE OF "invitee_name" ON "public"."recruit_invites" FOR EACH ROW EXECUTE FUNCTION "public"."tidy_invitee_name"();



CREATE OR REPLACE TRIGGER "touch_licensing_progress_trigger" BEFORE INSERT OR UPDATE ON "public"."licensing_progress" FOR EACH ROW EXECUTE FUNCTION "public"."touch_licensing_progress"();



ALTER TABLE ONLY "public"."announcement_confirmations"
    ADD CONSTRAINT "announcement_confirmations_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcement_confirmations"
    ADD CONSTRAINT "announcement_confirmations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_solar_system_id_fkey" FOREIGN KEY ("solar_system_id") REFERENCES "public"."solar_systems"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_outcome_logged_by_fkey" FOREIGN KEY ("outcome_logged_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_presenter_id_fkey" FOREIGN KEY ("presenter_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_prospect_id_fkey" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_split_user_id_fkey" FOREIGN KEY ("split_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."business_plans"
    ADD CONSTRAINT "business_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_blocks"
    ADD CONSTRAINT "chat_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_blocks"
    ADD CONSTRAINT "chat_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_solar_system_id_fkey" FOREIGN KEY ("solar_system_id") REFERENCES "public"."solar_systems"("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_reads"
    ADD CONSTRAINT "chat_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_reports"
    ADD CONSTRAINT "chat_reports_message_author_fkey" FOREIGN KEY ("message_author") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_reports"
    ADD CONSTRAINT "chat_reports_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_reports"
    ADD CONSTRAINT "chat_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_reports"
    ADD CONSTRAINT "chat_reports_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_rules"
    ADD CONSTRAINT "chat_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_intake_candidates"
    ADD CONSTRAINT "client_intake_candidates_advisor_id_fkey" FOREIGN KEY ("advisor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_intake_candidates"
    ADD CONSTRAINT "client_intake_candidates_source_appointment_id_fkey" FOREIGN KEY ("source_appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coaching_notes"
    ADD CONSTRAINT "coaching_notes_advisor_id_fkey" FOREIGN KEY ("advisor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coaching_notes"
    ADD CONSTRAINT "coaching_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."commission_agent_links"
    ADD CONSTRAINT "commission_agent_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commission_disbursements"
    ADD CONSTRAINT "commission_disbursements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."commission_lines"
    ADD CONSTRAINT "commission_lines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."commission_lines"
    ADD CONSTRAINT "commission_lines_writer_user_id_fkey" FOREIGN KEY ("writer_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contracting_cases"
    ADD CONSTRAINT "contracting_cases_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contracting_cases"
    ADD CONSTRAINT "contracting_cases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contracting_files"
    ADD CONSTRAINT "contracting_files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."contracting_secrets"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contracting_secrets"
    ADD CONSTRAINT "contracting_secrets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contracting_settings"
    ADD CONSTRAINT "contracting_settings_key_set_by_fkey" FOREIGN KEY ("key_set_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contracting_settings"
    ADD CONSTRAINT "contracting_settings_last_review_by_fkey" FOREIGN KEY ("last_review_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contracting_staff"
    ADD CONSTRAINT "contracting_staff_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contracting_staff"
    ADD CONSTRAINT "contracting_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_solar_system_id_fkey" FOREIGN KEY ("solar_system_id") REFERENCES "public"."solar_systems"("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."entity_checks"
    ADD CONSTRAINT "entity_checks_done_by_fkey" FOREIGN KEY ("done_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."entity_checks"
    ADD CONSTRAINT "entity_checks_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entity_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entity_documents"
    ADD CONSTRAINT "entity_documents_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entity_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entity_documents"
    ADD CONSTRAINT "entity_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."entity_profiles"
    ADD CONSTRAINT "entity_profiles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."entity_profiles"
    ADD CONSTRAINT "entity_profiles_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."follow_up_notes"
    ADD CONSTRAINT "follow_up_notes_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follow_up_notes"
    ADD CONSTRAINT "follow_up_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."google_calendar_connections"
    ADD CONSTRAINT "google_calendar_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."important_links"
    ADD CONSTRAINT "important_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."important_links"
    ADD CONSTRAINT "important_links_solar_system_id_fkey" FOREIGN KEY ("solar_system_id") REFERENCES "public"."solar_systems"("id");



ALTER TABLE ONLY "public"."licensing_progress"
    ADD CONSTRAINT "licensing_progress_contracting_sent_by_fkey" FOREIGN KEY ("contracting_sent_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."licensing_progress"
    ADD CONSTRAINT "licensing_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."manager_availability_blocks"
    ADD CONSTRAINT "manager_availability_blocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_progress"
    ADD CONSTRAINT "onboarding_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."person_contacts"
    ADD CONSTRAINT "person_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."person_flags"
    ADD CONSTRAINT "person_flags_flagged_by_fkey" FOREIGN KEY ("flagged_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."person_flags"
    ADD CONSTRAINT "person_flags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."policy_notes"
    ADD CONSTRAINT "policy_notes_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."policy_notes"
    ADD CONSTRAINT "policy_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."presenter_hours"
    ADD CONSTRAINT "presenter_hours_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."presenter_settings"
    ADD CONSTRAINT "presenter_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."producer_agreements"
    ADD CONSTRAINT "producer_agreements_countersigned_by_fkey" FOREIGN KEY ("countersigned_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."producer_agreements"
    ADD CONSTRAINT "producer_agreements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profile_notes"
    ADD CONSTRAINT "profile_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profile_notes"
    ADD CONSTRAINT "profile_notes_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entity_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_notes"
    ADD CONSTRAINT "profile_notes_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_solar_system_id_fkey" FOREIGN KEY ("solar_system_id") REFERENCES "public"."solar_systems"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_viewing_system_id_fkey" FOREIGN KEY ("viewing_system_id") REFERENCES "public"."solar_systems"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."promotion_requests"
    ADD CONSTRAINT "promotion_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."promotion_requests"
    ADD CONSTRAINT "promotion_requests_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."promotion_requests"
    ADD CONSTRAINT "promotion_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prospects"
    ADD CONSTRAINT "prospects_referred_by_id_fkey" FOREIGN KEY ("referred_by_id") REFERENCES "public"."prospects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."prospects"
    ADD CONSTRAINT "prospects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recruit_invites"
    ADD CONSTRAINT "recruit_invites_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recruit_invites"
    ADD CONSTRAINT "recruit_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recruit_invites"
    ADD CONSTRAINT "recruit_invites_solar_system_id_fkey" FOREIGN KEY ("solar_system_id") REFERENCES "public"."solar_systems"("id");



ALTER TABLE ONLY "public"."recruit_invites"
    ADD CONSTRAINT "recruit_invites_upline_id_fkey" FOREIGN KEY ("upline_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recruit_invites"
    ADD CONSTRAINT "recruit_invites_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."report_sends"
    ADD CONSTRAINT "report_sends_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."report_settings"
    ADD CONSTRAINT "report_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."team_checklist"
    ADD CONSTRAINT "team_checklist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trainings"
    ADD CONSTRAINT "trainings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trainings"
    ADD CONSTRAINT "trainings_solar_system_id_fkey" FOREIGN KEY ("solar_system_id") REFERENCES "public"."solar_systems"("id");



ALTER TABLE ONLY "public"."win_reactions"
    ADD CONSTRAINT "win_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."win_reactions"
    ADD CONSTRAINT "win_reactions_win_id_fkey" FOREIGN KEY ("win_id") REFERENCES "public"."wins"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wins"
    ADD CONSTRAINT "wins_solar_system_id_fkey" FOREIGN KEY ("solar_system_id") REFERENCES "public"."solar_systems"("id");



ALTER TABLE ONLY "public"."wins"
    ADD CONSTRAINT "wins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zoom_connections"
    ADD CONSTRAINT "zoom_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "add own licensing progress" ON "public"."licensing_progress" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "add own onboarding" ON "public"."onboarding_progress" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "add to own checklist" ON "public"."team_checklist" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "add your own high-five" ON "public"."win_reactions" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "admins see all licensing progress" ON "public"."licensing_progress" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text")))));



CREATE POLICY "admins: update trainings" ON "public"."trainings" FOR UPDATE USING ("public"."pl_is_system_admin"()) WITH CHECK ("public"."pl_is_system_admin"());



CREATE POLICY "advisors can view their own coaching notes" ON "public"."coaching_notes" FOR SELECT USING (("auth"."uid"() = "advisor_id"));



CREATE POLICY "advisors manage their own appointments" ON "public"."appointments" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "advisors manage their own client intake candidates" ON "public"."client_intake_candidates" USING (("auth"."uid"() = "advisor_id")) WITH CHECK (("auth"."uid"() = "advisor_id"));



CREATE POLICY "announcement confirmations: confirm your own" ON "public"."announcement_confirmations" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."announcements" "a"
  WHERE ("a"."id" = "announcement_confirmations"."announcement_id")))));



CREATE POLICY "announcement confirmations: yours, your team's, or super admins" ON "public"."announcement_confirmations" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("user_id" IN ( SELECT "public"."my_downline_ids"() AS "my_downline_ids")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text"))))));



ALTER TABLE "public"."announcement_confirmations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "announcements: read the ones for you" ON "public"."announcements" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text")))) OR (("starts_at" <= "now"()) AND (("audience" = 'everyone'::"text") OR "public"."is_team_leader"("auth"."uid"())))));



CREATE POLICY "announcements: super admins delete" ON "public"."announcements" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text")))));



CREATE POLICY "announcements: super admins edit" ON "public"."announcements" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text")))));



CREATE POLICY "announcements: super admins post" ON "public"."announcements" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text")))));



CREATE POLICY "appointment owners add follow up notes" ON "public"."follow_up_notes" FOR INSERT WITH CHECK ((("author_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."appointments" "ap"
  WHERE (("ap"."id" = "follow_up_notes"."appointment_id") AND ("ap"."user_id" = "auth"."uid"()))))));



CREATE POLICY "appointment owners delete follow up notes" ON "public"."follow_up_notes" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."appointments" "ap"
  WHERE (("ap"."id" = "follow_up_notes"."appointment_id") AND ("ap"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated users can insert their own audit entries" ON "public"."audit_log" FOR INSERT WITH CHECK (("actor_id" = "auth"."uid"()));



CREATE POLICY "authenticated users can view documents metadata" ON "public"."documents" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated users can view important links" ON "public"."important_links" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "block someone" ON "public"."chat_blocks" FOR INSERT TO "authenticated" WITH CHECK (("blocker_id" = "auth"."uid"()));



ALTER TABLE "public"."business_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_blocks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_filter_words" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_intake_candidates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coaching_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commission_agent_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commission_disbursements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commission_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commission_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commission_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "commissions: super admins" ON "public"."commission_agent_links" FOR SELECT TO "authenticated" USING ("public"."pl_is_galaxy_admin"());



CREATE POLICY "commissions: super admins" ON "public"."commission_receipts" FOR SELECT TO "authenticated" USING ("public"."pl_is_galaxy_admin"());



CREATE POLICY "commissions: who can see" ON "public"."commission_disbursements" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("user_id" IN ( SELECT "public"."my_downline_ids"() AS "my_downline_ids")) OR "public"."pl_is_galaxy_admin"() OR (("user_id" IS NOT NULL) AND "public"."pl_admin_of"("user_id"))));



CREATE POLICY "commissions: who can see" ON "public"."commission_lines" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("user_id" IN ( SELECT "public"."my_downline_ids"() AS "my_downline_ids")) OR "public"."pl_is_galaxy_admin"() OR (("user_id" IS NOT NULL) AND "public"."pl_admin_of"("user_id"))));



CREATE POLICY "contacts: who can see" ON "public"."person_contacts" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."pl_admin_of"("user_id") OR ("user_id" IN ( SELECT "public"."my_downline_ids"() AS "my_downline_ids"))));



CREATE POLICY "contracting cases: yours, or the contracting team" ON "public"."contracting_cases" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("public"."pl_is_contracting_staff"() AND "public"."pl_aal2"())));



CREATE POLICY "contracting log: the contracting team" ON "public"."contracting_log" FOR SELECT TO "authenticated" USING (("public"."pl_is_contracting_staff"() AND "public"."pl_aal2"()));



CREATE POLICY "contracting settings: signed-in people read" ON "public"."contracting_settings" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."contracting_cases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contracting_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contracting_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contracting_secrets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contracting_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contracting_staff" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "create own invites" ON "public"."recruit_invites" FOR INSERT WITH CHECK ((("created_by" = "auth"."uid"()) AND ("used_at" IS NULL) AND ("used_by" IS NULL) AND (("upline_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'super_admin'::"text")))))));



CREATE POLICY "delete from own checklist" ON "public"."team_checklist" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "delete own invites" ON "public"."recruit_invites" FOR DELETE USING ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'super_admin'::"text"))))));



ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."entity_checks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "entity_checks: super admins" ON "public"."entity_checks" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text")))));



ALTER TABLE "public"."entity_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "entity_documents: super admins" ON "public"."entity_documents" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text")))));



ALTER TABLE "public"."entity_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "entity_profiles: super admins" ON "public"."entity_profiles" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text")))));



CREATE POLICY "everyone can view trainings" ON "public"."trainings" FOR SELECT USING (true);



CREATE POLICY "everyone sees chat, minus people you blocked" ON "public"."chat_messages" FOR SELECT TO "authenticated" USING ((NOT (EXISTS ( SELECT 1
   FROM "public"."chat_blocks" "b"
  WHERE (("b"."blocker_id" = "auth"."uid"()) AND ("b"."blocked_id" = "chat_messages"."user_id"))))));



CREATE POLICY "everyone sees high-fives" ON "public"."win_reactions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "everyone sees wins" ON "public"."wins" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "follow up notes visible wherever the appointment is" ON "public"."follow_up_notes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."appointments" "ap"
  WHERE ("ap"."id" = "follow_up_notes"."appointment_id"))));



ALTER TABLE "public"."follow_up_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."google_calendar_connections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."important_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leaders add downline coaching notes" ON "public"."coaching_notes" FOR INSERT WITH CHECK ((("author_id" = "auth"."uid"()) AND ("advisor_id" IN ( SELECT "public"."my_downline_ids"() AS "my_downline_ids"))));



CREATE POLICY "leaders add downline policy notes" ON "public"."policy_notes" FOR INSERT WITH CHECK ((("author_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."appointments" "ap"
  WHERE (("ap"."id" = "policy_notes"."appointment_id") AND ("ap"."user_id" IN ( SELECT "public"."my_downline_ids"() AS "my_downline_ids")))))));



CREATE POLICY "leaders see downline licensing progress" ON "public"."licensing_progress" FOR SELECT USING (("user_id" IN ( SELECT "public"."my_downline_ids"() AS "my_downline_ids")));



CREATE POLICY "leaders see downline onboarding" ON "public"."onboarding_progress" FOR SELECT USING (("user_id" IN ( SELECT "public"."my_downline_ids"() AS "my_downline_ids")));



CREATE POLICY "leaders view downline coaching notes" ON "public"."coaching_notes" FOR SELECT USING (("advisor_id" IN ( SELECT "public"."my_downline_ids"() AS "my_downline_ids")));



CREATE POLICY "leaders view downline policy notes" ON "public"."policy_notes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."appointments" "ap"
  WHERE (("ap"."id" = "policy_notes"."appointment_id") AND ("ap"."user_id" IN ( SELECT "public"."my_downline_ids"() AS "my_downline_ids"))))));



CREATE POLICY "leaders view their downline's prospects" ON "public"."prospects" FOR SELECT USING (("user_id" IN ( SELECT "public"."my_downline_ids"() AS "my_downline_ids")));



ALTER TABLE "public"."licensing_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."manager_availability_blocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "managers and admins can insert coaching notes for their team" ON "public"."coaching_notes" FOR INSERT WITH CHECK ((("author_id" = "auth"."uid"()) AND ((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text")))) OR (EXISTS ( SELECT 1
   FROM ("public"."profiles" "me"
     JOIN "public"."profiles" "adv" ON (("adv"."id" = "coaching_notes"."advisor_id")))
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'manager'::"text") AND ("adv"."manager_id" = "me"."id")))))));



CREATE POLICY "managers and admins can view team coaching notes" ON "public"."coaching_notes" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text")))) OR (EXISTS ( SELECT 1
   FROM ("public"."profiles" "me"
     JOIN "public"."profiles" "adv" ON (("adv"."id" = "coaching_notes"."advisor_id")))
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'manager'::"text") AND ("adv"."manager_id" = "me"."id"))))));



CREATE POLICY "managers and admins can view their team's prospects" ON "public"."prospects" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text")))) OR (EXISTS ( SELECT 1
   FROM ("public"."profiles" "me"
     JOIN "public"."profiles" "adv" ON (("adv"."id" = "prospects"."user_id")))
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'manager'::"text") AND ("adv"."manager_id" = "me"."id"))))));



CREATE POLICY "managers create their own schedule blocks" ON "public"."manager_availability_blocks" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['manager'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "managers see team onboarding" ON "public"."onboarding_progress" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text")))) OR (EXISTS ( SELECT 1
   FROM ("public"."profiles" "me"
     JOIN "public"."profiles" "adv" ON (("adv"."id" = "onboarding_progress"."user_id")))
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'manager'::"text") AND ("adv"."manager_id" = "me"."id"))))));



CREATE POLICY "managers see their advisors, admins see all" ON "public"."appointments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND (("me"."role" = 'super_admin'::"text") OR (("me"."role" = 'manager'::"text") AND (EXISTS ( SELECT 1
           FROM "public"."profiles" "adv"
          WHERE (("adv"."id" = "appointments"."user_id") AND ("adv"."manager_id" = "me"."id"))))))))));



ALTER TABLE "public"."onboarding_progress" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "only super admins make leader links" ON "public"."recruit_invites" AS RESTRICTIVE FOR INSERT WITH CHECK (((("solar_system_id" IS NULL) AND ("invite_role" IS NULL)) OR "public"."pl_is_galaxy_admin"()));



CREATE POLICY "owners and admins delete schedule blocks" ON "public"."manager_availability_blocks" FOR DELETE USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'super_admin'::"text"))))));



CREATE POLICY "people can see appointments where they're the presenter" ON "public"."appointments" FOR SELECT USING (("presenter_id" = "auth"."uid"()));



CREATE POLICY "people can see appointments where they're the trainee" ON "public"."appointments" FOR SELECT TO "authenticated" USING (("trainee_id" = "auth"."uid"()));



CREATE POLICY "people can see their full downline's appointments" ON "public"."appointments" FOR SELECT USING (("user_id" IN ( SELECT "public"."my_downline_ids"() AS "my_downline_ids")));



CREATE POLICY "people can see their full downline's client intake candidates" ON "public"."client_intake_candidates" FOR SELECT USING (("advisor_id" IN ( SELECT "public"."my_downline_ids"() AS "my_downline_ids")));



CREATE POLICY "people manage only their own business plan" ON "public"."business_plans" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "people manage their own prospects" ON "public"."prospects" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."person_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."person_flags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "person_flags: super admins" ON "public"."person_flags" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text")))));



CREATE POLICY "policy notes insertable by appointment owner, their manager, or" ON "public"."policy_notes" FOR INSERT WITH CHECK ((("author_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."appointments" "ap"
  WHERE (("ap"."id" = "policy_notes"."appointment_id") AND (("ap"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."profiles" "me"
          WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text")))) OR (EXISTS ( SELECT 1
           FROM ("public"."profiles" "me"
             JOIN "public"."profiles" "adv" ON (("adv"."id" = "ap"."user_id")))
          WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'manager'::"text") AND ("adv"."manager_id" = "me"."id"))))))))));



CREATE POLICY "policy notes visible to appointment owner, their manager, or ad" ON "public"."policy_notes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."appointments" "ap"
  WHERE (("ap"."id" = "policy_notes"."appointment_id") AND (("ap"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."profiles" "me"
          WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text")))) OR (EXISTS ( SELECT 1
           FROM ("public"."profiles" "me"
             JOIN "public"."profiles" "adv" ON (("adv"."id" = "ap"."user_id")))
          WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'manager'::"text") AND ("adv"."manager_id" = "me"."id")))))))));



ALTER TABLE "public"."policy_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."presenter_hours" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."presenter_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "presenting hours: yours or your admin's" ON "public"."presenter_hours" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."pl_admin_of"("user_id")));



CREATE POLICY "presenting hours: yours or your admin's" ON "public"."presenter_settings" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."pl_admin_of"("user_id")));



CREATE POLICY "producer agreements: yours, or super admins" ON "public"."producer_agreements" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."pl_admin_of"("user_id")));



ALTER TABLE "public"."producer_agreements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profile_notes: super admins" ON "public"."profile_notes" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text")))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles are viewable by any authenticated user" ON "public"."profiles" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."promotion_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prospects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recruit_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_cron" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_sends" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reporters and super admins see reports" ON "public"."chat_reports" FOR SELECT TO "authenticated" USING ((("reporter_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text"))))));



CREATE POLICY "schedule blocks: yours, your team's, or super admins" ON "public"."manager_availability_blocks" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("user_id" IN ( SELECT "public"."my_downline_ids"() AS "my_downline_ids")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text"))))));



CREATE POLICY "see own checklist" ON "public"."team_checklist" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "see own invites" ON "public"."recruit_invites" FOR SELECT USING ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'super_admin'::"text"))))));



CREATE POLICY "see own licensing progress" ON "public"."licensing_progress" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "see own onboarding" ON "public"."onboarding_progress" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "see promotion submissions" ON "public"."promotion_requests" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "submitted_by") OR ("user_id" IN ( SELECT "public"."my_downline_ids"() AS "my_downline_ids")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text"))))));



CREATE POLICY "see your own agreement" ON "public"."chat_rules" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "see your own blocks" ON "public"."chat_blocks" FOR SELECT TO "authenticated" USING (("blocker_id" = "auth"."uid"()));



CREATE POLICY "see your own read markers" ON "public"."chat_reads" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "solar system wall" ON "public"."announcement_confirmations" AS RESTRICTIVE USING ("public"."pl_sees_person"("user_id")) WITH CHECK ("public"."pl_sees_person"("user_id"));



CREATE POLICY "solar system wall" ON "public"."announcements" AS RESTRICTIVE USING ("public"."pl_sees_system"("solar_system_id")) WITH CHECK ("public"."pl_sees_system"("solar_system_id"));



CREATE POLICY "solar system wall" ON "public"."appointments" AS RESTRICTIVE USING ((("user_id" = "auth"."uid"()) OR ("presenter_id" = "auth"."uid"()) OR ("trainee_id" = "auth"."uid"()) OR "public"."pl_sees_person"("user_id"))) WITH CHECK ((("user_id" = "auth"."uid"()) OR ("presenter_id" = "auth"."uid"()) OR ("trainee_id" = "auth"."uid"()) OR "public"."pl_sees_person"("user_id")));



CREATE POLICY "solar system wall" ON "public"."audit_log" AS RESTRICTIVE USING (("public"."pl_sees_person"("actor_id") OR (("actor_id" IS NULL) AND "public"."pl_is_galaxy_admin"()))) WITH CHECK (("public"."pl_sees_person"("actor_id") OR (("actor_id" IS NULL) AND "public"."pl_is_galaxy_admin"())));



CREATE POLICY "solar system wall" ON "public"."business_plans" AS RESTRICTIVE USING ("public"."pl_sees_person"("user_id")) WITH CHECK ("public"."pl_sees_person"("user_id"));



CREATE POLICY "solar system wall" ON "public"."chat_blocks" AS RESTRICTIVE USING ("public"."pl_sees_person"("blocker_id")) WITH CHECK ("public"."pl_sees_person"("blocker_id"));



CREATE POLICY "solar system wall" ON "public"."chat_messages" AS RESTRICTIVE USING (("solar_system_id" = "public"."pl_writer_system"())) WITH CHECK (("solar_system_id" = "public"."pl_writer_system"()));



CREATE POLICY "solar system wall" ON "public"."chat_reads" AS RESTRICTIVE USING ("public"."pl_sees_person"("user_id")) WITH CHECK ("public"."pl_sees_person"("user_id"));



CREATE POLICY "solar system wall" ON "public"."chat_reports" AS RESTRICTIVE USING ((EXISTS ( SELECT 1
   FROM "public"."chat_messages" "m"
  WHERE ("m"."id" = "chat_reports"."message_id")))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."chat_messages" "m"
  WHERE ("m"."id" = "chat_reports"."message_id"))));



CREATE POLICY "solar system wall" ON "public"."chat_rules" AS RESTRICTIVE USING ("public"."pl_sees_person"("user_id")) WITH CHECK ("public"."pl_sees_person"("user_id"));



CREATE POLICY "solar system wall" ON "public"."client_intake_candidates" AS RESTRICTIVE USING ("public"."pl_sees_person"("advisor_id")) WITH CHECK ("public"."pl_sees_person"("advisor_id"));



CREATE POLICY "solar system wall" ON "public"."coaching_notes" AS RESTRICTIVE USING ("public"."pl_sees_person"("advisor_id")) WITH CHECK ("public"."pl_sees_person"("advisor_id"));



CREATE POLICY "solar system wall" ON "public"."documents" AS RESTRICTIVE USING ("public"."pl_sees_system"("solar_system_id")) WITH CHECK ("public"."pl_sees_system"("solar_system_id"));



CREATE POLICY "solar system wall" ON "public"."follow_up_notes" AS RESTRICTIVE USING ((EXISTS ( SELECT 1
   FROM "public"."appointments" "ap"
  WHERE ("ap"."id" = "follow_up_notes"."appointment_id")))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."appointments" "ap"
  WHERE ("ap"."id" = "follow_up_notes"."appointment_id"))));



CREATE POLICY "solar system wall" ON "public"."important_links" AS RESTRICTIVE USING ("public"."pl_sees_system"("solar_system_id")) WITH CHECK ("public"."pl_sees_system"("solar_system_id"));



CREATE POLICY "solar system wall" ON "public"."licensing_progress" AS RESTRICTIVE USING ("public"."pl_sees_person"("user_id")) WITH CHECK ("public"."pl_sees_person"("user_id"));



CREATE POLICY "solar system wall" ON "public"."manager_availability_blocks" AS RESTRICTIVE USING ("public"."pl_sees_person"("user_id")) WITH CHECK ("public"."pl_sees_person"("user_id"));



CREATE POLICY "solar system wall" ON "public"."onboarding_progress" AS RESTRICTIVE USING ("public"."pl_sees_person"("user_id")) WITH CHECK ("public"."pl_sees_person"("user_id"));



CREATE POLICY "solar system wall" ON "public"."person_contacts" AS RESTRICTIVE USING ("public"."pl_sees_person"("user_id")) WITH CHECK ("public"."pl_sees_person"("user_id"));



CREATE POLICY "solar system wall" ON "public"."policy_notes" AS RESTRICTIVE USING ((EXISTS ( SELECT 1
   FROM "public"."appointments" "ap"
  WHERE ("ap"."id" = "policy_notes"."appointment_id")))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."appointments" "ap"
  WHERE ("ap"."id" = "policy_notes"."appointment_id"))));



CREATE POLICY "solar system wall" ON "public"."presenter_hours" AS RESTRICTIVE USING ("public"."pl_sees_person"("user_id")) WITH CHECK ("public"."pl_sees_person"("user_id"));



CREATE POLICY "solar system wall" ON "public"."presenter_settings" AS RESTRICTIVE USING ("public"."pl_sees_person"("user_id")) WITH CHECK ("public"."pl_sees_person"("user_id"));



CREATE POLICY "solar system wall" ON "public"."profiles" AS RESTRICTIVE USING ((("id" = "auth"."uid"()) OR "public"."pl_sees_system"("solar_system_id"))) WITH CHECK ((("id" = "auth"."uid"()) OR "public"."pl_sees_system"("solar_system_id") OR "public"."pl_is_galaxy_admin"()));



CREATE POLICY "solar system wall" ON "public"."promotion_requests" AS RESTRICTIVE USING ("public"."pl_sees_person"("user_id")) WITH CHECK ("public"."pl_sees_person"("user_id"));



CREATE POLICY "solar system wall" ON "public"."prospects" AS RESTRICTIVE USING ("public"."pl_sees_person"("user_id")) WITH CHECK ("public"."pl_sees_person"("user_id"));



CREATE POLICY "solar system wall" ON "public"."recruit_invites" AS RESTRICTIVE USING ((("created_by" = "auth"."uid"()) OR "public"."pl_sees_person"("upline_id"))) WITH CHECK ((("created_by" = "auth"."uid"()) OR "public"."pl_sees_person"("upline_id")));



CREATE POLICY "solar system wall" ON "public"."team_checklist" AS RESTRICTIVE USING ("public"."pl_sees_person"("user_id")) WITH CHECK ("public"."pl_sees_person"("user_id"));



CREATE POLICY "solar system wall" ON "public"."trainings" AS RESTRICTIVE USING ("public"."pl_sees_system"("solar_system_id")) WITH CHECK ("public"."pl_sees_system"("solar_system_id"));



CREATE POLICY "solar system wall" ON "public"."win_reactions" AS RESTRICTIVE USING ((EXISTS ( SELECT 1
   FROM "public"."wins" "w"
  WHERE ("w"."id" = "win_reactions"."win_id")))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."wins" "w"
  WHERE ("w"."id" = "win_reactions"."win_id"))));



CREATE POLICY "solar system wall" ON "public"."wins" AS RESTRICTIVE USING ("public"."pl_sees_system"("solar_system_id")) WITH CHECK ("public"."pl_sees_system"("solar_system_id"));



CREATE POLICY "solar systems: super admins edit" ON "public"."solar_systems" TO "authenticated" USING ("public"."pl_is_galaxy_admin"()) WITH CHECK ("public"."pl_is_galaxy_admin"());



CREATE POLICY "solar systems: your own, or all for super admins" ON "public"."solar_systems" FOR SELECT TO "authenticated" USING (("public"."pl_is_galaxy_admin"() OR ("id" = "public"."pl_home_system"())));



ALTER TABLE "public"."solar_systems" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "super admins can delete documents metadata" ON "public"."documents" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'super_admin'::"text")))));



CREATE POLICY "super admins can delete important links" ON "public"."important_links" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'super_admin'::"text")))));



CREATE POLICY "super admins can delete trainings" ON "public"."trainings" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text")))));



CREATE POLICY "super admins can insert documents metadata" ON "public"."documents" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'super_admin'::"text")))));



CREATE POLICY "super admins can insert important links" ON "public"."important_links" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'super_admin'::"text")))));



CREATE POLICY "super admins can insert trainings" ON "public"."trainings" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text")))));



CREATE POLICY "super admins can update any profile" ON "public"."profiles" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'super_admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'super_admin'::"text")))));



CREATE POLICY "super admins can update documents metadata" ON "public"."documents" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'super_admin'::"text")))));



CREATE POLICY "super admins can update important links" ON "public"."important_links" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'super_admin'::"text")))));



CREATE POLICY "super admins can view the audit log" ON "public"."audit_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text")))));



CREATE POLICY "super admins read report sends" ON "public"."report_sends" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text")))));



CREATE POLICY "super admins read report settings" ON "public"."report_settings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text")))));



CREATE POLICY "super admins remove wins" ON "public"."wins" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text")))));



CREATE POLICY "super admins see all client intake forms" ON "public"."client_intake_candidates" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "me"
  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = 'super_admin'::"text")))));



CREATE POLICY "super managers: delete" ON "public"."announcements" FOR DELETE USING ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: delete" ON "public"."documents" FOR DELETE USING ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: delete" ON "public"."important_links" FOR DELETE USING ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: delete" ON "public"."manager_availability_blocks" FOR DELETE USING ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: delete" ON "public"."profiles" FOR DELETE USING (("public"."pl_is_super_manager"() AND ("id" <> "auth"."uid"()) AND ("role" = ANY (ARRAY['advisor'::"text", 'manager'::"text"]))));



CREATE POLICY "super managers: delete" ON "public"."recruit_invites" FOR DELETE USING ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: delete" ON "public"."trainings" FOR DELETE USING ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: delete" ON "public"."wins" FOR DELETE USING ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: insert" ON "public"."announcements" FOR INSERT WITH CHECK ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: insert" ON "public"."coaching_notes" FOR INSERT WITH CHECK ((("author_id" = "auth"."uid"()) AND "public"."pl_is_super_manager"()));



CREATE POLICY "super managers: insert" ON "public"."documents" FOR INSERT WITH CHECK ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: insert" ON "public"."important_links" FOR INSERT WITH CHECK ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: insert" ON "public"."manager_availability_blocks" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND "public"."pl_is_super_manager"()));



CREATE POLICY "super managers: insert" ON "public"."policy_notes" FOR INSERT WITH CHECK ((("author_id" = "auth"."uid"()) AND "public"."pl_is_super_manager"()));



CREATE POLICY "super managers: insert" ON "public"."recruit_invites" FOR INSERT WITH CHECK ((("created_by" = "auth"."uid"()) AND ("used_at" IS NULL) AND ("used_by" IS NULL) AND "public"."pl_is_super_manager"()));



CREATE POLICY "super managers: insert" ON "public"."trainings" FOR INSERT WITH CHECK ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: select" ON "public"."announcement_confirmations" FOR SELECT USING ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: select" ON "public"."announcements" FOR SELECT USING ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: select" ON "public"."appointments" FOR SELECT USING ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: select" ON "public"."audit_log" FOR SELECT USING ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: select" ON "public"."chat_reports" FOR SELECT USING ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: select" ON "public"."client_intake_candidates" FOR SELECT USING ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: select" ON "public"."coaching_notes" FOR SELECT USING ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: select" ON "public"."licensing_progress" FOR SELECT USING ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: select" ON "public"."manager_availability_blocks" FOR SELECT USING ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: select" ON "public"."onboarding_progress" FOR SELECT USING ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: select" ON "public"."policy_notes" FOR SELECT USING ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: select" ON "public"."promotion_requests" FOR SELECT USING ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: select" ON "public"."prospects" FOR SELECT USING ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: select" ON "public"."recruit_invites" FOR SELECT USING ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: update" ON "public"."announcements" FOR UPDATE USING ("public"."pl_is_super_manager"()) WITH CHECK ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: update" ON "public"."documents" FOR UPDATE USING ("public"."pl_is_super_manager"()) WITH CHECK ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: update" ON "public"."important_links" FOR UPDATE USING ("public"."pl_is_super_manager"()) WITH CHECK ("public"."pl_is_super_manager"());



CREATE POLICY "super managers: update" ON "public"."profiles" FOR UPDATE USING ("public"."pl_is_super_manager"()) WITH CHECK ("public"."pl_is_super_manager"());



CREATE POLICY "take back your own high-five" ON "public"."win_reactions" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."team_checklist" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trainings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "unblock someone" ON "public"."chat_blocks" FOR DELETE TO "authenticated" USING (("blocker_id" = "auth"."uid"()));



CREATE POLICY "update own checklist" ON "public"."team_checklist" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "update own licensing progress" ON "public"."licensing_progress" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "update own onboarding" ON "public"."onboarding_progress" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users can delete their own google connection" ON "public"."google_calendar_connections" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users can delete their own zoom connection" ON "public"."zoom_connections" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users can insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "users can view their own google connection" ON "public"."google_calendar_connections" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users can view their own zoom connection" ON "public"."zoom_connections" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."win_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."zoom_connections" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."chat_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."win_reactions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."wins";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































REVOKE ALL ON FUNCTION "public"."accept_chat_rules"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_chat_rules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_chat_rules"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_licensing"("p_user" "uuid", "p_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_licensing"("p_user" "uuid", "p_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_licensing"("p_user" "uuid", "p_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."announcement_confirm_stamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."announcement_confirm_stamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."announcement_confirm_stamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."announcements_stamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."announcements_stamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."announcements_stamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."appointments_keep_prospect_own"() TO "anon";
GRANT ALL ON FUNCTION "public"."appointments_keep_prospect_own"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."appointments_keep_prospect_own"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."appointments_split_rules"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."appointments_split_rules"() TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."promotion_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."promotion_requests" TO "service_role";



REVOKE ALL ON FUNCTION "public"."approve_promotion"("p_request" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_promotion"("p_request" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_promotion"("p_request" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_solar_system"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_solar_system"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_solar_system"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."chat_cleanup"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."chat_cleanup"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."chat_mask"("p_text" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."chat_mask"("p_text" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."chat_unread_counts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."chat_unread_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."chat_unread_counts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_appointment_conflict"("p_presenter_id" "uuid", "p_date" "date", "p_time" time without time zone, "p_timezone" "text", "p_exclude_appointment_id" "uuid", "p_duration" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_appointment_conflict"("p_presenter_id" "uuid", "p_date" "date", "p_time" time without time zone, "p_timezone" "text", "p_exclude_appointment_id" "uuid", "p_duration" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_appointment_conflict"("p_presenter_id" "uuid", "p_date" "date", "p_time" time without time zone, "p_timezone" "text", "p_exclude_appointment_id" "uuid", "p_duration" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."compute_appointment_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."compute_appointment_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_appointment_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."compute_schedule_block_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."compute_schedule_block_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_schedule_block_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."compute_training_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."compute_training_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_training_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."contracting_admin_log"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."contracting_admin_log"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."contracting_admin_log"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."contracting_case"("p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."contracting_case"("p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contracting_case"("p_user" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."contracting_counts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."contracting_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."contracting_counts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."contracting_discard_draft"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."contracting_discard_draft"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."contracting_discard_draft"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."contracting_kill_switch"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."contracting_kill_switch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."contracting_kill_switch"() TO "service_role";



GRANT ALL ON FUNCTION "public"."contracting_log_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."contracting_log_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."contracting_log_guard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."contracting_mark_entered"("p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."contracting_mark_entered"("p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contracting_mark_entered"("p_user" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."contracting_mark_reviewed"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."contracting_mark_reviewed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."contracting_mark_reviewed"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."contracting_mark_step"("p_user" "uuid", "p_step" "text", "p_on" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."contracting_mark_step"("p_user" "uuid", "p_step" "text", "p_on" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."contracting_mark_step"("p_user" "uuid", "p_step" "text", "p_on" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."contracting_purge_expired"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."contracting_purge_expired"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."contracting_put_file"("p_kind" "text", "p_mime" "text", "p_size" integer, "p_name" "jsonb", "p_iv" "text", "p_ct" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."contracting_put_file"("p_kind" "text", "p_mime" "text", "p_size" integer, "p_name" "jsonb", "p_iv" "text", "p_ct" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contracting_put_file"("p_kind" "text", "p_mime" "text", "p_size" integer, "p_name" "jsonb", "p_iv" "text", "p_ct" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."contracting_queue"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."contracting_queue"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."contracting_queue"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."contracting_set_agreement"("p_version" "text", "p_template_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."contracting_set_agreement"("p_version" "text", "p_template_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."contracting_set_agreement"("p_version" "text", "p_template_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."contracting_set_enabled"("p_enabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."contracting_set_enabled"("p_enabled" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."contracting_set_enabled"("p_enabled" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."contracting_set_key"("p_public_key" "jsonb", "p_key_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."contracting_set_key"("p_public_key" "jsonb", "p_key_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contracting_set_key"("p_public_key" "jsonb", "p_key_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."contracting_set_paused"("p_paused" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."contracting_set_paused"("p_paused" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."contracting_set_paused"("p_paused" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."contracting_set_staff"("p_user" "uuid", "p_on" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."contracting_set_staff"("p_user" "uuid", "p_on" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."contracting_set_staff"("p_user" "uuid", "p_on" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."contracting_staff_list"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."contracting_staff_list"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."contracting_staff_list"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."contracting_start"("p_key_id" "text", "p_wrapped_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."contracting_start"("p_key_id" "text", "p_wrapped_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contracting_start"("p_key_id" "text", "p_wrapped_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."contracting_submit"("p_fields" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."contracting_submit"("p_fields" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contracting_submit"("p_fields" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."contracting_withdraw"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."contracting_withdraw"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."contracting_withdraw"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_chat_message"("p_message" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_chat_message"("p_message" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_chat_message"("p_message" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_document"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_document"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_document"("p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."entity_profiles_stamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."entity_profiles_stamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."entity_profiles_stamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_client_intake_by_token"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_client_intake_by_token"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_client_intake_by_token"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_signup_invite"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_signup_invite"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_signup_invite"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_signup_invite"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_presenter_booking"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_presenter_booking"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_presenter_booking"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_profile_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_profile_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_profile_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_team_leader"("p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_team_leader"("p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_team_leader"("p_user" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."keep_reporting_in_system"() TO "anon";
GRANT ALL ON FUNCTION "public"."keep_reporting_in_system"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."keep_reporting_in_system"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."leader_update_appointment"("p_appointment" "uuid", "p_fields" "jsonb", "p_reschedule" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."leader_update_appointment"("p_appointment" "uuid", "p_fields" "jsonb", "p_reschedule" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."leader_update_appointment"("p_appointment" "uuid", "p_fields" "jsonb", "p_reschedule" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_presented_appointment"("p_appointment" "uuid", "p_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_presented_appointment"("p_appointment" "uuid", "p_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_presented_appointment"("p_appointment" "uuid", "p_data" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_chat_read"("p_channel" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_chat_read"("p_channel" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_chat_read"("p_channel" "text") TO "service_role";



GRANT ALL ON TABLE "public"."licensing_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."licensing_progress" TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_contracting_step"("p_user" "uuid", "p_step" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_contracting_step"("p_user" "uuid", "p_step" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_contracting_step"("p_user" "uuid", "p_step" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."move_team_with_leader"() TO "anon";
GRANT ALL ON FUNCTION "public"."move_team_with_leader"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."move_team_with_leader"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."move_to_solar_system"("p_person" "uuid", "p_system" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."move_to_solar_system"("p_person" "uuid", "p_system" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."move_to_solar_system"("p_person" "uuid", "p_system" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_downline_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_downline_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_downline_ids"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_upline_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_upline_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_upline_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."pgrst_set_no_store"() TO "anon";
GRANT ALL ON FUNCTION "public"."pgrst_set_no_store"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgrst_set_no_store"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_aal2"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_aal2"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_aal2"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_activity_report"("p_from" "date", "p_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_activity_report"("p_from" "date", "p_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_activity_report"("p_from" "date", "p_to" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_admin_of"("p" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_admin_of"("p" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pl_admin_of"("p" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_admin_of"("p" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_admin_save_person"("p_user" "uuid", "p_changes" "jsonb", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_admin_save_person"("p_user" "uuid", "p_changes" "jsonb", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_admin_save_person"("p_user" "uuid", "p_changes" "jsonb", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_big_system"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_big_system"() TO "anon";
GRANT ALL ON FUNCTION "public"."pl_big_system"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_big_system"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_can_decide_promotion"("p_request" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_can_decide_promotion"("p_request" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_can_decide_promotion"("p_request" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."pl_central_today"() TO "anon";
GRANT ALL ON FUNCTION "public"."pl_central_today"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_central_today"() TO "service_role";



GRANT ALL ON FUNCTION "public"."pl_clean_phone"("p" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pl_clean_phone"("p" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_clean_phone"("p" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_commission_ingest"("p_key" "text", "p_body" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_commission_ingest"("p_key" "text", "p_body" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_commission_link_code"("p_code" "text", "p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_commission_link_code"("p_code" "text", "p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_commission_link_code"("p_code" "text", "p_user" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_commission_new_key"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_commission_new_key"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_commission_new_key"() TO "service_role";



GRANT ALL ON FUNCTION "public"."pl_commission_num"("p" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pl_commission_num"("p" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_commission_num"("p" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_commission_rematch"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_commission_rematch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_commission_rematch"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_commission_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_commission_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_commission_status"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_commission_totals"("p_from" "date", "p_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_commission_totals"("p_from" "date", "p_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_commission_totals"("p_from" "date", "p_to" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_commission_unmatched"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_commission_unmatched"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_commission_unmatched"() TO "service_role";



GRANT ALL ON FUNCTION "public"."pl_commission_user"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pl_commission_user"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_commission_user"("p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_contracting_check"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_contracting_check"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_contracting_check"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_contracting_delete"("p_user" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_contracting_delete"("p_user" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pl_contracting_field_ok"("p_key" "text", "p_val" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."pl_contracting_field_ok"("p_key" "text", "p_val" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_contracting_field_ok"("p_key" "text", "p_val" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_contracting_log"("p_user" "uuid", "p_action" "text", "p_detail" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_contracting_log"("p_user" "uuid", "p_action" "text", "p_detail" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_contracting_team_check"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_contracting_team_check"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_contracting_team_check"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_edit_training_series"("p_group" "uuid", "p_from" "date", "p_shift_days" integer, "p_title" "text", "p_time" time without time zone, "p_duration" integer, "p_timezone" "text", "p_zoom_url" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_edit_training_series"("p_group" "uuid", "p_from" "date", "p_shift_days" integer, "p_title" "text", "p_time" time without time zone, "p_duration" integer, "p_timezone" "text", "p_zoom_url" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_edit_training_series"("p_group" "uuid", "p_from" "date", "p_shift_days" integer, "p_title" "text", "p_time" time without time zone, "p_duration" integer, "p_timezone" "text", "p_zoom_url" "text", "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_home_short"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_home_short"() TO "anon";
GRANT ALL ON FUNCTION "public"."pl_home_short"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_home_short"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_home_system"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_home_system"() TO "anon";
GRANT ALL ON FUNCTION "public"."pl_home_system"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_home_system"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_is_contracting_staff"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_is_contracting_staff"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_is_contracting_staff"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_is_galaxy_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_is_galaxy_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."pl_is_galaxy_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_is_galaxy_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_is_super_manager"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_is_super_manager"() TO "anon";
GRANT ALL ON FUNCTION "public"."pl_is_super_manager"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_is_super_manager"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_is_system_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_is_system_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."pl_is_system_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_is_system_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_presenter_busy"("p_presenter" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_exclude" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_presenter_busy"("p_presenter" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_exclude" "uuid") TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."report_settings" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."report_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."report_settings" TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_report_save_settings"("p_recipients" "text"[], "p_daily" boolean, "p_weekly" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_report_save_settings"("p_recipients" "text"[], "p_daily" boolean, "p_weekly" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_report_save_settings"("p_recipients" "text"[], "p_daily" boolean, "p_weekly" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_scope_header"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_scope_header"() TO "anon";
GRANT ALL ON FUNCTION "public"."pl_scope_header"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_scope_header"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_sees_person"("p" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_sees_person"("p" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pl_sees_person"("p" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_sees_person"("p" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_sees_system"("s" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_sees_system"("s" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pl_sees_system"("s" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_sees_system"("s" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_system_of"("p" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_system_of"("p" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pl_system_of"("p" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_system_of"("p" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."pl_tidy_name"("p" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pl_tidy_name"("p" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_tidy_name"("p" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pl_today"() TO "anon";
GRANT ALL ON FUNCTION "public"."pl_today"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_today"() TO "service_role";



GRANT ALL ON FUNCTION "public"."pl_week_start"("d" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."pl_week_start"("d" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_week_start"("d" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_weekly_counts"("p_week_start" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_weekly_counts"("p_week_start" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_weekly_top3_in"("p_week_start" "date", "p_system" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_weekly_top3_in"("p_week_start" "date", "p_system" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pl_writer_system"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pl_writer_system"() TO "anon";
GRANT ALL ON FUNCTION "public"."pl_writer_system"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pl_writer_system"() TO "service_role";



GRANT ALL ON FUNCTION "public"."post_appointment_wins"() TO "anon";
GRANT ALL ON FUNCTION "public"."post_appointment_wins"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."post_appointment_wins"() TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";
GRANT SELECT ON TABLE "public"."chat_messages" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."post_chat_message"("p_channel" "text", "p_body" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."post_chat_message"("p_channel" "text", "p_body" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."post_chat_message"("p_channel" "text", "p_body" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."post_due_wins"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."post_due_wins"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."post_due_wins"() TO "service_role";



GRANT ALL ON FUNCTION "public"."post_exam_win"() TO "anon";
GRANT ALL ON FUNCTION "public"."post_exam_win"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."post_exam_win"() TO "service_role";



GRANT ALL ON FUNCTION "public"."post_more_appointment_wins"() TO "anon";
GRANT ALL ON FUNCTION "public"."post_more_appointment_wins"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."post_more_appointment_wins"() TO "service_role";



GRANT ALL ON FUNCTION "public"."post_profile_wins"() TO "anon";
GRANT ALL ON FUNCTION "public"."post_profile_wins"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."post_profile_wins"() TO "service_role";



GRANT ALL ON FUNCTION "public"."post_signup_recruit_win"() TO "anon";
GRANT ALL ON FUNCTION "public"."post_signup_recruit_win"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."post_signup_recruit_win"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prepare_recruit_invite"() TO "anon";
GRANT ALL ON FUNCTION "public"."prepare_recruit_invite"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prepare_recruit_invite"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."presenter_open_slots"("p_presenter" "uuid", "p_from" "date", "p_days" integer, "p_exclude" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."presenter_open_slots"("p_presenter" "uuid", "p_from" "date", "p_days" integer, "p_exclude" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."presenter_open_slots"("p_presenter" "uuid", "p_from" "date", "p_days" integer, "p_exclude" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_reporting_loop"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_reporting_loop"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_reporting_loop"() TO "service_role";



GRANT ALL ON FUNCTION "public"."producer_agreements_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."producer_agreements_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."producer_agreements_guard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."profiles_tab_my_name"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."profiles_tab_my_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."profiles_tab_my_name"() TO "service_role";



GRANT ALL ON FUNCTION "public"."profiles_tab_stamp_row"() TO "anon";
GRANT ALL ON FUNCTION "public"."profiles_tab_stamp_row"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."profiles_tab_stamp_row"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prospects_keep_referrer_own"() TO "anon";
GRANT ALL ON FUNCTION "public"."prospects_keep_referrer_own"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prospects_keep_referrer_own"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_profile_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_profile_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_profile_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."recruit_signups"("p_start" "date", "p_end" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recruit_signups"("p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recruit_signups"("p_start" "date", "p_end" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."recruit_win_detail"("p_appointment" "uuid", "p_upline" "uuid", "p_client" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recruit_win_detail"("p_appointment" "uuid", "p_upline" "uuid", "p_client" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."recruits_from_signups_since"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recruits_from_signups_since"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recruits_from_signups_since"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."recruits_switch_date"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recruits_switch_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recruits_switch_date"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."release_user_storage"("target" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_user_storage"("target" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."report_chat_message"("p_message" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."report_chat_message"("p_message" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_chat_message"("p_message" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_chat_report"("p_report" "uuid", "p_remove" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_chat_report"("p_report" "uuid", "p_remove" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_chat_report"("p_report" "uuid", "p_remove" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_presenting_hours"("p_settings" "jsonb", "p_hours" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_presenting_hours"("p_settings" "jsonb", "p_hours" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_presenting_hours"("p_settings" "jsonb", "p_hours" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."send_back_promotion"("p_request" "uuid", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_back_promotion"("p_request" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_back_promotion"("p_request" "uuid", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_appointment_trainee"("p_appointment" "uuid", "p_trainee" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_appointment_trainee"("p_appointment" "uuid", "p_trainee" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_appointment_trainee"("p_appointment" "uuid", "p_trainee" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_my_avatar"("p_path" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_my_avatar"("p_path" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_my_avatar"("p_path" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_my_phone"("p_phone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_my_phone"("p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_my_phone"("p_phone" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."signup_already_counted"("p_appointment" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."signup_already_counted"("p_appointment" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."signup_already_counted"("p_appointment" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."stamp_licensed_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."stamp_licensed_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."stamp_licensed_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."stamp_note_author_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."stamp_note_author_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."stamp_note_author_name"() TO "service_role";



GRANT ALL ON FUNCTION "public"."stamp_solar_system"() TO "anon";
GRANT ALL ON FUNCTION "public"."stamp_solar_system"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."stamp_solar_system"() TO "service_role";



GRANT ALL ON FUNCTION "public"."stamp_win_system"() TO "anon";
GRANT ALL ON FUNCTION "public"."stamp_win_system"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."stamp_win_system"() TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_client_intake_response"("p_token" "text", "p_responses" "jsonb", "p_final" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."submit_client_intake_response"("p_token" "text", "p_responses" "jsonb", "p_final" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_client_intake_response"("p_token" "text", "p_responses" "jsonb", "p_final" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."team_open_invites"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."team_open_invites"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."team_open_invites"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tidy_appointment_names"() TO "anon";
GRANT ALL ON FUNCTION "public"."tidy_appointment_names"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tidy_appointment_names"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tidy_intake_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."tidy_intake_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tidy_intake_name"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tidy_invitee_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."tidy_invitee_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tidy_invitee_name"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tidy_profile_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."tidy_profile_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tidy_profile_name"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tidy_prospect_names"() TO "anon";
GRANT ALL ON FUNCTION "public"."tidy_prospect_names"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tidy_prospect_names"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tier_rank"("t" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."tier_rank"("t" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tier_rank"("t" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_licensing_progress"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_licensing_progress"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_licensing_progress"() TO "service_role";



GRANT ALL ON FUNCTION "public"."track_hierarchy_tier_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."track_hierarchy_tier_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."track_hierarchy_tier_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_my_profile"("p_display_name" "text", "p_npn" "text", "p_fg_writing_number" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_my_profile"("p_display_name" "text", "p_npn" "text", "p_fg_writing_number" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_my_profile"("p_display_name" "text", "p_npn" "text", "p_fg_writing_number" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."upline_busy_times"("p_start" "date", "p_end" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upline_busy_times"("p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upline_busy_times"("p_start" "date", "p_end" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."weekly_top3"("p_week_start" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."weekly_top3"("p_week_start" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."weekly_top3"("p_week_start" "date") TO "service_role";
























GRANT ALL ON TABLE "public"."announcement_confirmations" TO "anon";
GRANT ALL ON TABLE "public"."announcement_confirmations" TO "authenticated";
GRANT ALL ON TABLE "public"."announcement_confirmations" TO "service_role";



GRANT ALL ON TABLE "public"."announcements" TO "anon";
GRANT ALL ON TABLE "public"."announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements" TO "service_role";



GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."business_plans" TO "anon";
GRANT ALL ON TABLE "public"."business_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."business_plans" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."chat_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_blocks" TO "service_role";



GRANT ALL ON TABLE "public"."chat_filter_words" TO "service_role";



GRANT ALL ON TABLE "public"."chat_reads" TO "service_role";
GRANT SELECT ON TABLE "public"."chat_reads" TO "authenticated";



GRANT ALL ON TABLE "public"."chat_reports" TO "service_role";
GRANT SELECT ON TABLE "public"."chat_reports" TO "authenticated";



GRANT ALL ON TABLE "public"."chat_rules" TO "service_role";
GRANT SELECT ON TABLE "public"."chat_rules" TO "authenticated";



GRANT ALL ON TABLE "public"."client_intake_candidates" TO "anon";
GRANT ALL ON TABLE "public"."client_intake_candidates" TO "authenticated";
GRANT ALL ON TABLE "public"."client_intake_candidates" TO "service_role";



GRANT ALL ON TABLE "public"."coaching_notes" TO "anon";
GRANT ALL ON TABLE "public"."coaching_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."coaching_notes" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."commission_agent_links" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."commission_agent_links" TO "authenticated";
GRANT ALL ON TABLE "public"."commission_agent_links" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."commission_disbursements" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."commission_disbursements" TO "authenticated";
GRANT ALL ON TABLE "public"."commission_disbursements" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."commission_lines" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."commission_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."commission_lines" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."commission_receipts" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."commission_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."commission_receipts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."commission_receipts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."commission_receipts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."commission_receipts_id_seq" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."commission_settings" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."commission_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."commission_settings" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."contracting_cases" TO "authenticated";
GRANT ALL ON TABLE "public"."contracting_cases" TO "service_role";



GRANT ALL ON TABLE "public"."contracting_files" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."contracting_log" TO "authenticated";
GRANT ALL ON TABLE "public"."contracting_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contracting_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contracting_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contracting_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contracting_secrets" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."contracting_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."contracting_settings" TO "service_role";



GRANT ALL ON TABLE "public"."contracting_staff" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."entity_checks" TO "anon";
GRANT ALL ON TABLE "public"."entity_checks" TO "authenticated";
GRANT ALL ON TABLE "public"."entity_checks" TO "service_role";



GRANT ALL ON TABLE "public"."entity_documents" TO "anon";
GRANT ALL ON TABLE "public"."entity_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."entity_documents" TO "service_role";



GRANT ALL ON TABLE "public"."entity_profiles" TO "anon";
GRANT ALL ON TABLE "public"."entity_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."entity_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."follow_up_notes" TO "anon";
GRANT ALL ON TABLE "public"."follow_up_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."follow_up_notes" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."google_calendar_connections" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."google_calendar_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."google_calendar_connections" TO "service_role";



GRANT SELECT("user_id") ON TABLE "public"."google_calendar_connections" TO "authenticated";



GRANT SELECT("google_email") ON TABLE "public"."google_calendar_connections" TO "authenticated";



GRANT SELECT("connected_at") ON TABLE "public"."google_calendar_connections" TO "authenticated";



GRANT ALL ON TABLE "public"."important_links" TO "anon";
GRANT ALL ON TABLE "public"."important_links" TO "authenticated";
GRANT ALL ON TABLE "public"."important_links" TO "service_role";



GRANT ALL ON TABLE "public"."manager_availability_blocks" TO "anon";
GRANT ALL ON TABLE "public"."manager_availability_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."manager_availability_blocks" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."manager_directory" TO "service_role";
GRANT SELECT ON TABLE "public"."manager_directory" TO "authenticated";



GRANT ALL ON TABLE "public"."onboarding_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_progress" TO "service_role";



GRANT ALL ON TABLE "public"."org_directory" TO "service_role";
GRANT SELECT ON TABLE "public"."org_directory" TO "authenticated";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."person_contacts" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."person_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."person_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."person_flags" TO "anon";
GRANT ALL ON TABLE "public"."person_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."person_flags" TO "service_role";



GRANT ALL ON TABLE "public"."policy_notes" TO "anon";
GRANT ALL ON TABLE "public"."policy_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."policy_notes" TO "service_role";



GRANT ALL ON TABLE "public"."presenter_hours" TO "service_role";
GRANT SELECT ON TABLE "public"."presenter_hours" TO "authenticated";



GRANT ALL ON TABLE "public"."presenter_settings" TO "service_role";
GRANT SELECT ON TABLE "public"."presenter_settings" TO "authenticated";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."producer_agreements" TO "authenticated";
GRANT ALL ON TABLE "public"."producer_agreements" TO "service_role";



GRANT ALL ON TABLE "public"."profile_notes" TO "anon";
GRANT ALL ON TABLE "public"."profile_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_notes" TO "service_role";



GRANT ALL ON TABLE "public"."prospects" TO "anon";
GRANT ALL ON TABLE "public"."prospects" TO "authenticated";
GRANT ALL ON TABLE "public"."prospects" TO "service_role";



GRANT ALL ON TABLE "public"."recruit_invites" TO "anon";
GRANT ALL ON TABLE "public"."recruit_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."recruit_invites" TO "service_role";



GRANT ALL ON TABLE "public"."report_cron" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."report_sends" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."report_sends" TO "authenticated";
GRANT ALL ON TABLE "public"."report_sends" TO "service_role";



GRANT ALL ON SEQUENCE "public"."report_sends_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."report_sends_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."report_sends_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."solar_systems" TO "anon";
GRANT ALL ON TABLE "public"."solar_systems" TO "authenticated";
GRANT ALL ON TABLE "public"."solar_systems" TO "service_role";



GRANT ALL ON TABLE "public"."team_checklist" TO "authenticated";
GRANT ALL ON TABLE "public"."team_checklist" TO "service_role";



GRANT ALL ON TABLE "public"."trainings" TO "anon";
GRANT ALL ON TABLE "public"."trainings" TO "authenticated";
GRANT ALL ON TABLE "public"."trainings" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."win_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."win_reactions" TO "service_role";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."wins" TO "authenticated";
GRANT ALL ON TABLE "public"."wins" TO "service_role";



GRANT ALL ON TABLE "public"."zoom_connections" TO "anon";
GRANT ALL ON TABLE "public"."zoom_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."zoom_connections" TO "service_role";



GRANT ALL ON TABLE "public"."zoom_connected_managers" TO "service_role";
GRANT SELECT ON TABLE "public"."zoom_connected_managers" TO "authenticated";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































