// Promotion submissions: a direct manager submits someone's promotion for
// approval (which emails the agency), then a super admin approves it or
// sends it back. See migration-promotion-requests.sql and the
// submit-promotion function.
import { supabase } from '../supabaseClient.js';
import { requirementView } from '../lib/milestones.js';

// Where promotion submissions are emailed (set by the submit-promotion
// function; shown here so people know before they submit).
export const AGENCY_EMAIL = 'agency@biginsurancenetwork.com';

const missing = error => !!error && (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message || ''));

// The latest submission for each person (newest first), keyed by user id.
export async function fetchPromotionRequests(userIds) {
  if (!userIds.length) return { byUser: new Map() };
  const { data, error } = await supabase.from('promotion_requests').select('*')
    .in('user_id', userIds).order('submitted_at', { ascending: false }).limit(1000);
  if (error) { if (!missing(error)) console.error(error); return { byUser: new Map(), missingTable: missing(error), error: true }; }
  const byUser = new Map();
  (data || []).forEach(r => { if (!byUser.has(r.user_id)) byUser.set(r.user_id, r); });
  return { byUser };
}

// The results that earned it, in the words the email uses.
export function resultsForEmail(progress) {
  return progress.results.map(req => {
    const v = requirementView(req);
    if (req.type === 'licensed') return { label: 'Licensed', result: req.met ? 'NPN and F&G writing number on file' : 'Not yet', met: !!req.met };
    if (req.kind === 'money-consecutive') {
      const months = (v.months || []).map(m => `${m.label} ${m.value}`).join(', ');
      return { label: v.label, result: `${v.value}${months ? ` (${months})` : ''}`, met: !!req.met };
    }
    return { label: v.label, result: v.value, met: !!req.met };
  });
}

async function callSubmit(body) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { submitted: false, error: 'not_signed_in' };
  try {
    const res = await fetch(`${supabase.supabaseUrl}/functions/v1/submit-promotion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionData.session.access_token}`,
        apikey: supabase.supabaseKey,
      },
      body: JSON.stringify(body),
    });
    const out = await res.json().catch(() => null);
    if (!out || typeof out.submitted !== 'boolean') return { submitted: false, error: res.status === 404 ? 'function_missing' : 'request_failed' };
    return out;
  } catch {
    return { submitted: false, error: 'request_failed' };
  }
}

export function submitPromotion(member, progress) {
  return callSubmit({ advisorId: member.id, toTier: progress.nextTier.key, results: resultsForEmail(progress) });
}

export function resendPromotionEmail(requestId) {
  return callSubmit({ requestId });
}

export async function approvePromotionRequest(requestId) {
  const { data, error } = await supabase.rpc('approve_promotion', { p_request: requestId });
  if (error) return { ok: false, error: error.message };
  return { ok: true, row: data };
}

export async function sendBackPromotion(requestId, note) {
  const { data, error } = await supabase.rpc('send_back_promotion', { p_request: requestId, p_note: note || '' });
  if (error) return { ok: false, error: error.message };
  return { ok: true, row: data };
}

// Plain words for what went wrong.
export function submitErrorText(error) {
  switch (error) {
    case 'not_direct_manager': return 'Only their direct manager (or a super admin) can submit this.';
    case 'level_changed': return 'Their level changed. Refresh and check again.';
    case 'not_ready': return 'Not every requirement is met yet.';
    case 'email_not_configured': return 'Email isn\'t set up yet, so the agency wasn\'t emailed.';
    case 'daily_limit': return 'You\'ve hit today\'s limit for promotion emails. Try again tomorrow.';
    case 'send_failed': return 'The email to the agency didn\'t go through.';
    case 'function_missing': return 'Promotion submissions aren\'t switched on yet (the submit-promotion function isn\'t deployed).';
    case 'not_signed_in': return 'You\'re signed out. Sign in and try again.';
    default: return 'Something went wrong. Try again in a minute.';
  }
}
