// Edge Function: activity-report
// Emails the daily and weekly activity reports (migration-activity-reports.sql).
//
//   Daily    every morning at 7 AM Central: yesterday.
//   Weekly   Saturdays at 7 AM Central: Saturday to Friday just finished,
//            compared with the week before.
//
// Each has company totals, each leader's team (them and everyone under
// them) and each agent with activity: team members added, appointments
// set, appointments completed, applications submitted and total target
// premium. The numbers come from pl_activity_report in the database.
//
// Who calls it:
//   * The database, once an hour (pg_cron), with the x-report-token header.
//     Whatever is due and not sent yet goes out; nothing is sent twice.
//   * A super admin in PaceLedger (Team overview, Email reports):
//       { action: 'preview', kind: 'daily' | 'weekly' }   the latest one, not sent
//       { action: 'send-test', kind }                     the latest one, to them only
//
// Secrets (already set for the other emails): RESEND_API_KEY,
// INVITE_FROM_EMAIL, APP_URL (optional).
//
// Deploy with "Verify JWT" turned OFF: the hourly call sends the
// x-report-token, not a PaceLedger sign-in. Sign-ins are checked here.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const env = (k: string, d = ''): string => {
  try { return (typeof Deno !== 'undefined' ? Deno.env.get(k) : undefined) ?? d; } catch { return d; }
};
const SUPABASE_URL = env('SUPABASE_URL');
const SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const ANON_KEY = env('SUPABASE_ANON_KEY');
const RESEND_API_KEY = env('RESEND_API_KEY');
const FROM_EMAIL = env('INVITE_FROM_EMAIL');
const APP_URL = env('APP_URL', 'https://big-pace-ledger.com').replace(/\/+$/, '');

export const TZ = 'America/Chicago';
export const SEND_HOUR = 7;
const TESTS_PER_DAY = 10;
const MAX_AGENT_ROWS = 150;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ---- dates (Central time) -----------------------------------------------------
export function central(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(now);
  const g = (t: string) => (parts.find(p => p.type === t) || { value: '' }).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hour: Number(g('hour')) % 24, weekday: g('weekday') };
}
export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dayOfWeek = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 Sun ... 6 Sat
// Yesterday.
export function lastDay(now: Date) {
  const y = addDays(central(now).date, -1);
  return { from: y, to: y };
}
// The latest Saturday-to-Friday week that has finished.
export function lastWeek(now: Date) {
  const today = central(now).date;
  const thisSat = addDays(today, -((dayOfWeek(today) + 1) % 7));
  return { from: addDays(thisSat, -7), to: addDays(thisSat, -1) };
}
export const periodFor = (kind: string, now: Date) => (kind === 'weekly' ? lastWeek(now) : lastDay(now));
// What should have gone out by now: yesterday's daily from 7 AM, and on
// Saturdays from 7 AM the week just finished.
export function due(now: Date, s: { daily_on?: boolean; weekly_on?: boolean }) {
  const c = central(now);
  if (c.hour < SEND_HOUR) return [];
  const out: { kind: 'daily' | 'weekly'; from: string; to: string }[] = [];
  if (s.daily_on) out.push({ kind: 'daily', ...lastDay(now) });
  if (s.weekly_on && c.weekday === 'Sat') out.push({ kind: 'weekly', ...lastWeek(now) });
  return out;
}

// ---- the numbers ----------------------------------------------------------------
export type Nums = { added: number; set: number; completed: number; apps: number; premium: number };
export const METRICS: { key: keyof Nums; label: string; short: string }[] = [
  { key: 'added', label: 'Team members added', short: 'Added' },
  { key: 'set', label: 'Appointments set', short: 'Set' },
  { key: 'completed', label: 'Appointments completed', short: 'Completed' },
  { key: 'apps', label: 'Applications submitted', short: 'Apps' },
  { key: 'premium', label: 'Total target premium', short: 'Premium' },
];
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const zero = (): Nums => ({ added: 0, set: 0, completed: 0, apps: 0, premium: 0 });
export const isEmpty = (n: Nums) => METRICS.every(m => !n[m.key]);

// From pl_activity_report's answer: the company, each leader's team (in
// org-chart order, teams inside teams indented) and each person.
export function buildReport(raw: any) {
  const people: any[] = Array.isArray(raw?.people) ? raw.people : [];
  const sales: any[] = Array.isArray(raw?.sales) ? raw.sales : [];
  const byId = new Map(people.map(p => [p.id, p]));
  const children = new Map<string, any[]>();
  const roots: any[] = [];
  for (const p of people) {
    if (p.manager_id && p.manager_id !== p.id && byId.has(p.manager_id)) {
      if (!children.has(p.manager_id)) children.set(p.manager_id, []);
      children.get(p.manager_id)!.push(p);
    } else roots.push(p);
  }
  const salesOf = new Map<string, { id: string; premium: number }[]>();
  for (const s of sales) {
    if (!salesOf.has(s.user_id)) salesOf.set(s.user_id, []);
    salesOf.get(s.user_id)!.push({ id: String(s.id), premium: num(s.premium) });
  }
  const personal = (p: any): Nums => {
    const mine = salesOf.get(p.id) || [];
    return { added: num(p.added), set: num(p.set), completed: num(p.completed), apps: mine.length, premium: mine.reduce((t, x) => t + x.premium, 0) };
  };
  // Everyone under someone (a loop in the data can't run forever).
  const under = (id: string) => {
    const out: string[] = [];
    const seen = new Set([id]);
    const stack = [...(children.get(id) || [])];
    while (stack.length) {
      const p = stack.pop();
      if (seen.has(p.id)) continue;
      seen.add(p.id); out.push(p.id);
      stack.push(...(children.get(p.id) || []));
    }
    return out;
  };
  // A group's totals: a sale two of them split counts once, premium shared.
  const totals = (ids: string[]): Nums => {
    const n = zero();
    const appIds = new Set<string>();
    for (const id of ids) {
      const p = byId.get(id);
      if (!p) continue;
      n.added += num(p.added); n.set += num(p.set); n.completed += num(p.completed);
      for (const s of salesOf.get(id) || []) { appIds.add(s.id); n.premium += s.premium; }
    }
    n.apps = appIds.size;
    return n;
  };
  const size = new Map<string, number>();
  const sizeOf = (id: string) => { if (!size.has(id)) size.set(id, under(id).length); return size.get(id)!; };
  const order = (list: any[]) => list.slice().sort((a, b) => sizeOf(b.id) - sizeOf(a.id) || String(a.name || '').localeCompare(String(b.name || '')));

  // A single top person over everyone is the company, not a team.
  const skipRoot = roots.length === 1 && sizeOf(roots[0].id) === people.length - 1;
  const teams: { id: string; name: string; depth: number; size: number; system: string; nums: Nums }[] = [];
  const walk = (p: any, depth: number, seen: Set<string>) => {
    if (seen.has(p.id)) return;
    seen.add(p.id);
    const kids = children.get(p.id) || [];
    let next = depth;
    if (kids.length && !(skipRoot && p === roots[0])) {
      const ids = [p.id, ...under(p.id)];
      teams.push({ id: p.id, name: String(p.name || 'Someone'), depth, size: ids.length, system: p.system || '', nums: totals(ids) });
      next = depth + 1;
    }
    order(kids).forEach(k => walk(k, next, seen));
  };
  const seen = new Set<string>();
  order(roots).forEach(r => walk(r, 0, seen));

  const agents = people.map(p => ({
    id: p.id, name: String(p.name || 'Someone'), system: p.system || '',
    team: p.manager_id && byId.has(p.manager_id) ? String(byId.get(p.manager_id).name || '') : '',
    nums: personal(p),
  }));

  const systemNames = [...new Set(people.map(p => p.system || ''))].filter(Boolean).sort();
  const systems = systemNames.length > 1
    ? systemNames.map(s => ({ id: s, name: (people.find(p => p.system === s) || {}).system_name || s, nums: totals(people.filter(p => p.system === s).map(p => p.id)) }))
    : [];

  const c = raw?.company || {};
  return {
    from: String(raw?.from || ''), to: String(raw?.to || ''),
    company: { added: num(c.added), set: num(c.set), completed: num(c.completed), apps: num(c.apps), premium: num(c.premium) } as Nums,
    notLogged: num(c.not_logged),
    teams, agents, systems, peopleCount: people.length,
  };
}
export type Report = ReturnType<typeof buildReport>;

// ---- the email -------------------------------------------------------------------
export function esc(s: unknown) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
export const money = (v: number) => `${v < 0 ? '−' : ''}$${Math.round(Math.abs(v)).toLocaleString('en-US')}`;
const fmt = (k: keyof Nums, v: number) => (k === 'premium' ? money(v) : Math.round(v).toLocaleString('en-US'));
const md = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
const longDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
const shortDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
// "Oct 31 – Nov 6", "Nov 1 – 7".
export function range(from: string, to: string) {
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  return `${md(from)} – ${sameMonth ? Number(to.slice(8)) : md(to)}`;
}
export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

const C = { ink: '#13212E', text: '#33414D', muted: '#6B7785', line: '#E3E7EC', brass: '#C49A3C', green: '#2E7D5B', rust: '#B0432F' };
// Up, down or the same as last week.
export function change(k: keyof Nums, now: number, before: number) {
  const d = now - before;
  if (Math.abs(d) < (k === 'premium' ? 0.5 : 1e-9)) return { text: 'same', cls: 'm', arrow: '' };
  const up = d > 0;
  const amount = k === 'premium' ? money(Math.abs(d)) : Math.round(Math.abs(d)).toLocaleString('en-US');
  return { text: `${up ? '+' : '−'}${amount}`, cls: up ? 'u' : 'd', arrow: up ? '▲' : '▼' };
}
const pctChange = (now: number, before: number) => (before > 0 ? `${now >= before ? '+' : '−'}${Math.round(Math.abs(now - before) / before * 100)}%` : '');
const unit = (k: keyof Nums, n: number) => (k === 'apps' ? (Math.round(n) === 1 ? 'app' : 'apps') : k);

// Classes keep a long list small (Gmail clips emails over 102 KB); the
// layout still reads as a plain table where styles are stripped.
const CSS = `.t{border-collapse:collapse;width:100%;margin:0 0 6px;font-size:14px;color:${C.ink}}
.t th{padding:8px 6px;font-size:11px;font-weight:bold;color:${C.muted};text-transform:uppercase;letter-spacing:.4px;text-align:right;border-bottom:1px solid ${C.line}}
.t td{padding:7px 6px;border-bottom:1px solid ${C.line};vertical-align:top;text-align:right;white-space:nowrap}
.t .a{text-align:left;white-space:normal}
.t small{font-size:11px}
.m{color:${C.muted}}.u{color:${C.green}}.d{color:${C.rust}}.z{color:#A6AFB9}.b{font-size:18px;font-weight:bold}
h2{margin:26px 0 4px;font-size:17px;color:${C.ink}}
.n{margin:0 0 10px;font-size:12px;line-height:1.5;color:${C.muted}}
.t th.a{width:34%}
@media (max-width:520px){.t{font-size:13px}.t th{padding:6px 2px;font-size:9px;letter-spacing:0}.t td{padding:6px 2px}.t th.a{width:auto}.t small{font-size:10px}.b{font-size:16px}.w{padding:16px 12px 20px !important}}`;

function numCell(k: keyof Nums, now: number, before: number | null) {
  const nothing = !now && !before;
  if (nothing) return '<td class="z">–</td>';
  if (before == null) return `<td>${esc(fmt(k, now))}</td>`;
  const ch = change(k, now, before);
  return `<td>${esc(fmt(k, now))}<br><small class="${ch.cls}">${esc(ch.text)}</small></td>`;
}
const headRow = (first: string) => `<tr><th class="a">${esc(first)}</th>${METRICS.map(m => `<th>${esc(m.short)}</th>`).join('')}</tr>`;
function nameCell(name: string, sub: string, depth = 0, bold = false) {
  const pad = depth ? ` style="padding-left:${6 + depth * 16}px"` : '';
  return `<td class="a"${pad}>${depth ? '<span class="z">↳ </span>' : ''}${bold ? `<b>${esc(name)}</b>` : esc(name)}${sub ? `<br><small class="m">${esc(sub)}</small>` : ''}</td>`;
}
const table = (rows: string) => `<table class="t" role="presentation" cellpadding="0" cellspacing="0" width="100%">${rows}</table>`;
const h2 = (t: string) => `<h2>${esc(t)}</h2>`;
const note = (t: string) => `<p class="n">${t}</p>`;

export function renderEmail({ kind, cur, prev, sentAt }: { kind: 'daily' | 'weekly'; cur: Report; prev: Report | null; sentAt: Date }) {
  const weekly = kind === 'weekly' && !!prev;
  const prevNums = (list: { id: string; nums: Nums }[] | undefined) => new Map((list || []).map(x => [x.id, x.nums]));
  const prevTeams = prevNums(prev?.teams), prevAgents = prevNums(prev?.agents), prevSystems = prevNums(prev?.systems);
  const c = cur.company, p = prev?.company || null;
  const before = (m: Map<string, Nums>, id: string, k: keyof Nums) => (weekly ? (m.get(id) || zero())[k] : null);

  const title = kind === 'weekly' ? `Week of ${range(cur.from, cur.to)}` : longDay(cur.from);
  const asOf = new Date(sentAt).toLocaleString('en-US', { timeZone: TZ, weekday: 'long', hour: 'numeric', minute: '2-digit' });
  const intro = kind === 'weekly'
    ? `Saturday to Friday${prev ? `, compared with the week before (${esc(range(prev.from, prev.to))})` : ''}. Everything logged in PaceLedger by ${esc(asOf)}.`
    : `Everything logged in PaceLedger for ${esc(shortDay(cur.from))}, as of ${esc(asOf)}.`;

  // Company
  const scoreHead = weekly
    ? '<tr><th class="a">Company</th><th>This week</th><th>Last week</th><th>Change</th></tr>'
    : `<tr><th class="a">Company</th><th>${esc(shortDay(cur.from))}</th></tr>`;
  const scoreRows = METRICS.map(m => {
    const big = `<td class="b">${esc(fmt(m.key, c[m.key]))}</td>`;
    if (!weekly) return `<tr>${nameCell(m.label, '')}${big}</tr>`;
    const ch = change(m.key, c[m.key], p![m.key]);
    const pc = ch.arrow ? pctChange(c[m.key], p![m.key]) : '';
    return `<tr>${nameCell(m.label, '')}${big}<td class="m">${esc(fmt(m.key, p![m.key]))}</td><td class="${ch.cls}"><b>${ch.arrow ? `${ch.arrow} ` : ''}${esc(ch.text)}</b>${pc ? `<br><small>${esc(pc)}</small>` : ''}</td></tr>`;
  }).join('');
  const dayWord = kind === 'weekly' ? 'this week' : shortDay(cur.from).split(',')[0];
  const notLogged = cur.notLogged
    ? note(`${esc(plural(cur.notLogged, 'appointment'))} from ${esc(dayWord)} ${cur.notLogged === 1 ? 'doesn’t' : 'don’t'} have an outcome logged yet, so ${cur.notLogged === 1 ? 'it isn’t' : 'they aren’t'} in Completed.`)
    : '';

  const systems = cur.systems.length
    ? h2('By solar system') + table(headRow('Solar system') + cur.systems.map(s => `<tr>${nameCell(s.name, s.name !== s.id ? s.id : '')}${METRICS.map(m => numCell(m.key, s.nums[m.key], before(prevSystems, s.id, m.key))).join('')}</tr>`).join(''))
    : '';

  const teamRows = cur.teams.map(t => `<tr>${nameCell(`${t.name}’s team`, `${plural(t.size, 'person', 'people')}${cur.systems.length && t.depth === 0 && t.system ? ` · ${t.system}` : ''}`, Math.min(t.depth, 5), t.depth === 0)}${METRICS.map(m => numCell(m.key, t.nums[m.key], before(prevTeams, t.id, m.key))).join('')}</tr>`).join('');
  const teamsPart = cur.teams.length
    ? h2('By team') + note('Each leader’s whole team: the leader and everyone under them. Teams inside teams are indented, so their numbers are also in the team above.') + table(headRow('Team') + teamRows)
    : '';

  const active = cur.agents.filter(a => !isEmpty(a.nums) || (weekly && prevAgents.has(a.id) && !isEmpty(prevAgents.get(a.id)!)));
  active.sort((a, b) => b.nums.premium - a.nums.premium || b.nums.apps - a.nums.apps || b.nums.completed - a.nums.completed
    || b.nums.set - a.nums.set || b.nums.added - a.nums.added || a.name.localeCompare(b.name));
  const shown = active.slice(0, MAX_AGENT_ROWS);
  const quiet = cur.peopleCount - active.length;
  const agentRows = shown.map(a => `<tr>${nameCell(a.name, a.team ? `${a.team}’s team` : '')}${METRICS.map(m => numCell(m.key, a.nums[m.key], before(prevAgents, a.id, m.key))).join('')}</tr>`).join('');
  const agentsPart = h2('By agent') + (active.length
    ? note(`${esc(plural(active.length, 'person', 'people'))} with activity${weekly ? ' this week or last' : ''}, most premium first.${quiet > 0 ? ` ${esc(plural(quiet, 'other'))} had none.` : ''}`) + table(headRow('Agent') + agentRows)
      + (active.length > shown.length ? note(`And ${esc(plural(active.length - shown.length, 'more person', 'more people'))}: see Team Pace and Track Production in PaceLedger.`) : '')
    : note(`No activity logged${kind === 'weekly' ? ' this week' : ''}.`));

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><style>${CSS}</style></head>
<body style="margin:0;padding:0;background:#EBEEF2"><div style="padding:20px 10px;background:#EBEEF2;font-family:Arial,Helvetica,sans-serif;color:${C.text}">
<div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden">
<div style="background:${C.ink};padding:16px 24px"><span style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:bold;color:${C.brass}">PaceLedger</span><span style="font-size:13px;color:#C9D1DA;padding-left:10px">${kind === 'weekly' ? 'Weekly report' : 'Daily report'}</span></div>
<div class="w" style="padding:22px 24px 26px">
<h1 style="margin:0 0 6px;font-size:22px;color:${C.ink}">${esc(title)}</h1>
<p style="margin:0 0 18px;font-size:13px;line-height:1.5;color:${C.muted}">${intro}</p>
${table(scoreHead + scoreRows)}
${notLogged}
${systems}
${teamsPart}
${agentsPart}
<div style="margin-top:24px;padding-top:14px;border-top:1px solid ${C.line};font-size:12px;line-height:1.6;color:${C.muted}">
<b style="color:${C.text}">How these are counted</b> (from what’s logged in PaceLedger, Central time)<br>
<b>Added:</b> people who signed up through a recruit link, for the person they joined under.
<b>Set:</b> new appointments on the day they were set, the same as Pace (not follow-ups), for the person who set them.
<b>Completed:</b> appointments that took place with an outcome of Went well or Not interested, follow-ups included.
<b>Apps:</b> appointments logged as Sold. <b>Premium:</b> their target premium. A split sale counts for both people, with the premium shared, and once in team and company totals.<br>
<a href="${esc(APP_URL)}/team" style="color:#24548A">Open PaceLedger</a> · Super admins choose who gets this in Team &amp; admin → Team overview → Email reports.
</div></div></div></div></body></html>`;

  const subjectNums = `${c.set.toLocaleString('en-US')} set, ${c.completed.toLocaleString('en-US')} completed, ${plural(c.apps, 'app')}, ${money(c.premium)}`;
  let vsLast = '';
  if (p) {
    const pc = pctChange(c.premium, p.premium);
    vsLast = Math.abs(c.premium - p.premium) < 0.5 ? ' (premium same as last week)'
      : pc ? ` (premium ${c.premium > p.premium ? '▲' : '▼'} ${pc.replace(/^[+−]/, '')} vs last week)`
      : ` (premium ${money(p.premium)} last week)`;
  }
  const subject = kind === 'weekly'
    ? `PaceLedger weekly · ${range(cur.from, cur.to)} · ${subjectNums}${vsLast}`
    : `PaceLedger daily · ${shortDay(cur.from)} · ${subjectNums}`;

  const line = (label: string, n: Nums, was: Nums | null) => `${label}: ${METRICS.map(m => `${fmt(m.key, n[m.key])} ${unit(m.key, n[m.key])}${was ? ` (${change(m.key, n[m.key], was[m.key]).text})` : ''}`).join(', ')}`;
  const text = [
    `PaceLedger ${kind === 'weekly' ? 'weekly' : 'daily'} report: ${title}`,
    '',
    ...METRICS.map(m => `${m.label}: ${fmt(m.key, c[m.key])}${weekly ? ` (last week ${fmt(m.key, p![m.key])}, ${change(m.key, c[m.key], p![m.key]).text})` : ''}`),
    cur.notLogged ? `${plural(cur.notLogged, 'appointment')} without an outcome logged yet (not in Completed).` : '',
    '',
    cur.teams.length ? 'By team (each leader and everyone under them):' : '',
    ...cur.teams.map(t => `${'  '.repeat(Math.min(t.depth, 5))}${line(`${t.name}'s team (${plural(t.size, 'person', 'people')})`, t.nums, weekly ? prevTeams.get(t.id) || zero() : null)}`),
    '',
    'By agent:',
    ...(shown.length ? shown.map(a => line(a.name, a.nums, weekly ? prevAgents.get(a.id) || zero() : null)) : ['No activity logged.']),
    '',
    `${APP_URL}/team`,
  ].filter((l, i, all) => !(l === '' && all[i - 1] === '')).join('\n');

  return { subject, html, text };
}

// ---- sending -----------------------------------------------------------------------
async function numbers(admin: any, from: string, to: string) {
  const { data, error } = await admin.rpc('pl_activity_report', { p_from: from, p_to: to });
  if (error) throw new Error(`pl_activity_report: ${error.message}`);
  return buildReport(data);
}
export async function compose(admin: any, kind: 'daily' | 'weekly', from: string, to: string, sentAt = new Date()) {
  const cur = await numbers(admin, from, to);
  const prev = kind === 'weekly' ? await numbers(admin, addDays(from, -7), addDays(to, -7)) : null;
  return { ...renderEmail({ kind, cur, prev, sentAt }), from, to };
}
async function sendEmail(to: string[], mail: { subject: string; html: string; text: string }) {
  if (!RESEND_API_KEY || !FROM_EMAIL) return { ok: false, error: 'email_not_configured' };
  const payload = JSON.stringify({ from: FROM_EMAIL, to, subject: mail.subject, html: mail.html, text: mail.text });
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: payload });
    if (res.ok) return { ok: true };
    const body = await res.text().catch(() => '');
    console.error('resend error', res.status, body);
    if (res.status !== 429 && res.status < 500) return { ok: false, error: `send_failed_${res.status}` };
    await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
  }
  return { ok: false, error: 'send_failed' };
}
const STUCK_MS = 20 * 60_000;
// One report for one period, to everyone on the list, once.
export async function sendOnce(admin: any, item: { kind: 'daily' | 'weekly'; from: string; to: string }, recipients: string[], now = new Date()) {
  if (!recipients.length) return { ...item, skipped: 'no_recipients' };
  const claim = async () => admin.from('report_sends').insert({ kind: item.kind, period_start: item.from, period_end: item.to, status: 'sending' }).select().single();
  let { data: row, error } = await claim();
  if (error) {
    if (error.code !== '23505') throw new Error(`report_sends: ${error.message}`);
    const { data: old } = await admin.from('report_sends').select('*').eq('kind', item.kind).eq('period_start', item.from).eq('test', false).maybeSingle();
    if (!old || old.status === 'sent' || now.getTime() - Date.parse(old.created_at) < STUCK_MS) return { ...item, skipped: old && old.status === 'sending' ? 'sending' : 'already_sent' };
    // An earlier try stopped partway: take it over.
    await admin.from('report_sends').delete().eq('id', old.id).eq('status', 'sending');
    ({ data: row, error } = await claim());
    if (error) return { ...item, skipped: 'already_sent' };
  }
  try {
    const mail = await compose(admin, item.kind, item.from, item.to, now);
    const sent = await sendEmail(recipients, mail);
    if (!sent.ok) throw new Error(sent.error);
    await admin.from('report_sends').update({ status: 'sent', sent_at: new Date().toISOString(), sent_to: recipients.join(', ') }).eq('id', row.id);
    await admin.from('report_settings').update({ last_error: null, last_error_at: null }).eq('id', true);
    return { ...item, sent: true, to: recipients.length, subject: mail.subject };
  } catch (e) {
    // Nothing went out: let the next hour try again.
    await admin.from('report_sends').delete().eq('id', row.id);
    const msg = String((e as Error).message || e).slice(0, 300);
    await admin.from('report_settings').update({ last_error: `${item.kind} report for ${item.from}: ${msg}`, last_error_at: new Date().toISOString() }).eq('id', true);
    console.error('report not sent', item, msg);
    return { ...item, sent: false, error: msg };
  }
}
export async function runDue(admin: any, now = new Date()) {
  const { data: s, error } = await admin.from('report_settings').select('*').eq('id', true).maybeSingle();
  if (error || !s) return { ran: [], error: 'not_set_up' };
  const list = due(now, s);
  const ran = [];
  for (const item of list) ran.push(await sendOnce(admin, item, Array.isArray(s.recipients) ? s.recipients : [], now));
  return { ran, central: central(now) };
}

const sameText = (a: string, b: string) => {
  if (!a || !b || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
};

export async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'not_configured' }, 500);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));
  try {
    // The hourly call from the database.
    const cronToken = (req.headers.get('x-report-token') || '').trim();
    if (cronToken) {
      const { data: k } = await admin.from('report_cron').select('token').eq('id', true).maybeSingle();
      if (!k || !sameText(String(k.token || ''), cronToken)) return json({ error: 'bad_token' }, 401);
      return json(await runDue(admin));
    }

    // A super admin in PaceLedger.
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'not_signed_in' }, 401);
    const { data: u, error: uErr } = await createClient(SUPABASE_URL, ANON_KEY || SERVICE_ROLE_KEY, { auth: { persistSession: false } }).auth.getUser(jwt);
    if (uErr || !u?.user) return json({ error: 'not_signed_in' }, 401);
    const { data: me } = await admin.from('profiles').select('id, role, email, display_name').eq('id', u.user.id).maybeSingle();
    if (!me || me.role !== 'super_admin') return json({ error: 'not_allowed' }, 403);
    const kind = body.kind === 'weekly' ? 'weekly' : 'daily';
    const { from, to } = periodFor(kind, new Date());

    if (body.action === 'preview') {
      const mail = await compose(admin, kind, from, to);
      return json({ ok: true, kind, ...mail });
    }
    if (body.action === 'send-test') {
      const email = String(me.email || u.user.email || '').trim();
      if (!email) return json({ ok: false, error: 'no_email' });
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { count } = await admin.from('report_sends').select('id', { count: 'exact', head: true }).eq('test', true).eq('sent_by', me.id).gte('created_at', since);
      if ((count || 0) >= TESTS_PER_DAY) return json({ ok: false, error: 'daily_limit' });
      const mail = await compose(admin, kind, from, to);
      const sent = await sendEmail([email], { ...mail, subject: `[Test] ${mail.subject}` });
      if (!sent.ok) return json({ ok: false, error: sent.error });
      await admin.from('report_sends').insert({ kind, period_start: from, period_end: to, test: true, status: 'sent', sent_at: new Date().toISOString(), sent_to: email, sent_by: me.id });
      return json({ ok: true, kind, to: email, subject: mail.subject });
    }
    return json({ error: 'unknown_action' }, 400);
  } catch (e) {
    const msg = String((e as Error).message || e);
    console.error(msg);
    if (/does not exist|could not find/i.test(msg)) return json({ ok: false, error: 'needs_update' }, 500);
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

if (typeof Deno !== 'undefined') Deno.serve(handle);
