// Google Calendar and Zoom connections, calendar events, Zoom meetings and emailed invites.
import { supabase } from '../supabaseClient.js';

// ---------------------------------------------------------------------
// calendar — a live month view of every appointment's actual date/time
// ---------------------------------------------------------------------

export const GOOGLE_CLIENT_ID = '106061643707-avmoqp1oe5idqdioocen9vnpsqd9i82l.apps.googleusercontent.com';

// Google Calendar and Zoom both follow the identical connect / check
// status / disconnect shape, differing only in which table and which
// email column they use — these three shared helpers do the real work
// once, so the provider-specific functions below are one line each.
export async function connectProvider(buildAuthUrl) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  window.location.href = buildAuthUrl(data.session.access_token);
}

export async function fetchProviderConnectionStatus(table, emailColumn, emailKey) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { connected: false };
  // Only the two display-safe columns — the database doesn't let the
  // browser read the token columns at all.
  const { data, error } = await supabase
    .from(table).select(`${emailColumn}, connected_at`).eq('user_id', sessionData.session.user.id).maybeSingle();
  if (error || !data) return { connected: false };
  return { connected: true, [emailKey]: data[emailColumn] };
}

export async function disconnectProvider(table) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return false;
  const { error } = await supabase.from(table).delete().eq('user_id', data.session.user.id);
  return !error;
}

// Google sends people back to this site's own address (e.g.
// https://big-pace-ledger.com/), not to a supabase.co URL — Google's app
// verification requires every redirect domain to be one we own and have
// verified. The app then hands the one-time code to the
// google-oauth-callback Edge Function over an authenticated request.
export const GOOGLE_OAUTH_STATE_KEY = 'pl_google_oauth_state';

export function googleRedirectUri() { return `${window.location.origin}/`; }

export function newOAuthState() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function googleOAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    // calendar.events.owned: read and create events on calendars the person
    // owns (we only ever use their primary calendar), including adding the
    // attendees they choose. Must match the scope configured in Google Cloud
    // Console exactly (Google verification checks the string).
    scope: 'https://www.googleapis.com/auth/calendar.events.owned',
    access_type: 'offline',
    prompt: 'consent',
    // A random one-time value (not a login token) that we check on the
    // way back, so a stray or forged redirect can't attach someone else's
    // Google account.
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function connectGoogleCalendar() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const state = newOAuthState();
  try { sessionStorage.setItem(GOOGLE_OAUTH_STATE_KEY, state); } catch { /* checked on return */ }
  window.location.href = googleOAuthUrl(state);
}

// Called once when Google sends the person back here. Returns
// { ok: true } or { ok: false, reason }.
export async function finishGoogleConnect(params) {
  let expected = null;
  try {
    expected = sessionStorage.getItem(GOOGLE_OAUTH_STATE_KEY);
    sessionStorage.removeItem(GOOGLE_OAUTH_STATE_KEY);
  } catch { /* storage blocked */ }
  if (params.get('error')) return { ok: false, reason: params.get('error') === 'access_denied' ? 'cancelled' : params.get('error') };
  if (!expected || params.get('state') !== expected) return { ok: false, reason: 'state_mismatch' };
  const { data } = await supabase.auth.getSession();
  if (!data.session) return { ok: false, reason: 'not_signed_in' };
  try {
    const res = await fetch(`${supabase.supabaseUrl}/functions/v1/google-oauth-callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.session.access_token}`,
        apikey: supabase.supabaseKey,
      },
      body: JSON.stringify({ code: params.get('code'), redirectUri: googleRedirectUri() }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.connected) return { ok: false, reason: json.error || `http_${res.status}` };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'network_error' };
  }
}

// True when the current URL is Google returning from the connect screen
// (and not, say, some other link that happens to carry ?code=).
export function isGoogleOAuthReturn(params) {
  if (!params.get('state') || !(params.get('code') || params.get('error'))) return false;
  let pending = null;
  try { pending = sessionStorage.getItem(GOOGLE_OAUTH_STATE_KEY); } catch { /* ignore */ }
  return !!pending || (params.get('scope') || '').includes('googleapis.com');
}

export async function fetchGoogleConnectionStatus() { return fetchProviderConnectionStatus('google_calendar_connections', 'google_email', 'googleEmail'); }

// Revokes PaceLedger's access at Google as well as deleting the stored
// tokens (done server-side, where the tokens live). Falls back to a plain
// delete if the function can't be reached.
export async function disconnectGoogleCalendar() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return false;
  try {
    const res = await fetch(`${supabase.supabaseUrl}/functions/v1/google-oauth-callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.session.access_token}`,
        apikey: supabase.supabaseKey,
      },
      body: JSON.stringify({ action: 'disconnect' }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.disconnected) return true;
  } catch { /* fall through */ }
  return disconnectProvider('google_calendar_connections');
}

export async function fetchGoogleEvents(startDate, endDate) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { connected: false, events: [] };
  try {
    const res = await fetch(`${supabase.supabaseUrl}/functions/v1/google-calendar-events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionData.session.access_token}`,
        apikey: supabase.supabaseKey,
      },
      body: JSON.stringify({ startDate, endDate }),
    });
    if (!res.ok) return { connected: false, events: [] };
    return await res.json();
  } catch {
    return { connected: false, events: [] };
  }
}

// Pushes a new appointment onto the advisor's own Google Calendar, and —
// if a presenting manager's Zoom was used — that manager's calendar too,
// as two independent events. Best-effort: failures here never block the
// appointment itself from being saved.
export async function pushAppointmentToGoogleCalendar({ title, description, location, attendees, startDateTime, endDateTime, timezone, managerHostId }) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { ownPushed: false, managerPushed: false };
  try {
    const res = await fetch(`${supabase.supabaseUrl}/functions/v1/google-create-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionData.session.access_token}`,
        apikey: supabase.supabaseKey,
      },
      body: JSON.stringify({ title, description, location, attendees: attendees || [], startDateTime, endDateTime, timezone, managerHostId: managerHostId || null }),
    });
    if (!res.ok) return { ownPushed: false, managerPushed: false };
    return await res.json();
  } catch {
    return { ownPushed: false, managerPushed: false };
  }
}

// Fallback when Google Calendar isn't connected: PaceLedger emails the
// meeting details (and Zoom link) itself — see send-appointment-invite.
export async function sendAppointmentInviteEmail(appointmentId, emails, updated = false) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { sent: false, error: 'not_signed_in' };
  try {
    const res = await fetch(`${supabase.supabaseUrl}/functions/v1/send-appointment-invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionData.session.access_token}`,
        apikey: supabase.supabaseKey,
      },
      body: JSON.stringify({ appointmentId, emails, updated }),
    });
    if (!res.ok) return { sent: false, error: 'request_failed' };
    return await res.json();
  } catch {
    return { sent: false, error: 'request_failed' };
  }
}

export const ZOOM_CLIENT_ID = 'QfE5XHQXRuyAaOPOY60bvg'; // Production client ID (works for any Zoom account now the app is published)

export function zoomOAuthUrl(accessToken) {
  const redirectUri = `${supabase.supabaseUrl}/functions/v1/zoom-oauth-callback`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: ZOOM_CLIENT_ID,
    redirect_uri: redirectUri,
    state: accessToken,
  });
  return `https://zoom.us/oauth/authorize?${params.toString()}`;
}

export async function connectZoom() { return connectProvider(zoomOAuthUrl); }

export async function fetchZoomConnectionStatus() { return fetchProviderConnectionStatus('zoom_connections', 'zoom_email', 'zoomEmail'); }

export async function disconnectZoom() { return disconnectProvider('zoom_connections'); }

// Calls the server-side function to actually create a real, unique Zoom
// meeting for this specific appointment via Zoom's API.
export async function createZoomMeeting({ topic, startTime, durationMinutes, timezone, hostUserId }) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { connected: false };
  try {
    const res = await fetch(`${supabase.supabaseUrl}/functions/v1/zoom-create-meeting`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionData.session.access_token}`,
        apikey: supabase.supabaseKey,
      },
      body: JSON.stringify({ topic, startTime, durationMinutes, timezone, hostUserId: hostUserId || null }),
    });
    if (!res.ok) return { connected: false };
    return await res.json();
  } catch {
    return { connected: false };
  }
}

export async function updateAppointmentZoomUrl(id, zoomUrl) {
  const { error } = await supabase.from('appointments').update({ zoom_url: zoomUrl }).eq('id', id);
  return !error;
}

export function googleEventTimeKey(e) {
  if (e.allDay) return '00:00';
  const d = new Date(e.start);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
