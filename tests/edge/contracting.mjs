// Runs the real contracting edge function (bundled for Node) against an
// in-memory database and a fake DocuSeal + Resend.
import path from 'node:path';
import crypto from 'node:crypto';
import { bundleFunction } from '../tools/bundle.mjs';
import { REPO, TESTS, OUT } from '../tools/paths.mjs';
const here = path.dirname(new URL(import.meta.url).pathname);
const repo = REPO;
const vault = await import(path.join(repo, 'src/lib/vault.js'));
const key = await vault.generateKeyPair();
Object.assign(process.env, {
  SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon',
  DOCUSEAL_API_KEY: 'ds-key', DOCUSEAL_API_URL: 'https://api.docuseal.test', DOCUSEAL_WEBHOOK_TOKEN: 'hook-token-123456',
  RESEND_API_KEY: 're_test', INVITE_FROM_EMAIL: 'PaceLedger <no-reply@example.com>', CONTRACTING_PRIVATE_KEY: key.privateText,
});
const E = await bundleFunction('contracting');
const PL = globalThis.__PL;
let failures = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { failures++; console.log('FAIL', m); } };

// ---- fake DocuSeal + Resend + file downloads ----------------------------------
const DS = { subs: {}, nextSub: 500, nextSubmitter: 9000, calls: [], templates: { 77: { id: 77, name: 'BIG Independent Agent Agreement 2026.1', submitters: [{ name: 'Agent', uuid: 'u-agent' }, { name: 'BIG Insurance Network', uuid: 'u-big' }],
  fields: [
    { uuid: 'f-name', name: 'Agent Name', type: 'text', submitter_uuid: 'u-agent' }, { uuid: 'f-email', name: 'Agent Email', type: 'text', submitter_uuid: 'u-agent' },
    { uuid: 'f-date', name: 'Agreement Date', type: 'text', submitter_uuid: 'u-agent' }, { uuid: 'f-type', name: 'Agent Type', type: 'radio', submitter_uuid: 'u-agent' },
    { uuid: 'f-sig', name: 'Signature', type: 'signature', submitter_uuid: 'u-agent' },
    { uuid: 'f-ini1', name: 'Initials', type: 'initials', submitter_uuid: 'u-agent' }, { uuid: 'f-ini2', name: 'Initials', type: 'initials', submitter_uuid: 'u-agent' }, { uuid: 'f-ini3', name: '', type: 'initials', submitter_uuid: 'u-agent' },
    { uuid: 'f-big-sig', name: 'Signature', type: 'signature', submitter_uuid: 'u-big' }, { uuid: 'f-big-date', name: 'Date', type: 'date', submitter_uuid: 'u-big' },
  ] } } };
const emails = [];
const PDF = Buffer.from('%PDF-1.7 signed agreement ' + 'x'.repeat(5000));
const AUDIT = Buffer.from('%PDF-1.7 audit log ' + 'y'.repeat(3000));
// DocuSeal matches a value's key to one of the agreement's own fields, by
// uuid, then by name; keys it can't match are dropped without an error.
const dsResolve = (sub, s, key) => {
  const mine = (sub.template_fields || []).filter(f => f.submitter_uuid === s.uuid);
  const byU = mine.filter(f => f.uuid === key);
  return byU.length ? byU : mine.filter(f => f.name && (f.name === key || f.name.toLowerCase() === String(key).toLowerCase()));
};
const filledUuids = s => Object.entries(s.byUuid || {}).filter(([, v]) => v !== '' && v != null).map(([u]) => u);
const reply = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  const method = (init.method || 'GET').toUpperCase();
  if (url.startsWith('https://api.resend.com/')) { emails.push(JSON.parse(init.body)); return reply(200, { id: 'em_1' }); }
  if (url === 'https://files.docuseal.test/signed.pdf') return new Response(PDF);
  if (url === 'https://files.docuseal.test/audit.pdf') return new Response(AUDIT);
  if (!url.startsWith('https://api.docuseal.test/')) return reply(404, { error: 'unexpected ' + url });
  const h = init.headers || {};
  if (h['X-Auth-Token'] !== 'ds-key') return reply(401, { error: 'Not authenticated' });
  const p = url.slice('https://api.docuseal.test'.length);
  DS.calls.push(`${method} ${p}`);
  let m;
  if (method === 'POST' && p === '/submissions') {
    const b = JSON.parse(init.body);
    if (!DS.templates[b.template_id]) return reply(404, { error: 'Template not found' });
    const id = DS.nextSub++;
    const t = DS.templates[b.template_id];
    const roleUuid = role => ((t.submitters || []).find(r => r.name === role) || {}).uuid;
    const submitters = b.submitters.map(s => ({ id: DS.nextSubmitter++, submission_id: id, uuid: roleUuid(s.role), role: s.role, email: s.email, name: s.name, slug: 'slug' + DS.nextSubmitter, status: 'awaiting', completed_at: null, values: Object.entries(s.values || {}).map(([field, value]) => ({ field, value })), byUuid: {}, external_id: s.external_id || null }));
    // Like DocuSeal: the agreement keeps its own copy of the template's fields.
    DS.subs[id] = { id, status: 'pending', submitters, completed_at: null, audit_log_url: null, body: b, template_fields: JSON.parse(JSON.stringify(t.fields || [])) };
    submitters.forEach((s, i) => Object.entries(b.submitters[i].values || {}).forEach(([k, v]) => dsResolve(DS.subs[id], s, k).forEach(f => { s.byUuid[f.uuid] = v; })));
    return reply(200, submitters.map(s => ({ ...s, embed_src: `https://docuseal.com/s/${s.slug}` })));
  }
  if (method === 'GET' && (m = /^\/submissions\/(\d+)(\?include=fields)?$/.exec(p))) {
    const s = DS.subs[m[1]];
    if (!s) return reply(404, { error: 'Not found' });
    if (!m[2] || DS.noFieldsInclude) return reply(200, s);
    return reply(200, { ...s, fields: s.template_fields, submitters: s.submitters.map(x => ({ ...x, fields: Object.entries(x.byUuid || {}).map(([uuid, value]) => ({ uuid, name: (s.template_fields.find(f => f.uuid === uuid) || {}).name || '', value })) })) });
  }
  if (method === 'GET' && (m = /^\/submissions\/(\d+)\/documents\?merge=true$/.exec(p))) return reply(200, { id: Number(m[1]), documents: [{ name: 'agreement', url: 'https://files.docuseal.test/signed.pdf' }] });
  if ((m = /^\/submitters\/(\d+)$/.exec(p))) {
    const s = Object.values(DS.subs).flatMap(x => x.submitters).find(x => x.id === Number(m[1]));
    if (!s) return reply(404, { error: 'Not found' });
    if (method === 'PUT') {
      const body = JSON.parse(init.body);
      if (DS.rejectDataUrl && body.values && Object.values(body.values).some(v => String(v).startsWith('data:'))) return reply(422, { error: 'Invalid value' });
      DS.puts = (DS.puts || []).concat([{ id: s.id, body }]);
      const { values, ...rest } = body;
      Object.assign(s, rest);
      if (values) Object.entries(values).forEach(([field, value]) => s.values.push({ field, value }));
      const sub = DS.subs[s.submission_id];
      if (values) Object.entries(values).forEach(([k, v]) => dsResolve(sub, s, k).forEach(f => { s.byUuid[f.uuid] = v; }));
    }
    return reply(200, { ...s, embed_src: `https://docuseal.com/s/${s.slug}` });
  }
  if (method === 'GET' && (m = /^\/templates\/(\d+)$/.exec(p))) { const t = DS.templates[m[1]]; return t ? reply(200, t) : reply(404, { error: 'Not found' }); }
  return reply(404, { error: 'no route ' + p });
};
const complete = (subId, role, values) => {
  const sub = DS.subs[subId]; const s = sub.submitters.find(x => x.role === role);
  s.status = 'completed'; s.completed_at = new Date().toISOString(); if (values) s.values.push(...values);
  if (sub.submitters.every(x => x.completed_at)) { sub.status = 'completed'; sub.completed_at = s.completed_at; sub.audit_log_url = 'https://files.docuseal.test/audit.pdf'; }
};

// ---- people -----------------------------------------------------------------
const MORGAN = { id: '11111111-1111-1111-1111-111111111111', email: 'morgan@example.com' };
const PAM = { id: '33333333-3333-3333-3333-333333333333', email: 'pam@example.com' };
const JORDAN = { id: '22222222-2222-2222-2222-222222222222', email: 'jordan.ellis@example.com' };
PL.emails = { [MORGAN.id]: MORGAN.email, [PAM.id]: PAM.email, [JORDAN.id]: JORDAN.email };
PL.rpc.contracting_purge_expired = () => 0;
PL.db = {
  profiles: [
    { id: MORGAN.id, display_name: 'Morgan Lee', role: 'super_admin' },
    { id: PAM.id, display_name: 'Pam Ortiz', role: 'super_admin' },
    { id: JORDAN.id, display_name: 'Jordan Ellis', role: 'advisor' },
  ],
  contracting_staff: [{ user_id: MORGAN.id }],
  contracting_settings: [{ id: true, enabled: true, paused: false, public_key: key.publicJwk, key_id: key.keyId, agreement_version: 'BIG-IAA-2026.1', docuseal_template_id: 77 }],
  licensing_progress: [{ user_id: JORDAN.id, contracting_sent_on: '2026-09-01', profile_submitted_on: null }],
  producer_agreements: [], contracting_log: [], contracting_cases: [], contracting_secrets: [], contracting_files: [],
};

const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);
function jwtFor(u, { aal = 'aal1', totpAgo = null } = {}) {
  const amr = [{ method: 'password', timestamp: now() - 3600 }];
  if (totpAgo != null) amr.unshift({ method: 'totp', timestamp: now() - totpAgo });
  return `${b64u({ alg: 'HS256' })}.${b64u({ sub: u.id, email: u.email, aal, amr })}.sig`;
}
async function call(u, body, opts = {}) {
  PL.user = u;
  const headers = { 'Content-Type': 'application/json' };
  if (u) headers.Authorization = `Bearer ${jwtFor(u, opts)}`;
  Object.assign(headers, opts.headers || {});
  const res = await E.handle(new Request('https://proj.supabase.co/functions/v1/contracting' + (opts.query || ''), { method: opts.method || 'POST', headers, body: opts.method === 'OPTIONS' ? undefined : JSON.stringify(body) }));
  let data = null; try { data = await res.clone().json(); } catch { data = await res.text(); }
  return { status: res.status, data, headers: res.headers };
}
const staff = { aal: 'aal2', totpAgo: 60 };
const hook = (event_type, data, token = 'hook-token-123456') => call(null, { event_type, data }, { query: `?webhook=${token}` });

try {
  // ---- basics ----
  let r = await call(null, {}, { method: 'OPTIONS' });
  ok(r.status === 200 && r.headers.get('Access-Control-Allow-Origin') === '*', 'OPTIONS answers CORS');
  r = await call(null, { action: 'reveal' });
  ok(r.status === 401 && r.data.error === 'not_signed_in', 'no sign-in is refused');
  r = await call(JORDAN, { action: 'nope' });
  ok(r.status === 400 && r.data.error === 'unknown_action', 'unknown action is refused');

  // ---- agent starts signing ----
  r = await call(JORDAN, { action: 'agreement-session' });
  ok(r.status === 200 && r.data.status === 'sent' && /^https:\/\/docuseal\.com\/s\//.test(r.data.src), 'agreement-session returns a signing link');
  const ag = PL.db.producer_agreements[0];
  ok(ag && ag.status === 'sent' && ag.agent_email === JORDAN.email && ag.agent_name === 'Jordan Ellis' && ag.version === 'BIG-IAA-2026.1', 'agreement row saved as sent');
  const sub = DS.subs[ag.docuseal_submission_id];
  const agentVals = Object.fromEntries(sub.body.submitters[0].values ? Object.entries(sub.body.submitters[0].values) : []);
  ok(agentVals['Agent Name'] === 'Jordan Ellis' && agentVals['Agent Email'] === JORDAN.email && /\d{4}$/.test(agentVals['Agreement Date']), 'name, email and date are pre-filled');
  ok(sub.body.send_email === false && sub.body.submitters.every(s => s.send_email === false), 'DocuSeal sends no emails of its own');
  r = await call(JORDAN, { action: 'agreement-session' });
  ok(r.data.status === 'sent' && PL.db.producer_agreements.length === 1, 'opening it again reuses the same agreement');
  ok(r.data.adopted === false && r.data.name === 'Jordan Ellis', 'not adopted yet; their name comes back for the form');
  // BIG edits the template after Jordan opened it: one initials box is
  // redone (new uuid) and an acknowledgement box is added. Jordan's
  // agreement still has the fields it was opened with.
  const T77 = DS.templates[77];
  DS.templates[77] = { ...T77, fields: T77.fields.map(f => (f.uuid === 'f-ini3' ? { ...f, uuid: 'f-ini3-redone' } : f)).concat([{ uuid: 'f-guide', name: 'Guidelines acknowledgement', type: 'text', submitter_uuid: 'u-agent' }]) };

  // ---- the agent adopts their printed name, initials and signature ----
  const SIG = 'data:image/png;base64,' + Buffer.from('PNG' + 'z'.repeat(400)).toString('base64');
  const adopt = (u, extra = {}, opts = {}) => call(u, { action: 'adopt-signature', printedName: 'Jordan  A. Ellis ', initials: 'jae', signature: SIG, consent: true, ...extra }, opts);
  r = await adopt(JORDAN, { consent: false });
  ok(r.status === 400 && r.data.error === 'consent_needed', 'adopting needs their agreement');
  r = await adopt(JORDAN, { signature: 'data:image/png;base64,AAAA' });
  ok(r.status === 400 && r.data.error === 'signature_needed', 'a blank signature is refused');
  r = await adopt(JORDAN, { signature: 'data:image/svg+xml;base64,' + Buffer.from('<svg>' + 'x'.repeat(400) + '</svg>').toString('base64') });
  ok(r.status === 400 && r.data.error === 'signature_needed', 'only a PNG signature is taken');
  r = await adopt(JORDAN, { initials: '12' });
  ok(r.status === 400 && r.data.error === 'initials_needed', 'initials need letters');
  r = await adopt(JORDAN, { printedName: 'J' });
  ok(r.status === 400 && r.data.error === 'printed_name_needed', 'a printed name is needed');
  r = await adopt(PAM);
  ok(r.status === 400 && r.data.error === 'agreement_not_open', 'no open agreement, nothing to adopt for');
  const putsBefore = (DS.puts || []).length;
  r = await adopt(JORDAN, {}, { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } });
  ok(r.status === 200 && r.data.ok && r.data.signatures === 1 && r.data.initials === 3, `adopted: 1 signature and 3 initials spots (${JSON.stringify(r.data)})`);
  const put = DS.puts[DS.puts.length - 1];
  ok(put && put.id === ag.agent_submitter_id && (DS.puts.length === putsBefore + 1), "put on the agent's own submitter");
  ok(put.body.values['f-sig'] === SIG, 'the drawn signature goes on the signature spot');
  ok(['f-ini1', 'f-ini2', 'f-ini3'].every(k => put.body.values[k] === 'JAE'), 'initials go on every initials spot, even two with the same name and one with none');
  ok(!('f-ini3-redone' in put.body.values) && !('f-guide' in put.body.values), "spots from the template's later edit aren't sent (Jordan's agreement doesn't have them)");
  const jordanSigner = DS.subs[ag.docuseal_submission_id].submitters.find(x => x.role === 'Agent');
  ok(['f-sig', 'f-ini1', 'f-ini2', 'f-ini3', 'f-name'].every(k => jordanSigner.byUuid[k]), 'every signature, initials and name spot in the form Jordan sees is filled');
  ok(put.body.values['f-name'] === 'Jordan A. Ellis', 'the printed name goes on Agent Name');
  ok(!('f-big-sig' in put.body.values) && !('Signature' in put.body.values), "BIG's signature spot is left alone");
  ok(put.body.send_email === false, 'DocuSeal still sends no email');
  ok(PL.db.producer_agreements[0].agent_name === 'Jordan A. Ellis', 'the agreement keeps their printed name');
  const adoptLog = PL.db.contracting_log.find(l => l.action === 'signature_adopted');
  ok(adoptLog && adoptLog.user_id === JORDAN.id && /Jordan A\. Ellis/.test(adoptLog.detail) && /"JAE"/.test(adoptLog.detail) && /1 signature, 3 initials, 1 name, 1 email, 0 agent code and 0 date spots filled/.test(adoptLog.detail) && /from 203\.0\.113\.9$/.test(adoptLog.detail), 'adopting is logged with their IP: ' + (adoptLog && adoptLog.detail));
  PL.db.contracting_log.forEach(l => { l.at = l.at || l.created_at; }); // the table's default, now()
  const putsReopen = DS.puts.length;
  r = await call(JORDAN, { action: 'agreement-session' });
  ok(r.data.status === 'sent' && r.data.adopted === true && r.data.name === 'Jordan A. Ellis', 'opening it again goes straight to the filled-in agreement');
  ok(DS.puts.length === putsReopen, 'nothing left to fill, so nothing is sent to DocuSeal');
  DS.templates[77] = T77;
  DS.rejectDataUrl = true;
  r = await adopt(JORDAN);
  const retry = DS.puts[DS.puts.length - 1];
  ok(r.status === 200 && retry.body.values['f-sig'] === SIG.replace('data:image/png;base64,', ''), 'a DocuSeal that wants plain base64 gets it on the second try');
  DS.rejectDataUrl = false;

  // ---- webhook ----
  r = await hook('form.completed', { submission_id: ag.docuseal_submission_id }, 'wrong-token-00000');
  ok(r.status === 401, 'webhook with the wrong token is refused');
  complete(ag.docuseal_submission_id, 'Agent', [{ field: 'Agent Type', value: 'Exclusive Agent' }]);
  r = await hook('form.completed', { submission_id: ag.docuseal_submission_id, submission: { id: ag.docuseal_submission_id } });
  ok(r.status === 200 && PL.db.producer_agreements[0].status === 'agent_signed', 'webhook marks it agent_signed');
  ok(PL.db.producer_agreements[0].election === 'Exclusive', 'election read from the Agent Type field');
  ok(emails.length === 1 && emails[0].to.includes(MORGAN.email) && !emails[0].to.includes(PAM.email) && /Countersign/.test(emails[0].subject), 'contracting team (only) emailed to countersign');
  r = await hook('form.completed', { submission_id: ag.docuseal_submission_id });
  ok(emails.length === 1, 'repeat webhook sends no second email');
  r = await hook('form.viewed', { id: 99999 });
  ok(r.status === 200 && r.data.ignored, 'unknown submission is ignored');

  // ---- countersign ----
  r = await call(PAM, { action: 'countersign-session', agreementId: ag.id }, staff);
  ok(r.status === 403 && r.data.error === 'not_contracting_staff', 'super admin not on the team cannot countersign');
  r = await call(MORGAN, { action: 'countersign-session', agreementId: ag.id });
  ok(r.status === 403 && r.data.error === 'two_step_required', 'countersign needs two-step');
  r = await call(MORGAN, { action: 'countersign-session', agreementId: ag.id }, { aal: 'aal2', totpAgo: 13 * 3600 });
  ok(r.status === 403 && r.data.error === 'two_step_required', 'two-step older than 12 hours is refused');
  r = await call(JORDAN, { action: 'countersign-session', agreementId: ag.id }, staff);
  ok(r.status === 403, 'the agent cannot countersign');
  r = await call(MORGAN, { action: 'countersign-session', agreementId: ag.id }, staff);
  const bigS = sub.submitters.find(s => s.role === 'BIG Insurance Network');
  ok(r.status === 200 && r.data.status === 'agent_signed' && r.data.src.includes(bigS.slug), 'countersign-session returns BIG\'s signing link');
  ok(bigS.email === MORGAN.email && bigS.name === 'Morgan Lee', 'countersigner put on the form');
  ok(PL.db.producer_agreements[0].countersigned_by === MORGAN.id, 'countersigner recorded');

  // ---- completion via sync ----
  complete(ag.docuseal_submission_id, 'BIG Insurance Network');
  r = await call(JORDAN, { action: 'sync-agreement', agreementId: ag.id });
  const done = PL.db.producer_agreements[0];
  ok(r.data.status === 'completed' && done.status === 'completed', 'sync-agreement completes it');
  const sha = crypto.createHash('sha256').update(PDF).digest('hex');
  ok(done.pdf_path === `${JORDAN.id}/${ag.id}/signed.pdf` && done.pdf_sha256 === sha && PL.storage[`agreements/${done.pdf_path}`], 'signed PDF stored with its SHA-256');
  ok(done.audit_path && done.audit_sha256 === crypto.createHash('sha256').update(AUDIT).digest('hex'), 'audit certificate stored with its SHA-256');
  const lp = PL.db.licensing_progress.find(x => x.user_id === JORDAN.id);
  ok(lp.contracting_sent_on && lp.contracting_sent_on !== '2026-09-01', 'agreement step re-dated to the countersign day');
  ok(PL.db.contracting_log.some(l => l.action === 'agreement_completed') && PL.db.contracting_log.some(l => l.action === 'agreement_signed'), 'signing logged');
  r = await call(JORDAN, { action: 'agreement-session' });
  ok(r.data.status === 'completed', 'agreement-session after completion says completed');
  r = await call(PAM, { action: 'sync-agreement', agreementId: ag.id }, staff);
  ok(r.status === 403, 'someone else cannot sync another person\'s agreement');

  // ---- encrypted info ----
  const fields = { first_name: 'Jordan', last_name: 'Ellis', ssn: '512-34-6789', routing: '011000015', account: '000123456789', background: JSON.stringify({ answers: { 6: 'yes' }, notes: { 6: 'paid' } }) };
  const fileBytes = new Uint8Array(Buffer.from('%PDF-1.4 eo cert'));
  const encd = await vault.encryptSubmission({ publicJwk: key.publicJwk, userId: JORDAN.id, fields, files: [{ kind: 'eo_certificate', name: 'eo.pdf', mime: 'application/pdf', bytes: fileBytes }] });
  ok(encd && encd.wrappedKey && encd.fields && encd.fields.ssn, 'encrypted in the vault format');
  const expires = new Date(Date.now() + 72 * 3600e3).toISOString();
  PL.db.contracting_secrets.push({ user_id: JORDAN.id, key_id: key.keyId, wrapped_key: encd.wrappedKey, fields: encd.fields, submitted_at: new Date().toISOString(), expires_at: expires });
  const ef = encd.files[0];
  PL.db.contracting_files.push({ id: 'file-1', user_id: JORDAN.id, kind: ef.kind, mime: ef.mime, size: fileBytes.length, name: ef.name, iv: ef.iv, ct: ef.ct });
  r = await call(MORGAN, { action: 'reveal', userId: JORDAN.id, field: 'ssn' }, staff);
  ok(r.status === 200 && r.data.value === '512-34-6789', 'reveal decrypts the SSN');
  r = await call(MORGAN, { action: 'reveal', userId: JORDAN.id, field: 'routing', purpose: 'copy' }, staff);
  ok(r.data.value === '011000015' && PL.db.contracting_log.some(l => l.action === 'copied' && l.detail === 'Routing number'), 'copy decrypts and logs "copied"');
  ok(PL.db.contracting_log.some(l => l.action === 'revealed' && l.detail === 'Social Security number' && l.actor_name === 'Morgan Lee'), 'reveal logged with who');
  ok(!JSON.stringify(PL.db.contracting_log).includes('512-34') && !JSON.stringify(emails).includes('512-34'), 'no info in the log or emails');
  r = await call(MORGAN, { action: 'reveal', userId: JORDAN.id, field: 'password' }, staff);
  ok(r.status === 400 && r.data.error === 'unknown_field', 'unknown field refused');
  r = await call(MORGAN, { action: 'reveal', userId: JORDAN.id, field: 'dob' }, staff);
  ok(r.status === 404 && r.data.error === 'not_given', 'empty field says not_given');
  r = await call(JORDAN, { action: 'reveal', userId: JORDAN.id, field: 'ssn' }, staff);
  ok(r.status === 403, 'agents cannot reveal, even their own');
  r = await call(MORGAN, { action: 'reveal', userId: JORDAN.id, field: 'ssn' }, { aal: 'aal1' });
  ok(r.status === 403 && r.data.error === 'two_step_required', 'reveal needs two-step');
  r = await call(MORGAN, { action: 'file', userId: JORDAN.id, fileId: 'file-1' }, staff);
  ok(r.status === 200 && r.data.name === 'eo.pdf' && r.data.mime === 'application/pdf' && Buffer.from(r.data.data, 'base64').equals(Buffer.from(fileBytes)), 'file decrypts with its name');
  // tamper: another person's AAD
  const s0 = PL.db.contracting_secrets[0];
  PL.db.contracting_secrets.push({ ...s0, user_id: '44444444-4444-4444-4444-444444444444' });
  r = await call(MORGAN, { action: 'reveal', userId: '44444444-4444-4444-4444-444444444444', field: 'ssn' }, staff);
  ok(r.status === 500 && r.data.error === 'server_error', 'info copied onto another person will not decrypt');
  PL.db.contracting_secrets.pop();
  s0.expires_at = new Date(Date.now() - 1000).toISOString();
  r = await call(MORGAN, { action: 'reveal', userId: JORDAN.id, field: 'ssn' }, staff);
  ok(r.status === 404 && r.data.error === 'gone', 'expired info cannot be revealed');
  r = await call(MORGAN, { action: 'file', userId: JORDAN.id, fileId: 'file-1' }, staff);
  ok(r.status === 404 && r.data.error === 'gone', 'expired file cannot be opened');
  s0.expires_at = expires; s0.key_id = 'ffffffffffffffff';
  r = await call(MORGAN, { action: 'reveal', userId: JORDAN.id, field: 'ssn' }, staff);
  ok(r.status === 500 && r.data.error === 'wrong_key', 'a different key id is reported');
  s0.key_id = key.keyId;
  const savedKey = process.env.CONTRACTING_PRIVATE_KEY; process.env.CONTRACTING_PRIVATE_KEY = '';
  r = await call(MORGAN, { action: 'reveal', userId: JORDAN.id, field: 'ssn' }, staff);
  ok(r.status === 500 && r.data.error === 'no_private_key', 'missing private key is reported');
  process.env.CONTRACTING_PRIVATE_KEY = savedKey;

  // ---- notify-sent ----
  PL.db.contracting_cases.push({ user_id: JORDAN.id, info_sent_at: new Date().toISOString(), notified_at: null, info_deleted_at: null });
  const before = emails.length;
  r = await call(JORDAN, { action: 'notify-sent' });
  ok(r.data.sent === true && emails.length === before + 1 && emails[emails.length - 1].to.join() === MORGAN.email, 'team emailed once info arrives');
  ok(!/512|011000015|000123456789/.test(JSON.stringify(emails[emails.length - 1])), 'the email has no info in it');
  r = await call(JORDAN, { action: 'notify-sent' });
  ok(r.data.sent === false && emails.length === before + 1, 'only one email per submission');

  // ---- key-check ----
  const kc = await vault.encryptKeyCheck(key.publicJwk, MORGAN.id);
  r = await call(MORGAN, { action: 'key-check', ...kc }, staff);
  ok(r.data.ok === true && PL.db.contracting_settings[0].key_verified_at, 'key-check passes with the matching key');
  r = await call(MORGAN, { action: 'key-check', ...kc, keyId: 'aaaaaaaaaaaaaaaa' }, staff);
  ok(r.data.ok === false && r.data.error === 'key_changed', 'key-check notices a changed key');
  const other = await vault.generateKeyPair();
  const kc2 = await vault.encryptKeyCheck(other.publicJwk, MORGAN.id);
  r = await call(MORGAN, { action: 'key-check', ...kc2, keyId: key.keyId }, staff);
  ok(r.data.ok === false && r.data.error === 'wrong_key', 'key-check fails for the wrong key');

  // ---- docuseal-check ----
  r = await call(MORGAN, { action: 'docuseal-check', templateId: 77 }, staff);
  ok(r.data.ok && r.data.warnings.length === 0 && r.data.webhook && r.data.email && r.data.privateKey, 'docuseal-check passes for a good template');
  ok(r.data.spots && r.data.spots.signature === 1 && r.data.spots.initials === 3, 'docuseal-check counts the signature and initials spots');
  DS.templates[78] = { id: 78, name: 'Old', submitters: [{ name: 'First Party' }], fields: [{ name: 'Name' }] };
  r = await call(MORGAN, { action: 'docuseal-check', templateId: 78 }, staff);
  ok(r.data.ok && r.data.warnings.length === 2 && r.data.warnings.every(w => /No role named/.test(w)), 'docuseal-check lists missing roles: ' + JSON.stringify(r.data.warnings));
  // An Agent role with no signature, no name box and no election
  DS.templates[81] = { id: 81, name: 'Thin', submitters: [{ name: 'Agent', uuid: 'a' }, { name: 'BIG Insurance Network', uuid: 'b' }], fields: [{ name: 'Benefits Initial', type: 'text', submitter_uuid: 'a' }] };
  r = await call(MORGAN, { action: 'docuseal-check', templateId: 81 }, staff);
  ok(r.data.ok && r.data.warnings.length === 3 && /no Signature field/.test(r.data.warnings[0]) && /printed-name/.test(r.data.warnings[1]) && /Exclusive/.test(r.data.warnings[2]), 'docuseal-check: no signature, name or election for the agent');
  ok(r.data.spots.initials === 1 && r.data.spots.left.length === 0, 'a Text box named for initials counts as an initials spot');
  r = await call(MORGAN, { action: 'docuseal-check', templateId: 79 }, staff);
  ok(!r.data.ok && r.data.error === 'template_not_found', 'missing template reported');
  process.env.DOCUSEAL_API_KEY = 'x';
  // API key is read at start; simulate a bad key from DocuSeal's side instead
  const realFetch = globalThis.fetch; globalThis.fetch = async (u, i) => (String(u).includes('/templates/') ? reply(401, { error: 'Not authenticated' }) : realFetch(u, i));
  r = await call(MORGAN, { action: 'docuseal-check', templateId: 77 }, staff);
  ok(!r.data.ok && r.data.error === 'bad_api_key', 'bad API key reported');
  globalThis.fetch = realFetch;

  // ---- an agent who adopted under the older PaceLedger ----
  // (Text initials boxes weren't filled then.) Coming back fills the empty
  // spots from what they adopted; nothing they typed changes.
  DS.templates[80] = { id: 80, name: 'BIG Independent Agent Agreement 2026.2', submitters: [{ name: 'Agent', uuid: 'a2' }, { name: 'BIG Insurance Network', uuid: 'b2' }],
    fields: [
      { uuid: 't-name', name: 'Agent name', type: 'text', submitter_uuid: 'a2' }, { uuid: 't-print', name: 'Print name', type: 'text', submitter_uuid: 'a2' },
      { uuid: 't-sig', name: 'Agent signature', type: 'signature', submitter_uuid: 'a2' }, { uuid: 't-date', name: 'Agent date', type: 'date', submitter_uuid: 'a2' },
      { uuid: 't-ben', name: 'Benefits Initial', type: 'text', submitter_uuid: 'a2' }, { uuid: 't-guide', name: 'Guidelines acknowledgement', type: 'text', submitter_uuid: 'a2' },
      { uuid: 't-excl', name: 'Exclusive initial', type: 'text', submitter_uuid: 'a2' }, { uuid: 't-nonex', name: 'Non-exclusive initial', type: 'text', submitter_uuid: 'a2' },
      { uuid: 't-email', name: 'Email', type: 'text', submitter_uuid: 'a2' }, { uuid: 't-big', name: 'Signature', type: 'signature', submitter_uuid: 'b2' },
      { uuid: 't-code', name: 'Agent code', type: 'text', submitter_uuid: 'a2' }, { uuid: 't-code2', name: 'Agent code', type: 'text', submitter_uuid: 'a2' },
      { uuid: 't-ident', name: 'Agent identifier', type: 'text', submitter_uuid: 'a2' },
    ] };
  const S0 = { ...PL.db.contracting_settings[0] };
  Object.assign(PL.db.contracting_settings[0], { docuseal_template_id: 80, agreement_version: 'BIG-IAA-2026.2' });
  PL.db.profiles.push({ id: '77777777-7777-7777-7777-777777777777', display_name: 'Taylor Reed', role: 'advisor', npn: '1234-5678' });
  const TAYLOR = { id: '77777777-7777-7777-7777-777777777777', email: 'taylor@example.com' };
  PL.emails[TAYLOR.id] = TAYLOR.email;
  r = await call(TAYLOR, { action: 'agreement-session' });
  const tag = PL.db.producer_agreements.find(a => a.user_id === TAYLOR.id);
  const tSigner = DS.subs[tag.docuseal_submission_id].submitters.find(x => x.role === 'Agent');
  ok(tSigner.byUuid['t-name'] === 'Taylor Reed', "2026.2's lower-case \"Agent name\" gets their name when the agreement opens");
  ok(tSigner.byUuid['t-print'] === 'Taylor Reed' && /^\d{4}-\d{2}-\d{2}$/.test(tSigner.byUuid['t-date']) && tSigner.byUuid['t-email'] === TAYLOR.email,
    'opening it fills every name, date and email spot too, before any adopt step');
  ok(['t-code', 't-code2', 't-ident'].every(k => tSigner.byUuid[k] === '12345678'), 'and their NPN, digits only, in Agent code and Agent identifier');
  ok(!['t-sig', 't-ben', 't-guide', 't-excl', 't-nonex', 't-big'].some(k => tSigner.byUuid[k]), 'but no signature or initials until they adopt, and not the election');
  ok(PL.db.contracting_log.some(l => l.action === 'details_filled' && l.user_id === TAYLOR.id && /NPN/.test(l.detail)), 'the details fill is logged');
  // What the older PaceLedger left: signature and name, no text initials;
  // they typed their own email.
  Object.assign(tSigner.byUuid, { 't-sig': SIG, 't-name': 'Taylor Q. Reed', 't-email': 'typed@example.com' });
  tag.agent_name = 'Taylor Q. Reed';
  PL.db.contracting_log.push({ user_id: TAYLOR.id, action: 'signature_adopted', at: new Date(Date.now() + 1000).toISOString(),
    detail: 'Adopted a drawn signature and initials "TQR" as Taylor Q. Reed for BIG-IAA-2026.2 (1 signature, 0 initials, 1 name and 1 date spots filled)' });
  const putsT = DS.puts.length;
  r = await call(TAYLOR, { action: 'agreement-session' });
  const top = DS.puts[DS.puts.length - 1];
  ok(r.data.status === 'sent' && r.data.adopted === true, 'they go straight to the agreement');
  ok(DS.puts.length === putsT + 1 && top.id === tag.agent_submitter_id, 'one fill for the empty spots');
  ok(top.body.values['t-ben'] === 'TQR' && top.body.values['t-guide'] === 'TQR', 'the empty Text initials boxes get their adopted initials: ' + JSON.stringify(top.body.values));
  ok(!('t-print' in top.body.values) && !('t-date' in top.body.values), 'the name and date filled when it opened stay');
  ok(!['t-sig', 't-name', 't-email', 't-excl', 't-nonex', 't-big'].some(k => k in top.body.values), "what's already there, the election and BIG's spot are left alone");
  ok(tSigner.byUuid['t-email'] === 'typed@example.com', 'the email they typed stays');
  const fillLog = PL.db.contracting_log.find(l => l.action === 'spots_filled' && l.user_id === TAYLOR.id);
  ok(fillLog && /Filled 2 more spots/.test(fillLog.detail), 'the fill is logged: ' + (fillLog && fillLog.detail));
  r = await call(TAYLOR, { action: 'agreement-session' });
  ok(r.data.adopted === true && DS.puts.length === putsT + 1, 'opening it again sends nothing more');
  // A signature spot still empty (nothing stored to fill it with): they adopt once more.
  delete tSigner.byUuid['t-sig'];
  r = await call(TAYLOR, { action: 'agreement-session' });
  ok(r.data.status === 'sent' && r.data.adopted === false, 'an empty signature spot sends them back to adopt');
  r = await call(TAYLOR, { action: 'adopt-signature', printedName: 'Taylor Q. Reed', initials: 'tqr', signature: SIG, consent: true });
  ok(r.status === 200 && r.data.signatures === 1 && r.data.initials === 2 && tSigner.byUuid['t-sig'] === SIG && tSigner.byUuid['t-excl'] === undefined, 'adopting again fills it; the election is still theirs to pick');
  // A DocuSeal that doesn't return the agreement's fields: the template's are used.
  DS.noFieldsInclude = true;
  delete tSigner.byUuid['t-ben'];
  r = await call(TAYLOR, { action: 'adopt-signature', printedName: 'Taylor Q. Reed', initials: 'tqr', signature: SIG, consent: true });
  ok(r.status === 200 && r.data.initials === 2 && tSigner.byUuid['t-ben'] === 'TQR', "falls back to the template's fields");
  const putsNoInc = DS.puts.length;
  r = await call(TAYLOR, { action: 'agreement-session' });
  ok(r.data.adopted === true && DS.puts.length === putsNoInc, "can't tell what's empty there, so it changes nothing");
  DS.noFieldsInclude = false;
  Object.assign(PL.db.contracting_settings[0], S0);

  // ---- declined ----
  PL.db.profiles.push({ id: '55555555-5555-5555-5555-555555555555', display_name: 'Casey Fox', role: 'advisor' });
  const CASEY = { id: '55555555-5555-5555-5555-555555555555', email: 'casey@example.com' };
  r = await call(CASEY, { action: 'agreement-session' });
  const cag = PL.db.producer_agreements.find(a => a.user_id === CASEY.id);
  DS.subs[cag.docuseal_submission_id].submitters[0].status = 'declined';
  r = await hook('form.declined', { submission_id: cag.docuseal_submission_id });
  ok(PL.db.producer_agreements.find(a => a.user_id === CASEY.id).status === 'declined', 'declining is recorded');

  // ---- contracting off ----
  PL.db.contracting_settings[0].enabled = false;
  const RILEY = { id: '66666666-6666-6666-6666-666666666666', email: 'riley@example.com' };
  r = await call(RILEY, { action: 'agreement-session' });
  ok(r.status === 400 && r.data.error === 'contracting_off', 'agents cannot start while contracting is off');
  r = await call(MORGAN, { action: 'agreement-session' }, staff);
  ok(r.status === 200 && r.data.status === 'sent', 'the team can try it while it is off');
} catch (e) { failures++; console.log('FAIL (crash)', e.stack); }
console.log(failures ? `${failures} FAILED` : 'ALL EDGE FUNCTION TESTS PASSED');
process.exit(failures ? 1 : 0);
