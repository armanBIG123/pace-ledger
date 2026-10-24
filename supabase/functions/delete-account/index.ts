// Edge Function: delete-account
// Lets a signed-in person permanently delete their own PaceLedger account
// (Apple requires in-app account deletion for any app that lets people
// create an account), and lets a super admin delete someone else's
// account from Manage Team (send { confirm: 'DELETE', userId }).
//
// What happens:
//   1. Their Google Calendar and Zoom access is revoked with Google/Zoom.
//   2. Their login is deleted. Everything they own (profile, appointments,
//      prospects, notes, business plan, intake forms, connections) is
//      removed automatically by the database's "on delete cascade" rules;
//      records that merely mention them (e.g. as presenter) keep the record
//      and clear the link.
//
// Anyone who reported to the deleted person moves up to report to that
// person's own upline, so nobody drops out of the org chart.
//
// Safety: the only remaining admin can't be deleted (someone has to be
// able to manage the team), and only a super admin can delete someone
// else, or a Super Manager deleting an advisor or manager in their own
// solar system (migration-solar-systems.sql).
//
// Dashboard setting: "Verify JWT" OFF (this function checks the sign-in
// token itself; browsers' pre-flight requests carry no token).
// Run migration-account-deletion.sql first.
// Uses the built-in SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY, plus the existing ZOOM_CLIENT_ID /
// ZOOM_CLIENT_SECRET for revoking Zoom access (optional).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ZOOM_CLIENT_ID = Deno.env.get('ZOOM_CLIENT_ID') ?? '';
const ZOOM_CLIENT_SECRET = Deno.env.get('ZOOM_CLIENT_SECRET') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { ...CORS_HEADERS, ...NO_CACHE_HEADERS } });
  if (req.method !== 'POST') return json({ deleted: false, error: 'method_not_allowed' }, 405);

  // Who is asking?
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ deleted: false, error: 'invalid_session' }, 401);
  const authClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData?.user) return json({ deleted: false, error: 'invalid_session' }, 401);
  const callerId = userData.user.id;

  let body: { confirm?: unknown; userId?: unknown } = {};
  try { body = await req.json(); } catch { /* handled below */ }
  if (body.confirm !== 'DELETE') return json({ deleted: false, error: 'not_confirmed' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Deleting someone else? Only a super admin may.
  const requested = typeof body.userId === 'string' && body.userId ? body.userId : callerId;
  if (requested !== callerId) {
    const { data: caller } = await admin.from('profiles').select('*').eq('id', callerId).maybeSingle();
    const { data: target } = await admin.from('profiles').select('*').eq('id', requested).maybeSingle();
    const superManagerMay = caller?.role === 'super_manager' && !!target
      && (target.solar_system_id ?? null) === (caller.solar_system_id ?? null)
      && (target.role === 'advisor' || target.role === 'manager');
    if (caller?.role !== 'super_admin' && !superManagerMay) return json({ deleted: false, error: 'not_allowed' }, 403);
  }
  const userId = requested;

  // Never remove the last admin.
  const { data: me } = await admin.from('profiles').select('role, manager_id').eq('id', userId).maybeSingle();
  if (requested !== callerId && !me) {
    // No profile: still remove the login if one exists.
    const { error } = await admin.auth.admin.deleteUser(userId);
    return error ? json({ deleted: false, error: 'not_found' }, 404) : json({ deleted: true });
  }
  if (me?.role === 'super_admin') {
    const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true })
      .eq('role', 'super_admin').neq('id', userId);
    if (!count) return json({ deleted: false, error: 'last_admin' }, 409);
  }

  // Their direct reports move up to their upline (or to nobody).
  await admin.from('profiles').update({ manager_id: me?.manager_id ?? null }).eq('manager_id', userId);

  // Revoke third-party access first (best effort — the stored tokens are
  // deleted with the account either way).
  try {
    const { data: g } = await admin.from('google_calendar_connections')
      .select('refresh_token, access_token').eq('user_id', userId).maybeSingle();
    const gToken = g?.refresh_token || g?.access_token;
    if (gToken) {
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: gToken }),
      });
    }
  } catch { /* continue */ }
  try {
    const { data: z } = await admin.from('zoom_connections').select('refresh_token, access_token').eq('user_id', userId).maybeSingle();
    const zToken = z?.refresh_token || z?.access_token;
    if (zToken && ZOOM_CLIENT_ID && ZOOM_CLIENT_SECRET) {
      await fetch('https://zoom.us/oauth/revoke', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ token: zToken }),
      });
    }
  } catch { /* continue */ }

  // Files they uploaded stay for the team but stop being owned by this
  // login (otherwise the login can't be deleted).
  await admin.rpc('release_user_storage', { target: userId });

  // Delete the login; the database cascades the rest.
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) return json({ deleted: false, error: 'delete_failed' }, 500);

  return json({ deleted: true });
});
