// The shared data layer: one remembered copy of each thing a screen shows,
// kept fresh without refresh buttons.
//
//   const team = useLive(['team-pace', user.id, week], () => fetchWeek(week), { topics: ['appointments'] });
//   team.data      what was loaded (undefined until the first load)
//   team.loading   true only while there's nothing to show yet
//   team.reload()  load again now (resolves when the new copy is in)
//   team.set(fn)   change the remembered copy in place (after your own edit)
//
// - Screens asking for the same key share one copy and one request, and
//   coming back to a screen shows its last copy at once.
// - A copy reloads when a screen shows it and it's over 30 seconds old,
//   when the app comes back to the front after 30 seconds or more, and
//   when one of its topics changes. changed('appointments') after a save
//   reloads every copy on screen that lists that topic and marks the rest
//   to reload when they're next shown.
// - Reloads happen behind the scenes: the last copy stays on screen until
//   the new one arrives, so nothing flashes.
// - Signing out forgets everything (forgetAll).
import { useEffect, useReducer } from 'react';
import { onAppResume } from '../native.js';

export const FRESH_MS = 30_000;
const KEEP_HIDDEN = 40; // copies kept for screens that aren't showing
const SETTLE_MS = 250;  // changes this close together reload once

const entries = new Map();
const keyOf = key => (typeof key === 'string' ? key : JSON.stringify(key));

function entryFor(k) {
  let e = entries.get(k);
  if (!e) {
    e = { data: undefined, error: null, at: 0, inFlight: null, again: false, stale: false, load: null, topics: new Set(), subs: new Set(), waiters: [] };
    entries.set(k, e);
  }
  return e;
}

function settle(e) {
  for (const fn of e.subs) fn();
  const w = e.waiters; e.waiters = [];
  for (const r of w) r(e.data);
}

function start(e) {
  e.again = false; e.stale = false;
  const p = Promise.resolve().then(() => e.load());
  e.inFlight = p;
  p.then(data => { if (e.inFlight === p) { e.data = data === undefined ? null : data; e.error = null; e.at = Date.now(); } },
    err => { if (e.inFlight === p) { console.error(err); e.error = err; e.at = Date.now(); } })
    .finally(() => {
      if (e.inFlight !== p) return;
      e.inFlight = null;
      // Something changed while this was loading: what came back may be old.
      if (e.again && e.subs.size) { start(e); return; }
      if (e.again) e.stale = true;
      settle(e);
    });
}

// Load now unless a load is already on its way; when one is, load again
// after it (it may have started before the change).
function refetch(e) {
  if (!e.load) return;
  if (e.inFlight) e.again = true; else start(e);
}

function tidy() {
  const hidden = [...entries.entries()].filter(([, e]) => !e.subs.size && !e.inFlight);
  if (hidden.length <= KEEP_HIDDEN) return;
  hidden.sort((a, b) => a[1].at - b[1].at);
  for (const [k] of hidden.slice(0, hidden.length - KEEP_HIDDEN)) entries.delete(k);
}

// The core, without React (the hook below uses it; so do the tests).
// watch: start showing a key; returns stop().
export function watch(key, load, { topics = [] } = {}, onChange = () => {}) {
  const e = entryFor(keyOf(key));
  e.load = load;
  for (const t of topics) e.topics.add(t);
  e.subs.add(onChange);
  const old = Date.now() - e.at > FRESH_MS;
  if (!e.inFlight && (e.stale || old || (e.data === undefined && !e.error))) start(e);
  return () => { e.subs.delete(onChange); tidy(); };
}
export function peek(key) {
  const e = entries.get(keyOf(key));
  return e ? { data: e.data, error: e.error, loading: e.data === undefined && !e.error } : { data: undefined, error: null, loading: true };
}
export function reload(key) {
  const e = entries.get(keyOf(key));
  if (!e) return Promise.resolve(undefined);
  return new Promise(resolve => { e.waiters.push(resolve); refetch(e); });
}
export function setData(key, fn) {
  const e = entryFor(keyOf(key));
  e.data = typeof fn === 'function' ? fn(e.data) : fn;
  for (const s of e.subs) s();
}

export function useLive(key, load, { topics = [], enabled = true } = {}) {
  const k = keyOf(key);
  const e = entryFor(k);
  // Always the newest loader (it may close over new props).
  e.load = load;
  for (const t of topics) e.topics.add(t);
  const [, rerender] = useReducer(x => x + 1, 0);
  useEffect(() => (enabled ? watch(k, entryFor(k).load, { topics }, rerender) : undefined), [k, enabled]);
  return {
    data: e.data,
    error: e.error,
    loading: enabled && e.data === undefined && !e.error,
    reload: () => reload(k),
    set: fn => setData(k, fn),
  };
}

// After a save: every copy that lists this topic loads again, and anyone
// listening with onChanged hears about it (once for changes close together).
const timers = new Map();
const listeners = new Map(); // topic -> Set(fn)
export function changed(topic) {
  clearTimeout(timers.get(topic));
  timers.set(topic, setTimeout(() => {
    timers.delete(topic);
    for (const e of entries.values()) {
      if (!e.topics.has(topic)) continue;
      if (e.subs.size) refetch(e); else e.stale = true;
    }
    for (const fn of listeners.get(topic) || []) fn();
  }, SETTLE_MS));
}
export function onChanged(topic, fn) {
  if (!listeners.has(topic)) listeners.set(topic, new Set());
  listeners.get(topic).add(fn);
  return () => listeners.get(topic).delete(fn);
}

// Back to the app after a while: what's on screen loads again.
export function cameBack() {
  const now = Date.now();
  for (const e of entries.values()) {
    if (!e.subs.size) continue;
    if (!e.inFlight && now - e.at > FRESH_MS) start(e);
  }
}

export function forgetAll() {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  entries.clear();
}

// The app's older "something changed" signals count as changes too, until
// every screen has moved over.
// (The appointment window's own edits carry the change itself, and screens
// apply those in place: an Undo-able delete hasn't reached the database
// yet, so reloading then would bring it back. Only its { reload } counts.)
const SIGNALS = {
  'paceledger:appointments-changed': 'appointments',
  'paceledger:intake-changed': 'intake',
  'paceledger:profile-changed': 'people',
  'paceledger:onboarding-changed': 'people',
  'paceledger:contracting-changed': 'contracting',
  'paceledger:connections-changed': 'connections',
  'paceledger:google-connected': 'connections',
};
const fromWindowEdit = ev => !!(ev && ev.detail && ev.detail.fromWindow && !ev.detail.reload);
if (typeof window !== 'undefined') {
  for (const [name, topic] of Object.entries(SIGNALS)) window.addEventListener(name, ev => { if (!fromWindowEdit(ev)) changed(topic); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cameBack(); });
  window.addEventListener('focus', cameBack);
  onAppResume(cameBack);
}

// A short key for a list of people (so a key doesn't carry hundreds of ids).
export function idsKey(list) {
  const ids = (list || []).map(x => (x && typeof x === 'object' ? x.id : x)).join(',');
  let h = 5381;
  for (let i = 0; i < ids.length; i++) h = ((h << 5) + h + ids.charCodeAt(i)) | 0;
  return `${(list || []).length}:${(h >>> 0).toString(36)}`;
}
