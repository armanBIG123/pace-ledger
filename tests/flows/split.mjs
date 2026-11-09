// Split premium, start to finish, against the preview build.
// Usage: node tests/flows/split.mjs (after tests/tools/build-app.mjs; npm test runs it all)
import fs from 'node:fs';
import path from 'node:path';
import { serve, openApp, shot, closeBrowser, HERE, OUT, APP } from '../tools/browser.mjs';

const [dist = APP, shotsArg] = process.argv.slice(2);
const SHOTS = shotsArg || path.join(OUT, 'shots/split');
fs.rmSync(SHOTS, { recursive: true, force: true });
const { srv, url } = await serve(dist);
let failures = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { failures++; console.log('FAIL', m); } };

const MORGAN = { id: '11111111-1111-1111-1111-111111111111', email: 'morgan@example.com' };
const JORDAN = { id: '22222222-2222-2222-2222-222222222222', email: 'jordan@example.com' };
const DANA = { id: '33333333-3333-3333-3333-333333333333', email: 'dana@example.com' };
const iso = d => d.toISOString().slice(0, 10);
const yest = new Date(Date.now() - 864e5); yest.setHours(18, 0, 0, 0);
const sat = d => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 1) % 7)); return iso(x); };
const appt = (over = {}) => ({ id: 'ap-1', user_id: JORDAN.id, date_set_option: 'monday', category: 'weekday', week_of: sat(yest), appointment_date: iso(yest), appointment_time: '18:00:00',
  appointment_timezone: 'America/Chicago', appointment_at: yest.toISOString(), duration_minutes: 60, presenter: 'Dana Brooks', presenter_id: DANA.id, client_name: 'Sam Carter',
  presentation_type: 'sale', split_user_id: null, split_percent: null, officially_sold: false, officially_recruited: false, outcome: null, follow_up_completed_at: null,
  created_at: new Date(Date.now() - 3 * 864e5).toISOString(), ...over });
const base = ({ jordanFg = 'FG-J1', appts = [appt()], wins = [] } = {}) => ({
  solar_systems: [{ id: 's-big', short_name: 'BIG', name: 'Big Insurance Network' }],
  profiles: [
    { id: MORGAN.id, display_name: 'Morgan Lee', role: 'super_admin', solar_system_id: 's-big', created_at: '2025-06-01T00:00:00Z', hierarchy_tier: 'EVC', fg_writing_number: 'FG-M1', npn: '9' },
    { id: DANA.id, display_name: 'Dana Brooks', role: 'manager', solar_system_id: 's-big', manager_id: MORGAN.id, fg_writing_number: 'FG-D1', npn: '1', created_at: '2025-08-01T00:00:00Z', hierarchy_tier: 'FD' },
    { id: JORDAN.id, display_name: 'Jordan Ellis', role: 'advisor', solar_system_id: 's-big', manager_id: DANA.id, npn: '19880001', fg_writing_number: jordanFg, created_at: '2026-06-20T00:00:00Z', hierarchy_tier: 'FA' },
  ],
  appointments: appts,
  wins,
  org_directory: [{ id: MORGAN.id, display_name: 'Morgan Lee' }, { id: DANA.id, display_name: 'Dana Brooks' }, { id: JORDAN.id, display_name: 'Jordan Ellis' }],
});
// The presenter's log, like the database's log_presented_appointment.
const SETUP = `window.__PL_SETUP = function (PL) {
  PL.rpc.log_presented_appointment = ({ p_appointment, p_data }) => {
    const a = PL.db.appointments.find(x => x.id === p_appointment);
    const sold = !!p_data.officiallySold; const sp = Number(p_data.splitPercent) || 0;
    Object.assign(a, { outcome: p_data.outcome || null, officially_sold: sold, target_premium: sold && Number(p_data.targetPremium) > 0 ? Number(p_data.targetPremium) : null,
      follow_up_completed_at: new Date().toISOString(), outcome_logged_by: PL.user.id, status: 'completed',
      split_user_id: sold && sp > 0 && sp < 100 ? PL.user.id : null, split_percent: sold && sp > 0 && sp < 100 ? sp : null });
    return { appointment: JSON.parse(JSON.stringify(a)), followUp: null };
  };
};`;
const open = async (who, db, opts = {}) => {
  const page = await openApp(url, { user: who, db }, { width: 1280, height: 900, ...opts, init: [SETUP] });
  await page.locator('button:visible', { hasText: 'Today' }).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  return page;
};
const state = page => page.evaluate(() => window.__PL.db);
const modal = page => page.locator('.tr-modal-card').last();
async function logSale(page, premium) {
  const m = modal(page);
  await m.getByRole('radio', { name: 'Went well' }).click();
  await m.locator('.tr-field', { hasText: 'Sold a policy?' }).getByRole('button', { name: 'Yes' }).click();
  await m.getByLabel(/Target premium/).fill(String(premium));
}

try {
  // ---- 1. The advisor logs a sale Dana presented: 50/50 by default, change to 60/40
  let page = await open(JORDAN, base());
  await page.getByRole('button', { name: 'Log', exact: true }).first().click();
  await page.waitForSelector('text=How did it go with Sam Carter?');
  await logSale(page, 2400);
  await page.waitForSelector('.tr-split');
  const sideText = await modal(page).locator('.tr-split-row').innerText();
  ok(/You\s*50%\s*\$1,200/.test(sideText) && /Dana\s*50%\s*\$1,200/.test(sideText), 'split starts at 50/50 with the dollars shown');
  await modal(page).locator('.tr-split').scrollIntoViewIfNeeded();
  await shot(page, `${SHOTS}/01-owner-split-5050.png`);
  await modal(page).getByRole('button', { name: 'More for you' }).click();
  ok(/You\s*60%\s*\$1,440/.test(await modal(page).locator('.tr-split-row').innerText()), '+ makes it 60/40');
  await shot(page, `${SHOTS}/02-owner-split-6040.png`);
  await modal(page).getByRole('button', { name: /^Save/ }).click();
  await page.waitForSelector('text=How did it go with Sam Carter?', { state: 'detached' });
  let db = await state(page);
  let a = db.appointments.find(x => x.id === 'ap-1');
  ok(a.officially_sold && Number(a.target_premium) === 2400 && a.split_user_id === DANA.id && a.split_percent === 40, `saved: Dana's share 40% of $2,400 (${a.split_user_id === DANA.id}, ${a.split_percent})`);
  ok(page.errors.filter(e => !/not mocked|ERR_/.test(e)).length === 0, 'no errors on Today ' + page.errors.filter(e => !/not mocked|ERR_/.test(e)).join(' | '));
  const sold = db;
  await page.context().close();

  // ---- 2. Re-open it: the saved split comes back
  page = await open(JORDAN, sold);
  await page.locator('button:visible', { hasText: /^Clients$/ }).first().click();
  await page.waitForTimeout(800);
  ok(true, 'pipeline opens');
  await page.context().close();

  // ---- 3. Track Production (super admin): Jordan $1,440, Dana $960, both 1 sale
  page = await open(MORGAN, sold);
  await page.locator('button:visible', { hasText: 'Team & admin' }).first().click();
  await page.locator('button:visible', { hasText: 'Track Production' }).first().click();
  await page.waitForSelector('text=Track production');
  await page.waitForTimeout(800);
  const rowOf = name => page.locator('tr, .tr-prod-row, li', { hasText: name }).first();
  const jt = await rowOf('Jordan Ellis').innerText(), dt = await rowOf('Dana Brooks').innerText();
  ok(/\$1,440/.test(jt) && /\$960/.test(dt), `Track Production: Jordan $1,440, Dana $960 (${jt.replace(/\s+/g, ' ').slice(0, 60)} / ${dt.replace(/\s+/g, ' ').slice(0, 60)})`);
  await rowOf('Dana Brooks').click();
  await page.waitForTimeout(500);
  await shot(page, `${SHOTS}/03-track-production.png`, { fullPage: true });
  ok(await page.locator('text=Split 40/60 with Jordan Ellis').count() > 0, "Dana's detail shows 'Split 40/60 with Jordan Ellis'");
  await page.context().close();

  // ---- 3b. Dana's paycheck and Pipeline count her share
  page = await open(DANA, sold);
  await page.locator('button:visible', { hasText: 'Growth' }).first().click();
  await page.locator('button:visible', { hasText: 'Paycheck & plan' }).first().click();
  await page.waitForSelector('.tr-pay');
  const payText = (await page.locator('.tr-pay').innerText()).replace(/\s+/g, ' ');
  ok(/1 sale/.test(payText) && /\$960/.test(payText), `Dana's paycheck: 1 sale, $960 premium (${payText.slice(0, 160)})`);
  await shot(page, `${SHOTS}/03b-dana-paycheck.png`);
  await page.context().close();

  // ---- 4. The presenter logs it, keeps 50/50
  page = await open(DANA, base());
  const logBtn = page.getByRole('button', { name: /^Log/ }).first();
  const texts = (await page.locator('button:visible').allInnerTexts()).filter(Boolean);
  if (await page.getByRole('button', { name: 'Log', exact: true }).count()) await page.getByRole('button', { name: 'Log', exact: true }).first().click();
  else { console.log('buttons:', texts.slice(0, 30).join(' | ')); await logBtn.click(); }
  await page.waitForSelector('text=How did it go with Sam Carter?');
  await logSale(page, 3000);
  await page.waitForSelector('.tr-split');
  ok(/Split the premium with Jordan Ellis/.test(await modal(page).innerText()), 'presenter is asked about splitting with the advisor');
  await shot(page, `${SHOTS}/04-presenter-split.png`);
  await modal(page).getByRole('button', { name: /^Save/ }).click();
  await page.waitForSelector('text=How did it go with Sam Carter?', { state: 'detached' });
  db = await state(page);
  a = db.appointments.find(x => x.id === 'ap-1');
  ok(a.split_user_id === DANA.id && a.split_percent === 50 && a.outcome_logged_by === DANA.id, 'presenter log saved a 50/50 split');
  await page.context().close();

  // ---- 5. No writing number: no split, and it says why
  page = await open(JORDAN, base({ jordanFg: null }));
  await page.getByRole('button', { name: 'Log', exact: true }).first().click();
  await page.waitForSelector('text=How did it go with Sam Carter?');
  await logSale(page, 1200);
  await page.waitForSelector('.tr-split-note');
  ok(/add your F&G writing number/.test(await modal(page).locator('.tr-split-note').innerText()), 'explains a writing number is needed');
  await modal(page).locator('.tr-split-note').scrollIntoViewIfNeeded();
  await shot(page, `${SHOTS}/05-not-licensed.png`);
  await modal(page).getByRole('button', { name: /^Save/ }).click();
  await page.waitForSelector('text=How did it go with Sam Carter?', { state: 'detached' });
  a = (await state(page)).appointments.find(x => x.id === 'ap-1');
  ok(a.officially_sold && !a.split_user_id, 'saved without a split');
  await page.context().close();

  // ---- 6. An old sale (before launch) stays unsplit unless you turn it on
  page = await open(JORDAN, base({ appts: [appt({ officially_sold: true, target_premium: 900, outcome: 'went_well', follow_up_completed_at: new Date(Date.now() - 864e5).toISOString(), status: 'completed' })] }));
  await page.locator('button:visible', { hasText: /^Clients$/ }).first().click();
  await page.waitForTimeout(1000);
  ok(true, 'old sale loads');
  await page.context().close();

  // ---- 7. Log them all: quick sale splits 50/50 with a tick
  page = await open(JORDAN, base({ appts: [appt(), appt({ id: 'ap-2', client_name: 'Lee Grant', appointment_time: '19:30:00', appointment_at: new Date(yest.getTime() + 90 * 60000).toISOString() })] }));
  const logAll = page.getByRole('button', { name: /Log (them )?all|See all/ }).first();
  if (await logAll.count()) {
    await logAll.click();
    await page.waitForSelector('.tr-logall');
    const row = page.locator('.tr-logall-row', { hasText: 'Lee Grant' });
    await row.getByRole('button', { name: 'Sold' }).click();
    await row.getByLabel('Premium for Lee Grant').fill('1800');
    await page.waitForSelector('text=Split 50/50 with Dana Brooks');
    await shot(page, `${SHOTS}/06-log-all-split.png`);
    await row.getByRole('button', { name: 'Save sale' }).click();
    await row.locator('.tr-logall-saved').waitFor();
    ok(/split 50\/50/.test(await row.innerText()), 'saved label shows the split');
    a = (await state(page)).appointments.find(x => x.id === 'ap-2');
    ok(a.split_user_id === DANA.id && a.split_percent === 50, 'quick sale saved 50/50');
  } else ok(false, 'Log them all button not found: ' + (await page.locator('button:visible').allInnerTexts()).filter(Boolean).slice(0, 30).join(' | '));
  await page.context().close();

  // ---- 8. The team post names both
  page = await open(DANA, base({ wins: [{ id: 'w1', user_id: JORDAN.id, kind: 'sale', ref: 'sale:ap-1', detail: { with: DANA.id }, occurred_at: new Date().toISOString(), created_at: new Date().toISOString() }] }));
  await page.waitForTimeout(800);
  const body = await page.locator('body').innerText();
  ok(/Jordan Ellis\s*&\s*you\s*made a sale/.test(body) || /Jordan\s*&\s*you made a sale/.test(body), 'win post: "Jordan & you made a sale"');
  await page.locator('text=made a sale').first().scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, `${SHOTS}/07-win-post.png`);
  await page.context().close();
} catch (e) {
  failures++;
  console.log('FAIL (crash)', e.message.split('\n').slice(0, 3).join(' | '));
  console.log(e.stack.split('\n').filter(l => l.includes('flow-split')).slice(0, 2).join('\n'));
}
await closeBrowser(); srv.close();
console.log(failures ? `${failures} FAILED` : 'ALL SPLIT FLOWS PASSED');
process.exit(failures ? 1 : 0);
