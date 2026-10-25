// Phone reminders before appointments, and the prompt to turn them on.
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { exactReminderStatus, isNativeApp, onAppResume, onReminderTapped, REMINDER_MINUTES, reminderPermission, requestExactReminders, requestReminderPermission, syncAppointmentReminders } from '../native.js';
import { rowToRecord } from '../data/appointments.js';

// Phone app only: keeps a reminder 30 minutes before each upcoming
// appointment, a "How did it go?" nudge about an hour after each of yours
// that isn't logged, an 8:30 PM check-in for the day, and a 9 AM catch-up
// (see syncAppointmentReminders).
// Re-syncs on open, on return to the app, and whenever an appointment is
// logged or changed. Tapping a nudge opens the log window for it.
export function useAppointmentReminders(user) {
  useEffect(() => {
    if (!isNativeApp()) return undefined;
    let alive = true;
    const sync = async () => {
      if ((await reminderPermission()) !== 'granted') return;
      // Appointments I logged, am presenting, or am training on, from two
      // days ago on (recent ones may still need an outcome), and how many
      // of mine from before that still need one (for the evening reminder).
      const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const [{ data, error }, older] = await Promise.all([
        supabase.from('appointments').select('*')
          .or(`user_id.eq.${user.id},presenter_id.eq.${user.id},trainee_id.eq.${user.id}`)
          .gte('appointment_at', since),
        supabase.from('appointments').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).is('follow_up_completed_at', null).lt('appointment_at', since),
      ]);
      if (error || !alive) return; // offline etc.: keep the reminders already set
      await syncAppointmentReminders((data || []).map(rowToRecord), user.id, { olderUnlogged: older && !older.error ? older.count || 0 : 0 }).catch(() => {});
    };
    sync();
    const offResume = onAppResume(sync);
    // Navigating (not window.open) lets iOS hand the link to the Zoom app.
    const offTap = onReminderTapped(extra => {
      if (!extra) return;
      if (extra.kind === 'log' && extra.appointmentId) { window.dispatchEvent(new CustomEvent('paceledger:open-log', { detail: { appointmentId: extra.appointmentId } })); return; }
      if (extra.kind === 'log-list') { window.dispatchEvent(new CustomEvent('paceledger:open-log', { detail: { list: true } })); return; }
      if (extra.zoomUrl) window.location.href = extra.zoomUrl;
    });
    window.addEventListener('paceledger:appointments-changed', sync);
    window.addEventListener('paceledger:reminders-enabled', sync);
    return () => {
      alive = false; offResume(); offTap();
      window.removeEventListener('paceledger:appointments-changed', sync);
      window.removeEventListener('paceledger:reminders-enabled', sync);
    };
  }, [user.id]);
}

// Today card asking (once) to turn on appointment reminders in the app. On
// Android it then asks for exact alarms, so reminders arrive on time.
export const EXACT_DISMISS_KEY = 'pl_exact_reminders_dismissed';

export function RemindersPrompt() {
  const [perm, setPerm] = useState(null);
  const [exact, setExact] = useState('granted');
  const [exactDismissed, setExactDismissed] = useState(() => { try { return localStorage.getItem(EXACT_DISMISS_KEY) === '1'; } catch { return false; } });
  useEffect(() => {
    reminderPermission().then(p => {
      setPerm(p);
      if (p === 'granted') exactReminderStatus().then(setExact);
    });
  }, []);
  async function enable() {
    const res = await requestReminderPermission();
    setPerm(res);
    if (res === 'granted') {
      window.dispatchEvent(new Event('paceledger:reminders-enabled'));
      setExact(await exactReminderStatus());
    }
  }
  async function allowExact() {
    const res = await requestExactReminders();
    setExact(res);
    // Re-schedule so existing reminders use exact timing too.
    if (res === 'granted') window.dispatchEvent(new Event('paceledger:reminders-enabled'));
  }
  function notNow() {
    setExactDismissed(true);
    try { localStorage.setItem(EXACT_DISMISS_KEY, '1'); } catch { /* fine */ }
  }
  if (perm === 'granted' && exact !== 'granted' && !exactDismissed) {
    return (
      <div className="tr-connect-slim tr-connect-slim-on">
        <span className="tr-connect-dot" />
        <span className="tr-connect-text"><strong>On-time reminders.</strong> Allow PaceLedger to set alarms so each reminder arrives exactly {REMINDER_MINUTES} minutes before.</span>
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={notNow}>Not now</button>
        <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={allowExact}>Allow</button>
      </div>
    );
  }
  if (perm !== 'prompt' && perm !== 'prompt-with-rationale') return null;
  return (
    <div className="tr-connect-slim tr-connect-slim-on">
      <span className="tr-connect-dot" />
      <span className="tr-connect-text"><strong>Appointment reminders.</strong> Get a notification {REMINDER_MINUTES} minutes before each appointment, with its Zoom link, and a nudge afterward to log how it went.</span>
      <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={enable}>Turn on</button>
    </div>
  );
}
