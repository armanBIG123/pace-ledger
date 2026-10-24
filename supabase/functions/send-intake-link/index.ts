// Edge Function: send-intake-link
// Emails a client their intake form link, so an advisor can send it straight
// from PaceLedger (the send window: Email it) instead of copying the link
// into an email themselves.
//
// Uses the same Resend setup as send-appointment-invite and
// send-recruit-invite:
//   RESEND_API_KEY      — from resend.com -> API Keys
//   INVITE_FROM_EMAIL   — e.g. "PaceLedger <invites@big-pace-ledger.com>"
//   APP_URL             — https://big-pace-ledger.com (the link's address)
//
// Needs migration-intake-sending.sql (sent_at, sent_via, emailed_at,
// email_send_count on client_intake_candidates). With
// migration-solar-systems.sql, the email carries the advisor's own agency
// name (e.g. Big Huge Business), and a Super Manager can send for their
// own solar system.
//
// Security: the form is loaded server-side and must belong to the signed-in
// caller (or they're a super admin), and must not be filled in yet. The link
// is built here from APP_URL and the stored token, never taken from the
// browser. Limits: one email per form per minute, 5 per form, and 50 forms
// emailed per person per day.
//
// Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function ->
// Via Editor, name it send-intake-link, paste this file, Deploy.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const INVITE_FROM_EMAIL = Deno.env.get('INVITE_FROM_EMAIL') || '';
const APP_URL = (Deno.env.get('APP_URL') || 'https://big-pace-ledger.com').replace(/\/+$/, '');
const DEFAULT_AGENCY = 'Big Insurance Network';

// The email holds a personal link, which must never land in a browser cache.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
  'Pragma': 'no-cache',
  'Expires': '0',
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DAILY_CAP = 50;
const PER_FORM_CAP = 5;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}
function esc(s: string) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const authClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: userData, error: userErr } = await authClient.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ sent: false, error: 'Not authenticated' }, 401);
    const userId = userData.user.id;

    if (!RESEND_API_KEY || !INVITE_FROM_EMAIL) return json({ sent: false, error: 'email_not_configured' });

    const { candidateId, email } = await req.json();
    const to = String(email ?? '').trim().toLowerCase();
    if (!candidateId || !EMAIL_RE.test(to) || to.length > 254) return json({ sent: false, error: 'bad_email' });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: form } = await admin.from('client_intake_candidates').select('*').eq('id', candidateId).maybeSingle();
    if (!form) return json({ sent: false, error: 'not_found' }, 404);
    const { data: me } = await admin.from('profiles').select('*').eq('id', userId).maybeSingle();
    const { data: owner } = await admin.from('profiles').select('*').eq('id', form.advisor_id).maybeSingle();
    const sameSystem = !!me && !!owner && (me.solar_system_id ?? null) === (owner.solar_system_id ?? null);
    if (form.advisor_id !== userId && me?.role !== 'super_admin' && !(me?.role === 'super_manager' && sameSystem)) {
      return json({ sent: false, error: 'not_found' }, 404);
    }
    // The advisor's agency (their solar system), or Big Insurance Network.
    let AGENCY = DEFAULT_AGENCY;
    if (owner?.solar_system_id) {
      const { data: sys } = await admin.from('solar_systems').select('email_name').eq('id', owner.solar_system_id).maybeSingle();
      if (sys?.email_name) AGENCY = sys.email_name;
    }
    if (form.status === 'submitted') return json({ sent: false, error: 'already_received' });
    if ((form.email_send_count || 0) >= PER_FORM_CAP) return json({ sent: false, error: 'form_limit' });

    // At most DAILY_CAP forms emailed per person per 24 hours.
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count: sentToday } = await admin.from('client_intake_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('advisor_id', form.advisor_id).gte('emailed_at', since).neq('id', form.id);
    if ((sentToday || 0) >= DAILY_CAP) return json({ sent: false, error: 'daily_limit' });

    // One email per form per minute, claimed atomically so a double tap
    // can't send it twice.
    const previousEmailedAt = form.emailed_at;
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { data: claimed } = await admin.from('client_intake_candidates')
      .update({ emailed_at: new Date().toISOString() })
      .eq('id', form.id)
      .or(`emailed_at.is.null,emailed_at.lt.${oneMinuteAgo}`)
      .select('id');
    if (!claimed || claimed.length === 0) return json({ sent: false, error: 'too_soon' });

    // The meeting, if it's still ahead: "before we meet Thursday, October 29 at 6:30 PM".
    let meeting = '';
    if (form.source_appointment_id) {
      const { data: appt } = await admin.from('appointments').select('appointment_at, appointment_timezone').eq('id', form.source_appointment_id).maybeSingle();
      if (appt?.appointment_at && new Date(appt.appointment_at).getTime() > Date.now()) {
        const tz = appt.appointment_timezone || 'America/Chicago';
        try {
          meeting = new Date(appt.appointment_at).toLocaleString('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
        } catch {
          meeting = '';
        }
      }
    }

    const advisorName = me?.display_name || form.advisor_name || 'Your advisor';
    const advisorFirst = String(advisorName).trim().split(/\s+/)[0];
    const replyTo = me?.email || userData.user.email || undefined;
    const link = `${APP_URL}/?intake=${form.token}`;
    const first = String(form.client_name || '').trim().split(/\s+/)[0];
    const why = meeting
      ? `Before we meet on ${meeting}, could you fill in this short form?`
      : 'Thanks for meeting with us. Could you fill in this short form so we can put your plan together?';
    const subject = meeting ? `A short form before your meeting with ${advisorFirst}` : `Your intake form from ${advisorName}`;
    const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#EFEBDF;font-family:Arial,Helvetica,sans-serif;color:#33414D">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;padding:28px 26px">
<p style="margin:0 0 6px;font-size:13px;color:#7C8998">${esc(AGENCY)}</p>
<h1 style="margin:0 0 16px;font-size:20px;color:#14202B">Your intake form</h1>
<p style="margin:0 0 14px;font-size:15px">Hi ${esc(first || 'there')},</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5">It's ${esc(advisorName)} with ${esc(AGENCY)}. ${esc(why)} It takes about 10 minutes, and your answers save as you go, so you can stop and finish later.</p>
<p style="margin:0 0 20px"><a href="${esc(link)}" style="display:inline-block;background:#C9A24B;color:#14202B;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:7px">Fill in the form</a></p>
<p style="margin:0 0 20px;font-size:12px;color:#7C8998;word-break:break-all">Or copy this link: ${esc(link)}</p>
<p style="margin:0;font-size:13px;color:#7C8998">This link is personal to you, so please don't forward it. Questions? Just reply to this email.</p>
</div></body></html>`;
    const text = `Hi ${first || 'there'},\n\nIt's ${advisorName} with ${AGENCY}. ${why} It takes about 10 minutes, and your answers save as you go:\n${link}\n\nThis link is personal to you, so please don't forward it. Questions? Just reply to this email.`;

    const payload = JSON.stringify({ from: INVITE_FROM_EMAIL, to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) });
    let ok = false;
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: payload,
      });
      if (res.ok) { ok = true; break; }
      console.error('resend error', res.status, await res.text());
      if (res.status !== 429) break;
      await new Promise(r => setTimeout(r, 1100));
    }
    if (!ok) {
      // Nothing went out: release the claim so they can try again.
      await admin.from('client_intake_candidates').update({ emailed_at: previousEmailedAt }).eq('id', form.id);
      return json({ sent: false, error: 'send_failed' });
    }

    const sentAt = new Date().toISOString();
    await admin.from('client_intake_candidates').update({
      sent_at: sentAt, sent_via: 'email', emailed_at: sentAt, email_send_count: (form.email_send_count || 0) + 1,
    }).eq('id', form.id);

    return json({ sent: true, emailedTo: to, emailedAt: sentAt });
  } catch (err) {
    console.error(err);
    return json({ sent: false, error: 'unexpected_error' }, 500);
  }
});
