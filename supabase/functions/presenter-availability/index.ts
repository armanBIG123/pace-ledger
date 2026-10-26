// Edge Function: presenter-availability
// A presenter's open times for the appointment form, including the times
// that are busy on their Google Calendar when they've turned that on in
// Presenting hours.
//
// 1. Asks the database for their open times as the signed-in person
//    (presenter_open_slots in migration-presenter-availability.sql). The
//    database decides who may ask, and works out their presenting hours
//    minus every PaceLedger appointment and blocked-out time.
// 2. If they've ticked "Leave out times I'm busy on Google Calendar"
//    and connected Google, takes off any open time that overlaps a busy
//    Google event. Only busy/free is used: event titles and details never
//    leave this function. Events marked "Free", cancelled ones and ones
//    they declined don't count. Google's answer is kept for a minute, so
//    several people looking at the same presenter don't each ask Google.
// 3. If Google can't be reached, or their Google connection needs
//    reconnecting, the PaceLedger open times still come back, with
//    google: "unavailable" / "reconnect" so the app can say so. The
//    database still refuses any double-booking inside PaceLedger.
//
// Request:  POST { presenterId, from?: "YYYY-MM-DD", days?: 1-60, exclude?: appointment id }
// Response: the database's answer ({ ok, has_hours, accepting, timezone,
//           slot_minutes, slots: [[start, end], ...], ... }) plus
//           google: "used" | "off" | "not_connected" | "reconnect" | "unavailable".
//
// Uses the secrets the Google Calendar functions already have:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// (SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are
// provided by Supabase.) No other packages: plain fetch only.
//
// Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function ->
// Via Editor, name it presenter-availability, paste this file, Deploy.

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '');
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';

const GOOGLE_TIMEOUT_MS = 5000;
const CACHE_MS = 60_000;
const MAX_PAGES = 5;

// Open times are about people's schedules: never cached by a browser.
const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
  'Pragma': 'no-cache',
  'Expires': '0',
  'Content-Type': 'application/json',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

type Busy = { s: number; e: number };
type GoogleStatus = 'used' | 'off' | 'not_connected' | 'reconnect' | 'unavailable';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = GOOGLE_TIMEOUT_MS): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Milliseconds since 1970 for midnight at the start of `day` in time zone
// `tz` (all-day Google events), daylight saving included.
export function zonedMidnight(day: string, tz: string): number {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const offset = (ms: number) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(ms));
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - ms;
  };
  const first = guess - offset(guess);
  return guess - offset(first);
}

// Google events -> busy intervals. Skips cancelled events, ones marked
// "Free" and ones they declined.
export function busyFromEvents(items: any[], tz: string): Busy[] {
  const out: Busy[] = [];
  for (const ev of items || []) {
    if (!ev || ev.status === 'cancelled' || ev.transparency === 'transparent') continue;
    const me = Array.isArray(ev.attendees) ? ev.attendees.find((a: any) => a && a.self) : null;
    if (me && me.responseStatus === 'declined') continue;
    let s = NaN, e = NaN;
    if (ev.start?.dateTime && ev.end?.dateTime) { s = Date.parse(ev.start.dateTime); e = Date.parse(ev.end.dateTime); }
    else if (ev.start?.date && ev.end?.date) { s = zonedMidnight(ev.start.date, tz); e = zonedMidnight(ev.end.date, tz); }
    if (Number.isFinite(s) && Number.isFinite(e) && e > s) out.push({ s, e });
  }
  return out;
}

export function overlapsAny(s: number, e: number, busy: Busy[]): boolean {
  return busy.some(b => b.s < e && b.e > s);
}

const cache = new Map<string, { at: number; status: GoogleStatus; busy: Busy[] }>();
export function clearCache() { cache.clear(); }

function serviceHeaders(extra: Record<string, string> = {}) {
  return { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, ...extra };
}

// A fresh Google access token for this person, or a status saying why not.
async function googleToken(userId: string): Promise<{ token?: string; status?: GoogleStatus }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/google_calendar_connections?user_id=eq.${userId}&select=access_token,refresh_token,access_token_expires_at`, { headers: serviceHeaders() });
  if (!res.ok) return { status: 'unavailable' };
  const rows = await res.json();
  const conn = Array.isArray(rows) ? rows[0] : null;
  if (!conn || !conn.refresh_token) return { status: 'not_connected' };
  const expires = conn.access_token_expires_at ? Date.parse(conn.access_token_expires_at) : 0;
  if (conn.access_token && expires > Date.now() + 60_000) return { token: conn.access_token };
  const refreshed = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: conn.refresh_token, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, grant_type: 'refresh_token' }),
  });
  const body = await refreshed.json().catch(() => ({}));
  // Revoked or expired: they reconnect from their own Calendar tab. Their
  // connection is left as it is (the Calendar tab clears it when they look).
  if (!refreshed.ok || !body.access_token) return { status: refreshed.status === 400 || refreshed.status === 401 ? 'reconnect' : 'unavailable' };
  const until = new Date(Date.now() + (Number(body.expires_in) || 3600) * 1000).toISOString();
  await fetch(`${SUPABASE_URL}/rest/v1/google_calendar_connections?user_id=eq.${userId}`, {
    method: 'PATCH',
    headers: serviceHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify({ access_token: body.access_token, access_token_expires_at: until }),
  }).catch(() => {});
  return { token: body.access_token };
}

// Busy times on their primary Google Calendar between from and to.
export async function googleBusy(userId: string, from: number, to: number, tz: string): Promise<{ status: GoogleStatus; busy: Busy[] }> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return { status: 'unavailable', busy: [] };
  const key = `${userId}|${Math.floor(from / 60000)}|${Math.floor(to / 60000)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return { status: hit.status, busy: hit.busy };
  try {
    const t = await googleToken(userId);
    if (!t.token) return { status: t.status || 'unavailable', busy: [] };
    const items: any[] = [];
    let page = '';
    for (let i = 0; i < MAX_PAGES; i++) {
      const q = new URLSearchParams({
        timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(), singleEvents: 'true', maxResults: '250',
        fields: 'nextPageToken,items(status,transparency,start,end,attendees(self,responseStatus))',
      });
      if (page) q.set('pageToken', page);
      const res = await fetchWithTimeout(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`, { headers: { Authorization: `Bearer ${t.token}` } });
      if (res.status === 401 || res.status === 403) return { status: 'reconnect', busy: [] };
      if (!res.ok) return { status: 'unavailable', busy: [] };
      const body = await res.json();
      items.push(...(body.items || []));
      page = body.nextPageToken || '';
      if (!page) break;
    }
    const busy = busyFromEvents(items, tz);
    cache.set(key, { at: Date.now(), status: 'used', busy });
    return { status: 'used', busy };
  } catch (err) {
    console.error('presenter-availability: google', (err as Error)?.name || 'error');
    return { status: 'unavailable', busy: [] };
  }
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: HEADERS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const auth = req.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S+$/.test(auth)) return json({ ok: false, reason: 'not_signed_in' }, 401);
  let input: any;
  try { input = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const presenterId = String(input?.presenterId || '');
  if (!UUID.test(presenterId)) return json({ error: 'bad_request' }, 400);
  const from = typeof input.from === 'string' && DAY.test(input.from) ? input.from : null;
  const days = Math.min(60, Math.max(1, Math.round(Number(input.days)) || 14));
  const exclude = UUID.test(String(input.exclude || '')) ? String(input.exclude) : null;

  try {
    // 1. PaceLedger's open times, asked as the signed-in person.
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/presenter_open_slots`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_presenter: presenterId, p_from: from, p_days: days, p_exclude: exclude }),
    });
    if (res.status === 401) return json({ ok: false, reason: 'not_signed_in' }, 401);
    if (!res.ok) return json({ error: 'availability_failed' }, 502);
    const result = await res.json();
    if (!result || result.ok !== true) return json(result || { ok: false }, 200);
    const slots: [string, string][] = Array.isArray(result.slots) ? result.slots : [];
    if (!result.use_google || slots.length === 0) return json({ ...result, google: result.use_google ? 'used' : 'off' });

    // 2. Minus busy times on their Google Calendar.
    const buffer = (Number(result.buffer_minutes) || 0) * 60_000;
    const starts = slots.map(x => Date.parse(x[0]));
    const ends = slots.map(x => Date.parse(x[1]));
    const g = await googleBusy(presenterId, Math.min(...starts) - buffer, Math.max(...ends) + buffer, result.timezone || 'America/Chicago');
    if (g.status !== 'used') return json({ ...result, google: g.status });
    const open = slots.filter(([s, e]) => !overlapsAny(Date.parse(s) - buffer, Date.parse(e) + buffer, g.busy));
    return json({ ...result, slots: open, google: 'used' });
  } catch (err) {
    console.error('presenter-availability', (err as Error)?.name || 'error');
    return json({ error: 'availability_failed' }, 500);
  }
}

Deno.serve(handle);
