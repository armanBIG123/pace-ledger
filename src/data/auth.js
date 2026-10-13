// Signing out, deleting your own account, and reading a sign-up link's token.
import { supabase } from '../supabaseClient.js';
import { clearAppointmentReminders } from '../native.js';

// Signs out, first clearing this person's appointment reminders from the phone.
export async function signOut() {
  await clearAppointmentReminders();
  await supabase.auth.signOut();
}

// Deletes the signed-in person's account and everything they own. Done by
// a server function because only the server may remove a login.
export async function deleteMyAccount() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return { ok: false, error: 'not_signed_in' };
  try {
    const res = await fetch(`${supabase.supabaseUrl}/functions/v1/delete-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}`, apikey: supabase.supabaseKey },
      body: JSON.stringify({ confirm: 'DELETE' }),
    });
    const json = await res.json().catch(() => ({}));
    return res.ok && json.deleted ? { ok: true } : { ok: false, error: json.error || `http_${res.status}` };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

// ---------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// Sign-up is by invitation only: big-pace-ledger.com/?join=<token>.
// The link (made by the inviter, see invites.js) decides the new person's
// team; the database enforces it, so it can't be changed from the browser.
// ---------------------------------------------------------------------
export function readJoinToken() {
  return new URLSearchParams(window.location.search).get('join') || '';
}
