// Edge Function: google-create-event
// Called by the app right after a new appointment is logged. Creates a
// real Google Calendar event on the calling advisor's own calendar (if
// connected), and — if a presenting manager's Zoom was selected — also on
// that manager's calendar (if they've connected theirs), verified
// server-side to actually be a manager/super_admin, so this can't be used
// to push an event onto just anyone's calendar.
//
// These are two independent events, not a shared calendar invite. If the
// advisor listed invitees (the client, anyone else), Google emails them a
// real calendar invitation — with the Zoom link — from the advisor's own
// event only, so nobody gets duplicate emails. Google never emails the
// calendar's owner, so the response lists exactly who Google invited and
// the app emails anyone else (usually the advisor's own "Me" address).
//
// Time zones: the event keeps the appointment's own time zone, so it sits
// at the right time on the advisor's calendar. Google writes each invitation
// in the *guest's* Google Calendar time zone, though, and a guest who never
// set one (common for clients) sees UTC ("10pm (Coordinated Universal
// Time)" for a 5pm Eastern meeting). So the first line of the description,
// which every invitation shows, gives the time in the appointment's zone:
// "When: Friday, November 6, 5:00 – 6:00 PM EST".
//
// Deploy with: supabase functions deploy google-create-event
// (or Supabase -> Edge Functions -> google-create-event -> Code -> paste
// this file -> Deploy updates).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// Same no-cache header set as the other functions — belt and suspenders
// against on-disk browser caching, even though this response body itself
// is just two booleans, not a link.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
  'Pragma': 'no-cache',
  'Expires': '0',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// The agency's home zone, if an appointment somehow has none (never UTC).
const DEFAULT_TZ = 'America/Chicago';
const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

export function validZone(tz: unknown): tz is string {
  if (!tz || typeof tz !== 'string') return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

// "2026-11-06T17:00:00" in America/New_York -> the real moment (22:00 UTC),
// daylight saving included.
export function zonedInstant(wall: string, tz: string): Date | null {
  const m = WALL_RE.exec(String(wall || ''));
  if (!m) return null;
  const want = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  let guess = want;
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(guess)).map(x => [x.type, x.value]));
    const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
    if (shown === want) break;
    guess += want - shown;
  }
  return new Date(guess);
}

// "Friday, November 6, 5:00 – 6:00 PM EST" (or "11:30 AM – 12:30 PM EST").
export function whenText(startWall: string, endWall: string, tz: string): string {
  const start = zonedInstant(startWall, tz);
  const end = zonedInstant(endWall, tz);
  if (!start) return '';
  const clock = (d: Date, zone: boolean) => d.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', ...(zone ? { timeZoneName: 'short' } : {}) });
  const day = start.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' });
  if (!end) return `${day}, ${clock(start, true)}`;
  const ampm = (d: Date) => (clock(d, false).match(/[AP]M$/) || [''])[0];
  const from = ampm(start) === ampm(end) ? clock(start, false).replace(/\s*[AP]M$/, '') : clock(start, false);
  return `${day}, ${from} – ${clock(end, true)}`;
}

// Google's refresh tokens don't rotate (unlike Zoom's) — only the access
// token needs updating after a refresh.
async function getValidAccessToken(admin: any, targetUserId: string) {
  const { data: conn } = await admin
    .from('google_calendar_connections').select('*').eq('user_id', targetUserId).maybeSingle();
  if (!conn) return null;

  const expiresAt = conn.access_token_expires_at ? new Date(conn.access_token_expires_at).getTime() : 0;
  if (conn.access_token && expiresAt > Date.now() + 60_000) return conn.access_token;

  const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: conn.refresh_token,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const refreshJson = await refreshRes.json();
  if (!refreshRes.ok || !refreshJson.access_token) {
    // Refresh token was likely revoked, or this connection still only has
    // the old read-only scope granted — either way, clear it so the app
    // shows "Not connected" rather than failing silently forever.
    await admin.from('google_calendar_connections').delete().eq('user_id', targetUserId);
    return null;
  }
  const newExpiresAt = new Date(Date.now() + (refreshJson.expires_in ?? 3600) * 1000).toISOString();
  await admin.from('google_calendar_connections')
    .update({ access_token: refreshJson.access_token, access_token_expires_at: newExpiresAt })
    .eq('user_id', targetUserId);
  return refreshJson.access_token as string;
}

async function createEventFor(admin: any, targetUserId: string, event: any, sendInvites = false) {
  const accessToken = await getValidAccessToken(admin, targetUserId);
  if (!accessToken) return { pushed: false, organizer: '' };
  // sendUpdates=all makes Google email every attendee a real calendar
  // invitation (Accept / Decline, with the Zoom link in it).
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events${sendInvites ? '?sendUpdates=all' : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  if (!res.ok) {
    // Shows up in Supabase -> Edge Functions -> google-create-event -> Logs.
    console.error('google create event failed', res.status, await res.text());
    return { pushed: false, organizer: '' };
  }
  const created = await res.json().catch(() => ({}));
  // The calendar owner's own address. Google never emails the organizer an
  // invitation to their own event, so the app emails that address itself.
  const organizer = String(created?.organizer?.email || created?.creator?.email || '').toLowerCase();
  return { pushed: true, organizer };
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const authClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: userData, error: userErr } = await authClient.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;
    const { title, description, location, attendees, startDateTime, endDateTime, timezone, managerHostId } = await req.json();

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    // The appointment's own time zone (the one it was set in).
    const tz = validZone(timezone) ? timezone : DEFAULT_TZ;
    const when = whenText(startDateTime, endDateTime, tz);
    const event: any = {
      summary: title || 'PaceLedger appointment',
      description: [when ? `When: ${when}` : '', description || ''].filter(Boolean).join('\n\n') || undefined,
      location: location || undefined,
      start: { dateTime: startDateTime, timeZone: tz },
      end: { dateTime: endDateTime, timeZone: tz },
    };

    // Invitees (client, the advisor, anyone else they listed) — validated
    // and capped here, never trusted blindly from the browser.
    const inviteList: string[] = Array.isArray(attendees)
      ? [...new Set(attendees.map((e: unknown) => String(e).trim().toLowerCase()).filter((e: string) => EMAIL_RE.test(e)))].slice(0, 8) as string[]
      : [];

    // Always try the advisor's own calendar. Invitations go out from this
    // event only, so nobody gets two emails.
    const ownEvent = inviteList.length ? { ...event, attendees: inviteList.map(email => ({ email })), guestsCanModify: false } : event;
    const own = await createEventFor(admin, userId, ownEvent, inviteList.length > 0);

    // If a presenting manager's Zoom was selected, also try their
    // calendar — verified server-side to actually be a manager/admin.
    let manager = { pushed: false };
    if (managerHostId && managerHostId !== userId) {
      const { data: targetProfile } = await admin
        .from('profiles').select('role').eq('id', managerHostId).maybeSingle();
      if (targetProfile && (targetProfile.role === 'manager' || targetProfile.role === 'super_admin')) {
        manager = await createEventFor(admin, managerHostId, event);
      }
    }

    // Who Google actually emailed: everyone except the calendar owner.
    const invited = own.pushed ? inviteList.filter(e => e !== own.organizer) : [];
    return new Response(JSON.stringify({ ownPushed: own.pushed, managerPushed: manager.pushed, ownInvited: invited.length > 0, invited }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
}

if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') Deno.serve(handle);