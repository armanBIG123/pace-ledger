# PaceLedger

Big Insurance Network's system for appointment pace. Advisors log the appointments they set and see what to do next. Managers coach their teams on pace, promotions, licensing and field training. The office runs contracting, commissions, reports and chat from the same place.

- **Site:** https://big-pace-ledger.com. It runs on Cloudflare, from `wrangler.jsonc`.
- **Phone apps:** Capacitor (`capacitor.config.json`, `npm run cap:sync`).
- **Data, sign-in and server functions:** Supabase.

## Roles

| Role | Sees |
|---|---|
| `advisor` | **My work**: their own clients, appointments, calendar, growth path, resources and chat. |
| `manager` | My work, plus the **Team** side for everyone under them. |
| `super_manager` | Super-admin powers inside their own solar system (an agency inside BIG). The exceptions: no Profiles tab, and they can't make Super Managers or super admins. |
| `super_admin` | Everything, in every solar system. Org Chart and Manage Team have a tab for each system. Only super admins have Profiles (with contracting) and the email reports. |

`src/lib/roles.js` decides who sees what. The database enforces the same rules with row-level security.

## Screens and their addresses

| Side | Screen | Address | Code |
|---|---|---|---|
| My work | Today | `/today` | `screens/Today.jsx`, `screens/today/` |
| | Clients | `/clients`, `/clients/booked`, … | `screens/Clients.jsx`, `Pipeline.jsx`, `Appointments.jsx`, `screens/appointments/` |
| | Calendar | `/calendar` | `screens/Calendar.jsx`, `screens/calendar/` |
| | Growth | `/growth`, `/growth/pay`, … | `screens/Growth.jsx`, `Milestones.jsx`, `Commissions.jsx` |
| | Resources | `/resources` | `screens/Documents.jsx` |
| | Chat | `/chat`, `/chat/urgent`, … | `screens/Chat.jsx` |
| Team | Team Overview | `/team` | `screens/team/TeamOverview.jsx` |
| | Team Prospecting | `/team/prospecting` | `screens/team/TeamProspecting.jsx` |
| | Team Pace | `/team/pace` | `screens/team/TeamPace.jsx`, with Recruits, Licensing, Field training and Promotion |
| | Track Production | `/team/production` | `screens/team/TrackProduction.jsx` |
| | Org Chart | `/team/org` | `screens/team/OrgChart.jsx` |
| | Profiles | `/team/profiles` | `screens/team/Profiles.jsx`, with contracting |
| | Client Forms | `/team/forms` | `screens/team/ClientForms.jsx` |
| | Manage Team | `/team/manage` | `screens/team/ManageTeam.jsx` |

`src/lib/routes.js` maps addresses to screens. If someone opens an address their role can't see, they land on Today. The public client intake form opens at `/?intake=<token>`.

## Code layout (`src/`)

| Folder | What's in it |
|---|---|
| `App.jsx`, `views/` | Sign-in, the session and profile, and the layout for each role (`views/RoleViews.jsx`). |
| `screens/` | One file per screen, with folders for the bigger screens' parts. |
| `components/` | Pieces used on several screens: page layout, the appointment window, pace widgets, reminders, contact buttons and more. |
| `data/` | Reading and saving in Supabase, one file per area. `data/live.js` is the shared data layer, described below. |
| `lib/` | Plain helpers with no screens: dates, formatting, pace targets, routes, roles, credit splits. |
| `styles/app.css` | All styles. The named sizes and colours are at the top: `--text-*`, `--radius-*`, the palette and `--night-*`. |
| `assets/fonts/` | Newsreader and IBM Plex, served with the app. Their licences are alongside. |

**Keeping screens fresh.** `useLive(key, load, { topics })` from `data/live.js` keeps one copy of each query.

- Screens asking for the same key share that copy and its request.
- A copy reloads after a save on one of its topics, for example `changed('appointments')`.
- It also reloads when the app comes back to the front after 30 seconds, and when a screen opens a copy that's over 30 seconds old.
- There are no Refresh buttons.
- The appointment save functions call `changed('appointments')` themselves.

## Database (Supabase)

The tables by area. Each table's access rules are in its migration.

| Area | Tables |
|---|---|
| People | `profiles`, `org_directory` (view), `solar_systems`, `person_contacts`, `person_flags`, `profile_notes`, `audit_log`, `recruit_invites`, `onboarding_progress`, `licensing_progress`, `coaching_notes` |
| Appointments and clients | `appointments`, `prospects`, `follow_up_notes`, `policy_notes`, `client_intake_candidates`, `business_plans` |
| Calendar | `trainings`, `manager_availability_blocks`, `presenter_settings`, `presenter_hours`, `google_calendar_connections`, `zoom_connections`, `zoom_connected_managers` |
| Team | `team_checklist`, `promotion_requests`, `wins`, `win_reactions`, `announcements`, `announcement_confirmations` |
| Chat | `chat_messages`, `chat_reports`, `chat_blocks`, `chat_rules` |
| Contracting | `contracting_cases`, `contracting_files`, `contracting_log`, `contracting_settings`, `contracting_staff`, `contracting_secrets`, `producer_agreements`, `agreements`, `entity_profiles`, `entity_documents`, `entity_checks` |
| Commissions | `commission_receipts`, `commission_lines`, `commission_disbursements` |
| Reports | `report_settings`, `report_sends`, `report_cron` |
| Resources | `documents`, `important_links` |

- **Migrations:** `supabase/migrations/` (once the live database layout is copied in), then the `migration-*.sql` files at the top level.
- **Database functions (`rpc`):** each one is in the migration for its area.

## Server functions (`supabase/functions/`)

| Function | Does |
|---|---|
| `activity-report` | The daily and weekly activity emails, a preview, and a test email. |
| `chat-notify` | Emails for Urgent help posts and reported messages. |
| `commissions-ingest` | The webhook from the commission system (Minkoo). |
| `contracting` | Contracting: DocuSeal agreements, encrypted details, staff emails. |
| `delete-account` | Deletes an account (your own, or by an admin). |
| `google-create-event` | Puts a booked appointment on Google Calendar and sends the invites. |
| `presenter-availability` | A presenter's open times, using their Google Calendar. |
| `send-appointment-invite` | The emailed invite with a calendar file, when Google isn't connected. |
| `send-intake-link` | Emails a client their intake form link. |
| `submit-promotion` | Sends a promotion for approval and emails the office. |

- **Still only in Supabase** until they're copied into the repo: `google-oauth-callback`, `google-calendar-events`, `zoom-oauth-callback`, `zoom-create-meeting` and `send-recruit-invite`.
- **`_shared/`:** what every function uses: reply headers, settings, email through Resend, the sign-in check and HTML escaping. Because of it, functions are deployed by the workflow and can't be pasted into the Supabase editor.
- **Secrets** live in Supabase → Edge Functions → Secrets. Never put them in GitHub.

## Scheduled jobs (pg_cron in Supabase)

| Job | When | Does |
|---|---|---|
| `pl-activity-reports` | :07 every hour | Calls `activity-report`. It sends the daily report at 7 AM Central and the weekly one on Saturdays, once each. |
| `pl-contracting-purge` | every 10 minutes | Removes contracting details past their keep-until time. |

## Working on it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit, server functions, browser flows; SQL too if Postgres is reachable
npm test -- live   # one group or file
```

- **Tests** are in `tests/`. GitHub runs them on every pull request (`.github/workflows/tests.yml`), along with the build check.
- **Merging into `main`** puts it live:
  - Cloudflare rebuilds the site;
  - the deploy workflow runs new SQL and deploys any changed server functions;
  - the phone apps pick it up on their next launch.
