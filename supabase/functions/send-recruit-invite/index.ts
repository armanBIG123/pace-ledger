// Edge Function: send-recruit-invite
// Emails a recruit their personal PaceLedger sign-up link, so the person
// who made the link can send it straight from the app instead of copying
// it into a text or email themselves.
//
// Uses the same Resend setup as send-appointment-invite:
//   RESEND_API_KEY      — from resend.com -> API Keys
//   INVITE_FROM_EMAIL   — e.g. "PaceLedger <invites@big-pace-ledger.com>"
//   APP_URL             — https://big-pace-ledger.com (the link's address)
//
// Security: the link is loaded server-side and must have been made by the
// signed-in caller (or they're a super admin), and must still be unused and
// unexpired. The sign-up address is built here from APP_URL and the stored
// token — never taken from the browser. Limits: one send per link per
// minute, 5 sends per link, and 20 links emailed per person per day.
//
// Deploy with: supabase functions deploy send-recruit-invite

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const INVITE_FROM_EMAIL = Deno.env.get('INVITE_FROM_EMAIL') || '';
const APP_URL = (Deno.env.get('APP_URL') || 'https://big-pace-ledger.com').replace(/\/+$/, '');

// The email holds a sign-up link, which must never land in a browser cache.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
  'Pragma': 'no-cache',
  'Expires': '0',
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DAILY_CAP = 20;
const PER_LINK_CAP = 5;

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

    const { inviteId, email } = await req.json();
    const to = String(email ?? '').trim().toLowerCase();
    if (!inviteId || !EMAIL_RE.test(to) || to.length > 254) return json({ sent: false, error: 'bad_email' });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: inv } = await admin.from('recruit_invites').select('*').eq('id', inviteId).maybeSingle();
    if (!inv) return json({ sent: false, error: 'not_found' }, 404);
    const { data: me } = await admin.from('profiles').select('display_name, email, role').eq('id', userId).maybeSingle();
    if (inv.created_by !== userId && me?.role !== 'super_admin') return json({ sent: false, error: 'not_found' }, 404);
    if (inv.used_at) return json({ sent: false, error: 'used' });
    if (new Date(inv.expires_at).getTime() < Date.now()) return json({ sent: false, error: 'expired' });
    if ((inv.email_send_count || 0) >= PER_LINK_CAP) return json({ sent: false, error: 'link_limit' });

    // At most DAILY_CAP links emailed per person per 24 hours.
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count: sentToday } = await admin.from('recruit_invites')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', inv.created_by).gte('emailed_at', since).neq('id', inv.id);
    if ((sentToday || 0) >= DAILY_CAP) return json({ sent: false, error: 'daily_limit' });

    // One send per link per minute, claimed atomically so a double-click
    // can't send it twice.
    const previousEmailedAt = inv.emailed_at;
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { data: claimed } = await admin.from('recruit_invites')
      .update({ emailed_at: new Date().toISOString() })
      .eq('id', inv.id)
      .or(`emailed_at.is.null,emailed_at.lt.${oneMinuteAgo}`)
      .select('id');
    if (!claimed || claimed.length === 0) return json({ sent: false, error: 'too_soon' });

    const inviterName = me?.display_name || 'Your recruiter';
    const replyTo = me?.email || userData.user.email || undefined;
    const link = `${APP_URL}/?join=${inv.token}`;
    const first = String(inv.invitee_name || '').trim().split(/\s+/)[0];
    const expires = new Date(inv.expires_at).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric' });
    const subject = `${inviterName} invited you to join their team on PaceLedger`;
    const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#EFEBDF;font-family:Arial,Helvetica,sans-serif;color:#33414D">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;padding:28px 26px">
<p style="margin:0 0 6px;font-size:13px;color:#7C8998">You're invited</p>
<h1 style="margin:0 0 16px;font-size:20px;color:#14202B">Join ${esc(inviterName)}'s team on PaceLedger</h1>
<p style="margin:0 0 14px;font-size:15px">Hi ${esc(first || 'there')},</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5">${esc(inviterName)} has set up your PaceLedger account. PaceLedger is where our team plans each day, tracks appointments and follows up with clients. This link is personal to you and already puts you on ${esc(inviterName)}'s team.</p>
<p style="margin:0 0 20px"><a href="${esc(link)}" style="display:inline-block;background:#C9A24B;color:#14202B;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:7px">Create my account</a></p>
<p style="margin:0 0 20px;font-size:12px;color:#7C8998;word-break:break-all">Or copy this link: ${esc(link)}</p>
<p style="margin:0;font-size:13px;color:#7C8998">The link works once and expires on ${esc(expires)}. Please don't forward it. Questions? Just reply to this email.</p>
</div></body></html>`;
    const text = `Hi ${first || 'there'},\n\n${inviterName} invited you to join their team on PaceLedger. Create your account with your personal link:\n${link}\n\nThe link works once and expires on ${expires}. Please don't forward it. Questions? Just reply to this email.`;

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
      // Nothing went out — release the claim so they can try again.
      await admin.from('recruit_invites').update({ emailed_at: previousEmailedAt }).eq('id', inv.id);
      return json({ sent: false, error: 'send_failed' });
    }

    const emailedAt = new Date().toISOString();
    await admin.from('recruit_invites').update({
      emailed_to: to, emailed_at: emailedAt, email_send_count: (inv.email_send_count || 0) + 1,
    }).eq('id', inv.id);

    return json({ sent: true, emailedTo: to, emailedAt });
  } catch (err) {
    console.error(err);
    return json({ sent: false, error: 'unexpected_error' }, 500);
  }
});
