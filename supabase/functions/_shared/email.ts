// Sending email through Resend (resend.com), from INVITE_FROM_EMAIL.
//   RESEND_API_KEY      from resend.com -> API Keys
//   INVITE_FROM_EMAIL   e.g. "PaceLedger <invites@big-pace-ledger.com>" (a domain verified in Resend)
import { env } from './env.ts';

export const RESEND_API_KEY = env('RESEND_API_KEY');
export const FROM_EMAIL = env('INVITE_FROM_EMAIL');
export const emailConfigured = () => !!(RESEND_API_KEY && FROM_EMAIL);

export type Mail = {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: { filename: string; content: string; content_type?: string }[];
};

// tries: how many times to send when Resend is busy (429) or down (5xx).
// { ok } or { ok: false, error: 'email_not_configured' | 'send_failed_<status>' | 'send_failed' }.
export async function sendEmail(mail: Mail, { tries = 2, waitMs = 1200 } = {}): Promise<{ ok: boolean; error?: string; status?: number }> {
  if (!emailConfigured()) return { ok: false, error: 'email_not_configured' };
  const payload = JSON.stringify({
    from: FROM_EMAIL, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text,
    ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
    ...(mail.attachments && mail.attachments.length ? { attachments: mail.attachments } : {}),
  });
  for (let attempt = 0; attempt < tries; attempt++) {
    let res: Response;
    try {
      res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: payload });
    } catch (e) {
      console.error('resend unreachable', String(e));
      if (attempt + 1 < tries) { await new Promise(r => setTimeout(r, waitMs * (attempt + 1))); continue; }
      return { ok: false, error: 'send_failed' };
    }
    if (res.ok) return { ok: true, status: res.status };
    const body = await res.text().catch(() => '');
    console.error('resend error', res.status, body.slice(0, 300));
    if (res.status !== 429 && res.status < 500) return { ok: false, error: `send_failed_${res.status}`, status: res.status };
    if (attempt + 1 < tries) await new Promise(r => setTimeout(r, waitMs * (attempt + 1)));
  }
  return { ok: false, error: 'send_failed' };
}
