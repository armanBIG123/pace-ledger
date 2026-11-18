// Activity tools (Manage Team): Big Huge Business uses PaceLedger for
// contracting, so its people start without the activity side (Today,
// Clients, Calendar, Growth, Team views) and see only Contracting,
// Resources and Chat, until a super admin turns the tools on for them.
// Usage: node tests/flows/activity-tools.mjs (after tests/tools/build-app.mjs; npm test runs it all)
import fs from 'node:fs';
import path from 'node:path';
import { serve, openApp, shot, closeBrowser, OUT, APP } from '../tools/browser.mjs';
const [dist = APP, shotsArg] = process.argv.slice(2);
const SHOTS = shotsArg || path.join(OUT, 'shots/activity-tools');
fs.rmSync(SHOTS, { recursive: true, force: true });
const { srv, url } = await serve(dist);
let failures = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { failures++; console.log('FAIL', m); } };

const MORGAN = { id: '11111111-1111-1111-1111-111111111111', email: 'morgan@example.com' };
const JORDAN = { id: '22222222-2222-2222-2222-222222222222', email: 'jordan@example.com' };
const ZOE = { id: '55555555-5555-5555-5555-555555555555', email: 'zoe@example.com' };
const KAI = { id: '66666666-6666-6666-6666-666666666666', email: 'kai@example.com' };
const LEE = { id: '77777777-7777-7777-7777-777777777777', email: 'lee@example.com' };
const base = () => ({
  solar_systems: [
    { id: 's-big', short_name: 'BIG', name: 'Big Insurance Network', activity_tools_default: true },
    { id: 's-bhb', short_name: 'BHB', name: 'Big Huge Business', activity_tools_default: false },
  ],
  profiles: [
    { id: MORGAN.id, display_name: 'Morgan Lee', role: 'super_admin', solar_system_id: 's-big', created_at: '2025-06-01T00:00:00Z', hierarchy_tier: 'EVC', activity_tools: null },
    { id: JORDAN.id, display_name: 'Jordan Ellis', role: 'advisor', solar_system_id: 's-big', manager_id: MORGAN.id, created_at: '2026-06-20T00:00:00Z', hierarchy_tier: 'SA', activity_tools: null },
    { id: ZOE.id, display_name: 'Zoe Grant', role: 'super_manager', solar_system_id: 's-bhb', manager_id: null, created_at: '2026-10-26T00:00:00Z', hierarchy_tier: 'FD', activity_tools: null },
    { id: KAI.id, display_name: 'Kai Moreno', role: 'manager', solar_system_id: 's-bhb', manager_id: ZOE.id, created_at: '2026-10-28T00:00:00Z', hierarchy_tier: 'SA', activity_tools: null },
    { id: LEE.id, display_name: 'Lee Tran', role: 'advisor', solar_system_id: 's-bhb', manager_id: KAI.id, created_at: '2026-11-02T00:00:00Z', hierarchy_tier: 'UA', activity_tools: null },
  ],
  org_directory: [],
  audit_log: [],
  person_contacts: [],
  documents: [{ id: 'd1', title: 'Producer agreement guide', file_path: 'BHB/a.pdf', file_size: 240000, file_type: 'pdf', uploaded_by: ZOE.id, uploaded_by_name: 'Zoe Grant', created_at: '2026-11-01T15:00:00Z' }],
  important_links: [],
  announcements: [{ id: 'an-1', title: 'Contracting week', body: 'Send your contracting form by Friday.', created_at: '2026-11-17T15:00:00Z', created_by: ZOE.id, created_by_name: 'Zoe Grant',
    starts_at: '2026-11-17T15:00:00Z', ends_at: '2099-01-01T00:00:00Z', ended_at: null, must_confirm: false }],
});
// pl_admin_save_person, like the migration: only super admins flip activity tools.
const SETUP = `window.__PL_SETUP = function (PL) {
  PL.rpc.pl_admin_save_person = a => {
    const me = PL.db.profiles.find(p => p.id === PL.user.id);
    if (!me || !['super_admin', 'super_manager'].includes(me.role)) throw new Error('not_allowed');
    const p = PL.db.profiles.find(x => x.id === a.p_user);
    const c = a.p_changes || {};
    PL.saves = (PL.saves || []).concat([c]);
    if ('activity_tools' in c) {
      if (typeof c.activity_tools !== 'boolean' && c.activity_tools !== null) throw new Error('bad_activity_tools');
      if (c.activity_tools !== p.activity_tools && me.role !== 'super_admin') throw new Error('not_allowed_tools');
      if (c.activity_tools !== p.activity_tools) PL.db.audit_log.push({ id: 'l' + Math.random(), actor_id: me.id, actor_name: me.display_name,
        action: c.activity_tools ? 'Turned on activity tools' : 'Turned off activity tools', target_name: p.display_name, target_id: p.id, details: null, reason: a.p_reason || null, created_at: new Date().toISOString() });
      p.activity_tools = c.activity_tools;
    }
    return { ...p, phone: null };
  };
};`;
const open = async (who, db = base(), opts = {}) => openApp(url, { user: who, db, factors: [] }, { width: 1280, height: 900, init: [SETUP], ...opts });
const navText = page => page.locator('header').innerText();

try {
  // ---- 1. A BHB advisor: Contracting, Resources and Chat only ----
  let page = await open(LEE);
  await page.locator('.tr-my-contracting').waitFor({ timeout: 15000 });
  const nav = await navText(page);
  ok(/Contracting/.test(nav) && /Resources/.test(nav), 'tabs: Contracting and Resources');
  ok(!/\bToday\b|\bClients\b|\bCalendar\b|\bGrowth\b/.test(nav), 'no Today, Clients, Calendar or Growth: ' + nav.replace(/\s+/g, ' '));
  ok(await page.locator('header input[type=search], header .tr-search').count() === 0, 'no search box');
  ok(new URL(page.url()).pathname === '/contracting', 'opens on /contracting');
  const body = await page.locator('.tr-my-contracting').innerText();
  ok(/Contract(ing)? week/.test(body), 'MegaPhone announcements show on Contracting');
  ok(/NPN|license|Licensing/i.test(body), 'their licensing and contracting steps');
  await shot(page, `${SHOTS}/01-bhb-advisor.png`);
  // + New only invites a recruit
  await page.getByRole('button', { name: /^New$/ }).first().click();
  const menu = await page.locator('.tr-new-menu').innerText();
  ok(/Invite a recruit/.test(menu) && !/Log an appointment|Add a prospect|client intake/.test(menu), '+ New only has Invite a recruit');
  await page.keyboard.press('Escape');
  // the account menu has no Calendar & Zoom
  await page.locator('.tr-header-account').click();
  ok(!/Calendar & Zoom|Schedule availability/.test(await page.locator('#tr-acct-menu').innerText()), 'no Calendar & Zoom in the account menu');
  await page.keyboard.press('Escape');
  // Resources and Chat work
  await page.locator('header button:visible', { hasText: /^Resources$/ }).first().click();
  await page.locator('.tr-docs-tabs').waitFor();
  ok(/Producer agreement guide/.test(await page.locator('.tr-appts-main').innerText()), 'Resources opens');
  await page.getByRole('button', { name: /Chat|Messages/ }).first().click();
  await page.waitForTimeout(800);
  ok(/\/chat/.test(new URL(page.url()).pathname), 'Chat opens');
  ok(errorsOk(page), 'no errors');
  await page.close();
  // an old link to Clients lands on Contracting
  page = await open(LEE, base(), { path: '/clients' });
  await page.locator('.tr-my-contracting').waitFor({ timeout: 15000 });
  ok(new URL(page.url()).pathname === '/contracting', '/clients → /contracting');
  await page.close();
  // phone
  page = await open(LEE, base(), { width: 390, height: 844, mobile: true });
  await page.locator('.tr-my-contracting').waitFor({ timeout: 15000 });
  await shot(page, `${SHOTS}/02-bhb-advisor-phone.png`);
  await page.close();

  // ---- 2. A BHB Super Manager: also Manage Team, can't flip the switch ----
  page = await open(ZOE);
  await page.locator('.tr-my-contracting').waitFor({ timeout: 15000 });
  ok(/Manage Team/.test(await navText(page)) && !/Today/.test(await navText(page)), 'a Super Manager without the tools: Contracting, Resources, Manage Team');
  await page.locator('header button:visible', { hasText: /^Manage Team$/ }).first().click();
  await page.locator('.tr-manage-table').waitFor();
  ok(new URL(page.url()).pathname === '/team/manage', 'at /team/manage');
  const leeRow = page.locator('.tr-manage-table tbody tr', { hasText: 'Lee Tran' });
  ok(/Activity tools off/.test(await leeRow.innerText()), 'the list says Lee has activity tools off');
  await page.getByRole('button', { name: 'Edit Lee Tran' }).click();
  await page.waitForSelector('#tr-edit-person-title');
  const sw = page.getByRole('switch', { name: 'Activity tools' });
  ok(await sw.isDisabled() && !(await sw.isChecked()), 'Super Managers see the switch off, and can’t change it');
  ok(/Only a super admin can change this/.test(await page.locator('.tr-ep-tools').innerText()), 'and are told who can');
  await page.close();

  // ---- 3. A super admin turns Lee's tools on ----
  page = await open(MORGAN);
  await page.locator('button:visible', { hasText: 'Team & admin' }).first().click();
  await page.locator('header button:visible', { hasText: /^Manage Team$/ }).first().click();
  await page.locator('.tr-manage-table').waitFor();
  await page.locator('button:visible', { hasText: /Big Huge Business/ }).first().click();
  await page.waitForTimeout(800);
  ok(await page.locator('.tr-manage-table tbody tr', { hasText: 'Activity tools off' }).count() === 3, 'on the BHB tab all three show tools off');
  await page.getByRole('button', { name: 'Edit Lee Tran' }).click();
  await page.waitForSelector('#tr-edit-person-title');
  const sw2 = page.getByRole('switch', { name: 'Activity tools' });
  ok(!(await sw2.isDisabled()) && !(await sw2.isChecked()), 'a super admin can flip it; it starts off');
  ok(/Off: Lee sees only Contracting, Resources and Chat/.test(await page.locator('.tr-ep-tools').innerText()), 'says what off means');
  await page.locator('.tr-ep-tools .tr-switch').click();   // what a person clicks: the track
  ok(await sw2.isChecked() && /\bOn\b/.test(await page.locator('.tr-ep-tools .tr-switch').innerText()), 'clicking the switch turns it on');
  ok(/Activity tools: Off → On/.test(await page.locator('.tr-ep-changes').innerText()), 'it says what will change');
  ok(await page.getByRole('button', { name: 'Save changes' }).isEnabled(), 'no reason needed');
  await shot(page, `${SHOTS}/03-switch.png`);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.waitForTimeout(600);
  const st = await page.evaluate(() => ({ lee: window.__PL.db.profiles.find(p => p.display_name === 'Lee Tran'), saves: window.__PL.saves, log: window.__PL.db.audit_log }));
  ok(st.lee.activity_tools === true && JSON.stringify(st.saves[0]) === '{"activity_tools":true}', 'saved: activity_tools true, nothing else');
  ok(st.log.some(l => l.action === 'Turned on activity tools' && l.target_name === 'Lee Tran'), 'in the activity log');
  ok(!/Activity tools off/.test(await page.locator('.tr-manage-table tbody tr', { hasText: 'Lee Tran' }).innerText()), 'the list updates');
  const saved = await page.locator('.tr-ph-saved').innerText().catch(() => '');
  ok(/Saved Lee Tran: activity tools Off → On/i.test(saved), 'says it saved: ' + saved);
  // BIG people keep everything; super admins have no switch for themselves
  await page.locator('button:visible', { hasText: /Big Insurance Network/ }).first().click();
  await page.waitForTimeout(800);
  ok(await page.locator('.tr-manage-table tbody tr', { hasText: 'Activity tools off' }).count() === 0, 'nobody in BIG has them off');
  await page.getByRole('button', { name: 'Edit Morgan Lee' }).click();
  await page.waitForSelector('#tr-edit-person-title');
  ok(await page.locator('.tr-ep-tools').count() === 0, 'no switch for a super admin');
  await page.close();

  // ---- 4. Lee with the tools on: the normal app ----
  const on = base();
  on.profiles.find(p => p.id === LEE.id).activity_tools = true;
  page = await open(LEE, on);
  await page.locator('button:visible', { hasText: 'Today' }).first().waitFor({ timeout: 15000 });
  ok(/Clients/.test(await navText(page)) && !/Contracting/.test(await navText(page)), 'turned on: Today, Clients and the rest');
  await page.close();
  // A BIG advisor: unchanged
  page = await open(JORDAN);
  await page.locator('button:visible', { hasText: 'Today' }).first().waitFor({ timeout: 15000 });
  ok(/Clients/.test(await navText(page)), 'a BIG advisor has everything, as before');
  await page.close();
  // before the database update (no columns): everyone keeps everything
  const before = base();
  before.solar_systems.forEach(s => { delete s.activity_tools_default; });
  before.profiles.forEach(p => { delete p.activity_tools; });
  page = await open(LEE, before);
  await page.locator('button:visible', { hasText: 'Today' }).first().waitFor({ timeout: 15000 });
  ok(true, 'before the database update, BHB keeps everything');
  await page.close();
} catch (e) { failures++; console.log('FAIL (crash)', e.stack); }
await closeBrowser(); srv.close();
console.log(failures ? `${failures} FAILED` : 'ALL ACTIVITY TOOLS FLOWS PASSED');
process.exit(failures ? 1 : 0);

function errorsOk(page) {
  const bad = (page.errors || []).filter(e => !/not mocked|Failed to load resource|ERR_/i.test(e));
  if (bad.length) console.log('   errors:', bad.slice(0, 3).join(' | '));
  return !bad.length;
}
