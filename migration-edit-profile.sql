-- Edit your own profile: name, NPN (license number) and F&G writing number.
--
-- update_my_profile() changes only those three things, and only on your
-- own row (whoever is signed in). It can't change anyone's role, level or
-- upline. When your name changes, appointments that show you as the
-- presenter or the trainee are updated too, so the old name doesn't hang
-- around on your team's screens.
--
-- Run this in your Supabase SQL Editor (New query -> paste -> Run),
-- BEFORE merging the website change. Safe to run more than once.

create or replace function public.update_my_profile(p_display_name text, p_npn text, p_fg_writing_number text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
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
$$;

revoke all on function public.update_my_profile(text, text, text) from public, anon;
grant execute on function public.update_my_profile(text, text, text) to authenticated;
