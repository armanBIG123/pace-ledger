import { supabase } from './supabaseClient.js';

// ---------------------------------------------------------------------
// documents (data layer) — each solar system's PDF/PPTX library, open to
// everyone in it; upload/delete/rename is for super admins and Super
// Managers. New files go in the solar system's own folder (BHB/...).
// DocumentsBody itself (the UI) lives in screens/Documents.jsx.
// ---------------------------------------------------------------------
export async function fetchDocuments() {
  const { data, error } = await supabase.from('documents').select('*').order('created_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return data;
}
export async function uploadDocument(file, title, userId, userName, fileType, folder = '') {
  const filePath = `${folder ? `${folder}/` : ''}${crypto.randomUUID()}-${file.name}`;
  const { error: uploadErr } = await supabase.storage.from('documents').upload(filePath, file);
  if (uploadErr) return { ok: false, error: uploadErr.message };
  const { data, error: insertErr } = await supabase.from('documents').insert({
    title: title.trim(), file_path: filePath, file_size: file.size, file_type: fileType,
    uploaded_by: userId, uploaded_by_name: userName,
  }).select().single();
  if (insertErr) return { ok: false, error: insertErr.message };
  return { ok: true, record: data };
}
// The file goes too, unless another solar system's copy still uses it.
export async function deleteDocument(id, filePath) {
  const { data, error } = await supabase.rpc('delete_document', { p_id: id });
  if (error) {
    if (!(error.code === 'PGRST202' || /could not find the function|does not exist/i.test(error.message || ''))) { console.error(error); return false; }
    // Before the database update: as it always was.
    await supabase.storage.from('documents').remove([filePath]);
    const { error: e2 } = await supabase.from('documents').delete().eq('id', id);
    return !e2;
  }
  if (data) await supabase.storage.from('documents').remove([data]);
  return true;
}
export async function updateDocumentTitle(id, title) {
  const { error } = await supabase.from('documents').update({ title: title.trim() }).eq('id', id);
  return !error;
}
// ---------------------------------------------------------------------
// important links — Documents > Important Links, same visibility model
// as documents (everyone views, only super admins manage)
// ---------------------------------------------------------------------
export async function fetchImportantLinks() {
  const { data, error } = await supabase.from('important_links').select('*').order('created_at', { ascending: true });
  if (error) { console.error(error); return []; }
  return data;
}
export async function addImportantLink(title, url, userId, userName) {
  const { data, error } = await supabase.from('important_links').insert({
    title: title.trim(), url: url.trim(), created_by: userId, created_by_name: userName,
  }).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, record: data };
}
export async function updateImportantLink(id, title, url) {
  const { error } = await supabase.from('important_links').update({ title: title.trim(), url: url.trim() }).eq('id', id);
  return !error;
}
export async function deleteImportantLink(id) {
  const { error } = await supabase.from('important_links').delete().eq('id', id);
  return !error;
}
// Generated fresh on every download click — the bucket is private, so
// this is the only way to actually retrieve a file, and it expires
// quickly rather than being a permanent, shareable link.
export async function getDocumentDownloadUrl(filePath) {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(filePath, 60);
  if (error) { console.error(error); return null; }
  return data.signedUrl;
}
export function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
