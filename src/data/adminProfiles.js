// Team & admin → Profiles (super admins only): entities and their
// checklist, documents, notes, and flags on people and entities. The
// database fills in who did each thing and when.
import { supabase } from '../supabaseClient.js';
import { isNativeApp } from '../native.js';

const DOC_BUCKET = 'profile-docs';
export const DOC_MAX_MB = 25;
export const DOC_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.doc,.docx,application/pdf,image/*';
const DOC_TYPES = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

// Entities, every ticked item (entity id -> Map item -> tick), and person flags.
export async function fetchProfilesData() {
  const [ents, checks, flags] = await Promise.all([
    supabase.from('entity_profiles').select('*').order('created_at', { ascending: false }),
    supabase.from('entity_checks').select('entity_id, item, done_on, done_by_name'),
    supabase.from('person_flags').select('*'),
  ]);
  if (ents.error || checks.error || flags.error) {
    console.error(ents.error || checks.error || flags.error);
    return { ok: false };
  }
  const byEntity = new Map();
  (checks.data || []).forEach(c => {
    if (!byEntity.has(c.entity_id)) byEntity.set(c.entity_id, new Map());
    byEntity.get(c.entity_id).set(c.item, c);
  });
  return { ok: true, entities: ents.data || [], checks: byEntity, flags: new Map((flags.data || []).map(f => [f.user_id, f])) };
}

// ---- Entities ------------------------------------------------------------
const ENTITY_FIELDS = ['name', 'partner_id', 'partner_name', 'formed_in', 'operating_states', 'nv_entity_number', 'ein', 'entity_npn',
  'resident_license_number', 'eo_carrier', 'eo_policy_number', 'eo_expires_on', 'fg_writing_number', 'bank_name',
  'contact_email', 'contact_phone', 'flag_reason', 'archived_at'];
function cleanEntity(form) {
  const out = {};
  ENTITY_FIELDS.forEach(k => {
    if (!(k in form)) return;
    const v = form[k];
    if (k === 'operating_states') out[k] = Array.isArray(v) ? v : [];
    else out[k] = typeof v === 'string' ? (v.trim() || null) : (v ?? null);
  });
  return out;
}

export async function createEntity(form) {
  const { data, error } = await supabase.from('entity_profiles').insert(cleanEntity(form)).select().single();
  if (error) { console.error(error); return { ok: false }; }
  return { ok: true, record: data };
}
export async function updateEntity(id, patch) {
  const { data, error } = await supabase.from('entity_profiles').update(cleanEntity(patch)).eq('id', id).select().single();
  if (error) { console.error(error); return { ok: false }; }
  return { ok: true, record: data };
}
// Deletes its files too (its checklist, notes and document list go with it).
export async function deleteEntity(id) {
  const { data: docs } = await supabase.from('entity_documents').select('file_path').eq('entity_id', id);
  if (docs && docs.length) await supabase.storage.from(DOC_BUCKET).remove(docs.map(d => d.file_path));
  const { error } = await supabase.from('entity_profiles').delete().eq('id', id);
  return !error;
}

// Tick (or re-date) an item; untick it.
export async function setEntityCheck(entityId, item, doneOn) {
  const { data, error } = await supabase.from('entity_checks')
    .upsert({ entity_id: entityId, item, done_on: doneOn }, { onConflict: 'entity_id,item' }).select().single();
  if (error) { console.error(error); return { ok: false }; }
  return { ok: true, record: data };
}
export async function clearEntityCheck(entityId, item) {
  const { error } = await supabase.from('entity_checks').delete().eq('entity_id', entityId).eq('item', item);
  return !error;
}

// ---- Documents -------------------------------------------------------------
export async function fetchEntityDocs(entityId) {
  const { data, error } = await supabase.from('entity_documents').select('*').eq('entity_id', entityId).order('created_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return data || [];
}
// { ok, record } or { ok: false, error: 'type' | 'size' | 'failed' }
export async function uploadEntityDoc(entityId, step, file) {
  const ext = (String(file.name || '').split('.').pop() || '').toLowerCase();
  const type = DOC_TYPES[ext] || (Object.values(DOC_TYPES).includes(file.type) ? file.type : '');
  if (!type) return { ok: false, error: 'type' };
  if (file.size > DOC_MAX_MB * 1024 * 1024) return { ok: false, error: 'size' };
  const safe = String(file.name || 'document').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
  const path = `entities/${entityId}/${Date.now().toString(36)}-${safe}`;
  const up = await supabase.storage.from(DOC_BUCKET).upload(path, file, { contentType: type, upsert: false });
  if (up.error) { console.error(up.error); return { ok: false, error: 'failed' }; }
  const { data, error } = await supabase.from('entity_documents')
    .insert({ entity_id: entityId, step: step || null, file_path: path, file_name: String(file.name || safe).slice(0, 160), size_bytes: file.size, content_type: type })
    .select().single();
  if (error) { await supabase.storage.from(DOC_BUCKET).remove([path]); console.error(error); return { ok: false, error: 'failed' }; }
  return { ok: true, record: data };
}
// A link that works for a minute (the bucket is private). If the browser
// blocks the new tab, the document opens in this one instead.
export async function openEntityDoc(doc) {
  const { data, error } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(doc.file_path, 60);
  if (error || !data) return false;
  const tab = window.open(data.signedUrl, '_blank');
  if (!tab && !isNativeApp()) window.location.assign(data.signedUrl);
  return true;
}
export async function deleteEntityDoc(doc) {
  await supabase.storage.from(DOC_BUCKET).remove([doc.file_path]);
  const { error } = await supabase.from('entity_documents').delete().eq('id', doc.id);
  return !error;
}

// ---- Notes -------------------------------------------------------------------
// subject: { entityId } or { personId }
export async function fetchProfileNotes(subject) {
  const q = supabase.from('profile_notes').select('*').order('created_at', { ascending: false });
  const { data, error } = subject.entityId ? await q.eq('entity_id', subject.entityId) : await q.eq('person_id', subject.personId);
  if (error) { console.error(error); return []; }
  return data || [];
}
export async function addProfileNote(subject, body) {
  const row = subject.entityId ? { entity_id: subject.entityId, body: body.trim() } : { person_id: subject.personId, body: body.trim() };
  const { data, error } = await supabase.from('profile_notes').insert(row).select().single();
  if (error) { console.error(error); return { ok: false }; }
  return { ok: true, record: data };
}
export async function deleteProfileNote(id) {
  const { error } = await supabase.from('profile_notes').delete().eq('id', id);
  return !error;
}

// ---- Flags on people ---------------------------------------------------------
export async function setPersonFlag(userId, reason) {
  const { data, error } = await supabase.from('person_flags').upsert({ user_id: userId, reason: reason.trim() }, { onConflict: 'user_id' }).select().single();
  if (error) { console.error(error); return { ok: false }; }
  return { ok: true, record: data };
}
export async function clearPersonFlag(userId) {
  const { error } = await supabase.from('person_flags').delete().eq('user_id', userId);
  return !error;
}

// ---- A person's licensing and contracting steps -------------------------------------
// data: any of course_started_on, course_completed_on, exam_on, exam_passed_on,
// contracting_sent_on, profile_submitted_on ('' clears), npn, fg_writing_number.
export async function adminUpdateLicensing(userId, data) {
  const { data: out, error } = await supabase.rpc('admin_update_licensing', { p_user: userId, p_data: data });
  if (error || !out) {
    const m = error ? error.message : '';
    return { ok: false, error: /npn_digits/.test(m) ? 'The NPN is numbers only.' : /fg_too_long/.test(m) ? 'That writing number is too long.' : "Couldn't save. Check your connection and try again." };
  }
  return { ok: true, progress: out.progress, npn: out.npn, fg_writing_number: out.fg_writing_number, licensed_at: out.licensed_at };
}
