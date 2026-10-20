// The "How did it go?" window for a past appointment: outcome, follow-up,
// recruited/sold, target premium and client intake. Used on Today, My
// appointments and Follow Up.
import { useState } from 'react';
import { boolToYesNo, OUTCOME_OPTIONS, YES_NO_OPTIONS, yesNoToBool } from '../data/appointments.js';
import { fmtApptDateTime } from '../lib/dates.js';
import { Modal, openPicker, PillChoice } from './ui.jsx';

export function FollowUpModal({ appointment, onClose, onSave, saving }) {
  const [outcome, setOutcome] = useState(appointment.outcome || '');
  const [followUpScheduled, setFollowUpScheduled] = useState(boolToYesNo(appointment.followUpScheduled));
  const [followUpDate, setFollowUpDate] = useState(appointment.followUpAppointmentDate || '');
  const [followUpTime, setFollowUpTime] = useState(appointment.followUpAppointmentTime || '');
  const [officiallyRecruited, setOfficiallyRecruited] = useState(boolToYesNo(appointment.officiallyRecruited));
  const [officiallySold, setOfficiallySold] = useState(boolToYesNo(appointment.officiallySold));
  const [targetPremium, setTargetPremium] = useState(appointment.targetPremium != null ? String(appointment.targetPremium) : '');
  const [interestedTax, setInterestedTax] = useState(boolToYesNo(appointment.interestedTax));
  const [interestedInsurance, setInterestedInsurance] = useState(boolToYesNo(appointment.interestedInsurance));
  const [clientIntake, setClientIntake] = useState(appointment.clientIntakeRequested ? 'yes' : '');
  const [err, setErr] = useState('');

  function submit() {
    if (followUpScheduled === 'yes' && (!followUpDate || !followUpTime)) {
      setErr('Enter the date and time for the follow-up appointment.');
      return;
    }
    setErr('');
    onSave(appointment.id, {
      outcome,
      followUpScheduled: yesNoToBool(followUpScheduled),
      followUpDate: followUpScheduled === 'yes' ? followUpDate : null,
      followUpTime: followUpScheduled === 'yes' ? followUpTime : null,
      officiallyRecruited: yesNoToBool(officiallyRecruited),
      officiallySold: yesNoToBool(officiallySold),
      targetPremium,
      interestedTax: yesNoToBool(interestedTax),
      interestedInsurance: yesNoToBool(interestedInsurance),
      clientIntake: clientIntake === 'yes',
    });
  }

  return (
    <Modal onClose={onClose}>
      <h3 className="tr-h3">Follow-up — {appointment.client}</h3>
      <p className="tr-subtitle">
        {fmtApptDateTime(appointment)}
      </p>
      <div className="tr-followup-list">
        <div className="tr-field"><span>How'd it go?</span><PillChoice options={OUTCOME_OPTIONS} value={outcome} onChange={setOutcome} /></div>
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
            <p className="tr-empty" style={{ margin: 0 }}>This'll be added to your appointments log automatically when you save.</p>
          </div>
        )}
        <div className="tr-field"><span>Officially recruited?</span><PillChoice options={YES_NO_OPTIONS} value={officiallyRecruited} onChange={setOfficiallyRecruited} /></div>
        <div className="tr-field"><span>Sold a policy?</span><PillChoice options={YES_NO_OPTIONS} value={officiallySold} onChange={setOfficiallySold} /></div>
        {officiallySold === 'yes' && (
          <label className="tr-field">
            <span>Target premium</span>
            <input type="number" min="0" step="1" inputMode="decimal" value={targetPremium} onChange={e => setTargetPremium(e.target.value)} placeholder="e.g. 1200" />
          </label>
        )}
        <div className="tr-field"><span>Interested in tax strategies?</span><PillChoice options={YES_NO_OPTIONS} value={interestedTax} onChange={setInterestedTax} /></div>
        <div className="tr-field"><span>Interested in reviewing home/auto insurance?</span><PillChoice options={YES_NO_OPTIONS} value={interestedInsurance} onChange={setInterestedInsurance} /></div>
        <div className="tr-field">
          <span>Client intake?</span>
          {appointment.clientIntakeRequested ? (
            <p className="tr-empty" style={{ margin: 0 }}>Already added to your Client Intake tab.</p>
          ) : (
            <>
              <PillChoice options={YES_NO_OPTIONS} value={clientIntake} onChange={setClientIntake} />
              {clientIntake === 'yes' && (
                <p className="tr-empty" style={{ margin: 0 }}>We'll add {appointment.client} to Client Intake and generate their link when you save.</p>
              )}
            </>
          )}
        </div>
      </div>
      {err && <div className="tr-error">{err}</div>}
      <div className="tr-form-actions">
        <button type="button" className="tr-btn tr-btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="tr-btn tr-btn-brass" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save follow-up'}</button>
      </div>
    </Modal>
  );
}
