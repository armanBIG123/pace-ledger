// One shared copy of "your appointments" and "appointments you're on", so
// switching tabs (and Pipeline with the list inside it) doesn't download
// your whole history again each time.
//
// - Asking for the same list while it's already loading waits for that
//   same request instead of starting another.
// - A loaded list is reused for 30 seconds; after that the next screen to
//   ask loads it again.
// - Anything that changes an appointment clears it (see
//   invalidateAppointments), and so does the appointments-changed event the
//   app sends after edits, so a screen never shows something you just
//   changed the old way.
const FRESH_MS = 30_000;
const entries = new Map(); // key -> { at, promise }

// Bumped on every change, so a load that was already on its way when
// something changed isn't kept for the next screen.
let generation = 0;

export function cachedLoad(key, load, { fresh = false } = {}) {
  const hit = entries.get(key);
  if (!fresh && hit && Date.now() - hit.at < FRESH_MS) return hit.promise.then(list => list.slice());
  const startedAt = generation;
  const promise = load().then(list => list || []);
  const entry = { at: Date.now(), promise };
  entries.set(key, entry);
  const drop = () => { if (entries.get(key) === entry) entries.delete(key); };
  // A failed load isn't kept, and neither is one that overlapped a change.
  promise.then(() => { if (generation !== startedAt) drop(); }, drop);
  return promise.then(list => list.slice());
}

// Call before and after each write (the second call drops anything that
// loaded while the write was going on).
export function invalidateAppointments() { generation++; entries.clear(); }

if (typeof window !== 'undefined') {
  window.addEventListener('paceledger:appointments-changed', invalidateAppointments);
}
