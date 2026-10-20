-- Profile photos.
--
-- Everyone can add a photo in Your account (tap your name). It shows next to
-- their name in Chat, the Org chart and the top bar.
--
-- 1) profiles.avatar_path: where your current photo is stored.
-- 2) The "avatars" storage bucket: photos only (JPG, PNG or WebP), 2 MB at
--    most (the app saves a small 512 x 512 JPEG, usually under 100 KB).
--    Photos load from an unlisted web address so they show quickly; you can
--    only add or delete files in your own folder (avatars/<your id>/).
-- 3) set_my_avatar(): points your profile at a photo you uploaded (or none),
--    and hands back the old one so the app can delete it.
--
-- Run this in your Supabase SQL Editor (New query -> paste -> Run),
-- BEFORE merging the website change. Safe to run more than once.

-- 1) Where your photo is ------------------------------------------------------
alter table public.profiles add column if not exists avatar_path text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_path_length') then
    alter table public.profiles add constraint profiles_avatar_path_length check (avatar_path is null or char_length(avatar_path) <= 200);
  end if;
end;
$$;

-- 2) The bucket -----------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Only in your own folder. (A new photo always gets a new name, so nothing
-- is ever overwritten.)
drop policy if exists "avatars: add to your own folder" on storage.objects;
create policy "avatars: add to your own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: see your own folder" on storage.objects;
create policy "avatars: see your own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: delete from your own folder" on storage.objects;
create policy "avatars: delete from your own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- 3) Set (or clear) your photo ------------------------------------------------------
create or replace function public.set_my_avatar(p_path text)
returns text
language plpgsql
security definer set search_path = public
as $$
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
$$;

revoke all on function public.set_my_avatar(text) from public, anon;
grant execute on function public.set_my_avatar(text) to authenticated;
