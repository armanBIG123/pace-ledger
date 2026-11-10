// Edge Function: google-oauth-callback
// Finishes connecting someone's Google Calendar. It exchanges Google's
// one-time code for real tokens using the client secret — the one step
// that can never happen in the browser — and stores them for that person
// only.
//
// How it's called (current flow):
//   Google sends the person back to the PaceLedger site itself
//   (https://big-pace-ledger.com/?code=...&state=...). The app checks the
//   `state` value, then POSTs { code, redirectUri } here with the person's
//   normal sign-in token in the Authorization header. That keeps every
//   redirect on a domain we own and have verified with Google, which
//   Google's app verification requires.
//
// The older GET flow (Google redirecting straight to this function, with
// the sign-in token in `state`) still works during the switch-over, but
// stops being used once the supabase.co redirect URI is removed from the
// Google Cloud Console.
//
// Dashboard setting: "Verify JWT" OFF (this function checks the sign-in
// token itself, and browsers' pre-flight requests carry no token).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://big-pace-ledger.com').replace(/\/+$/, '');

// What the app asks for now (events on calendars the person owns), plus
// the broader scope people granted before — either is enough.
const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.owned',
  'https://www.googleapis.com/auth/calendar.events',
];

// Give back a token we've decided not to keep, so it doesn't linger at Google.
async function revokeQuietly(token: string | undefined) {
  if (!token) return;
  try {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    });
  } catch { /* best effort */ }
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
  Pragma: 'no-cache',
  Expires: '0',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, ...NO_CACHE_HEADERS, 'Content-Type': 'application/json' },
  });
}

// Only the site's own root address is accepted as the redirect. Google
// separately refuses any redirect that isn't registered in the Cloud
// Console, so this is a second, belt-and-braces check.
function isAllowedRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    const secure = u.protocol === 'https:' || (u.protocol === 'http:' && u.hostname === 'localhost');
    return secure && u.pathname === '/' && !u.search && !u.hash;
  } catch {
    return false;
  }
}

type Result = { ok: true } | { ok: false; reason: string };

async function connectForUser(userId: string, code: string, redirectUri: string): Promise<Result> {
  // Exchange the one-time code for real tokens.
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const tokenJson = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenJson.access_token) return { ok: false, reason: 'token_exchange_failed' };

  // Make sure calendar access was actually granted.
  const granted = String(tokenJson.scope ?? '').split(' ');
  if (!CALENDAR_SCOPES.some(s => granted.includes(s))) {
    await revokeQuietly(tokenJson.refresh_token || tokenJson.access_token);
    return { ok: false, reason: 'calendar_permission_not_granted' };
  }

  // Which Google account was connected, just for display ("Connected as
  // ..."). The primary calendar's title is the account's email by default;
  // this uses only the calendar permission the person just granted.
  let googleEmail: string | null = null;
  try {
    const calRes = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1&fields=summary',
      { headers: { Authorization: `Bearer ${tokenJson.access_token}` } },
    );
    if (calRes.ok) {
      const summary = (await calRes.json()).summary;
      if (typeof summary === 'string' && summary.includes('@')) googleEmail = summary;
    }
  } catch { /* not fatal if this fails */ }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Google only sends a refresh_token on first consent. If this is a
  // reconnect and it's missing, keep the one already on file.
  let refreshToken = tokenJson.refresh_token as string | undefined;
  if (!refreshToken) {
    const { data: existing } = await admin
      .from('google_calendar_connections').select('refresh_token').eq('user_id', userId).maybeSingle();
    refreshToken = existing?.refresh_token;
  }
  if (!refreshToken) {
    await revokeQuietly(tokenJson.access_token);
    return { ok: false, reason: 'no_refresh_token' };
  }

  const expiresAt = new Date(Date.now() + (tokenJson.expires_in ?? 3600) * 1000).toISOString();
  const { error: dbErr } = await admin.from('google_calendar_connections').upsert({
    user_id: userId,
    refresh_token: refreshToken,
    access_token: tokenJson.access_token,
    access_token_expires_at: expiresAt,
    google_email: googleEmail, // null if it couldn't be looked up, so a reconnect never shows a stale address
    connected_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (dbErr) return { ok: false, reason: 'db_error' };
  return { ok: true };
}

async function userIdFromToken(token: string | null): Promise<string | null> {
  if (!token) return null;
  const authClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { ...CORS_HEADERS, ...NO_CACHE_HEADERS } });

  // ---- Current flow: the app posts the code here --------------------
  if (req.method === 'POST') {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userId = await userIdFromToken(authHeader.replace(/^Bearer\s+/i, '') || null);
    if (!userId) return json({ connected: false, error: 'invalid_session' }, 401);

    let body: { action?: unknown; code?: unknown; redirectUri?: unknown } = {};
    try { body = await req.json(); } catch { /* handled below */ }

    // Disconnect: revoke PaceLedger's access at Google, then delete the
    // stored tokens. The row is deleted even if Google's revoke call fails
    // (e.g. the person already removed access from their Google Account).
    if (body.action === 'disconnect') {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      const { data: existing } = await admin
        .from('google_calendar_connections').select('refresh_token, access_token').eq('user_id', userId).maybeSingle();
      const token = existing?.refresh_token || existing?.access_token;
      let revoked = false;
      if (token) {
        try {
          const r = await fetch('https://oauth2.googleapis.com/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token }),
          });
          revoked = r.ok;
        } catch { /* still delete below */ }
      }
      const { error: delErr } = await admin.from('google_calendar_connections').delete().eq('user_id', userId);
      if (delErr) return json({ disconnected: false, error: 'db_error' }, 500);
      return json({ disconnected: true, revoked });
    }

    const code = typeof body.code === 'string' ? body.code : '';
    const redirectUri = typeof body.redirectUri === 'string' ? body.redirectUri : '';
    if (!code || code.length > 2048) return json({ connected: false, error: 'missing_code' }, 400);
    if (!isAllowedRedirect(redirectUri)) return json({ connected: false, error: 'bad_redirect' }, 400);

    const result = await connectForUser(userId, code, redirectUri);
    return result.ok ? json({ connected: true }) : json({ connected: false, error: result.reason }, 400);
  }

  // ---- Older flow: Google redirects straight here (GET) -------------
  const url = new URL(req.url);
  const back = (q: string) =>
    new Response(null, { status: 302, headers: { ...NO_CACHE_HEADERS, Location: `${APP_URL}/?${q}` } });
  const oauthError = url.searchParams.get('error');
  if (oauthError) return back(`google=error&reason=${encodeURIComponent(oauthError)}`);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return back('google=error&reason=missing_params');
  const userId = await userIdFromToken(state);
  if (!userId) return back('google=error&reason=invalid_session');
  const result = await connectForUser(userId, code, `${SUPABASE_URL}/functions/v1/google-oauth-callback`);
  return result.ok ? back('google=connected') : back(`google=error&reason=${result.reason}`);
});
