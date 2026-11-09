// Calendar → Schedule availability: Pam's wording, and saving still works.
// Usage: node tests/flows/availability.mjs (after tests/tools/build-app.mjs; npm test runs it all)
import fs from 'node:fs';
import path from 'node:path';
import { serve, openApp, shot, closeBrowser, HERE, OUT, APP } from '../tools/browser.mjs';
const [dist = APP, shotsArg] = process.argv.slice(2);
const SHOTS = shotsArg || path.join(OUT, 'shots/availability');
fs.rmSync(SHOTS, { recursive: true, force: true });
const { srv, url } = await serve(dist);
let failures = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { failures++; console.log('FAIL', m); } };
const MORGAN = { id: '11111111-1111-1111-1111-111111111111', email: 'morgan@example.com' };
const db = () => ({
  solar_systems: [{ id: 's-big', short_name: 'BIG', name: 'Big Insurance Network' }],
  profiles: [{ id: MORGAN.id, display_name: 'Morgan Lee', role: 'super_admin', solar_system_id: 's-big', created_at: '2025-06-01T00:00:00Z', hierarchy_tier: 'EVC' }],
  presenter_settings: [], presenter_hours: [],
});
const SETUP = `window.__PL_SETUP = function (PL) {
  PL.rpc.save_presenting_hours = a => {
    PL.db.presenter_settings = [{ user_id: PL.user.id, ...a.p_settings }];
    PL.db.presenter_hours = a.p_hours.map(h => ({ user_id: PL.user.id, weekday: h.weekday, start_time: h.start + ':00', end_time: h.end + ':00' }));
    return null;
  };
};`;
const open = async (opts = {}) => {
  const page = await openApp(url, { user: MORGAN, db: db(), factors: [] }, { width: 1280, height: 900, ...opts, init: [SETUP] });
  await page.locator('button:visible', { hasText: 'Today' }).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(900);
  await page.locator('button:visible', { hasText: /^Calendar$/ }).first().click();
  await page.waitForTimeout(1200);
  return page;
};
const OLD = /Presenting hours|Taking bookings|Not presenting|Each presentation|Start times every|Break between|No break|Booked at least|Leave out times|Save presenting hours|book you to present/;
try {
  let page = await open();
  const hint = await page.locator('.tr-cal-hint').innerText();
  ok(/Let your team book appointments with you\./.test(hint) && /Set your availability/.test(hint), 'the Calendar nudge: ' + hint.replace(/\s+/g, ' '));
  await page.locator('.tr-cal-hint').getByRole('button', { name: 'Set availability' }).click();
  await page.waitForSelector('.tr-ph .tr-ph-week');
  const card = page.locator('.tr-ph');
  const t = await card.innerText();
  for (const want of ['Schedule availability', 'Set the days and times your team can book appointments with you. Your availability will automatically exclude existing appointments and blocked times.',
    'Accepting appointments', 'Unavailable', 'Appointment duration', 'Start time intervals', 'Buffer between appointments', 'No buffer',
    'Minimum advance notice', 'Booking window', 'Time zone', 'Exclude busy times from Google Calendar', 'Save availability']) ok(t.includes(want), `says "${want}"`);
  ok(!OLD.test(t), 'none of the old wording is left');
  ok(await card.getByLabel('Minimum advance notice').inputValue() === '120' && /2 hours/.test(await card.getByLabel('Minimum advance notice').locator('option:checked').innerText()), 'notice reads "2 hours"');
  await shot(page, `${SHOTS}/01-empty.png`);
  await card.getByLabel('Available on Mondays').check();
  await card.getByLabel('Available on Wednesdays').check();
  await card.getByLabel('Buffer between appointments').selectOption('15');
  const sum = await card.locator('.tr-ph-summary').innerText();
  ok(/start times a week for 1 hour appointments, with 15 min between/.test(sum), 'the summary says appointments: ' + sum);
  await shot(page, `${SHOTS}/02-filled.png`);
  await card.getByRole('button', { name: 'Save availability' }).click();
  await page.waitForTimeout(800);
  const note = await page.locator('.tr-ph-saved').innerText();
  ok(/Availability saved\./.test(note), 'saved note: ' + note);
  const saved = await page.evaluate(() => window.__PL.db.presenter_hours.length);
  ok(saved === 2, 'two days saved');
  // Calendar settings
  await page.getByRole('button', { name: /Calendar settings/ }).click();
  await page.waitForTimeout(600);
  const sheet = await page.locator('.tr-modal-card, [role=dialog]').last().innerText();
  ok(/Schedule availability/.test(sheet) && !OLD.test(sheet), 'Calendar settings says Schedule availability');
  await shot(page, `${SHOTS}/03-settings.png`);
  ok(page.errors.filter(e => !/not mocked|ERR_/.test(e)).length === 0, 'no errors');
  await page.context().close();
  page = await open({ width: 390, height: 844, mobile: true });
  await page.locator('.tr-cal-hint').getByRole('button', { name: 'Set availability' }).click();
  await page.waitForSelector('.tr-ph .tr-ph-week');
  await page.locator('.tr-ph').getByLabel('Available on Tuesdays').check();
  await page.locator('.tr-ph-rules').scrollIntoViewIfNeeded();
  await shot(page, `${SHOTS}/04-phone.png`);
  ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390, 'phone: no sideways scroll');
  await page.context().close();
} catch (e) { failures++; console.log('CRASH', e.message.split('\n').slice(0, 4).join(' / ')); }
await closeBrowser(); srv.close();
console.log(failures ? `${failures} FAILED` : 'ALL AVAILABILITY FLOWS PASSED');
process.exit(failures ? 1 : 0);
