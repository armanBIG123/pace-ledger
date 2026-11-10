// The shared data layer in the app: no Refresh buttons, screens come back
// at once from their last copy, catch up when you return to the app, and
// an Undo-able delete stays gone until it's undone.
// Usage: node tests/flows/live.mjs (after tests/tools/build-app.mjs; npm test runs it all)
import { serve, openApp, closeBrowser, APP } from '../tools/browser.mjs';

const [dist = APP] = process.argv.slice(2);
const { srv, url } = await serve(dist);
let failures = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { failures++; console.log('FAIL', m); } };

const MORGAN = { id: '11111111-1111-1111-1111-111111111111', email: 'morgan@example.com' };
const JORDAN = { id: '22222222-2222-2222-2222-222222222222', email: 'jordan@example.com' };
const DANA = { id: '33333333-3333-3333-3333-333333333333', email: 'dana@example.com' };
// Dates by the local calendar (Central, like the agency), not UTC: in the
// evening UTC is already tomorrow. The appointment is later today, never
// past midnight (that could be next week on a Friday night).
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date(); now.setHours(Math.min(now.getHours() + 1, 23), 0, 0, 0);
const sat = d => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 1) % 7)); return iso(x); };
const appt = (over = {}) => ({ id: 'ap-1', user_id: JORDAN.id, date_set_option: 'monday', category: 'weekday', week_of: sat(new Date()), appointment_date: iso(now),
  appointment_time: `${String(now.getHours()).padStart(2, '0')}:00:00`, appointment_timezone: 'America/Chicago', appointment_at: now.toISOString(), duration_minutes: 60,
  presenter: 'Dana Brooks', presenter_id: DANA.id, client_name: 'Sam Carter', presentation_type: 'sale', officially_sold: false, officially_recruited: false,
  outcome: null, follow_up_completed_at: null, created_at: new Date(Date.now() - 864e5).toISOString(), ...over });
const db = () => ({
  solar_systems: [{ id: 's-big', short_name: 'BIG', name: 'Big Insurance Network' }],
  profiles: [
    { id: MORGAN.id, display_name: 'Morgan Lee', role: 'super_admin', solar_system_id: 's-big', created_at: '2025-06-01T00:00:00Z', hierarchy_tier: 'EVC' },
    { id: DANA.id, display_name: 'Dana Brooks', role: 'manager', solar_system_id: 's-big', manager_id: MORGAN.id, created_at: '2025-08-01T00:00:00Z', hierarchy_tier: 'FD' },
    { id: JORDAN.id, display_name: 'Jordan Ellis', role: 'advisor', solar_system_id: 's-big', manager_id: DANA.id, created_at: '2026-06-20T00:00:00Z', hierarchy_tier: 'FA' },
  ],
  appointments: [appt()],
  org_directory: [{ id: MORGAN.id, display_name: 'Morgan Lee' }, { id: DANA.id, display_name: 'Dana Brooks', manager_id: MORGAN.id }, { id: JORDAN.id, display_name: 'Jordan Ellis', manager_id: DANA.id }],
});
const open = async (who, path, opts = {}) => {
  const page = await openApp(url, { user: who, db: db(), factors: [] }, { path, ...opts });
  await page.waitForFunction(() => document.querySelector('#root h2'), null, { timeout: 15000 });
  await page.waitForTimeout(1200);
  return page;
};
// Real errors (the test database's "not mocked" notices and blocked outside requests aren't).
const realErrors = page => page.errors.filter(e => !/not mocked|Failed to load resource/.test(e));
const refreshButtons = page => page.locator('button[aria-label="Refresh"], button[title="Refresh"]').count();
const jordanTotal = page => page.locator('tr', { hasText: 'Jordan Ellis' }).first().locator('td').filter({ hasText: /\/33$/ }).first().innerText().catch(() => '');
// Another device adds an appointment for Jordan.
const addElsewhere = page => page.evaluate(a => { window.__PL.db.appointments.push(a); }, appt({ id: 'ap-2', client_name: 'Lee Park', date_set_option: 'tuesday' }));
// Leave the app for a while and come back.
const awayAndBack = page => page.evaluate(() => {
  const real = Date.now; Date.now = () => real() + 31000;
  window.dispatchEvent(new Event('focus'));
});

try {
  // Team Pace: no Refresh, and the team's numbers.
  let page = await open(DANA, '/team/pace');
  ok(await refreshButtons(page) === 0, 'Team Pace has no Refresh button');
  ok(await jordanTotal(page) === '1/33', "Team Pace shows Jordan's 1 appointment");

  // Sitting on a screen doesn't keep asking the database.
  const before = await page.evaluate(() => window.__PL.calls.length);
  await page.waitForTimeout(2500);
  ok(await page.evaluate(() => window.__PL.calls.length) === before, 'an idle screen makes no requests');

  // Switching screens and back: the last copy at once, no loading placeholder.
  await addElsewhere(page);
  await page.locator('button:visible', { hasText: 'Track Production' }).first().click();
  await page.waitForTimeout(600);
  ok(await refreshButtons(page) === 0, 'Track Production has no Refresh button');
  await page.locator('button:visible', { hasText: 'Team Pace' }).first().click();
  const skel = await page.locator('.tr-skel, .tr-skeleton, [class*="tr-skel"]').count();
  ok(skel === 0 && await jordanTotal(page) === '1/33', 'coming back to Team Pace shows its last copy at once (no placeholder)');

  // Back to the app after 30+ seconds: it catches up on its own.
  await awayAndBack(page);
  await page.waitForTimeout(900);
  ok(await jordanTotal(page) === '2/33', 'returning to the app after a while picks up the appointment added elsewhere');
  await page.context().close();

  // Every screen that had one: no Refresh button.
  for (const [who, path, name] of [[DANA, '/team', 'Team Overview'], [DANA, '/team/prospecting', 'Team Prospecting'], [DANA, '/team/org', 'Org Chart'],
    [DANA, '/calendar', 'Calendar'], [JORDAN, '/clients/booked', 'Appointments'], [JORDAN, '/growth', 'Growth → My path'], [MORGAN, '/team/forms', 'Client Forms']]) {
    page = await open(who, path);
    ok(await refreshButtons(page) === 0, `${name} has no Refresh button`);
    await page.context().close();
  }
  // Team Pace's other views too.
  page = await open(DANA, '/team/pace');
  for (const v of ['Recruits', 'Licensing', 'Field training', 'Promotion']) {
    await page.locator('.tr-appts-sidebar button', { hasText: v }).click();
    await page.waitForTimeout(700);
    ok(await refreshButtons(page) === 0 && realErrors(page).length === 0, `Team Pace → ${v}: no Refresh button, no errors${realErrors(page).length ? ` (${realErrors(page)[0]})` : ''}`);
  }
  await page.context().close();

  // Calendar: an appointment added elsewhere shows after coming back.
  page = await open(JORDAN, '/calendar');
  await page.getByRole('button', { name: 'List' }).click();
  await page.waitForTimeout(400);
  ok(await page.getByText('Sam Carter').first().isVisible(), 'Calendar lists Sam Carter');
  await addElsewhere(page);
  await awayAndBack(page);
  await page.waitForTimeout(900);
  ok(await page.getByText('Lee Park').first().isVisible(), 'and Lee Park after coming back to the app');
  await page.context().close();

  // Delete with Undo: gone right away, still gone after the screens settle, back on Undo.
  page = await open(JORDAN, '/clients/booked');
  const row = () => page.locator('.tr-appts-main').getByText('Sam Carter');
  ok(await row().count() > 0, 'Appointments lists Sam Carter');
  await row().first().click();
  await page.getByRole('button', { name: 'Delete' }).last().click();
  await page.locator('.tr-modal-card').last().getByRole('button', { name: 'Delete' }).click();
  await page.waitForTimeout(300);
  ok(await row().count() === 0, 'deleting takes it off the list right away');
  const afterDelete = await page.evaluate(() => window.__PL.calls.length);
  await page.waitForTimeout(1500);
  ok(await row().count() === 0, 'and it stays off while Undo is offered (no reload brings it back)');
  ok(await page.evaluate(n => window.__PL.calls.slice(n).filter(c => c.table === 'appointments').length, afterDelete) === 0, 'nothing reloads the appointments while Undo is offered');
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(1200);
  ok(await row().count() > 0, 'Undo puts it back');
  ok(realErrors(page).length === 0, `no page errors${realErrors(page).length ? ` (${realErrors(page).slice(0, 2).join(' | ')})` : ''}`);
  await page.context().close();
} catch (e) { failures++; console.log('FAIL (crash)', e.stack); }
await closeBrowser(); srv.close();
console.log(failures ? `${failures} FAILED` : 'ALL LIVE DATA FLOW CHECKS PASSED');
process.exit(failures ? 1 : 0);
