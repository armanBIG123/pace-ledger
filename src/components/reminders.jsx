// Phone reminders before appointments, and the prompt to turn them on.
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { exactReminderStatus, isNativeApp, onAppResume, onReminderTapped, REMINDER_MINUTES, reminderPermission, requestExactReminders, requestReminderPermission, syncAppointmentReminders } from '../native.js';
import { rowToRecord } from '../data/appointments.js';

// iPhone app only: keeps a phone reminder scheduled 30 minutes before each
// upcoming appointment. Re-syncs on open, on return to the app, and
// whenever an appointment is logged.
export function useAppointmentReminders(user) {
  useEffect(() => {
    if (!isNativeApp()) return undefined;
    let alive = true;
    const sync = async () => {
      if ((await reminderPermission()) !== 'granted') return;
      // Appointments I logged, am presenting, or am training on, from now on.
      const { data, error } = await supabase
        .from('appointments').select('*')
        .or(`user_id.eq.${user.id},presenter_id.eq.${user.id},trainee_id.eq.${user.id}`)
        .gte('appointment_at', new Date().toISOString());
      if (error || !alive) return; // offline etc.: keep the reminders already set
      await syncAppointmentReminders((data || []).map(rowToRecord)).catch(() => {});
    };
    sync();
    const offResume = onAppResume(sync);
    // Navigating (not window.open) lets iOS hand the link to the Zoom app.
    const offTap = onReminderTapped(extra => { if (extra && extra.zoomUrl) window.location.href = extra.zoomUrl; });
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
      <span className="tr-connect-text"><strong>Appointment reminders.</strong> Get a notification {REMINDER_MINUTES} minutes before each appointment, with its Zoom link.</span>
      <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={enable}>Turn on</button>
    </div>
  );
}
