// Daily and weekly email reports (migration-activity-reports.sql, edge
// function activity-report). Super admins only.
import { supabase } from '../supabaseClient.js';

const missing = e => !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202' || e.code === '42883'
  || /does not exist|could not find the (table|function)/i.test(e.message || ''));
export const REPORTS_NEED_UPDATE = 'Email reports need the database update (migration-activity-reports.sql) to be run first.';

// { settings, sends } | { unavailable: true } | { error: true }
export async function fetchReportSettings() {
  const [s, sends] = await Promise.all([
    supabase.from('report_settings').select('*').eq('id', true).maybeSingle(),
    supabase.from('report_sends').select('*').eq('status', 'sent').order('created_at', { ascending: false }).limit(30),
  ]);
  if (s.error) { if (!missing(s.error)) console.error(s.error); return missing(s.error) ? { unavailable: true } : { error: true }; }
  if (!s.data) return { unavailable: true };
  return { settings: s.data, sends: sends.error ? [] : sends.data || [] };
}

export async function saveReportSettings({ recipients, daily, weekly }) {
  const { data, error } = await supabase.rpc('pl_report_save_settings', { p_recipients: recipients, p_daily: daily, p_weekly: weekly });
  if (error) {
    const m = error.message || '';
    const bad = m.match(/bad_email: (.+)$/);
    if (bad) return { ok: false, error: `“${bad[1]}” isn’t an email address.` };
    if (/too_many/.test(m)) return { ok: false, error: 'Up to 20 people can get the reports.' };
    if (missing(error)) return { ok: false, error: REPORTS_NEED_UPDATE };
    console.error(error);
    return { ok: false, error: "Couldn't save. Check your connection and try again." };
  }
  return { ok: true, settings: data };
}

const WORDS = {
  needs_update: REPORTS_NEED_UPDATE,
  email_not_configured: "Email isn't set up for PaceLedger yet (RESEND_API_KEY and INVITE_FROM_EMAIL).",
  daily_limit: "That's 10 test emails today. Try again tomorrow.",
  no_email: "Your account doesn't have an email address to send the test to.",
  not_allowed: 'Only super admins can do this.',
};
async function call(body) {
  try {
    const { data, error } = await supabase.functions.invoke('activity-report', { body });
    if (!error) return data && data.ok ? { ok: true, ...data } : { ok: false, error: WORDS[data && data.error] || "Couldn't do that. Try again in a minute." };
    let payload = null;
    try { payload = error.context && typeof error.context.json === 'function' ? await error.context.json() : null; } catch { /* not JSON */ }
    const code = payload && payload.error;
    if (!code && /not found|failed to send/i.test(error.message || '')) return { ok: false, error: 'The activity-report edge function isn’t deployed yet.' };
    return { ok: false, error: WORDS[code] || "Couldn't do that. Try again in a minute." };
  } catch {
    return { ok: false, error: 'Check your connection and try again.' };
  }
}
// The latest daily (yesterday) or weekly (last Saturday to Friday), not sent.
export const previewReport = kind => call({ action: 'preview', kind });
// The same, emailed only to you.
export const sendTestReport = kind => call({ action: 'send-test', kind });

export const isEmail = s => /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i.test(String(s || '').trim());
