// Edge Function: contracting
//
// Everything contracting needs from a server:
//   * Producer agreements, signed in PaceLedger through DocuSeal:
//       agreement-session    an agent's signing form (starts their agreement)
//       countersign-session  a contracting-team member's countersigning form
//       sync-agreement       checks DocuSeal and saves the signed PDF and audit
//                            certificate (SHA-256 recorded) once both have signed
//       (DocuSeal also calls this function directly when someone signs; see
//        the webhook URL below)
//   * Contracting info (encrypted on the agent's phone; see src/lib/vault.js):
//       reveal               one field, for a contracting-team member
//       file                 one uploaded file, for a contracting-team member
//       notify-sent          emails the contracting team that info is waiting
//   * Setup checks: key-check (the private key below matches PaceLedger's
//     public key), docuseal-check (the API key and template work).
//
// Every reveal, copy and file view is written to the contracting log. Nothing
// here ever logs or emails the info itself.
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   CONTRACTING_PRIVATE_KEY  made in PaceLedger (Profiles -> Contracting -> Setup);
//                            starts with PLKEY1. Never paste it anywhere else.
//   DOCUSEAL_API_KEY         DocuSeal -> Settings -> API
//   DOCUSEAL_WEBHOOK_TOKEN   any long random text; the same text goes at the
//                            end of the webhook URL in DocuSeal
//   DOCUSEAL_API_URL         optional; https://api.docuseal.com (default) or
//                            https://api.docuseal.eu
//   DOCUSEAL_FORM_URL        optional; https://docuseal.com (default)
//   DOCUSEAL_AGENT_ROLE      optional; the agent's role name in the template
//                            (default "Agent")
//   DOCUSEAL_BIG_ROLE        optional; BIG's role name (default "BIG Insurance Network")
//   BIG_SIGNER_EMAIL         optional; placeholder email for BIG's role until a
//                            team member countersigns (default agency@biginsurancenetwork.com)
//   RESEND_API_KEY, INVITE_FROM_EMAIL   the same ones the invite emails use
//
// DocuSeal webhook URL (DocuSeal -> Settings -> Webhooks), events
// form.completed, form.declined and submission.completed:
//   https://<your project>.supabase.co/functions/v1/contracting?webhook=<DOCUSEAL_WEBHOOK_TOKEN>
//
// Deploy with "Verify JWT" turned OFF (DocuSeal can't send a sign-in). Every
// other request is checked here: a real PaceLedger sign-in, and for the
// contracting team, membership plus two-step login in the last 12 hours.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const env = (k: string, d = ''): string => {
  try { return (typeof Deno !== 'undefined' ? Deno.env.get(k) : undefined) ?? d; } catch { return d; }
};
const SUPABASE_URL = env('SUPABASE_URL');
const SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const ANON_KEY = env('SUPABASE_ANON_KEY');
const DOCUSEAL_API_KEY = env('DOCUSEAL_API_KEY');
const DOCUSEAL_API_URL = env('DOCUSEAL_API_URL', 'https://api.docuseal.com').replace(/\/+$/, '');
const DOCUSEAL_FORM_URL = env('DOCUSEAL_FORM_URL', 'https://docuseal.com').replace(/\/+$/, '');
const DOCUSEAL_WEBHOOK_TOKEN = env('DOCUSEAL_WEBHOOK_TOKEN');
const AGENT_ROLE = env('DOCUSEAL_AGENT_ROLE', 'Agent');
const BIG_ROLE = env('DOCUSEAL_BIG_ROLE', 'BIG Insurance Network');
const BIG_SIGNER_EMAIL = env('BIG_SIGNER_EMAIL', 'agency@biginsurancenetwork.com');
const RESEND_API_KEY = env('RESEND_API_KEY');
const INVITE_FROM_EMAIL = env('INVITE_FROM_EMAIL');
const APP_URL = env('APP_URL', 'https://big-pace-ledger.com').replace(/\/+$/, '');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
  'Pragma': 'no-cache',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

// ---- Field names (keep in step with src/lib/contracting.js) -----------------
export const FIELD_LABELS: Record<string, string> = {
  first_name: 'First name', middle_name: 'Middle name', last_name: 'Last name', ssn: 'Social Security number',
  dob: 'Date of birth', gender: 'Gender', email: 'Email', phone: 'Phone',
  street: 'Street address', city: 'City', state: 'State', zip: 'ZIP code',
  dl_number: "Driver's license number", dl_state: "Driver's license state", dl_expires: "Driver's license expiration",
  bank_name: 'Bank name', account_type: 'Account type', routing: 'Routing number', account: 'Account number',
  eo_has: 'Has E&O', eo_carrier: 'E&O carrier', eo_policy: 'E&O policy number', eo_amount: 'E&O coverage per claim', eo_expires: 'E&O expiration',
  aml_done: 'AML training done', aml_provider: 'AML provider', aml_date: 'AML completion date', background: 'Background answers',
};
const FILE_LABELS: Record<string, string> = {
  dl_front: "Driver's license photo", eo_certificate: 'E&O certificate', aml_certificate: 'AML certificate', background_doc: 'Background document',
};

// ---- Crypto (keep in step with src/lib/vault.js) ------------------------------
const enc = new TextEncoder();
const dec = new TextDecoder();
export const fieldAad = (userId: string, key: string) => `pl1|${userId}|${key}`;
export const fileAad = (userId: string, kind: string) => `pl1|${userId}|file|${kind}`;
export const fileNameAad = (userId: string, kind: string) => `pl1|${userId}|file-name|${kind}`;
export const checkAad = (userId: string) => `pl1|${userId}|key-check`;
export function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x2000) s += String.fromCharCode(...bytes.subarray(i, i + 0x2000));
  return btoa(s);
}
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

export async function importPrivateKey(text: string): Promise<{ keyId: string; key: CryptoKey } | null> {
  const m = /^PLKEY1\.([0-9a-f]{16})\.([A-Za-z0-9+/=]+)$/.exec(String(text || '').replace(/\s+/g, ''));
  if (!m) return null;
  const key = await crypto.subtle.importKey('pkcs8', fromB64(m[2]), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
  return { keyId: m[1], key };
}
export async function openSealed(priv: CryptoKey, wrappedKey: string, iv: string, ct: string, aad: string): Promise<Uint8Array> {
  const rawAes = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, priv, fromB64(wrappedKey));
  const aes = await crypto.subtle.importKey('raw', rawAes, { name: 'AES-GCM' }, false, ['decrypt']);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv), additionalData: enc.encode(aad) }, aes, fromB64(ct)));
}
let privCache: { raw: string; keyId: string; key: CryptoKey } | null = null;
async function privateKey() {
  const raw = env('CONTRACTING_PRIVATE_KEY').replace(/\s+/g, '');
  if (!raw) return null;
  if (privCache && privCache.raw === raw) return privCache;
  const k = await importPrivateKey(raw).catch(() => null);
  if (!k) return null;
  privCache = { raw, ...k };
  return privCache;
}

// ---- Who's calling ------------------------------------------------------------------
type Caller = { id: string; email: string; claims: Record<string, any> };
function decodeJwt(jwt: string): Record<string, any> {
  try {
    const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(dec.decode(fromB64(part + '='.repeat((4 - (part.length % 4)) % 4))));
  } catch { return {}; }
}
export function freshTwoStep(claims: Record<string, any>, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (claims.aal !== 'aal2' || !Array.isArray(claims.amr)) return false;
  return claims.amr.some((a: any) => a && a.method === 'totp' && Number(a.timestamp) > nowSec - 12 * 3600);
}
async function caller(req: Request): Promise<Caller | null> {
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return null;
  const { data, error } = await createClient(SUPABASE_URL, ANON_KEY).auth.getUser(jwt);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email || '', claims: decodeJwt(jwt) };
}
async function isStaff(admin: any, id: string): Promise<boolean> {
  const { data: s } = await admin.from('contracting_staff').select('user_id').eq('user_id', id).maybeSingle();
  if (!s) return false;
  const { data: p } = await admin.from('profiles').select('role').eq('id', id).maybeSingle();
  return !!p && p.role === 'super_admin';
}
async function nameOf(admin: any, id: string | null): Promise<string> {
  if (!id) return '';
  const { data } = await admin.from('profiles').select('display_name').eq('id', id).maybeSingle();
  return (data && data.display_name) || '';
}
async function log(admin: any, userId: string | null, actorId: string | null, action: string, detail: string | null) {
  const [agentName, actorName] = await Promise.all([nameOf(admin, userId), nameOf(admin, actorId)]);
  const { error } = await admin.from('contracting_log').insert({
    user_id: userId, agent_name: agentName || null, actor_id: actorId, actor_name: actorName || null, action, detail: detail ? detail.slice(0, 200) : null,
  });
  if (error) console.error('log failed', error.message);
}

// ---- DocuSeal ------------------------------------------------------------------------
class DsError extends Error { status: number; constructor(status: number, msg: string) { super(msg); this.status = status; } }
async function ds(path: string, init: RequestInit = {}): Promise<any> {
  if (!DOCUSEAL_API_KEY) throw new DsError(0, 'DOCUSEAL_API_KEY is not set');
  const res = await fetch(`${DOCUSEAL_API_URL}${path}`, {
    ...init,
    headers: { 'X-Auth-Token': DOCUSEAL_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  if (!res.ok) throw new DsError(res.status, typeof body === 'object' && body ? String(body.error || body.message || JSON.stringify(body)).slice(0, 300) : String(body).slice(0, 300));
  return body;
}
const centralDate = (d = new Date()) => d.toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric' });
const centralDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
async function sha256Hex(bytes: Uint8Array) { return hex(await crypto.subtle.digest('SHA-256', bytes)); }
const roleIs = (s: any, role: string, id: number | null) => (id && Number(s.id) === Number(id)) || String(s.role || '').trim().toLowerCase() === role.toLowerCase();

function electionFrom(values: any): string | null {
  const list = Array.isArray(values) ? values : values && typeof values === 'object' ? Object.entries(values).map(([field, value]) => ({ field, value })) : [];
  for (const v of list) {
    if (!/agent\s*type|election|exclusive/i.test(String(v.field || ''))) continue;
    const s = String(v.value ?? '').toLowerCase();
    if (s.includes('non')) return 'Non-Exclusive';
    if (s.includes('exclusive')) return 'Exclusive';
  }
  return null;
}

async function fetchPdf(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

// Brings our record in line with DocuSeal. Safe to run any number of times.
async function syncAgreement(admin: any, row: any): Promise<any> {
  if (!row || row.status === 'completed' || row.status === 'voided') return row;
  const sub = await ds(`/submissions/${row.docuseal_submission_id}`);
  const subs: any[] = Array.isArray(sub.submitters) ? sub.submitters : [];
  const agent = subs.find(s => roleIs(s, AGENT_ROLE, row.agent_submitter_id));
  const big = subs.find(s => roleIs(s, BIG_ROLE, row.big_submitter_id));
  const patch: Record<string, any> = {};

  if (agent && agent.status === 'declined' && row.status !== 'declined') {
    patch.status = 'declined';
  } else if (agent && agent.completed_at && row.status === 'sent') {
    patch.status = 'agent_signed';
    patch.agent_signed_at = agent.completed_at;
    patch.election = electionFrom(agent.values) || row.election;
  }

  const allDone = sub.status === 'completed' || (agent && agent.completed_at && big && big.completed_at);
  if (allDone) {
    const docs = await ds(`/submissions/${row.docuseal_submission_id}/documents?merge=true`);
    const docUrl = docs && Array.isArray(docs.documents) && docs.documents[0] && docs.documents[0].url;
    if (!docUrl) throw new Error('DocuSeal returned no signed document');
    const pdf = await fetchPdf(docUrl);
    const folder = `${row.user_id}/${row.id}`;
    const up = await admin.storage.from('agreements').upload(`${folder}/signed.pdf`, pdf, { contentType: 'application/pdf', upsert: true });
    if (up.error) throw new Error(`storage: ${up.error.message}`);
    patch.pdf_path = `${folder}/signed.pdf`;
    patch.pdf_sha256 = await sha256Hex(pdf);
    if (sub.audit_log_url) {
      const audit = await fetchPdf(sub.audit_log_url);
      const up2 = await admin.storage.from('agreements').upload(`${folder}/audit.pdf`, audit, { contentType: 'application/pdf', upsert: true });
      if (!up2.error) { patch.audit_path = `${folder}/audit.pdf`; patch.audit_sha256 = await sha256Hex(audit); }
    }
    patch.status = 'completed';
    patch.agent_signed_at = patch.agent_signed_at || row.agent_signed_at || (agent && agent.completed_at) || null;
    patch.election = patch.election || row.election || electionFrom(agent && agent.values);
    patch.countersigned_at = (big && big.completed_at) || sub.completed_at || new Date().toISOString();
  }

  if (!Object.keys(patch).length) return row;
  const { data: saved, error } = await admin.from('producer_agreements').update(patch).eq('id', row.id).neq('status', 'completed').select().maybeSingle();
  if (error) throw new Error(error.message);
  if (!saved) return row; // finished at the same moment by another request

  if (patch.status === 'agent_signed') {
    await log(admin, row.user_id, null, 'agreement_signed', `Signed producer agreement ${row.version}`);
    const { data: claimed } = await admin.from('producer_agreements').update({ countersign_notified_at: new Date().toISOString() })
      .eq('id', row.id).is('countersign_notified_at', null).select('id').maybeSingle();
    if (claimed) {
      await emailStaff(admin, `Countersign ${row.agent_name}'s producer agreement`,
        [`${row.agent_name} signed their producer agreement (${row.version}).`, 'Countersign it in PaceLedger: Team & admin → Profiles → Contracting. Their contracting form opens after you do.']);
    }
  }
  if (patch.status === 'completed') {
    await log(admin, row.user_id, saved.countersigned_by || null, 'agreement_completed', `Producer agreement ${row.version} countersigned; signed PDF saved (SHA-256 ${String(patch.pdf_sha256).slice(0, 12)}…)`);
    if (row.user_id) {
      await admin.from('licensing_progress').upsert({ user_id: row.user_id }, { onConflict: 'user_id', ignoreDuplicates: true });
      // The agreement step is dated the day it's countersigned (this replaces
      // an old "InsuraCloud sent" date for someone who never submitted there).
      const { data: lp } = await admin.from('licensing_progress').select('contracting_sent_on, profile_submitted_on').eq('user_id', row.user_id).maybeSingle();
      if (lp && (!lp.contracting_sent_on || !lp.profile_submitted_on)) await admin.from('licensing_progress').update({ contracting_sent_on: centralDay() }).eq('user_id', row.user_id);
    }
  }
  if (patch.status === 'declined') await log(admin, row.user_id, null, 'agreement_declined', 'Declined the producer agreement in DocuSeal');
  return saved;
}

async function signingUrl(submitterId: number): Promise<string> {
  const s = await ds(`/submitters/${submitterId}`);
  if (s.embed_src) return s.embed_src;
  if (!s.slug) throw new Error('DocuSeal returned no signing link');
  return `${DOCUSEAL_FORM_URL}/s/${s.slug}`;
}

// ---- Email -----------------------------------------------------------------------------
async function emailStaff(admin: any, subject: string, lines: string[]): Promise<boolean> {
  if (!RESEND_API_KEY || !INVITE_FROM_EMAIL) return false;
  const { data: staff } = await admin.from('contracting_staff').select('user_id');
  const emails: string[] = [];
  for (const s of staff || []) {
    const { data } = await admin.auth.admin.getUserById(s.user_id);
    if (data && data.user && data.user.email) emails.push(data.user.email);
  }
  if (!emails.length) return false;
  const text = `${lines.join('\n\n')}\n\nOpen PaceLedger: ${APP_URL}\n\nThis email never includes anyone's contracting info.`;
  const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#13212E">${lines.map(l => `<p>${esc(l)}</p>`).join('')}<p><a href="${APP_URL}">Open PaceLedger</a></p><p style="color:#5E6A77;font-size:13px">This email never includes anyone's contracting info.</p></div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: INVITE_FROM_EMAIL, to: emails, subject, text, html }),
  });
  if (!res.ok) console.error('email failed', res.status, (await res.text()).slice(0, 200));
  return res.ok;
}

function timingSafeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---- The handler -------------------------------------------------------------------------
export async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const url = new URL(req.url);

  // DocuSeal telling us someone signed.
  const hook = url.searchParams.get('webhook');
  if (hook !== null) {
    if (!timingSafeEqual(hook, DOCUSEAL_WEBHOOK_TOKEN)) return json({ error: 'not_allowed' }, 401);
    const body = await req.json().catch(() => ({}));
    const ev = String(body.event_type || '');
    const d = body.data || {};
    const submissionId = ev.startsWith('submission.') ? d.id : (d.submission && d.submission.id) || d.submission_id;
    if (!submissionId) return json({ ok: true, ignored: true });
    const { data: row } = await admin.from('producer_agreements').select('*').eq('docuseal_submission_id', submissionId).maybeSingle();
    if (!row) return json({ ok: true, ignored: true });
    try { await syncAgreement(admin, row); } catch (e) { console.error('webhook sync', e); return json({ ok: false }, 500); }
    return json({ ok: true });
  }

  const me = await caller(req);
  if (!me) return json({ error: 'not_signed_in' }, 401);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');

  const staffCheck = async (): Promise<Response | null> => {
    if (!(await isStaff(admin, me.id))) return json({ error: 'not_contracting_staff' }, 403);
    if (!freshTwoStep(me.claims)) return json({ error: 'two_step_required' }, 403);
    return null;
  };
  const { data: settings } = await admin.from('contracting_settings').select('*').eq('id', true).maybeSingle();

  try {
    switch (action) {
      // ---- an agent's signing form -------------------------------------------
      case 'agreement-session': {
        if (!settings || !settings.docuseal_template_id || !settings.agreement_version) return json({ error: 'agreement_not_set_up' }, 400);
        if (!settings.enabled && !(await isStaff(admin, me.id))) return json({ error: 'contracting_off' }, 400);
        const { data: rows } = await admin.from('producer_agreements').select('*').eq('user_id', me.id)
          .eq('version', settings.agreement_version).order('created_at', { ascending: false }).limit(1);
        let row = rows && rows[0];
        if (row && row.status !== 'completed' && row.status !== 'voided') row = await syncAgreement(admin, row);
        if (row && row.status === 'completed') return json({ status: 'completed', agreement: row });
        if (row && row.status === 'agent_signed') return json({ status: 'agent_signed', agreement: row });
        if (row && row.status === 'sent') return json({ status: 'sent', src: await signingUrl(row.agent_submitter_id), email: row.agent_email });

        const name = (await nameOf(admin, me.id)) || me.email;
        const made = await ds('/submissions', {
          method: 'POST',
          body: JSON.stringify({
            template_id: Number(settings.docuseal_template_id),
            send_email: false,
            order: 'preserved',
            submitters: [
              { role: AGENT_ROLE, email: me.email, name, external_id: me.id, send_email: false,
                values: { 'Agent Name': name, 'Agent Email': me.email, 'Agreement Date': centralDate() } },
              { role: BIG_ROLE, email: BIG_SIGNER_EMAIL, name: 'BIG Insurance Network', send_email: false },
            ],
          }),
        });
        const list: any[] = Array.isArray(made) ? made : (made && made.submitters) || [];
        const a = list.find(s => roleIs(s, AGENT_ROLE, null));
        const b = list.find(s => roleIs(s, BIG_ROLE, null));
        if (!a || !b) return json({ error: 'template_roles', detail: `The DocuSeal template needs two roles named "${AGENT_ROLE}" and "${BIG_ROLE}".` }, 400);
        const { data: saved, error } = await admin.from('producer_agreements').insert({
          user_id: me.id, version: settings.agreement_version, docuseal_submission_id: a.submission_id,
          docuseal_template_id: settings.docuseal_template_id, agent_submitter_id: a.id, big_submitter_id: b.id,
          status: 'sent', agent_name: name, agent_email: me.email,
        }).select().single();
        if (error) throw new Error(error.message);
        await log(admin, me.id, me.id, 'agreement_started', `Opened producer agreement ${settings.agreement_version} to sign`);
        return json({ status: 'sent', src: a.embed_src || (await signingUrl(a.id)), email: me.email, agreement: saved });
      }

      // ---- the contracting team countersigns ----------------------------------
      case 'countersign-session': {
        const no = await staffCheck(); if (no) return no;
        const { data: row } = await admin.from('producer_agreements').select('*').eq('id', String(body.agreementId || '')).maybeSingle();
        if (!row) return json({ error: 'not_found' }, 404);
        const fresh = await syncAgreement(admin, row);
        if (fresh.status === 'completed') return json({ status: 'completed', agreement: fresh });
        if (fresh.status !== 'agent_signed') return json({ error: 'agent_not_signed' }, 400);
        const myName = (await nameOf(admin, me.id)) || me.email;
        try {
          await ds(`/submitters/${fresh.big_submitter_id}`, { method: 'PUT', body: JSON.stringify({ name: myName, email: me.email, send_email: false }) });
        } catch (e) { console.error('could not put the countersigner on the form', e); }
        await admin.from('producer_agreements').update({ countersigned_by: me.id, countersigner_name: myName }).eq('id', fresh.id).neq('status', 'completed');
        return json({ status: 'agent_signed', src: await signingUrl(fresh.big_submitter_id), email: me.email });
      }

      case 'sync-agreement': {
        const { data: row } = await admin.from('producer_agreements').select('*').eq('id', String(body.agreementId || '')).maybeSingle();
        if (!row) return json({ error: 'not_found' }, 404);
        if (row.user_id !== me.id) { const no = await staffCheck(); if (no) return no; }
        const saved = await syncAgreement(admin, row);
        return json({ status: saved.status, agreement: saved });
      }

      // ---- contracting info ---------------------------------------------------------
      case 'reveal': {
        const no = await staffCheck(); if (no) return no;
        const userId = String(body.userId || '');
        const field = String(body.field || '');
        const purpose = body.purpose === 'copy' ? 'copy' : 'view';
        if (!FIELD_LABELS[field]) return json({ error: 'unknown_field' }, 400);
        await admin.rpc('contracting_purge_expired');
        const { data: sec } = await admin.from('contracting_secrets').select('*').eq('user_id', userId).not('submitted_at', 'is', null).maybeSingle();
        if (!sec || new Date(sec.expires_at).getTime() <= Date.now()) return json({ error: 'gone' }, 404);
        const piece = sec.fields && sec.fields[field];
        if (!piece) return json({ error: 'not_given' }, 404);
        const pk = await privateKey();
        if (!pk) return json({ error: 'no_private_key' }, 500);
        if (pk.keyId !== sec.key_id) return json({ error: 'wrong_key' }, 500);
        const value = dec.decode(await openSealed(pk.key, sec.wrapped_key, piece.iv, piece.ct, fieldAad(userId, field)));
        await log(admin, userId, me.id, purpose === 'copy' ? 'copied' : 'revealed', FIELD_LABELS[field]);
        return json({ value });
      }

      case 'file': {
        const no = await staffCheck(); if (no) return no;
        const userId = String(body.userId || '');
        await admin.rpc('contracting_purge_expired');
        const { data: sec } = await admin.from('contracting_secrets').select('user_id, key_id, wrapped_key, expires_at, submitted_at').eq('user_id', userId).maybeSingle();
        if (!sec || !sec.submitted_at || new Date(sec.expires_at).getTime() <= Date.now()) return json({ error: 'gone' }, 404);
        const { data: f } = await admin.from('contracting_files').select('*').eq('id', String(body.fileId || '')).eq('user_id', userId).maybeSingle();
        if (!f) return json({ error: 'not_found' }, 404);
        const pk = await privateKey();
        if (!pk) return json({ error: 'no_private_key' }, 500);
        if (pk.keyId !== sec.key_id) return json({ error: 'wrong_key' }, 500);
        const bytes = await openSealed(pk.key, sec.wrapped_key, f.iv, f.ct, fileAad(userId, f.kind));
        const name = dec.decode(await openSealed(pk.key, sec.wrapped_key, f.name.iv, f.name.ct, fileNameAad(userId, f.kind)));
        await log(admin, userId, me.id, 'viewed_file', FILE_LABELS[f.kind] || f.kind);
        return json({ name, mime: f.mime, data: toB64(bytes) });
      }

      case 'notify-sent': {
        const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: claimed } = await admin.from('contracting_cases').update({ notified_at: new Date().toISOString() })
          .eq('user_id', me.id).is('notified_at', null).gte('info_sent_at', since).is('info_deleted_at', null).select('user_id').maybeSingle();
        if (!claimed) return json({ ok: true, sent: false });
        const name = (await nameOf(admin, me.id)) || 'An agent';
        const sent = await emailStaff(admin, `Contracting info from ${name} is waiting`,
          [`${name} sent their contracting info.`, 'Enter it in SureLC from PaceLedger: Team & admin → Profiles → Contracting. It deletes itself 72 hours after it was sent.']);
        return json({ ok: true, sent });
      }

      // ---- setup checks ---------------------------------------------------------------
      case 'key-check': {
        const no = await staffCheck(); if (no) return no;
        const pk = await privateKey();
        if (!pk) return json({ ok: false, error: 'no_private_key' });
        if (!settings || !settings.key_id || body.keyId !== settings.key_id) return json({ ok: false, error: 'key_changed' });
        if (pk.keyId !== settings.key_id) return json({ ok: false, error: 'wrong_key' });
        let text = '';
        try { text = dec.decode(await openSealed(pk.key, String(body.wrappedKey || ''), String(body.iv || ''), String(body.ct || ''), checkAad(me.id))); } catch { /* wrong key */ }
        if (text !== `pl-key-check:${me.id}`) return json({ ok: false, error: 'wrong_key' });
        await admin.from('contracting_settings').update({ key_verified_at: new Date().toISOString() }).eq('id', true).eq('key_id', settings.key_id);
        await log(admin, null, me.id, 'key_verified', `Checked encryption key ${settings.key_id}`);
        return json({ ok: true });
      }

      case 'docuseal-check': {
        const no = await staffCheck(); if (no) return no;
        const id = Number(body.templateId || (settings && settings.docuseal_template_id) || 0);
        if (!id) return json({ ok: false, error: 'no_template' });
        let t: any;
        try { t = await ds(`/templates/${id}`); } catch (e) {
          const s = e instanceof DsError ? e.status : 0;
          return json({ ok: false, error: s === 401 || s === 403 ? 'bad_api_key' : s === 404 ? 'template_not_found' : 'docuseal_unreachable', detail: String((e as Error).message || e) });
        }
        const roles: string[] = (t.submitters || []).map((s: any) => String(s.name || ''));
        const fields: string[] = (t.fields || []).map((f: any) => String(f.name || ''));
        const warnings: string[] = [];
        if (!roles.some(r => r.toLowerCase() === AGENT_ROLE.toLowerCase())) warnings.push(`No role named "${AGENT_ROLE}".`);
        if (!roles.some(r => r.toLowerCase() === BIG_ROLE.toLowerCase())) warnings.push(`No role named "${BIG_ROLE}".`);
        for (const f of ['Agent Name', 'Agent Email', 'Agreement Date', 'Agent Type']) if (!fields.includes(f)) warnings.push(`No field named "${f}".`);
        return json({ ok: true, name: t.name || '', roles, fields, warnings, webhook: !!DOCUSEAL_WEBHOOK_TOKEN, email: !!(RESEND_API_KEY && INVITE_FROM_EMAIL), privateKey: !!(await privateKey()) });
      }

      default:
        return json({ error: 'unknown_action' }, 400);
    }
  } catch (e) {
    console.error(action, e);
    if (e instanceof DsError) return json({ error: 'docuseal', detail: e.message }, 502);
    return json({ error: 'server_error' }, 500);
  }
}

if (typeof Deno !== 'undefined') Deno.serve(handle);
