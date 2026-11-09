// A tour of the main screens as an advisor, a manager and a super admin,
// on a desktop and a phone, with realistic data. Checks each screen opens
// without errors, the page title matches its tab, and nothing on a phone
// is wider than the screen. Screenshots: tests/.out/shots/tour/.
// Usage: node tests/flows/tour.mjs (after tests/tools/build-app.mjs; npm test runs it all)
import fs from 'node:fs';
import path from 'node:path';
import { serve, openApp, closeBrowser, OUT, APP } from '../tools/browser.mjs';
const [dist = APP, shotsArg] = process.argv.slice(2);
const SHOTS = shotsArg || path.join(OUT, 'shots/tour');
fs.rmSync(SHOTS, { recursive: true, force: true }); fs.mkdirSync(SHOTS, { recursive: true });
const { srv, url } = await serve(dist);
let failures = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { failures++; console.log('FAIL', m); } };
const MORGAN = { id: '11111111-1111-1111-1111-111111111111', email: 'morgan@example.com' };
const JORDAN = { id: '22222222-2222-2222-2222-222222222222', email: 'jordan@example.com' };
const DANA = { id: '33333333-3333-3333-3333-333333333333', email: 'dana@example.com' };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const at = (days, h = 18) => { const d = new Date(Date.now() + days * 864e5); d.setHours(h, 0, 0, 0); return d; };
const sat = d => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 1) % 7)); return iso(x); };
let n = 0;
const appt = (client, days, over = {}) => {
  const d = at(days);
  return { id: `ap-${++n}`, user_id: JORDAN.id, date_set_option: 'monday', category: 'weekday', week_of: sat(d), appointment_date: iso(d), appointment_time: '18:00:00',
    appointment_timezone: 'America/Chicago', appointment_at: d.toISOString(), duration_minutes: 60, presenter: 'Dana Brooks', presenter_id: DANA.id, client_name: client,
    presentation_type: 'sale', split_user_id: null, split_percent: null, officially_sold: false, officially_recruited: false, outcome: null, status: null, follow_up_completed_at: null,
    is_follow_up: false, prospect_id: null, created_at: at(days - 4).toISOString(), ...over };
};
const done = (o, extra = {}) => ({ outcome: o, follow_up_completed_at: at(-1, 20).toISOString(), status: o === 'went_well' || o === 'not_interested' ? 'completed' : o === 'no_show' ? 'not_completed' : 'needs_reschedule', ...extra });
const P = (id, first, last, over = {}) => ({ id, user_id: JORDAN.id, first_name: first, last_name: last, relationship_strength: 7, notes: null, source: null, phone: null, email: null,
  marked_sold: false, marked_recruited: false, referred_by_id: null, created_at: at(-25).toISOString(), ...over });
const prospects = [
  P('p-priya', 'Priya', 'Shah', { phone: '(512) 555-0100', email: 'priya@example.com', created_at: at(-3).toISOString(), char_married_or_relationship: true, char_has_dependents: true, char_homeowner: true }),
  P('p-aisha', 'Aisha', 'Brown', { phone: '(512) 555-0101' }),
  P('p-maria', 'Maria', 'Lopez', { referred_by_id: 'p-lee', source: 'Referral' }),
  P('p-sam', 'Sam', 'Carter', { phone: '(512) 555-0163', email: 'sam.carter@example.com', age: 44, referred_by_id: 'p-lee', source: 'Referral' }),
  P('p-lee', 'Lee', 'Grant', { created_at: at(-60).toISOString() }),
  P('p-tom', 'Tom', 'Becker'),
  P('p-robert', 'Robert', 'Smith'),
];
const appts = () => { n = 0; return [
  appt('Aisha Brown', -1, { prospect_id: 'p-aisha', client_phone: '(512) 555-0101' }),
  appt('Maria Lopez', -6, { prospect_id: 'p-maria', ...done('went_well', { follow_up_scheduled: true, status: 'needs_follow_up' }) }),
  appt('Maria Lopez', 3, { prospect_id: 'p-maria', is_follow_up: true }),
  appt('Kevin Tran', 2),
  appt('Sam Carter', -9, { prospect_id: 'p-sam', ...done('went_well', { follow_up_scheduled: true, status: 'needs_follow_up' }) }),
  appt('Sam Carter', -2, { prospect_id: 'p-sam', is_follow_up: true, ...done('went_well'), officially_sold: true, target_premium: 2400, split_user_id: DANA.id, split_percent: 50 }),
  appt('Lee Grant', -45, { prospect_id: 'p-lee', ...done('went_well'), officially_sold: true, target_premium: 1800, effective_date: iso(at(-20)), requirements_completed: true }),
  appt('Tom Becker', -10, { prospect_id: 'p-tom', ...done('not_interested') }),
  appt('Rob Smith', -12, done('went_well')),
  appt('Walk In', -3, done('no_show')),
  // Dana presented this one for Jordan; nobody has logged it.
  appt('Grace Kim', -1, {}),
]; };
const base = () => ({
  solar_systems: [{ id: 's-big', short_name: 'BIG', name: 'Big Insurance Network' }],
  profiles: [
    { id: MORGAN.id, display_name: 'Morgan Lee', role: 'super_admin', solar_system_id: 's-big', created_at: '2025-06-01T00:00:00Z', hierarchy_tier: 'EVC', fg_writing_number: 'FG-M1', npn: '9' },
    { id: DANA.id, display_name: 'Dana Brooks', role: 'manager', solar_system_id: 's-big', manager_id: MORGAN.id, fg_writing_number: 'FG-D1', npn: '1', created_at: '2025-08-01T00:00:00Z', hierarchy_tier: 'FD' },
    { id: JORDAN.id, display_name: 'Jordan Ellis', role: 'advisor', solar_system_id: 's-big', manager_id: DANA.id, npn: '19880001', fg_writing_number: 'FG-J1', created_at: '2026-06-20T00:00:00Z', hierarchy_tier: 'FA' },
  ],
  prospects: JSON.parse(JSON.stringify(prospects)),
  appointments: appts(),
  policy_notes: [{ id: 'pn-1', appointment_id: 'ap-6', author_id: DANA.id, author_name: 'Dana Brooks', note: 'APS ordered, about 2 weeks.', created_at: at(-1, 10).toISOString() }],
  follow_up_notes: [{ id: 'fn-1', appointment_id: 'ap-2', author_id: JORDAN.id, author_name: 'Jordan Ellis', note: 'Called, wants the tax piece too', created_at: at(-4, 11).toISOString() }],
  client_intake_candidates: [{ id: 'ci-1', advisor_id: JORDAN.id, source_appointment_id: 'ap-6', client_name: 'Sam Carter', token: 't', status: 'submitted', submitted_at: at(-2, 21).toISOString(), created_at: at(-2, 20).toISOString() }],
  org_directory: [{ id: MORGAN.id, display_name: 'Morgan Lee' }, { id: DANA.id, display_name: 'Dana Brooks', manager_id: MORGAN.id }, { id: JORDAN.id, display_name: 'Jordan Ellis', manager_id: DANA.id }],
});
// Follow-up notes are read through the appointment (an inner join the mock
// can't do), and a presenter's log, like the database's.
const SETUP = `window.__PL_SETUP = function (PL) {
  PL.tableHooks = PL.tableHooks || {};
  PL.tableHooks.follow_up_notes = q => { if (q.op === 'select') q.filters = q.filters.slice(0, 0); return null; };
  PL.rpc.log_presented_appointment = ({ p_appointment, p_data }) => {
    const a = PL.db.appointments.find(x => x.id === p_appointment);
    Object.assign(a, { outcome: p_data.outcome || null, officially_sold: !!p_data.officiallySold, follow_up_completed_at: new Date().toISOString(), outcome_logged_by: PL.user.id, status: 'completed' });
    return { appointment: JSON.parse(JSON.stringify(a)), followUp: null };
  };
};`;

const RILEY = { id: '44444444-4444-4444-4444-444444444444', email: 'riley@example.com' };
const SAM = { id: '55555555-5555-5555-5555-555555555555', email: 'sam@example.com' };
const rich = () => {
  const d = base();
  d.profiles.push(
    { id: RILEY.id, display_name: 'Riley Park', role: 'advisor', solar_system_id: 's-big', manager_id: DANA.id, created_at: '2026-08-20T00:00:00Z', hierarchy_tier: 'SA', npn: '19880002' },
    { id: SAM.id, display_name: 'Sam Ortiz', role: 'advisor', solar_system_id: 's-big', manager_id: JORDAN.id, created_at: '2026-10-25T00:00:00Z', hierarchy_tier: 'UA' });
  d.org_directory.push({ id: RILEY.id, display_name: 'Riley Park', manager_id: DANA.id }, { id: SAM.id, display_name: 'Sam Ortiz', manager_id: JORDAN.id });
  const extra = ['Nina Patel', 'Omar Haddad', 'Lucy Chen', 'Ben Ross', 'Ivy Wells', 'Hank Moore'].map((c, i) => ({ ...appt(c, -i), id: `ap-r${i}`, user_id: RILEY.id, presenter: 'Riley Park', presenter_id: RILEY.id,
    ...(i > 0 && i % 2 ? done('went_well') : {}), ...(i === 3 ? { officially_sold: true, target_premium: 3100 } : {}) }));
  d.appointments.push(...extra, { ...appt('Zoe Hart', 1), id: 'ap-s1', user_id: SAM.id, presenter: 'Jordan Ellis', presenter_id: JORDAN.id });
  d.chat_messages = [
    { id: 'm1', channel: 'general', user_id: DANA.id, body: 'Huge week team, 3 apps on Thursday alone!', created_at: at(-1, 19).toISOString(), deleted_at: null },
    { id: 'm2', channel: 'general', user_id: JORDAN.id, body: 'Thanks Dana. Sam Carter came through, 50/50 split with you.', created_at: at(-1, 19.5).toISOString(), deleted_at: null },
    { id: 'm3', channel: 'general', user_id: RILEY.id, body: 'Who has a good script for the follow-up call?', created_at: at(0, 9).toISOString(), deleted_at: null },
  ];
  d.chat_rules = [{ user_id: JORDAN.id, accepted_at: at(-10).toISOString() }, { user_id: DANA.id, accepted_at: at(-10).toISOString() }, { user_id: MORGAN.id, accepted_at: at(-10).toISOString() }];
  return d;
};
const D = { width: 1280, height: 900 }, PH = { width: 390, height: 844, mobile: true };
async function go(name, who, steps, { size = D, title = null, check = null } = {}) {
  const page = await openApp(url, { user: who, db: rich(), factors: [] }, { ...size, init: [SETUP] });
  try {
    await page.locator('button:visible', { hasText: 'Today' }).first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(1200);
    for (const s of steps) {
      if (typeof s === 'function') await s(page);
      else if (s.tab) await page.getByRole('tab', { name: s.tab }).first().click();
      else await page.locator('button:visible', { hasText: s }).first().click();
      await page.waitForTimeout(700);
    }
    await page.waitForTimeout(600);
    if (title) ok(await page.locator('h2.tr-h2', { hasText: title }).first().isVisible(), `${name}: titled "${title}"`);
    if (size.mobile) {
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(wide <= 1, `${name}: nothing wider than the phone screen (${wide}px over)`);
    }
    if (check) await check(page);
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: size.width, height: Math.min(h, 4200) });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  } catch (e) { ok(false, `${name}: ${e.message.split('\n')[0]}`); }
  const errs = page.errors.filter(x => !/not mocked|ERR_FAILED|ERR_ABORTED/.test(x));
  ok(!errs.length, `${name}: no errors on the page${errs.length ? ': ' + errs[0].slice(0, 160) : ''}`);
  await page.context().close();
}
const T = { tab: /Team/ };
const sameRow = async (page, a, b) => { const [x, y] = [await a.boundingBox(), await b.boundingBox()]; return x && y && Math.abs((x.y + x.height / 2) - (y.y + y.height / 2)) < 8; };
// Desktop
await go('d01-today', JORDAN, [], { check: async p => ok(await p.getByText('Last 6 weeks').isVisible(), 'Today: the six-week pace trend shows beside Team wins') });
await go('d02-clients', JORDAN, ['Clients'], { title: 'Clients', check: async p => {
  const chips = p.locator('.tr-cl-filters > *');
  const ys = new Set(await chips.evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top))));
  ok(ys.size === 1, 'Clients: the filter chips stay on one line');
} });
await go('d03-calendar', JORDAN, ['Calendar'], { title: 'Calendar' });
await go('d04-growth', JORDAN, ['Growth'], { title: 'Growth' });
await go('d05-resources', JORDAN, ['Resources'], { title: 'Resources', check: async p => ok(await p.locator('.tr-flat .tr-appts-sidebar').isVisible(), 'Resources: views are pills under the title, like Growth') });
await go('d06-chat', JORDAN, [p => p.getByRole('button', { name: /^Chat|Messages/ }).first().click()]);
await go('d07-team-overview', DANA, [T], { title: 'Team Overview', check: async p => {
  const g = await p.locator('.tr-tov-galaxy').boundingBox();
  ok(g && g.height < 180, `Team Overview: the galaxy is a short strip (${g && Math.round(g.height)}px tall)`);
} });
await go('d08-team-pace', DANA, [T, 'Team Pace'], { title: 'Team Pace', check: async p => {
  ok(await p.locator('.tr-flat .tr-appts-sidebar button', { hasText: 'Recruits' }).isVisible(), 'Team Pace: views are pills, not a sidebar');
  ok(await p.getByRole('switch', { name: /Hide people with nothing set/ }).count() === 1, 'Team Pace: the hide filter is a switch');
  ok(!(await p.getByText(/Joined \d\d\/\d\d\/\d{4}/).count()), 'Team Pace: dates read "Jun 19", not 06/19/2026');
} });
await go('d09-team-prospecting', DANA, [T, 'Team Prospecting'], { title: 'Team Prospecting' });
await go('d10-track-production', DANA, [T, 'Track Production'], { title: 'Track Production' });
await go('d11-org-chart', DANA, [T, 'Org Chart'], { title: 'Org Chart' });
await go('d12-manage-team', MORGAN, [T, p => p.getByRole('button', { name: /More/ }).first().click(), 'Manage Team'], { title: 'Manage Team' });
await go('d13-profiles', MORGAN, [T, 'Profiles'], { title: 'Profiles' });
// Phone
await go('p01-today', JORDAN, [], { size: PH });
await go('p02-clients', JORDAN, ['Clients'], { size: PH });
await go('p03-calendar', JORDAN, ['Calendar'], { size: PH, check: async p => {
  ok(await sameRow(p, p.locator('h2.tr-h2', { hasText: 'Calendar' }), p.locator('.tr-cal-settings')), 'Calendar on a phone: Settings sits beside the title');
  ok(await sameRow(p, p.locator('.tr-seg').first(), p.locator('.tr-cal-more button')), 'Calendar on a phone: Month/List, the month and ⋯ on one line');
  await p.locator('.tr-cal-more button').click();
  ok(await p.getByRole('menuitem', { name: 'Highlight trainings' }).isVisible(), 'Calendar on a phone: Trainings and This month are in ⋯');
  await p.keyboard.press('Escape');
} });
await go('p04-growth', JORDAN, ['Growth'], { size: PH });
await go('p05-team-overview', DANA, [T], { size: PH, check: async p => {
  const li = p.locator('.tr-check-list li').first();
  ok(await sameRow(p, li.locator('.tr-check-box'), li.locator('.tr-tov-text')), 'Team Overview on a phone: the checkbox and the words share a line');
} });
await go('p06-team-pace', DANA, [T, 'Pace'], { size: PH, check: async p => {
  ok(await sameRow(p, p.getByRole('button', { name: 'Previous week' }), p.getByRole('button', { name: 'Next week' })), 'Team Pace on a phone: the week arrows share a line');
  const row = p.locator('.tr-pace-table tr.tr-clickable-row').first();
  const box = await row.boundingBox();
  ok(box && box.width <= 390, 'Team Pace on a phone: each person is a card that fits the screen');
  ok(await row.locator('td[data-label="Fri"]').isVisible(), 'Team Pace on a phone: Friday is visible (was cut off)');
} });
await go('p07-resources', JORDAN, ['Resources'], { size: PH });
await closeBrowser(); srv.close();
console.log(failures ? `${failures} FAILED` : 'ALL TOUR CHECKS PASSED');
process.exit(failures ? 1 : 0);
