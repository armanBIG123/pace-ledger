-- Recruit posts name the recruit.
--
-- "Chris recruited a new teammate" came from the old way of counting: an
-- appointment marked "Officially recruited? Yes". That post only knew the
-- appointment, not the person. Sign-ups through a recruit link already say
-- "Chris recruited Marcus Reed".
--
-- This:
--   1. Names the old posts: the person who signed up through that
--      appointment's recruit link, or someone on Chris's team with the
--      client's name, or else the client's name from the appointment.
--   2. Stops posting from "Officially recruited" for appointments from the
--      switch on (a screen left open since before the switch could still
--      tick it). Sign-ups post those, with the name.
--   3. When someone signs up from an appointment that was already counted
--      the old way, adds their name to that post instead of leaving it
--      unnamed.
--
-- Needs migration-recruits-from-signups.sql (already run). Run this in the
-- Supabase SQL Editor (New query -> paste -> Run). Safe to run more than
-- once.

-- Who a recruit post from an appointment is about.
create or replace function public.recruit_win_detail(p_appointment uuid, p_upline uuid, p_client text)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
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
revoke all on function public.recruit_win_detail(uuid, uuid, text) from public, anon, authenticated;

-- 1) Name the posts already there.
update public.wins w
   set detail = w.detail || public.recruit_win_detail(a.id, a.user_id, a.client_name)
  from public.appointments a
 where w.kind = 'recruit' and w.ref = 'recruit:' || a.id
   and not (w.detail ? 'recruit_id') and not (w.detail ? 'name');

-- 2) Sales and (before the switch) recruits from appointments.
create or replace function public.post_appointment_wins()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  had_sale boolean;
begin
  if tg_op = 'DELETE' then
    delete from public.wins where ref in ('sale:' || old.id, 'recruit:' || old.id);
    return old;
  end if;

  if coalesce(new.officially_sold, false) and (tg_op = 'INSERT' or not coalesce(old.officially_sold, false)) then
    select exists (select 1 from public.appointments x where x.user_id = new.user_id and x.officially_sold and x.id <> new.id) into had_sale;
    insert into public.wins (user_id, kind, ref)
      values (new.user_id, case when had_sale then 'sale' else 'first_sale' end, 'sale:' || new.id)
      on conflict (ref) do nothing;
  elsif tg_op = 'UPDATE' and coalesce(old.officially_sold, false) and not coalesce(new.officially_sold, false) then
    delete from public.wins where ref = 'sale:' || new.id;
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

-- 3) A sign-up: its own post, or (if its appointment already counted the
--    old way) their name on that post.
create or replace function public.post_signup_recruit_win()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.used_at is not null and old.used_at is null and new.used_by is not null
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

notify pgrst, 'reload schema';
