// Contracting: producer agreements and secure contracting info.
// Server side: migration-contracting.sql and the "contracting" edge function.
import { supabase } from '../supabaseClient.js';
import { encryptKeyCheck, encryptSubmission, generateKeyPair } from '../lib/vault.js';

// Plain words for what the server says.
const WORDS = {
  not_signed_in: 'Sign in again, then try again.',
  not_contracting_staff: "You're not on the contracting team.",
  two_step_required: 'Confirm it\'s you with your authenticator code first.',
  contracting_off: "Contracting in PaceLedger isn't turned on yet.",
  contracting_paused: 'BIG paused the contracting form for a moment. Try again later, or ask your upline.',
  key_changed: 'Something changed on our side. Reload PaceLedger and send it again.',
  agreement_not_countersigned: 'Your producer agreement has to be countersigned first.',
  already_sent: "You've already sent your info. BIG is working on it.",
  missing_fields: 'Some answers are missing. Check the form and send it again.',
  bad_fields: "Something in the form didn't go through. Reload and send it again.",
  too_many_files: 'Too many files. Keep it to one of each, plus up to 5 background documents.',
  files_too_big: 'Those files are too big together. Keep each under 4 MB.',
  no_draft: 'That took too long. Send it again.',
  gone: 'This info was already deleted.',
  not_given: "They didn't give that one.",
  no_private_key: "The private key isn't in the edge function's secrets yet. See Setup.",
  wrong_key: "The edge function's private key doesn't match PaceLedger's public key. See Setup.",
  agreement_not_set_up: "The producer agreement isn't set up in PaceLedger yet.",
  template_roles: 'The DocuSeal template needs the two roles from the setup guide.',
  agent_not_signed: "The agent hasn't signed yet.",
  nothing_to_enter: 'There was nothing left to delete. It may have already been entered.',
  not_entered_yet: 'Mark it entered in SureLC first.',
  earlier_step_first: 'Do the step before this one first.',
  undo_later_step_first: 'Undo the later step first.',
  info_pending: "Can't change the key while info is waiting: it would become unreadable. Enter or delete it first.",
  key_not_ready: 'Make the encryption key and check it first.',
  agreement_not_ready: 'Set the agreement version and DocuSeal template first.',
  super_admins_only: 'Only super admins can be on the contracting team.',
  bad_key: "That key isn't right.",
  bad_version: 'Use letters, numbers, dots and dashes for the version.',
  bad_template: 'Enter the DocuSeal template number.',
  network_error: "Couldn't reach PaceLedger. Check your connection and try again.",
};
export const contractingWords = code => WORDS[code] || (code && /^[a-z_]+$/.test(code) ? `Something went wrong (${code}).` : "Something went wrong. Try again.");

function codeOf(error) {
  const m = String((error && error.message) || error || '');
  const hit = m.match(/[a-z]+(?:_[a-z]+)+/);
  return hit && WORDS[hit[0]] ? hit[0] : m;
}
function twoStepNeeded(code) {
  if (code === 'two_step_required') window.dispatchEvent(new Event('paceledger:two-step-required'));
}
async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) { const code = codeOf(error); twoStepNeeded(code); return { ok: false, error: code }; }
  return { ok: true, data };
}
async function fn(body) {
  try {
    const { data, error } = await supabase.functions.invoke('contracting', { body });
    if (!error) return data && data.error ? { ok: false, error: data.error, detail: data.detail, data } : { ok: true, data };
    let payload = null;
    try { payload = error.context && typeof error.context.json === 'function' ? await error.context.json() : null; } catch { /* not JSON */ }
    const code = (payload && payload.error) || codeOf(error);
    twoStepNeeded(code);
    return { ok: false, error: code, detail: payload && payload.detail };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

// ---- Settings (everyone signed in can read them) ------------------------------
let settingsPromise = null;
export function fetchContractingSettings(force = false) {
  if (!settingsPromise || force) {
    settingsPromise = supabase.from('contracting_settings').select('*').eq('id', true).maybeSingle()
      .then(({ data, error }) => (error ? null : data))
      .catch(() => null);
  }
  return settingsPromise;
}

// ---- An agent ------------------------------------------------------------------
export async function fetchMyContracting(userId) {
  const [settings, ag, cs] = await Promise.all([
    fetchContractingSettings(true),
    supabase.from('producer_agreements').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('contracting_cases').select('*').eq('user_id', userId).maybeSingle(),
  ]);
  return { settings, agreements: ag.error ? [] : ag.data || [], kase: cs.error ? null : cs.data || null };
}
export const startAgreement = () => fn({ action: 'agreement-session' });
export const syncAgreement = agreementId => fn({ action: 'sync-agreement', agreementId });
export async function agreementLink(path) {
  const { data, error } = await supabase.storage.from('agreements').createSignedUrl(path, 120);
  return error || !data ? null : data.signedUrl;
}

// Encrypts on this device, then sends in three steps (key, files, fields).
export async function sendContractingInfo({ settings, userId, fields, files, onProgress = () => {} }) {
  if (!settings || !settings.public_key || !settings.key_id) return { ok: false, error: 'contracting_off' };
  let sealed;
  try {
    onProgress('Encrypting on this device…');
    sealed = await encryptSubmission({ publicJwk: settings.public_key, userId, fields, files });
  } catch (e) {
    return { ok: false, error: 'encrypt_failed', detail: String(e && e.message) };
  }
  if (sealed.keyId !== settings.key_id) return { ok: false, error: 'key_changed' };
  const start = await rpc('contracting_start', { p_key_id: sealed.keyId, p_wrapped_key: sealed.wrappedKey });
  if (!start.ok) return start;
  for (let i = 0; i < sealed.files.length; i++) {
    const f = sealed.files[i];
    onProgress(`Sending file ${i + 1} of ${sealed.files.length}…`);
    const put = await rpc('contracting_put_file', { p_kind: f.kind, p_mime: f.mime, p_size: f.size, p_name: f.name, p_iv: f.iv, p_ct: f.ct });
    if (!put.ok) { await supabase.rpc('contracting_discard_draft'); return put; }
  }
  onProgress('Sending…');
  const done = await rpc('contracting_submit', { p_fields: sealed.fields });
  if (!done.ok) { await supabase.rpc('contracting_discard_draft'); return done; }
  fn({ action: 'notify-sent' }); // emails the contracting team; nothing to wait for
  return { ok: true, expiresAt: done.data };
}
export const withdrawContractingInfo = () => rpc('contracting_withdraw');

// ---- The contracting team --------------------------------------------------------
export const fetchContractingCounts = () => rpc('contracting_counts');
export const fetchContractingQueue = () => rpc('contracting_queue');
export const fetchContractingCase = userId => rpc('contracting_case', { p_user: userId });
export const revealField = (userId, field, purpose = 'view') => fn({ action: 'reveal', userId, field, purpose });
export const openContractingFile = (userId, fileId) => fn({ action: 'file', userId, fileId });
export const markEntered = userId => rpc('contracting_mark_entered', { p_user: userId });
export const markStep = (userId, step, on = true) => rpc('contracting_mark_step', { p_user: userId, p_step: step, p_on: on });
export const countersignSession = agreementId => fn({ action: 'countersign-session', agreementId });
export const killSwitch = () => rpc('contracting_kill_switch');
export const setPaused = paused => rpc('contracting_set_paused', { p_paused: paused });
export const setEnabled = enabled => rpc('contracting_set_enabled', { p_enabled: enabled });
export const setAgreement = (version, templateId) => rpc('contracting_set_agreement', { p_version: version, p_template_id: templateId });
export const fetchStaffList = () => rpc('contracting_staff_list');
export const setStaff = (userId, on) => rpc('contracting_set_staff', { p_user: userId, p_on: on });
export const markReviewed = () => rpc('contracting_mark_reviewed');
export const fetchAdminLog = () => rpc('contracting_admin_log');
export const docusealCheck = templateId => fn({ action: 'docuseal-check', templateId });

// Makes a new key pair here. Saves the public half; hands back the private
// half to show once.
export async function makeNewKey() {
  const k = await generateKeyPair();
  const res = await rpc('contracting_set_key', { p_public_key: k.publicJwk, p_key_id: k.keyId });
  return res.ok ? { ok: true, keyId: k.keyId, privateText: k.privateText } : res;
}
export async function checkKey(settings, userId) {
  if (!settings || !settings.public_key) return { ok: false, error: 'key_not_ready' };
  const msg = await encryptKeyCheck(settings.public_key, userId);
  const res = await fn({ action: 'key-check', ...msg });
  return res.ok && res.data && res.data.ok ? { ok: true } : { ok: false, error: (res.data && res.data.error) || res.error };
}

// A decrypted file, as a link that opens it in a new tab.
export function fileBlobUrl(file) {
  const bytes = Uint8Array.from(atob(file.data), c => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: file.mime }));
}
