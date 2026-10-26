// Tap an appointment anywhere (Calendar, Today, Follow-up) and it opens in a
// window over the screen: the edit form for your own, the details for
// someone else's (only whoever booked it can change it). The window itself
// (appointmentEditor.jsx) loads the first time it's needed. Screens that
// list appointments hear what changed and update in place.
import { Suspense, useEffect, useRef, useState } from 'react';
import { lazyScreen, ScreenBoundary } from './lazyScreen.jsx';
import { Modal } from './ui.jsx';
import { askConfirm, undoable } from './confirm.jsx';
import { deleteAppointmentRow } from '../data/appointments.js';
import { fmtApptDateTime } from '../lib/dates.js';

const AppointmentEditorBody = lazyScreen(() => import('./appointmentEditor.jsx'), 'AppointmentEditorBody');

export function openAppointment(appointment) {
  if (!appointment) return;
  window.dispatchEvent(new CustomEvent('paceledger:open-appointment', { detail: { appointment } }));
}

// What the window changed: { record } (saved or moved), { deletedId }, or
// { reload: true } (an outcome was logged, which can add a follow-up).
// Phone reminders and Pipeline's counts listen for this event too.
export function appointmentEdited(change) {
  window.dispatchEvent(new CustomEvent('paceledger:appointments-changed', { detail: { ...change, fromWindow: true } }));
}

// Deleting an appointment: an in-app confirm, then it leaves every list
// right away with Undo; the database delete happens a few seconds later
// (and a list that reloaded in between drops it again then). Returns false
// if they changed their mind.
export async function deleteAppointmentWithUndo(appt) {
  const who = appt.client ? `the appointment with ${appt.client}` : 'this appointment';
  if (!(await askConfirm({ title: `Delete ${who}?`, body: fmtApptDateTime(appt), confirmLabel: 'Delete', danger: true }))) return false;
  undoable({
    text: `Deleted ${appt.client ? `the appointment with ${appt.client}` : 'the appointment'}`,
    apply: () => appointmentEdited({ deletedId: appt.id }),
    revert: () => appointmentEdited({ reload: true }),
    commit: async () => {
      const ok = await deleteAppointmentRow(appt.id);
      if (ok) appointmentEdited({ deletedId: appt.id });
      return ok;
    },
    failText: `Couldn't delete the appointment with ${appt.client || 'them'}. Check your connection and try again. It's been put back.`,
  });
  return true;
}

// A list of appointments with that change applied.
export function applyAppointmentEdit(list, change) {
  if (change.record) return list.map(x => (x.id === change.record.id ? { ...x, ...change.record } : x));
  if (change.deletedId) return list.filter(x => x.id !== change.deletedId);
  return list;
}

// Calls onEdit(change) whenever the window saves something.
export function useAppointmentEdits(onEdit) {
  const latest = useRef(onEdit);
  latest.current = onEdit;
  useEffect(() => {
    const on = e => { const change = e && e.detail; if (change && change.fromWindow) latest.current(change); };
    window.addEventListener('paceledger:appointments-changed', on);
    return () => window.removeEventListener('paceledger:appointments-changed', on);
  }, []);
}

// If the window can't load (no connection), it says so in a window instead.
function FailedWindow({ children }) {
  return <Modal onClose={() => window.dispatchEvent(new Event('paceledger:close-appointment'))}>{children}</Modal>;
}

export function AppointmentPanel({ user }) {
  const [appointment, setAppointment] = useState(null);
  const [toast, setToast] = useState(null); // { kind: 'ok' | 'warn', text }
  useEffect(() => {
    const open = e => {
      const a = e && e.detail && e.detail.appointment;
      if (a) { setAppointment(a); setToast(null); }
    };
    const shut = () => setAppointment(null);
    window.addEventListener('paceledger:open-appointment', open);
    window.addEventListener('paceledger:close-appointment', shut);
    return () => {
      window.removeEventListener('paceledger:open-appointment', open);
      window.removeEventListener('paceledger:close-appointment', shut);
    };
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), toast.kind === 'warn' ? 9000 : 5000);
    return () => clearTimeout(t);
  }, [toast]);
  const close = () => setAppointment(null);
  return (
    <>
      {appointment ? (
        <ScreenBoundary key={appointment.id} wrap={FailedWindow}>
          <Suspense fallback={null}>
            <AppointmentEditorBody user={user} appointment={appointment} onClose={close} onToast={setToast}
              onDone={msg => { close(); if (msg) setToast(msg); }} />
          </Suspense>
        </ScreenBoundary>
      ) : null}
      {toast ? (
        <div className={`tr-toast ${toast.kind === 'warn' ? 'tr-toast-error' : 'tr-toast-success'}`} role="status">
          {toast.text}
          <button type="button" className="tr-toast-close" onClick={() => setToast(null)} aria-label="Dismiss">×</button>
        </div>
      ) : null}
    </>
  );
}
