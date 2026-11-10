// Edge Function: zoom-oauth-callback
// Zoom redirects here after someone approves meeting-creation access. This
// exchanges the one-time code for real tokens using the client secret — the
// one step that can never happen in the browser — and stores them for that
// person only.
//
// Deploy with: supabase functions deploy zoom-oauth-callback --no-verify-jwt
// (--no-verify-jwt because Zoom calls this URL directly, not your app, so
// there's no Supabase session on the request itself; the person is instead
// verified via the `state` value below.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ZOOM_CLIENT_ID = Deno.env.get('ZOOM_CLIENT_ID')!;
const ZOOM_CLIENT_SECRET = Deno.env.get('ZOOM_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const APP_URL = Deno.env.get('APP_URL') ?? 'https://pace-ledger.arman-716.workers.dev';

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state'); // the connecting user's Supabase access token
  const oauthError = url.searchParams.get('error');

  if (oauthError) {
    return Response.redirect(`${APP_URL}/?zoom=error&reason=${encodeURIComponent(oauthError)}`, 302);
  }
  if (!code || !state) {
    return Response.redirect(`${APP_URL}/?zoom=error&reason=missing_params`, 302);
  }

  // Confirm who's connecting, using the access token they sent as `state`.
  const authClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: userData, error: userErr } = await authClient.auth.getUser(state);
  if (userErr || !userData?.user) {
    return Response.redirect(`${APP_URL}/?zoom=error&reason=invalid_session`, 302);
  }
  const userId = userData.user.id;

  // Exchange the one-time code for real tokens. Zoom uses HTTP Basic auth
  // (client_id:client_secret) for this step, unlike Google.
  const redirectUri = `${SUPABASE_URL}/functions/v1/zoom-oauth-callback`;
  const basicAuth = btoa(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`);
  const tokenRes = await fetch('https://zoom.us/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    return Response.redirect(`${APP_URL}/?zoom=error&reason=token_exchange_failed`, 302);
  }

  // Look up the connected Zoom account's email, just for display.
  let zoomEmail: string | null = null;
  try {
    const meRes = await fetch('https://api.zoom.us/v2/users/me', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (meRes.ok) zoomEmail = (await meRes.json()).email ?? null;
  } catch { /* not fatal if this fails */ }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Zoom always issues a refresh_token on this step, but fall back safely
  // to any existing one on file just in case.
  let refreshToken = tokenJson.refresh_token as string | undefined;
  if (!refreshToken) {
    const { data: existing } = await admin
      .from('zoom_connections').select('refresh_token').eq('user_id', userId).maybeSingle();
    refreshToken = existing?.refresh_token;
  }
  if (!refreshToken) {
    return Response.redirect(`${APP_URL}/?zoom=error&reason=no_refresh_token`, 302);
  }

  const expiresAt = new Date(Date.now() + (tokenJson.expires_in ?? 3600) * 1000).toISOString();

  const { error: dbErr } = await admin.from('zoom_connections').upsert({
    user_id: userId,
    refresh_token: refreshToken,
    access_token: tokenJson.access_token,
    access_token_expires_at: expiresAt,
    zoom_email: zoomEmail,
    connected_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  if (dbErr) {
    return Response.redirect(`${APP_URL}/?zoom=error&reason=db_error`, 302);
  }

  return Response.redirect(`${APP_URL}/?zoom=connected`, 302);
});
