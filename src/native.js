// ---------------------------------------------------------------------
// native — the few things that work differently inside the iPhone app
// (Capacitor) than in a web browser. Every helper here is safe to call on
// the web: it either does the normal web thing or nothing at all.
// ---------------------------------------------------------------------
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Share } from '@capacitor/share';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

// The public address of the site. Links we hand to other people (intake
// forms, recruit sign-ups) must always point here, never at the app.
export const PUBLIC_SITE_URL = 'https://big-pace-ledger.com';

export function isNativeApp() {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
}

// Base for shareable links: the real site when running in the app,
// otherwise wherever this page is being served from.
export function publicBaseUrl() {
  return isNativeApp() ? `${PUBLIC_SITE_URL}/` : `${window.location.origin}${window.location.pathname}`;
}

// Opens a page in an in-app Safari sheet (sign-in pages for Google and
// Zoom must run in a real browser, not inside the app's web view). Calls
// onClose once the person closes the sheet.
export async function openInBrowserSheet(url, onClose) {
  if (!isNativeApp()) { window.location.href = url; return; }
  let handle = null;
  if (onClose) {
    handle = await Browser.addListener('browserFinished', () => {
      handle?.remove();
      onClose();
    });
  }
  try {
    await Browser.open({ url });
  } catch (e) {
    handle?.remove();
    throw e;
  }
}

// In the app: the iPhone share sheet (Messages, Mail, Copy, …).
// On the web: copy to the clipboard. Returns 'shared' | 'copied' | 'failed'.
export async function shareOrCopy({ text, url, title }) {
  if (isNativeApp()) {
    try {
      await Share.share({ title, text, url, dialogTitle: title });
      return 'shared';
    } catch {
      return 'failed'; // includes the person cancelling the sheet
    }
  }
  const value = [text, url].filter(Boolean).join(' ');
  try { await navigator.clipboard.writeText(value); return 'copied'; } catch {
    window.prompt('Copy this:', value);
    return 'failed';
  }
}

// Saves a CSV and hands it to the share sheet in the app (a browser-style
// download does nothing inside an iPhone app). Returns true if handled.
export async function shareCsvFile(filename, csv) {
  if (!isNativeApp()) return false;
  const written = await Filesystem.writeFile({ path: filename, data: csv, directory: Directory.Cache, encoding: Encoding.UTF8 });
  try {
    await Share.share({ title: filename, url: written.uri, dialogTitle: 'Export' });
  } catch { /* the person closed the share sheet — that's fine */ }
  return true;
}

// ---- appointment reminders (phone notifications) ---------------------

export const REMINDER_MINUTES = 30;

export async function reminderPermission() {
  if (!isNativeApp()) return 'unsupported';
  try { return (await LocalNotifications.checkPermissions()).display; } catch { return 'unsupported'; }
}
export async function requestReminderPermission() {
  if (!isNativeApp()) return 'unsupported';
  try { return (await LocalNotifications.requestPermissions()).display; } catch { return 'denied'; }
}

// Stable 31-bit number from an appointment id (notification ids must be ints).
function notificationId(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

// Removes every reminder PaceLedger scheduled (used on sign-out, so the
// next person on this phone never sees someone else's clients).
export async function clearAppointmentReminders() {
  if (!isNativeApp()) return;
  try {
    const pending = await LocalNotifications.getPending();
    const ours = (pending.notifications || []).filter(n => n.extra && n.extra.source === 'paceledger-appt');
    if (ours.length) await LocalNotifications.cancel({ notifications: ours.map(n => ({ id: n.id })) });
  } catch { /* nothing to clear */ }
}

// Replaces every reminder PaceLedger scheduled with one per upcoming
// appointment over the next two weeks. iOS keeps at most 64 pending, so
// this stays well under that.
export async function syncAppointmentReminders(appointments) {
  if ((await reminderPermission()) !== 'granted') return;
  const pending = await LocalNotifications.getPending();
  const ours = (pending.notifications || []).filter(n => n.extra && n.extra.source === 'paceledger-appt');
  if (ours.length) await LocalNotifications.cancel({ notifications: ours.map(n => ({ id: n.id })) });

  const now = Date.now();
  const horizon = now + 14 * 24 * 60 * 60 * 1000;
  const upcoming = (appointments || [])
    .filter(a => a.appointmentAt && !a.status)
    .map(a => ({ a, at: new Date(a.appointmentAt).getTime() - REMINDER_MINUTES * 60 * 1000 }))
    .filter(x => x.at > now + 30 * 1000 && x.at < horizon)
    .sort((x, y) => x.at - y.at)
    .slice(0, 40);
  if (!upcoming.length) return;

  await LocalNotifications.schedule({
    notifications: upcoming.map(({ a, at }) => {
      const types = [a.presentationType, a.presentationTypeSecondary];
      const kind = [types.includes('recruit') ? 'Recruit' : null, types.includes('sale') ? 'Sale' : null].filter(Boolean).join(' & ');
      return {
        id: notificationId(a.id),
        title: `${a.client} in ${REMINDER_MINUTES} minutes`,
        body: [kind || 'Appointment', a.presenter ? `with ${a.presenter}` : null, a.zoomUrl ? 'Zoom link ready' : null].filter(Boolean).join(' · '),
        schedule: { at: new Date(at), allowWhileIdle: true },
        extra: { source: 'paceledger-appt', appointmentId: a.id, zoomUrl: a.zoomUrl || null },
      };
    }),
  });
}

// Runs `fn` whenever the app comes back to the foreground.
export function onAppResume(fn) {
  if (!isNativeApp()) return () => {};
  let handle = null, stopped = false;
  CapApp.addListener('appStateChange', ({ isActive }) => { if (isActive) fn(); })
    .then(h => { if (stopped) h.remove(); else handle = h; });
  return () => { stopped = true; handle?.remove(); };
}

// Tapping a reminder opens its Zoom link if there is one.
export function onReminderTapped(fn) {
  if (!isNativeApp()) return () => {};
  let handle = null, stopped = false;
  LocalNotifications.addListener('localNotificationActionPerformed', e => fn(e.notification && e.notification.extra))
    .then(h => { if (stopped) h.remove(); else handle = h; });
  return () => { stopped = true; handle?.remove(); };
}
