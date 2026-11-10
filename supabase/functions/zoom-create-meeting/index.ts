// Edge Function: zoom-create-meeting
// Called by the app right after a new appointment is logged, if the
// logged-in person has Zoom connected — or if they picked a specific
// presenting manager, in which case that manager's connected Zoom is used
// instead (verified server-side to actually be a manager/super_admin, so
// this can't be used to borrow anyone else's account). Creates a real,
// unique Zoom meeting via Zoom's API and returns its join link, refreshing
// the access token first if needed.
//
// Important Zoom-specific detail: unlike Google, Zoom ROTATES the refresh
// token every time it's used — the old one stops working the moment a new
// access token is issued. This function always saves the new refresh_token
// it gets back, never just the access_token, or the connection would break
// after the very next use.
//
// Deploy with: supabase functions deploy zoom-create-meeting

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ZOOM_CLIENT_ID = Deno.env.get('ZOOM_CLIENT_ID')!;
const ZOOM_CLIENT_SECRET = Deno.env.get('ZOOM_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// Bundles CORS + no-cache headers together since every response below
// spreads this object — responses here carry a live Zoom join link, so
// every one of the three headers below is set to stop it from ever
// landing in a browser's on-disk HTTP cache (flagged by Zoom's Marketplace
// security review as "Cacheable HTTPS Response" against this exact
// endpoint — Cache-Control alone wasn't showing up on the deployed
// function, so all three belt-and-suspenders headers are set here).
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
  'Pragma': 'no-cache',
  'Expires': '0',
};

async function refreshZoomToken(admin: any, userId: string, refreshToken: string) {
  const basicAuth = btoa(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`);
  const res = await fetch('https://zoom.us/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basicAuth}` },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) return null;
  const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString();
  await admin.from('zoom_connections').update({
    access_token: json.access_token,
    access_token_expires_at: expiresAt,
    refresh_token: json.refresh_token || refreshToken, // Zoom rotates this — must persist the new one
  }).eq('user_id', userId);
  return json.access_token as string;
}

Deno.serve(async (req: Request) => {
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
    const { topic, startTime, durationMinutes, timezone, hostUserId } = await req.json();

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // If a presenting manager was picked, use their connected Zoom instead
    // of the caller's own — but verify server-side that the target really
    // is a manager/super_admin first, so this can't be used to borrow just
    // anyone's Zoom account by tampering with the request.
    let effectiveUserId = userId;
    if (hostUserId && hostUserId !== userId) {
      const { data: targetProfile } = await admin
        .from('profiles').select('role').eq('id', hostUserId).maybeSingle();
      if (targetProfile && (targetProfile.role === 'manager' || targetProfile.role === 'super_admin')) {
        effectiveUserId = hostUserId;
      }
    }

    const { data: conn } = await admin
      .from('zoom_connections').select('*').eq('user_id', effectiveUserId).maybeSingle();

    if (!conn) {
      return new Response(JSON.stringify({ connected: false }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    let accessToken = conn.access_token as string | null;
    const expiresAt = conn.access_token_expires_at ? new Date(conn.access_token_expires_at).getTime() : 0;

    if (!accessToken || expiresAt < Date.now() + 60_000) {
      accessToken = await refreshZoomToken(admin, effectiveUserId, conn.refresh_token);
      if (!accessToken) {
        // Refresh token was likely revoked (e.g. removed access in Zoom) —
        // clear the stale connection so the app shows "Not connected"
        // instead of silently failing on every future appointment.
        await admin.from('zoom_connections').delete().eq('user_id', effectiveUserId);
        return new Response(JSON.stringify({ connected: false, error: 'reconnect_required' }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    const meetingRes = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: topic || 'PaceLedger appointment',
        type: 2, // scheduled meeting
        start_time: startTime, // local time for `timezone` below, no UTC offset
        duration: durationMinutes || 30,
        timezone: timezone || 'UTC',
        settings: { join_before_host: true, waiting_room: false },
      }),
    });
    const meetingJson = await meetingRes.json();
    if (!meetingRes.ok) {
      return new Response(JSON.stringify({ connected: true, error: meetingJson?.message || 'meeting_create_failed' }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ connected: true, joinUrl: meetingJson.join_url, meetingId: meetingJson.id }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
