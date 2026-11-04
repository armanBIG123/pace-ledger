-- Changing a training on the Calendar (time, day, length, title, Zoom link,
-- notes), for when a standing weekly time moves.
--
-- Super admins (and Super Managers, inside their own solar system, the same
-- people who can post and remove trainings) get "Change time or details"
-- on a training. A weekly one can change:
--   * just that date, or
--   * that date and every week after (earlier weeks stay as history),
--     including moving them all to another day of the week.
--
-- Run in the Supabase SQL Editor (New query -> paste -> Run) BEFORE merging
-- the website change. Safe to run more than once. Until it's run, the
-- website says editing needs this update; removing and posting again still
-- works.

begin;

-- 1) Super admins and Super Managers can change trainings. The solar system
--    wall already on trainings keeps Super Managers inside their own, and
--    the solar system a training belongs to never changes on an edit.
drop policy if exists "admins: update trainings" on public.trainings;
create policy "admins: update trainings" on public.trainings for update
  using (public.pl_is_system_admin())
  with check (public.pl_is_system_admin());

-- 2) A weekly training from one date on, in one step: every later week gets
--    the same title, time, length, time zone, Zoom link and notes, and moves
--    by p_shift_days (Tuesday to Wednesday is 1). It runs as the person
--    asking, so the rules above decide what it can change. Returns how many
--    weeks changed.
create or replace function public.pl_edit_training_series(
  p_group uuid, p_from date, p_shift_days integer, p_title text, p_time time,
  p_duration integer, p_timezone text, p_zoom_url text, p_notes text)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
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
revoke all on function public.pl_edit_training_series(uuid, date, integer, text, time, integer, text, text, text) from public, anon;
grant execute on function public.pl_edit_training_series(uuid, date, integer, text, time, integer, text, text, text) to authenticated;

commit;

-- Check: should list the policy and the function once each.
select 'policy' as what, policyname as name from pg_policies where schemaname = 'public' and tablename = 'trainings' and policyname = 'admins: update trainings'
union all
select 'function', proname from pg_proc where proname = 'pl_edit_training_series';
