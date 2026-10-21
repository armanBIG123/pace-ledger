// The "How did it go?" window for a past appointment. It asks how it went
// first, then only what fits that answer:
// - Went well / Not interested: sold (with the premium), recruited,
//   follow-up, tax and home/auto interest, and client intake, as before.
// - No show / Rescheduled: pick the new date and time right here (the same
//   as editing it from the Reschedule list), or "Not now".
// Used on Today, Pipeline (Booked, Log outcome, Follow-up), and by leaders
// for appointments they presented (presenter: no time picking, no intake).
// onEdit: "Edit the appointment" instead (wrong time or details).
import { useState } from 'react';
import { CalendarClock, CircleX, ThumbsUp, UserX } from 'lucide-react';
import { boolToYesNo, rescheduleAppointment, typeLabel, YES_NO_OPTIONS, yesNoToBool } from '../data/appointments.js';
import { sendAppointmentInviteEmail } from '../data/integrations.js';
import { detectTimezone, fmtApptDateTime } from '../lib/dates.js';
import { Modal, openPicker, PillChoice } from './ui.jsx';

const OUTCOMES = [
  { value: 'went_well', label: 'Went well', Icon: ThumbsUp },
  { value: 'no_show', label: 'No show', Icon: UserX },
  { value: 'rescheduled', label: 'Rescheduled', Icon: CalendarClock },
  { value: 'not_interested', label: 'Not interested', Icon: CircleX },
];
const MET = ['went_well', 'not_interested'];
const MISSED = ['no_show', 'rescheduled'];
const first = n => (n || '').trim().split(/\s+/)[0] || n;

export function FollowUpModal({ appointment, onClose, onSave, saving, onRescheduled = null, presenter = false, setByName = '', onEdit = null }) {
  const [outcome, setOutcome] = useState(appointment.outcome || '');
  const [followUpScheduled, setFollowUpScheduled] = useState(boolToYesNo(appointment.followUpScheduled));
  const [followUpDate, setFollowUpDate] = useState(appointment.followUpAppointmentDate || '');
  const [followUpTime, setFollowUpTime] = useState(appointment.followUpAppointmentTime || '');
  const [officiallyRecruited, setOfficiallyRecruited] = useState(boolToYesNo(appointment.officiallyRecruited));
  const [officiallySold, setOfficiallySold] = useState(boolToYesNo(appointment.officiallySold));
  const [targetPremium, setTargetPremium] = useState(appointment.targetPremium != null ? String(appointment.targetPremium) : '');
  // A sale saved without a premium shows up on Today until it's added. One
  // already saved that way stays allowed; typing a premium is always open.
  const [premiumLater, setPremiumLater] = useState(appointment.officiallySold === true && !(Number(appointment.targetPremium) > 0));
  const [interestedTax, setInterestedTax] = useState(boolToYesNo(appointment.interestedTax));
  const [interestedInsurance, setInterestedInsurance] = useState(boolToYesNo(appointment.interestedInsurance));
  const [clientIntake, setClientIntake] = useState(appointment.clientIntakeRequested ? 'yes' : '');
  // No show / Rescheduled: pick the new time now, or not now.
  const canMove = !presenter && typeof onRescheduled === 'function';
  const [moveNow, setMoveNow] = useState(canMove && appointment.outcome !== 'no_show' ? null : false);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [emailClient, setEmailClient] = useState(false);
  const [moving, setMoving] = useState(false);
  const [err, setErr] = useState('');

  // Already logged with no outcome (older records): show every question.
  const full = MET.includes(outcome) || (!outcome && !!appointment.followUpCompletedAt);
  const missed = MISSED.includes(outcome);
  const busy = saving || moving;

  function pick(value) {
    setOutcome(value);
    setErr('');
    // Rescheduled usually means you know the new time; a no-show usually doesn't.
    if (MISSED.includes(value) && canMove && moveNow === null) setMoveNow(value === 'rescheduled');
  }

  function save() {
    if (full) {
      if (officiallySold === 'yes' && !(Number(targetPremium) > 0) && !premiumLater) {
        setErr("Enter the premium, or tick \"I'll add it later\".");
        return;
      }
      if (followUpScheduled === 'yes' && (!followUpDate || !followUpTime)) {
        setErr('Enter the date and time for the follow-up appointment.');
        return;
      }
    }
    setErr('');
    onSave(appointment.id, {
      outcome,
      followUpScheduled: full ? yesNoToBool(followUpScheduled) : null,
      followUpDate: full && followUpScheduled === 'yes' ? followUpDate : null,
      followUpTime: full && followUpScheduled === 'yes' ? followUpTime : null,
      officiallyRecruited: full ? yesNoToBool(officiallyRecruited) : false,
      officiallySold: full ? yesNoToBool(officiallySold) : false,
      targetPremium: full && officiallySold === 'yes' && Number(targetPremium) > 0 ? targetPremium : '',
      interestedTax: full ? yesNoToBool(interestedTax) : null,
      interestedInsurance: full ? yesNoToBool(interestedInsurance) : null,
      clientIntake: full && !presenter && clientIntake === 'yes',
    });
  }

  async function move() {
    if (!newDate || !newTime) { setErr('Pick the new date and time.'); return; }
    setErr('');
    setMoving(true);
    const res = await rescheduleAppointment(appointment, { date: newDate, time: newTime, timezone: appointment.appointmentTimezone || detectTimezone() });
    if (!res.ok) { setMoving(false); setErr("Couldn't move it. Check your connection and try again."); return; }
    let emailed = null;
    if (emailClient && appointment.clientEmail) {
      const r = await sendAppointmentInviteEmail(appointment.id, [appointment.clientEmail], true);
      emailed = !!r.sent;
    }
    setMoving(false);
    onRescheduled(res.record, { emailed });
  }

  const kind = typeLabel(appointment);
  const who = presenter ? (setByName ? `set by ${setByName}` : '') : (appointment.presenter ? `with ${appointment.presenter}` : '');
  return (
    <Modal onClose={onClose}>
      <h3 className="tr-h3 tr-log-title">How did it go with {appointment.client}?</h3>
      <p className="tr-subtitle">{[fmtApptDateTime(appointment), kind, who].filter(Boolean).join(' · ')}</p>
      <div className={`tr-log-tiles ${outcome ? 'tr-log-tiles-picked' : ''}`} role="radiogroup" aria-label="How did it go?">
        {OUTCOMES.map(({ value, label, Icon }) => (
          <button key={value} type="button" role="radio" aria-checked={outcome === value}
            className={`tr-log-tile ${outcome === value ? 'tr-log-tile-on' : ''}`} onClick={() => pick(value)}>
            <Icon size={outcome ? 16 : 20} aria-hidden="true" /><span>{label}</span>
          </button>
        ))}
      </div>
      {!outcome && !full ? <p className="tr-log-pick">Pick one. The questions that fit come next.</p> : null}

      {full && (
        <div className="tr-followup-list">
          <div className="tr-field"><span>Sold a policy?</span><PillChoice options={YES_NO_OPTIONS} value={officiallySold} onChange={setOfficiallySold} /></div>
          {officiallySold === 'yes' && (
            <div className="tr-log-premium">
              <label className="tr-field">
                <span>Target premium {premiumLater ? null : <em className="tr-log-needed">needed</em>}</span>
                <input type="number" min="0" step="1" inputMode="decimal" value={targetPremium}
                  className={err && !premiumLater && !(Number(targetPremium) > 0) ? 'tr-input-bad' : ''}
                  onChange={e => { setTargetPremium(e.target.value); setErr(''); }} placeholder="e.g. 1200" />
              </label>
              <label className="tr-check-inline">
                <input type="checkbox" checked={premiumLater} onChange={e => { setPremiumLater(e.target.checked); setErr(''); }} />
                I'll add it later <span className="tr-empty">(it stays on Today until you do)</span>
              </label>
            </div>
          )}
          <div className="tr-field"><span>Officially recruited?</span><PillChoice options={YES_NO_OPTIONS} value={officiallyRecruited} onChange={setOfficiallyRecruited} /></div>
          <div className="tr-field"><span>Follow-up appointment scheduled?</span><PillChoice options={YES_NO_OPTIONS} value={followUpScheduled} onChange={setFollowUpScheduled} /></div>
          {followUpScheduled === 'yes' && (
            <div className="tr-followup-subfields">
              <label className="tr-field">
                <span>Follow-up date</span>
                <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} onClick={openPicker} />
              </label>
              <label className="tr-field">
                <span>Follow-up time</span>
                <input type="time" value={followUpTime} onChange={e => setFollowUpTime(e.target.value)} onClick={openPicker} />
              </label>
              <p className="tr-empty" style={{ margin: 0 }}>This'll be added to {presenter && setByName ? `${first(setByName)}'s` : 'your'} appointments automatically when you save.</p>
            </div>
          )}
          <div className="tr-field"><span>Interested in tax strategies?</span><PillChoice options={YES_NO_OPTIONS} value={interestedTax} onChange={setInterestedTax} /></div>
          <div className="tr-field"><span>Interested in reviewing home/auto insurance?</span><PillChoice options={YES_NO_OPTIONS} value={interestedInsurance} onChange={setInterestedInsurance} /></div>
          {presenter ? null : (
            <div className="tr-field">
              <span>Client intake?</span>
              {appointment.clientIntakeRequested ? (
                <p className="tr-empty" style={{ margin: 0 }}>Already added to Client intake.</p>
              ) : (
                <>
                  <PillChoice options={YES_NO_OPTIONS} value={clientIntake} onChange={setClientIntake} />
                  {clientIntake === 'yes' && (
                    <p className="tr-empty" style={{ margin: 0 }}>We'll add {appointment.client} to Client intake and make their link when you save.</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {missed && (
        <div className="tr-followup-list">
          {canMove ? (
            <>
              <div className="tr-field">
                <span>{outcome === 'rescheduled' ? 'Pick the new time now?' : 'Try to rebook now?'}</span>
                <PillChoice options={[{ value: 'now', label: 'Pick a new time' }, { value: 'later', label: 'Not now' }]}
                  value={moveNow === null ? '' : moveNow ? 'now' : 'later'} onChange={v => { setMoveNow(v === 'now'); setErr(''); }} />
              </div>
              {moveNow ? (
                <div className="tr-followup-subfields">
                  <label className="tr-field">
                    <span>New date</span>
                    <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} onClick={openPicker} />
                  </label>
                  <label className="tr-field">
                    <span>New time</span>
                    <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} onClick={openPicker} />
                  </label>
                  <p className="tr-empty" style={{ margin: 0 }}>Moves this appointment, the same as editing it from your Reschedule list: it counts as set this week and keeps its Zoom link.</p>
                  {appointment.clientEmail ? (
                    <label className="tr-check-inline">
                      <input type="checkbox" checked={emailClient} onChange={e => setEmailClient(e.target.checked)} />
                      Email {first(appointment.client)} an updated invite
                    </label>
                  ) : null}
                </div>
              ) : moveNow === false ? (
                <p className="tr-empty" style={{ margin: 0 }}>
                  {outcome === 'rescheduled' ? 'It goes on your Reschedule list.' : "It's saved as \"Didn't happen\"."} You can rebook it from there any time.
                </p>
              ) : null}
            </>
          ) : (
            <p className="tr-empty" style={{ margin: 0 }}>
              {presenter ? `${setByName ? first(setByName) : 'The advisor'} picks the new time.` : 'Saved to your list so you can rebook it.'}
            </p>
          )}
        </div>
      )}

      {err && <div className="tr-error">{err}</div>}
      <div className="tr-form-actions">
        {onEdit && !presenter ? <button type="button" className="tr-link-btn tr-log-edit" onClick={onEdit}>Edit the appointment</button> : null}
        <button type="button" className="tr-btn tr-btn-ghost" onClick={onClose}>Cancel</button>
        {missed && moveNow ? (
          <button type="button" className="tr-btn tr-btn-brass" onClick={move} disabled={busy}>{moving ? 'Saving…' : 'Save new time'}</button>
        ) : (
          <button type="button" className="tr-btn tr-btn-brass" onClick={save} disabled={busy || (!outcome && !full) || (missed && canMove && moveNow === null)}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
    </Modal>
  );
}
