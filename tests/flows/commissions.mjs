// Growth → Commissions: an agent's pay, a manager's team, and a super
// admin's setup, from Minkoo's sample (codes and clients faked).
// Usage: node tests/flows/commissions.mjs (after tests/tools/build-app.mjs; npm test runs it all)
import fs from 'node:fs';
import path from 'node:path';
import { serve, openApp, shot, closeBrowser, HERE, OUT, APP } from '../tools/browser.mjs';
const [dist = APP, shotsArg] = process.argv.slice(2);
const SHOTS = shotsArg || path.join(OUT, 'shots/commissions');
fs.rmSync(SHOTS, { recursive: true, force: true });
const { srv, url } = await serve(dist);
let failures = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { failures++; console.log('FAIL', m); } };

const MORGAN = { id: '11111111-1111-1111-1111-111111111111', email: 'morgan@example.com' };
const DANA = { id: '33333333-3333-3333-3333-333333333333', email: 'dana@example.com' };
const JORDAN = { id: '22222222-2222-2222-2222-222222222222', email: 'jordan@example.com' };
const RILEY = { id: '44444444-4444-4444-4444-444444444444', email: 'riley@example.com' };
// Minkoo's sample with fake codes: what pl_commission_ingest would store.
const FIX = path.join(HERE, 'fixtures/commissions');
const calls = [1, 2, 3, 4].map(i => JSON.parse(fs.readFileSync(`${FIX}/call${i}.json`, 'utf8')));
const who = { '90000001': JORDAN.id, '90000002': DANA.id, '90000004': RILEY.id };
const disb = calls.flatMap(c => c.disbursements).map(d => ({ record_id: d.recordId, disbursed_date: d.disbursedDate, agent_code: d.agentCode, user_id: who[d.agentCode] || null,
  amount: Number(d.amountOriginal), ledger_count: d.ledgerCount, status: d.status }));
const lines = calls.flatMap(c => c.ledgers).map(l => {
  const ev = l.recordId.replace(/~[^~]*$/, '');
  const d = disb.find(x => x.record_id === l.disbursementRecordId);
  return { record_id: l.recordId, event_id: ev, level: l.commissionLevel, disbursement_record_id: l.disbursementRecordId || null, paid_on: d ? d.disbursed_date : null,
    agent_code: l.agentCode, user_id: who[l.agentCode] || null, amount: Number(l.amount), rate: l.rate, type: l.type, carrier: l.carrier,
    policy_number: l.policyNumber, insured_name: l.insuredName, status: l.status, first_seen_at: '2026-10-14T12:00:00Z' };
});
lines.forEach(l => { const a = lines.find(x => x.event_id === l.event_id && x.level === 'A'); l.writer_code = a.agent_code; l.writer_user_id = a.user_id; });
const base = () => ({
  solar_systems: [{ id: 's-big', short_name: 'BIG', name: 'Big Insurance Network' }],
  profiles: [
    { id: MORGAN.id, display_name: 'Morgan Lee', role: 'super_admin', solar_system_id: 's-big', created_at: '2025-06-01T00:00:00Z', hierarchy_tier: 'EVC' },
    { id: DANA.id, display_name: 'Dana Brooks', role: 'manager', solar_system_id: 's-big', manager_id: MORGAN.id, created_at: '2025-08-01T00:00:00Z', hierarchy_tier: 'SFD' },
    { id: JORDAN.id, display_name: 'Jordan Ellis', role: 'advisor', solar_system_id: 's-big', manager_id: DANA.id, created_at: '2026-06-20T00:00:00Z', hierarchy_tier: 'SA' },
    { id: RILEY.id, display_name: 'Riley Park', role: 'advisor', solar_system_id: 's-big', manager_id: DANA.id, created_at: '2026-07-20T00:00:00Z', hierarchy_tier: 'SFD' },
  ],
  org_directory: [{ id: MORGAN.id, display_name: 'Morgan Lee' }, { id: DANA.id, display_name: 'Dana Brooks', manager_id: MORGAN.id },
    { id: JORDAN.id, display_name: 'Jordan Ellis', manager_id: DANA.id }, { id: RILEY.id, display_name: 'Riley Park', manager_id: DANA.id }],
  commission_disbursements: JSON.parse(JSON.stringify(disb)),
  commission_lines: JSON.parse(JSON.stringify(lines)),
  commission_receipts: [
    { id: 4, received_at: '2026-10-14T23:05:00Z', disbursements: 0, lines: 40, new_rows: 40, updated_rows: 0, unchanged_rows: 0, rejected: 0 },
    { id: 3, received_at: '2026-10-14T23:04:40Z', disbursements: 0, lines: 100, new_rows: 98, updated_rows: 0, unchanged_rows: 0, rejected: 2, problems: [{ kind: 'line', recordId: 'X', problem: 'amount is not a number' }] },
  ],
});
// The database functions, like migration-commissions.sql.
const SETUP = `window.__PL_SETUP = function (PL) {
  PL.rpc.pl_commission_totals = ({ p_from, p_to }) => {
    const m = new Map();
    PL.db.commission_lines.forEach(l => {
      const k = l.user_id || 'code:' + l.agent_code;
      if (!m.has(k)) m.set(k, { user_id: l.user_id, agent_code: l.user_id ? null : l.agent_code, paid: 0, coming: 0, chargebacks: 0, lines: 0 });
      const r = m.get(k); r.lines++;
      if (l.paid_on && l.paid_on >= p_from && l.paid_on <= p_to) r.paid += l.amount;
      if (!l.paid_on && l.status !== 'PROCESSED') r.coming += l.amount;
      if (l.amount < 0 && (!l.paid_on || (l.paid_on >= p_from && l.paid_on <= p_to))) r.chargebacks += l.amount;
    });
    return [...m.values()];
  };
  PL.keyMade = null;
  PL.rpc.pl_commission_status = () => ({ hasKey: !!PL.keyMade, keyHint: PL.keyMade ? PL.keyMade.slice(-4) : null, keyMadeAt: PL.keyMade ? new Date().toISOString() : null, keyMadeBy: PL.keyMade ? 'Morgan Lee' : null,
    lastAt: '2026-10-14T23:05:00Z', calls: 4, lines: PL.db.commission_lines.length, unmatched: 1,
    hasTestKey: !!PL.testKeyMade, testKeyHint: PL.testKeyMade ? PL.testKeyMade.slice(-4) : null, testKeyMadeAt: PL.testKeyMade ? new Date().toISOString() : null,
    testLastAt: PL.testKeyMade ? '2026-11-10T21:30:00Z' : null,
    testLastResult: PL.testKeyMade ? { success: true, test: true, saved: false, disbImported: 1, ledgerImported: 16, new: 17, updated: 0, unchanged: 0, rejected: 0 } : null });
  PL.rpc.pl_commission_new_key = () => { PL.keyMade = 'plc_' + 'ab12'.repeat(12); return PL.keyMade; };
  PL.testKeyMade = null;
  PL.rpc.pl_commission_new_test_key = () => { PL.testKeyMade = 'plt_' + 'cd34'.repeat(12); return PL.testKeyMade; };
  PL.rpc.pl_commission_rematch = () => 0;
  PL.rpc.pl_commission_unmatched = () => {
    const m = new Map();
    PL.db.commission_lines.filter(l => !l.user_id && l.agent_code !== 'COMPANY').forEach(l => { const r = m.get(l.agent_code) || { agent_code: l.agent_code, lines: 0, total: 0, last_seen: l.first_seen_at, sample_client: l.insured_name }; r.lines++; r.total += l.amount; m.set(l.agent_code, r); });
    return [...m.values()];
  };
  PL.rpc.pl_commission_link_code = ({ p_code, p_user }) => { let n = 0; PL.db.commission_lines.forEach(l => { if (l.agent_code === p_code) { l.user_id = p_user; n++; } }); return n; };
};`;
const BEFORE = `window.__PL_SETUP = function (PL) {
  PL.tableHooks = { commission_lines: () => ({ data: null, error: { code: '42P01', message: 'relation "public.commission_lines" does not exist' } }),
    commission_disbursements: () => ({ data: null, error: { code: '42P01', message: 'relation "public.commission_disbursements" does not exist' } }) };
};`;
const open = async (who, { setup = SETUP, ...opts } = {}) => {
  const page = await openApp(url, { user: who, db: base(), factors: [] }, { width: 1280, height: 900, ...opts, init: [setup] });
  await page.locator('button:visible', { hasText: 'Today' }).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(900);
  await page.locator('button:visible', { hasText: /^Growth$/ }).first().click();
  await page.waitForTimeout(600);
  await page.locator('button:visible', { hasText: /^Commissions$/ }).first().click();
  await page.waitForTimeout(900);
  return page;
};
const tiles = page => page.locator('.tr-pay-tiles').innerText();
const prevMonth = async page => { await page.getByRole('button', { name: 'Previous month' }).click(); await page.waitForTimeout(500); };
const errs = page => page.errors.filter(e => !/not mocked|ERR_/.test(e));

try {
  // ---- Jordan: his own pay ---------------------------------------------------
  let page = await open(JORDAN);
  ok(/Paid in November\s*\$0\.00/.test(await tiles(page)), 'Jordan, November: nothing paid yet');
  ok(await page.getByRole('button', { name: 'My team' }).count() === 0, 'an advisor has no team view');
  await prevMonth(page);
  ok(/Paid in October\s*\$168\.34/.test(await tiles(page)), 'October: $168.34 paid (his payout)');
  const payout = page.locator('.tr-pay-payout').first();
  ok(/Tue, Oct 13/.test(await payout.innerText()) && /3 lines from 1 client/.test(await payout.innerText()), 'the payout: date, 3 lines, 1 client');
  await payout.locator('.tr-pay-payout-head').click();
  await page.waitForTimeout(300);
  const body = await payout.innerText();
  ok(/A · Unlicensed Associate\s*40%\s*Your sale\s*\$134\.67/.test(body.replace(/\n/g, ' ').replace(/\s+/g, ' ').replace(/(\d%) /, '$1 ')) || (/A · Unlicensed Associate/.test(body) && /40%/.test(body) && /\$134\.67/.test(body) && /Your sale/.test(body)), 'his A line: 40%, $134.67, his sale');
  ok(/SA · /.test(body) && /10%/.test(body) && /FA · /.test(body) && /0%/.test(body), 'and SA 10%, FA 0%');
  ok(!/COMPANY|Generation/.test(body), 'no one else\'s lines, no agency share');
  ok(/Number\d Client/.test(body) && !/CLIENT, /.test(body), 'client name shown as First Last');
  await shot(page, `${SHOTS}/01-agent.png`);
  ok(errs(page).length === 0, 'no errors ' + errs(page).join(' | '));
  await page.context().close();

  // ---- Dana: her pay and her team ---------------------------------------------
  page = await open(DANA);
  await prevMonth(page);
  const dt = await tiles(page);
  ok(/Paid in October\s*\$6,057\.66/.test(dt), 'Dana, October: her two payouts ($4,453.49 + $1,604.17) ' + dt.replace(/\s+/g, ' '));
  ok(await page.locator('.tr-pay-payout').count() === 2, 'two payouts listed');
  await page.getByRole('button', { name: 'My team' }).click();
  await page.waitForTimeout(700);
  const team = await page.locator('.tr-pay-team').innerText();
  ok(/Jordan Ellis\s*\$168\.34/.test(team), 'team: Jordan paid $168.34');
  ok(/Riley Park\s*\$0\.00\s*\$\d/.test(team), 'team: Riley has approved pay coming');
  ok(!/Dana Brooks/.test(team), 'not herself in the team list');
  await shot(page, `${SHOTS}/02-team.png`);
  await page.getByRole('button', { name: 'Riley Park' }).click();
  await page.waitForTimeout(700);
  ok(/Riley Park/.test(await page.locator('.tr-pay h3.tr-h3').innerText()), 'opens Riley');
  const coming = await page.locator('section', { has: page.locator('#pay-coming-h') }).innerText();
  ok(/From Jordan Ellis's sale/.test(coming), 'her overrides say they came from Jordan\'s sale');
  ok(/−\$/.test(coming), 'a chargeback shows as negative');
  await shot(page, `${SHOTS}/03-riley.png`, { fullPage: true });
  ok(errs(page).length === 0, 'no errors ' + errs(page).join(' | '));
  await page.context().close();

  // ---- Morgan: setup ---------------------------------------------------------------
  page = await open(MORGAN);
  await page.getByRole('button', { name: 'Setup' }).click();
  await page.waitForTimeout(800);
  const setup = page.locator('.tr-pay');
  ok(/functions\/v1\/commissions-ingest/.test(await setup.innerText()), 'the address to give Minkoo');
  ok(/No key yet/.test(await setup.innerText()), 'no key yet');
  await setup.getByRole('button', { name: 'Make the key' }).click();
  await page.waitForTimeout(600);
  ok(/shown this once/.test(await setup.innerText()) && /plc_/.test(await setup.innerText()), 'the key, shown once');
  await shot(page, `${SHOTS}/04-setup-key.png`);
  await setup.getByRole('button', { name: "I've sent it, hide it" }).click();
  await page.waitForTimeout(500);
  ok(!/plc_ab12/.test(await setup.innerText()) && /Key ending …ab12/.test(await setup.innerText()), 'hidden after; only the last 4 show');
  // The test address: its own key, nothing saved.
  ok(/functions\/v1\/commissions-ingest-test/.test(await setup.innerText()) && /No test key yet/.test(await setup.innerText()) && /No test sends yet/.test(await setup.innerText()), 'the test address, no test key yet');
  await setup.getByRole('button', { name: 'Make a test key' }).click();
  await page.waitForTimeout(600);
  ok(/test key\. It's shown this once/.test(await setup.innerText()) && /plt_cd34/.test(await setup.innerText()) && /Key ending …ab12/.test(await setup.innerText()), 'the test key shown once; the live key untouched');
  await shot(page, `${SHOTS}/04b-setup-test-key.png`);
  await page.locator('#pay-test-h').locator('xpath=..').getByRole('button', { name: "I've sent it, hide it" }).click();
  await page.waitForTimeout(500);
  ok(!/plt_cd34/.test(await setup.innerText()) && /Test key ending …cd34/.test(await setup.innerText()), 'test key hidden after; only the last 4 show');
  ok(/Last test send/.test(await setup.innerText()) && /17 new/.test(await setup.innerText()) && /Nothing was saved/.test(await setup.innerText()), 'the last test send and what it would have done');
  ok(/90000005/.test(await setup.innerText()) && /5 lines/.test(await setup.innerText()), 'the code that matches no one');
  ok(/Last received/.test(await setup.innerText()) && /COMPANY lines/.test(await setup.innerText()), 'last send and the agency share');
  ok(await page.locator('.tr-pay-log tbody tr').count() === 2, 'the log of sends');
  await page.getByLabel('Who is 90000005?').selectOption({ label: 'Riley Park' });
  await setup.getByRole('button', { name: 'Link' }).click();
  await page.waitForTimeout(700);
  ok(/Everyone's matched/.test(await setup.innerText()), 'linked: everyone matched');
  await shot(page, `${SHOTS}/05-setup.png`, { fullPage: true });
  await page.getByRole('button', { name: 'Everyone' }).click();
  await page.waitForTimeout(600);
  ok(/Dana Brooks/.test(await page.locator('.tr-pay-team').innerText()), 'a super admin sees everyone');
  ok(errs(page).length === 0, 'no errors ' + errs(page).join(' | '));
  await page.context().close();

  // ---- phone ---------------------------------------------------------------------
  page = await open(DANA, { width: 390, height: 844, mobile: true });
  await prevMonth(page);
  await page.locator('.tr-pay-payout-head').first().click();
  await page.waitForTimeout(300);
  await shot(page, `${SHOTS}/06-phone.png`, { fullPage: true });
  ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390, 'phone: no sideways scroll');
  await page.context().close();

  // ---- before the database update ---------------------------------------------
  page = await open(JORDAN, { setup: BEFORE });
  ok(/switched on yet/.test(await page.locator('.tr-pay').innerText()), 'before the update: says it isn\'t on yet');
  await page.context().close();
} catch (e) { failures++; console.log('CRASH', e.message.split('\n').slice(0, 4).join(' / ')); }
await closeBrowser(); srv.close();
console.log(failures ? `${failures} FAILED` : 'ALL COMMISSION FLOWS PASSED');
process.exit(failures ? 1 : 0);
