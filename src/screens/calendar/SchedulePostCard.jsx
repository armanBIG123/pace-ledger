// Blocked-out time: a manager marking times they're not free, so advisors
// booking them as presenter can't double-book it (see checkAppointmentConflict).
import { useState } from 'react';
import { Ban } from 'lucide-react';
import { createScheduleBlock } from '../../schedule.js';
import { detectTimezone, timezoneOptionsWithDetected } from '../../lib/dates.js';
import { openPicker } from '../../components/ui.jsx';

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
