// The activity-report edge function, bundled for Node with the in-memory
// Supabase stand-in, a fake Resend, and the real database's answers
// (rpt/*.json, made by pl_activity_report in the local test Postgres).
import path from 'node:path';
import fs from 'node:fs';
import { bundleFunction } from '../tools/bundle.mjs';
import { REPO, TESTS, OUT } from '../tools/paths.mjs';
const here = path.dirname(new URL(import.meta.url).pathname);
Object.assign(process.env, { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', RESEND_API_KEY: 're_test', INVITE_FROM_EMAIL: 'PaceLedger <reports@example.com>' });
const R = await bundleFunction('activity-report');
const PL = globalThis.__PL;
const fx = n => JSON.parse(fs.readFileSync(path.join(TESTS, 'fixtures/reports', `${n}.json`), 'utf8'));
const DAY = fx('day'), WEEK = fx('week'), PREV = fx('prev');
let failures = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { failures++; console.log('FAIL', m); } };
const at = iso => new Date(iso);

// ---- when things are due ----
const d1 = R.due(at('2026-11-07T13:07:00Z'), { daily_on: true, weekly_on: true }); // Sat 7:07 AM CST
ok(JSON.stringify(d1) === JSON.stringify([{ kind: 'daily', from: '2026-11-06', to: '2026-11-06' }, { kind: 'weekly', from: '2026-10-31', to: '2026-11-06' }]), 'Saturday 7:07 AM: Friday\'s daily and the Sat–Fri week: ' + JSON.stringify(d1));
ok(R.due(at('2026-11-07T12:07:00Z'), { daily_on: true, weekly_on: true }).length === 0, 'Saturday 6:07 AM Central (after daylight saving ends): nothing yet');
ok(R.due(at('2026-07-11T12:07:00Z'), { daily_on: true, weekly_on: true }).length === 2, 'July Saturday 7:07 AM CDT (12:07 UTC): both');
const sun = R.due(at('2026-11-08T15:07:00Z'), { daily_on: true, weekly_on: true });
ok(sun.length === 1 && sun[0].kind === 'daily' && sun[0].from === '2026-11-07', 'Sunday: only the daily, for Saturday');
ok(R.due(at('2026-11-07T13:07:00Z'), { daily_on: false, weekly_on: true }).map(x => x.kind).join() === 'weekly', 'daily off: only the weekly');
const late = R.due(at('2026-11-08T05:30:00Z'), { daily_on: true, weekly_on: true });
ok(late.length === 2 && late[0].from === '2026-11-06', '11:30 PM Saturday Central (already Sunday in UTC) still goes by the Central day: ' + JSON.stringify(R.central(at('2026-11-08T05:30:00Z'))));
ok(JSON.stringify(R.lastWeek(at('2026-11-06T20:00:00Z'))) === JSON.stringify({ from: '2026-10-24', to: '2026-10-30' }), 'on a Friday, the latest finished week is the one before');
ok(R.range('2026-10-31', '2026-11-06') === 'Oct 31 – Nov 6' && R.range('2026-11-07', '2026-11-13') === 'Nov 7 – 13', 'week labels');

// ---- teams, agents, company from the database's answer ----
const day = R.buildReport(DAY);
const t = n => day.teams.find(x => x.name === n);
ok(day.teams.map(x => `${x.depth}:${x.name}:${x.size}`).join(' | ') === '0:Arman Root:6 | 1:Dana Dyna:3 | 2:Tasha Tee:2 | 1:Pat Pam:2 | 0:Bo Bee:2', 'teams in org-chart order, nested: ' + day.teams.map(x => `${x.depth}:${x.name}:${x.size}`).join(' | '));
ok(JSON.stringify(t('Dana Dyna').nums) === JSON.stringify({ added: 1, set: 1, completed: 1, apps: 1, premium: 1000 }), "Dana's team: the split sale between Tasha and Dana counts once, all the premium: " + JSON.stringify(t('Dana Dyna').nums));
ok(t('Arman Root').nums.apps === 1 && t('Arman Root').nums.premium === 1000 && t('Arman Root').nums.completed === 3, "Arman's team: Lee's 2 completed + Tasha's 1");
ok(t('Bo Bee').nums.apps === 1 && t('Bo Bee').nums.premium === 500, "Bo's team (BHB): Cy's sale");
const ag = n => day.agents.find(x => x.name === n).nums;
ok(ag('Tasha Tee').apps === 1 && ag('Tasha Tee').premium === 600 && ag('Dana Dyna').apps === 1 && ag('Dana Dyna').premium === 400, 'agents: the split sale counts for both, premium shared 60/40');
ok(day.company.apps === 2 && day.company.premium === 1500 && day.notLogged === 1, 'company totals straight from the database');
ok(day.systems.map(s => `${s.id}:${s.nums.apps}:${s.nums.premium}`).join() === 'BHB:1:500,BIG:1:1000', 'two solar systems: totals for each');
// One top person over everyone is the company, not a team.
const solo = R.buildReport({ ...DAY, people: DAY.people.filter(p => p.system === 'BIG') });
ok(solo.teams[0].name === 'Dana Dyna' && solo.teams[0].depth === 0 && solo.systems.length === 0, 'one top person: their team is the company, so it starts one level down, no solar system table');
// A loop in who reports to whom can't hang it.
const loop = R.buildReport({ people: [{ id: 'x', name: 'X', manager_id: 'y' }, { id: 'y', name: 'Y', manager_id: 'x' }], sales: [], company: {} });
ok(Array.isArray(loop.teams), 'a reporting loop does not hang');

// ---- the emails ----
const week = R.buildReport(WEEK), prev = R.buildReport(PREV);
const sentAt = at('2026-11-07T13:07:00Z');
const dm = R.renderEmail({ kind: 'daily', cur: day, prev: null, sentAt });
ok(dm.subject === 'PaceLedger daily · Fri, Nov 6 · 1 set, 4 completed, 2 apps, $1,500', 'daily subject: ' + dm.subject);
ok(/Friday, November 6/.test(dm.html) && /as of Saturday 7:07 AM/.test(dm.html), 'daily title and as-of time');
ok(/1 appointment from Fri doesn’t have an outcome logged yet, so it isn’t in Completed/.test(dm.html), 'not-logged note');
ok(/By solar system/.test(dm.html) && /Big Huge Business/.test(dm.html), 'solar systems shown when there are two');
ok(/Dana Dyna’s team/.test(dm.html) && /↳/.test(dm.html), 'teams with indent');
const dAgents = dm.html.split('By agent')[1];
const rowAt = n => dAgents.indexOf(`<td class="a">${n}<`);
ok(rowAt('Tasha Tee') > 0 && rowAt('Tasha Tee') < rowAt('Cy Sea') && rowAt('Cy Sea') < rowAt('Dana Dyna') && rowAt('Dana Dyna') < rowAt('Lee El') && rowAt('Arman Root') === -1, 'agents: most premium first, nobody without activity: Tasha, Cy, Dana, Lee');
ok(/4 others had none/.test(dm.html), 'and how many had none (Arman, Pat, Marcus, Bo)');
const wm = R.renderEmail({ kind: 'weekly', cur: week, prev, sentAt });
ok(wm.subject === 'PaceLedger weekly · Oct 31 – Nov 6 · 4 set, 6 completed, 3 apps, $1,751 (premium $0 last week)', 'weekly subject: ' + wm.subject);
ok(/This week/.test(wm.html) && /Last week/.test(wm.html) && /compared with the week before \(Oct 24 – 30\)/.test(wm.html), 'weekly compares with Oct 24 – 30');
ok(/▲ \+3<\/b>/.test(wm.html) && /▼ −4<\/b>/.test(wm.html) && /−50%/.test(wm.html), 'company changes with arrows: apps ▲ +3, set ▼ −4 (−50%)');
ok(/Marcus Em/.test(wm.html.split('By agent')[1]), 'Marcus is listed (activity this week)');
ok(/Week of Oct 31 – Nov 6/.test(wm.text) && /Appointments set: 4 \(last week 8, −4\)/.test(wm.text) && /Cy Sea: .*1 app \(\+1\)/.test(wm.text), 'plain-text version has the comparison and says "1 app"');
// Names are escaped.
const evil = R.buildReport({ ...DAY, people: DAY.people.map(p => (p.name === 'Tasha Tee' ? { ...p, name: 'Tasha "T" <b>x</b>' } : p)) });
const em = R.renderEmail({ kind: 'daily', cur: evil, prev: null, sentAt });
ok(!/<b>x<\/b>/.test(em.html) && /Tasha &quot;T&quot; &lt;b&gt;x&lt;\/b&gt;/.test(em.html), 'names are escaped in the email');
// Size: 200 people with activity stays well under Gmail's 102 KB clip.
const many = { from: '2026-11-06', to: '2026-11-06', company: { set: 400 }, sales: [], people: Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, name: `Person Number ${i}`, manager_id: i < 10 ? null : `p${i % 10}`, added: 1, set: 2, completed: 1 })) };
const big = R.renderEmail({ kind: 'weekly', cur: R.buildReport(many), prev: R.buildReport(many), sentAt });
ok(Buffer.byteLength(big.html) < 95000 && /And 50 more people/.test(big.html), `200 active people, weekly: ${Math.round(Buffer.byteLength(big.html) / 1024)} KB, first 150 listed`);
const pc = R.renderEmail({ kind: 'weekly', cur: R.buildReport({ ...WEEK }), prev: R.buildReport({ ...WEEK, company: { ...WEEK.company, premium: 1500 } }), sentAt });
ok(/\(premium ▲ 17% vs last week\)$/.test(pc.subject), 'subject with a percent when last week had premium: ' + pc.subject);
fs.mkdirSync(path.join(OUT, 'report-emails'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'report-emails', 'daily.html'), dm.html);
fs.writeFileSync(path.join(OUT, 'report-emails', 'weekly.html'), wm.html);

// ---- sending: once per period, retries, test emails ----
const emails = [];
let resendStatus = 200;
globalThis.fetch = async (url, init = {}) => {
  if (String(url).startsWith('https://api.resend.com/')) {
    if (resendStatus !== 200) return new Response('{"message":"nope"}', { status: resendStatus });
    emails.push(JSON.parse(init.body)); return new Response('{"id":"em_1"}', { status: 200 });
  }
  return new Response('{}', { status: 404 });
};
const ADMIN = { id: 'a0000000-0000-0000-0000-000000000001', email: 'arman@example.com' };
const ADVISOR = { id: 'a0000000-0000-0000-0000-000000000004', email: 'tasha@example.com' };
PL.db = {
  report_settings: [{ id: true, recipients: ['agency@example.com', 'arman@example.com', 'dynamite@example.com'], daily_on: true, weekly_on: true }],
  report_sends: [], report_cron: [{ id: true, token: 'tok_' + 'x'.repeat(60) }],
  profiles: [{ id: ADMIN.id, role: 'super_admin', email: ADMIN.email, display_name: 'Arman Root' }, { id: ADVISOR.id, role: 'advisor', email: ADVISOR.email, display_name: 'Tasha Tee' }],
};
PL.rpc.pl_activity_report = ({ p_from, p_to }) => (p_from === '2026-10-31' ? WEEK : p_from === '2026-10-24' ? PREV : p_from === '2026-11-06' && p_to === '2026-11-06' ? DAY : { ...DAY, from: p_from, to: p_to });
// The database's "once per period" rule.
PL.tableHooks = { report_sends: q => {
  if (q.op !== 'insert') return null;
  const r = q.payload[0];
  if (!r.test && PL.db.report_sends.some(x => !x.test && x.kind === r.kind && x.period_start === r.period_start)) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "report_sends_once"' } };
  if (r.test === undefined) r.test = false;
  return null;
} };
const handleCall = async (body, { token, user } = {}) => {
  PL.user = user || null;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-report-token'] = token;
  if (user) headers.Authorization = 'Bearer jwt';
  const res = await R.handle(new Request('https://proj.supabase.co/functions/v1/activity-report', { method: 'POST', headers, body: JSON.stringify(body) }));
  return { status: res.status, data: await res.json() };
};

try {
  const sat = at('2026-11-07T13:07:00Z');
  let r = await R.runDue(PL.__admin || (await import(path.join(TESTS, 'mock/supabase.js'))).createClient(), sat);
  ok(r.ran.length === 2 && r.ran.every(x => x.sent) && emails.length === 2, 'Saturday 7 AM: daily and weekly sent: ' + JSON.stringify(r.ran.map(x => x.subject)));
  ok(emails.every(e => e.to.join() === 'agency@example.com,arman@example.com,dynamite@example.com' && e.from === 'PaceLedger <reports@example.com>'), 'to all three, from PaceLedger');
  ok(PL.db.report_sends.filter(x => x.status === 'sent').length === 2, 'both recorded as sent');
  const admin = (await import(path.join(TESTS, 'mock/supabase.js'))).createClient();
  r = await R.runDue(admin, at('2026-11-07T14:07:00Z'));
  ok(r.ran.every(x => x.skipped === 'already_sent') && emails.length === 2, 'the 8 AM run sends nothing again');
  // Resend fails: nothing recorded, the error shows, the next hour tries again.
  resendStatus = 500;
  r = await R.runDue(admin, at('2026-11-08T13:07:00Z'));
  ok(r.ran.length === 1 && r.ran[0].sent === false && !PL.db.report_sends.some(x => x.period_start === '2026-11-07'), "Sunday's daily fails: no record kept");
  ok(/daily report for 2026-11-07/.test(PL.db.report_settings[0].last_error || ''), 'the error is saved for the settings card: ' + PL.db.report_settings[0].last_error);
  resendStatus = 200;
  r = await R.runDue(admin, at('2026-11-08T14:07:00Z'));
  ok(r.ran[0].sent === true && PL.db.report_settings[0].last_error === null, 'the next hour sends it and clears the error');
  // An earlier try that stopped partway.
  PL.db.report_sends.push({ id: 'stuck', kind: 'daily', period_start: '2026-11-08', period_end: '2026-11-08', test: false, status: 'sending', created_at: '2026-11-09T13:07:00Z' });
  r = await R.runDue(admin, at('2026-11-09T13:20:00Z'));
  ok(r.ran[0].skipped === 'sending', 'a send in progress (13 minutes) is left alone');
  r = await R.runDue(admin, at('2026-11-09T14:07:00Z'));
  ok(r.ran[0].sent === true && !PL.db.report_sends.some(x => x.id === 'stuck'), 'one stuck for an hour is taken over and sent');
  // No one on the list.
  PL.db.report_settings[0].recipients = [];
  r = await R.runDue(admin, at('2026-11-10T13:07:00Z'));
  ok(r.ran[0].skipped === 'no_recipients' && !PL.db.report_sends.some(x => x.period_start === '2026-11-09'), 'nobody on the list: nothing sent, nothing recorded');
  PL.db.report_settings[0].recipients = ['agency@example.com'];

  // ---- the hourly call ----
  r = await handleCall({ action: 'run' }, { token: 'wrong' });
  ok(r.status === 401 && r.data.error === 'bad_token', 'wrong schedule key is refused');
  r = await handleCall({ action: 'run' }, { token: 'tok_' + 'x'.repeat(60) });
  ok(r.status === 200 && Array.isArray(r.data.ran), 'the right key runs what is due now: ' + JSON.stringify(r.data.central));
  r = await handleCall({ action: 'run' });
  ok(r.status === 401, 'no key and no sign-in is refused');

  // ---- super admins: preview and test ----
  r = await handleCall({ action: 'preview', kind: 'weekly' }, { user: ADVISOR });
  ok(r.status === 403, 'an advisor cannot preview');
  r = await handleCall({ action: 'preview', kind: 'weekly' }, { user: ADMIN });
  ok(r.status === 200 && r.data.ok && /PaceLedger weekly/.test(r.data.subject) && /<html/.test(r.data.html), 'a super admin previews the weekly: ' + r.data.subject);
  const before = emails.length;
  r = await handleCall({ action: 'send-test', kind: 'daily' }, { user: ADMIN });
  const last = emails[emails.length - 1];
  ok(r.data.ok && emails.length === before + 1 && last.to.join() === ADMIN.email && /^\[Test\] PaceLedger daily/.test(last.subject), 'a test goes only to them, marked [Test]');
  ok(PL.db.report_sends.some(x => x.test && x.sent_by === ADMIN.id), 'the test is recorded as a test');
  for (let i = 0; i < 9; i++) await handleCall({ action: 'send-test', kind: 'daily' }, { user: ADMIN });
  r = await handleCall({ action: 'send-test', kind: 'daily' }, { user: ADMIN });
  ok(r.data.ok === false && r.data.error === 'daily_limit', '10 tests a day at most');
  r = await handleCall({ action: 'nope' }, { user: ADMIN });
  ok(r.status === 400, 'unknown action');
} catch (e) { failures++; console.log('FAIL (crash)', e.stack); }
console.log(failures ? `${failures} FAILED` : 'ALL REPORT TESTS PASSED');
process.exit(failures ? 1 : 0);
