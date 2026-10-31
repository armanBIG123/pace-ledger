-- Optional: old person flags that say "Waiting on InsuraCloud" now say
-- "Waiting on contracting" (the reason the app offers from now on).
--
-- Run in the Supabase SQL Editor (New query -> paste -> Run). Safe to run
-- more than once. The website change works without it.

do $do$
begin
  if to_regclass('public.person_flags') is not null then
    update public.person_flags set reason = 'Waiting on contracting' where reason = 'Waiting on InsuraCloud';
  end if;
end
$do$;
