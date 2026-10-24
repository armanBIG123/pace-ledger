// Profile photos: stored in the "avatars" storage bucket under your own
// folder (avatars/<your id>/<name>.jpg), with profiles.avatar_path pointing
// at the current one. Anyone signed in sees them next to names.
import { selectAll } from './paged.js';
import { supabase } from '../supabaseClient.js';

export const AVATAR_BUCKET = 'avatars';

export function avatarUrl(path) {
  if (!path) return '';
  try { return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl || ''; } catch { return ''; }
}

// Everyone's photo, shared by every screen for a minute (id -> url). Only
// people who added one are in it; anyone else keeps their initials.
const SHARED_TTL_MS = 60000;
let shared = null;
export function fetchAvatarsShared() {
  if (shared && Date.now() - shared.at < SHARED_TTL_MS) return shared.promise;
  const promise = Promise.resolve(selectAll(o => supabase.from('profiles').select('id, avatar_path', o).not('avatar_path', 'is', null).order('id')))
    .then(({ data, error }) => (error ? new Map() : new Map((data || []).filter(r => r.avatar_path).map(r => [r.id, avatarUrl(r.avatar_path)]))))
    .catch(() => new Map());
  shared = { at: Date.now(), promise };
  return promise;
}
function avatarsChanged() {
  shared = null;
  window.dispatchEvent(new Event('paceledger:avatars-changed'));
}

// Saves a new photo (a JPEG Blob) as yours, then deletes the old one.
// { ok, path } or { ok: false }.
export async function saveMyAvatar(userId, blob) {
  const path = `${userId}/${Date.now().toString(36)}.jpg`;
  const up = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (up.error) return { ok: false };
  const { data: old, error } = await supabase.rpc('set_my_avatar', { p_path: path });
  if (error) { await supabase.storage.from(AVATAR_BUCKET).remove([path]); return { ok: false }; }
  if (old && old !== path) await supabase.storage.from(AVATAR_BUCKET).remove([old]);
  avatarsChanged();
  return { ok: true, path };
}

// Removes your photo (back to initials) and deletes the file.
export async function removeMyAvatar() {
  const { data: old, error } = await supabase.rpc('set_my_avatar', { p_path: null });
  if (error) return { ok: false };
  if (old) await supabase.storage.from(AVATAR_BUCKET).remove([old]);
  avatarsChanged();
  return { ok: true };
}

// Deleting your account: clear every photo file in your folder first.
export async function removeAllMyAvatarFiles(userId) {
  try {
    await supabase.rpc('set_my_avatar', { p_path: null });
    const { data } = await supabase.storage.from(AVATAR_BUCKET).list(userId);
    if (data && data.length) await supabase.storage.from(AVATAR_BUCKET).remove(data.map(f => `${userId}/${f.name}`));
  } catch { /* the account deletion goes ahead either way */ }
}
