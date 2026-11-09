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

// Deploy: merging to main deploys it (.github/workflows/supabase-deploy.yml).
// It uses ../_shared, so it can't be pasted into the Supabase editor.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ANON_KEY, APP_URL, env, SERVICE_ROLE_KEY, SUPABASE_URL } from '../_shared/env.ts';
import { json, preflight } from '../_shared/http.ts';
import { emailConfigured, sendEmail } from '../_shared/email.ts';
import { esc } from '../_shared/html.ts';
const DOCUSEAL_API_KEY = env('DOCUSEAL_API_KEY');
const DOCUSEAL_API_URL = env('DOCUSEAL_API_URL', 'https://api.docuseal.com').replace(/\/+$/, '');
const DOCUSEAL_FORM_URL = env('DOCUSEAL_FORM_URL', 'https://docuseal.com').replace(/\/+$/, '');
const DOCUSEAL_WEBHOOK_TOKEN = env('DOCUSEAL_WEBHOOK_TOKEN');
const AGENT_ROLE = env('DOCUSEAL_AGENT_ROLE', 'Agent');
const BIG_ROLE = env('DOCUSEAL_BIG_ROLE', 'BIG Insurance Network');
const BIG_SIGNER_EMAIL = env('BIG_SIGNER_EMAIL', 'agency@biginsurancenetwork.com');

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
  bank_doc: 'Bank document',
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

// ---- Signing with what the agent adopted up front -----------------------------
// Before the agreement opens, the agent types their printed name and initials
// and draws their signature in PaceLedger, and agrees to use them on every
// spot. Those go on every Signature and Initials spot of the Agent role (by
// field id, so separate spots with the same name all get them), and the
// agreement opens with nothing left but Agent Type and Sign.
// Which of the agent's spots PaceLedger fills from what they adopted up
// front, so the form only stops where the agent has a real choice to make.
// Templates mark initials two ways: DocuSeal "Initials" fields, or Text
// fields named for them ("Guidelines acknowledgement", "Benefits Initial").
// The Exclusive / Non-Exclusive election initials are never filled: the
// agent picks one. Checkboxes, address, email and codes are left to them.
const ELECTION_RE = /exclusive|election|agent\s*type/i;
const INITIALS_RE = /initial|acknowledg/i;
const NAME_RE = /^(print(ed)?\s+)?(agent('s)?\s+)?(full\s+)?name$|part(y|ies)$|^independent\s+agent$/i;
const EMAIL_RE = /^(agent('s)?\s+)?e-?mail(\s+address)?$/i;
export function classifyAgentFields(mine: any[]) {
  const nm = (f: any) => String(f.name || '').trim();
  const out = {
    signature: mine.filter(f => f.type === 'signature'),
    initials: mine.filter(f => !ELECTION_RE.test(nm(f)) && (f.type === 'initials' || (f.type === 'text' && INITIALS_RE.test(nm(f))))),
    names: mine.filter(f => f.type === 'text' && NAME_RE.test(nm(f)) && !ELECTION_RE.test(nm(f))),
    emails: mine.filter(f => f.type === 'text' && EMAIL_RE.test(nm(f))),
    dates: mine.filter(f => f.type === 'date'),
    left: [] as string[],
  };
  const filled = new Set([...out.signature, ...out.initials, ...out.names, ...out.emails, ...out.dates]);
  out.left = mine.filter(f => !filled.has(f)).map(f => nm(f) || `(unnamed ${f.type})`);
  return out;
}
async function templateSpots(templateId: number) {
  const t = await ds(`/templates/${templateId}`);
  const roles: any[] = Array.isArray(t.submitters) ? t.submitters : [];
  const agent = roles.find(r => String(r.name || '').trim().toLowerCase() === AGENT_ROLE.toLowerCase());
  const mine: any[] = agent && agent.uuid ? (Array.isArray(t.fields) ? t.fields : []).filter(f => f && f.submitter_uuid === agent.uuid) : [];
  return classifyAgentFields(mine);
}
const fieldKey = (f: any) => String(f.uuid || f.name || '');
const hasValue = (v: unknown) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && String(v).trim() !== '');

// The agent's spots in their own agreement, and which already hold
// something. DocuSeal keeps each agreement's fields as they were when it was
// opened, so a template edited since (new or renamed initials boxes) no
// longer lines up with it: values for fields it doesn't have are dropped
// without an error. So this reads the agreement's own copy, and only falls
// back to the template when DocuSeal doesn't return it.
export function spotsFromSubmission(sub: any, agentSubmitterId: number | null) {
  const subs: any[] = sub && Array.isArray(sub.submitters) ? sub.submitters : [];
  const agent = subs.find(s => roleIs(s, AGENT_ROLE, agentSubmitterId));
  const all: any[] | null = sub && Array.isArray(sub.fields) ? sub.fields : null;
  if (!all || !agent || !agent.uuid) return null;
  const mine = all.filter(f => f && f.submitter_uuid === agent.uuid);
  const filled = new Set<string>();
  if (Array.isArray(agent.fields)) {
    agent.fields.forEach((f: any) => { if (f && f.uuid && hasValue(f.value)) filled.add(String(f.uuid)); });
  } else {
    // Only the values by field name: every field with a filled name counts.
    const named = new Set((Array.isArray(agent.values) ? agent.values : []).filter((v: any) => v && hasValue(v.value)).map((v: any) => String(v.field || '')));
    mine.forEach(f => { if (named.has(String(f.name || ''))) filled.add(fieldKey(f)); });
  }
  return { ...classifyAgentFields(mine), filled };
}
async function agreementSpots(row: any) {
  try {
    const got = spotsFromSubmission(await ds(`/submissions/${row.docuseal_submission_id}?include=fields`), row.agent_submitter_id);
    if (got) return got;
  } catch (e) { if (!(e instanceof DsError)) throw e; console.error('could not read the agreement fields', e); }
  return { ...(await templateSpots(Number(row.docuseal_template_id))), filled: null as Set<string> | null };
}

// What goes in each spot. skip: spots that already hold something (left as
// they are).
export function spotValues(spots: any, what: { signature?: string; initials?: string; printed?: string; today?: string; email?: string }, skip?: Set<string> | null) {
  const values: Record<string, string> = {};
  const put = (list: any[], v?: string) => list.forEach(f => {
    const k = fieldKey(f);
    if (k && v && !(skip && skip.has(k))) values[k] = v;
  });
  put(spots.signature, what.signature);
  put(spots.initials, what.initials);
  put(spots.names, what.printed);
  put(spots.dates, what.today);
  put(spots.emails, what.email);
  return values;
}
export function cleanPrintedName(v: unknown): string {
  return String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
}
export function cleanInitials(v: unknown): string {
  return String(v ?? '').replace(/[^A-Za-z.\- ]/g, '').replace(/\s+/g, '').toUpperCase().slice(0, 6);
}
const SIGNATURE_PNG = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;
function callerIp(req: Request): string {
  const f = req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0] || req.headers.get('x-real-ip') || '';
  return f.trim().slice(0, 45);
}
// The log line from when they adopted for this agreement (null if they
// haven't).
async function adoptedSince(admin: any, userId: string, since: string): Promise<string | null> {
  const { data } = await admin.from('contracting_log').select('detail').eq('user_id', userId).eq('action', 'signature_adopted')
    .gte('at', since).order('at', { ascending: false }).limit(1);
  return data && data.length ? String(data[0].detail || '') : null;
}
export const initialsFromLog = (detail: string) => cleanInitials((String(detail || '').match(/initials "([^"]{1,12})"/) || [])[1]);

// An agent who adopted before every spot could be filled (an older
// PaceLedger, or a template changed since) gets the rest when they come
// back: their initials (from the log) and printed name go in the spots that
// are still empty. Nothing already in the form changes. False means a
// signature or initials spot is still empty, so they adopt once more.
async function fillTheRest(admin: any, row: any, me: any, detail: string): Promise<boolean> {
  const spots = await agreementSpots(row);
  if (!spots.filled) return true; // can't tell what's empty: leave it
  const initials = initialsFromLog(detail);
  const values = spotValues(spots, { initials, printed: cleanPrintedName(row.agent_name), today: centralDay(), email: String(row.agent_email || me.email || '') }, spots.filled);
  const n = Object.keys(values).length;
  if (n) {
    await ds(`/submitters/${row.agent_submitter_id}`, { method: 'PUT', body: JSON.stringify({ values, send_email: false }) });
    await log(admin, me.id, me.id, 'spots_filled', `Filled ${n} more spot${n === 1 ? '' : 's'} with their adopted initials and name`);
  }
  const empty = (list: any[]) => list.some(f => !spots.filled!.has(fieldKey(f)) && !values[fieldKey(f)]);
  return !empty(spots.signature) && !empty(spots.initials);
}

// The agent's Exclusive / Non-Exclusive choice: a picker whose value says
// it ("Agent Type": "Non-Exclusive"), or one initials box per choice
// ("Exclusive initial", "Non-exclusive initial"), whichever they initialed.
export function electionFrom(values: any): string | null {
  const list = Array.isArray(values) ? values : values && typeof values === 'object' ? Object.entries(values).map(([field, value]) => ({ field, value })) : [];
  const initialed = new Set<string>();
  for (const v of list) {
    const field = String(v.field || '');
    if (!/agent\s*type|election|exclusive/i.test(field)) continue;
    const raw = String(v.value ?? '').trim();
    const s = raw.toLowerCase();
    if (s.includes('non')) return 'Non-Exclusive';
    if (s.includes('exclusive')) return 'Exclusive';
    if (raw && /initial/i.test(field) && /exclusive/i.test(field)) initialed.add(/non[\s-]*exclusive/i.test(field) ? 'Non-Exclusive' : 'Exclusive');
  }
  return initialed.size === 1 ? [...initialed][0] : null;
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
  if (!emailConfigured()) return false;
  const { data: staff } = await admin.from('contracting_staff').select('user_id');
  const emails: string[] = [];
  for (const s of staff || []) {
    const { data } = await admin.auth.admin.getUserById(s.user_id);
    if (data && data.user && data.user.email) emails.push(data.user.email);
  }
  if (!emails.length) return false;
  const text = `${lines.join('\n\n')}\n\nOpen PaceLedger: ${APP_URL}\n\nThis email never includes anyone's contracting info.`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#13212E">${lines.map(l => `<p>${esc(l)}</p>`).join('')}<p><a href="${APP_URL}">Open PaceLedger</a></p><p style="color:#5E6A77;font-size:13px">This email never includes anyone's contracting info.</p></div>`;
  return (await sendEmail({ to: emails, subject, text, html })).ok;
}

function timingSafeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---- The handler -------------------------------------------------------------------------
export async function handle(req: Request): Promise<Response> {
  const pre = preflight(req);
  if (pre) return pre;
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
        if (row && row.status === 'sent') {
          const detail = await adoptedSince(admin, me.id, row.created_at);
          let adopted = detail !== null;
          if (adopted) {
            try { adopted = await fillTheRest(admin, row, me, detail as string); } catch (e) { console.error('could not fill the rest', e); }
          }
          return json({ status: 'sent', src: await signingUrl(row.agent_submitter_id), email: row.agent_email, name: row.agent_name, adopted });
        }

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
        return json({ status: 'sent', src: a.embed_src || (await signingUrl(a.id)), email: me.email, name, adopted: false, agreement: saved });
      }

      // ---- the agent adopts their printed name, initials and signature --------
      case 'adopt-signature': {
        if (!settings || !settings.agreement_version) return json({ error: 'agreement_not_set_up' }, 400);
        const printed = cleanPrintedName(body.printedName);
        const initials = cleanInitials(body.initials);
        const signature = String(body.signature || '');
        if (body.consent !== true) return json({ error: 'consent_needed' }, 400);
        if (printed.length < 2 || !/[A-Za-z]/.test(printed)) return json({ error: 'printed_name_needed' }, 400);
        if (!initials || !/[A-Z]/.test(initials)) return json({ error: 'initials_needed' }, 400);
        if (!SIGNATURE_PNG.test(signature) || signature.length < 200 || signature.length > 400000) return json({ error: 'signature_needed' }, 400);
        const { data: rows } = await admin.from('producer_agreements').select('*').eq('user_id', me.id)
          .eq('version', settings.agreement_version).order('created_at', { ascending: false }).limit(1);
        const row = rows && rows[0];
        if (!row || row.status !== 'sent') return json({ error: 'agreement_not_open' }, 400);
        // The agreement's own fields, so every spot in the form they'll see
        // gets filled (not the template's, which may have changed since).
        const spots = await agreementSpots(row);
        if (!spots.signature.length && !spots.initials.length) return json({ error: 'no_signature_spots' }, 400);
        const what = { initials, printed, today: centralDay(), email: String(row.agent_email || me.email || '') };
        const put = async (sig: string) => {
          const values = spotValues(spots, { ...what, signature: sig });
          await ds(`/submitters/${row.agent_submitter_id}`, { method: 'PUT', body: JSON.stringify({ values, send_email: false }) });
        };
        try { await put(signature); } catch (e) {
          // Some DocuSeal versions want the image without the "data:" prefix.
          if (!(e instanceof DsError) || e.status !== 422) throw e;
          await put(signature.replace(/^data:image\/png;base64,/, ''));
        }
        await admin.from('producer_agreements').update({ agent_name: printed }).eq('id', row.id).eq('status', 'sent');
        const ip = callerIp(req);
        await log(admin, me.id, me.id, 'signature_adopted',
          `Adopted a drawn signature and initials "${initials}" as ${printed} for ${settings.agreement_version} (${spots.signature.length} signature, ${spots.initials.length} initials, ${spots.names.length} name, ${spots.emails.length} email and ${spots.dates.length} date spots filled)${ip ? ` from ${ip}` : ''}`);
        return json({ ok: true, signatures: spots.signature.length, initials: spots.initials.length, names: spots.names.length, emails: spots.emails.length, dates: spots.dates.length });
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
        // The spots filled in from what agents adopt before signing, and
        // what's left for them to fill in themselves.
        const agentRole = (t.submitters || []).find((r: any) => String(r.name || '').trim().toLowerCase() === AGENT_ROLE.toLowerCase());
        const agentFields = agentRole && agentRole.uuid ? (t.fields || []).filter((f: any) => f && f.submitter_uuid === agentRole.uuid) : [];
        const c = classifyAgentFields(agentFields);
        const spots = { signature: c.signature.length, initials: c.initials.length, names: c.names.length, emails: c.emails.length, dates: c.dates.length, left: c.left };
        if (agentRole && !spots.signature) warnings.push(`The "${AGENT_ROLE}" role has no Signature field.`);
        if (agentRole && !spots.names) warnings.push(`The "${AGENT_ROLE}" role has no printed-name field (name one "Agent name" or "Print name").`);
        if (agentRole && !agentFields.some((f: any) => /agent\s*type|election|exclusive/i.test(String(f.name || '')))) warnings.push(`No Exclusive / Non-Exclusive field for the agent (name it with "Exclusive", e.g. "Exclusive initial" and "Non-exclusive initial").`);
        return json({ ok: true, name: t.name || '', roles, fields, warnings, spots, webhook: !!DOCUSEAL_WEBHOOK_TOKEN, email: emailConfigured(), privateKey: !!(await privateKey()) });
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
