// Changing a weekly training's time on the Calendar (super admins).
// Usage: node tests/flows/trainings.mjs (after tests/tools/build-app.mjs; npm test runs it all)
import fs from 'node:fs';
import path from 'node:path';
import { serve, openApp, shot, closeBrowser, HERE, OUT, APP } from '../tools/browser.mjs';

const [dist = APP, shotsArg] = process.argv.slice(2);
const SHOTS = shotsArg || path.join(OUT, 'shots/trainings');
fs.rmSync(SHOTS, { recursive: true, force: true });
const { srv, url } = await serve(dist);
let failures = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { failures++; console.log('FAIL', m); } };

const MORGAN = { id: '11111111-1111-1111-1111-111111111111', email: 'morgan@example.com' };
const JORDAN = { id: '22222222-2222-2222-2222-222222222222', email: 'jordan@example.com' };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };
// A Tuesday this month, a week or more from the end of the visible grid.
const first = new Date(); first.setDate(1);
const firstTue = addDays(iso(first), (2 - first.getDay() + 7) % 7);
const weeks = [0, 1, 2, 3].map(i => addDays(firstTue, i * 7));
const GROUP = '99999999-0000-0000-0000-000000000001';
const base = () => ({
  solar_systems: [{ id: 's-big', short_name: 'BIG', name: 'Big Insurance Network' }],
  profiles: [
    { id: MORGAN.id, display_name: 'Morgan Lee', role: 'super_admin', solar_system_id: 's-big', created_at: '2025-06-01T00:00:00Z', hierarchy_tier: 'EVC' },
    { id: JORDAN.id, display_name: 'Jordan Ellis', role: 'advisor', solar_system_id: 's-big', manager_id: MORGAN.id, created_at: '2026-06-20T00:00:00Z', hierarchy_tier: 'FA' },
  ],
  trainings: weeks.map((d, i) => ({ id: `tr-${i + 1}`, title: 'Team call', training_date: d, training_time: '19:00:00', duration_minutes: 60, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    zoom_url: 'https://zoom.us/j/111', notes: null, created_by: MORGAN.id, created_by_name: 'Morgan Lee', recurring_group_id: GROUP, solar_system_id: 's-big' })),
});
// The database function, like migration-training-edits.sql.
const SETUP = `window.__PL_SETUP = function (PL) {
  PL.rpc.pl_edit_training_series = a => {
    if (!['super_admin', 'super_manager'].includes((PL.db.profiles.find(p => p.id === PL.user.id) || {}).role)) throw new Error('not_allowed');
    let n = 0;
    PL.db.trainings.forEach(t => {
      if (t.recurring_group_id !== a.p_group || t.training_date < a.p_from) return;
      const d = new Date(t.training_date + 'T12:00:00'); d.setDate(d.getDate() + (a.p_shift_days || 0));
      Object.assign(t, { title: a.p_title, training_time: a.p_time.length === 5 ? a.p_time + ':00' : a.p_time, duration_minutes: a.p_duration, timezone: a.p_timezone || t.timezone,
        zoom_url: a.p_zoom_url || null, notes: a.p_notes || null,
        training_date: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') });
      n++;
    });
    return n;
  };
};`;
const open = async (who, opts = {}) => {
  const page = await openApp(url, { user: who, db: base() }, { width: 1280, height: 900, ...opts, init: [SETUP] });
  await page.locator('button:visible', { hasText: 'Today' }).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.locator('button:visible', { hasText: /^Calendar$/ }).first().click();
  await page.waitForTimeout(1200);
  return page;
};
const state = page => page.evaluate(() => window.__PL.db.trainings.map(t => ({ id: t.id, d: t.training_date, t: t.training_time, len: t.duration_minutes, title: t.title })));
const dow = s => new Date(`${s}T12:00:00`).getDay();
const errs = page => page.errors.filter(e => !/not mocked|ERR_/.test(e));

try {
  // ---- super admin: move every week from week 2 on to Wednesdays, 8 PM, 90 min
  let page = await open(MORGAN);
  const item = page.locator('.tr-cal-appt-training', { hasText: 'Team call' });
  ok(await item.count() >= 4, `four weekly calls on the calendar (${await item.count()})`);
  await item.nth(1).click();
  await page.waitForSelector('#tr-calinfo-title');
  ok(await page.getByRole('button', { name: 'Change time or details' }).count() === 1, 'the training window has "Change time or details"');
  await page.getByRole('button', { name: 'Change time or details' }).click();
  await page.waitForSelector('#tr-training-edit-title');
  const modal = page.locator('.tr-training-edit-modal');
  ok(await modal.locator('input[type="time"]').first().inputValue() === '19:00', 'filled in with the current time');
  ok(/It repeats every week/.test(await modal.innerText()), 'asks which weeks');
  await shot(page, `${SHOTS}/01-edit-series.png`);
  await modal.locator('input[type="date"]').first().fill(addDays(weeks[1], 1));
  await modal.locator('input[type="time"]').first().fill('20:00');
  await modal.locator('input[type="time"]').nth(1).fill('21:30');
  await modal.getByRole('button', { name: 'Save changes' }).click();
  await page.waitForTimeout(1200);
  let db = await state(page);
  console.log('   after series edit:', db.map(t => `${t.d} ${t.t} ${t.len}`).join(' | '));
  ok(db[0].d === weeks[0] && db[0].t === '19:00:00' && db[0].len === 60, 'the first week stays as it was');
  ok(db.slice(1).every((t, i) => t.d === addDays(weeks[i + 1], 1) && dow(t.d) === 3 && t.t === '20:00:00' && t.len === 90), 'every week after moves to Wednesday 8:00–9:30 PM');
  const note = await page.locator('.tr-ph-saved').innerText().catch(() => '');
  console.log('   notice:', note);
  ok(/changed from .* on \(3 weeks\): 8:00 PM, Wednesdays/.test(note), 'says what changed');
  ok(await page.locator('.tr-cal-appt-training', { hasText: 'Team call' }).count() >= 4, 'the calendar shows the new times');
  await shot(page, `${SHOTS}/02-after.png`);

  // ---- just one date
  await page.locator('.tr-cal-appt-training', { hasText: 'Team call' }).nth(3).click();
  await page.waitForSelector('#tr-calinfo-title');
  await page.getByRole('button', { name: 'Change time or details' }).click();
  await page.waitForSelector('#tr-training-edit-title');
  await page.locator('.tr-training-edit-modal').getByRole('button', { name: /^Just / }).click();
  await page.locator('.tr-training-edit-modal input[type="time"]').first().fill('18:00');
  await page.locator('.tr-training-edit-modal input').first().fill('Team call (early)');
  await page.locator('.tr-training-edit-modal').getByRole('button', { name: 'Save changes' }).click();
  await page.waitForTimeout(1000);
  db = await state(page);
  console.log('   after one-date edit:', db.map(t => `${t.d} ${t.t} ${t.title}`).join(' | '));
  ok(db[3].t.startsWith('18:00') && db[3].title === 'Team call (early)' && db[2].t === '20:00:00' && db[2].title === 'Team call', 'just that date changes');
  ok(/changed for .* only/.test(await page.locator('.tr-ph-saved').innerText()), 'says only that date');

  // ---- from the day list, too
  await page.locator('.tr-cal-day', { has: page.locator('.tr-cal-appt-training') }).first().click({ position: { x: 6, y: 6 } });
  await page.waitForTimeout(500);
  ok(await page.getByRole('button', { name: /Change Team call/ }).count() >= 1, "the day's list has a change button");
  await page.keyboard.press('Escape');
  ok(errs(page).length === 0, 'no errors ' + errs(page).join(' | '));
  await page.context().close();

  // ---- phone
  page = await open(MORGAN, { width: 390, height: 844, mobile: true });
  const listItem = page.locator('text=Team call').first();
  await listItem.click().catch(() => {});
  await page.waitForTimeout(500);
  if (await page.getByRole('button', { name: 'Change time or details' }).count()) {
    await page.getByRole('button', { name: 'Change time or details' }).click();
    await page.waitForSelector('#tr-training-edit-title');
    await shot(page, `${SHOTS}/03-phone-edit.png`);
    ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390, 'phone: no sideways scroll');
  } else { await shot(page, `${SHOTS}/03-phone-debug.png`); ok(false, 'phone: could not open the training'); }
  await page.context().close();

  // ---- an advisor can't change it
  page = await open(JORDAN);
  await page.locator('.tr-cal-appt-training', { hasText: 'Team call' }).first().click();
  await page.waitForSelector('#tr-calinfo-title');
  ok(await page.getByRole('button', { name: 'Change time or details' }).count() === 0, 'advisors see no change button');
  await page.context().close();
} catch (e) {
  failures++;
  console.log('CRASH', e.message.split('\n').slice(0, 4).join(' / '));
}
await closeBrowser();
srv.close();
console.log(failures ? `${failures} FAILED` : 'ALL TRAINING FLOWS PASSED');
process.exit(failures ? 1 : 0);
