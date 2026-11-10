// Trainings: org-wide announcements everyone sees, posted by super admins
// (and Super Managers for their solar system).
import { useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { addMinutesToTime, detectTimezone, durationLabel, fmtDisplayDate, fmtTime, minutesBetweenTimes, parseDate, timezoneOptionsWithDetected } from '../../lib/dates.js';
import { createTraining, updateTraining, updateTrainingSeries } from '../../data/trainings.js';
import { openPicker, PillChoice } from '../../components/ui.jsx';

// The form for posting a training; opened from the Calendar's "New training"
// button. onClose: hide it. editing: a training to change instead (super
// admins and Super Managers, from the training's window or the day's list);
// onSaved(message) once it's changed. A weekly one can change just that
// date or that date and every week after, for when the standing time moves.
export function TrainingPostCard({ user, onPosted, onClose, editing = null, onSaved }) {
  const startClock = editing ? String(editing.training_time || '').slice(0, 5) : '';
  const [title, setTitle] = useState(editing ? editing.title || '' : '');
  const [date, setDate] = useState(editing ? editing.training_date : '');
  const [time, setTime] = useState(startClock);
  const [endTime, setEndTime] = useState(editing && startClock ? addMinutesToTime(startClock, editing.duration_minutes || 60) : '');
  const [timezone, setTimezone] = useState(editing && editing.timezone ? editing.timezone : detectTimezone());
  const [zoomUrl, setZoomUrl] = useState(editing ? editing.zoom_url || '' : '');
  const [notes, setNotes] = useState(editing ? editing.notes || '' : '');
  const weekly = !!(editing && editing.recurring_group_id);
  // Which weeks a change to a weekly training covers.
  const [scope, setScope] = useState('series');
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
    if (editing) { await saveChanges(); return; }
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
  async function saveChanges() {
    const fields = { title: title.trim(), date, time, durationMinutes: length, timezone, zoomUrl: zoomUrl.trim(), notes: notes.trim() };
    const from = fmtDisplayDate(editing.training_date);
    const series = weekly && scope === 'series';
    const shift = Math.round((parseDate(date) - parseDate(editing.training_date)) / 864e5);
    if (series && Math.abs(shift) > 60) { setErr('To move every week by more than two months, remove it and post it again.'); return; }
    setSaving(true); setErr('');
    const res = series
      ? await updateTrainingSeries(editing.recurring_group_id, editing.training_date, shift, fields)
      : await updateTraining(editing.id, fields);
    setSaving(false);
    if (!res.ok) { setErr(res.error || "Couldn't save. Check your connection and try again."); return; }
    const when = `${fmtTime(time)}${shift && series ? `, ${parseDate(date).toLocaleDateString('en-US', { weekday: 'long' })}s` : ''}`;
    onSaved(series
      ? `"${fields.title}" changed from ${from} on (${res.count} week${res.count === 1 ? '' : 's'}): ${when}. Earlier weeks stay as they were.`
      : `"${fields.title}" changed for ${fmtDisplayDate(date)} only.`);
  }

  return (
    <div className="tr-card tr-training-post">
      <div className="tr-row-head" style={{ marginBottom: 14 }}>
        <h3 className="tr-h3" style={{ margin: 0 }} id={editing ? 'tr-training-edit-title' : undefined}><GraduationCap size={16} aria-hidden="true" /> {editing ? 'Change training' : 'Post a training'}</h3>
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onClose}>Cancel</button>
      </div>
      {weekly ? (
        <div className="tr-field tr-training-scope">
          <span>It repeats every week. Which weeks should change?</span>
          <PillChoice value={scope} onChange={setScope} options={[
            { value: 'series', label: `${fmtDisplayDate(editing.training_date)} and every week after` },
            { value: 'one', label: `Just ${fmtDisplayDate(editing.training_date)}` },
          ]} />
          <small className="tr-field-hint">{scope === 'series'
            ? 'Every later week gets the new time, length, title, Zoom link and notes. Pick a different date to move them all to that day of the week. Earlier weeks stay as history.'
            : 'Only this date changes. The other weeks stay as they are.'}</small>
        </div>
      ) : null}
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
        {!editing ? (
          <label className="tr-field tr-field-wide tr-checkbox-field">
            <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} />
            <span>Repeat weekly (same day of week and time)</span>
          </label>
        ) : null}
        {!editing && recurring && (
          <label className="tr-field">
            <span>Repeat until</span>
            <input type="date" value={repeatUntil} onChange={e => setRepeatUntil(e.target.value)} min={date || undefined} onClick={openPicker} />
          </label>
        )}
      </div>
      {err && <div className="tr-error" role="alert">{err}</div>}
      <div className="tr-form-actions">
        <button type="button" className="tr-btn tr-btn-brass" onClick={submit} disabled={saving}>
          {editing ? (saving ? 'Saving…' : 'Save changes') : (saving ? 'Posting…' : 'Post training')}
        </button>
      </div>
    </div>
  );
}
