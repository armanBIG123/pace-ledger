# PaceLedger tests

`npm test` runs everything; GitHub runs it on every pull request
(`.github/workflows/tests.yml`) and attaches the screenshots.

| Folder | What it checks |
| --- | --- |
| `unit/` | The app's helpers (clients list, commissions maths, Manage Team edits). |
| `edge/` | Each server function in `supabase/functions/`, bundled for Node, against an in-memory database and fake Google, DocuSeal and Resend. `activity-report` also writes sample emails to `.out/report-emails/`. |
| `flows/` | Browser tests: a test build of the real app with an in-memory database (`mock/supabase.js`), clicked through as an advisor, a manager and a super admin. Screenshots go to `.out/shots/`. |
| `sql/` | Each migration run in a fresh Postgres with just enough of Supabase (`sql/stubs/`), then checked signed in as different people. Needs Postgres 16 (`PGHOST`, `PGPORT`, `PGUSER`). |
| `fixtures/` | Made-up sample data (no real agents or clients). |
| `tools/` | The test build, the bundler and the browser helpers. |

Run part of it: `npm test -- flows`, `npm test -- edge`, `npm test -- sql`, or part
of a file name (`npm test -- contracting`).

Adding a test: copy the closest file in the same folder. Each file prints
`ok …` per check and `FAIL …` when one fails, and exits 1 on a failure.
