// Challenges: the banner on Today with the live top 3 (the BIG Bird Blitz
// and any push after it), folding it down, the winners, and a super admin
// starting, changing and removing one.
// Usage: node tests/flows/challenges.mjs (after tests/tools/build-app.mjs; npm test runs it all)
import fs from 'node:fs';
import path from 'node:path';
import { serve, openApp, shot, closeBrowser, OUT, APP } from '../tools/browser.mjs';
const [dist = APP, shotsArg] = process.argv.slice(2);
const SHOTS = shotsArg || path.join(OUT, 'shots/challenges');
fs.rmSync(SHOTS, { recursive: true, force: true });
const { srv, url } = await serve(dist);
let failures = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { failures++; console.log('FAIL', m); } };

const MORGAN = { id: '11111111-1111-1111-1111-111111111111', email: 'morgan@example.com' };
const JORDAN = { id: '22222222-2222-2222-2222-222222222222', email: 'jordan@example.com' };
const P = (id, name, role = 'advisor') => ({ id, display_name: name, role, solar_system_id: 's-big', manager_id: role === 'super_admin' ? null : MORGAN.id, created_at: '2026-06-01T00:00:00Z', hierarchy_tier: 'SA' });
const now = Date.now(), H = 36e5, D = 864e5;
const iso = ms => new Date(ms).toISOString();
const blitz = (over = {}) => ({
  id: 'c1', title: 'BIG Bird Blitz', tagline: 'Close out November strong. Most appointments set and most new recruits win.',
  metrics: ['appointments', 'recruits'], theme: 'thanksgiving', solar_system_id: 's-big',
  starts_at: iso(now - 2 * D), ends_at: iso(now + 5 * D + 3 * H), show_until: iso(now + 12 * D), ...over,
});
const db = (challenges = [blitz()]) => ({
  profiles: [P(MORGAN.id, 'Morgan Lee', 'super_admin'), P(JORDAN.id, 'Jordan Ellis'), P('a2', 'Taylor Reed'), P('a4', 'Avery Cole'), P('a5', 'Riley Park'), P('a6', 'Dana Brooks', 'manager')],
  solar_systems: [{ id: 's-big', short_name: 'BIG', name: 'Big Insurance Network', activity_tools_default: true }],
  challenges, org_directory: [],
});
const R = (metric, place, user_id, display_name, n, people) => ({ metric, place, user_id, display_name, n, people });
const BOARD = [
  R('appointments', 1, 'a2', 'Taylor Reed', 14, 9), R('appointments', 2, JORDAN.id, 'Jordan Ellis', 11, 9), R('appointments', 3, MORGAN.id, 'Morgan Lee', 9, 9),
  R('recruits', 1, 'a6', 'Dana Brooks', 3, 5), R('recruits', 2, 'a4', 'Avery Cole', 2, 5), R('recruits', 3, 'a5', 'Riley Park', 1, 5), R('recruits', 5, JORDAN.id, 'Jordan Ellis', 1, 5),
];
// The board comes from PL.board (a test can change it); save and delete like the database.
const SETUP = `window.__PL_SETUP = function (PL) {
  PL.board = ${JSON.stringify(BOARD)};
  PL.rpc.challenge_board = a => { PL.boardAsked = (PL.boardAsked || 0) + 1; return PL.board; };
};`;
const open = (who, data = db(), opts = {}) => openApp(url, { user: who, db: data, factors: [] }, { width: 1280, height: 900, init: [SETUP], ...opts });
const text = async (page, sel) => (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ');
const waitToday = page => page.locator('button:visible', { hasText: 'Today' }).first().waitFor({ timeout: 15000 });

try {
  // ---- 1. An advisor sees the live board ----
  let page = await open(JORDAN);
  await page.locator('.tr-chal').waitFor({ timeout: 15000 });
  const intro = await text(page, '.tr-chal-intro');
  ok(/BIG Bird Blitz/.test(intro) && /Close out November strong/.test(intro) && /presents/.test(intro), 'the banner: name, line and the BIG logo: ' + intro.slice(0, 80));
  ok(await page.locator('.tr-chal-logo').evaluate(i => i.complete && i.naturalWidth > 0), 'the BIG logo loads');
  ok(await page.locator('.tr-chal-art svg').count() === 1 && await page.locator('.tr-chal-leaf').count() > 3, 'the Thanksgiving art: the turkey and leaves');
  ok(/\b5 days \d+ hrs \d+ min left/i.test(await text(page, '.tr-chal-count')) && /\bLive\b/i.test(intro), 'live, with a countdown: ' + await text(page, '.tr-chal-count'));
  const appts = await text(page, '.tr-chal-board[data-metric="appointments"]');
  ok(/Appointments set/.test(appts) && /9 on the board/.test(appts), 'Appointments set, 9 on the board');
  ok(/1 TR Taylor Reed 14 2 JE Jordan Ellis you 11 3 ML Morgan Lee 9/.test(appts), 'the top 3 in order: ' + appts);
  ok(/You're 2nd\. 4 more to take 1st\./.test(appts), 'where you stand: ' + appts.split('9 ').pop());
  const recs = await text(page, '.tr-chal-board[data-metric="recruits"]');
  ok(/1 DB Dana Brooks 3 2 AC Avery Cole 2 3 RP Riley Park 1/.test(recs) && /You're 5th with 1\. 1 more for the top 3\./.test(recs), 'recruits, and you 5th: ' + recs);
  ok(await page.locator('.tr-chal-row-you').count() === 1, 'your row stands out');
  ok(await page.getByRole('button', { name: 'Edit challenge' }).count() === 0, 'advisors can’t edit it');
  await page.getByRole('button', { name: /^New$/ }).first().click();
  ok(!/Start a challenge/.test(await page.locator('.tr-new-menu').innerText()), 'nor start one from + New');
  await page.keyboard.press('Escape');
  await shot(page, `${SHOTS}/01-live.png`);
  // live: a new number shows without a refresh
  const asked = await page.evaluate(() => window.__PL.boardAsked);
  await page.evaluate(() => {
    window.__PL.board = window.__PL.board.map(r => (r.metric === 'appointments' && r.user_id === '22222222-2222-2222-2222-222222222222' ? { ...r, place: 1, n: 15 } : r.metric === 'appointments' && r.place === 1 ? { ...r, place: 2 } : r));
    window.dispatchEvent(new CustomEvent('paceledger:challenges-changed'));
  });
  await page.waitForFunction(n => window.__PL.boardAsked > n, asked);
  await page.waitForTimeout(300);
  ok(/1 JE Jordan Ellis you 15 2 TR Taylor Reed 14/.test(await text(page, '.tr-chal-board[data-metric="appointments"]')) && /You're in 1st, ahead by 1\./.test(await text(page, '.tr-chal-board[data-metric="appointments"]')), 'the board updates live: you take 1st');
  // fold it down to a bar, and it stays folded
  await page.getByRole('button', { name: 'Fold BIG Bird Blitz down' }).click();
  await page.locator('.tr-chal-slim').waitFor();
  const slim = await text(page, '.tr-chal-slim');
  ok(/BIG Bird Blitz/.test(slim) && /Appointments: 1st · Recruits: 5th/.test(slim) && /5d \d+h left/.test(slim), 'folded: one slim bar with your places: ' + slim);
  await shot(page, `${SHOTS}/02-folded.png`);
  await page.reload();
  await page.locator('.tr-chal-slim').waitFor({ timeout: 15000 });
  ok(true, 'still folded after a reload');
  await page.getByRole('button', { name: 'Show BIG Bird Blitz' }).click();
  await page.locator('.tr-chal-boards').waitFor();
  ok(await page.locator('.tr-chal-slim').count() === 0, 'and opens again');
  await page.close();

  // phone: both boards side by side, short names
  page = await open(JORDAN, db(), { width: 390, height: 844, mobile: true });
  await page.locator('.tr-chal-boards').waitFor({ timeout: 15000 });
  const [b1, b2] = await page.locator('.tr-chal-board').evaluateAll(els => els.map(e => e.getBoundingClientRect()));
  ok(Math.abs(b1.top - b2.top) < 2 && b2.left > b1.right && b2.right <= 390, 'phone: the two boards side by side');
  ok(/Taylor R\./.test(await text(page, '.tr-chal-board[data-metric="appointments"]')), 'phone: short names');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), 'phone: nothing runs off the side');
  await shot(page, `${SHOTS}/03-phone.png`);
  await page.close();

  // ---- 2. The winners, then gone ----
  page = await open(JORDAN, db([blitz({ starts_at: iso(now - 12 * D), ends_at: iso(now - 2 * H), show_until: iso(now + 6 * D) })]));
  await page.locator('.tr-chal-podium').first().waitFor({ timeout: 15000 });
  const won = await text(page, '.tr-chal');
  ok(/That’s a wrap\. Congratulations to our winners!/.test(won) && /Final results/.test(won) && !/\bLive\b/i.test(won) && await page.locator('.tr-chal-count').count() === 0, 'winners: final results, no countdown');
  ok(await page.locator('.tr-chal-step-1 .tr-chal-crown').count() === 2 && /Taylor Reed/.test(await text(page, '.tr-chal-board[data-metric="appointments"] .tr-chal-step-1')), 'a crown for each winner');
  ok(/You finished 2nd with 11\./.test(won) && /You finished 5th with 1\./.test(won), 'how you finished');
  await shot(page, `${SHOTS}/04-winners.png`);
  await page.close();
  page = await open(JORDAN, db([blitz({ starts_at: iso(now - 20 * D), ends_at: iso(now - 9 * D), show_until: iso(now - H) })]));
  await waitToday(page); await page.waitForTimeout(800);
  ok(await page.locator('.tr-chal').count() === 0, 'after the winners week: gone');
  await page.close();
  page = await open(JORDAN, db([blitz({ starts_at: iso(now + 2 * D), ends_at: iso(now + 9 * D), show_until: iso(now + 16 * D) })]));
  await page.locator('.tr-chal-soon').waitFor({ timeout: 15000 });
  ok(/Starts/.test(await text(page, '.tr-chal-when')) && await page.evaluate(() => !window.__PL.boardAsked), 'coming up in 2 days: what counts, no board yet');
  await page.close();
  page = await open(JORDAN, db([]));
  await waitToday(page); await page.waitForTimeout(800);
  ok(await page.locator('.tr-chal').count() === 0, 'no challenge: no banner');
  await page.close();

  // ---- 3. A super admin starts one ----
  page = await open(MORGAN, db([]));
  await waitToday(page);
  await page.getByRole('button', { name: /^New$/ }).first().click();
  await page.locator('.tr-new-menu').getByText('Start a challenge').click();
  await page.locator('#tr-chal-edit-title').waitFor();
  await page.getByRole('button', { name: 'Start challenge' }).click();
  ok(/Give it a name/.test(await text(page, '.tr-chal-editor .tr-error')), 'it needs a name');
  await page.locator('.tr-chal-editor').getByLabel('Name', { exact: true }).fill('December Dash');
  await page.locator('.tr-chal-editor').getByLabel('Line under the name (optional)').fill('Finish the year on pace.');
  await page.getByText('People who sign up with their invite link').click();
  const today = await page.locator('.tr-chal-dates input').first().inputValue();
  const plus = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * D).toISOString().slice(0, 10);
  await page.locator('.tr-chal-dates input').nth(1).fill(plus(today, 6));
  await page.locator('.tr-chal-dates input').nth(2).fill(plus(today, 6));
  await page.getByRole('button', { name: 'Start challenge' }).click();
  ok(/Show the winners until a day after the last day/.test(await text(page, '.tr-chal-editor .tr-error')), 'the winners show after the last day');
  await page.locator('.tr-chal-dates input').nth(2).fill(plus(today, 10));
  await page.getByRole('button', { name: 'Classic' }).click();
  await shot(page, `${SHOTS}/05-start.png`);
  await page.getByRole('button', { name: 'Start challenge' }).click();
  await page.locator('#tr-chal-edit-title').waitFor({ state: 'detached' });
  const made = await page.evaluate(() => window.__PL.db.challenges[0]);
  ok(made && made.title === 'December Dash' && made.tagline === 'Finish the year on pace.' && JSON.stringify(made.metrics) === '["appointments"]' && made.theme === 'classic', 'saved: name, line, appointments only, Classic');
  const ct = d => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(d)).map(p => [p.type, p.value]));
  const s0 = ct(made.starts_at), e0 = ct(made.ends_at);
  ok(`${s0.year}-${s0.month}-${s0.day} ${s0.hour}:${s0.minute}` === `${today} 00:00` && `${e0.year}-${e0.month}-${e0.day} ${e0.hour}:${e0.minute}` === `${plus(today, 7)} 00:00`,
    'from 12:00 AM Central on the first day to the end of the last day');
  await page.locator('.tr-chal-classic').waitFor({ timeout: 15000 });
  ok(/December Dash/.test(await text(page, '.tr-chal')) && await page.locator('.tr-chal-board').count() === 1 && await page.locator('.tr-chal-art svg').count() === 1, 'on Today straight away, in the Classic look');
  await shot(page, `${SHOTS}/06-classic.png`);
  await page.close();

  // ---- 4. A super admin changes and removes one ----
  page = await open(MORGAN);
  await page.locator('.tr-chal').waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Edit challenge' }).click();
  await page.locator('#tr-chal-edit-title').waitFor();
  ok(await page.locator('.tr-chal-editor').getByLabel('Name', { exact: true }).inputValue() === 'BIG Bird Blitz' && await page.getByRole('button', { name: 'Thanksgiving' }).getAttribute('aria-pressed') === 'true', 'edit: what it is now');
  await page.locator('.tr-chal-editor').getByLabel('Line under the name (optional)').fill('Gobble up the leaderboard.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.locator('#tr-chal-edit-title').waitFor({ state: 'detached' });
  ok(await page.evaluate(() => window.__PL.db.challenges[0].tagline) === 'Gobble up the leaderboard.', 'saved');
  await page.locator('.tr-chal-tagline', { hasText: 'Gobble up' }).waitFor({ timeout: 5000 });
  ok(true, 'the banner shows the change');
  await page.getByRole('button', { name: 'Edit challenge' }).click();
  await page.getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('button', { name: 'Remove' }).last().click();
  await page.locator('.tr-chal').waitFor({ state: 'detached', timeout: 5000 });
  ok(await page.evaluate(() => window.__PL.db.challenges.length) === 0, 'removed: off Today');
  await page.close();
} catch (e) { failures++; console.log('FAIL (crash)', e.stack); }
await closeBrowser(); srv.close();
console.log(failures ? `${failures} FAILED` : 'ALL CHALLENGE FLOWS PASSED');
process.exit(failures ? 1 : 0);
