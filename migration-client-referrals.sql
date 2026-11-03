-- Clients: who referred whom.
--
-- My work -> Clients has a Referrals section on each person's profile:
-- "Add names Sam gave you" puts each name on your list, linked to Sam, and
-- Sam's profile lists the people he sent you and where they are now.
--   * prospects.referred_by_id: the person on your list who gave you this
--     name (empty for everyone else). If that person is deleted, the link
--     just goes away; the name stays on your list.
-- Only your own prospects can be linked: a link to anyone else's is
-- dropped, never an error.
--
-- Run in the Supabase SQL Editor (New query -> paste -> Run) BEFORE merging
-- the website change. Safe to run more than once. (Until it has run, the
-- website still works: a referral's name goes in their notes instead.)

begin;

alter table public.prospects add column if not exists referred_by_id uuid references public.prospects(id) on delete set null;
create index if not exists prospects_referred_by_idx on public.prospects (referred_by_id) where referred_by_id is not null;

create or replace function public.prospects_keep_referrer_own()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.referred_by_id is not null
     and (new.referred_by_id = new.id
          or not exists (select 1 from public.prospects p where p.id = new.referred_by_id and p.user_id = new.user_id)) then
    new.referred_by_id := null;
  end if;
  return new;
end;
$$;
drop trigger if exists prospects_keep_referrer_own on public.prospects;
create trigger prospects_keep_referrer_own
  before insert or update of referred_by_id, user_id on public.prospects
  for each row execute function public.prospects_keep_referrer_own();

commit;

-- Check: should list referred_by_id once.
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'prospects' and column_name = 'referred_by_id';
