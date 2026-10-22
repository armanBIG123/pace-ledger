// The window an appointment opens in when it's tapped on Calendar, Today or
// Follow-up (see appointmentPanel.jsx).
// - Yours: the same edit form as Pipeline, with Delete, and "Log how it
//   went" once it's over.
// - Someone else's (you're presenting, training, or they're on your team):
//   what it is, when, who's on it and the Zoom link. If the person who
//   booked it reports to you, or you're a super admin: Edit too (the time
//   and the details; how it went stays theirs).
import { useEffect, useState } from 'react';
import { Pencil, Video, X } from 'lucide-react';
import { deleteAppointmentRow, loggedSummary, persistFollowUp } from '../data/appointments.js';
import { fetchHierarchyPeopleShared } from '../data/team.js';
import { durationLabel, fmtApptDateTime, todayStr, weekStartOf } from '../lib/dates.js';
import { AppointmentForm, saveAppointmentChanges } from '../screens/Appointments.jsx';
import { appointmentEdited } from './appointmentPanel.jsx';
import { appointmentTexts, CallButton, TextButton } from './contact.jsx';
import { FollowUpModal } from './followUpModal.jsx';
import { Modal, StatusChip, TypeBadge, useIsPhone } from './ui.jsx';

const firstName = n => String(n || '').trim().split(/\s+/)[0] || '';

// onClose: just close. onDone(message): close and say what happened.
// onToast(message): say something without closing.
export function AppointmentEditorBody({ user, appointment, onClose, onDone, onToast }) {
  const isPhone = useIsPhone();
  const mine = appointment.userId === user.id;
  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState(mine);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  // Everyone's names and who reports to whom (shared, usually already loaded).
  const [people, setPeople] = useState(null);
  useEffect(() => {
    if (mine) return undefined;
    let alive = true;
    fetchHierarchyPeopleShared().then(list => { if (alive) setPeople(list || []); }).catch(() => { if (alive) setPeople([]); });
    return () => { alive = false; };
  }, [mine]);
  const booker = !mine && people ? people.find(p => p.id === appointment.userId) : null;
  const canChange = !mine && (user.role === 'super_admin' || (!!booker && booker.manager_id === user.id));
  if (!mine && !editing) {
    return <AppointmentDetails user={user} appt={appointment} people={people} onClose={onClose} onEdit={canChange ? () => setEditing(true) : null} />;
  }

  async function save(input) {
    setSaving(true);
    setSaveError('');
    const res = await saveAppointmentChanges(user, appointment, input);
    setSaving(false);
    if (!res.ok) { setSaveError(res.error); return; }
    appointmentEdited({ record: res.record });
    onDone(res.notice || { kind: 'ok', text: `Saved: ${res.record.client}, ${fmtApptDateTime(res.record)}.` });
  }
  async function remove() {
    if (!window.confirm(`Delete the appointment with ${appointment.client}? This can't be undone.`)) return;
    setSaving(true);
    setSaveError('');
    const ok = await deleteAppointmentRow(appointment.id);
    setSaving(false);
    if (!ok) { setSaveError("Couldn't delete it. Check your connection and try again."); return; }
    appointmentEdited({ deletedId: appointment.id });
    onDone({ kind: 'ok', text: `Deleted the appointment with ${appointment.client}.` });
  }
  async function saveOutcome(id, data) {
    setSaving(true);
    const res = await persistFollowUp(user, id, appointment, data);
    setSaving(false);
    if (!res.ok) { onToast({ kind: 'warn', text: "Couldn't save. Check your connection and try again." }); return; }
    appointmentEdited({ reload: true });
    onDone({ kind: 'ok', text: `Saved: ${appointment.client}.${res.newAppt ? ' The follow-up appointment is on your list.' : ''}` });
  }
  function rescheduled(rec, info) {
    appointmentEdited({ record: rec });
    const emailed = info ? info.emailed : undefined;
    onDone({
      kind: emailed === false ? 'warn' : 'ok',
      text: `Moved ${rec.client} to ${fmtApptDateTime(rec)}.${emailed === true ? ' Updated invite emailed.' : emailed === false ? " The updated invite didn't send; you can resend it by editing the appointment." : ''}`,
    });
  }

  if (logging) {
    return <FollowUpModal appointment={appointment} saving={saving} onClose={onClose} onSave={saveOutcome} onRescheduled={rescheduled} onEdit={() => setLogging(false)} />;
  }
  return (
    <AppointmentForm
      user={user} weekMonday={appointment.weekOf || weekStartOf(todayStr())} editing={appointment}
      onCancel={onClose} onSubmit={save} saving={saving} sheet={isPhone} modal={!isPhone}
      saveError={saveError} onDelete={mine ? remove : null} onLogOutcome={mine ? () => setLogging(true) : null}
      bookedBy={mine ? '' : (booker && booker.display_name) || appointment.setByName || ''} />
  );
}

function AppointmentDetails({ user, appt, people, onClose, onEdit }) {
  const nameOf = id => (people && id ? (people.find(p => p.id === id) || {}).display_name || '' : '');
  const names = people;
  const bookedBy = appt.setByName || nameOf(appt.userId);
  const presenter = appt.presenterId === user.id ? 'You' : appt.presenter || nameOf(appt.presenterId) || '—';
  const trainee = appt.traineeId && appt.traineeId === user.id ? 'You' : appt.trainee || '';
  const result = loggedSummary(appt);
  return (
    <Modal onClose={onClose} labelledBy="tr-apptinfo-title" className="tr-apptinfo">
      <div className="tr-modal-head">
        <div className="tr-apptinfo-top">
          <h3 className="tr-h3" id="tr-apptinfo-title">{appt.client}</h3>
          <div className="tr-apptinfo-tags">
            <TypeBadge appt={appt} />
            {appt.isFollowUp ? <span className="tr-presenting-chip">Follow-up</span> : null}
            {appt.status ? <StatusChip status={appt.status} /> : null}
          </div>
        </div>
        <button type="button" className="tr-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>
      <p className="tr-apptinfo-when">{fmtApptDateTime(appt)}<span> · {durationLabel(appt.durationMinutes)}</span></p>
      <dl className="tr-apptinfo-list">
        <div><dt>Booked by</dt><dd>{bookedBy || (names ? 'Someone on the team' : '…')}</dd></div>
        <div><dt>Presenter</dt><dd>{presenter}</dd></div>
        {trainee ? <div><dt>Trainee</dt><dd>{trainee}</dd></div> : null}
        {result ? <div><dt>Outcome</dt><dd>{result}</dd></div> : null}
        {appt.notes ? <div><dt>Notes</dt><dd>{appt.notes}</dd></div> : null}
      </dl>
      {appt.zoomUrl || appt.clientPhone ? (
        <div className="tr-apptinfo-acts">
          {appt.zoomUrl ? <a className="tr-btn tr-btn-brass tr-btn-sm" href={appt.zoomUrl} target="_blank" rel="noopener noreferrer"><Video size={14} aria-hidden="true" /> Join Zoom</a> : null}
          {appt.clientPhone ? (
            <>
              <CallButton phone={appt.clientPhone} compact />
              <TextButton phone={appt.clientPhone} name={appt.client} texts={appointmentTexts(appt, user.displayName)} compact />
            </>
          ) : null}
        </div>
      ) : null}
      <p className="tr-apptinfo-note">
        {onEdit
          ? `${firstName(bookedBy) || 'They'} booked it. As ${user.role === 'super_admin' ? 'a super admin' : 'who they report to'}, you can change the time and the details; how it went stays theirs to log.`
          : bookedBy ? `${firstName(bookedBy)} booked it, so only they (and who they report to) can change it.` : 'Only whoever booked it can change it.'}
      </p>
      <div className="tr-form-actions">
        <button type="button" className="tr-btn tr-btn-ghost" onClick={onClose}>Close</button>
        {onEdit ? <button type="button" className="tr-btn tr-btn-brass" onClick={onEdit}><Pencil size={14} aria-hidden="true" /> Edit</button> : null}
      </div>
    </Modal>
  );
}
