-- Trainings don't block booking.
--
-- The double-booking check used to count every appointment a person was
-- part of: the ones they're presenting, the ones they booked for someone
-- else to present, and the ones they sit in on as the trainee. So an
-- advisor sitting in on a training at 7 PM couldn't set their own
-- appointment at 7 PM ("You're already booked 7:00 - 8:00 PM").
--
-- Now only the appointments a person is presenting take up their time
-- (and, for old appointments saved with no presenter, the ones they
-- booked, since they presented those themselves). Blocked-out time still
-- counts, the same as before.
--
-- Run this in your Supabase SQL Editor (New query -> paste -> Run).
-- Safe to run more than once. The website doesn't need to change for it.

begin;

create or replace function public.pl_patch_function(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $$
declare
  def text := pg_get_functiondef(p_fn);
begin
  if position(p_old in def) = 0 then
    if position(p_new in def) > 0 then return; end if; -- already done
    raise exception 'PaceLedger: % is different from what this update expects. Nothing was changed. Send this message to Claude. (Looking for: %)', p_fn, left(p_old, 160);
  end if;
  execute replace(def, p_old, p_new);
end;
$$;

select public.pl_patch_function(
  'public.check_appointment_conflict(uuid,date,time without time zone,text,uuid,integer)'::regprocedure,
$x$  where (x.presenter_id = p_presenter_id or x.user_id = p_presenter_id or x.trainee_id = p_presenter_id)$x$,
$x$  -- Only appointments they're presenting: booking one for someone else to
  -- present, or sitting in on one as the trainee (training), doesn't take
  -- up their time. Old rows with no presenter: the person who booked it.
  where (x.presenter_id = p_presenter_id or (x.presenter_id is null and x.user_id = p_presenter_id))$x$);

drop function public.pl_patch_function(regprocedure, text, text);

notify pgrst, 'reload schema';

commit;
