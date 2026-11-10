// Commissions from Minkoo's commission system (migration-commissions.sql,
// edge function commissions-ingest). Reads only: everything is written by
// the webhook. What you get back is what you're allowed to see.
import { supabase, SUPABASE_URL } from '../supabaseClient.js';
import { selectAll } from './paged.js';

const missing = e => !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202' || e.code === '42883'
  || /does not exist|could not find the (table|function)/i.test(e.message || ''));
export const NEEDS_UPDATE = 'Commissions need the database update (migration-commissions.sql) to be run first.';

// Lines that pay one person (you, or someone on your team).
// { lines, payouts } or { unavailable: true } before the database update.
export async function fetchPayFor(userId) {
  const [l, d] = await Promise.all([
    selectAll(o => supabase.from('commission_lines').select('*', o).eq('user_id', userId).order('record_id')),
    selectAll(o => supabase.from('commission_disbursements').select('*', o).eq('user_id', userId).order('record_id')),
  ]);
  const err = l.error || d.error;
  if (err) { if (!missing(err)) console.error(err); return missing(err) ? { unavailable: true } : { error: true }; }
  return { lines: l.data || [], payouts: d.data || [] };
}

// Everyone you can see, one row each: { user_id, agent_code, paid, coming, chargebacks, lines }.
export async function fetchPayTotals(from, to) {
  const { data, error } = await supabase.rpc('pl_commission_totals', { p_from: from, p_to: to });
  if (error) { if (!missing(error)) console.error(error); return missing(error) ? { unavailable: true } : { error: true }; }
  return { rows: (data || []).map(r => ({ ...r, paid: Number(r.paid) || 0, coming: Number(r.coming) || 0, chargebacks: Number(r.chargebacks) || 0, lines: Number(r.lines) || 0 })) };
}

// ---- super admins ---------------------------------------------------------
export async function fetchCommissionStatus() {
  const { data, error } = await supabase.rpc('pl_commission_status');
  if (error) { if (!missing(error)) console.error(error); return missing(error) ? { unavailable: true } : { error: true }; }
  return data || {};
}
export async function makeCommissionKey() {
  const { data, error } = await supabase.rpc('pl_commission_new_key');
  if (error) { console.error(error); return { ok: false, error: missing(error) ? NEEDS_UPDATE : "Couldn't make a key. Check your connection and try again." }; }
  return { ok: true, key: data };
}
// The test address's own key (supabase/migrations/…_commission_test_address.sql).
export async function makeCommissionTestKey() {
  const { data, error } = await supabase.rpc('pl_commission_new_test_key');
  if (error) { console.error(error); return { ok: false, error: missing(error) ? 'The test address needs its database update, which runs when its pull request is merged.' : "Couldn't make a test key. Check your connection and try again." }; }
  return { ok: true, key: data };
}
export async function fetchCommissionLog(limit = 15) {
  const { data, error } = await supabase.from('commission_receipts').select('*').order('id', { ascending: false }).limit(limit);
  if (error) { if (!missing(error)) console.error(error); return []; }
  return data || [];
}
export async function fetchUnmatchedCodes() {
  await supabase.rpc('pl_commission_rematch');
  const { data, error } = await supabase.rpc('pl_commission_unmatched');
  if (error) { if (!missing(error)) console.error(error); return []; }
  return (data || []).map(r => ({ ...r, lines: Number(r.lines) || 0, total: Number(r.total) || 0 }));
}
export async function linkCommissionCode(code, userId) {
  const { error } = await supabase.rpc('pl_commission_link_code', { p_code: code, p_user: userId || null });
  if (error) { console.error(error); return { ok: false, error: "Couldn't link it. Check your connection and try again." }; }
  return { ok: true };
}
export const webhookUrl = () => `${SUPABASE_URL}/functions/v1/commissions-ingest`;
// Fake data goes here: the same answer, nothing saved.
export const testWebhookUrl = () => `${SUPABASE_URL}/functions/v1/commissions-ingest-test`;
