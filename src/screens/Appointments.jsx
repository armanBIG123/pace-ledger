// My Appointments: the weekly batches, the appointment form, outcomes and Open Requirements.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ClipboardCheck, Download, Link2, Pencil, Plus, Search, Trash2, UserPlus, X } from 'lucide-react';
import { supabase } from '../supabaseClient.js';
import { isNativeApp, openInBrowserSheet } from '../native.js';
import { computeDownline, computeUpline } from '../hierarchy.js';
import { checkAppointmentConflict } from '../schedule.js';
import { DATE_SET_OPTIONS, dateSetMeta, defaultDateSetOption } from '../lib/pace.js';
import { addMinutesToDateTime, detectTimezone, fmtApptDateTime, fmtDisplayDate, fmtFollowUpDateTime, parseDate, shiftWeekStr, timezoneOptionsWithDetected, todayStr, weekStartOf } from '../lib/dates.js';
import { downloadCSV, fmtCurrency, isValidEmail } from '../lib/format.js';
import { addPolicyNote, applyFollowUpToList, deleteAppointmentRow, fetchAppointmentsImPresenting, fetchMyAppointments, fetchPolicyNotes, fetchSoldPolicies, fetchZoomConnectedManagers, insertAppointment, inviteFailureMessage, isPastAppointment, isPolicyIssued, isRecruitType, isSaleType, ISSUED_PREMIUM_VIEW, markInviteSent, persistFollowUp, SOLD_PREMIUM_VIEW, STATUS_OPTIONS, typeLabel, updateAppointment, updatePolicyFields } from '../data/appointments.js';
import { ALL_CHARACTERISTICS, fetchMyProspects, insertProspect, LEANING_LABELS, normName, prospectLeaningKey, prospectNameKey, prospectTotalChecked } from '../data/prospects.js';
import { fetchOrgDirectory } from '../data/team.js';
import { connectZoom, createZoomMeeting, disconnectZoom, fetchZoomConnectionStatus, pushAppointmentToGoogleCalendar, sendAppointmentInviteEmail, updateAppointmentZoomUrl, zoomOAuthUrl } from '../data/integrations.js';
import { openPicker, PageHead, RefreshButton, Sheet, SkelBlock, SkeletonCards, SkeletonRows, StatusChip, TitleInfo, TypeBadge, TypeChoice, TypeFilter, useIsPhone, WeekNav } from '../components/ui.jsx';
import { MyCoachingNotes, PaceStrip, PaceTrend, PersonalBests } from '../components/pace.jsx';
import { ZoomConnect } from '../components/integrations.jsx';
import { FollowUpModal } from '../components/followUpModal.jsx';
import { appointmentTexts, CallButton, TextButton } from '../components/contact.jsx';
import { isValidPhone } from '../lib/phone.js';

export function ApptGroup({ title, list, onDelete, onFollowUp, onEdit, empty, hideSet, me = '' }) {
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
                      {a.zoomUrl || a.clientPhone ? (
                        <div className="tr-appt-links">
                          {a.zoomUrl ? <a href={a.zoomUrl} target="_blank" rel="noopener noreferrer" className="tr-note tr-link">Join Zoom</a> : null}
                          {a.clientPhone ? (
                            <span className="tr-appt-contact">
                              <CallButton phone={a.clientPhone} compact />
                              <TextButton phone={a.clientPhone} name={a.client} texts={appointmentTexts(a, me)} compact />
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {a.followUpAppointmentDate ? <div className="tr-note" style={{ marginTop: 2 }}>Follow-up: {fmtFollowUpDateTime(a)}</div> : null}
                      {a.inviteSentAt ? <div className="tr-note" style={{ marginTop: 2 }} title={(a.inviteeEmails || []).join(', ')}>Invite sent to {(a.inviteeEmails || []).length} {(a.inviteeEmails || []).length === 1 ? 'person' : 'people'}{a.inviteMethod === 'google' ? ' (Google)' : ''}</div> : null}
                      {a.notes ? <span className="tr-note"> — {a.notes}</span> : null}
                    </td>
                    <td className="td-presenter">{a.presentingFor
                      ? <><span className="tr-presenting-chip">You're presenting</span><div className="tr-note">set by {a.setByName || 'your team'}</div></>
                      : <><span className="tr-mobile-only">with </span>{a.presenter}</>}</td>
                    {showTrainee && <td className="td-trainee"><span className="tr-mobile-only">trainee </span>{a.trainee || '—'}</td>}
                    {onDelete && a.presentingFor && <td className="td-actions" />}
                    {onDelete && !a.presentingFor && (
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

export function AppointmentForm({ user, weekMonday, editing, prefillData, onCancel, onSubmit, saving, sheet = false }) {
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
  const [clientPhone, setClientPhone] = useState(editing?.clientPhone || prefillData?.clientPhone || '');
  // The person on your list this appointment is with. Picking a name from
  // your list links them; typing a different name unlinks.
  const [prospectId, setProspectId] = useState(editing?.prospectId || prefillData?.prospectId || '');
  // "Add them to your list" picked: saved as a new prospect along with this.
  const [addToList, setAddToList] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const clientInput = useRef(null);
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
  const [myProspects, setMyProspects] = useState([]);  // everyone on your list
  // Client email, date set, time zone, trainee, notes and invites fold away
  // (open when editing, since that's often why you're here).
  const [showMore, setShowMore] = useState(!!editing);
  const timezoneOptions = timezoneOptionsWithDetected();

  useEffect(() => {
    fetchZoomConnectedManagers().then(setZoomManagers);
    fetchOrgDirectory().then(setOrgDirectory);
    // Suggest names from your prospect list as you type the client name.
    fetchMyProspects(user.id).then(setMyProspects);
  }, [user.id]);

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
  const showCombo = menuOpen && !prospectId && !addToList && comboOptions.length > 0;
  const linked = prospectId ? myProspects.find(p => p.id === prospectId) : null;
  function pickOption(o) {
    if (!o) return;
    if (o.p) {
      setClient(`${o.p.firstName} ${o.p.lastName}`.trim());
      setProspectId(o.p.id);
      setAddToList(false);
      fillFrom(o.p);
    } else {
      setAddToList(true);
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
      setErr('Fill in the client, the date and time, the presenter, and whether it\'s a recruit, a sale or both.');
      return;
    }
    if (clientEmail.trim() && !isValidEmail(clientEmail)) { setShowMore(true); setErr("The client's email address doesn't look right."); return; }
    if (clientPhone.trim() && !isValidPhone(clientPhone)) { setShowMore(true); setErr("The client's phone number doesn't look right. Include the area code."); return; }
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
    // Typed a name that's on your list exactly once: link it, the same as
    // picking it.
    const sameName = myProspects.filter(p => prospectNameKey(p) === normName(client));
    const linkId = prospectId || (!addToList && sameName.length === 1 ? sameName[0].id : '');
    onSubmit({
      dateSetOption, appointmentDate, appointmentTime, timezone,
      presenter: presenterName, presenterId, trainee: traineeName, traineeId,
      client, clientEmail, clientPhone, notes, presentationType, presentationTypeSecondary, zoomHostId: zoomHostId || null,
      inviteEmails, prospectId: linkId, addToList: addToList && !linkId,
    });
  }
  function handleKeyDown(e) {
    // Enter in the client-name box is how you pick a name from your list,
    // so it never submits the form from there.
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target !== clientInput.current) { e.preventDefault(); submit(); }
  }

  const presenterShown = presenterOptions.find(p => p.id === presenterId)?.display_name || '';
  const traineePick = traineeOptions.find(p => p.id === traineeId);
  const traineeNote = !traineePick ? '' : traineePick.id === user.id ? "you're the trainee" : `${traineePick.display_name} sits in`;
  const title = editing ? 'Edit appointment' : 'Log an appointment';
  const saveLabel = checking ? 'Checking…' : saving ? 'Saving…' : editing ? 'Save changes' : 'Save appointment';

  const fields = (
    <>
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
          ) : addToList ? (
            <div className="tr-combo-linked tr-combo-linked-new">
              <UserPlus size={14} aria-hidden="true" />
              <span><strong>{client.trim() || 'They'}</strong> will be added to your list when you save</span>
              <button type="button" className="tr-link-btn" onClick={() => setAddToList(false)}>Undo</button>
            </div>
          ) : null}
        </div>
        <div className="tr-field tr-field-wide">
          <span>Recruit, sale or both</span>
          <TypeChoice recruit={typeRecruit} sale={typeSale} onToggleRecruit={() => setTypeRecruit(v => !v)} onToggleSale={() => setTypeSale(v => !v)} />
        </div>
        <label className="tr-field tr-field-half">
          <span>Date</span>
          <input type="date" value={appointmentDate} onChange={e => setAppointmentDate(e.target.value)} onClick={openPicker} />
        </label>
        <label className="tr-field tr-field-half">
          <span>Time</span>
          <input type="time" value={appointmentTime} onChange={e => setAppointmentTime(e.target.value)} onClick={openPicker} />
        </label>
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
      </div>

      <div className={`tr-form-more ${showMore ? 'tr-form-more-open' : ''}`}>
        <button type="button" className="tr-form-more-head" aria-expanded={showMore} onClick={() => setShowMore(v => !v)}>
          {showMore ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
          <strong>More options</strong>
          <span>Counts toward {meta.batchLabel}{traineeNote ? ` · ${traineeNote}` : ''} · client email and phone, time zone, notes, invites</span>
        </button>
        {showMore && (
          <div className="tr-form-more-body">
            <div className="tr-form-grid">
              <label className="tr-field">
                <span>Client email</span>
                <input type="email" inputMode="email" autoComplete="off" autoCapitalize="none" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="name@example.com" />
              </label>
              <label className="tr-field">
                <span>Client phone</span>
                <input type="tel" inputMode="tel" autoComplete="off" value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="(214) 555-0187" />
              </label>
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
            {editing && (
              <label className="tr-checkbox-field" style={{ marginTop: 12 }}>
                <input type="checkbox" checked={sendUpdate} onChange={e => setSendUpdate(e.target.checked)} />
                <span>Email an updated invite (new time or Zoom link){editing.inviteSentAt ? `. Last sent ${new Date(editing.inviteSentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</span>
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
          {err && <div className="tr-error">{err}</div>}
          <button type="button" className="tr-btn tr-btn-brass" onClick={submit} disabled={saving || checking}>{saveLabel}</button>
        </div>
      </Sheet>
    );
  }
  return (
    <div className="tr-card tr-form" onKeyDown={handleKeyDown}>
      <h3 className="tr-h3">{title}</h3>
      {fields}
      {err && <div className="tr-error">{err}</div>}
      <div className="tr-form-actions">
        <button type="button" className="tr-btn tr-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="tr-btn tr-btn-brass" onClick={submit} disabled={saving || checking}>{saveLabel}</button>
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
          <div className="tr-note">{policy.presenter ? `${policy.presenter} · ` : ''}Submitted {fmtApptDateTime(policy)}</div>
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

// mineOnly: just your own policies (Pipeline → Won; your team's are in Team
// → Track Production). head: false when the screen around it has a title.
export function OpenRequirementsBody({ view, user, mineOnly = false, head = true }) {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setPolicies(await fetchSoldPolicies());
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const filtered = policies
    .filter(p => !mineOnly || p.userId === user.id)
    .filter(p => (view === 'issued' ? isPolicyIssued(p) : !isPolicyIssued(p)))
    .sort((a, b) => b.appointmentDate.localeCompare(a.appointmentDate));

  return (
    <>
      {head && <div className="tr-row-head tr-screen-head">
        <TitleInfo className="tr-section-title" title={view === 'issued' ? 'Issued Premium' : 'Submitted Premium'}
          info={view === 'issued'
            ? 'Policies whose effective date has arrived and all requirements are complete.'
            : 'Submitted policies still waiting on their effective date and/or open requirements. Your leaders can see these too and add notes to help get them issued.'} />
        <RefreshButton onClick={refresh} />
      </div>}
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

// section "booked" (Pipeline → Booked): just the week's appointments and the
// form; past ones by status live in Pipeline → Log outcome, and Submitted /
// Issued Premium in Pipeline → Won.
export function MyAppointmentsBody({ user, prefillData, onPrefillConsumed, initialIntent, onIntentConsumed, cameFrom = null, onReturn, section = null }) {
  const isPhone = useIsPhone();
  const [appointments, setAppointments] = useState([]);
  const [presenting, setPresenting] = useState([]); // set by someone else, you're presenting: counts toward your pace
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
  const fromElsewhere = useRef(false);
  useEffect(() => {
    if (prefillData) {
      fromElsewhere.current = !!cameFrom;
      setStatusView(null);
      setEditingAppt(null);
      setPendingPrefillData(prefillData);
      setShowForm(true);
      onPrefillConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillData]);

  // Arriving from search: show that client's appointments.
  useEffect(() => {
    if (!initialIntent) return;
    if (typeof initialIntent === 'object' && initialIntent.search) {
      setStatusView(null);
      setShowForm(false);
      setEditingAppt(null);
      setSearchQuery(initialIntent.search);
    }
    if (onIntentConsumed) onIntentConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIntent]);

  const searchDigits = searchQuery.replace(/\D/g, '');
  const searchResults = searchQuery.trim()
    ? appointments
        .filter(a => a.client.toLowerCase().includes(searchQuery.trim().toLowerCase())
          || (searchDigits.length >= 3 && (a.clientPhone || '').replace(/\D/g, '').includes(searchDigits)))
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
    const rows = [['Date set', 'Appointment date', 'Time', 'Timezone', 'Presenter', 'Trainee', 'Client', 'Client email', 'Client phone', 'Type', 'Status', 'Notes', 'Zoom link']];
    appointments
      .slice()
      .sort((a, b) => (b.appointmentDate + b.appointmentTime).localeCompare(a.appointmentDate + a.appointmentTime))
      .forEach(a => {
        rows.push([
          a.dateSetOption, a.appointmentDate, a.appointmentTime, a.appointmentTimezone,
          a.presenter, a.trainee, a.client, a.clientEmail, a.clientPhone, typeLabel(a), a.status, a.notes, a.zoomUrl,
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
    const [apptList, zStatus, pres] = await Promise.all([fetchMyAppointments(user.id), fetchZoomConnectionStatus(), fetchAppointmentsImPresenting(user.id).catch(() => [])]);
    setAppointments(apptList);
    setPresenting(pres);
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

  // This week's pace: the ones you set plus the ones you're presenting for your team.
  const weekAppts = [...appointments, ...presenting]
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

  function closeForm() { setShowForm(false); setEditingAppt(null); setPendingPrefillData(null); fromElsewhere.current = false; }
  // Cancel on a form you opened from another screen takes you back there.
  function cancelForm() { const back = fromElsewhere.current; closeForm(); if (back && onReturn) onReturn(); }
  function openEdit(appt) { fromElsewhere.current = false; setEditingAppt(appt); setShowForm(true); }
  function openNewForm() { fromElsewhere.current = false; setShowForm(true); }

  async function handleFormSubmit(input) {
    setSaving(true);
    setError('');
    let form = input;
    // "Add them to your list": the new prospect first, so the appointment
    // is linked to them from the start.
    let listNote = '';
    if (input.addToList && !input.prospectId) {
      const words = input.client.trim().split(/\s+/);
      const blank = { firstName: words[0] || '', lastName: words.slice(1).join(' '), age: '', relationshipStrength: 5, notes: '', source: '', email: input.clientEmail, phone: input.clientPhone };
      ALL_CHARACTERISTICS.forEach(c => { blank[c.key] = false; });
      const pr = await insertProspect(user.id, blank);
      if (pr.ok) form = { ...input, prospectId: pr.record.id };
      else listNote = `Couldn't add ${input.client.trim()} to your list. Add them from Pipeline → Names.`;
    }
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
      if (listNote) setNotice({ kind: 'warn', text: listNote });
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
      if (listNote) setNotice({ kind: 'warn', text: listNote });
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
  function handleRescheduled(rec, info) {
    setAppointments(prev => prev.map(a => (a.id === rec.id ? rec : a)));
    setFollowUpTarget(null);
    setNotice({ kind: info && info.emailed === false ? 'warn' : 'ok', text: `Moved ${rec.client} to ${fmtApptDateTime(rec)}.${info && info.emailed === true ? ' Updated invite emailed.' : info && info.emailed === false ? " The updated invite didn't send; edit the appointment to try again." : ''}` });
  }

  return (
    <div className="tr-appts-shell">
      {section === 'booked' ? null : <nav className="tr-appts-sidebar">
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
          <span>Submitted Premium</span>
        </button>
        <button
          type="button"
          className={`tr-sidebar-item tr-sidebar-item-green ${statusView === ISSUED_PREMIUM_VIEW ? 'tr-sidebar-item-active' : ''}`}
          onClick={() => setStatusView(ISSUED_PREMIUM_VIEW)}>
          <span>Issued Premium</span>
        </button>
      </nav>}

      <div className="tr-appts-main">
        <PageHead title={section === 'booked' ? 'Appointments' : 'My appointments'}>
          <button className="tr-btn tr-btn-brass" onClick={() => (showForm ? closeForm() : openNewForm())}>
            {showForm ? <><X size={16} /> Close</> : <><Plus size={16} /> Log appointment</>}
          </button>
        </PageHead>
        {error && <div className="tr-error">{error}</div>}
        {notice && <div className={notice.kind === 'ok' ? 'tr-flash' : 'tr-error'}>{notice.text}</div>}
        {showForm && (
          <AppointmentForm user={user} weekMonday={weekMonday} editing={editingAppt} prefillData={!editingAppt ? pendingPrefillData : null} onCancel={cancelForm} onSubmit={handleFormSubmit} saving={saving} sheet={isPhone} />
        )}
        <div className="tr-toolbar">
          <div className="tr-search-row">
            <Search size={15} className="tr-search-icon" />
            <input
              className="tr-search-input" type="text" placeholder="Search every appointment by name or phone…"
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
              <ApptGroup me={user.displayName} list={byType(searchResults)} onDelete={handleDelete} onFollowUp={setFollowUpTarget} onEdit={openEdit} empty="" />
            )}
          </>
        ) : statusView === null ? (
          <>
            <MyCoachingNotes userId={user.id} weekOf={weekMonday} />
            <ZoomConnect status={zoomStatus} connecting={zoomConnecting} onConnect={handleZoomConnect} onDisconnect={handleZoomDisconnect} />
            <PaceStrip
              header={<WeekNav weekMonday={weekMonday} onShift={d => setWeekMonday(shiftWeekStr(weekMonday, d))} onToday={() => setWeekMonday(weekStartOf(todayStr()))} />}
              groups={groups.map(g => ({ option: g.option, count: g.list.length, list: g.list }))}
              note={(() => { const n = weekAppts.filter(a => a.presentingFor).length; return n ? `Includes ${n} you're presenting for your team.` : ''; })()} />
            {upcomingFollowUps.length > 0 && (
              <ApptGroup
                title={`Upcoming follow-ups (${upcomingFollowUps.length})`} me={user.displayName}
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
                      key={g.option.value} hideSet me={user.displayName}
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
                <PaceTrend appointments={[...appointments, ...presenting]} currentWeekMonday={weekMonday} />
                <PersonalBests appointments={[...appointments, ...presenting]} />
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
              <ApptGroup me={user.displayName} list={byType(statusFiltered)} onDelete={handleDelete} onFollowUp={setFollowUpTarget} onEdit={openEdit} empty="" />
            )}
          </>
        )}
        {followUpTarget && (
          <FollowUpModal
            appointment={followUpTarget}
            onClose={() => setFollowUpTarget(null)}
            onSave={handleSaveFollowUp}
            onRescheduled={handleRescheduled}
            saving={followUpSaving} />
        )}
      </div>
    </div>
  );
}
