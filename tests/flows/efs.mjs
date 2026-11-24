// Elite Financial Services: a third solar system. Its people start without
// activity tools (Contracting, Resources and Chat), see their own
// organization's name, and get their manager's contracting link instead of
// BIG's producer agreement. Super admins get a tab for it in Manage Team and
// can move people there.
// Usage: node tests/flows/efs.mjs (after tests/tools/build-app.mjs; npm test runs it all)
import fs from 'node:fs';
import path from 'node:path';
import { serve, openApp, shot, closeBrowser, OUT, APP } from '../tools/browser.mjs';
const [dist = APP, shotsArg] = process.argv.slice(2);
const SHOTS = shotsArg || path.join(OUT, 'shots/efs');
fs.rmSync(SHOTS, { recursive: true, force: true });
const { srv, url } = await serve(dist);
let failures = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { failures++; console.log('FAIL', m); } };

const MORGAN = { id: '11111111-1111-1111-1111-111111111111', email: 'morgan@example.com' };
const JORDAN = { id: '22222222-2222-2222-2222-222222222222', email: 'jordan@example.com' };
const LEE = { id: '77777777-7777-7777-7777-777777777777', email: 'lee@example.com' };
const ERIN = { id: 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1', email: 'erin@example.com' };
const ELLIS = { id: 'e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2', email: 'ellis@example.com' };
const base = () => ({
  solar_systems: [
    { id: 's-big', short_name: 'BIG', name: 'Big Insurance Network', email_name: 'Big Insurance Network', activity_tools_default: true, contracting: true },
    { id: 's-bhb', short_name: 'BHB', name: 'Big Huge Business', email_name: 'Big Huge Business', activity_tools_default: false, contracting: true },
    { id: 's-efs', short_name: 'EFS', name: 'Elite Financial Services', email_name: 'Elite Financial Services', activity_tools_default: false, contracting: false },
  ],
  profiles: [
    { id: MORGAN.id, display_name: 'Morgan Lee', role: 'super_admin', solar_system_id: 's-big', created_at: '2025-06-01T00:00:00Z', hierarchy_tier: 'EVC', activity_tools: null },
    { id: JORDAN.id, display_name: 'Jordan Ellis', role: 'advisor', solar_system_id: 's-big', manager_id: MORGAN.id, created_at: '2026-06-20T00:00:00Z', hierarchy_tier: 'SA', activity_tools: null },
    { id: LEE.id, display_name: 'Lee Tran', role: 'advisor', solar_system_id: 's-bhb', manager_id: null, created_at: '2026-11-02T00:00:00Z', hierarchy_tier: 'UA', activity_tools: null, npn: '12345678' },
    { id: ERIN.id, display_name: 'Erin Shaw', role: 'super_manager', solar_system_id: 's-efs', manager_id: null, created_at: '2026-11-24T00:00:00Z', hierarchy_tier: 'FD', activity_tools: null },
    { id: ELLIS.id, display_name: 'Ellis Vaughn', role: 'advisor', solar_system_id: 's-efs', manager_id: ERIN.id, created_at: '2026-11-24T00:00:00Z', hierarchy_tier: 'UA', activity_tools: null, npn: '87654321' },
  ],
  contracting_settings: [{ id: true, enabled: true, paused: false, agreement_version: 'BIG-IAA-2026.1', docuseal_template_id: 12345 }],
  org_directory: [], audit_log: [], person_contacts: [], documents: [], important_links: [], announcements: [], challenges: [],
});
const SETUP = `window.__PL_SETUP = function (PL) {
  PL.rpc.move_to_solar_system = a => { PL.moved = a; const p = PL.db.profiles.find(x => x.id === a.p_person); p.solar_system_id = a.p_system; p.manager_id = null; return null; };
  PL.rpc.challenge_board = () => [];
};`;
const open = (who, db = base(), opts = {}) => openApp(url, { user: who, db, factors: [] }, { width: 1280, height: 900, init: [SETUP], ...opts });
const text = async (page, sel) => (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ');

try {
  // ---- 1. Someone in EFS: Contracting, Resources and Chat; their manager's link, not BIG's agreement ----
  let page = await open(ELLIS);
  await page.locator('.tr-my-contracting').waitFor({ timeout: 15000 });
  const nav = await text(page, 'header');
  ok(/Contracting/.test(nav) && /Resources/.test(nav) && !/\bToday\b|\bClients\b|\bGrowth\b/.test(nav), 'activity tools off: Contracting and Resources');
  const body = await text(page, '.tr-my-contracting');
  ok(/Your licensing and contracting steps, in one place\./.test(body), 'Contracting: their licensing and contracting steps');
  ok(/Get your contracting link from your manager/.test(body) && !/producer agreement/i.test(body), "their manager's contracting link, not BIG's producer agreement: " + body.slice(0, 200));
  await shot(page, `${SHOTS}/01-efs-contracting.png`);
  await page.getByRole('button', { name: /Chat|Messages/ }).first().click();
  await page.getByText('Chat rules').first().waitFor({ timeout: 10000 });
  ok(/Chat is for everyone at Elite Financial Services\./.test(await text(page, '.tr-chat-rules')), 'Chat rules name their organization');
  await page.close();

  // BHB still signs BIG's producer agreement
  page = await open(LEE);
  await page.locator('.tr-my-contracting').waitFor({ timeout: 15000 });
  const bhb = await text(page, '.tr-my-contracting');
  ok(/Your licensing, producer agreement and contracting, in one place\./.test(bhb) && /Sign your producer agreement/.test(bhb), 'BHB: BIG’s producer agreement, as before');
  await page.getByRole('button', { name: /Chat|Messages/ }).first().click();
  await page.getByText('Chat rules').first().waitFor({ timeout: 10000 });
  ok(/Chat is for everyone at Big Huge Business\./.test(await text(page, '.tr-chat-rules')), 'and BHB’s Chat rules say Big Huge Business');
  await page.close();

  // ---- 2. A super admin: a tab for EFS, and moving someone there ----
  page = await open(MORGAN);
  await page.locator('button:visible', { hasText: 'Team & admin' }).first().click();
  await page.locator('header button:visible', { hasText: /^Manage Team$/ }).first().click();
  await page.locator('.tr-manage-table').waitFor();
  ok(await page.locator('button:visible', { hasText: /^Elite Financial Services$/ }).count() === 1, 'Manage Team: a tab for Elite Financial Services');
  await page.locator('button:visible', { hasText: /^Elite Financial Services$/ }).click();
  await page.waitForTimeout(800);
  const rows = await page.locator('.tr-manage-table tbody tr').allInnerTexts();
  ok(rows.length === 2 && rows.every(r => /Activity tools off/.test(r)) && rows.some(r => /Erin Shaw/.test(r)) && rows.some(r => /Ellis Vaughn/.test(r)),
    'its people, with activity tools off');
  ok(await page.getByRole('button', { name: /Invite a Super Manager/ }).count() >= 1, 'and Invite a Super Manager');
  await shot(page, `${SHOTS}/02-manage-efs.png`);
  await page.locator('button:visible', { hasText: /^Big Insurance Network$/ }).click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Move Jordan Ellis to another solar system' }).click();
  const menu = await text(page, '.tr-mt-move-menu');
  ok(/Big Huge Business/.test(menu) && /Elite Financial Services/.test(menu), 'moving someone: pick Big Huge Business or Elite Financial Services');
  await page.locator('.tr-mt-move-menu').getByRole('menuitem', { name: 'Elite Financial Services' }).click();
  await page.getByRole('button', { name: 'Move to EFS' }).click();
  await page.waitForFunction(() => window.__PL.moved);
  ok(await page.evaluate(() => window.__PL.moved.p_system) === 's-efs', 'Jordan moves to Elite Financial Services');
  await page.close();

  // ---- 3. With activity tools on, EFS's own name on a challenge (not BIG's logo) ----
  const on = base();
  on.profiles.find(p => p.id === ELLIS.id).activity_tools = true;
  const now = Date.now();
  on.challenges = [{ id: 'c-efs', title: 'Elite Sprint', tagline: null, metrics: ['appointments'], theme: 'classic', solar_system_id: 's-efs',
    starts_at: new Date(now - 864e5).toISOString(), ends_at: new Date(now + 5 * 864e5).toISOString(), show_until: new Date(now + 12 * 864e5).toISOString() }];
  page = await open(ELLIS, on);
  await page.locator('.tr-chal').waitFor({ timeout: 15000 });
  ok(/Elite Financial Services presents/i.test(await text(page, '.tr-chal-brand')) && await page.locator('.tr-chal-logo').count() === 0, 'a challenge: "Elite Financial Services presents", no BIG logo');
  await page.close();
} catch (e) { failures++; console.log('FAIL (crash)', e.stack); }
await closeBrowser(); srv.close();
console.log(failures ? `${failures} FAILED` : 'ALL EFS FLOWS PASSED');
process.exit(failures ? 1 : 0);
