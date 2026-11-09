// The appointment form (new or editing) and saving it: also used by the window
// that opens when you tap an appointment anywhere (components/appointmentEditor.jsx).
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Link2, Trash2, UserPlus, X } from 'lucide-react';
import { computeDownline, computeUpline } from '../../hierarchy.js';
import { checkAppointmentConflict } from '../../schedule.js';
import { DATE_SET_OPTIONS, dateSetMeta, defaultDateSetOption } from '../../lib/pace.js';
import { addMinutesToTime, detectTimezone, durationLabel, fmtClockRange, minutesBetweenTimes, parseDate, timezoneOptionsWithDetected } from '../../lib/dates.js';
import { isValidEmail } from '../../lib/format.js';
import { DEFAULT_APPT_MINUTES, fetchZoomConnectedManagers, inviteFailureMessage, isPastAppointment, isRecruitType, isSaleType, updateAppointment, updateTeamAppointment } from '../../data/appointments.js';
import { ALL_CHARACTERISTICS, fetchMyProspects, insertProspect, LEANING_LABELS, normName, prospectLeaningKey, prospectNameKey, prospectTotalChecked } from '../../data/prospects.js';
import { fetchOrgDirectory } from '../../data/team.js';
import { sendAppointmentInviteEmail } from '../../data/integrations.js';
import { Modal, openPicker, Sheet, TypeChoice } from '../../components/ui.jsx';
import { IntakeStatusRow } from '../../components/intakePanel.jsx';
import { isValidPhone } from '../../lib/phone.js';
import { OpenTimes } from '../../components/openTimes.jsx';

// sheet: slides up from the bottom (phones). modal: a window over the
// screen (opened from Calendar, Today or Follow-up on a computer).
// Otherwise it sits in the page (Pipeline). When editing from one of those
// windows, onDelete adds Delete, onLogOutcome offers "Log how it went" once
// it's over, and saveError shows why saving failed.
// bookedBy: editing someone else's appointment (you're who they report to,
// or a super admin): their name. No suggestions from your own list and no
// invites, and the presenters come from their upline, not yours.
export function AppointmentForm({ user, weekMonday, editing, prefillData, onCancel, onSubmit, saving, sheet = false, modal = false, saveError = '', onDelete = null, onLogOutcome = null, bookedBy = '' }) {
  const forOther = !!editing && editing.userId !== user.id;
  const ownerId = forOther ? editing.userId : user.id;
  const [dateSetOption, setDateSetOption] = useState(editing?.dateSetOption || defaultDateSetOption());
  const [appointmentDate, setAppointmentDate] = useState(editing?.appointmentDate || prefillData?.appointmentDate || '');
  const [appointmentTime, setAppointmentTime] = useState(editing?.appointmentTime || '');
  // When it ends. It follows the start time, keeping the same length.
  const [endTime, setEndTime] = useState(editing?.appointmentTime ? addMinutesToTime(editing.appointmentTime, editing.durationMinutes || DEFAULT_APPT_MINUTES) : '');
  const [timezone, setTimezone] = useState(editing?.appointmentTimezone || detectTimezone());
  const [presenterId, setPresenterId] = useState(editing?.presenterId || user.managerId || user.id);
  const [traineeId, setTraineeId] = useState(editing?.traineeId || (!editing && user.managerId ? user.id : ''));
  const [orgDirectory, setOrgDirectory] = useState([]);
  const [client, setClient] = useState(editing?.client || prefillData?.client || '');
  const [notes, setNotes] = useState(editing?.notes || prefillData?.notes || '');
  const [clientEmail, setClientEmail] = useState(editing?.clientEmail || prefillData?.clientEmail || '');
  const [clientPhone, setClientPhone] = useState(editing?.clientPhone || prefillData?.clientPhone || '');
  // The person on your list this appointment is with. Picking a name from
  // your list links them; typing a different name unlinks.
  const [prospectId, setProspectId] = useState(editing?.prospectId || prefillData?.prospectId || '');
  // "Add them to your list" picked: saved as a new prospect along with this.
  const [addToList, setAddToList] = useState(false);
  // A new name is added to your list on its own (every appointment belongs
  // to someone's profile in Clients) unless you say not to.
  const [keepOffList, setKeepOffList] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const clientInput = useRef(null);
  // Who gets the Zoom link emailed when a NEW appointment is saved.
  const [inviteClient, setInviteClient] = useState(true);
  const [inviteMe, setInviteMe] = useState(true);
  const [extraEmails, setExtraEmails] = useState('');
  const [sendUpdate, setSendUpdate] = useState(false);
  // New appointment: send the client their intake form once it's saved.
  const [sendIntake, setSendIntake] = useState(false);
  const [typeRecruit, setTypeRecruit] = useState(editing ? isRecruitType(editing) : !!prefillData?.typeRecruit);
  const [typeSale, setTypeSale] = useState(editing ? isSaleType(editing) : !!prefillData?.typeSale);
  const [zoomHostId, setZoomHostId] = useState(!editing && user.managerId ? user.managerId : '');
  const [err, setErr] = useState('');
  const [checking, setChecking] = useState(false);
  const [zoomManagers, setZoomManagers] = useState([]);
  const [myProspects, setMyProspects] = useState([]);  // everyone on your list
  // Date set, time zone, trainee, notes and invites fold away,
  // so the form stays short (they open by themselves if one needs fixing).
  const [showMore, setShowMore] = useState(false);
  const timezoneOptions = timezoneOptionsWithDetected();

  useEffect(() => {
    fetchZoomConnectedManagers().then(setZoomManagers);
    fetchOrgDirectory().then(setOrgDirectory);
    // Suggest names from your prospect list as you type the client name.
    if (!forOther) fetchMyProspects(user.id).then(setMyProspects);
  }, [user.id, forOther]);

  // Fills in recruit/sale from how they scored (unless you've already
  // chosen a type yourself), and their notes, email and phone if empty.
  function fillFrom(match) {
    if (!typeRecruit && !typeSale) {
      const leaning = prospectLeaningKey(match);
      if (leaning === 'recruit' || leaning === 'both') setTypeRecruit(true);
      if (leaning === 'sale' || leaning === 'both') setTypeSale(true);
      if (!notes && match.notes) setNotes(match.notes);
    }
    if (!clientEmail && match.email) setClientEmail(match.email);
    if (!clientPhone && match.phone) setClientPhone(match.phone);
  }
  function handleClientChange(value) {
    setClient(value);
    if (forOther) return; // their list isn't yours to link or add to
    if (prospectId) setProspectId('');
    setMenuOpen(true);
    setActiveIdx(-1);
    // Typing a name exactly as it is on your list fills in their details,
    // the same as picking it.
    const exact = myProspects.filter(p => prospectNameKey(p) === normName(value));
    if (exact.length) fillFrom(exact.find(p => !p.markedRecruited && !p.markedSold) || exact[0]);
  }
  // Names from your list that match what's typed (each word can be the
  // start of a first or last name), people you haven't won yet first.
  const typed = normName(client);
  const typedWords = typed.split(' ').filter(Boolean);
  const nameMatches = !typed ? [] : myProspects
    .filter(p => { const words = prospectNameKey(p).split(' '); return typedWords.every(t => words.some(w => w.startsWith(t))); })
    .sort((a, b) => (prospectNameKey(b) === typed) - (prospectNameKey(a) === typed)
      || (!!(a.markedSold || a.markedRecruited) - !!(b.markedSold || b.markedRecruited))
      || String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 5);
  const typedIsOnList = myProspects.some(p => prospectNameKey(p) === typed);
  const comboOptions = [...nameMatches.map(p => ({ key: p.id, p })), ...(typed.length >= 2 && !typedIsOnList ? [{ key: 'add' }] : [])];
  const showCombo = !forOther && menuOpen && !prospectId && !addToList && comboOptions.length > 0;
  const linked = prospectId ? myProspects.find(p => p.id === prospectId) : null;
  // Booking someone who isn't on your list adds them when you save.
  const autoAdd = !editing && !forOther && !prospectId && !addToList && !keepOffList && typed.length >= 2 && !typedIsOnList;
  function pickOption(o) {
    if (!o) return;
    if (o.p) {
      setClient(`${o.p.firstName} ${o.p.lastName}`.trim());
      setProspectId(o.p.id);
      setAddToList(false);
      fillFrom(o.p);
    } else {
      setAddToList(true);
      setKeepOffList(false);
    }
    setMenuOpen(false);
    setActiveIdx(-1);
  }
  function handleClientKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!comboOptions.length || prospectId || addToList) return;
      e.preventDefault();
      setMenuOpen(true);
      const n = comboOptions.length;
      setActiveIdx(i => (e.key === 'ArrowDown' ? (i + 1) % n : (i <= 0 ? n - 1 : i - 1)));
    } else if (e.key === 'Enter') {
      // Enter picks the highlighted name; it never saves the form from here.
      e.preventDefault();
      e.stopPropagation();
      if (showCombo && activeIdx >= 0) pickOption(comboOptions[activeIdx]);
    } else if (e.key === 'Escape' && showCombo) {
      e.stopPropagation();
      setMenuOpen(false);
    }
  }
  function changeLink() {
    setProspectId('');
    setAddToList(false);
    setMenuOpen(true);
    if (clientInput.current) clientInput.current.focus();
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
  const uplineOptions = computeUpline(ownerId, orgDirectory);
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
  // Editing keeps whoever presents it now in the list, even when they're
  // not in the upline (a Zoom-connected manager from another team).
  const editPresenters = editing && editing.presenterId && !uplineOptions.some(p => p.id === editing.presenterId)
    ? [...uplineOptions, { id: editing.presenterId, display_name: editing.presenter || 'Current presenter' }]
    : uplineOptions;
  const presenterOptions = editing ? editPresenters : (lockedToZoomHost ? zoomHostOptions.filter(p => p.id === zoomHostId) : downlineOptions);
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
  const duration = appointmentTime && endTime ? minutesBetweenTimes(appointmentTime, endTime) : 0;

  // A time picked from the presenter's open times: their presentation
  // length sets when it ends.
  function pickOpenTime({ day, time, minutes }) {
    setAppointmentDate(day);
    setAppointmentTime(time);
    setEndTime(addMinutesToTime(time, minutes || DEFAULT_APPT_MINUTES));
    setErr('');
  }

  function handleStartChange(value) {
    if (value) {
      const was = appointmentTime && endTime ? minutesBetweenTimes(appointmentTime, endTime) : 0;
      const len = was >= 5 && was <= 720 ? was : DEFAULT_APPT_MINUTES;
      if (endTime || !appointmentTime) setEndTime(addMinutesToTime(value, len));
    }
    setAppointmentTime(value);
  }

  async function submit() {
    if (!appointmentDate || !appointmentTime || !presenterId || !client.trim() || (!typeRecruit && !typeSale)) {
      setErr('Fill in the client, the date and time, the presenter, and whether it\'s a recruit, a sale or both.');
      return;
    }
    if (!endTime) { setErr('Add when it ends.'); return; }
    // Up to 12 hours; an end before the start would mean it runs overnight.
    if (duration < 5 || duration > 720) { setErr('The end time needs to be after the start time.'); return; }
    if (clientEmail.trim() && !isValidEmail(clientEmail)) { setErr("The client's email address doesn't look right."); return; }
    if (clientPhone.trim() && !isValidPhone(clientPhone)) { setErr("The client's phone number doesn't look right. Include the area code."); return; }
    const inviteBoxOpen = !editing || sendUpdate;
    const extras = inviteBoxOpen ? extraEmails.split(/[\s,;]+/).map(e => e.trim()).filter(Boolean) : [];
    const badExtra = extras.find(e => !isValidEmail(e));
    if (badExtra) { setShowMore(true); setErr(`"${badExtra}" doesn't look like an email address.`); return; }
    setErr('');
    // Stop a double-booking before it's ever saved: does the presenter
    // already have an appointment at this exact date/time, or have they
    // blocked it out via My Schedule? Skipped if the date/time/presenter
    // haven't actually changed on an edit — re-checking against yourself
    // would otherwise always "conflict".
    const unchanged = editing && editing.appointmentDate === appointmentDate && editing.appointmentTime === appointmentTime && editing.presenterId === presenterId
      && editing.durationMinutes === duration && (editing.appointmentTimezone || timezone) === timezone;
    if (!unchanged) {
      setChecking(true);
      const result = await checkAppointmentConflict(presenterId, appointmentDate, appointmentTime, timezone, editing?.id, duration);
      setChecking(false);
      if (result.conflict) {
        const me = presenterId === user.id;
        const presenterName = presenterOptions.find(p => p.id === presenterId)?.display_name || 'This presenter';
        // When they're busy, if you're allowed to see their calendar.
        const busy = result.starts_at && result.ends_at ? fmtClockRange(new Date(result.starts_at), new Date(result.ends_at), false) : '';
        setErr(result.reason === 'unavailable'
          ? `${me ? 'You have' : `${presenterName} has`} blocked out ${busy || 'this time'}${result.label ? ` (${result.label})` : ''}. Pick another time.`
          : busy
            ? `${me ? "You're" : `${presenterName} is`} already booked ${busy}. Pick a time that doesn't overlap it.`
            : `${me ? 'You already have' : `${presenterName} already has`} an appointment then. Pick another time.`);
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
    // Typed a name that's on your list exactly once: link it, the same as
    // picking it.
    const sameName = myProspects.filter(p => prospectNameKey(p) === normName(client));
    const linkId = prospectId || (!addToList && sameName.length === 1 ? sameName[0].id : '');
    const adding = (addToList || (!editing && !forOther && !keepOffList && sameName.length === 0 && normName(client).length >= 2)) && !linkId;
    onSubmit({
      dateSetOption, appointmentDate, appointmentTime, timezone, durationMinutes: duration,
      presenter: presenterName, presenterId, trainee: traineeName, traineeId,
      client, clientEmail, clientPhone, notes, presentationType, presentationTypeSecondary, zoomHostId: zoomHostId || null,
      inviteEmails, prospectId: linkId, addToList: adding,
      sendIntake: !editing && !forOther && sendIntake,
    });
  }
  function handleKeyDown(e) {
    // Enter in the client-name box is how you pick a name from your list,
    // so it never submits the form from there.
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target !== clientInput.current) { e.preventDefault(); submit(); }
  }

  const presenterShown = presenterOptions.find(p => p.id === presenterId)?.display_name || '';
  // Someone else presenting: their open times show above the date and time.
  const showOpenTimes = !!presenterId && presenterId !== user.id;
  const presenterIsLeader = uplineIds.has(presenterId) || presenterId === zoomHostId || zoomManagers.some(z => z.id === presenterId);
  const traineePick = traineeOptions.find(p => p.id === traineeId);
  const traineeNote = !traineePick ? '' : traineePick.id === user.id ? "you're the trainee" : `${traineePick.display_name} sits in`;
  const title = editing ? 'Edit appointment' : 'Log an appointment';
  const saveLabel = checking ? 'Checking…' : saving ? 'Saving…' : editing ? 'Save changes' : 'Save appointment';
  const shownErr = err || saveError;

  const firstOf = n => String(n || '').trim().split(/\s+/)[0] || 'They';
  const fields = (
    <>
      {forOther && (
        <div className="tr-appt-other tr-form-section">
          You're changing <strong>{bookedBy || 'their'}</strong>{bookedBy ? '’s' : ''} appointment: the time and the details. {firstOf(bookedBy)} sees the change right away; how it went stays theirs to log.
        </div>
      )}
      {editing && onLogOutcome && isPastAppointment(editing) && !editing.followUpCompletedAt && (
        <div className="tr-appt-over tr-form-section">
          <span>This one is over and nothing's logged yet.</span>
          <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={onLogOutcome}>Log how it went</button>
        </div>
      )}
      {editing && !forOther && <IntakeStatusRow user={user} appointment={editing} />}
      {editing?.status === 'needs_reschedule' && (
        <div className="tr-badge tr-badge-weekday tr-form-section">
          This one needs to be rescheduled. Saving counts it toward this week's batch as a new entry and clears its old follow-up status.
        </div>
      )}
      <div className="tr-form-grid">
        <div className="tr-field tr-field-wide tr-combo">
          <label htmlFor="tr-client-input">Client</label>
          <input id="tr-client-input" ref={clientInput} value={client} onChange={e => handleClientChange(e.target.value)} placeholder="Who you're presenting to" autoComplete="off"
            role="combobox" aria-autocomplete="list" aria-expanded={showCombo} aria-controls="tr-client-options"
            aria-activedescendant={showCombo && activeIdx >= 0 ? `tr-client-opt-${comboOptions[activeIdx].key}` : undefined}
            onKeyDown={handleClientKeyDown} onFocus={() => setMenuOpen(true)} onBlur={() => setMenuOpen(false)} />
          {showCombo && (
            <ul className="tr-combo-menu" id="tr-client-options" role="listbox" aria-label="People on your list">
              {comboOptions.map((o, i) => (
                <li key={o.key} id={`tr-client-opt-${o.key}`} role="option" aria-selected={i === activeIdx}
                  className={`tr-combo-opt ${i === activeIdx ? 'tr-combo-opt-on' : ''} ${o.p ? '' : 'tr-combo-add'}`}
                  onMouseDown={e => e.preventDefault()} onClick={() => pickOption(o)}>
                  {o.p ? (
                    <>
                      <span className="tr-combo-avatar" aria-hidden="true">{`${(o.p.firstName || '?')[0]}${(o.p.lastName || '')[0] || ''}`.toUpperCase()}</span>
                      <span className="tr-combo-text">
                        <strong>{o.p.firstName} {o.p.lastName}</strong>
                        <span>{o.p.markedSold ? 'Sold' : o.p.markedRecruited ? 'Recruited' : 'On your list'} · {prospectTotalChecked(o.p) > 0 ? `${LEANING_LABELS[prospectLeaningKey(o.p)]} ${prospectTotalChecked(o.p)}/9` : 'Not scored'}{o.p.createdAt ? ` · added ${new Date(o.p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="tr-combo-avatar tr-combo-avatar-add" aria-hidden="true"><UserPlus size={15} /></span>
                      <span className="tr-combo-text">
                        <strong>Add "{client.trim()}" to your list</strong>
                        <span>Saves them as a new prospect and links this appointment</span>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {linked ? (
            <div className="tr-combo-linked">
              <Link2 size={14} aria-hidden="true" />
              <span>Linked to <strong>{linked.firstName} {linked.lastName}</strong> on your list</span>
              <button type="button" className="tr-link-btn" onClick={changeLink}>Change</button>
            </div>
          ) : addToList || (autoAdd && !showCombo) ? (
            <div className="tr-combo-linked tr-combo-linked-new">
              <UserPlus size={14} aria-hidden="true" />
              <span><strong>{client.trim() || 'They'}</strong> will be added to your list when you save</span>
              <button type="button" className="tr-link-btn" onClick={() => { setAddToList(false); setKeepOffList(true); }}>Don't add</button>
            </div>
          ) : null}
        </div>
        {/* Their phone and email power Call, Text, the invite and the intake
            form, so they're right here (picking someone from your list fills
            them in). */}
        <label className="tr-field">
          <span>Client phone</span>
          <input type="tel" inputMode="tel" autoComplete="off" value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="(214) 555-0187" />
        </label>
        <label className="tr-field">
          <span>Client email</span>
          <input type="email" inputMode="email" autoComplete="off" autoCapitalize="none" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="name@example.com" />
        </label>
        {!editing && !forOther && (
          <label className="tr-checkbox-field tr-field-wide tr-intake-check">
            <input type="checkbox" checked={sendIntake} onChange={e => setSendIntake(e.target.checked)} />
            <span>Send them the client intake form<small className="tr-field-hint">{clientEmail.trim() ? `Emailed to ${clientEmail.trim()} when you save.` : 'After saving you can text it or copy the link (or add their email above and it goes by email).'}</small></span>
          </label>
        )}
        <div className="tr-field tr-field-wide">
          <span>Recruit, sale or both</span>
          <TypeChoice recruit={typeRecruit} sale={typeSale} onToggleRecruit={() => setTypeRecruit(v => !v)} onToggleSale={() => setTypeSale(v => !v)} />
        </div>
        {!editing && zoomHostOptions.length > 0 && (
          <label className={`tr-field ${lockedToZoomHost ? 'tr-field-wide' : ''}`}>
            <span>Presenting manager</span>
            <select value={zoomHostId} onChange={e => handleZoomHostChange(e.target.value)}>
              <option value="">None: me or my downline</option>
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
            {lockedToZoomHost ? <small className="tr-field-hint">{presenterShown || 'They'} present{presenterShown ? 's' : ''}, and their Zoom makes the meeting link.</small> : null}
          </label>
        )}
        {!lockedToZoomHost && (
          <label className="tr-field">
            <span>Presenter</span>
            <select value={presenterId} onChange={e => handlePresenterChange(e.target.value)}>
              {presenterOptions.map(p => <option key={p.id} value={p.id}>{p.display_name}{p.id === user.id ? ' (you)' : ''}</option>)}
            </select>
          </label>
        )}
        {showOpenTimes && (
          <OpenTimes presenterId={presenterId} presenterName={presenterShown} timezone={timezone} excludeId={editing?.id || null}
            selectedDate={appointmentDate} selectedTime={appointmentTime} durationMinutes={duration}
            onPick={pickOpenTime} refreshKey={`${err}|${saveError}`} nudgeIfNoHours={presenterIsLeader} />
        )}
        <div className="tr-appt-when">
          <label className="tr-field tr-appt-when-date">
            <span>Date</span>
            <input type="date" value={appointmentDate} onChange={e => setAppointmentDate(e.target.value)} onClick={openPicker} />
          </label>
          <label className="tr-field">
            <span>Starts</span>
            <input type="time" value={appointmentTime} onChange={e => handleStartChange(e.target.value)} onClick={openPicker} />
          </label>
          <label className="tr-field">
            <span>Ends{duration >= 5 && duration <= 720 ? <em className="tr-appt-len">{durationLabel(duration)}</em> : null}</span>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} onClick={openPicker} />
          </label>
        </div>
      </div>

      <div className={`tr-form-more ${showMore ? 'tr-form-more-open' : ''}`}>
        <button type="button" className="tr-form-more-head" aria-expanded={showMore} onClick={() => setShowMore(v => !v)}>
          {showMore ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
          <strong>More options</strong>
          <span>Counts toward {meta.batchLabel}{traineeNote ? ` · ${traineeNote}` : ''} · time zone, notes, invites</span>
        </button>
        {showMore && (
          <div className="tr-form-more-body">
            <div className="tr-form-grid">
              <label className="tr-field">
                <span>Date set</span>
                <select value={dateSetOption} onChange={e => setDateSetOption(e.target.value)}>
                  {DATE_SET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <small className="tr-field-hint">Counts toward {meta.batchLabel} ({meta.target}), week of {parseDate(weekMonday).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small>
              </label>
              <label className="tr-field">
                <span>Time zone</span>
                <select value={timezone} onChange={e => setTimezone(e.target.value)}>
                  {timezoneOptions.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                </select>
              </label>
              {traineeOptions.length > 0 && (
                <label className="tr-field">
                  <span>Trainee</span>
                  <select value={traineeId} onChange={e => setTraineeId(e.target.value)}>
                    <option value="">None</option>
                    {traineeOptions.map(p => <option key={p.id} value={p.id}>{p.display_name}{p.id === user.id ? ' (you)' : ''}</option>)}
                  </select>
                </label>
              )}
              <label className="tr-field tr-field-wide">
                <span>Notes</span>
                <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything worth noting" />
              </label>
            </div>
            {editing && !forOther && (
              <label className="tr-checkbox-field" style={{ marginTop: 12 }}>
                <input type="checkbox" checked={sendUpdate} onChange={e => setSendUpdate(e.target.checked)} />
                <span>Email an updated invite (new time or Zoom link){editing.inviteSentAt ? `. Last sent ${new Date(editing.inviteSentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</span>
              </label>
            )}
            {(!editing || (sendUpdate && !forOther)) && (
              <div className="tr-invite-box">
                <div className="tr-invite-title">{editing ? 'Send the updated invite to' : 'Email the meeting invite to'}</div>
                <p className="tr-empty" style={{ margin: '0 0 4px', fontSize: 12.5 }}>
                  {editing && editing.inviteMethod === 'google'
                    ? 'The first invite came from Google Calendar; this update is emailed separately by PaceLedger.'
                    : 'Includes the Zoom link whenever a meeting is created. Sent from your Google Calendar if it’s connected, otherwise by PaceLedger.'}
                </p>
                <label className="tr-checkbox-field">
                  <input type="checkbox" checked={inviteClient && !!clientEmail.trim()} disabled={!clientEmail.trim()} onChange={e => setInviteClient(e.target.checked)} />
                  <span>The client{clientEmail.trim() ? ` (${clientEmail.trim()})` : ' (add their email above)'}</span>
                </label>
                <label className="tr-checkbox-field">
                  <input type="checkbox" checked={inviteMe} onChange={e => setInviteMe(e.target.checked)} />
                  <span>Me{user.email ? ` (${user.email})` : ''}</span>
                </label>
                <label className="tr-field" style={{ marginTop: 6 }}>
                  <span>Anyone else? (separate emails with commas)</span>
                  <input type="text" inputMode="email" autoComplete="off" autoCapitalize="none" value={extraEmails} onChange={e => setExtraEmails(e.target.value)} placeholder="spouse@example.com" />
                </label>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );

  const deleteBtn = onDelete ? (
    <button type="button" className="tr-btn tr-btn-ghost tr-appt-delete" onClick={onDelete} disabled={saving || checking}>
      <Trash2 size={15} aria-hidden="true" /> Delete
    </button>
  ) : null;

  // On a phone it slides up as a sheet, with Save always in reach.
  if (sheet) {
    return (
      <Sheet labelledBy="tr-apptform-title" onClose={onCancel}>
        <div className="tr-fsheet-head">
          <h3 className="tr-h3" id="tr-apptform-title">{title}</h3>
          <button type="button" className="tr-icon-btn tr-fsheet-close" onClick={onCancel} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="tr-fsheet-body" onKeyDown={handleKeyDown}>{fields}</div>
        <div className="tr-fsheet-actions">
          {shownErr && <div className="tr-error">{shownErr}</div>}
          <button type="button" className="tr-btn tr-btn-brass" onClick={submit} disabled={saving || checking}>{saveLabel}</button>
          {onDelete ? <button type="button" className="tr-link-btn tr-appt-delete-link" onClick={onDelete} disabled={saving || checking}>Delete this appointment</button> : null}
        </div>
      </Sheet>
    );
  }
  if (modal) {
    return (
      // The title and the buttons stay put; the fields scroll between them.
      <Modal onClose={onCancel} labelledBy="tr-apptform-title" className="tr-modal-form">
        <div className="tr-modal-head">
          <h3 className="tr-h3" id="tr-apptform-title">{title}</h3>
          <button type="button" className="tr-icon-btn" onClick={onCancel} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="tr-modal-body" onKeyDown={handleKeyDown}>{fields}</div>
        <div className="tr-modal-foot">
          {shownErr && <div className="tr-error">{shownErr}</div>}
          <div className="tr-form-actions">
            {deleteBtn}
            <button type="button" className="tr-btn tr-btn-ghost" onClick={onCancel}>Cancel</button>
            <button type="button" className="tr-btn tr-btn-brass" onClick={submit} disabled={saving || checking}>{saveLabel}</button>
          </div>
        </div>
      </Modal>
    );
  }
  return (
    <div className="tr-card tr-form" onKeyDown={handleKeyDown}>
      <h3 className="tr-h3">{title}</h3>
      {fields}
      {shownErr && <div className="tr-error">{shownErr}</div>}
      <div className="tr-form-actions">
        {deleteBtn}
        <button type="button" className="tr-btn tr-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="tr-btn tr-btn-brass" onClick={submit} disabled={saving || checking}>{saveLabel}</button>
      </div>
    </div>
  );
}
// "Add them to your list" on the form: the new prospect is saved first, so
// the appointment is linked to them from the start.
export async function addToListFirst(user, input) {
  if (!input.addToList || input.prospectId) return { form: input, listNote: '' };
  const words = input.client.trim().split(/\s+/);
  const blank = { firstName: words[0] || '', lastName: words.slice(1).join(' '), age: '', relationshipStrength: 5, notes: '', source: '', email: input.clientEmail, phone: input.clientPhone };
  ALL_CHARACTERISTICS.forEach(c => { blank[c.key] = false; });
  const pr = await insertProspect(user.id, blank);
  if (pr.ok) return { form: { ...input, prospectId: pr.record.id }, listNote: '' };
  return { form: input, listNote: `Couldn't add ${input.client.trim()} to your list. Add them from their profile in Clients.` };
}

// Saves changes to one of your appointments, from Pipeline or from the
// window that opens when you tap an appointment on Calendar, Today or
// Follow-up. Emails the updated invite if that was ticked.
// Returns { ok, record, notice } or { ok: false, error }.
export async function saveAppointmentChanges(user, editing, input) {
  // Someone else's (you're who they report to, or a super admin): just the
  // time and details, no list or invites of yours.
  if (editing.userId !== user.id) {
    const res = await updateTeamAppointment(editing.id, input, editing.status === 'needs_reschedule');
    return res.ok ? { ok: true, record: res.record, notice: null } : { ok: false, error: res.error };
  }
  const { form, listNote } = await addToListFirst(user, input);
  const res = await updateAppointment(editing.id, form, editing.status === 'needs_reschedule');
  if (!res.ok) return { ok: false, error: res.error || 'Could not save. Try again.' };
  let record = res.record;
  let notice = null;
  if (form.inviteEmails && form.inviteEmails.length) {
    const r = await sendAppointmentInviteEmail(record.id, form.inviteEmails, true);
    if (r.sent) {
      record = { ...record, inviteeEmails: r.recipients || form.inviteEmails, inviteMethod: 'email', inviteSentAt: new Date().toISOString() };
      notice = { kind: 'ok', text: `Updated invite emailed to ${(r.recipients || form.inviteEmails).join(', ')}.` };
    } else {
      notice = { kind: 'warn', text: inviteFailureMessage(r.error, true) };
    }
  }
  if (listNote) notice = { kind: 'warn', text: listNote };
  return { ok: true, record, notice };
}
