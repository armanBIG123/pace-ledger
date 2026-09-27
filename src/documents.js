import { supabase } from './supabaseClient.js';

// ---------------------------------------------------------------------
// documents (data layer) — shared PDF/PPTX library, open to everyone;
// upload/delete/rename is super_admin only. DocumentsBody itself (the
// UI) lives in App.jsx.
// ---------------------------------------------------------------------
export async function fetchDocuments() {
  const { data, error } = await supabase.from('documents').select('*').order('created_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return data;
}
export async function uploadDocument(file, title, userId, userName, fileType) {
  const filePath = `${crypto.randomUUID()}-${file.name}`;
  const { error: uploadErr } = await supabase.storage.from('documents').upload(filePath, file);
  if (uploadErr) return { ok: false, error: uploadErr.message };
  const { data, error: insertErr } = await supabase.from('documents').insert({
    title: title.trim(), file_path: filePath, file_size: file.size, file_type: fileType,
    uploaded_by: userId, uploaded_by_name: userName,
  }).select().single();
  if (insertErr) return { ok: false, error: insertErr.message };
  return { ok: true, record: data };
}
export async function deleteDocument(id, filePath) {
  await supabase.storage.from('documents').remove([filePath]);
  const { error } = await supabase.from('documents').delete().eq('id', id);
  return !error;
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
