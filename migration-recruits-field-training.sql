-- Recruits and Field training (Team Pace).
--
-- 1) Contracting steps on the licensing tracker: when the manager sent the
--    InsuraCloud invite link, and when the advisor submitted their
--    InsuraCloud profile. The F&G writing number usually follows within
--    2 business days.
-- 2) mark_contracting_step(): lets a leader (anyone above the person) or a
--    super admin tick those two steps for someone on their team. Advisors
--    can also tick their own.
-- 3) team_open_invites(): sign-up links that haven't been used yet, made by
--    you or anyone on your team (super admins: everyone's). It never
--    returns the link itself.
-- 4) set_appointment_trainee(): lets a leader add someone who needs
--    observation sales as the trainee on an upcoming appointment on their
--    team, or take them off it.
--
-- Run this in your Supabase SQL Editor (New query -> paste -> Run),
-- BEFORE merging the website change. Safe to run more than once.

-- 1) Contracting steps ---------------------------------------------------
alter table public.licensing_progress add column if not exists contracting_sent_on date;
alter table public.licensing_progress add column if not exists contracting_sent_by uuid references auth.users(id) on delete set null;
alter table public.licensing_progress add column if not exists profile_submitted_on date;

-- 2) Tick a contracting step ---------------------------------------------
-- p_step: 'sent' | 'unsent' | 'submitted' | 'unsubmitted'
create or replace function public.mark_contracting_step(p_user uuid, p_step text)
returns public.licensing_progress
language plpgsql
security definer set search_path = public
as $$
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
    or exists (select 1 from public.profiles p where p.id = me and p.role = 'super_admin')
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

revoke all on function public.mark_contracting_step(uuid, text) from public, anon;
grant execute on function public.mark_contracting_step(uuid, text) to authenticated;

-- 3) Open sign-up links on your team --------------------------------------
create or replace function public.team_open_invites()
returns table (
  id uuid, invitee_name text, upline_id uuid, created_by uuid,
  created_at timestamptz, expires_at timestamptz, emailed_to text, emailed_at timestamptz
)
language sql
stable
security definer set search_path = public
as $$
  select i.id, i.invitee_name, i.upline_id, i.created_by, i.created_at, i.expires_at, i.emailed_to, i.emailed_at
  from public.recruit_invites i
  where i.used_at is null
    and i.expires_at > now()
    and (
      i.created_by = auth.uid()
      or i.upline_id = auth.uid()
      or i.created_by in (select public.my_downline_ids())
      or i.upline_id in (select public.my_downline_ids())
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
    )
  order by i.created_at desc
  limit 500;
$$;

revoke all on function public.team_open_invites() from public, anon;
grant execute on function public.team_open_invites() to authenticated;

-- 4) Add or remove a trainee on an upcoming appointment -------------------
-- Who can: the person who set it, the presenter, anyone above the person
-- who set it, or a super admin. The trainee must be on the presenter's
-- team (same rule as the appointment form), can't be the presenter, and
-- can't already be on another appointment at that exact time. Only for
-- appointments that haven't started yet.
create or replace function public.set_appointment_trainee(p_appointment uuid, p_trainee uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
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
    or exists (select 1 from public.profiles p where p.id = me and p.role = 'super_admin')
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

revoke all on function public.set_appointment_trainee(uuid, uuid) from public, anon;
grant execute on function public.set_appointment_trainee(uuid, uuid) to authenticated;
