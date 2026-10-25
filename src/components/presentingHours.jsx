// Presenting hours: when your team can book you to present. Opened from
// Calendar. Your team sees the open times (these hours, less what's booked
// or blocked out) when they log an appointment with you presenting.
import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Copy, Plus, Trash2 } from 'lucide-react';
import { DEFAULT_PRESENTING, fetchMyPresentingHours, savePresentingHours } from '../data/availability.js';
import { detectTimezone, timezoneOptionsWithDetected } from '../lib/dates.js';

// Monday first, the way the week reads here (0 = Sunday in the database).
const DAYS = [
  { weekday: 1, label: 'Monday', short: 'Mon' },
  { weekday: 2, label: 'Tuesday', short: 'Tue' },
  { weekday: 3, label: 'Wednesday', short: 'Wed' },
  { weekday: 4, label: 'Thursday', short: 'Thu' },
  { weekday: 5, label: 'Friday', short: 'Fri' },
  { weekday: 6, label: 'Saturday', short: 'Sat' },
  { weekday: 0, label: 'Sunday', short: 'Sun' },
];
const NEW_RANGE = { start: '18:00', end: '21:00' };
const LENGTHS = [30, 45, 60, 75, 90, 120];
const STEPS = [15, 30, 60];
const BREAKS = [0, 10, 15, 30];
const NOTICE = [[0, 'Any time'], [60, '1 hour ahead'], [120, '2 hours ahead'], [240, '4 hours ahead'], [1440, 'A day ahead']];
const HORIZON = [[7, '1 week'], [14, '2 weeks'], [21, '3 weeks'], [28, '4 weeks'], [42, '6 weeks'], [56, '8 weeks']];

const toMin = t => { const [h, m] = String(t || '').split(':').map(Number); return h * 60 + m; };
const minLabel = n => (n < 60 ? `${n} min` : n % 60 ? `${Math.floor(n / 60)} hr ${n % 60} min` : `${n / 60} hour${n === 60 ? '' : 's'}`);
const clock = t => {
  if (t === '24:00') return 'midnight';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
};
// A time box can't show 24:00, so midnight shows as 00:00 at the end.
const endShown = t => (t === '24:00' ? '00:00' : t);
const endKept = t => (t === '00:00' ? '24:00' : t);

// What's wrong with the hours, if anything (the database checks again).
function problemWith(byDay) {
  for (const d of DAYS) {
    const list = (byDay[d.weekday] || []).slice().sort((a, b) => toMin(a.start) - toMin(b.start));
    for (let i = 0; i < list.length; i++) {
      if (!list[i].start || !list[i].end) return `Fill in both times for ${d.label}.`;
      if (toMin(list[i].end) <= toMin(list[i].start)) return `${d.label}: each time range has to end after it starts.`;
      if (i > 0 && toMin(list[i].start) < toMin(list[i - 1].end)) return `Two of ${d.label}’s time ranges overlap.`;
    }
  }
  return '';
}

export function PresentingHoursCard({ user, googleConnected = false, onClose, onSaved }) {
  const [loaded, setLoaded] = useState(null); // null while loading
  const [settings, setSettings] = useState({ ...DEFAULT_PRESENTING, timezone: detectTimezone() });
  const [byDay, setByDay] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const timezoneOptions = timezoneOptionsWithDetected();

  useEffect(() => {
    let live = true;
    fetchMyPresentingHours(user.id).then(res => {
      if (!live) return;
      setLoaded(res);
      if (res.unavailable || res.error) return;
      setSettings({ ...res.settings, timezone: res.settings.timezone || detectTimezone() });
      const next = {};
      res.hours.forEach(h => { (next[h.weekday] = next[h.weekday] || []).push({ start: h.start, end: h.end }); });
      setByDay(next);
    });
    return () => { live = false; };
  }, [user.id]);

  const set = (k, v) => setSettings(s => ({ ...s, [k]: v }));
  const setRanges = (weekday, list) => setByDay(prev => ({ ...prev, [weekday]: list }));
  function toggleDay(weekday) {
    const list = byDay[weekday] || [];
    setRanges(weekday, list.length ? [] : [{ ...NEW_RANGE }]);
  }
  function addRange(weekday) {
    const list = byDay[weekday] || [];
    const last = list[list.length - 1];
    // The next range starts an hour after the last one ends.
    const start = last && toMin(last.end) <= 22 * 60 ? last.end : NEW_RANGE.start;
    const endMin = Math.min(toMin(start) + 60, 24 * 60);
    const end = endMin === 24 * 60 ? '24:00' : `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
    setRanges(weekday, [...list, { start, end }]);
  }
  function changeRange(weekday, i, key, value) {
    setRanges(weekday, (byDay[weekday] || []).map((r, j) => (j === i ? { ...r, [key]: key === 'end' ? endKept(value) : value } : r)));
  }
  function copyToWeekdays(weekday) {
    const list = byDay[weekday] || [];
    setByDay(prev => {
      const next = { ...prev };
      [1, 2, 3, 4, 5].forEach(d => { if (d !== weekday) next[d] = list.map(r => ({ ...r })); });
      return next;
    });
  }

  // How many start times a week that adds up to, and any range too short
  // to fit one presentation.
  const summary = useMemo(() => {
    let starts = 0;
    const short = [];
    DAYS.forEach(d => (byDay[d.weekday] || []).forEach(r => {
      const len = toMin(r.end) - toMin(r.start);
      if (!(len > 0)) return;
      if (len < settings.slotMinutes) short.push(`${d.short} ${clock(r.start)}–${clock(r.end)}`);
      else starts += Math.floor((len - settings.slotMinutes) / settings.stepMinutes) + 1;
    }));
    return { starts, short };
  }, [byDay, settings.slotMinutes, settings.stepMinutes]);

  async function save() {
    const problem = problemWith(byDay);
    if (problem) { setErr(problem); return; }
    const hours = DAYS.flatMap(d => (byDay[d.weekday] || []).map(r => ({ weekday: d.weekday, start: r.start, end: r.end })));
    setSaving(true); setErr('');
    const res = await savePresentingHours({ ...settings, useGoogle: settings.useGoogle && googleConnected }, hours);
    setSaving(false);
    if (!res.ok) { setErr(res.error); return; }
    onSaved && onSaved({ settings, hours });
  }

  const head = (
    <div className="tr-row-head" style={{ marginBottom: 6 }}>
      <h3 className="tr-h3" style={{ margin: 0 }}><CalendarClock size={16} aria-hidden="true" /> Presenting hours</h3>
      <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onClose}>Cancel</button>
    </div>
  );
  if (!loaded) {
    return <div className="tr-card tr-training-post tr-ph" aria-busy="true">{head}<p className="tr-ph-intro">Loading your hours…</p></div>;
  }
  if (loaded.unavailable || loaded.error) {
    return (
      <div className="tr-card tr-training-post tr-ph">
        {head}
        <p className="tr-ph-intro">{loaded.unavailable ? 'Presenting hours need a quick database update before they can be set. Ask your admin to run it.' : 'Couldn’t load your presenting hours. Check your connection and try again.'}</p>
      </div>
    );
  }

  const anyHours = DAYS.some(d => (byDay[d.weekday] || []).length);
  // "Copy to weekdays" sits on the first weekday with hours.
  const copyFrom = [1, 2, 3, 4, 5].find(w => (byDay[w] || []).length);
  return (
    <div className="tr-card tr-training-post tr-ph">
      {head}
      <p className="tr-ph-intro">When your team can book you to present. When they log an appointment with you presenting, they see your open times: these hours, less anything already booked or blocked out.</p>

      <label className="tr-ph-accept">
        <input type="checkbox" checked={settings.accepting} onChange={e => set('accepting', e.target.checked)} />
        <span><strong>Taking bookings</strong><small className="tr-field-hint">{settings.accepting ? 'Your team sees your open times.' : 'Your team is told you’re not taking new bookings right now.'}</small></span>
      </label>

      <div className="tr-ph-week" role="group" aria-label="Weekly hours">
        {DAYS.map(d => {
          const list = byDay[d.weekday] || [];
          const on = list.length > 0;
          return (
            <div key={d.weekday} className={`tr-ph-day ${on ? 'tr-ph-day-on' : ''}`} data-weekday={d.weekday}>
              <label className="tr-ph-dayname">
                <input type="checkbox" checked={on} onChange={() => toggleDay(d.weekday)} aria-label={`Present on ${d.label}s`} />
                <span>{d.label}</span>
              </label>
              <div className="tr-ph-ranges">
                {!on ? <span className="tr-ph-off">Not presenting</span> : list.map((r, i) => (
                  <div key={i} className="tr-ph-range">
                    <input type="time" step="900" value={r.start} aria-label={`${d.label} from`} onChange={e => changeRange(d.weekday, i, 'start', e.target.value)} />
                    <span className="tr-ph-to" aria-hidden="true">to</span>
                    <input type="time" step="900" value={endShown(r.end)} aria-label={`${d.label} until`} onChange={e => changeRange(d.weekday, i, 'end', e.target.value)} />
                    <button type="button" className="tr-icon-btn tr-ph-remove" aria-label={`Remove ${d.label} ${clock(r.start)} to ${clock(r.end)}`} onClick={() => setRanges(d.weekday, list.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
              <div className="tr-ph-dayacts">
                {on ? <button type="button" className="tr-link-btn" onClick={() => addRange(d.weekday)}><Plus size={13} aria-hidden="true" /> Add hours</button> : null}
                {on && d.weekday === copyFrom ? <button type="button" className="tr-link-btn" onClick={() => copyToWeekdays(d.weekday)} title={`Use ${d.label}’s hours Monday to Friday`}><Copy size={13} aria-hidden="true" /> Copy to weekdays</button> : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="tr-form-grid tr-ph-rules">
        <label className="tr-field">
          <span>Each presentation</span>
          <select value={settings.slotMinutes} onChange={e => set('slotMinutes', Number(e.target.value))}>
            {LENGTHS.map(n => <option key={n} value={n}>{minLabel(n)}</option>)}
          </select>
        </label>
        <label className="tr-field">
          <span>Start times every</span>
          <select value={settings.stepMinutes} onChange={e => set('stepMinutes', Number(e.target.value))}>
            {STEPS.map(n => <option key={n} value={n}>{minLabel(n)}</option>)}
          </select>
        </label>
        <label className="tr-field">
          <span>Break between</span>
          <select value={settings.bufferMinutes} onChange={e => set('bufferMinutes', Number(e.target.value))}>
            {BREAKS.map(n => <option key={n} value={n}>{n ? minLabel(n) : 'No break'}</option>)}
          </select>
        </label>
        <label className="tr-field">
          <span>Booked at least</span>
          <select value={settings.noticeMinutes} onChange={e => set('noticeMinutes', Number(e.target.value))}>
            {NOTICE.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
          </select>
        </label>
        <label className="tr-field">
          <span>Up to</span>
          <select value={settings.horizonDays} onChange={e => set('horizonDays', Number(e.target.value))}>
            {HORIZON.map(([n, l]) => <option key={n} value={n}>{l} ahead</option>)}
          </select>
        </label>
        <label className="tr-field">
          <span>Time zone</span>
          <select value={settings.timezone} onChange={e => set('timezone', e.target.value)}>
            {timezoneOptions.some(o => o.value === settings.timezone) ? null : <option value={settings.timezone}>{settings.timezone}</option>}
            {timezoneOptions.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
          </select>
        </label>
        <label className="tr-checkbox-field tr-field-wide tr-ph-google">
          <input type="checkbox" checked={settings.useGoogle && googleConnected} disabled={!googleConnected} onChange={e => set('useGoogle', e.target.checked)} />
          <span>Leave out times I’m busy on Google Calendar
            <small className="tr-field-hint">{googleConnected ? 'Only whether you’re busy is read. Event names and details stay private.' : 'Connect Google Calendar on this page to use this.'}</small>
          </span>
        </label>
      </div>

      <p className="tr-ph-summary" role="status">
        {!anyHours ? 'No hours yet. Tick a day to add some.'
          : `That’s ${summary.starts} start time${summary.starts === 1 ? '' : 's'} a week for ${minLabel(settings.slotMinutes)} presentations${settings.bufferMinutes ? `, with ${minLabel(settings.bufferMinutes)} between` : ''}, before anything’s booked.`}
        {summary.short.length ? ` ${summary.short.join(', ')} ${summary.short.length === 1 ? 'is' : 'are'} shorter than one presentation, so nothing opens then.` : ''}
      </p>
      {err && <div className="tr-error">{err}</div>}
      <div className="tr-form-actions">
        <button type="button" className="tr-btn tr-btn-brass" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save presenting hours'}</button>
      </div>
    </div>
  );
}
