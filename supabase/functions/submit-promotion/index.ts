// Edge Function: submit-promotion
// A direct manager (or a super admin) submits someone's promotion for
// approval. This saves the submission and emails the agency
// (agency@biginsurancenetwork.com) with who it is, their current and new
// level, the date and time, who submitted it, and the results that earned
// it. A super admin then approves it or sends it back in PaceLedger.
//
// Uses the same Resend setup as send-recruit-invite:
//   RESEND_API_KEY      from resend.com -> API Keys
//   INVITE_FROM_EMAIL   e.g. "PaceLedger <invites@big-pace-ledger.com>"
//   APP_URL             https://big-pace-ledger.com (optional)
//   AGENCY_EMAIL        optional; defaults to agency@biginsurancenetwork.com
//
// Security: the caller must be the person's direct manager or a super
// admin, the level must be the one right after their current level, and
// every requirement must be marked met. Only one submission can wait per
// person per level, and each one is emailed once. Limit: 30 promotion
// emails per person per day.
//
// Body: { advisorId, toTier, results: [{ label, result, met }] } to submit,
//   or { requestId } to try the email again if it didn't send.
//
// Deploy with: supabase functions deploy submit-promotion

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const INVITE_FROM_EMAIL = Deno.env.get('INVITE_FROM_EMAIL') || '';
const APP_URL = (Deno.env.get('APP_URL') || 'https://big-pace-ledger.com').replace(/\/+$/, '');
const AGENCY_EMAIL = (Deno.env.get('AGENCY_EMAIL') || 'agency@biginsurancenetwork.com').trim();

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
  'Pragma': 'no-cache',
  'Expires': '0',
};
const DAILY_CAP = 30;

// Same ladder as src/hierarchy.js.
const TIERS = [
  { key: 'UA', name: 'Unlicensed Associate', commission: 0 },
  { key: 'FA', name: 'Field Associate', commission: 40 },
  { key: 'SA', name: 'Senior Associate', commission: 50 },
  { key: 'AD', name: 'Associate Director', commission: 60 },
  { key: 'FD', name: 'Field Director', commission: 75 },
  { key: 'SFD', name: 'Senior Field Director', commission: 80 },
  { key: 'DFD', name: 'Direct Field Director', commission: 83 },
  { key: 'EFD', name: 'Executive Field Director', commission: 86 },
  { key: 'FVC', name: 'Field Vice Chairman', commission: 89 },
  { key: 'EVC', name: 'Executive Vice Chairman', commission: 90 },
];
const tierOf = (key: string | null) => TIERS.find(t => t.key === key) || null;
function nextTier(key: string | null) {
  const i = TIERS.findIndex(t => t.key === key);
  return i === -1 || i === TIERS.length - 1 ? null : TIERS[i + 1];
}
const tierLabel = (key: string | null) => { const t = tierOf(key); return t ? `${t.name} (${t.key})` : 'No level set'; };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}
function esc(s: unknown) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
const oneLine = (s: unknown, max: number) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);

type Result = { label: string; result: string; met: boolean };
function cleanResults(raw: unknown): Result[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 10)
    .map(r => ({ label: oneLine(r?.label, 120), result: oneLine(r?.result, 120), met: r?.met === true }))
    .filter(r => r.label);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const authClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: userData, error: userErr } = await authClient.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ submitted: false, error: 'Not authenticated' }, 401);
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: me } = await admin.from('profiles').select('id, display_name, email, role').eq('id', userId).maybeSingle();
    if (!me) return json({ submitted: false, error: 'not_allowed' }, 403);
    const isAdmin = me.role === 'super_admin';

    const body = await req.json().catch(() => ({}));
    let row: Record<string, any> | null = null;

    if (body.requestId) {
      // Try the email again for a submission that's already saved.
      const { data } = await admin.from('promotion_requests').select('*').eq('id', String(body.requestId)).maybeSingle();
      if (!data || (data.submitted_by !== userId && !isAdmin)) return json({ submitted: false, error: 'not_found' }, 404);
      row = data;
    } else {
      const advisorId = String(body.advisorId || '');
      const toTier = String(body.toTier || '');
      const { data: advisor } = await admin.from('profiles')
        .select('id, manager_id, hierarchy_tier').eq('id', advisorId).maybeSingle();
      if (!advisor) return json({ submitted: false, error: 'not_found' }, 404);
      if (advisor.manager_id !== userId && !isAdmin) return json({ submitted: false, error: 'not_direct_manager' }, 403);
      const next = nextTier(advisor.hierarchy_tier);
      if (!next || next.key !== toTier) return json({ submitted: false, error: 'level_changed' });
      const results = cleanResults(body.results);
      if (!results.length || results.some(r => !r.met)) return json({ submitted: false, error: 'not_ready' });

      const { data: waiting } = await admin.from('promotion_requests').select('*')
        .eq('user_id', advisorId).eq('to_tier', toTier).eq('status', 'submitted').maybeSingle();
      if (waiting) {
        row = waiting;
      } else {
        const { data: created, error: insErr } = await admin.from('promotion_requests').insert({
          user_id: advisorId, from_tier: advisor.hierarchy_tier, to_tier: toTier, results,
          submitted_by: userId, submitted_by_name: me.display_name || '',
        }).select().single();
        if (insErr) {
          // Someone submitted the same promotion at the same moment.
          const { data: again } = await admin.from('promotion_requests').select('*')
            .eq('user_id', advisorId).eq('to_tier', toTier).eq('status', 'submitted').maybeSingle();
          if (!again) { console.error(insErr); return json({ submitted: false, error: 'save_failed' }); }
          row = again;
        } else {
          row = created;
        }
      }
    }

    if (row!.emailed_at) return json({ submitted: true, emailed: true, already: true, request: row });
    if (!RESEND_API_KEY || !INVITE_FROM_EMAIL) return json({ submitted: true, emailed: false, error: 'email_not_configured', request: row });

    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count: sentToday } = await admin.from('promotion_requests')
      .select('id', { count: 'exact', head: true }).eq('submitted_by', userId).gte('emailed_at', since);
    if ((sentToday || 0) >= DAILY_CAP) return json({ submitted: true, emailed: false, error: 'daily_limit', request: row });

    // Claimed first, so a double-click can't email the agency twice.
    const { data: claimed } = await admin.from('promotion_requests')
      .update({ emailed_at: new Date().toISOString() }).eq('id', row!.id).is('emailed_at', null).select('id');
    if (!claimed || claimed.length === 0) return json({ submitted: true, emailed: true, already: true, request: row });

    const [{ data: advisor }, { data: submitter }] = await Promise.all([
      admin.from('profiles').select('display_name, email, manager_id, npn, fg_writing_number').eq('id', row!.user_id).maybeSingle(),
      admin.from('profiles').select('display_name, email').eq('id', row!.submitted_by).maybeSingle(),
    ]);
    const name = advisor?.display_name || 'An advisor';
    const to = tierOf(row!.to_tier);
    const submittedBy = row!.submitted_by_name || submitter?.display_name || 'PaceLedger';
    const submittedAs = advisor && row!.submitted_by === advisor.manager_id ? 'direct manager' : 'super admin';
    const when = new Date(row!.submitted_at).toLocaleString('en-US', {
      timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    });
    const results: Result[] = cleanResults(row!.results);
    const npn = oneLine(advisor?.npn, 40);
    const fg = oneLine(advisor?.fg_writing_number, 40);

    const subject = `Promotion submitted: ${name} to ${to ? `${to.name} (${to.key})` : row!.to_tier}`;
    const facts: [string, string][] = [
      ['Advisor', `${name}${advisor?.email ? `, ${advisor.email}` : ''}`],
      ['Promotion', `${tierLabel(row!.from_tier)} to ${tierLabel(row!.to_tier)}${to ? `, ${to.commission}% commission` : ''}`],
      ['Submitted', when],
      ['Submitted by', `${submittedBy}, ${submittedAs}`],
      ['NPN', npn || 'Not on file'],
      ['F&G writing number', fg || 'Not on file'],
    ];
    const factRows = facts.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#7C8998;font-size:13px;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-size:14px;color:#14202B">${esc(v)}</td></tr>`).join('');
    const resultRows = results.map(r => `<tr><td style="padding:7px 10px;border-top:1px solid #E7E1D2;font-size:14px">${esc(r.label)}</td><td style="padding:7px 10px;border-top:1px solid #E7E1D2;font-size:14px;color:#14202B;font-weight:bold">${esc(r.result)}</td><td style="padding:7px 10px;border-top:1px solid #E7E1D2;font-size:14px;color:#2E7D4F">${r.met ? '&#10003; Met' : 'Not met'}</td></tr>`).join('');
    const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#EFEBDF;font-family:Arial,Helvetica,sans-serif;color:#33414D">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;padding:28px 26px">
<p style="margin:0 0 6px;font-size:13px;color:#7C8998">Promotion submitted for approval</p>
<h1 style="margin:0 0 18px;font-size:20px;color:#14202B">${esc(name)} to ${esc(to ? `${to.name} (${to.key})` : row!.to_tier)}</h1>
<table role="presentation" style="border-collapse:collapse;margin:0 0 20px">${factRows}</table>
<p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#14202B">Results that earned it</p>
<table role="presentation" style="border-collapse:collapse;width:100%;margin:0 0 20px;background:#FBF9F4;border-radius:8px">${resultRows}</table>
<p style="margin:0 0 6px;font-size:13px;color:#7C8998">These are the numbers PaceLedger showed when it was submitted. A super admin approves it in PaceLedger (Team &amp; admin, Team Pace, Promotion).</p>
<p style="margin:0;font-size:13px"><a href="${esc(APP_URL)}" style="color:#24548A">Open PaceLedger</a> &middot; Reply to reach ${esc(submittedBy)}.</p>
</div></body></html>`;
    const text = [
      `Promotion submitted for approval: ${name} to ${to ? `${to.name} (${to.key})` : row!.to_tier}`,
      '',
      ...facts.map(([k, v]) => `${k}: ${v}`),
      '',
      'Results that earned it:',
      ...results.map(r => `- ${r.label}: ${r.result} (${r.met ? 'met' : 'not met'})`),
      '',
      'These are the numbers PaceLedger showed when it was submitted. A super admin approves it in PaceLedger (Team & admin > Team Pace > Promotion).',
      APP_URL,
    ].join('\n');

    const replyTo = submitter?.email || undefined;
    const payload = JSON.stringify({ from: INVITE_FROM_EMAIL, to: [AGENCY_EMAIL], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) });
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
      await admin.from('promotion_requests').update({ emailed_at: null }).eq('id', row!.id);
      return json({ submitted: true, emailed: false, error: 'send_failed', request: { ...row, emailed_at: null } });
    }

    const { data: saved } = await admin.from('promotion_requests')
      .update({ emailed_to: AGENCY_EMAIL, emailed_at: new Date().toISOString() }).eq('id', row!.id).select().single();
    return json({ submitted: true, emailed: true, request: saved || row });
  } catch (err) {
    console.error(err);
    return json({ submitted: false, error: 'unexpected_error' }, 500);
  }
});
