// Calendar: month and list views, trainings and manager availability.
import { useCallback, useEffect, useState } from 'react';
import { Ban, CalendarClock, CalendarDays, ChevronLeft, ChevronRight, GraduationCap, Plus, Trash2, Video, X } from 'lucide-react';
import { isNativeApp, openInBrowserSheet, PUBLIC_SITE_URL } from '../native.js';
import { createScheduleBlock, deleteScheduleBlock, deleteScheduleBlockSeries, fetchScheduleBlocksInRange } from '../schedule.js';
import { addDays, addMinutesToTime, apptEndClock, apptLocalDate, apptLocalTimeKey, buildMonthGrid, detectTimezone, durationLabel, fmtApptDateTime, fmtDate, fmtDisplayDate, fmtTime, minutesBetweenTimes, monthStartOf, parseDate, shiftMonth, timezoneOptionsWithDetected, todayStr, trainingEndClock, trainingLocalDate, trainingLocalTimeKey } from '../lib/dates.js';
import { fetchAppointmentsInRange, isRecruitType, isSaleType, typeLabel } from '../data/appointments.js';
import { createTraining, deleteTraining, deleteTrainingSeries, fetchTrainingsInRange } from '../data/trainings.js';
import { fetchTeamMembers, seesTeam } from '../data/team.js';
import { connectGoogleCalendar, disconnectGoogleCalendar, fetchGoogleConnectionStatus, fetchGoogleEvents, googleEventTimeKey } from '../data/integrations.js';
import { Modal, openPicker, PageHead, RefreshButton, SkeletonCalendar, useIsPhone } from '../components/ui.jsx';
import { applyAppointmentEdit, openAppointment, useAppointmentEdits } from '../components/appointmentPanel.jsx';
import { GoogleCalendarConnect } from '../components/integrations.jsx';
import { isAdmin } from '../lib/roles.js';
import { PresentingHoursCard } from '../components/presentingHours.jsx';
import { fetchMyPresentingHours } from '../data/availability.js';

// ---------------------------------------------------------------------
// trainings — org-wide announcements, visible to everyone regardless of
// role or reporting structure, posted by super admins only
// ---------------------------------------------------------------------
// The form for posting a training; opened from the Calendar's "New training"
// button. onClose: hide it.
export function TrainingPostCard({ user, onPosted, onClose }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [timezone, setTimezone] = useState(detectTimezone());
  const [zoomUrl, setZoomUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [repeatUntil, setRepeatUntil] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const timezoneOptions = timezoneOptionsWithDetected();

  const length = time && endTime ? minutesBetweenTimes(time, endTime) : 0;
  // The end follows the start, keeping the same length (an hour to begin with).
  function changeStart(value) {
    if (value) {
      const was = time && endTime ? minutesBetweenTimes(time, endTime) : 0;
      if (endTime || !time) setEndTime(addMinutesToTime(value, was >= 5 && was <= 720 ? was : 60));
    }
    setTime(value);
  }
  async function submit() {
    if (!title.trim() || !date || !time) { setErr('Fill in the title, date, and time.'); return; }
    if (!endTime || length < 5 || length > 720) { setErr('The end time needs to be after the start time.'); return; }
    if (recurring && (!repeatUntil || repeatUntil < date)) { setErr('Pick a "repeat until" date on or after the first training date.'); return; }
    setSaving(true); setErr('');
    const res = await createTraining({
      title: title.trim(), date, time, durationMinutes: length, timezone, zoomUrl: zoomUrl.trim(), notes: notes.trim(),
      userId: user.id, userName: user.displayName, recurring, repeatUntil: recurring ? repeatUntil : null,
    });
    setSaving(false);
    if (!res.ok) { setErr(res.error || 'Could not post. Try again.'); return; }
    setTitle(''); setDate(''); setTime(''); setEndTime(''); setZoomUrl(''); setNotes(''); setRecurring(false); setRepeatUntil('');
    res.records.forEach(onPosted);
    onClose();
  }

  return (
    <div className="tr-card tr-training-post">
      <div className="tr-row-head" style={{ marginBottom: 14 }}>
        <h3 className="tr-h3" style={{ margin: 0 }}><GraduationCap size={16} aria-hidden="true" /> Post a training</h3>
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onClose}>Cancel</button>
      </div>
      <div className="tr-form-grid">
        <label className="tr-field tr-field-wide">
          <span>Title</span>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. New Product Training" />
        </label>
        <div className="tr-appt-when">
          <label className="tr-field tr-appt-when-date">
            <span>Date</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} onClick={openPicker} />
          </label>
          <label className="tr-field">
            <span>Starts</span>
            <input type="time" value={time} onChange={e => changeStart(e.target.value)} onClick={openPicker} />
          </label>
          <label className="tr-field">
            <span>Ends{length >= 5 && length <= 720 ? <em className="tr-appt-len">{durationLabel(length)}</em> : null}</span>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} onClick={openPicker} />
          </label>
        </div>
        <label className="tr-field">
          <span>Time zone</span>
          <select value={timezone} onChange={e => setTimezone(e.target.value)}>
            {timezoneOptions.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
          </select>
        </label>
        <label className="tr-field">
          <span>Zoom link (optional)</span>
          <input value={zoomUrl} onChange={e => setZoomUrl(e.target.value)} placeholder="https://zoom.us/j/..." />
        </label>
        <label className="tr-field tr-field-wide">
          <span>Notes (optional)</span>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything else worth noting" />
        </label>
        <label className="tr-field tr-field-wide tr-checkbox-field">
          <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} />
          <span>Repeat weekly (same day of week and time)</span>
        </label>
        {recurring && (
          <label className="tr-field">
            <span>Repeat until</span>
            <input type="date" value={repeatUntil} onChange={e => setRepeatUntil(e.target.value)} min={date || undefined} onClick={openPicker} />
          </label>
        )}
      </div>
      {err && <div className="tr-error">{err}</div>}
      <div className="tr-form-actions">
        <button type="button" className="tr-btn tr-btn-brass" onClick={submit} disabled={saving}>{saving ? 'Posting…' : 'Post training'}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// my schedule — a manager blocking out times they're not free, so
// advisors booking an appointment with them as presenter can be stopped
// from double-booking that time (see checkAppointmentConflict).
// ---------------------------------------------------------------------
// The form for blocking out time; opened from the Calendar's "Block out
// time" button. onClose: hide it.
export function SchedulePostCard({ user, onPosted, onClose }) {
  const [label, setLabel] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [timezone, setTimezone] = useState(detectTimezone());
  const [recurring, setRecurring] = useState(false);
  const [repeatUntil, setRepeatUntil] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const timezoneOptions = timezoneOptionsWithDetected();

  async function submit() {
    if (!date || !startTime || !endTime) { setErr('Fill in the date, start time, and end time.'); return; }
    if (endTime <= startTime) { setErr('End time needs to be after the start time.'); return; }
    if (recurring && (!repeatUntil || repeatUntil < date)) { setErr('Pick a "repeat until" date on or after the first blocked date.'); return; }
    setSaving(true); setErr('');
    const res = await createScheduleBlock({
      userId: user.id, userName: user.displayName, date, startTime, endTime, label: label.trim(), timezone,
      recurring, repeatUntil: recurring ? repeatUntil : null,
    });
    setSaving(false);
    if (!res.ok) { setErr(res.error || 'Could not save. Try again.'); return; }
    setLabel(''); setDate(''); setStartTime(''); setEndTime(''); setRecurring(false); setRepeatUntil('');
    res.records.forEach(onPosted);
    onClose();
  }

  return (
    <div className="tr-card tr-training-post">
      <div className="tr-row-head" style={{ marginBottom: 14 }}>
        <h3 className="tr-h3" style={{ margin: 0 }}><Ban size={16} aria-hidden="true" /> Block out time</h3>
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onClose}>Cancel</button>
      </div>
      <div className="tr-form-grid">
        <label className="tr-field tr-field-wide">
          <span>Reason (optional)</span>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Team meeting, out of office" />
        </label>
        <label className="tr-field">
          <span>Date</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} onClick={openPicker} />
        </label>
        <label className="tr-field">
          <span>Start time</span>
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} onClick={openPicker} />
        </label>
        <label className="tr-field">
          <span>End time</span>
          <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} onClick={openPicker} />
        </label>
        <label className="tr-field">
          <span>Time zone</span>
          <select value={timezone} onChange={e => setTimezone(e.target.value)}>
            {timezoneOptions.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
          </select>
        </label>
        <label className="tr-field tr-field-wide tr-checkbox-field">
          <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} />
          <span>Repeat weekly (same day of week and times)</span>
        </label>
        {recurring && (
          <label className="tr-field">
            <span>Repeat until</span>
            <input type="date" value={repeatUntil} onChange={e => setRepeatUntil(e.target.value)} min={date || undefined} onClick={openPicker} />
          </label>
        )}
      </div>
      {err && <div className="tr-error">{err}</div>}
      <div className="tr-form-actions">
        <button type="button" className="tr-btn tr-btn-brass" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Block out time'}</button>
      </div>
    </div>
  );
}

export function calendarItems(appts, googleEvents, trainings, scheduleBlocks) {
  return [
    ...appts.map(a => ({ kind: 'appt', data: a, timeKey: apptLocalTimeKey(a) })),
    ...googleEvents.map(e => ({ kind: 'google', data: e, timeKey: googleEventTimeKey(e) })),
    ...trainings.map(t => ({ kind: 'training', data: t, timeKey: trainingLocalTimeKey(t) })),
    ...scheduleBlocks.map(b => ({ kind: 'block', data: b, timeKey: b.start_time.slice(0, 5) })),
  ].sort((a, b) => a.timeKey.localeCompare(b.timeKey));
}

// canOpen: an appointment, training or blocked-out time opens straight
// from the grid, and a Google event opens in Google Calendar (on a
// computer; on a phone they're dots, and a tap opens the day).
export function CalendarDay({ cell, appts, googleEvents, trainings, scheduleBlocks, highlightTrainings, onOpen, onOpenItem, canOpen = false }) {
  const isToday = cell.date === todayStr();
  const items = calendarItems(appts, googleEvents, trainings, scheduleBlocks);
  const visible = items.slice(0, 3);
  const extra = items.length - visible.length;
  const isHighlighted = highlightTrainings && trainings.length > 0;
  return (
    <div
      className={`tr-cal-day ${cell.inMonth ? '' : 'tr-cal-day-out'} ${isToday ? 'tr-cal-day-today' : ''} ${isHighlighted ? 'tr-cal-day-training-highlight' : ''}`}
      onClick={() => onOpen(cell.date, appts, googleEvents, trainings, scheduleBlocks)}>
      <div className="tr-cal-daynum"><span>{cell.dayNum}</span></div>
      <div className="tr-cal-appts">
        {visible.map(item => item.kind === 'appt' ? (() => {
          const cls = `tr-cal-appt ${isRecruitType(item.data) && isSaleType(item.data) ? 'tr-cal-appt-both' : isRecruitType(item.data) ? 'tr-cal-appt-recruit' : isSaleType(item.data) ? 'tr-cal-appt-sale' : ''}`;
          return canOpen ? (
            <button key={item.data.id} type="button" className={`${cls} tr-cal-appt-btn`} title={`${item.data.client} · ${fmtTime(item.timeKey)} to ${apptEndClock(item.data)}`}
              onClick={e => { e.stopPropagation(); openAppointment(item.data); }}>
              {fmtTime(item.timeKey)} {item.data.client}
            </button>
          ) : (
            <div key={item.data.id} className={cls}>{fmtTime(item.timeKey)} {item.data.client}</div>
          );
        })() : item.kind === 'training' || item.kind === 'block' ? (() => {
          const cls = `tr-cal-appt ${item.kind === 'training' ? 'tr-cal-appt-training' : 'tr-cal-appt-unavailable'}`;
          const inner = item.kind === 'training'
            ? <><GraduationCap size={9} /> {fmtTime(item.timeKey)} {item.data.title}</>
            : <><Ban size={9} /> {fmtTime(item.timeKey)} {item.data.user_name || 'Unavailable'}</>;
          return canOpen && onOpenItem
            ? <button key={item.data.id} type="button" className={`${cls} tr-cal-appt-btn`} onClick={e => { e.stopPropagation(); onOpenItem(item); }}>{inner}</button>
            : <div key={item.data.id} className={cls}>{inner}</div>;
        })() : (() => {
          const label = item.data.allDay ? item.data.title : `${fmtTime(item.timeKey)} ${item.data.title}`;
          return canOpen && item.data.htmlLink
            ? <a key={item.data.id} className="tr-cal-appt tr-cal-appt-google tr-cal-appt-btn" href={item.data.htmlLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Open in Google Calendar">{label}</a>
            : <div key={item.data.id} className="tr-cal-appt tr-cal-appt-google">{label}</div>;
        })())}
        {extra > 0 && <div className="tr-cal-more">+{extra}<span className="tr-cal-more-word"> more</span></div>}
      </div>
    </div>
  );
}

// A training or a blocked-out time, opened from the list or the month grid.
function CalendarItemInfo({ item, user, onClose, onDelete }) {
  const t = item.data;
  const training = item.kind === 'training';
  const canDelete = training ? isAdmin(user) : (user.id === t.user_id || isAdmin(user));
  const when = training
    ? `${fmtDisplayDate(trainingLocalDate(t))} · ${fmtTime(trainingLocalTimeKey(t))} – ${trainingEndClock(t)}`
    : `${fmtDisplayDate(t.block_date)} · ${fmtTime(t.start_time.slice(0, 5))} – ${fmtTime(t.end_time.slice(0, 5))}`;
  return (
    <Modal onClose={onClose} labelledBy="tr-calinfo-title" className="tr-apptinfo">
      <div className="tr-modal-head">
        <div className="tr-apptinfo-top">
          <h3 className="tr-h3" id="tr-calinfo-title">{training ? t.title : `${t.user_name || 'Someone'} unavailable`}</h3>
          <div className="tr-apptinfo-tags">
            <span className={`tr-calinfo-tag ${training ? 'tr-calinfo-training' : 'tr-calinfo-block'}`}>
              {training ? <GraduationCap size={12} aria-hidden="true" /> : <Ban size={12} aria-hidden="true" />} {training ? 'Training' : 'Blocked out'}
            </span>
            {t.recurring_group_id ? <span className="tr-presenting-chip">Weekly</span> : null}
          </div>
        </div>
        <button type="button" className="tr-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>
      <p className="tr-apptinfo-when">{when}</p>
      <dl className="tr-apptinfo-list">
        {training ? <div><dt>Posted by</dt><dd>{t.created_by_name || '—'}</dd></div> : null}
        {training && t.notes ? <div><dt>Notes</dt><dd>{t.notes}</dd></div> : null}
        {/* Blocks of the people above you come without the reason at all. */}
        {!training ? <div><dt>Reason</dt><dd>{'label' in t ? (t.label || 'None given') : 'Only they and the people above them see why.'}</dd></div> : null}
      </dl>
      {training && t.zoom_url ? (
        <div className="tr-apptinfo-acts">
          <a className="tr-btn tr-btn-brass tr-btn-sm" href={t.zoom_url} target="_blank" rel="noopener noreferrer"><Video size={14} aria-hidden="true" /> Join Zoom</a>
        </div>
      ) : null}
      <div className="tr-form-actions">
        {canDelete ? <button type="button" className="tr-btn tr-btn-ghost tr-appt-delete" onClick={onDelete}><Trash2 size={15} aria-hidden="true" /> {training ? 'Remove training' : 'Remove'}</button> : null}
        <button type="button" className="tr-btn tr-btn-ghost" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

export function CalendarBody({ user, onLogAppointment }) {
  const isPhone = useIsPhone();
  const [monthStartStr, setMonthStartStr] = useState(monthStartOf(todayStr()));
  // The month grid gets cramped on a phone, so phones start on the list.
  const [calView, setCalView] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 'agenda' : 'month'));
  const [appts, setAppts] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  // The day window: { date }. What's in it comes from the lists below, so a
  // delete or an edit shows right away.
  const [dayModal, setDayModal] = useState(null);
  // A training or blocked-out time opened on its own: { kind, data }.
  const [infoItem, setInfoItem] = useState(null);
  // Which form is open under the heading: 'training', 'block' or null.
  const [posting, setPosting] = useState(null);
  const [googleStatus, setGoogleStatus] = useState({ connected: false });
  const [googleEvents, setGoogleEvents] = useState([]);
  const [googleConnecting, setGoogleConnecting] = useState(false);
  const [trainings, setTrainings] = useState([]);
  const [scheduleBlocks, setScheduleBlocks] = useState([]);
  const [highlightTrainings, setHighlightTrainings] = useState(false);
  // Presenting hours (leaders): whether you've set any, for the nudge, and
  // the line shown once you save them.
  const presents = seesTeam(user) || isAdmin(user);
  const [hoursSet, setHoursSet] = useState(null); // null: not known yet
  const [hoursNote, setHoursNote] = useState('');
  const [nudgeHidden, setNudgeHidden] = useState(() => { try { return localStorage.getItem(`pl-hours-nudge-${user.id}`) === 'hidden'; } catch { return false; } });
  useEffect(() => {
    if (!presents) return;
    fetchMyPresentingHours(user.id).then(r => setHoursSet(r.unavailable || r.error ? null : r.saved && r.hours.length > 0));
  }, [user.id, presents]);
  function hideNudge() {
    setNudgeHidden(true);
    try { localStorage.setItem(`pl-hours-nudge-${user.id}`, 'hidden'); } catch { /* private window */ }
  }
  // 'all' | 'mine' | a specific person's userId — only meaningful for
  // managers/admins, who see more than just their own appointments here.
  const [personFilter, setPersonFilter] = useState('all');

  const cells = buildMonthGrid(monthStartStr);
  const rangeStart = cells[0].date;
  const rangeEnd = cells[cells.length - 1].date;

  // quiet: no loading placeholder (after an appointment was changed).
  const load = useCallback(async quiet => {
    if (!quiet) setLoading(true);
    // One extra day each side: appointments are placed by your local date,
    // which can differ by a day from the stored date across timezones.
    const tasks = [fetchAppointmentsInRange(fmtDate(addDays(parseDate(rangeStart), -1)), fmtDate(addDays(parseDate(rangeEnd), 1))), fetchGoogleConnectionStatus(), fetchTrainingsInRange(rangeStart, rangeEnd), fetchScheduleBlocksInRange(rangeStart, rangeEnd)];
    if (seesTeam(user)) tasks.push(fetchTeamMembers(user));
    const [apptList, status, trainingList, blockList, memberList] = await Promise.all(tasks);
    setAppts(apptList);
    setGoogleStatus(status);
    setTrainings(trainingList);
    setScheduleBlocks(blockList);
    if (memberList) setMembers(memberList);
    if (status.connected) {
      const g = await fetchGoogleEvents(rangeStart, rangeEnd);
      setGoogleEvents(g.events || []);
      if (g.connected === false) setGoogleStatus({ connected: false }); // token was revoked server-side
    } else {
      setGoogleEvents([]);
    }
    setLoading(false);
  }, [rangeStart, rangeEnd, user.id, user.role, user.isLeader]);
  const refresh = useCallback(() => load(false), [load]);

  useEffect(() => { refresh(); }, [refresh]);
  // An appointment opened from here was saved, moved or deleted.
  useAppointmentEdits(change => {
    if (change.reload) load(true);
    else setAppts(prev => applyAppointmentEdit(prev, change));
  });
  function openAppt(a) { setDayModal(null); openAppointment(a); }
  // Re-check once a Google connection finishes in the background.
  useEffect(() => {
    window.addEventListener('paceledger:google-connected', refresh);
    return () => window.removeEventListener('paceledger:google-connected', refresh);
  }, [refresh]);

  async function handleConnect() {
    if (isNativeApp()) {
      // Google doesn't allow its sign-in inside an app's web view, so the
      // connection is made on the website in a Safari sheet.
      await openInBrowserSheet(`${PUBLIC_SITE_URL}/?connect=google&for=${encodeURIComponent(user.id)}`, () => refresh());
      return;
    }
    setGoogleConnecting(true);
    await connectGoogleCalendar();
  }
  async function handleDisconnect() {
    const ok = await disconnectGoogleCalendar();
    if (ok) { setGoogleStatus({ connected: false }); setGoogleEvents([]); }
  }
  async function handleDeleteTraining(training) {
    if (training.recurring_group_id) {
      const deleteAll = window.confirm(
        "This is part of a weekly series.\n\nOK = delete this and all future occurrences\nCancel = just this one date"
      );
      if (deleteAll) {
        const ok = await deleteTrainingSeries(training.recurring_group_id, training.training_date);
        if (ok) setTrainings(prev => prev.filter(t => !(t.recurring_group_id === training.recurring_group_id && t.training_date >= training.training_date)));
        return ok;
      }
    }
    if (!window.confirm('Remove this training for everyone? This can\'t be undone.')) return false;
    const ok = await deleteTraining(training.id);
    if (ok) setTrainings(prev => prev.filter(t => t.id !== training.id));
    return ok;
  }
  async function handleDeleteScheduleBlock(block) {
    if (block.recurring_group_id) {
      const deleteAll = window.confirm(
        "This is part of a weekly series.\n\nOK = delete this and all future occurrences\nCancel = just this one date"
      );
      if (deleteAll) {
        const ok = await deleteScheduleBlockSeries(block.recurring_group_id, block.block_date);
        if (ok) setScheduleBlocks(prev => prev.filter(b => !(b.recurring_group_id === block.recurring_group_id && b.block_date >= block.block_date)));
        return ok;
      }
    }
    if (!window.confirm('Remove this blocked time?')) return false;
    const ok = await deleteScheduleBlock(block.id);
    if (ok) setScheduleBlocks(prev => prev.filter(b => b.id !== block.id));
    return ok;
  }

  function apptsForDay(dateStr) {
    let list = appts.filter(a => apptLocalDate(a) === dateStr);
    if (personFilter === 'mine') list = list.filter(a => a.userId === user.id);
    else if (personFilter !== 'all') list = list.filter(a => a.userId === personFilter);
    return list;
  }
  function googleForDay(dateStr) {
    if (personFilter !== 'all' && personFilter !== 'mine') return []; // Google events are always mine, not theirs
    return googleEvents.filter(e => (e.start || '').slice(0, 10) === dateStr);
  }
  function trainingsForDay(dateStr) { return trainings.filter(t => trainingLocalDate(t) === dateStr); }
  function scheduleBlocksForDay(dateStr) { return scheduleBlocks.filter(b => b.block_date === dateStr); }
  function ownerName(userId) {
    if (!seesTeam(user)) return '';
    if (userId === user.id) return user.displayName;
    const m = members.find(mm => mm.id === userId);
    return m ? m.display_name : '';
  }

  const monthLabel = parseDate(monthStartStr).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <>
      {/* Posting a training and blocking out time are buttons up here; their
          forms open under the heading only when you use them, so the month
          isn't pushed down the page. */}
      <PageHead title="Calendar" sub="Your appointments, team trainings and Google events in one place.">
        {isAdmin(user) ? (
          <button type="button" className={`tr-btn tr-btn-sm ${posting === 'training' ? 'tr-btn-brass' : 'tr-btn-ghost'}`} aria-expanded={posting === 'training'} onClick={() => setPosting(p => (p === 'training' ? null : 'training'))}>
            <GraduationCap size={14} aria-hidden="true" /> New training
          </button>
        ) : null}
        {presents ? (
          <button type="button" className={`tr-btn tr-btn-sm ${posting === 'hours' ? 'tr-btn-brass' : 'tr-btn-ghost'}`} aria-expanded={posting === 'hours'} onClick={() => { setHoursNote(''); setPosting(p => (p === 'hours' ? null : 'hours')); }}>
            <CalendarClock size={14} aria-hidden="true" /> Presenting hours
          </button>
        ) : null}
        {user.role === 'manager' || isAdmin(user) ? (
          <button type="button" className={`tr-btn tr-btn-sm ${posting === 'block' ? 'tr-btn-brass' : 'tr-btn-ghost'}`} aria-expanded={posting === 'block'} onClick={() => setPosting(p => (p === 'block' ? null : 'block'))}>
            <Ban size={14} aria-hidden="true" /> Block out time
          </button>
        ) : null}
      </PageHead>
      {posting === 'training' && isAdmin(user) ? <TrainingPostCard user={user} onClose={() => setPosting(null)} onPosted={t => setTrainings(prev => [...prev, t])} /> : null}
      {posting === 'block' && (user.role === 'manager' || isAdmin(user)) ? <SchedulePostCard user={user} onClose={() => setPosting(null)} onPosted={b => setScheduleBlocks(prev => [...prev, b])} /> : null}
      {posting === 'hours' && presents ? (
        <PresentingHoursCard user={user} googleConnected={!!googleStatus.connected} onClose={() => setPosting(null)}
          onSaved={({ settings, hours }) => {
            setPosting(null);
            setHoursSet(hours.length > 0);
            setHoursNote(!hours.length ? 'Presenting hours cleared. Your team picks times by hand.'
              : settings.accepting ? 'Presenting hours saved. Your team sees your open times when they log an appointment with you.'
                : 'Saved. Your team is told you’re not taking new bookings right now.');
          }} />
      ) : null}
      {hoursNote && posting !== 'hours' ? (
        <div className="tr-card tr-ph-saved" role="status">
          <CalendarClock size={16} aria-hidden="true" />
          <span>{hoursNote}</span>
          <button type="button" className="tr-icon-btn" aria-label="Dismiss" onClick={() => setHoursNote('')}><X size={16} /></button>
        </div>
      ) : null}
      {presents && hoursSet === false && !nudgeHidden && posting !== 'hours' && !hoursNote ? (
        <div className="tr-card tr-ph-nudge">
          <CalendarClock size={18} aria-hidden="true" />
          <div className="tr-ph-nudge-text">
            <strong>Let your team book you to present</strong>
            <span>Set the hours you present and they’ll see your open times when they log an appointment, so no more texting to find a time.</span>
          </div>
          <div className="tr-ph-nudge-acts">
            <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={() => setPosting('hours')}>Set presenting hours</button>
            <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={hideNudge}>Not now</button>
          </div>
        </div>
      ) : null}
      <GoogleCalendarConnect status={googleStatus} connecting={googleConnecting} onConnect={handleConnect} onDisconnect={handleDisconnect} />
      {/* Month / List and ‹ month › stay together on one line; the rest
          wraps under them on a phone. */}
      <div className="tr-weeknav tr-cal-toolbar">
        <div className="tr-seg" role="group" aria-label="Calendar view">
          <button type="button" className={calView === 'month' ? 'tr-seg-on' : ''} onClick={() => setCalView('month')}>Month</button>
          <button type="button" className={calView === 'agenda' ? 'tr-seg-on' : ''} onClick={() => setCalView('agenda')}>List</button>
        </div>
        <div className="tr-monthnav">
          <button type="button" className="tr-icon-btn" onClick={() => setMonthStartStr(shiftMonth(monthStartStr, -1))} title="Previous month" aria-label="Previous month"><ChevronLeft size={18} /></button>
          <div className="tr-weeknav-label"><CalendarDays size={16} aria-hidden="true" /><span>{monthLabel}</span></div>
          <button type="button" className="tr-icon-btn" onClick={() => setMonthStartStr(shiftMonth(monthStartStr, 1))} title="Next month" aria-label="Next month"><ChevronRight size={18} /></button>
        </div>
        <div className="tr-cal-tools">
          <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => setMonthStartStr(monthStartOf(todayStr()))} disabled={monthStartStr === monthStartOf(todayStr())}>This month</button>
          <RefreshButton onClick={refresh} />
          <button
            type="button" className={`tr-btn tr-btn-sm ${highlightTrainings ? 'tr-btn-brass' : 'tr-btn-ghost'}`} aria-pressed={highlightTrainings}
            onClick={() => setHighlightTrainings(v => !v)} title="Highlight days with trainings">
            <GraduationCap size={14} aria-hidden="true" /> Trainings
          </button>
          {seesTeam(user) && (
            <select className="tr-cal-personfilter" value={personFilter} onChange={e => setPersonFilter(e.target.value)} aria-label="Whose appointments to show">
              <option value="all">Everyone</option>
              <option value="mine">Just me</option>
              {members.filter(m => m.id !== user.id).map(m => (
                <option key={m.id} value={m.id}>{m.display_name}</option>
              ))}
            </select>
          )}
        </div>
      </div>
      {loading ? <SkeletonCalendar /> : calView === 'agenda' ? (() => {
        // List view: every day in this month that has something on it,
        // starting from today when you're looking at the current month.
        const today = todayStr();
        const monthEnd = fmtDate(addDays(parseDate(shiftMonth(monthStartStr, 1)), -1));
        const fromDate = today > monthStartStr && today <= monthEnd ? today : monthStartStr;
        const days = cells.filter(c => c.inMonth && c.date >= fromDate).map(c => {
          const dayAppts = apptsForDay(c.date), dayGoogle = googleForDay(c.date), dayTrainings = trainingsForDay(c.date), dayBlocks = scheduleBlocksForDay(c.date);
          return { date: c.date, dayAppts, dayGoogle, dayTrainings, dayBlocks, items: calendarItems(dayAppts, dayGoogle, dayTrainings, dayBlocks) };
        }).filter(d => d.items.length > 0);
        return (
          <div className="tr-card tr-agenda">
            {days.length === 0 ? <p className="tr-empty" style={{ margin: 0 }}>Nothing on the calendar {fromDate === today ? 'for the rest of this month' : 'this month'}.</p> : days.map(d => (
              <div key={d.date} className={`tr-agenda-day ${d.date === today ? 'tr-agenda-today' : ''}`}>
                <button type="button" className="tr-agenda-date" onClick={() => setDayModal({ date: d.date })}>
                  {d.date === today ? 'Today' : fmtDisplayDate(d.date)}
                </button>
                {d.items.map(item => {
                  const a = item.data;
                  const time = (
                    <span className="tr-agenda-time">
                      {item.kind === 'google' && a.allDay ? 'All day' : fmtTime(item.timeKey)}
                      {item.kind === 'appt' ? <span className="tr-time-end">to {apptEndClock(a)}</span> : null}
                      {item.kind === 'block' && a.end_time ? <span className="tr-time-end">to {fmtTime(a.end_time.slice(0, 5))}</span> : null}
                      {item.kind === 'training' ? <span className="tr-time-end">to {trainingEndClock(a)}</span> : null}
                    </span>
                  );
                  return (
                    <div key={`${item.kind}-${a.id}`} className={`tr-agenda-item tr-agenda-${item.kind} ${item.kind === 'appt' ? (isRecruitType(a) && !isSaleType(a) ? 'tr-agenda-recruit' : 'tr-agenda-sale') : ''}`}>
                      {item.kind === 'appt' ? (
                        // Tap it to open it: edit yours, see the details of anyone else's.
                        <button type="button" className="tr-agenda-open" onClick={() => openAppt(a)}>
                          {time}
                          <span className="tr-agenda-what">
                            <strong>{a.client}</strong>{typeLabel(a) ? ` · ${typeLabel(a)}` : ''}{ownerName(a.userId) && a.userId !== user.id ? ` · ${ownerName(a.userId)}` : ''}
                          </span>
                        </button>
                      ) : item.kind === 'google' ? (
                        // Google events open in Google Calendar.
                        a.htmlLink ? (
                          <a className="tr-agenda-open" href={a.htmlLink} target="_blank" rel="noopener noreferrer" title="Open in Google Calendar">
                            {time}
                            <span className="tr-agenda-what">{a.title} <span className="tr-empty">· Google</span></span>
                          </a>
                        ) : (
                          <>{time}<span className="tr-agenda-what">{a.title} <span className="tr-empty">· Google</span></span></>
                        )
                      ) : (
                        // Trainings and blocked-out times open their details.
                        <button type="button" className="tr-agenda-open" onClick={() => setInfoItem({ kind: item.kind, data: a })}>
                          {time}
                          <span className="tr-agenda-what">
                            {item.kind === 'training' && <><GraduationCap size={12} /> <strong>{a.title}</strong> · Training</>}
                            {item.kind === 'block' && <><Ban size={12} /> {a.user_name || 'Someone'} unavailable{a.label ? ` — ${a.label}` : ''}</>}
                          </span>
                        </button>
                      )}
                      {(a.zoomUrl || a.zoom_url) && <a className="tr-btn tr-btn-ghost tr-btn-sm" href={a.zoomUrl || a.zoom_url} target="_blank" rel="noopener noreferrer">Join Zoom</a>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })() : (
        <div className="tr-card tr-cal-card">
          <div className="tr-cal-grid">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="tr-cal-headcell">{d}</div>)}
            {cells.map(cell => (
              <CalendarDay
                key={cell.date} cell={cell} appts={apptsForDay(cell.date)} googleEvents={googleForDay(cell.date)} trainings={trainingsForDay(cell.date)}
                scheduleBlocks={scheduleBlocksForDay(cell.date)}
                highlightTrainings={highlightTrainings}
                canOpen={!isPhone}
                onOpen={date => setDayModal({ date })} onOpenItem={setInfoItem} />
            ))}
          </div>
        </div>
      )}
      <div className="tr-cal-legend">
        <span><i className="tr-lg tr-lg-sale" /> Sale</span>
        <span><i className="tr-lg tr-lg-recruit" /> Recruit</span>
        <span><i className="tr-lg tr-lg-training" /> Training</span>
        <span><i className="tr-lg tr-lg-block" /> Unavailable</span>
        {googleStatus.connected && <span><i className="tr-lg tr-lg-google" /> Google</span>}
        <span className="tr-cal-legend-hint">Open an appointment to see or change it, or a day to see everything on it{onLogAppointment ? ' and book one' : ''}.</span>
      </div>
      {dayModal && (() => {
        const day = { appts: apptsForDay(dayModal.date), googleEvents: googleForDay(dayModal.date), trainings: trainingsForDay(dayModal.date), blocks: scheduleBlocksForDay(dayModal.date) };
        return (
        <Modal onClose={() => setDayModal(null)}>
          <div className="tr-row-head">
            <h3 className="tr-h3" style={{ margin: 0 }}>{fmtDisplayDate(dayModal.date)}</h3>
            {onLogAppointment && dayModal.date >= todayStr() && (
              <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={() => { const date = dayModal.date; setDayModal(null); onLogAppointment({ appointmentDate: date }); }}>
                <Plus size={14} /> Log appointment this day
              </button>
            )}
          </div>
          {day.appts.length + day.trainings.length + day.blocks.length + day.googleEvents.length === 0 && (
            <p className="tr-empty">Nothing scheduled.</p>
          )}
          <div className="tr-notes-list" style={{ maxHeight: '60vh', marginTop: 12 }}>
            {day.trainings.map(t => (
              <div key={t.id} className="tr-note-item tr-note-item-training">
                <div className="tr-note-meta"><GraduationCap size={12} /> {fmtTime(trainingLocalTimeKey(t))} – {trainingEndClock(t)} · Training{t.recurring_group_id ? ' · Weekly' : ''}</div>
                <div><strong>{t.title}</strong></div>
                {t.zoom_url && <div><a href={t.zoom_url} target="_blank" rel="noopener noreferrer" className="tr-note tr-link">Join Zoom</a></div>}
                {t.notes && <div className="tr-note">{t.notes}</div>}
                <div className="tr-note">Posted by {t.created_by_name}</div>
                {isAdmin(user) && (
                  <button type="button" className="tr-icon-btn" style={{ marginTop: 4 }} onClick={() => handleDeleteTraining(t)} title="Remove training"><Trash2 size={13} /></button>
                )}
              </div>
            ))}
            {day.blocks.map(b => (
              <div key={b.id} className="tr-note-item tr-note-item-unavailable">
                <div className="tr-note-meta"><Ban size={12} /> {fmtTime(b.start_time.slice(0, 5))}–{fmtTime(b.end_time.slice(0, 5))} · Unavailable{b.recurring_group_id ? ' · Weekly' : ''}</div>
                <div><strong>{b.user_name || 'Someone'}</strong>{b.label ? ` — ${b.label}` : ''}</div>
                {(user.id === b.user_id || isAdmin(user)) && (
                  <button type="button" className="tr-icon-btn" style={{ marginTop: 4 }} onClick={() => handleDeleteScheduleBlock(b)} title="Remove blocked time"><Trash2 size={13} /></button>
                )}
              </div>
            ))}
            {day.appts.map(a => (
              <div key={a.id} className="tr-note-item tr-note-item-appt">
                <button type="button" className="tr-note-open" onClick={() => openAppt(a)}>
                  <span className="tr-note-meta">
                    {fmtApptDateTime(a)}
                    {typeLabel(a) ? ` · ${typeLabel(a)}` : ''}
                    {a.isFollowUp ? ' · Follow-up' : ''}
                  </span>
                  <span className="tr-note-open-line"><strong>{a.client}</strong> — {a.presenter}{a.trainee ? ` (training ${a.trainee})` : ''}</span>
                  {ownerName(a.userId) && <span className="tr-note">Logged by {ownerName(a.userId)}</span>}
                  {a.notes && <span className="tr-note">{a.notes}</span>}
                  <span className="tr-note-open-hint">{a.userId === user.id ? 'Edit' : 'Details'}</span>
                </button>
                {a.zoomUrl && <div><a href={a.zoomUrl} target="_blank" rel="noopener noreferrer" className="tr-note tr-link">Join Zoom</a></div>}
              </div>
            ))}
            {day.googleEvents.map(e => (
              <div key={e.id} className="tr-note-item tr-note-item-google">
                <div className="tr-note-meta">{e.allDay ? 'All day' : fmtTime(googleEventTimeKey(e))} · Google Calendar</div>
                <div><strong>{e.title}</strong></div>
                {e.htmlLink ? <div><a href={e.htmlLink} target="_blank" rel="noopener noreferrer" className="tr-note tr-link">Open in Google Calendar</a></div> : null}
              </div>
            ))}
          </div>
        </Modal>
        );
      })()}
      {infoItem && (
        <CalendarItemInfo item={infoItem} user={user} onClose={() => setInfoItem(null)}
          onDelete={async () => {
            const ok = infoItem.kind === 'training' ? await handleDeleteTraining(infoItem.data) : await handleDeleteScheduleBlock(infoItem.data);
            if (ok) setInfoItem(null);
          }} />
      )}
    </>
  );
}
