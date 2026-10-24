// MegaPhone: announcements from super admins, and who has confirmed them
// (migration-megaphone.sql). The database decides who sees which: super
// admins see all; everyone else sees the ones meant for them. Today, the
// pop-up, Chat and the top bar share one copy of the list.
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient.js';

export const ANN_TITLE_MAX = 120;
export const ANN_BODY_MAX = 2000;
const CHANGED = 'paceledger:announcements-changed';
const FRESH_MS = 30000;
let shared = null; // { userId, at, promise }

// Showing now: not ended early, and before its show-until time.
export function isLive(a, now = Date.now()) {
  return !!a && !a.ended_at && Date.parse(a.starts_at) <= now && Date.parse(a.ends_at) > now;
}

async function load(userId) {
  const [list, mine] = await Promise.all([
    supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(60),
    supabase.from('announcement_confirmations').select('announcement_id, confirmed_at').eq('user_id', userId),
  ]);
  if (list.error || mine.error) return { ok: false, list: [], mine: new Map() };
  return { ok: true, list: list.data || [], mine: new Map((mine.data || []).map(r => [r.announcement_id, r.confirmed_at])) };
}

// { ok, list (newest first), mine: Map announcement id -> when you confirmed it }
export function fetchAnnouncementsShared(userId) {
  if (shared && shared.userId === userId && Date.now() - shared.at < FRESH_MS) return shared.promise;
  const promise = load(userId);
  shared = { userId, at: Date.now(), promise };
  return promise;
}

// After posting, editing or confirming: every card shows the new state.
export function announcementsChanged() {
  shared = null;
  window.dispatchEvent(new CustomEvent(CHANGED));
}

// The list, kept fresh: after any change, when you come back to the app,
// and every couple of minutes.
export function useAnnouncements(user) {
  const [state, setState] = useState(null);
  useEffect(() => {
    let alive = true;
    const get = () => fetchAnnouncementsShared(user.id).then(v => { if (alive) setState(v); });
    const back = () => { if (document.visibilityState === 'visible') get(); };
    get();
    window.addEventListener(CHANGED, get);
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    const every = setInterval(back, 120000);
    return () => {
      alive = false;
      window.removeEventListener(CHANGED, get);
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('focus', back);
      clearInterval(every);
    };
  }, [user.id]);
  return state;
}

// The live ones you still have to confirm (not your own posts), oldest
// first. popup: true = only the pop-up ones.
export function waitingFor(state, user, { popup = null } = {}) {
  if (!state || !state.ok) return [];
  return state.list
    .filter(a => isLive(a) && a.created_by !== user.id && !state.mine.has(a.id) && (popup === null || !!a.must_confirm === popup))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

// "I've read and understand this". Confirming twice is fine.
export async function confirmAnnouncement(id) {
  const { error } = await supabase.from('announcement_confirmations').insert({ announcement_id: id });
  if (error && !/duplicate|23505/.test(`${error.code || ''} ${error.message || ''}`)) { console.error(error); return false; }
  announcementsChanged();
  return true;
}

// The confirmations you're allowed to see (your team's, or everyone's for
// super admins) for these announcements.
export async function fetchConfirmations(ids) {
  if (!ids.length) return [];
  const { data, error } = await supabase.from('announcement_confirmations').select('announcement_id, user_id, confirmed_at').in('announcement_id', ids);
  if (error) { console.error(error); return null; }
  return data || [];
}

// ---- Super admins ------------------------------------------------------------
function clean(f) {
  return {
    title: String(f.title || '').trim().slice(0, ANN_TITLE_MAX),
    body: String(f.body || '').trim().slice(0, ANN_BODY_MAX),
    audience: f.audience === 'leaders' ? 'leaders' : 'everyone',
    must_confirm: !!f.mustConfirm,
    ends_at: endOfDayIso(f.until),
  };
}
export async function postAnnouncement(fields) {
  const { data, error } = await supabase.from('announcements').insert(clean(fields)).select().single();
  if (error) { console.error(error); return { ok: false }; }
  announcementsChanged();
  return { ok: true, record: data };
}
export async function updateAnnouncement(id, fields) {
  const { data, error } = await supabase.from('announcements').update(clean(fields)).eq('id', id).select().single();
  if (error) { console.error(error); return { ok: false }; }
  announcementsChanged();
  return { ok: true, record: data };
}
// Takes it off everyone's Today page now (the database saves the time).
export async function endAnnouncement(id) {
  const { error } = await supabase.from('announcements').update({ ended_at: new Date().toISOString() }).eq('id', id);
  if (error) { console.error(error); return false; }
  announcementsChanged();
  return true;
}
export async function deleteAnnouncement(id) {
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  if (error) { console.error(error); return false; }
  announcementsChanged();
  return true;
}

// ---- Who it's for ----------------------------------------------------------------
// A leader: a manager, a super admin, or anyone with someone reporting to them.
export function isLeaderPerson(p, people) {
  return p.role === 'manager' || p.role === 'super_manager' || p.role === 'super_admin' || people.some(x => x.manager_id === p.id);
}
// Everyone who should confirm it (not whoever posted it).
export function audienceOf(a, people) {
  return people.filter(p => p.id !== a.created_by && (a.audience === 'everyone' || isLeaderPerson(p, people)));
}

// ---- Dates -------------------------------------------------------------------------
// "Show until" a day means through the end of that day where you are.
export function endOfDayIso(dateStr) {
  return new Date(`${dateStr}T23:59:00`).toISOString();
}
export function localDateOf(iso) {
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
// "Today, 9:02 AM", "Yesterday, 4:10 PM", "Oct 14, 9:02 AM".
export function whenLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(); yesterday.setDate(now.getDate() - 1);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Today, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })}, ${time}`;
}
// "Fri, Oct 30".
export function dayLabel(iso) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
