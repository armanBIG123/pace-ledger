// My Appointments: the weekly batches, the appointment form, outcomes and Open Requirements.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardCheck, Download, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { supabase } from '../supabaseClient.js';
import { isNativeApp, openInBrowserSheet } from '../native.js';
import { computeDownline, computeUpline } from '../hierarchy.js';
import { checkAppointmentConflict } from '../schedule.js';
import { DATE_SET_OPTIONS, dateSetMeta, defaultDateSetOption } from '../lib/pace.js';
import { addMinutesToDateTime, detectTimezone, fmtApptDateTime, fmtDisplayDate, fmtFollowUpDateTime, parseDate, shiftWeekStr, timezoneOptionsWithDetected, todayStr, weekStartOf } from '../lib/dates.js';
import { downloadCSV, fmtCurrency, isValidEmail } from '../lib/format.js';
import { addPolicyNote, applyFollowUpToList, boolToYesNo, deleteAppointmentRow, fetchMyAppointments, fetchPolicyNotes, fetchSoldPolicies, fetchZoomConnectedManagers, insertAppointment, inviteFailureMessage, isPastAppointment, isPolicyIssued, isRecruitType, isSaleType, ISSUED_PREMIUM_VIEW, markInviteSent, OUTCOME_OPTIONS, persistFollowUp, SOLD_PREMIUM_VIEW, STATUS_OPTIONS, typeLabel, updateAppointment, updatePolicyFields, YES_NO_OPTIONS, yesNoToBool } from '../data/appointments.js';
import { fetchMyProspects, normName, prospectLeaningKey, prospectNameKey } from '../data/prospects.js';
import { fetchOrgDirectory } from '../data/team.js';
import { connectZoom, createZoomMeeting, disconnectZoom, fetchZoomConnectionStatus, pushAppointmentToGoogleCalendar, sendAppointmentInviteEmail, updateAppointmentZoomUrl, zoomOAuthUrl } from '../data/integrations.js';
import { Modal, openPicker, PageHead, PillChoice, SkelBlock, SkeletonCards, SkeletonRows, StatusChip, TypeBadge, TypeChoice, TypeFilter, WeekNav } from '../components/ui.jsx';
import { MyCoachingNotes, PaceStrip, PaceTrend, PersonalBests } from '../components/pace.jsx';
import { ZoomConnect } from '../components/integrations.jsx';

export function ApptGroup({ title, list, onDelete, onFollowUp, onEdit, empty, hideSet }) {
  // Only show the Trainee column when someone in this group actually has one.
  const showTrainee = list.some(a => a.trainee);
  return (
    <div className={`tr-card tr-appt-group ${hideSet ? 'tr-appt-group-week' : ''}`}>
      {title ? <h3 className="tr-h3 tr-appt-group-title">{title}</h3> : null}
      {list.length === 0 ? <p className="tr-empty">{empty}</p> : (
        <div className="tr-table-wrap">
          <table className="tr-table">
            <thead>
              <tr>{!hideSet && <th className="th-set">Set</th>}<th className="th-when">Appointment</th><th className="th-client">Client / recruit</th><th className="th-presenter">Presenter</th>{showTrainee && <th className="th-trainee">Trainee</th>}{onDelete && <th className="th-actions"><span className="tr-sr-only">Actions</span></th>}</tr>
            </thead>
            <tbody>
              {list.map(a => {
                const typeClass = isRecruitType(a) && isSaleType(a) ? 'tr-type-both' : isRecruitType(a) ? 'tr-type-recruit' : isSaleType(a) ? 'tr-type-sale' : '';
                return (
                  <tr key={a.id} className={`tr-appt-row tr-appt-row-${typeClass ? typeClass.replace('tr-type-', '') : 'none'}`}>
                    {!hideSet && <td className={`td-set ${typeClass}`}>{a.dateSetLabel}</td>}
                    <td className={`td-when ${hideSet ? typeClass : ''}`}>{fmtApptDateTime(a)}</td>
                    <td className="td-client">
                      <strong className="tr-appt-client">{a.client}</strong>
                      <TypeBadge appt={a} />
                      {a.status ? <span style={{ marginLeft: 6 }}><StatusChip status={a.status} /></span> : null}
                      {a.zoomUrl ? <div><a href={a.zoomUrl} target="_blank" rel="noopener noreferrer" className="tr-note tr-link">Join Zoom</a></div> : null}
                      {a.followUpAppointmentDate ? <div className="tr-note" style={{ marginTop: 2 }}>Follow-up: {fmtFollowUpDateTime(a)}</div> : null}
                      {a.inviteSentAt ? <div className="tr-note" style={{ marginTop: 2 }} title={(a.inviteeEmails || []).join(', ')}>Invite sent to {(a.inviteeEmails || []).length} {(a.inviteeEmails || []).length === 1 ? 'person' : 'people'}{a.inviteMethod === 'google' ? ' (Google)' : ''}</div> : null}
                      {a.notes ? <span className="tr-note"> — {a.notes}</span> : null}
                    </td>
                    <td className="td-presenter"><span className="tr-mobile-only">with </span>{a.presenter}</td>
                    {showTrainee && <td className="td-trainee"><span className="tr-mobile-only">trainee </span>{a.trainee || '—'}</td>}
                    {onDelete && (
                      <td className="td-actions" style={{ whiteSpace: 'nowrap' }}>
                        {onFollowUp && isPastAppointment(a) && !a.followUpCompletedAt && (
                          <button className="tr-btn tr-btn-brass tr-btn-sm" style={{ marginRight: 4 }} onClick={() => onFollowUp(a)} title="Log how it went">Log outcome</button>
                        )}
                        {onFollowUp && isPastAppointment(a) && a.followUpCompletedAt && (
                          <button className="tr-icon-btn" onClick={() => onFollowUp(a)} title="Edit outcome">
                            <ClipboardCheck size={14} />
                          </button>
                        )}
                        {onEdit && <button className="tr-icon-btn" onClick={() => onEdit(a)} title="Edit appointment"><Pencil size={14} /></button>}
                        <button className="tr-icon-btn" onClick={() => onDelete(a.id)} title="Delete"><Trash2 size={14} /></button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

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

export function AppointmentForm({ user, weekMonday, editing, prefillData, onCancel, onSubmit, saving }) {
  const [dateSetOption, setDateSetOption] = useState(editing?.dateSetOption || defaultDateSetOption());
  const [appointmentDate, setAppointmentDate] = useState(editing?.appointmentDate || prefillData?.appointmentDate || '');
  const [appointmentTime, setAppointmentTime] = useState(editing?.appointmentTime || '');
  const [timezone, setTimezone] = useState(editing?.appointmentTimezone || detectTimezone());
  const [presenterId, setPresenterId] = useState(editing?.presenterId || user.managerId || user.id);
  const [traineeId, setTraineeId] = useState(editing?.traineeId || (!editing && user.managerId ? user.id : ''));
  const [orgDirectory, setOrgDirectory] = useState([]);
  const [client, setClient] = useState(editing?.client || prefillData?.client || '');
  const [notes, setNotes] = useState(editing?.notes || prefillData?.notes || '');
  const [clientEmail, setClientEmail] = useState(editing?.clientEmail || prefillData?.clientEmail || '');
  // Who gets the Zoom link emailed when a NEW appointment is saved.
  const [inviteClient, setInviteClient] = useState(true);
  const [inviteMe, setInviteMe] = useState(true);
  const [extraEmails, setExtraEmails] = useState('');
  const [sendUpdate, setSendUpdate] = useState(false);
  const [typeRecruit, setTypeRecruit] = useState(editing ? isRecruitType(editing) : !!prefillData?.typeRecruit);
  const [typeSale, setTypeSale] = useState(editing ? isSaleType(editing) : !!prefillData?.typeSale);
  const [zoomHostId, setZoomHostId] = useState(!editing && user.managerId ? user.managerId : '');
  const [err, setErr] = useState('');
  const [checking, setChecking] = useState(false);
  const [zoomManagers, setZoomManagers] = useState([]);
  const [myProspects, setMyProspects] = useState([]);
  const timezoneOptions = timezoneOptionsWithDetected();

  useEffect(() => {
    fetchZoomConnectedManagers().then(setZoomManagers);
    fetchOrgDirectory().then(setOrgDirectory);
    // Suggest names from your prospect list as you type the client name.
    fetchMyProspects(user.id).then(list => setMyProspects(list.filter(p => !p.markedRecruited && !p.markedSold)));
  }, [user.id]);

  function handleClientChange(value) {
    setClient(value);
    // Picking a known prospect fills in recruit/sale from how they scored,
    // unless you've already chosen a type yourself.
    const match = myProspects.find(p => prospectNameKey(p) === normName(value));
    if (match && !typeRecruit && !typeSale) {
      const leaning = prospectLeaningKey(match);
      if (leaning === 'recruit' || leaning === 'both') setTypeRecruit(true);
      if (leaning === 'sale' || leaning === 'both') setTypeSale(true);
      if (!notes && match.notes) setNotes(match.notes);
    }
    if (match) {
      if (!clientEmail && match.email) setClientEmail(match.email);
    }
  }

  // Who can present, and how it's picked, depends on whether a manager
  // was chosen above via "Which manager is presenting?":
  // - Editing an existing appointment leaves Presenter exactly as it's
  //   always worked — freely pickable from your whole upline — since
  //   this is a correction, not a fresh booking, and shouldn't re-trigger
  //   any of the new-appointment Zoom/lock behavior below.
  // - Creating a new appointment with a manager chosen there: Presenter
  //   is locked to that manager — picking them there IS picking them as
  //   presenter, so there's nothing left to choose here.
  // - Creating a new appointment with "None" chosen there: Presenter is
  //   free to pick, but only from you or your own downline — presenting
  //   solo, or logging on behalf of someone under you who presented
  //   without a manager hosting.
  const uplineOptions = computeUpline(user.id, orgDirectory);
  const downlineOptions = computeDownline(user.id, orgDirectory);
  const uplineNonSelf = uplineOptions.filter(p => p.id !== user.id);
  const uplineIds = new Set(uplineNonSelf.map(p => p.id));
  // Deliberately not limited to your own upline: any manager anywhere in
  // the org who's connected Zoom can be picked here too, so connecting
  // Zoom gives every manager a shot at hosting appointments outside their
  // own team, not just the ones already reporting to them.
  const otherZoomManagers = orgDirectory.filter(p => p.id !== user.id && !uplineIds.has(p.id) && zoomManagers.some(z => z.id === p.id));
  const zoomHostOptions = [...uplineNonSelf, ...otherZoomManagers];
  const lockedToZoomHost = !editing && !!zoomHostId;
  const presenterOptions = editing ? uplineOptions : (lockedToZoomHost ? zoomHostOptions.filter(p => p.id === zoomHostId) : downlineOptions);
  const traineeOptions = presenterId ? computeDownline(presenterId, orgDirectory).filter(p => p.id !== presenterId) : [];

  function handleZoomHostChange(id) {
    setZoomHostId(id);
    setPresenterId(id || user.id);
    setTraineeId(''); // the old trainee pick may not be valid under a different presenter
  }
  function handlePresenterChange(id) {
    setPresenterId(id);
    setTraineeId(''); // the old trainee pick may not be valid under a different presenter
  }

  const meta = dateSetMeta(dateSetOption);

  async function submit() {
    if (!appointmentDate || !appointmentTime || !presenterId || !client.trim() || (!typeRecruit && !typeSale)) {
      setErr('Fill in the appointment date/time, presenter, client/recruit, and whether it\'s a recruit and/or sale.');
      return;
    }
    if (clientEmail.trim() && !isValidEmail(clientEmail)) { setErr("The client's email address doesn't look right."); return; }
    const inviteBoxOpen = !editing || sendUpdate;
    const extras = inviteBoxOpen ? extraEmails.split(/[\s,;]+/).map(e => e.trim()).filter(Boolean) : [];
    const badExtra = extras.find(e => !isValidEmail(e));
    if (badExtra) { setErr(`"${badExtra}" doesn't look like an email address.`); return; }
    setErr('');
    // Stop a double-booking before it's ever saved: does the presenter
    // already have an appointment at this exact date/time, or have they
    // blocked it out via My Schedule? Skipped if the date/time/presenter
    // haven't actually changed on an edit — re-checking against yourself
    // would otherwise always "conflict".
    const unchanged = editing && editing.appointmentDate === appointmentDate && editing.appointmentTime === appointmentTime && editing.presenterId === presenterId;
    if (!unchanged) {
      setChecking(true);
      const result = await checkAppointmentConflict(presenterId, appointmentDate, appointmentTime, timezone, editing?.id);
      setChecking(false);
      if (result.conflict) {
        const presenterName = presenterOptions.find(p => p.id === presenterId)?.display_name || 'This presenter';
        setErr(result.reason === 'unavailable'
          ? `${presenterName} has blocked out this time${result.label ? ` (${result.label})` : ''} — pick another time.`
          : `${presenterName} already has an appointment at this exact time — pick another time.`);
        return;
      }
    }
    let presentationType = null, presentationTypeSecondary = null;
    if (typeRecruit && typeSale) { presentationType = 'recruit'; presentationTypeSecondary = 'sale'; }
    else if (typeRecruit) { presentationType = 'recruit'; }
    else if (typeSale) { presentationType = 'sale'; }
    const presenterName = presenterOptions.find(p => p.id === presenterId)?.display_name || user.displayName || '';
    const traineeName = traineeId ? (traineeOptions.find(p => p.id === traineeId)?.display_name || '') : '';
    const inviteEmails = editing && !sendUpdate ? [] : [...new Set([
      ...(inviteClient && clientEmail.trim() ? [clientEmail.trim()] : []),
      ...(inviteMe && user.email ? [user.email] : []),
      ...extras,
    ].map(e => e.toLowerCase()))].slice(0, 8);
    onSubmit({
      dateSetOption, appointmentDate, appointmentTime, timezone,
      presenter: presenterName, presenterId, trainee: traineeName, traineeId,
      client, clientEmail, notes, presentationType, presentationTypeSecondary, zoomHostId: zoomHostId || null,
      inviteEmails,
    });
  }
  function handleKeyDown(e) {
    // Enter in the client-name box is how you pick a prospect suggestion,
    // so it never submits the form from there.
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && !e.target.getAttribute('list')) { e.preventDefault(); submit(); }
  }

  return (
    <div className="tr-card tr-form" onKeyDown={handleKeyDown}>
      <h3 className="tr-h3">{editing ? 'Edit appointment' : 'Log a new appointment'}</h3>
      {editing?.status === 'needs_reschedule' && (
        <div className="tr-badge tr-badge-weekday tr-form-section">
          This one needs to be rescheduled — saving will count it toward this week's batch as a new entry, and clear its old follow-up status.
        </div>
      )}
      {!editing && zoomHostOptions.length > 0 && (
        <label className="tr-field tr-field-wide tr-form-section">
          <span>Which manager is presenting? (uses their connected Zoom to create the meeting — picking one sets them as Presenter below)</span>
          <select value={zoomHostId} onChange={e => handleZoomHostChange(e.target.value)}>
            <option value="">None — I'm presenting, or one of my downline is</option>
            {uplineNonSelf.length > 0 && (
              <optgroup label="Your upline">
                {uplineNonSelf.map(m => (
                  <option key={m.id} value={m.id}>{m.display_name}{zoomManagers.some(z => z.id === m.id) ? ' (Zoom connected)' : ''}</option>
                ))}
              </optgroup>
            )}
            {otherZoomManagers.length > 0 && (
              <optgroup label="Other managers with Zoom connected">
                {otherZoomManagers.map(m => (
                  <option key={m.id} value={m.id}>{m.display_name} (Zoom connected)</option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
      )}
      <div className="tr-field tr-field-wide tr-form-section">
        <span>Recruit and/or sale presentation? (pick both if it's both)</span>
        <TypeChoice recruit={typeRecruit} sale={typeSale} onToggleRecruit={() => setTypeRecruit(v => !v)} onToggleSale={() => setTypeSale(v => !v)} />
      </div>
      <div className="tr-form-grid">
        <label className="tr-field">
          <span>Appointment date</span>
          <input type="date" value={appointmentDate} onChange={e => setAppointmentDate(e.target.value)} onClick={openPicker} />
        </label>
        <label className="tr-field">
          <span>Appointment time</span>
          <input type="time" value={appointmentTime} onChange={e => setAppointmentTime(e.target.value)} onClick={openPicker} />
        </label>
        <label className="tr-field">
          <span>Presenter</span>
          {lockedToZoomHost ? (
            <div className="tr-locked-value">{presenterOptions[0]?.display_name}</div>
          ) : (
            <select value={presenterId} onChange={e => handlePresenterChange(e.target.value)}>
              {presenterOptions.map(p => <option key={p.id} value={p.id}>{p.display_name}{p.id === user.id ? ' (you)' : ''}</option>)}
            </select>
          )}
        </label>
        <label className="tr-field">
          <span>Client / recruit</span>
          <input value={client} onChange={e => handleClientChange(e.target.value)} placeholder="Who is being presented to" list="tr-prospect-name-options" autoComplete="off" />
          <datalist id="tr-prospect-name-options">
            {myProspects.map(p => <option key={p.id} value={`${p.firstName} ${p.lastName}`} />)}
          </datalist>
        </label>
        <label className="tr-field">
          <span>Client email (optional)</span>
          <input type="email" inputMode="email" autoComplete="off" autoCapitalize="none" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="name@example.com" />
        </label>
        <label className="tr-field">
          <span>Date set</span>
          <select value={dateSetOption} onChange={e => setDateSetOption(e.target.value)}>
            {DATE_SET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <div className="tr-field">
          <span>Counts toward</span>
          <div className={`tr-badge tr-badge-${meta.category}`}>
            {meta.batchLabel} ({meta.target}) · week of {parseDate(weekMonday).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        </div>
        <label className="tr-field">
          <span>Time zone</span>
          <select value={timezone} onChange={e => setTimezone(e.target.value)}>
            {timezoneOptions.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
          </select>
        </label>
        {traineeOptions.length > 0 && (
          <label className="tr-field">
            <span>Trainee (optional)</span>
            <select value={traineeId} onChange={e => setTraineeId(e.target.value)}>
              <option value="">— none —</option>
              {traineeOptions.map(p => <option key={p.id} value={p.id}>{p.display_name}{p.id === user.id ? ' (you)' : ''}</option>)}
            </select>
          </label>
        )}
        <label className="tr-field tr-field-wide">
          <span>Notes (optional)</span>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything else worth noting" />
        </label>
      </div>
      {editing && (
        <label className="tr-checkbox-field" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={sendUpdate} onChange={e => setSendUpdate(e.target.checked)} />
          <span>Email an updated invite (new time / Zoom link){editing.inviteSentAt ? ` — last sent ${new Date(editing.inviteSentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</span>
        </label>
      )}
      {(!editing || sendUpdate) && (
        <div className="tr-invite-box">
          <div className="tr-invite-title">{editing ? 'Send the updated invite to' : 'Email the meeting invite to'}</div>
          <p className="tr-empty" style={{ margin: '0 0 4px', fontSize: 12.5 }}>
            {editing && editing.inviteMethod === 'google'
              ? 'The first invite came from Google Calendar; this update is emailed separately by PaceLedger.'
              : 'Includes the Zoom link whenever a meeting is created. Sent from your Google Calendar if it’s connected, otherwise by PaceLedger.'}
          </p>
          <label className="tr-checkbox-field">
            <input type="checkbox" checked={inviteClient && !!clientEmail.trim()} disabled={!clientEmail.trim()} onChange={e => setInviteClient(e.target.checked)} />
            <span>The client{clientEmail.trim() ? ` (${clientEmail.trim()})` : ' — add their email above'}</span>
          </label>
          <label className="tr-checkbox-field">
            <input type="checkbox" checked={inviteMe} onChange={e => setInviteMe(e.target.checked)} />
            <span>Me{user.email ? ` (${user.email})` : ''}</span>
          </label>
          <label className="tr-field" style={{ marginTop: 6 }}>
            <span>Anyone else? (optional — separate emails with commas)</span>
            <input type="text" inputMode="email" autoComplete="off" autoCapitalize="none" value={extraEmails} onChange={e => setExtraEmails(e.target.value)} placeholder="spouse@example.com, manager@example.com" />
          </label>
        </div>
      )}
      {err && <div className="tr-error">{err}</div>}
      <div className="tr-form-actions">
        <button type="button" className="tr-btn tr-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="tr-btn tr-btn-brass" onClick={submit} disabled={saving || checking}>{checking ? 'Checking…' : saving ? 'Saving…' : editing ? 'Save changes' : 'Save appointment'}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// advisor capabilities — available to advisors, managers, and super admins
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// open requirements — sold policies tracked through to issue
// ---------------------------------------------------------------------
export function PolicyCard({ policy, canEdit, currentUser, onSaved }) {
  const [effectiveDate, setEffectiveDate] = useState(policy.effectiveDate || '');
  const [requirementsCompleted, setRequirementsCompleted] = useState(!!policy.requirementsCompleted);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  useEffect(() => {
    fetchPolicyNotes(policy.id).then(n => { setNotes(n); setNotesLoading(false); });
  }, [policy.id]);

  async function saveEffectiveDate(value) {
    setSaving(true);
    const ok = await updatePolicyFields(policy.id, { effectiveDate: value });
    setSaving(false);
    if (ok) onSaved();
  }
  async function toggleRequirements() {
    const next = !requirementsCompleted;
    setRequirementsCompleted(next);
    setSaving(true);
    const ok = await updatePolicyFields(policy.id, { requirementsCompleted: next });
    setSaving(false);
    if (ok) onSaved(); else setRequirementsCompleted(!next);
  }
  async function submitNote() {
    if (!newNote.trim()) return;
    setNoteSaving(true);
    const res = await addPolicyNote(policy.id, currentUser.id, currentUser.displayName, newNote);
    setNoteSaving(false);
    if (res.ok) { setNotes(prev => [...prev, res.record]); setNewNote(''); }
  }
  function handleNoteKeyDown(e) { if (e.key === 'Enter') { e.preventDefault(); submitNote(); } }

  return (
    <div className="tr-card tr-policy-card">
      <div className="tr-policy-head">
        <div>
          <strong>{policy.client}</strong>
          <div className="tr-note">{policy.presenter} · Sold {fmtApptDateTime(policy)}</div>
        </div>
        <div className="tr-mono tr-policy-premium">{fmtCurrency(policy.targetPremium)}</div>
      </div>
      <div className="tr-policy-fields">
        <label className="tr-field">
          <span>Effective date</span>
          {canEdit ? (
            <input type="date" value={effectiveDate} onChange={e => { setEffectiveDate(e.target.value); saveEffectiveDate(e.target.value); }} onClick={openPicker} />
          ) : (
            <div className="tr-empty">{effectiveDate ? fmtDisplayDate(effectiveDate) : 'Not set yet'}</div>
          )}
        </label>
        <div className="tr-field">
          <span>Requirements</span>
          {canEdit ? (
            <button type="button" className={`tr-btn tr-btn-sm ${requirementsCompleted ? 'tr-btn-brass' : 'tr-btn-ghost'}`} onClick={toggleRequirements} disabled={saving}>
              {requirementsCompleted ? '✓ Completed' : 'Mark complete'}
            </button>
          ) : (
            <div className="tr-empty">{requirementsCompleted ? '✓ Completed' : 'Pending'}</div>
          )}
        </div>
      </div>
      <div className="tr-policy-notes">
        <h4 className="tr-h4">Notes</h4>
        {notesLoading ? <SkelBlock w="100%" h="40px" /> : notes.length === 0 ? (
          <p className="tr-empty">No notes yet.</p>
        ) : (
          <div className="tr-notes-list">
            {notes.map(n => (
              <div key={n.id} className="tr-note-item">
                <div className="tr-note-meta">{n.author_name} · {new Date(n.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                <div>{n.note}</div>
              </div>
            ))}
          </div>
        )}
        <div className="tr-note-add" onKeyDown={handleNoteKeyDown}>
          <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note about open requirements…" />
          <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={submitNote} disabled={noteSaving || !newNote.trim()}>Add</button>
        </div>
      </div>
    </div>
  );
}

export function OpenRequirementsBody({ view, user }) {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setPolicies(await fetchSoldPolicies());
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const filtered = policies
    .filter(p => (view === 'issued' ? isPolicyIssued(p) : !isPolicyIssued(p)))
    .sort((a, b) => b.appointmentDate.localeCompare(a.appointmentDate));

  return (
    <>
      <div className="tr-row-head">
        <h2 className="tr-section-title">{view === 'issued' ? 'Issued Premium' : 'Sold Premium'}</h2>
        <button className="tr-btn tr-btn-ghost tr-btn-sm" onClick={refresh}>Refresh</button>
      </div>
      <p className="tr-subtitle">
        {view === 'issued'
          ? 'Policies whose effective date has arrived and all requirements are complete.'
          : 'Sold policies still waiting on their effective date and/or open requirements.'}
      </p>
      {loading ? <SkeletonCards count={2} /> : filtered.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">Nothing here yet.</p></div>
      ) : (
        filtered.map(p => (
          <PolicyCard key={p.id} policy={p} canEdit={p.userId === user.id} currentUser={user} onSaved={refresh} />
        ))
      )}
    </>
  );
}

export function MyAppointmentsBody({ user, prefillData, onPrefillConsumed }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weekMonday, setWeekMonday] = useState(weekStartOf(todayStr()));
  const [showForm, setShowForm] = useState(false);
  const [editingAppt, setEditingAppt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [followUpTarget, setFollowUpTarget] = useState(null);
  const [followUpSaving, setFollowUpSaving] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'recruit' | 'sale'
  const [zoomStatus, setZoomStatus] = useState({ connected: false });
  const [zoomConnecting, setZoomConnecting] = useState(false);
  // null = the normal "This week" view; otherwise one of STATUS_OPTIONS.value
  // (including '' for "No status") — a real sub-page, not a nested widget.
  const [statusView, setStatusView] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingPrefillData, setPendingPrefillData] = useState(null);

  // Arriving here from a prospect's "Log appointment" button — jump
  // straight to the weekly view with the log form open, pre-filled with
  // the prospect's name, notes, and recruit/sale leaning. The data is
  // captured into local state immediately, since the parent clears its
  // own copy right after handing it off — AppointmentForm reads from
  // this local copy instead, which isn't affected by that.
  useEffect(() => {
    if (prefillData) {
      setStatusView(null);
      setEditingAppt(null);
      setPendingPrefillData(prefillData);
      setShowForm(true);
      onPrefillConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillData]);

  const searchResults = searchQuery.trim()
    ? appointments
        .filter(a => a.client.toLowerCase().includes(searchQuery.trim().toLowerCase()))
        .sort((a, b) => (b.appointmentDate + b.appointmentTime).localeCompare(a.appointmentDate + a.appointmentTime))
    : [];
  const [showHistory, setShowHistory] = useState(false);
  const [notice, setNotice] = useState(null); // { kind: 'ok' | 'warn', text }
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 9000);
    return () => clearTimeout(t);
  }, [notice]);

  function handleExportAppointments() {
    const rows = [['Date set', 'Appointment date', 'Time', 'Timezone', 'Presenter', 'Trainee', 'Client', 'Client email', 'Type', 'Status', 'Notes', 'Zoom link']];
    appointments
      .slice()
      .sort((a, b) => (b.appointmentDate + b.appointmentTime).localeCompare(a.appointmentDate + a.appointmentTime))
      .forEach(a => {
        rows.push([
          a.dateSetOption, a.appointmentDate, a.appointmentTime, a.appointmentTimezone,
          a.presenter, a.trainee, a.client, a.clientEmail, typeLabel(a), a.status, a.notes, a.zoomUrl,
        ]);
      });
    downloadCSV(`my-appointments-${todayStr()}.csv`, rows);
  }

  function byType(list) {
    if (typeFilter === 'all') return list;
    if (typeFilter === 'recruit') return list.filter(isRecruitType);
    if (typeFilter === 'sale') return list.filter(isSaleType);
    return list;
  }

  const refresh = useCallback(async () => {
    setLoading(true);
    const [apptList, zStatus] = await Promise.all([fetchMyAppointments(user.id), fetchZoomConnectionStatus()]);
    setAppointments(apptList);
    setZoomStatus(zStatus);
    setLoading(false);
  }, [user.id]);
  // Any add, edit, reschedule or delete re-syncs phone reminders (app only).
  const apptsLoadedOnce = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (!apptsLoadedOnce.current) { apptsLoadedOnce.current = true; return; }
    window.dispatchEvent(new Event('paceledger:appointments-changed'));
  }, [appointments, loading]);

  async function handleZoomConnect() {
    if (isNativeApp()) {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      await openInBrowserSheet(zoomOAuthUrl(data.session.access_token), () => refresh());
      return;
    }
    setZoomConnecting(true);
    await connectZoom();
  }
  async function handleZoomDisconnect() {
    const ok = await disconnectZoom();
    if (ok) setZoomStatus({ connected: false });
  }

  useEffect(() => { refresh(); }, [refresh]);

  const weekAppts = appointments
    .filter(a => a.weekOf === weekMonday && !a.isFollowUp)
    .sort((a, b) => (a.appointmentDate + a.appointmentTime).localeCompare(b.appointmentDate + b.appointmentTime));
  const groups = DATE_SET_OPTIONS.map(opt => ({
    option: opt,
    list: weekAppts.filter(a => a.dateSetOption === opt.value),
  }));
  // Auto-created follow-up appointments never count toward a batch — they
  // show here instead, sorted by when they'll actually happen, regardless
  // of which pace week is currently being viewed.
  const upcomingFollowUps = appointments
    .filter(a => a.isFollowUp && !isPastAppointment(a))
    .sort((a, b) => (a.appointmentDate + a.appointmentTime).localeCompare(b.appointmentDate + b.appointmentTime));

  const pastAppts = appointments.filter(isPastAppointment);
  const statusCounts = STATUS_OPTIONS.reduce((acc, opt) => {
    acc[opt.value] = pastAppts.filter(a => (a.status || '') === opt.value).length;
    return acc;
  }, {});
  const statusFiltered = statusView === null ? [] : pastAppts
    .filter(a => (a.status || '') === statusView)
    .sort((a, b) => (b.appointmentDate + b.appointmentTime).localeCompare(a.appointmentDate + a.appointmentTime));

  function closeForm() { setShowForm(false); setEditingAppt(null); setPendingPrefillData(null); }
  function openEdit(appt) { setEditingAppt(appt); setShowForm(true); }

  async function handleFormSubmit(form) {
    setSaving(true);
    setError('');
    if (editingAppt) {
      const isReschedule = editingAppt.status === 'needs_reschedule';
      const res = await updateAppointment(editingAppt.id, form, isReschedule);
      if (!res.ok) { setSaving(false); setError(res.error || 'Could not save. Try again.'); return; }
      let updatedRecord = res.record;
      if (form.inviteEmails && form.inviteEmails.length) {
        // Stays in "Saving…" until the email is out, so a second click
        // can't send it twice.
        const r = await sendAppointmentInviteEmail(updatedRecord.id, form.inviteEmails, true);
        if (r.sent) {
          updatedRecord = { ...updatedRecord, inviteeEmails: r.recipients || form.inviteEmails, inviteMethod: 'email', inviteSentAt: new Date().toISOString() };
          setNotice({ kind: 'ok', text: `Updated invite emailed to ${(r.recipients || form.inviteEmails).join(', ')}.` });
        } else {
          setNotice({ kind: 'warn', text: inviteFailureMessage(r.error, true) });
        }
      }
      setSaving(false);
      setAppointments(prev => prev.map(a => a.id === editingAppt.id ? updatedRecord : a));
      closeForm();
    } else {
      const res = await insertAppointment(user.id, { ...form, weekOf: weekMonday });
      if (!res.ok) { setSaving(false); setError(res.error || 'Could not save. Try again.'); return; }
      let record = res.record;
      // Create a real meeting if either the current user has Zoom connected,
      // or they picked a specific presenting manager's Zoom to use instead.
      if (zoomStatus.connected || form.zoomHostId) {
        const zoomRes = await createZoomMeeting({
          topic: `Meeting with ${form.client}`,
          startTime: `${form.appointmentDate}T${form.appointmentTime}:00`,
          durationMinutes: 30,
          timezone: form.timezone,
          hostUserId: form.zoomHostId,
        });
        if (zoomRes.connected && zoomRes.joinUrl) {
          const ok = await updateAppointmentZoomUrl(record.id, zoomRes.joinUrl);
          if (ok) record = { ...record, zoomUrl: zoomRes.joinUrl };
        } else if (zoomRes.error === 'reconnect_required' && !form.zoomHostId) {
          // Only clear my own connection status — a failure on a presenting
          // manager's account isn't something I need to reconnect.
          setZoomStatus({ connected: false });
        }
      }
      // Best-effort push to Google Calendar — the advisor's own, and the
      // presenting manager's too if their Zoom was used. Never blocks the
      // appointment from being saved even if this fails entirely (e.g.
      // neither side has reconnected to grant the newer write scope yet).
      const inviteEmails = form.inviteEmails || [];
      const google = await pushAppointmentToGoogleCalendar({
        title: `Meeting with ${form.client}`,
        description: record.zoomUrl ? `Join Zoom: ${record.zoomUrl}` : undefined,
        location: record.zoomUrl || undefined,
        attendees: inviteEmails,
        startDateTime: `${form.appointmentDate}T${form.appointmentTime}:00`,
        endDateTime: addMinutesToDateTime(form.appointmentDate, form.appointmentTime, 30),
        timezone: form.timezone,
        managerHostId: form.zoomHostId,
      });
      // Invites: Google Calendar emails everyone it can when it's connected.
      // Google never emails the calendar's owner (usually the advisor's own
      // "Me" address), so PaceLedger emails whoever Google didn't — or
      // everyone, when Google Calendar isn't connected.
      if (inviteEmails.length) {
        const norm = e => String(e).trim().toLowerCase();
        const byGoogle = google.ownPushed && Array.isArray(google.invited) ? google.invited.map(norm) : [];
        const byEmail = inviteEmails.filter(e => !byGoogle.includes(norm(e)));
        let emailed = [];
        let emailError = null;
        // Email first: send-appointment-invite refuses a second send within
        // a minute of invite_sent_at, which markInviteSent sets.
        if (byEmail.length) {
          const r = await sendAppointmentInviteEmail(record.id, byEmail);
          if (r.sent) emailed = r.recipients || byEmail;
          else emailError = r.error;
        }
        const reached = [...byGoogle, ...emailed];
        if (reached.length) {
          const method = byGoogle.length ? 'google' : 'email';
          if (byGoogle.length) await markInviteSent(record.id, reached, method);
          record = { ...record, inviteeEmails: reached, inviteMethod: method, inviteSentAt: new Date().toISOString() };
        }
        const zoomBit = record.zoomUrl ? ' with the Zoom link' : '';
        const parts = [];
        if (byGoogle.length) parts.push(`Google Calendar invite sent to ${byGoogle.join(', ')}`);
        if (emailed.length) parts.push(`invite emailed to ${emailed.join(', ')}`);
        if (emailError) {
          const missed = byEmail.filter(e => !emailed.map(norm).includes(norm(e)));
          const failText = inviteFailureMessage(emailError);
          setNotice({ kind: 'warn', text: parts.length ? `${parts.join('; ')}${zoomBit}. Not sent to ${missed.join(', ')}: ${failText}` : failText });
        } else if (parts.length) {
          const text = parts.join('; ');
          setNotice({ kind: 'ok', text: `${text.charAt(0).toUpperCase()}${text.slice(1)}${zoomBit}.` });
        }
      }
      setSaving(false);
      setAppointments(prev => [...prev, record]);
      closeForm();
    }
  }
  async function handleDelete(id) {
    const target = appointments.find(a => a.id === id);
    const label = target ? `the appointment with ${target.client}` : 'this appointment';
    if (!window.confirm(`Delete ${label}? This can't be undone.`)) return;
    const prev = appointments;
    setAppointments(appointments.filter(a => a.id !== id));
    const ok = await deleteAppointmentRow(id);
    if (!ok) setAppointments(prev);
  }
  async function handleSaveFollowUp(id, data) {
    setFollowUpSaving(true);
    const original = appointments.find(a => a.id === id);
    const res = await persistFollowUp(user, id, original, data);
    setFollowUpSaving(false);
    if (!res.ok) return;
    setAppointments(prev => applyFollowUpToList(prev, id, data, res.followUpTimezone, res.newAppt));
    setFollowUpTarget(null);
  }

  return (
    <div className="tr-appts-shell">
      <nav className="tr-appts-sidebar">
        <button
          type="button"
          className={`tr-sidebar-item tr-sidebar-item-week ${statusView === null ? 'tr-sidebar-item-active' : ''}`}
          onClick={() => setStatusView(null)}>
          <span>This week</span>
        </button>
        <div className="tr-sidebar-divider">Past appointments by status</div>
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value || 'none'} type="button"
            className={`tr-sidebar-item tr-sidebar-item-${opt.color} ${statusView === opt.value ? 'tr-sidebar-item-active' : ''}`}
            onClick={() => setStatusView(opt.value)}>
            <span>{opt.label}</span>
            <span className="tr-mono">{statusCounts[opt.value]}</span>
          </button>
        ))}
        <div className="tr-sidebar-divider">Open Requirements</div>
        <button
          type="button"
          className={`tr-sidebar-item tr-sidebar-item-amber ${statusView === SOLD_PREMIUM_VIEW ? 'tr-sidebar-item-active' : ''}`}
          onClick={() => setStatusView(SOLD_PREMIUM_VIEW)}>
          <span>Sold Premium</span>
        </button>
        <button
          type="button"
          className={`tr-sidebar-item tr-sidebar-item-green ${statusView === ISSUED_PREMIUM_VIEW ? 'tr-sidebar-item-active' : ''}`}
          onClick={() => setStatusView(ISSUED_PREMIUM_VIEW)}>
          <span>Issued Premium</span>
        </button>
      </nav>

      <div className="tr-appts-main">
        <PageHead title="My appointments">
          <button className="tr-btn tr-btn-brass" onClick={() => (showForm ? closeForm() : setShowForm(true))}>
            {showForm ? <><X size={16} /> Close</> : <><Plus size={16} /> Log appointment</>}
          </button>
        </PageHead>
        {error && <div className="tr-error">{error}</div>}
        {notice && <div className={notice.kind === 'ok' ? 'tr-flash' : 'tr-error'}>{notice.text}</div>}
        {showForm && (
          <AppointmentForm user={user} weekMonday={weekMonday} editing={editingAppt} prefillData={!editingAppt ? pendingPrefillData : null} onCancel={closeForm} onSubmit={handleFormSubmit} saving={saving} />
        )}
        <div className="tr-toolbar">
          <div className="tr-search-row">
            <Search size={15} className="tr-search-icon" />
            <input
              className="tr-search-input" type="text" placeholder="Search every appointment by name…"
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            {searchQuery && (
              <button type="button" className="tr-icon-btn" onClick={() => setSearchQuery('')} title="Clear search"><X size={15} /></button>
            )}
          </div>
          <div title="Filters the lists below. Your weekly pace always counts everything.">
            <TypeFilter value={typeFilter} onChange={setTypeFilter} />
          </div>
          <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={handleExportAppointments} disabled={appointments.length === 0} title="Download every appointment as a spreadsheet (CSV)">
            <Download size={14} /><span className="tr-hide-mobile"> Export</span>
          </button>
        </div>
        {searchQuery.trim() ? (
          <>
            <h2 className="tr-section-title">Search results for "{searchQuery.trim()}"</h2>
            <p className="tr-subtitle">Across every appointment you've ever logged, regardless of week.</p>
            {searchResults.length === 0 ? (
              <div className="tr-card"><p className="tr-empty">No matches.</p></div>
            ) : (
              <ApptGroup list={byType(searchResults)} onDelete={handleDelete} onFollowUp={setFollowUpTarget} onEdit={openEdit} empty="" />
            )}
          </>
        ) : statusView === null ? (
          <>
            <MyCoachingNotes userId={user.id} weekOf={weekMonday} />
            <ZoomConnect status={zoomStatus} connecting={zoomConnecting} onConnect={handleZoomConnect} onDisconnect={handleZoomDisconnect} />
            <PaceStrip
              header={<WeekNav weekMonday={weekMonday} onShift={d => setWeekMonday(shiftWeekStr(weekMonday, d))} onToday={() => setWeekMonday(weekStartOf(todayStr()))} />}
              groups={groups.map(g => ({ option: g.option, count: g.list.length, list: g.list }))} />
            {upcomingFollowUps.length > 0 && (
              <ApptGroup
                title={`Upcoming follow-ups (${upcomingFollowUps.length})`}
                list={byType(upcomingFollowUps)} onDelete={handleDelete} onFollowUp={setFollowUpTarget}
                onEdit={openEdit} empty="" />
            )}
            {loading ? <SkeletonRows count={5} /> : (() => {
              // Batches with something in them get a full table; the empty
              // ones collapse into a single line instead of a card each.
              const withItems = groups.filter(g => byType(g.list).length > 0);
              const emptyOnes = groups.filter(g => byType(g.list).length === 0);
              return (
                <>
                  {withItems.length === 0 && (
                    <div className="tr-card"><p className="tr-empty" style={{ margin: 0 }}>
                      No {typeFilter === 'all' ? '' : `${typeFilter} `}appointments set for this week yet — log one above, or start from a prospect.
                    </p></div>
                  )}
                  {withItems.map(g => (
                    <ApptGroup
                      key={g.option.value} hideSet
                      title={`${g.option.batchLabel} (${g.list.length}/${g.option.target})`}
                      list={byType(g.list)} onDelete={handleDelete} onFollowUp={setFollowUpTarget}
                      onEdit={openEdit} empty="" />
                  ))}
                  {withItems.length > 0 && emptyOnes.length > 0 && (
                    <p className="tr-empty tr-empty-batches">Nothing set yet: {emptyOnes.map(g => `${g.option.batchLabel} (0/${g.option.target})`).join(' · ')}</p>
                  )}
                </>
              );
            })()}
            <button type="button" className="tr-ov-link" style={{ alignSelf: 'flex-start' }} onClick={() => setShowHistory(h => !h)}>
              {showHistory ? 'Hide pace history' : 'Show pace history (last 6 weeks, streaks, best week)'}
            </button>
            {showHistory && (
              <>
                <PaceTrend appointments={appointments} currentWeekMonday={weekMonday} />
                <PersonalBests appointments={appointments} />
              </>
            )}
          </>
        ) : statusView === SOLD_PREMIUM_VIEW ? (
          <OpenRequirementsBody view="sold" user={user} />
        ) : statusView === ISSUED_PREMIUM_VIEW ? (
          <OpenRequirementsBody view="issued" user={user} />
        ) : (
          <>
            <h2 className="tr-section-title">{STATUS_OPTIONS.find(o => o.value === statusView)?.label}</h2>
            <p className="tr-subtitle">Every past appointment currently in this state.</p>
            {loading ? <SkeletonRows count={4} /> : byType(statusFiltered).length === 0 ? (
              <div className="tr-card"><p className="tr-empty">Nothing here.</p></div>
            ) : (
              <ApptGroup list={byType(statusFiltered)} onDelete={handleDelete} onFollowUp={setFollowUpTarget} onEdit={openEdit} empty="" />
            )}
          </>
        )}
        {followUpTarget && (
          <FollowUpModal
            appointment={followUpTarget}
            onClose={() => setFollowUpTarget(null)}
            onSave={handleSaveFollowUp}
            saving={followUpSaving} />
        )}
      </div>
    </div>
  );
}
