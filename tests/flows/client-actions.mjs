// Client profiles: book, edit and log appointments, the intake form, the
// recruit sign-up link and quick notes, all from the profile.
// Usage: node tests/flows/clients.mjs (after tests/tools/build-app.mjs; npm test runs it all)
import fs from 'node:fs';
import path from 'node:path';
import { serve, openApp, shot, closeBrowser, HERE, OUT, APP } from '../tools/browser.mjs';

const [dist = APP, shotsArg] = process.argv.slice(2);
const SHOTS = shotsArg || path.join(OUT, 'shots/client-actions');
fs.rmSync(SHOTS, { recursive: true, force: true });
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
  // The database fills in a link's token and expiry.
  PL.tableHooks.recruit_invites = q => { if (q.op === 'insert') q.payload.forEach(r => { r.token = 'tok' + Math.random().toString(36).slice(2, 8); r.expires_at = new Date(Date.now() + 30 * 864e5).toISOString(); }); return null; };
  PL.rpc.log_presented_appointment = ({ p_appointment, p_data }) => {
    const a = PL.db.appointments.find(x => x.id === p_appointment);
    Object.assign(a, { outcome: p_data.outcome || null, officially_sold: !!p_data.officiallySold, follow_up_completed_at: new Date().toISOString(), outcome_logged_by: PL.user.id, status: 'completed' });
    return { appointment: JSON.parse(JSON.stringify(a)), followUp: null };
  };
};`;
const open = async (who, db, opts = {}) => {
  const page = await openApp(url, { user: who, db }, { width: 1280, height: 900, ...opts, init: [SETUP] });
  await page.locator('button:visible', { hasText: 'Today' }).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200);
  return page;
};
const state = page => page.evaluate(() => window.__PL.db);
const modal = page => page.locator('.tr-modal-card').last();
const toClients = async page => { await page.locator('button:visible', { hasText: /^Clients$/ }).first().click(); await page.waitForSelector('.tr-cl-list'); await page.waitForTimeout(400); };
const rowOf = (page, name) => page.locator('.tr-cl-item', { has: page.locator('strong', { hasText: new RegExp(`^${name}$`) }) });
const openProfile = async (page, name) => { await rowOf(page, name).locator('.tr-cl-row').click(); await page.waitForSelector('.tr-cl-profile'); await page.waitForTimeout(300); };
const errs = page => page.errors.filter(e => !/not mocked|ERR_/.test(e));


const card = (page, h) => page.locator('.tr-cl-card', { has: page.locator('.tr-cl-h', { hasText: h }) });
try {
  // ---- Maria: a follow-up coming up, a past one that went well -------------
  let page = await open(JORDAN, base());
  await toClients(page);
  await openProfile(page, 'Maria Lopez');
  const appts = card(page, 'Appointments');
  const rows = appts.locator('.tr-cl-appt');
  ok(await rows.count() === 2, 'Maria: both appointments listed');
  ok(/Coming up/.test(await rows.nth(0).innerText()) && /Follow-up/.test(await rows.nth(0).innerText()), 'the one coming up is first');
  ok(/Went well/.test(await rows.nth(1).innerText()), 'then the past one, with its outcome');
  ok(await rows.nth(0).getByRole('button', { name: /Edit the appointment/ }).count() === 1 && await rows.nth(1).getByRole('button', { name: /Update the outcome/ }).count() === 1, 'Edit on each, Update outcome on the past one');
  await shot(page, `${SHOTS}/01-maria.png`, { fullPage: true });

  // Edit opens the appointment window
  await rows.nth(0).getByRole('button', { name: /Edit the appointment/ }).click();
  await page.waitForTimeout(900);
  const win = page.locator('.tr-modal-card').last();
  ok(await win.count() === 1 && /Maria Lopez/.test(await win.innerText().catch(() => '') + (await win.locator('input').evaluateAll(xs => xs.map(x => x.value).join(' ')).catch(() => ''))), 'Edit opens that appointment');
  await shot(page, `${SHOTS}/02-edit.png`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  if (await page.locator('.tr-modal-card').count()) { const b = page.locator('.tr-modal-card').last().getByRole('button', { name: /Cancel|Close/ }).first(); if (await b.count()) await b.click(); await page.waitForTimeout(300); }

  // Update outcome opens the outcome window
  await rows.nth(1).getByRole('button', { name: /Update the outcome/ }).click();
  await page.waitForTimeout(600);
  ok(await page.locator('.tr-modal-card').count() >= 1 && /went|outcome/i.test(await page.locator('.tr-modal-card').last().innerText()), 'Update outcome opens the outcome window');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  if (await page.locator('.tr-modal-card').count()) { const b = page.locator('.tr-modal-card').last().getByRole('button', { name: /Cancel|Close/ }).first(); if (await b.count()) await b.click(); await page.waitForTimeout(300); }

  // Forms and links
  const links = card(page, 'Forms and links');
  ok(/goes with Maria’s next appointment/.test(await links.innerText()), 'intake: says which appointment it goes with');
  await links.getByRole('button', { name: 'Send intake form' }).click();
  await page.waitForSelector('#tr-intake-title');
  ok(/Maria Lopez's intake form|intake/i.test(await page.locator('#tr-intake-title').innerText()), 'Send intake form opens the send window');
  await page.waitForTimeout(800);
  await shot(page, `${SHOTS}/03-intake-send.png`);
  let db = await state(page);
  ok(db.client_intake_candidates.some(x => x.source_appointment_id === 'ap-3' && x.client_name === 'Maria Lopez'), 'her form is made, on the follow-up coming up');
  await page.locator('.tr-modal-card, .tr-sheet').last().getByRole('button', { name: /Done|Close/ }).first().click();
  await page.waitForTimeout(800);
  ok(/Client intake/.test(await links.innerText()) && await links.locator('.tr-intake-link-box').count() >= 1, 'the profile now shows her intake link');

  await links.getByRole('button', { name: 'Create sign-up link' }).click();
  await page.waitForTimeout(700);
  db = await state(page);
  const inv = (db.recruit_invites || []).find(r => r.invitee_name === 'Maria Lopez');
  ok(inv && inv.upline_id === JORDAN.id && inv.appointment_id === 'ap-3', 'recruit link made, under Jordan, on her latest appointment');
  ok(await links.getByRole('button', { name: /Copy link|Share link/ }).count() === 1 && await links.getByRole('button', { name: 'Email link' }).count() === 1, 'copy, share or email it from the profile');
  await links.scrollIntoViewIfNeeded();
  await shot(page, `${SHOTS}/04-links.png`);

  // Book appointment: the form, filled in for her
  await appts.getByRole('button', { name: 'Book appointment' }).click();
  await page.waitForTimeout(900);
  const vals = await page.locator('input:visible').evaluateAll(xs => xs.map(x => x.value));
  ok(vals.includes('Maria Lopez'), 'Book appointment opens the form with her name');
  ok(errs(page).length === 0, 'no errors ' + errs(page).join(' | '));
  await page.context().close();

  // ---- Sam: intake received ---------------------------------------------------
  page = await open(JORDAN, base());
  await toClients(page);
  await openProfile(page, 'Sam Carter');
  ok(/Intake received/.test(await card(page, 'Appointments').innerText()), 'Sam: the sold appointment shows Intake received');
  ok(/Received/.test(await card(page, 'Forms and links').innerText()) && await card(page, 'Forms and links').getByRole('button', { name: 'View submitted info' }).count() === 1, 'and his answers are a tap away');

  // ---- Aisha: quick note on her last appointment -----------------------------
  await page.getByRole('button', { name: /^Clients$/ }).first().click();
  await page.waitForTimeout(500);
  await openProfile(page, 'Aisha Brown');
  await page.locator('.tr-cl-quicktags').getByRole('button', { name: '+ Left voicemail' }).click();
  await page.waitForTimeout(700);
  db = await state(page);
  ok(db.follow_up_notes.some(x => x.appointment_id === 'ap-1' && x.note === 'Left voicemail'), 'quick note saved on her appointment');
  ok(/Left voicemail/.test(await card(page, 'Everything so far').innerText()), 'and shows in Everything so far');
  await page.context().close();

  // ---- Priya: on the list, nothing booked --------------------------------------
  page = await open(JORDAN, base());
  await toClients(page);
  await openProfile(page, 'Priya Shah');
  ok(/None yet/.test(await card(page, 'Appointments').innerText()), 'Priya: no appointments yet');
  ok(/Book Priya and you can send it from here/.test(await card(page, 'Forms and links').innerText()), 'intake waits for a booking');
  await card(page, 'Forms and links').getByRole('button', { name: 'Create sign-up link' }).click();
  await page.waitForTimeout(700);
  db = await state(page);
  const pinv = (db.recruit_invites || []).find(r => r.invitee_name === 'Priya Shah');
  ok(pinv && pinv.appointment_id === null, 'recruit link made with no appointment');
  ok(/priya@example.com/.test(await card(page, 'Forms and links').locator('input[type=email]').inputValue()), 'the email box has her address');
  await page.locator('.tr-cl-quicktags').getByRole('button', { name: '+ Texted' }).click();
  await page.waitForTimeout(700);
  db = await state(page);
  ok(/Texted/.test((db.prospects.find(x => x.id === 'p-priya') || {}).notes || ''), 'quick note goes on her list notes');
  // Back later: the same link
  await page.getByRole('button', { name: /^Clients$/ }).first().click();
  await page.waitForTimeout(400);
  await openProfile(page, 'Priya Shah');
  await page.waitForTimeout(500);
  ok(await card(page, 'Forms and links').locator('.tr-intake-link-box', { hasText: pinv.token }).count() === 1, 'coming back shows the same link');
  await shot(page, `${SHOTS}/05-priya.png`, { fullPage: true });
  ok(errs(page).length === 0, 'no errors ' + errs(page).join(' | '));
  await page.context().close();

  // ---- Dana presented Grace for Jordan: hers to log, Jordan's to manage -------
  page = await open(DANA, base());
  await toClients(page);
  await page.getByRole('button', { name: /You presented/ }).click();
  await page.waitForTimeout(300);
  await openProfile(page, 'Grace Kim');
  const g = card(page, 'Appointments');
  ok(await g.getByRole('button', { name: 'Log outcome' }).count() === 1, 'the presenter can log the outcome');
  ok(await g.getByRole('button', { name: /Edit the appointment/ }).count() === 0 && await g.getByRole('button', { name: 'Book appointment' }).count() === 0, 'but not edit or book (it is Jordan’s)');
  ok(await card(page, 'Forms and links').count() === 0, 'no intake or recruit links for someone else’s client');
  await page.context().close();

  // ---- phone ---------------------------------------------------------------------
  page = await open(JORDAN, base(), { width: 390, height: 844, mobile: true });
  await toClients(page);
  await openProfile(page, 'Maria Lopez');
  await card(page, 'Appointments').scrollIntoViewIfNeeded();
  await shot(page, `${SHOTS}/06-phone.png`);
  ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390, 'phone: no sideways scroll');
  await page.context().close();
} catch (e) {
  failures++;
  console.log('CRASH', e.message.split('\n').slice(0, 4).join(' / '));
}
await closeBrowser();
srv.close();
console.log(failures ? `${failures} FAILED` : 'ALL CLIENT ACTION FLOWS PASSED');
process.exit(failures ? 1 : 0);
