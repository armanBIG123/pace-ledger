// Manage Team: edit one person at a time (name, phone, role, reports-to,
// comp level) with Save and a reason; phone numbers; the activity log;
// Your account phone and Today's nudge; before the database update.
// Usage: node tests/flows/manage.mjs (after tests/tools/build-app.mjs; npm test runs it all)
import fs from 'node:fs';
import path from 'node:path';
import { serve, openApp, shot, closeBrowser, HERE, OUT, APP } from '../tools/browser.mjs';

const [dist = APP, shotsArg] = process.argv.slice(2);
const SHOTS = shotsArg || path.join(OUT, 'shots/manage');
fs.rmSync(SHOTS, { recursive: true, force: true });
const { srv, url } = await serve(dist);
let failures = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { failures++; console.log('FAIL', m); } };

const MORGAN = { id: '11111111-1111-1111-1111-111111111111', email: 'morgan@example.com' };
const DANA = { id: '33333333-3333-3333-3333-333333333333', email: 'dana@example.com' };
const JORDAN = { id: '22222222-2222-2222-2222-222222222222', email: 'jordan.ellis@example.com' };
const RILEY = { id: '44444444-4444-4444-4444-444444444444', email: 'riley@example.com' };
const base = () => ({
  solar_systems: [{ id: 's-big', short_name: 'BIG', name: 'Big Insurance Network' }],
  profiles: [
    { id: MORGAN.id, display_name: 'Morgan Lee', email: MORGAN.email, role: 'super_admin', solar_system_id: 's-big', created_at: '2025-06-01T00:00:00Z', hierarchy_tier: 'EVC' },
    { id: DANA.id, display_name: 'Dana Brooks', email: DANA.email, role: 'manager', solar_system_id: 's-big', manager_id: MORGAN.id, created_at: '2025-08-01T00:00:00Z', hierarchy_tier: 'FD' },
    { id: JORDAN.id, display_name: 'Jordan Ellis', email: JORDAN.email, role: 'advisor', solar_system_id: 's-big', manager_id: DANA.id, created_at: '2026-09-20T00:00:00Z', hierarchy_tier: 'UA' },
    { id: RILEY.id, display_name: 'Riley "Dynamite" Park', email: RILEY.email, role: 'advisor', solar_system_id: 's-big', manager_id: DANA.id, created_at: '2026-08-20T00:00:00Z', hierarchy_tier: 'FA' },
  ],
  person_contacts: [{ user_id: RILEY.id, phone: '2145550187' }],
  audit_log: [{ id: 'old-1', actor_id: MORGAN.id, actor_name: 'Pam Admin', action: 'Changed hierarchy tier', target_name: 'Jordan Ellis', details: 'UA → SA', created_at: '2026-11-05T19:55:00Z' }],
});
// The database functions, like migration-manage-team-edits.sql.
const SETUP = `window.__PL_SETUP = function (PL) {
  const label = { advisor: 'Advisor', manager: 'Manager', super_manager: 'Super Manager', super_admin: 'Super Admin' };
  PL.rpc.set_my_phone = a => {
    const d = String(a.p_phone || '').replace(/\\D/g, '').replace(/^1(?=\\d{10}$)/, '');
    if (d && d.length !== 10) throw new Error('phone_digits');
    const rows = PL.db.person_contacts = PL.db.person_contacts || [];
    const hit = rows.find(r => r.user_id === PL.user.id);
    if (hit) hit.phone = d || null; else rows.push({ user_id: PL.user.id, phone: d || null });
    return d || null;
  };
  PL.rpc.pl_admin_save_person = a => {
    const me = PL.db.profiles.find(p => p.id === PL.user.id);
    if (!me || !['super_admin', 'super_manager'].includes(me.role)) throw new Error('not_allowed');
    const p = PL.db.profiles.find(x => x.id === a.p_user);
    const c = a.p_changes || {};
    const big = ['role', 'manager_id', 'hierarchy_tier'].some(k => k in c && (c[k] || null) !== (p[k] || null));
    if (big && !String(a.p_reason || '').trim()) throw new Error('reason_required');
    const log = (action, details) => PL.db.audit_log.push({ id: 'l' + Math.random(), actor_id: me.id, actor_name: me.display_name, action, target_name: p.display_name, target_id: p.id, details, reason: a.p_reason || null, created_at: new Date().toISOString() });
    if ('display_name' in c && c.display_name !== p.display_name) { const was = p.display_name; p.display_name = c.display_name; log('Changed name', was + ' → ' + c.display_name); }
    if ('phone' in c) {
      const rows = PL.db.person_contacts; const hit = rows.find(r => r.user_id === p.id);
      if (hit) hit.phone = c.phone || null; else rows.push({ user_id: p.id, phone: c.phone || null });
      log('Changed phone', c.phone ? 'changed' : 'removed');
    }
    if ('role' in c && c.role !== p.role) { log('Changed role', label[p.role] + ' → ' + label[c.role]); p.role = c.role; }
    if ('manager_id' in c) { p.manager_id = c.manager_id || null; log('Changed reports-to', 'now reports to ' + ((PL.db.profiles.find(x => x.id === c.manager_id) || {}).display_name || 'nobody')); }
    if ('hierarchy_tier' in c) { log('Changed comp level', (p.hierarchy_tier || 'none') + ' → ' + (c.hierarchy_tier || 'none')); p.hierarchy_tier = c.hierarchy_tier || null; }
    const ph = (PL.db.person_contacts.find(r => r.user_id === p.id) || {}).phone || null;
    return { ...p, phone: ph };
  };
};`;
// Before migration-manage-team-edits.sql: no person_contacts table, no functions.
const BEFORE = `window.__PL_SETUP = function (PL) {
  PL.tableHooks = { person_contacts: () => ({ data: null, error: { code: '42P01', message: 'relation "public.person_contacts" does not exist' } }) };
  const missing = n => () => { const e = new Error('Could not find the function public.' + n + ' in the schema cache'); e.code = 'PGRST202'; throw e; };
  PL.rpc.pl_admin_save_person = missing('pl_admin_save_person');
  PL.rpc.set_my_phone = missing('set_my_phone');
};`;
const open = async (who, { setup = SETUP, db = base(), ...opts } = {}) => {
  const page = await openApp(url, { user: who, db, factors: [] }, { width: 1280, height: 900, ...opts, init: [setup] });
  await page.locator('button:visible', { hasText: 'Today' }).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(900);
  return page;
};
const toManage = async page => {
  await page.locator('button:visible', { hasText: 'Team & admin' }).first().click();
  await page.waitForTimeout(600);
  const direct = page.locator('button:visible', { hasText: 'Manage Team' });
  if (!(await direct.count())) { await page.getByRole('button', { name: /^More/ }).first().click(); await page.waitForTimeout(300); }
  await page.locator('button:visible, [role=menuitem]:visible', { hasText: 'Manage Team' }).first().click();
  await page.waitForSelector('.tr-manage-table');
  await page.waitForTimeout(500);
};
const row = (page, name) => page.locator('.tr-manage-table tbody tr', { has: page.locator('.tr-mt-name-btn', { hasText: name }) });
const rpcCalls = (page, name) => page.evaluate(n => window.__PL.calls.filter(c => c.rpc === n).map(c => c.args), name);
const errs = page => page.errors.filter(e => !/not mocked|ERR_|Could not find the function|does not exist/.test(e));
const sheet = page => page.locator('.tr-edit-person');

try {
  // ---- super admin: the list
  let page = await open(MORGAN);
  await toManage(page);
  ok(await page.locator('.tr-manage-table thead').innerText().then(t => /Comp level/.test(t) && !/Tier/.test(t)), 'the column says Comp level, not Tier');
  ok(await page.locator('.tr-manage-table tbody select').count() === 0, 'no dropdowns in the list: nothing saves by accident');
  ok(/\(214\) 555-0187/.test(await row(page, 'Dynamite').innerText()), "Riley's phone shows in the list");
  ok(await row(page, 'Riley').locator('a[href="tel:2145550187"]').count() === 1, 'the phone is a call link');
  ok(/No phone yet/.test(await row(page, 'Jordan Ellis').innerText()), 'Jordan has no phone yet');
  await shot(page, `${SHOTS}/01-list.png`);

  // ---- the activity log, from the top
  await page.getByRole('button', { name: 'Activity log' }).click();
  await page.waitForSelector('.tr-mt-log .tr-audit-row');
  const logText = await page.locator('.tr-mt-log').innerText();
  ok(/Pam Admin changed comp level — Jordan Ellis \(UA → SA\)/.test(logText), 'the log is at the top, and old tier entries read as comp level');
  await shot(page, `${SHOTS}/02-log.png`);
  await page.getByRole('button', { name: 'Close the activity log' }).click();

  // ---- one person: comp level needs a reason
  await page.getByRole('button', { name: 'Edit Jordan Ellis' }).click();
  await page.waitForSelector('#tr-edit-person-title');
  ok(await page.getByRole('button', { name: 'Save changes' }).isDisabled(), 'Save is off until something changes');
  ok(/UA → SA/.test(await sheet(page).locator('.tr-ep-history').innerText()), "the window shows Jordan's recent changes");
  await sheet(page).getByLabel('Comp level').selectOption('FA');
  ok(/Comp level: UA → FA/.test(await sheet(page).locator('.tr-ep-changes').innerText()), 'it says what will change');
  ok(/Reason for the change/.test(await sheet(page).locator('.tr-ep-changes').innerText()), 'and asks for a reason');
  await shot(page, `${SHOTS}/03-edit-level.png`);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.waitForTimeout(300);
  ok(/Add a reason/.test(await sheet(page).innerText()), 'no reason: not saved');
  ok((await rpcCalls(page, 'pl_admin_save_person')).length === 0, 'nothing was sent');
  await sheet(page).getByLabel('Reason for the change').fill('Got licensed and contracted');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.waitForSelector('.tr-edit-person', { state: 'detached' });
  let calls = await rpcCalls(page, 'pl_admin_save_person');
  ok(calls.length === 1 && JSON.stringify(calls[0].p_changes) === '{"hierarchy_tier":"FA"}' && calls[0].p_reason === 'Got licensed and contracted', 'sends only the level, with the reason');
  ok(/Saved Jordan Ellis: comp level UA → FA/.test(await page.locator('.tr-ph-saved').innerText()), 'says it saved');
  ok(/FA/.test(await row(page, 'Jordan Ellis').locator('.tr-mt-tier').innerText()), 'the list shows FA');
  await shot(page, `${SHOTS}/04-saved.png`);

  // ---- name and phone: no reason needed
  await page.getByRole('button', { name: /Edit Riley/ }).click();
  await page.waitForSelector('#tr-edit-person-title');
  await sheet(page).getByLabel('Name').fill('Riley Park');
  await sheet(page).getByLabel('Phone').fill('214 555 01');
  ok(/Enter 10 digits/.test(await sheet(page).innerText()), 'a half-typed phone says so');
  await sheet(page).getByLabel('Phone').fill('214-555-0100');
  const ch = await sheet(page).locator('.tr-ep-changes').innerText();
  ok(/Name: Riley "Dynamite" Park → Riley Park/.test(ch) && /Phone: \(214\) 555-0187 → \(214\) 555-0100/.test(ch) && /Reason \(optional\)/.test(ch), 'name + phone, reason optional');
  await shot(page, `${SHOTS}/05-edit-name-phone.png`);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.waitForSelector('.tr-edit-person', { state: 'detached' });
  calls = await rpcCalls(page, 'pl_admin_save_person');
  ok(JSON.stringify(calls[1].p_changes) === '{"display_name":"Riley Park","phone":"2145550100"}', 'sends the tidy name and the digits');
  ok(await row(page, 'Riley Park').locator('a[href="tel:2145550100"]').count() === 1 && await row(page, 'Dynamite').count() === 0, 'the list shows the new name and number');

  // ---- closing with changes asks first
  await page.getByRole('button', { name: 'Edit Dana Brooks' }).click();
  await page.waitForSelector('#tr-edit-person-title');
  await sheet(page).getByLabel('Role').selectOption('advisor');
  await sheet(page).getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(300);
  ok(await page.getByText('Discard your changes?').count() === 1, 'Cancel with changes asks before throwing them away');
  await page.getByRole('button', { name: 'Discard' }).click();
  await page.waitForTimeout(300);
  ok(await sheet(page).count() === 0 && (await rpcCalls(page, 'pl_admin_save_person')).length === 2, 'discarded, nothing saved');
  ok(/Manager/.test(await row(page, 'Dana Brooks').locator('.tr-mt-role').innerText()), 'Dana is still a Manager');

  // ---- search by phone
  await page.getByPlaceholder(/name, email or phone/).fill('555-0100');
  await page.waitForTimeout(300);
  ok(await page.locator('.tr-manage-table tbody tr').count() === 1 && await row(page, 'Riley Park').count() === 1, 'search finds Riley by phone number');
  await page.getByPlaceholder(/name, email or phone/).fill('');

  // ---- the log has the reasons
  await page.getByRole('button', { name: 'Activity log' }).click();
  await page.waitForSelector('.tr-mt-log .tr-audit-row');
  const log2 = await page.locator('.tr-mt-log').innerText();
  ok(/Morgan Lee changed comp level — Jordan Ellis \(UA → FA\)\s*“Got licensed and contracted”/.test(log2), 'the log shows the change and the reason');
  ok(/changed name — Riley Park/.test(log2), 'and the name change');
  await shot(page, `${SHOTS}/06-log-after.png`);
  ok(errs(page).length === 0, 'no errors ' + errs(page).join(' | '));
  await page.context().close();

  // ---- phone
  page = await open(MORGAN, { width: 390, height: 844, mobile: true });
  await toManage(page);
  await shot(page, `${SHOTS}/07-phone-list.png`, { fullPage: true });
  ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390, 'phone: no sideways scroll on the list');
  await page.getByRole('button', { name: 'Edit Jordan Ellis' }).click();
  await page.waitForSelector('#tr-edit-person-title');
  await sheet(page).getByLabel('Comp level').selectOption('SA');
  await shot(page, `${SHOTS}/08-phone-edit.png`);
  ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390, 'phone: no sideways scroll in the window');
  await page.context().close();

  // ---- an agent adds their own phone from Today
  page = await open(JORDAN);
  const nudge = page.locator('text=Add your phone number');
  ok(await nudge.count() >= 1, 'Today asks Jordan for a phone number');
  await page.locator('li.tr-task', { hasText: 'Add your phone number' }).getByRole('button', { name: 'Add' }).click();
  await page.waitForSelector('#tr-account-title');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => document.activeElement && document.activeElement.type === 'tel'), 'Your account opens on the phone field');
  await shot(page, `${SHOTS}/09-your-account.png`);
  await page.keyboard.type('(469) 555-0142');
  await page.locator('.tr-account').getByRole('button', { name: 'Save changes' }).click();
  await page.waitForTimeout(600);
  const mine = await rpcCalls(page, 'set_my_phone');
  ok(mine.length === 1 && mine[0].p_phone === '4695550142', 'saves the digits');
  ok(await page.locator('.tr-account .tr-profile-saved').count() === 1, 'says Saved');
  await page.locator('.tr-account').getByRole('button', { name: 'Close' }).click();
  await page.waitForTimeout(400);
  ok(await page.locator('text=Add your phone number').count() === 0, 'the nudge goes away');
  ok(errs(page).length === 0, 'no errors ' + errs(page).join(' | '));
  await page.context().close();

  // ---- before the database update
  page = await open(MORGAN, { setup: BEFORE });
  await toManage(page);
  ok(await page.locator('.tr-mt-phone').count() === 0, 'before the update: no phone line');
  await page.getByRole('button', { name: 'Edit Jordan Ellis' }).click();
  await page.waitForSelector('#tr-edit-person-title');
  ok(await sheet(page).getByLabel('Phone').count() === 0, 'no phone field');
  await sheet(page).getByLabel('Comp level').selectOption('FA');
  await sheet(page).getByLabel('Reason for the change').fill('Licensed');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.waitForTimeout(400);
  ok(/needs the database update/.test(await sheet(page).innerText()), 'saving says the database update is needed');
  await shot(page, `${SHOTS}/10-before-update.png`);
  await page.context().close();
  page = await open(JORDAN, { setup: BEFORE });
  ok(await page.locator('text=Add your phone number').count() === 0, 'before the update: no phone nudge');
  await page.context().close();
} catch (e) {
  failures++;
  console.log('CRASH', e.message.split('\n').slice(0, 4).join(' / '));
}
await closeBrowser();
srv.close();
console.log(failures ? `${failures} FAILED` : 'ALL MANAGE TEAM FLOWS PASSED');
process.exit(failures ? 1 : 0);
