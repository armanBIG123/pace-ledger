// ---------------------------------------------------------------------
// Invitation links — the only way to create a PaceLedger account.
// A link is single-use, expires after 30 days, and decides which team the
// new person joins (the person who made it is their direct upline).
// ---------------------------------------------------------------------
import { supabase } from './supabaseClient.js';
import { tidyName } from './lib/names.js';
import { publicBaseUrl } from './native.js';

export function buildInviteLink(token) {
  return `${publicBaseUrl()}?join=${token}`;
}

export function inviteState(inv) {
  if (!inv) return 'none';
  if (inv.used_at) return 'used';
  if (new Date(inv.expires_at).getTime() < Date.now()) return 'expired';
  return 'active';
}

// Most recent link I made for this recruit appointment (or null).
export async function fetchInviteForAppointment(appointmentId) {
  const { data, error } = await supabase
    .from('recruit_invites').select('*')
    .eq('appointment_id', appointmentId)
    .order('created_at', { ascending: false }).limit(1);
  if (error) { console.error(error); return null; }
  return data && data[0] ? data[0] : null;
}

// Creates a new link that puts the person directly under `uplineId`.
export async function createInvite({ uplineId, createdBy, inviteeName, appointmentId }) {
  // The database fills in the token, dates and status itself.
  const row = {
    upline_id: uplineId,
    created_by: createdBy,
    invitee_name: tidyName(inviteeName || '') || null,
    appointment_id: appointmentId || null,
  };
  const { data, error } = await supabase.from('recruit_invites').insert(row).select().single();
  if (error) { console.error(error); return { ok: false, error: error.message }; }
  return { ok: true, invite: data };
}

// What the sign-up page shows for a link: { valid, reason?, inviteeName,
// uplineName, aboveUpline[] }.
export async function fetchInvitePreview(token) {
  if (!token || token.length < 32) return { valid: false, reason: 'not_found' };
  const { data, error } = await supabase.rpc('get_signup_invite', { p_token: token });
  if (error || !data) return { valid: false, reason: 'error' };
  return data;
}

// Emails the sign-up link to `email` (see send-recruit-invite). Returns
// { sent: true, emailedTo, emailedAt } or { sent: false, error }.
export async function emailInvite(inviteId, email) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { sent: false, error: 'not_signed_in' };
  try {
    const res = await fetch(`${supabase.supabaseUrl}/functions/v1/send-recruit-invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionData.session.access_token}`,
        apikey: supabase.supabaseKey,
      },
      body: JSON.stringify({ inviteId, email }),
    });
    const json = await res.json().catch(() => ({}));
    return res.ok ? json : { sent: false, error: json.error || 'request_failed' };
  } catch {
    return { sent: false, error: 'request_failed' };
  }
}
