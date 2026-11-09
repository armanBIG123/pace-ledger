// Team overview → Email reports: a super admin picks who gets the daily
// and weekly emails, previews one and emails themselves a test.
// Usage: node tests/flows/reports.mjs (after tests/tools/build-app.mjs; npm test runs it all)
import fs from 'node:fs';
import path from 'node:path';
import { serve, openApp, shot, closeBrowser, HERE, OUT, APP } from '../tools/browser.mjs';
const [dist = APP, shotsArg] = process.argv.slice(2);
const SHOTS = shotsArg || path.join(OUT, 'shots/reports');
fs.rmSync(SHOTS, { recursive: true, force: true });
const { srv, url } = await serve(dist);
let failures = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { failures++; console.log('FAIL', m); } };

const MORGAN = { id: '11111111-1111-1111-1111-111111111111', email: 'morgan@example.com' };
const DANA = { id: '33333333-3333-3333-3333-333333333333', email: 'dana@example.com' };
const JORDAN = { id: '22222222-2222-2222-2222-222222222222', email: 'jordan@example.com' };
const WEEKLY = fs.readFileSync(path.join(OUT, 'report-emails/weekly.html'), 'utf8');
const DAILY = fs.readFileSync(path.join(OUT, 'report-emails/daily.html'), 'utf8');
const base = () => ({
  solar_systems: [{ id: 's-big', short_name: 'BIG', name: 'Big Insurance Network' }],
  profiles: [
    { id: MORGAN.id, display_name: 'Morgan Lee', role: 'super_admin', solar_system_id: 's-big', created_at: '2025-06-01T00:00:00Z', hierarchy_tier: 'EVC', email: MORGAN.email },
    { id: DANA.id, display_name: 'Dana Brooks', role: 'manager', solar_system_id: 's-big', manager_id: MORGAN.id, created_at: '2025-08-01T00:00:00Z', hierarchy_tier: 'SFD' },
    { id: JORDAN.id, display_name: 'Jordan Ellis', role: 'advisor', solar_system_id: 's-big', manager_id: DANA.id, created_at: '2026-06-20T00:00:00Z', hierarchy_tier: 'SA' },
  ],
  org_directory: [{ id: MORGAN.id, display_name: 'Morgan Lee' }, { id: DANA.id, display_name: 'Dana Brooks', manager_id: MORGAN.id }, { id: JORDAN.id, display_name: 'Jordan Ellis', manager_id: DANA.id }],
  report_settings: [{ id: true, recipients: ['agency@biginsurancenetwork.com', 'arman@biginsurancenetwork.com', 'dynamite@biginsurancenetwork.com'], daily_on: true, weekly_on: true, last_error: null }],
  report_sends: [{ id: 1, kind: 'daily', period_start: '2026-11-06', period_end: '2026-11-06', test: false, status: 'sent', sent_at: '2026-11-07T13:07:00Z', sent_to: 'agency@biginsurancenetwork.com, arman@biginsurancenetwork.com, dynamite@biginsurancenetwork.com', created_at: '2026-11-07T13:07:00Z' }],
});
const SETUP = `window.__PL_SETUP = function (PL) {
  PL.rpc.pl_report_save_settings = ({ p_recipients, p_daily, p_weekly }) => {
    PL.saved = { p_recipients, p_daily, p_weekly };
    Object.assign(PL.db.report_settings[0], { recipients: p_recipients, daily_on: p_daily, weekly_on: p_weekly });
    return PL.db.report_settings[0];
  };
  PL.fn['activity-report'] = body => {
    PL.fnCalls = (PL.fnCalls || []).concat([body]);
    const html = body.kind === 'weekly' ? window.__WEEKLY : window.__DAILY;
    if (body.action === 'preview') return { ok: true, kind: body.kind, subject: body.kind === 'weekly' ? 'PaceLedger weekly · Oct 31 – Nov 6 · 4 set, 6 completed, 3 apps, $1,751' : 'PaceLedger daily · Fri, Nov 6 · 1 set, 4 completed, 2 apps, $1,500', html };
    if (body.action === 'send-test') return { ok: true, kind: body.kind, to: 'morgan@example.com' };
    return { ok: false, error: 'unknown_action' };
  };
};
window.__WEEKLY = ${JSON.stringify(WEEKLY)};
window.__DAILY = ${JSON.stringify(DAILY)};`;
const BEFORE = `window.__PL_SETUP = function (PL) {
  PL.tableHooks = { report_settings: () => ({ data: null, error: { code: '42P01', message: 'relation "public.report_settings" does not exist' } }) };
};`;
const open = async (who, { setup = SETUP, ...opts } = {}) => {
  const page = await openApp(url, { user: who, db: base(), factors: [] }, { width: 1280, height: 900, ...opts, init: [setup] });
  await page.getByRole('tab', { name: /Team/ }).click();
  await page.waitForTimeout(900);
  return page;
};

try {
  let page = await open(MORGAN);
  const card = page.locator('section.tr-er');
  await card.waitFor({ timeout: 8000 });
  ok(await card.getByRole('heading', { name: 'Email reports' }).isVisible(), 'a super admin sees Email reports on Team overview');
  ok(await card.locator('.tr-er-list li').count() === 3, 'three people get them to start');
  ok(/Last sent Sat, Nov 7, 7:07 AM to 3 people/.test(await card.innerText()), 'when the daily last went out: ' + (await card.locator('.tr-er-kinds li').first().innerText()).replace(/\s+/g, ' '));
  ok(/Not sent yet/.test(await card.locator('.tr-er-kinds li').nth(1).innerText()), 'the weekly has not gone out yet');
  ok(await card.getByRole('button', { name: 'Save changes' }).count() === 0, 'no Save until something changes');
  await shot(page, `${SHOTS}/1-card.png`, { clip: await card.boundingBox() }).catch(() => {});

  // Change who gets them.
  await card.getByRole('button', { name: 'Remove dynamite@biginsurancenetwork.com' }).click();
  await card.getByPlaceholder('name@biginsurancenetwork.com').fill('not an email');
  await card.getByRole('button', { name: 'Add' }).click();
  ok(/“not” isn’t an email address/.test(await card.innerText()), 'a bad email is caught before saving');
  await card.getByPlaceholder('name@biginsurancenetwork.com').fill('Pam@BigInsuranceNetwork.com');
  await card.getByRole('button', { name: 'Add' }).click();
  await card.getByLabel(/Weekly/).uncheck();
  await card.getByRole('button', { name: 'Save changes' }).click();
  await page.waitForTimeout(400);
  const saved = await page.evaluate(() => window.__PL.saved);
  ok(saved && saved.p_recipients.join() === 'agency@biginsurancenetwork.com,arman@biginsurancenetwork.com,pam@biginsurancenetwork.com' && saved.p_daily === true && saved.p_weekly === false, 'saved: removed one, added one (lower-case), weekly off: ' + JSON.stringify(saved));
  ok(/Saved\./.test(await card.innerText()) && await card.getByRole('button', { name: 'Save changes' }).count() === 0, 'Saved, and the button goes away');
  await card.getByLabel(/Weekly/).check();
  await card.getByRole('button', { name: 'Save changes' }).click();
  await page.waitForTimeout(300);

  // Preview and a test.
  await card.getByRole('button', { name: 'Preview weekly' }).click();
  const modal = page.locator('.tr-er-modal');
  await modal.locator('iframe').waitFor({ timeout: 5000 });
  ok(/PaceLedger weekly · Oct 31 – Nov 6/.test(await modal.innerText()), 'the preview shows the subject');
  const frame = page.frameLocator('.tr-er-modal iframe');
  ok(await frame.getByText('By team').isVisible(), 'and the email itself');
  await page.waitForTimeout(300);
  await shot(page, `${SHOTS}/2-preview.png`);
  await modal.getByRole('button', { name: 'Email me a test' }).click();
  await page.waitForTimeout(300);
  ok(/Sent to morgan@example\.com\./.test(await modal.innerText()), 'Email me a test: sent to them');
  const calls = await page.evaluate(() => window.__PL.fnCalls);
  // (The test build runs React's development double-start, so a preview can be asked for twice.)
ok([...new Set(calls.map(c => `${c.action}:${c.kind}`))].join() === 'preview:weekly,send-test:weekly' && calls.filter(c => c.action === 'send-test').length === 1, 'asked the function for a preview, then one test: ' + JSON.stringify(calls));
  await page.keyboard.press('Escape');
  ok(await modal.count() === 0, 'Escape closes it');
  await page.close();

  // On a phone.
  page = await open(MORGAN, { width: 390, height: 844, mobile: true });
  const pcard = page.locator('section.tr-er');
  await pcard.waitFor({ timeout: 8000 });
  await pcard.scrollIntoViewIfNeeded();
  const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(!over, 'phone: nothing wider than the screen');
  await shot(page, `${SHOTS}/3-phone-card.png`, { clip: await pcard.boundingBox() }).catch(() => {});
  await pcard.getByRole('button', { name: 'Preview daily' }).click();
  await page.locator('.tr-er-modal iframe').waitFor({ timeout: 5000 });
  await page.waitForTimeout(300);
  await shot(page, `${SHOTS}/4-phone-preview.png`);
  await page.close();

  // A manager doesn't get it; before the database update it says so.
  page = await open(DANA);
  await page.waitForTimeout(600);
  ok(await page.locator('section.tr-er').count() === 0, 'a manager does not see Email reports');
  await page.close();
  page = await open(MORGAN, { setup: BEFORE });
  await page.locator('section.tr-er').waitFor({ timeout: 8000 });
  ok(/need the database update \(migration-activity-reports\.sql\)/.test(await page.locator('section.tr-er').innerText()), 'before the database update it says what to run');
  await page.close();
} catch (e) { failures++; console.log('FAIL (crash)', e.stack); }
await closeBrowser(); srv.close();
console.log(failures ? `${failures} FAILED` : 'ALL REPORT FLOWS PASSED');
process.exit(failures ? 1 : 0);
