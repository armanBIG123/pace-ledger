// Client profile (Clients.jsx), the parts for doing things without leaving
// it: every appointment with Edit and Log/Update outcome, and the client
// intake form and recruit sign-up link for this person.
import { useEffect, useState } from 'react';
import { CalendarPlus, FileText, Pencil } from 'lucide-react';
import { isPastAppointment, isRecruitType, OUTCOME_OPTIONS, setAppointmentIntakeRequested, typeLabel } from '../data/appointments.js';
import { deleteClientIntakeCandidate, fetchIntakeForAppointment } from '../clientIntake.js';
import { intakeChanged, openIntakeSend } from '../lib/intakeEvents.js';
import { intakeStatusText, intakeStatusTone } from '../lib/intakeStatus.js';
import { whenOf } from '../lib/clients.js';
import { normName } from '../data/prospects.js';
import { ClientIntakeSection } from '../ClientIntake.jsx';
import { RecruitSignupSection } from '../components/invites.jsx';
import { openAppointment } from '../components/appointmentPanel.jsx';
import { askConfirm } from '../components/confirm.jsx';

const firstOf = n => (n || '').trim().split(/\s+/)[0] || n;

// Where one appointment stands, as a chip.
function apptStatus(a) {
  if (!isPastAppointment(a)) return { text: 'Coming up', tone: 'none' };
  if (!a.followUpCompletedAt) return { text: 'Outcome not logged', tone: 'rust' };
  if (a.officiallySold) return { text: 'Sold', tone: 'green' };
  const o = OUTCOME_OPTIONS.find(x => x.value === a.outcome);
  const tone = a.outcome === 'went_well' ? 'green' : a.outcome === 'no_show' ? 'amber' : a.outcome === 'rescheduled' ? 'violet' : 'none';
  return { text: o ? o.label : 'Logged', tone };
}

// Coming up (soonest first), then the past (newest first). onBook: the
// appointment form for this person. onLog(appt, presenter): the outcome
// window, to log it or change what was logged.
export function AppointmentsCard({ c, user, intakeByAppt, onBook, onLog }) {
  const mine = !c.presented;
  const list = [...c.upcoming, ...c.past.slice().reverse()];
  const me = normName(user.displayName || '');
  const withWho = a => (a.presenter && a.presenterId !== user.id && normName(a.presenter) !== me ? `with ${firstOf(a.presenter)}` : '');
  return (
    <section className="tr-card tr-cl-card" aria-labelledby="cl-appts-h">
      <div className="tr-row-head">
        <h3 className="tr-cl-h" id="cl-appts-h">Appointments</h3>
        {mine ? <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onBook}><CalendarPlus size={14} aria-hidden="true" /> Book appointment</button> : null}
      </div>
      {list.length ? (
        <ul className="tr-cl-appts">
          {list.map(a => {
            const st = apptStatus(a);
            const past = isPastAppointment(a);
            const logged = !!a.followUpCompletedAt;
            const cand = mine ? intakeByAppt.get(a.id) : null;
            const when = whenOf(a);
            const what = [a.isFollowUp ? 'Follow-up' : 'Appointment', typeLabel(a), withWho(a)].filter(Boolean).join(' · ');
            return (
              <li key={a.id} className="tr-cl-appt">
                <div className="tr-cl-appt-main">
                  <strong>{when}</strong>
                  <span className="tr-cl-muted">{what}</span>
                  <span className="tr-cl-appt-tags">
                    <span className={`tr-status tr-status-${st.tone}`}>{st.text}</span>
                    {cand ? <span className={`tr-status tr-status-${intakeStatusTone(cand)}`}><FileText size={11} aria-hidden="true" /> {cand.status === 'submitted' ? 'Intake received' : `Intake ${intakeStatusText(cand).toLowerCase()}`}</span> : null}
                  </span>
                </div>
                <div className="tr-cl-appt-acts">
                  {past && !logged ? <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={() => onLog(a, c.presented)}>Log outcome</button> : null}
                  {past && logged && mine ? <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => onLog(a, false)} aria-label={`Update the outcome: ${when}`}>Update outcome</button> : null}
                  {mine ? <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => openAppointment(a)} aria-label={`Edit the appointment: ${when}`}><Pencil size={13} aria-hidden="true" /> Edit</button> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : <p className="tr-empty">None yet.{mine ? ` Book ${firstOf(c.name)}’s first one and it shows here.` : ''}</p>}
    </section>
  );
}

// The client intake form for this person. It goes with an appointment: the
// one that already has a form, otherwise the next one coming up, otherwise
// the latest.
function ProfileIntake({ user, c }) {
  const appt = [...c.appts].reverse().find(a => a.__intake) || c.nextUp || c.lastPast;
  const [cand, setCand] = useState(undefined); // undefined while loading
  const id = appt ? appt.id : null;
  useEffect(() => {
    if (!id) { setCand(null); return undefined; }
    let alive = true;
    fetchIntakeForAppointment(user.id, id).then(x => { if (alive) setCand(x); }).catch(() => { if (alive) setCand(null); });
    const on = e => {
      const d = e && e.detail;
      if (d && d.candidate && d.candidate.source_appointment_id === id) setCand(d.candidate);
      if (d && d.removedId) setCand(x => (x && x.id === d.removedId ? null : x));
    };
    window.addEventListener('paceledger:intake-changed', on);
    return () => { alive = false; window.removeEventListener('paceledger:intake-changed', on); };
  }, [user.id, id]);
  const first = firstOf(c.name);
  if (!appt) {
    return (
      <div>
        <h4 className="tr-h4" style={{ margin: 0 }}>Client intake</h4>
        <p className="tr-empty" style={{ margin: '6px 0 0' }}>The intake form goes with an appointment. Book {first} and you can send it from here.</p>
      </div>
    );
  }
  if (cand === undefined) return <div><h4 className="tr-h4" style={{ margin: 0 }}>Client intake</h4><p className="tr-empty" style={{ margin: '6px 0 0' }}>Checking…</p></div>;
  async function remove() {
    if (!(await askConfirm({ title: `Remove ${first}'s intake form?`, body: 'Their link stops working, and any answers they gave are deleted.', confirmLabel: 'Remove', danger: true }))) return;
    if (await deleteClientIntakeCandidate(cand.id)) {
      await setAppointmentIntakeRequested(appt.id, false);
      intakeChanged({ removedId: cand.id });
    }
  }
  if (cand) return <ClientIntakeSection candidate={cand} canManage onRemove={remove} onSend={() => openIntakeSend({ appointment: appt, candidate: cand })} />;
  return (
    <div>
      <div className="tr-row-head">
        <h4 className="tr-h4" style={{ margin: 0 }}>Client intake</h4>
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => openIntakeSend({ appointment: appt, candidate: null })}><FileText size={13} aria-hidden="true" /> Send intake form</button>
      </div>
      <p className="tr-empty" style={{ margin: '6px 0 0' }}>Email it, text it or copy the link. It goes with {first}’s {isPastAppointment(appt) ? 'last' : 'next'} appointment ({whenOf(appt)}).</p>
    </div>
  );
}

// The intake form and the recruit sign-up link, for people on your own
// list (not ones you presented for a teammate).
export function LinksCard({ c, user, intakeByAppt }) {
  // Mark the appointment that already has a form, so the intake part uses it.
  const appts = c.appts.map(a => (intakeByAppt.get(a.id) ? { ...a, __intake: true } : a));
  const latest = c.appts[c.appts.length - 1] || null;
  const recruitAppt = [...c.appts].reverse().find(isRecruitType) || latest;
  return (
    <section className="tr-card tr-cl-card" aria-labelledby="cl-links-h">
      <h3 className="tr-cl-h" id="cl-links-h">Forms and links</h3>
      <div className="tr-cl-linkpart"><ProfileIntake user={user} c={{ ...c, appts }} /></div>
      <div className="tr-cl-linkpart">
        <RecruitSignupSection user={user} recruitName={c.name} recruitEmail={c.email} joined={!!c.signup}
          appointmentId={recruitAppt ? recruitAppt.id : null} appointmentIds={c.appts.map(a => a.id)} />
      </div>
    </section>
  );
}
