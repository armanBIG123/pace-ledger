// Edge Function: chat-notify
// Emails people about Chat, right after something is posted:
//
// - { messageId }: a message posted in Urgent help. Emails the poster's
//   direct manager and that manager's manager (or the super admins, if the
//   poster has no manager). Only the poster can ask, and only once per
//   message. If the same person's earlier Urgent help message was emailed
//   in the last 10 minutes, their leaders already know and nothing is sent.
// - { reportId }: a message someone reported. Emails the super admins so
//   they can remove it or keep it (Chat -> Reports). Only the person who
//   reported it can ask, and only once per report.
//
// Uses the same Resend setup as submit-promotion:
//   RESEND_API_KEY      from resend.com -> API Keys
//   INVITE_FROM_EMAIL   e.g. "PaceLedger <invites@big-pace-ledger.com>"
//   APP_URL             https://big-pace-ledger.com (optional)
//
// Limits: 20 Urgent help emails per person per day, 20 report emails per
// person per day.
//
// Deploy: Supabase -> Edge Functions -> Deploy a new function -> Via Editor,
// name it chat-notify, paste this file, Deploy, then turn Verify JWT off
// (the function checks who's signed in itself).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const INVITE_FROM_EMAIL = Deno.env.get('INVITE_FROM_EMAIL') || '';
const APP_URL = (Deno.env.get('APP_URL') || 'https://big-pace-ledger.com').replace(/\/+$/, '');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
};
const DAILY_CAP = 20;
const QUIET_MINUTES = 10;
const CHANNEL_NAMES: Record<string, string> = { general: 'General', work: 'Work', urgent: 'Urgent help' };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}
function esc(s: unknown) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
const when = (iso: string) => new Date(iso).toLocaleString('en-US', {
  timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
});
const firstName = (n: string) => (n || '').trim().split(/\s+/)[0] || n;

type Person = { id: string; display_name: string; email: string | null; role: string; manager_id: string | null };

function page(kicker: string, title: string, quote: string, facts: [string, string][], note: string, link: string, linkLabel: string) {
  const rows = facts.map(([k, v]) => `<tr><td style="padding:5px 12px 5px 0;color:#7C8998;font-size:13px;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:5px 0;font-size:14px;color:#14202B">${esc(v)}</td></tr>`).join('');
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#EFEBDF;font-family:Arial,Helvetica,sans-serif;color:#33414D">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;padding:28px 26px">
<p style="margin:0 0 6px;font-size:13px;color:#7C8998">${esc(kicker)}</p>
<h1 style="margin:0 0 16px;font-size:20px;color:#14202B">${esc(title)}</h1>
<div style="margin:0 0 18px;padding:14px 16px;background:#FBF9F4;border-left:3px solid #C99A3B;border-radius:6px;font-size:15px;line-height:1.5;color:#14202B;white-space:pre-wrap">${esc(quote)}</div>
<table role="presentation" style="border-collapse:collapse;margin:0 0 18px">${rows}</table>
<p style="margin:0 0 18px"><a href="${esc(link)}" style="display:inline-block;background:#C99A3B;color:#14202B;text-decoration:none;font-weight:bold;font-size:14px;padding:10px 18px;border-radius:8px">${esc(linkLabel)}</a></p>
<p style="margin:0;font-size:13px;color:#7C8998">${esc(note)}</p>
</div></body></html>`;
}

async function send(to: string[], subject: string, html: string, text: string, replyTo?: string) {
  const payload = JSON.stringify({ from: INVITE_FROM_EMAIL, to, subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) });
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: payload,
    });
    if (res.ok) return true;
    console.error('resend error', res.status, await res.text());
    if (res.status !== 429) return false;
    await new Promise(r => setTimeout(r, 1100));
  }
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  try {
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const authClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: userData, error: userErr } = await authClient.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ ok: false, error: 'not_signed_in' }, 401);
    const userId = userData.user.id;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));

    const people = async (ids: string[]) => {
      if (!ids.length) return [] as Person[];
      const { data } = await admin.from('profiles').select('id, display_name, email, role, manager_id').in('id', ids);
      return (data || []) as Person[];
    };
    const emailOf = async (p: Person) => {
      if (p.email) return p.email;
      const { data } = await admin.auth.admin.getUserById(p.id);
      return data?.user?.email || null;
    };
    const superAdmins = async (except: string) => {
      const { data } = await admin.from('profiles').select('id, display_name, email, role, manager_id').eq('role', 'super_admin');
      return ((data || []) as Person[]).filter(p => p.id !== except);
    };
    const configured = RESEND_API_KEY && INVITE_FROM_EMAIL;

    // Urgent help ---------------------------------------------------------
    if (body.messageId) {
      const { data: msg } = await admin.from('chat_messages').select('*').eq('id', String(body.messageId)).maybeSingle();
      if (!msg || msg.user_id !== userId || msg.channel !== 'urgent' || msg.deleted_at) return json({ ok: false, error: 'not_found' }, 404);
      if (msg.notified_at) return json({ ok: true, emailed: true, already: true, to: (msg.notified_to || '').split(', ').filter(Boolean) });

      const since = new Date(Date.now() - QUIET_MINUTES * 60_000).toISOString();
      const { data: recent } = await admin.from('chat_messages').select('notified_at, notified_to')
        .eq('user_id', userId).eq('channel', 'urgent').gte('notified_at', since).order('notified_at', { ascending: false }).limit(1);
      if (recent && recent.length) return json({ ok: true, emailed: false, reason: 'recent', at: recent[0].notified_at, to: (recent[0].notified_to || '').split(', ').filter(Boolean) });

      const [poster] = await people([userId]);
      if (!poster) return json({ ok: false, error: 'not_found' }, 404);
      const chain: Person[] = [];
      if (poster.manager_id) {
        const [manager] = await people([poster.manager_id]);
        if (manager) {
          chain.push(manager);
          if (manager.manager_id && manager.manager_id !== userId) {
            const [above] = await people([manager.manager_id]);
            if (above && above.id !== manager.id) chain.push(above);
          }
        }
      }
      const recipients = (chain.length ? chain : await superAdmins(userId)).filter(p => p.id !== userId);
      if (!recipients.length) return json({ ok: true, emailed: false, reason: 'no_one' });
      if (!configured) return json({ ok: true, emailed: false, error: 'email_not_configured' });

      const day = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { count } = await admin.from('chat_messages').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('channel', 'urgent').gte('notified_at', day);
      if ((count || 0) >= DAILY_CAP) return json({ ok: true, emailed: false, error: 'daily_limit' });

      // Claimed first, so a double tap can't email twice.
      const { data: claimed } = await admin.from('chat_messages').update({ notified_at: new Date().toISOString() })
        .eq('id', msg.id).is('notified_at', null).select('id');
      if (!claimed || !claimed.length) return json({ ok: true, emailed: true, already: true });

      const emails = (await Promise.all(recipients.map(emailOf))).filter(Boolean) as string[];
      const names = recipients.map(p => p.display_name);
      const posterEmail = await emailOf(poster);
      const name = poster.display_name || 'Someone on your team';
      const link = `${APP_URL}/?chat=urgent`;
      const subject = `Urgent help: ${name} needs a hand`;
      const facts: [string, string][] = [['From', `${name}${posterEmail ? `, ${posterEmail}` : ''}`], ['Posted', when(msg.created_at)]];
      const note = chain.length
        ? `You're getting this because you lead ${firstName(name)} in PaceLedger. Reply to this email to reach ${firstName(name)} directly, or answer in Chat so the whole team sees it.`
        : `${firstName(name)} has no manager set in PaceLedger, so this went to the super admins. Reply to reach ${firstName(name)} directly.`;
      const html = page('Urgent help in PaceLedger Chat', `${name} needs a hand`, msg.body, facts, note, link, 'Open Urgent help');
      const text = [`${name} posted in Urgent help (PaceLedger Chat):`, '', msg.body, '', ...facts.map(([k, v]) => `${k}: ${v}`), '', note, link].join('\n');
      const ok = emails.length > 0 && await send(emails, subject, html, text, posterEmail || undefined);
      if (!ok) {
        await admin.from('chat_messages').update({ notified_at: null }).eq('id', msg.id);
        return json({ ok: true, emailed: false, error: emails.length ? 'send_failed' : 'no_email' });
      }
      await admin.from('chat_messages').update({ notified_to: names.join(', ') }).eq('id', msg.id);
      return json({ ok: true, emailed: true, to: names });
    }

    // A reported message --------------------------------------------------
    if (body.reportId) {
      const { data: report } = await admin.from('chat_reports').select('*').eq('id', String(body.reportId)).maybeSingle();
      if (!report || report.reporter_id !== userId) return json({ ok: false, error: 'not_found' }, 404);
      if (report.emailed_at) return json({ ok: true, emailed: true, already: true });
      if (!configured) return json({ ok: true, emailed: false, error: 'email_not_configured' });

      const day = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { count } = await admin.from('chat_reports').select('id', { count: 'exact', head: true })
        .eq('reporter_id', userId).gte('emailed_at', day);
      if ((count || 0) >= DAILY_CAP) return json({ ok: true, emailed: false, error: 'daily_limit' });

      const { data: claimed } = await admin.from('chat_reports').update({ emailed_at: new Date().toISOString() })
        .eq('id', report.id).is('emailed_at', null).select('id');
      if (!claimed || !claimed.length) return json({ ok: true, emailed: true, already: true });

      const admins = await superAdmins('');
      const emails = (await Promise.all(admins.map(emailOf))).filter(Boolean) as string[];
      const { data: msg } = await admin.from('chat_messages').select('channel, created_at').eq('id', report.message_id).maybeSingle();
      const [author, reporter] = await Promise.all([people(report.message_author ? [report.message_author] : []), people([userId])]);
      const authorName = author[0]?.display_name || 'Someone';
      const facts: [string, string][] = [
        ['Posted by', authorName],
        ['Chat', CHANNEL_NAMES[msg?.channel || ''] || 'Chat'],
        ['Posted', msg ? when(msg.created_at) : ''],
        ['Reported by', reporter[0]?.display_name || 'Someone'],
        ['Reason', report.reason || 'No reason given'],
      ];
      const link = `${APP_URL}/?chat=reports`;
      const note = 'Open Chat -> Reports to remove the message or keep it. Please look at it within 24 hours.';
      const html = page('A Chat message was reported', `Reported message from ${authorName}`, report.message_body, facts, note, link, 'Review in PaceLedger');
      const text = ['A Chat message was reported in PaceLedger:', '', report.message_body, '', ...facts.map(([k, v]) => `${k}: ${v}`), '', note, link].join('\n');
      const ok = emails.length > 0 && await send(emails, `Reported in Chat: message from ${authorName}`, html, text);
      if (!ok) {
        await admin.from('chat_reports').update({ emailed_at: null }).eq('id', report.id);
        return json({ ok: true, emailed: false, error: emails.length ? 'send_failed' : 'no_email' });
      }
      return json({ ok: true, emailed: true });
    }

    return json({ ok: false, error: 'bad_request' }, 400);
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'unexpected_error' }, 500);
  }
});
