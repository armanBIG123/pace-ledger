// Clients (replaces Pipeline's five tabs), start to finish, against the preview build.
// Usage: node tests/flows/clients.mjs (after tests/tools/build-app.mjs; npm test runs it all)
import fs from 'node:fs';
import path from 'node:path';
import { serve, openApp, shot, closeBrowser, HERE, OUT, APP } from '../tools/browser.mjs';

const [dist = APP, shotsArg] = process.argv.slice(2);
const SHOTS = shotsArg || path.join(OUT, 'shots/clients');
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

try {
  // ---- 1. The list: everyone, next step first -------------------------------
  let page = await open(JORDAN, base());
  const tabs = await page.locator('header button:visible, nav button:visible, [role=tab]:visible').allInnerTexts(); console.log('   tabs:', tabs.join(' | ').replace(/\s+/g, ' '));
  ok(tabs.some(t => /Clients/.test(t)) && !tabs.some(t => /Pipeline/.test(t)), 'the tab is called Clients');
  await toClients(page);
  const names = await page.locator('.tr-cl-row-top strong').allInnerTexts();
  console.log('   order:', names.join(', '));
  ok(names[0] === 'Aisha Brown' || names[0] === 'Grace Kim', 'needs outcome is first');
  ok(!names.includes('Tom Becker'), 'Everyone leaves out Not interested');
  ok(names.includes('Kevin Tran') && names.includes('Rob Smith') && names.includes('Walk In'), 'people booked but not on the list still show');
  const chipText = (await page.locator('.tr-cl-filters').innerText()).replace(/\s+/g, ' ');
  console.log('   chips:', chipText);
  ok(/Everyone 10/.test(chipText) && /Not interested 1/.test(chipText), 'chip counts');
  ok(/Log how it went/.test(await rowOf(page, 'Aisha Brown').innerText()), 'Aisha: Log how it went');
  ok(/Follow-up .* with Dana/.test(await rowOf(page, 'Maria Lopez').innerText()), 'Maria: follow-up booked, with Dana');
  ok(/Requirements open · \$2,400/.test(await rowOf(page, 'Sam Carter').innerText()), 'Sam: requirements open, $2,400');
  ok(/Ask for referrals · Issued/.test(await rowOf(page, 'Lee Grant').innerText()), 'Lee: client, ask for referrals');
  ok(/Call to book · 3 of 9 scored/.test(await rowOf(page, 'Priya Shah').innerText()), 'Priya: call to book, scored');
  ok(/Rebook: no show/.test(await rowOf(page, 'Walk In').innerText()), 'Walk In: rebook');
  await shot(page, `${SHOTS}/01-list-desktop.png`, { fullPage: true });
  await page.locator('.tr-cl-filter', { hasText: 'Not interested' }).click();
  ok((await page.locator('.tr-cl-row-top strong').allInnerTexts()).join() === 'Tom Becker', 'Not interested filter shows Tom');
  await page.locator('.tr-cl-filter', { hasText: 'Everyone' }).click();
  await page.getByLabel('Find a client by name or phone').fill('555-0163');
  ok((await page.locator('.tr-cl-row-top strong').allInnerTexts()).join() === 'Sam Carter', 'search by phone');
  await page.getByLabel('Find a client by name or phone').fill('tom');
  ok((await page.locator('.tr-cl-row-top strong').allInnerTexts()).join() === 'Tom Becker', 'search finds Not interested too');
  await page.getByLabel('Find a client by name or phone').fill('');

  // ---- 2. One tap from the list: log Aisha's outcome ---------------------------
  await rowOf(page, 'Aisha Brown').getByRole('button', { name: /Log outcome/ }).click();
  await page.waitForSelector('text=How did it go with Aisha Brown?');
  await modal(page).getByRole('radio', { name: 'Went well' }).click();
  await modal(page).locator('.tr-field', { hasText: 'Sold a policy?' }).getByRole('button', { name: 'No' }).click().catch(() => {});
  await modal(page).locator('.tr-field', { hasText: 'Follow-up appointment scheduled?' }).getByRole('button', { name: 'No' }).click().catch(() => {});
  await modal(page).getByRole('button', { name: /^Save/ }).click();
  await page.waitForSelector('text=How did it go with Aisha Brown?', { state: 'detached' });
  await page.waitForTimeout(700);
  let db = await state(page);
  ok(db.appointments.find(a => a.id === 'ap-1').outcome === 'went_well', 'outcome saved');
  ok(/Book the follow-up/.test(await rowOf(page, 'Aisha Brown').innerText()), 'Aisha moves on: Book the follow-up');

  // ---- 3. Sam's profile: policy, split, timeline -----------------------------
  await openProfile(page, 'Sam Carter');
  const prof = await page.locator('.tr-cl-profile').innerText();
  ok(/Sold · pending issue/.test(prof) && /Requirements open/.test(prof), 'Sam: stage and next step');
  ok(/Split 50\/50 with Dana Brooks: \$1,200 each/.test(prof), 'split shown with dollars');
  ok(/APS ordered, about 2 weeks/.test(prof), "the leader's policy note shows");
  ok(/Follow-up: sold/.test(prof) && /Client intake form received/.test(prof) && /Added to your list/.test(prof) && /Referred by Lee Grant/.test(prof), 'timeline: sold, intake, referred by Lee');
  ok(await page.getByRole('link', { name: /Call/ }).count() > 0 && /\(512\) 555-0163/.test(prof), 'Call / Text / Email');
  await shot(page, `${SHOTS}/02-profile-desktop.png`, { fullPage: true });
  await page.getByLabel(/Every requirement is done/).check();
  await page.waitForTimeout(500);
  await page.getByLabel('Effective date').fill(iso(at(-1)));
  await page.getByLabel('Add a policy note').click();
  await page.waitForTimeout(800);
  db = await state(page);
  const s6 = db.appointments.find(a => a.id === 'ap-6');
  ok(s6.requirements_completed === true && s6.effective_date === iso(at(-1)), 'requirements and effective date saved');
  ok(/Client/.test(await page.locator('.tr-cl-head').innerText()) && !/pending/.test(await page.locator('.tr-cl-head').innerText()), 'Sam is a Client now');
  await page.getByLabel('Add a policy note').fill('Policy delivered');
  await page.getByLabel('Add a policy note').press('Enter');
  await page.waitForTimeout(500);
  ok(/Policy delivered/.test(await page.locator('.tr-cl-pnotes').innerText()), 'policy note added');

  // ---- 4. Book another appointment: the form, filled in; Cancel comes back -
  await page.getByRole('button', { name: 'Book another appointment' }).click();
  await page.waitForTimeout(900);
  const clientVal = await page.locator('input[value="Sam Carter"]').count();
  ok(clientVal > 0, 'the appointment form opens with Sam filled in');
  ok(/Linked to Sam Carter on your list/.test(await page.locator('main').innerText()), 'linked to his profile');
  await shot(page, `${SHOTS}/03-book-form.png`);
  await page.getByRole('button', { name: 'Cancel' }).first().click();
  await page.waitForTimeout(700);
  ok(await page.locator('.tr-cl-profile h1', { hasText: 'Sam Carter' }).count() === 1, 'Cancel goes back to Sam');

  // ---- 5. Notes ----------------------------------------------------------------
  await page.getByRole('button', { name: 'Clients', exact: false }).first().click();
  await page.waitForSelector('.tr-cl-list');
  await openProfile(page, 'Maria Lopez');
  ok(/Called, wants the tax piece too/.test(await page.locator('.tr-cl-timeline').innerText()), 'follow-up notes on the timeline');
  await page.locator('.tr-cl-next').getByRole('button', { name: 'Add a note' }).click();
  await page.locator('.tr-modal-card textarea, .tr-modal-card input').first().fill('Texted the Zoom link');
  await page.getByRole('button', { name: 'Save note' }).click();
  await page.waitForTimeout(900);
  ok(/Texted the Zoom link/.test(await page.locator('.tr-cl-timeline').innerText()), 'a new note shows on the timeline');
  db = await state(page);
  ok(db.follow_up_notes.some(x => x.note === 'Texted the Zoom link' && x.appointment_id === 'ap-2'), 'saved on her last appointment');

  // ---- 6. Referrals ------------------------------------------------------------
  await page.locator('.tr-cl-back').click();
  await openProfile(page, 'Lee Grant');
  let ref = await page.locator('section', { hasText: 'Referrals' }).last().innerText();
  ok(/Maria Lopez/.test(ref) && /Sam Carter/.test(ref), 'Lee: the people he sent you, with where they are');
  await page.getByRole('button', { name: 'Add names Lee gave you' }).click();
  await page.locator('.tr-modal-card textarea').first().fill('Jamie Cole\nRob Diaz');
  await page.getByRole('button', { name: 'Add to my list' }).click();
  await page.waitForTimeout(1200);
  db = await state(page);
  const added = db.prospects.filter(x => x.referred_by_id === 'p-lee' && x.source === 'Referral').map(x => `${x.first_name} ${x.last_name}`);
  ok(added.includes('Jamie Cole') && added.includes('Rob Diaz'), `referrals saved, linked to Lee (${added.join(', ')})`);
  ref = await page.locator('section', { hasText: 'Referrals' }).last().innerText();
  ok(/Jamie Cole/.test(ref) && /Rob Diaz/.test(ref), 'and listed on his profile');
  await shot(page, `${SHOTS}/04-referrals.png`, { fullPage: true });

  // ---- 7. Merge "Rob Smith" into Robert Smith ------------------------------------
  await page.locator('.tr-cl-back').click();
  await openProfile(page, 'Robert Smith');
  ok(/Is Rob Smith .* the same person as Robert Smith\?/.test(await page.locator('.tr-cl-profile').innerText()), 'Robert: maybe the same as Rob Smith');
  await shot(page, `${SHOTS}/05-merge.png`);
  await page.getByRole('button', { name: 'Yes, merge' }).click();
  await page.waitForTimeout(900);
  db = await state(page);
  ok(db.appointments.find(a => a.client_name === 'Rob Smith').prospect_id === 'p-robert', "Rob's appointment is on Robert's profile");
  ok(/Appointment: went well/.test(await page.locator('.tr-cl-timeline').innerText()), "Robert's timeline has it");
  await page.locator('.tr-cl-back').click();
  ok(await rowOf(page, 'Rob Smith').count() === 0, 'one person, one row');

  // ---- 8. Not on the list: add them ------------------------------------------------
  await openProfile(page, 'Walk In');
  await page.getByRole('button', { name: 'Add to your list' }).click();
  await page.waitForTimeout(900);
  db = await state(page);
  const walk = db.prospects.find(x => x.first_name === 'Walk' && x.last_name === 'In');
  ok(walk && db.appointments.find(a => a.client_name === 'Walk In').prospect_id === walk.id, 'added and linked');
  ok(/Edit details/.test(await page.locator('.tr-cl-profile').innerText()), 'now a full profile');

  // ---- 9. The pipeline bar on top, and the way back ----------------------------
  await page.locator('.tr-cl-back').click();
  await page.waitForSelector('.tr-cl-list');
  const bar = (await page.locator('.tr-stages').innerText()).replace(/\s+/g, ' ');
  console.log('   bar:', bar);
  ok(/Prospects .*Appointments .*Log outcomes .*Follow-up meetings .*Results/.test(bar), 'the pipeline bar is at the top of Clients, in order');
  ok(/Results \d+ submitted · \d+ issued in [A-Z][a-z]{2}/.test(bar), 'Results: submitted vs. issued');
  const barY = await page.locator('.tr-stages').boundingBox(), listY = await page.locator('.tr-cl-list').boundingBox();
  ok(barY.y < listY.y, 'above the list');
  await page.getByRole('tab', { name: /Results/ }).click();
  await page.waitForTimeout(800);
  ok(await page.getByRole('tab', { name: /Results/, selected: true }).count() === 1 && await page.getByRole('button', { name: /Submitted premium/ }).count() === 1, 'Results opens submitted vs. issued premium, highlighted');
  await shot(page, `${SHOTS}/06-results.png`);
  await page.getByRole('tab', { name: /Prospects/ }).click();
  await page.waitForTimeout(800);
  ok(await page.getByRole('tab', { name: /Prospects/, selected: true }).count() === 1, 'Prospects opens the prospect list');
  await page.locator('.tr-pipeline-head .tr-cl-back').click();
  await page.waitForSelector('.tr-cl-list');
  ok(true, 'back to Clients');
  await openProfile(page, 'Priya Shah');
  ok(await page.locator('.tr-stages').count() === 0, "not on one person's profile");
  await page.locator('.tr-cl-back').click();
  await page.waitForSelector('.tr-cl-list');

  // ---- 10. A brand-new name booked is added to the list ---------------------------
  await page.getByRole('tab', { name: /Appointments/ }).click();
  await page.waitForTimeout(700);
  const newBtn = page.getByRole('button', { name: /Log appointment/ }).first();
  await newBtn.click();
  await page.waitForTimeout(500);
  const form = page.locator('form, .tr-form').filter({ hasText: 'Client phone' }).first();
  const clientInput = form.locator('input').first();
  await clientInput.fill('Nora Quinn');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  ok(/Nora Quinn will be added to your list when you save/.test(await form.innerText()), 'a new name says it will be added');
  await shot(page, `${SHOTS}/07-new-name.png`);
  const dateIn = form.locator('input[type="date"]').first();
  await dateIn.fill(iso(at(4)));
  const timeIn = form.locator('input[type="time"]').first();
  await timeIn.fill('18:00');
  await form.getByRole('button', { name: /^Sale$/ }).first().click().catch(() => {});
  console.log('   sale pressed:', await form.getByRole('button', { name: /^Sale$/ }).first().getAttribute('aria-pressed').catch(() => '?'));
  console.log('   time/date:', await dateIn.inputValue(), await timeIn.inputValue(), await clientInput.inputValue());
  await form.getByRole('button', { name: /^Save/ }).first().click();
  await page.waitForTimeout(1500);
  const formErr = await page.locator('.tr-error:visible').allInnerTexts();
  if (formErr.length) console.log('   form says:', formErr.join(' | '));
  db = await state(page);
  const nora = db.prospects.find(x => x.first_name === 'Nora' && x.last_name === 'Quinn');
  const noraAppt = db.appointments.find(a => a.client_name === 'Nora Quinn');
  ok(nora && noraAppt && noraAppt.prospect_id === nora.id, `booked and added to the list (${!!nora}, ${!!noraAppt})`);
  ok(errs(page).length === 0, 'no errors (advisor) ' + errs(page).join(' | '));
  await page.context().close();

  // ---- 11. The presenter sees who they presented ------------------------------------
  page = await open(DANA, base());
  await toClients(page);
  const grace = rowOf(page, 'Grace Kim');
  ok(await grace.count() === 1 && /for Jordan/.test(await grace.innerText()), 'Dana sees Grace Kim, for Jordan');
  ok(await rowOf(page, 'Sam Carter').count() === 0, "Everyone: only what needs Dana's outcome from the team");
  await page.locator('.tr-cl-filter', { hasText: 'You presented' }).click();
  ok(/for Jordan/.test(await rowOf(page, 'Sam Carter').innerText()), 'You presented: Sam Carter, the sale they split');
  await shot(page, `${SHOTS}/08-presenter-list.png`, { fullPage: true });
  await openProfile(page, 'Sam Carter');
  const dprof = await page.locator('.tr-cl-profile').innerText();
  ok(/Split 50\/50 with Jordan Ellis/.test(dprof) && /Jordan keeps this up to date/.test(dprof) && !/Edit details/.test(dprof), "Dana: the split, read-only, Jordan's to keep up");
  await page.locator('.tr-cl-back').click();
  await grace.getByRole('button', { name: /Log outcome/ }).click();
  await page.waitForSelector('text=How did it go with Grace Kim?');
  await modal(page).getByRole('radio', { name: 'Not interested' }).click();
  await modal(page).getByRole('button', { name: /^Save/ }).click();
  await page.waitForTimeout(900);
  db = await state(page);
  ok(db.appointments.find(a => a.client_name === 'Grace Kim').outcome_logged_by === DANA.id, 'Dana logs it as the presenter');
  ok(errs(page).length === 0, 'no errors (presenter) ' + errs(page).join(' | '));
  await page.context().close();

  // ---- 12. Phones ------------------------------------------------------------------
  const phone = { width: 390, height: 844, mobile: true };
  page = await open(JORDAN, base(), phone);
  await toClients(page);
  await shot(page, `${SHOTS}/09-phone-list.png`);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(wide <= 390, `no sideways scroll on the list (${wide})`);
  await openProfile(page, 'Sam Carter');
  await shot(page, `${SHOTS}/10-phone-profile.png`, { fullPage: true });
  ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390, 'no sideways scroll on a profile');
  await page.locator('.tr-cl-back').click();
  await openProfile(page, 'Maria Lopez');
  await shot(page, `${SHOTS}/11-phone-profile-followup.png`, { fullPage: true });
  // Search in the header opens the profile.
  ok(errs(page).length === 0, 'no errors (phone) ' + errs(page).join(' | '));
  await page.context().close();

  // ---- 13. Header search and + New --------------------------------------------------
  page = await open(JORDAN, base());
  const search = page.getByPlaceholder(/Search clients and prospects/).first();
  await search.click();
  await search.fill('Priya');
  await page.waitForTimeout(600);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  ok(await page.locator('.tr-cl-profile h1', { hasText: 'Priya Shah' }).count() === 1, 'search opens her profile');
  await page.locator('button:visible', { hasText: 'Today' }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^New|Add or log/ }).first().click().catch(() => {});
  await page.waitForTimeout(300);
  const addP = page.getByRole('menuitem', { name: /Add a prospect/ });
  if (await addP.count()) {
    await addP.click();
    await page.waitForTimeout(800);
    ok(await page.locator('.tr-cl-form-modal').count() === 1, '+ New → Add a prospect opens the form on Clients');
    await shot(page, `${SHOTS}/12-add-name.png`);
  } else ok(false, '+ New menu not found');
  ok(errs(page).length === 0, 'no errors (search) ' + errs(page).join(' | '));
  await page.context().close();
} catch (e) {
  failures++;
  console.log('CRASH', e.message.split('\n').slice(0, 4).join(' / '));
}
await closeBrowser();
srv.close();
console.log(failures ? `${failures} FAILED` : 'ALL CLIENT FLOWS PASSED');
process.exit(failures ? 1 : 0);
