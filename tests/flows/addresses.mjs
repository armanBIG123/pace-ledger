// Every screen has a web address: opening one goes straight there, the
// address follows as you move, Back and Forward work, and an address a
// person can't open falls back to Today.
// Usage: node tests/flows/addresses.mjs (after tests/tools/build-app.mjs; npm test runs it all)
import { serve, openApp, closeBrowser, APP } from '../tools/browser.mjs';
const [dist = APP] = process.argv.slice(2);
const { srv, url } = await serve(dist);
let failures = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { failures++; console.log('FAIL', m); } };

const MORGAN = { id: '11111111-1111-1111-1111-111111111111', email: 'morgan@example.com' };
const DANA = { id: '33333333-3333-3333-3333-333333333333', email: 'dana@example.com' };
const RILEY = { id: '44444444-4444-4444-4444-444444444444', email: 'riley@example.com' };
const db = () => ({
  solar_systems: [{ id: 's-big', short_name: 'BIG', name: 'Big Insurance Network' }],
  profiles: [
    { id: MORGAN.id, display_name: 'Morgan Lee', role: 'super_admin', solar_system_id: 's-big', created_at: '2025-06-01T00:00:00Z', hierarchy_tier: 'EVC' },
    { id: DANA.id, display_name: 'Dana Brooks', role: 'manager', solar_system_id: 's-big', manager_id: MORGAN.id, created_at: '2025-08-01T00:00:00Z', hierarchy_tier: 'FD' },
    { id: RILEY.id, display_name: 'Riley Park', role: 'advisor', solar_system_id: 's-big', manager_id: DANA.id, created_at: '2026-08-20T00:00:00Z', hierarchy_tier: 'SA' },
  ],
  org_directory: [{ id: MORGAN.id, display_name: 'Morgan Lee' }, { id: DANA.id, display_name: 'Dana Brooks', manager_id: MORGAN.id }, { id: RILEY.id, display_name: 'Riley Park', manager_id: DANA.id }],
});
const open = async (who, path, { seedMore = {}, ...opts } = {}) => {
  const page = await openApp(url, { user: who, db: { ...db(), ...seedMore }, factors: [] }, { path, ...opts });
  await page.waitForFunction(() => document.querySelector('#root h2, #root .tr-chat-title, #root .tr-modal'), null, { timeout: 15000 });
  await page.waitForTimeout(900);
  return page;
};
const where = page => page.evaluate(() => window.location.pathname);
const title = (page, t) => page.locator('h2.tr-h2', { hasText: t }).first().isVisible();

try {
  let page = await open(DANA, '/team/pace');
  ok(await where(page) === '/team/pace' && await title(page, 'Team Pace'), '/team/pace opens Team Pace');
  ok(await page.getByRole('tab', { name: 'Team', selected: true }).count() === 1, 'and the Team side is selected');
  await page.locator('button:visible', { hasText: 'Track Production' }).first().click();
  await page.waitForTimeout(500);
  ok(await where(page) === '/team/production' && await title(page, 'Track Production'), 'moving to Track Production changes the address');
  await page.goBack(); await page.waitForTimeout(600);
  ok(await where(page) === '/team/pace' && await title(page, 'Team Pace'), 'Back returns to Team Pace');
  await page.goForward(); await page.waitForTimeout(600);
  ok(await where(page) === '/team/production' && await title(page, 'Track Production'), 'Forward goes to Track Production again');
  await page.getByRole('tab', { name: 'My work' }).click(); await page.waitForTimeout(500);
  ok(await where(page) === '/today', 'My work opens Today at /today');
  await page.locator('button:visible', { hasText: 'Growth' }).first().click(); await page.waitForTimeout(500);
  await page.locator('button:visible', { hasText: 'Commissions' }).first().click(); await page.waitForTimeout(500);
  ok(await where(page) === '/growth/pay', 'Growth → Commissions is /growth/pay');
  await page.reload(); await page.waitForFunction(() => document.querySelector('#root h2')); await page.waitForTimeout(900);
  ok(await where(page) === '/growth/pay' && await page.locator('.tr-sidebar-item-active', { hasText: 'Commissions' }).isVisible(), 'a refresh keeps you on Commissions');
  await page.context().close();

  page = await open(DANA, '/clients/booked');
  ok(await where(page) === '/clients/booked' && await page.locator('h2.tr-h2', { hasText: /Appointments/ }).first().isVisible(), '/clients/booked opens the appointments list');
  await page.context().close();

  page = await open(DANA, '/chat/urgent', { seedMore: { chat_rules: [{ user_id: DANA.id, accepted_at: '2026-09-01T00:00:00Z' }] } });
  ok(await page.locator('.tr-chat-title, h2, h3', { hasText: /Urgent/ }).first().isVisible(), 'with the rules agreed, /chat/urgent opens the Urgent help room');
  await page.context().close();

  page = await open(DANA, '/?chat=urgent', { seedMore: { chat_rules: [{ user_id: DANA.id, accepted_at: '2026-09-01T00:00:00Z' }] } });
  ok(await page.locator('.tr-chat-title, h2, h3', { hasText: /Urgent/ }).first().isVisible(), 'older email links (/?chat=urgent) still open the room');
  ok(await page.evaluate(() => window.location.pathname + window.location.search) === '/chat' && await page.evaluate(() => window.history.length) <= 2, 'and tidy the address without an extra Back step');
  await page.context().close();

  page = await open(DANA, '/chat/urgent');
  ok(await where(page) === '/chat' && await page.getByText('Chat rules').first().isVisible(), '/chat/urgent opens Chat (rules first for someone new)');
  await page.context().close();

  page = await open(DANA, '/');
  ok(await where(page) === '/today', 'the root address becomes /today');
  ok(await page.evaluate(() => window.history.length) <= 2, 'without adding extra Back steps');
  await page.context().close();

  page = await open(RILEY, '/team/pace');
  ok(await where(page) === '/today' && await page.locator('h2.tr-h2', { hasText: /Good (morning|afternoon|evening)/ }).isVisible(), "an advisor without a team who opens /team/pace gets Today");
  await page.context().close();

  page = await open(DANA, '/team/manage');
  ok(await where(page) === '/today', "a manager can't open Manage Team by address");
  await page.context().close();

  page = await open(MORGAN, '/team/manage');
  ok(await where(page) === '/team/manage' && await title(page, 'Manage Team'), 'a super admin can');
  await page.context().close();

  page = await open(DANA, '/team/org', { width: 390, height: 844, mobile: true });
  ok(await where(page) === '/team/org' && await title(page, 'Org Chart'), 'addresses work on a phone too');
  await page.context().close();
} catch (e) { failures++; console.log('FAIL (crash)', e.stack); }
await closeBrowser(); srv.close();
console.log(failures ? `${failures} FAILED` : 'ALL ADDRESS CHECKS PASSED');
process.exit(failures ? 1 : 0);
