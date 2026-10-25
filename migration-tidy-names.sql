-- Names get their capitals automatically.
--
-- Names typed in lower case, or all in capitals, are fixed as they're
-- saved: "jonas ubaldo" -> "Jonas Ubaldo", "isaias manzano" -> "Isaias
-- Manzano", "MARY-JANE O'NEIL" -> "Mary-Jane O'Neil", "maria de la cruz"
-- -> "Maria de la Cruz", "john smith iii" -> "John Smith III". A word that
-- already has a capital ("McDonald", "DeShawn", "de la Cruz") stays exactly
-- as typed.
--
-- Covers people's names (sign-up and Your account), clients on
-- appointments, presenters and trainees, prospects, sign-up links and
-- client intake.
-- Names already saved are fixed once, below.
--
-- Run this in the Supabase SQL Editor (New query -> paste -> Run). Safe to
-- run more than once. It runs as one piece: if anything stops it, nothing
-- is changed.

begin;

create or replace function public.pl_tidy_name(p text) returns text
language plpgsql immutable set search_path = public
as $$
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
grant execute on function public.pl_tidy_name(text) to anon, authenticated;

-- As names are saved ---------------------------------------------------------
create or replace function public.tidy_profile_name() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.display_name := public.pl_tidy_name(new.display_name);
  elsif new.display_name is distinct from old.display_name then
    new.display_name := public.pl_tidy_name(new.display_name);
  end if;
  return new;
end;
$$;
drop trigger if exists tidy_names_trigger on public.profiles;
create trigger tidy_names_trigger before insert or update of display_name on public.profiles
  for each row execute function public.tidy_profile_name();

create or replace function public.tidy_appointment_names() returns trigger
language plpgsql set search_path = public as $$
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
drop trigger if exists tidy_names_trigger on public.appointments;
create trigger tidy_names_trigger before insert or update of client_name, presenter, trainee on public.appointments
  for each row execute function public.tidy_appointment_names();

create or replace function public.tidy_prospect_names() returns trigger
language plpgsql set search_path = public as $$
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
drop trigger if exists tidy_names_trigger on public.prospects;
create trigger tidy_names_trigger before insert or update of first_name, last_name on public.prospects
  for each row execute function public.tidy_prospect_names();

create or replace function public.tidy_invitee_name() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.invitee_name := public.pl_tidy_name(new.invitee_name);
  elsif new.invitee_name is distinct from old.invitee_name then
    new.invitee_name := public.pl_tidy_name(new.invitee_name);
  end if;
  return new;
end;
$$;
drop trigger if exists tidy_names_trigger on public.recruit_invites;
create trigger tidy_names_trigger before insert or update of invitee_name on public.recruit_invites
  for each row execute function public.tidy_invitee_name();

create or replace function public.tidy_intake_name() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.client_name := public.pl_tidy_name(new.client_name);
  elsif new.client_name is distinct from old.client_name then
    new.client_name := public.pl_tidy_name(new.client_name);
  end if;
  return new;
end;
$$;
drop trigger if exists tidy_names_trigger on public.client_intake_candidates;
create trigger tidy_names_trigger before insert or update of client_name on public.client_intake_candidates
  for each row execute function public.tidy_intake_name();

-- Names already saved: fixed once --------------------------------------------
-- (Only rows whose name changes. The appointment time isn't worked out
-- again while fixing client names.)
select set_config('pl.trusted_profile_edit', 'on', true); -- just for this fix
update public.profiles set display_name = public.pl_tidy_name(display_name)
 where display_name is distinct from public.pl_tidy_name(display_name);

do $$
begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.appointments'::regclass and tgname = 'set_appointment_at') then
    alter table public.appointments disable trigger set_appointment_at;
  end if;
end $$;
update public.appointments
   set client_name = public.pl_tidy_name(client_name), presenter = public.pl_tidy_name(presenter), trainee = public.pl_tidy_name(trainee)
 where client_name is distinct from public.pl_tidy_name(client_name) or presenter is distinct from public.pl_tidy_name(presenter)
    or trainee is distinct from public.pl_tidy_name(trainee);
do $$
begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.appointments'::regclass and tgname = 'set_appointment_at') then
    alter table public.appointments enable trigger set_appointment_at;
  end if;
end $$;

update public.prospects set first_name = public.pl_tidy_name(first_name), last_name = public.pl_tidy_name(last_name)
 where first_name is distinct from public.pl_tidy_name(first_name) or last_name is distinct from public.pl_tidy_name(last_name);
update public.recruit_invites set invitee_name = public.pl_tidy_name(invitee_name)
 where invitee_name is distinct from public.pl_tidy_name(invitee_name);
update public.client_intake_candidates set client_name = public.pl_tidy_name(client_name)
 where client_name is distinct from public.pl_tidy_name(client_name);
-- Recruit posts that name someone who hasn't signed up yet.
update public.wins set detail = jsonb_set(detail, '{name}', to_jsonb(public.pl_tidy_name(detail ->> 'name')))
 where detail ? 'name' and jsonb_typeof(detail -> 'name') = 'string'
   and (detail ->> 'name') is distinct from public.pl_tidy_name(detail ->> 'name');

commit;
