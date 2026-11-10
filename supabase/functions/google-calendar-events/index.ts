// Edge Function: google-calendar-events
// Called by the app whenever the Calendar tab needs a person's Google
// events for the visible month. Automatically refreshes their access
// token using the stored refresh_token when it's expired — this is the
// piece that makes the connection last indefinitely instead of ~1 hour.
//
// Deploy with: supabase functions deploy google-calendar-events

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// Responses here carry the user's actual Google Calendar event details,
// so every one of these three headers is set to stop them from ever
// landing in a browser's on-disk HTTP cache — same fix applied to
// zoom-create-meeting after Zoom's Marketplace security review flagged
// that endpoint for exactly this ("Cacheable HTTPS Response").
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
  'Pragma': 'no-cache',
  'Expires': '0',
};

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
    const { startDate, endDate } = await req.json();

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: conn } = await admin
      .from('google_calendar_connections').select('*').eq('user_id', userId).maybeSingle();

    if (!conn) {
      return new Response(JSON.stringify({ connected: false, events: [] }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    let accessToken = conn.access_token as string | null;
    const expiresAt = conn.access_token_expires_at ? new Date(conn.access_token_expires_at).getTime() : 0;

    // Refresh if missing or expiring within a minute.
    if (!accessToken || expiresAt < Date.now() + 60_000) {
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
        // Refresh token was likely revoked (e.g. they removed access in
        // their Google account) — clear the stale connection so the app
        // shows "Not connected" instead of silently failing forever.
        await admin.from('google_calendar_connections').delete().eq('user_id', userId);
        return new Response(JSON.stringify({ connected: false, events: [], error: 'reconnect_required' }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
      accessToken = refreshJson.access_token;
      const newExpiresAt = new Date(Date.now() + (refreshJson.expires_in ?? 3600) * 1000).toISOString();
      await admin.from('google_calendar_connections')
        .update({ access_token: accessToken, access_token_expires_at: newExpiresAt }).eq('user_id', userId);
    }

    const timeMin = new Date(`${startDate}T00:00:00Z`).toISOString();
    const timeMax = new Date(`${endDate}T23:59:59Z`).toISOString();
    const evRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=250`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const evJson = await evRes.json();
    if (!evRes.ok) {
      return new Response(JSON.stringify({ connected: true, events: [], error: 'fetch_failed' }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const events = (evJson.items || []).map((e: any) => ({
      id: e.id,
      title: e.summary || '(No title)',
      start: e.start?.dateTime || e.start?.date,
      allDay: !e.start?.dateTime,
      htmlLink: e.htmlLink,
    }));

    return new Response(JSON.stringify({ connected: true, googleEmail: conn.google_email, events }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
