// ---------------------------------------------------------------------
// Invitation links — the only way to create a PaceLedger account.
// A link is single-use, expires after 30 days, and decides which team the
// new person joins (the person who made it is their direct upline).
// ---------------------------------------------------------------------
import { supabase } from './supabaseClient.js';
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
    invitee_name: (inviteeName || '').trim() || null,
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
