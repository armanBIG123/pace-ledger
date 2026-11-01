-- Contracting: agents can also upload a voided check or bank letter
-- ("bank_doc"), next to the E&O certificate. Every upload stays optional.
--
-- Run in the Supabase SQL Editor (New query -> paste -> Run) after
-- migration-contracting.sql. Safe to run more than once.

begin;

do $do$
begin
  if to_regclass('public.contracting_files') is null then
    raise exception 'Run migration-contracting.sql first.';
  end if;
end
$do$;

alter table public.contracting_files drop constraint if exists contracting_files_kind_check;
alter table public.contracting_files add constraint contracting_files_kind_check
  check (kind in ('dl_front', 'eo_certificate', 'aml_certificate', 'background_doc', 'bank_doc'));

create or replace function public.contracting_put_file(p_kind text, p_mime text, p_size integer, p_name jsonb, p_iv text, p_ct text)
returns uuid
language plpgsql security definer set search_path = public as $$
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

revoke all on function public.contracting_put_file(text, text, integer, jsonb, text, text) from public, anon;
grant execute on function public.contracting_put_file(text, text, integer, jsonb, text, text) to authenticated;

commit;
