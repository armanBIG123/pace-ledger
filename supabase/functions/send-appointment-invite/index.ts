// Edge Function: send-appointment-invite
// Emails the meeting details (with the Zoom link, if one was created) to
// the people an advisor listed when logging or updating an appointment.
//
// This is the fallback for advisors who haven't connected Google Calendar
// (Google sends its own invitations for those who have). Emails go out
// through Resend (resend.com) from your own domain, with a calendar
// attachment (.ics) so recipients can add it to any calendar app in one tap.
// Replies go straight to the advisor.
//
// Required secrets (Supabase Dashboard -> Edge Functions -> Secrets):
//   RESEND_API_KEY      — from resend.com -> API Keys
//   INVITE_FROM_EMAIL   — e.g. "PaceLedger <invites@big-pace-ledger.com>"
//                         (must be on a domain you've verified in Resend)
//
// Security: the appointment is loaded server-side and must belong to the
// signed-in caller; every email detail comes from the database, never from
// the browser. Recipients are validated and capped at 8 per send, sends are
// capped per advisor per day, and only genuine zoom.us links are included.
//
// Deploy with: supabase functions deploy send-appointment-invite
// (or Supabase -> Edge Functions -> send-appointment-invite -> Code -> paste
// this file -> Deploy).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const INVITE_FROM_EMAIL = Deno.env.get('INVITE_FROM_EMAIL') || '';

// Same no-cache headers as the other functions — responses here mention
// a meeting link, which must never land in a browser's on-disk cache.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
  'Pragma': 'no-cache',
  'Expires': '0',
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// How long the meeting is: the appointment's own length, or 30 minutes for
// rows saved before lengths were.
const DURATION_MIN = 30;
function lengthMinutes(appt: any): number {
  const n = Number(appt.duration_minutes);
  return n >= 5 && n <= 720 ? n : DURATION_MIN;
}
const DAILY_CAP = 40;
// Only real Zoom join links are ever put in an email.
const ZOOM_URL_RE = /^https:\/\/([a-z0-9-]+\.)*zoom\.us\/[^\s"'<>]*$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}
function esc(s: string) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function icsEsc(s: string) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}
// RFC 5545: lines longer than 75 octets are folded with CRLF + space.
function foldIcsLine(line: string) {
  if (line.length <= 73) return line;
  const parts = [line.slice(0, 73)];
  for (let i = 73; i < line.length; i += 72) parts.push(' ' + line.slice(i, i + 72));
  return parts.join('\r\n');
}
function icsStamp(d: Date) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
// Real start instant: appointment_at (computed in the database from date +
// time + timezone). Only very old rows saved before timezones existed lack
// it; for those the stored wall-clock time is used as-is.
function startInstant(appt: any): Date {
  if (appt.appointment_at) return new Date(appt.appointment_at);
  return new Date(`${appt.appointment_date}T${String(appt.appointment_time).slice(0, 5)}:00Z`);
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

    const { appointmentId, emails, updated } = await req.json();
    const recipients: string[] = Array.isArray(emails)
      ? [...new Set(emails.map((e: unknown) => String(e).trim().toLowerCase()).filter((e: string) => EMAIL_RE.test(e)))].slice(0, 8) as string[]
      : [];
    if (!appointmentId || recipients.length === 0) return json({ sent: false, error: 'no_recipients' });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: appt } = await admin.from('appointments').select('*').eq('id', appointmentId).maybeSingle();
    if (!appt || appt.user_id !== userId) return json({ sent: false, error: 'not_found' }, 404);
    // Abuse guards — this sends from your own domain, so it must never be
    // usable as a bulk mailer:
    //  1) at most DAILY_CAP invite sends per advisor per 24 hours;
    //  2) one send per appointment per minute, claimed atomically so
    //     parallel requests can't all slip through.
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count: sentToday } = await admin.from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('invite_method', 'email').gte('invite_sent_at', since);
    if ((sentToday || 0) >= DAILY_CAP) return json({ sent: false, error: 'daily_limit' });
    const previousSentAt = appt.invite_sent_at;
    const claimTime = new Date().toISOString();
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { data: claimed } = await admin.from('appointments')
      .update({ invite_sent_at: claimTime })
      .eq('id', appt.id)
      .or(`invite_sent_at.is.null,invite_sent_at.lt.${oneMinuteAgo}`)
      .select('id');
    if (!claimed || claimed.length === 0) return json({ sent: false, error: 'too_soon' });
    const { data: advisor } = await admin.from('profiles').select('display_name, email').eq('id', userId).maybeSingle();

    const advisorName = advisor?.display_name || 'Your advisor';
    const replyTo = advisor?.email || userData.user.email || undefined;
    const tz = appt.appointment_timezone || 'America/Chicago';
    const start = startInstant(appt);
    const end = new Date(start.getTime() + lengthMinutes(appt) * 60_000);
    // "Wednesday, October 21, 6:30 – 7:30 PM CDT"
    const clock = (d: Date, zone: boolean) => d.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', ...(zone ? { timeZoneName: 'short' } : {}) });
    const ampm = (d: Date) => (clock(d, false).match(/[AP]M$/) || [''])[0];
    const startClock = ampm(start) === ampm(end) ? clock(start, false).replace(/\s*[AP]M$/, '') : clock(start, false);
    const whenText = `${start.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' })}, ${startClock} – ${clock(end, true)}`;
    const zoomUrl: string = appt.zoom_url && ZOOM_URL_RE.test(appt.zoom_url) ? appt.zoom_url : '';
    const clientName: string = appt.client_name || 'you';
    const subject = `${updated ? 'Updated: ' : ''}Meeting with ${advisorName} — ${start.toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`;

    const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#EFEBDF;font-family:Arial,Helvetica,sans-serif;color:#33414D">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;padding:28px 26px">
<p style="margin:0 0 6px;font-size:13px;color:#7C8998">${updated ? 'Updated meeting details' : 'You’re invited'}</p>
<h1 style="margin:0 0 16px;font-size:20px;color:#14202B">Meeting with ${esc(advisorName)}</h1>
<p style="margin:0 0 4px;font-size:15px"><strong>When:</strong> ${esc(whenText)}</p>
<p style="margin:0 0 4px;font-size:15px"><strong>With:</strong> ${esc(advisorName)}${appt.presenter && appt.presenter !== advisorName ? ` and ${esc(appt.presenter)}` : ''}</p>
<p style="margin:0 0 20px;font-size:15px"><strong>For:</strong> ${esc(clientName)}</p>
${zoomUrl
  ? `<p style="margin:0 0 20px"><a href="${esc(zoomUrl)}" style="display:inline-block;background:#C9A24B;color:#14202B;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:7px">Join Zoom meeting</a></p>
<p style="margin:0 0 20px;font-size:12px;color:#7C8998;word-break:break-all">Or copy this link: ${esc(zoomUrl)}</p>`
  : `<p style="margin:0 0 20px;font-size:14px">${esc(advisorName)} will share the meeting details with you directly.</p>`}
<p style="margin:0;font-size:13px;color:#7C8998">The attached calendar file adds this to your calendar. Questions? Just reply to this email.</p>
</div></body></html>`;

    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PaceLedger//Appointments//EN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      `UID:${appt.id}@big-pace-ledger.com`, `SEQUENCE:${Math.floor(Date.now() / 1000)}`,
      `DTSTAMP:${icsStamp(new Date())}`, `DTSTART:${icsStamp(start)}`, `DTEND:${icsStamp(end)}`,
      `SUMMARY:${icsEsc(`Meeting with ${advisorName}`)}`,
      zoomUrl ? `LOCATION:${icsEsc(zoomUrl)}` : '',
      `DESCRIPTION:${icsEsc(zoomUrl ? `Join Zoom: ${zoomUrl}` : `Meeting with ${advisorName}`)}`,
      zoomUrl ? `URL:${zoomUrl}` : '',
      'END:VEVENT', 'END:VCALENDAR',
    ].filter(Boolean).map(foldIcsLine).join('\r\n') + '\r\n';
    const icsB64 = btoa(unescape(encodeURIComponent(ics)));

    // One email per recipient, so nobody sees anyone else's address. Sent
    // one at a time (Resend's default limit is ~2 per second, and its batch
    // endpoint doesn't allow attachments), retrying once if rate-limited.
    const sentTo: string[] = [];
    for (const to of recipients) {
      const payload = JSON.stringify({
        from: INVITE_FROM_EMAIL, to: [to], subject, html,
        ...(replyTo ? { reply_to: replyTo } : {}),
        attachments: [{ filename: 'meeting.ics', content: icsB64, content_type: 'text/calendar' }],
      });
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: payload,
        });
        if (res.ok) { sentTo.push(to); break; }
        console.error('resend error', to, res.status, await res.text());
        if (res.status !== 429) break;
        await new Promise(r => setTimeout(r, 1100));
      }
      await new Promise(r => setTimeout(r, 550));
    }
    if (sentTo.length === 0) {
      // Nothing went out — release the claim so the advisor can retry.
      await admin.from('appointments').update({ invite_sent_at: previousSentAt }).eq('id', appt.id);
      return json({ sent: false, error: 'send_failed' });
    }

    await admin.from('appointments').update({
      invitee_emails: sentTo, invite_method: 'email', invite_sent_at: new Date().toISOString(),
    }).eq('id', appt.id);

    return json({ sent: true, method: 'email', recipients: sentTo, failed: recipients.filter(r => !sentTo.includes(r)) });
  } catch (err) {
    console.error(err);
    return json({ sent: false, error: 'unexpected_error' }, 500);
  }
});
