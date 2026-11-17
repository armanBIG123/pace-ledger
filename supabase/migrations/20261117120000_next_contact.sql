-- When to reach out to a client again (Clients → Follow up, Nov 17, 2026).
--
-- Kept on the appointment the next step comes from (the latest one that
-- happened). Logging an outcome with nothing booked sets it, and so does a
-- touch (Called, Left voicemail…) on the client's profile. When it's empty,
-- PaceLedger works the date out from the outcome: a no-show tomorrow, went
-- well with nothing booked in 2 days, not interested in 90 days.
--
-- Safe to run more than once. The existing appointment rules cover it.

alter table public.appointments
  add column if not exists next_contact_on date;
