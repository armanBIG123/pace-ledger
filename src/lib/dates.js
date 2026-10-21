// Date, time and timezone helpers used across the app.

// ---------------------------------------------------------------------
// date helpers
// ---------------------------------------------------------------------
// Calendar date in the viewer's own timezone. (This previously used
// toISOString(), which is UTC — so after 7 PM Central "today" flipped to
// tomorrow, and a Friday-evening log could land in the next week.)
export function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Adds minutes to a date+time pair, correctly rolling over into the next
// day if needed (e.g. an 11:45 PM appointment + 30 min).
export function addMinutesToDateTime(dateStr, timeStr, minutesToAdd) {
  const dt = new Date(`${dateStr}T${timeStr}:00`);
  dt.setMinutes(dt.getMinutes() + minutesToAdd);
  const pad = n => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:00`;
}

export function todayStr() { return fmtDate(new Date()); }

export function parseDate(s) { return new Date(s + 'T00:00:00'); }

export function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

// Tracking weeks run Saturday through the following Friday — the weekend
// that "opens" a week (e.g. Sat Aug 15 / Sun Aug 16) belongs to that same
// week (Aug 15–21), not the calendar week after it.
export function weekStartOf(dateStr) {
  const d = parseDate(dateStr);
  const day = d.getDay(); // 0=Sun...6=Sat
  const diff = -((day + 1) % 7);
  return fmtDate(addDays(d, diff));
}

export function weekLabel(mondayStr) {
  const m = parseDate(mondayStr);
  const sun = addDays(m, 6);
  const opts = { month: 'short', day: 'numeric' };
  return `${m.toLocaleDateString('en-US', opts)} – ${sun.toLocaleDateString('en-US', opts)}, ${sun.getFullYear()}`;
}

export function shiftWeekStr(mondayStr, weeks) { return fmtDate(addDays(parseDate(mondayStr), weeks * 7)); }

export function fmtDisplayDate(s) {
  if (!s) return '';
  return parseDate(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${m.toString().padStart(2, '0')} ${ampm}`;
}

// ---------------------------------------------------------------------
// timezones — appointment times are stored as a real UTC instant
// (appointment_at) whenever a timezone was given, so anyone viewing it
// sees it correctly converted to their own device's local time.
// ---------------------------------------------------------------------
export const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Phoenix', label: 'Arizona (no DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
];

export function detectTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'; }
  catch { return 'America/New_York'; }
}

export function timezoneOptionsWithDetected() {
  const detected = detectTimezone();
  if (TIMEZONE_OPTIONS.some(o => o.value === detected)) return TIMEZONE_OPTIONS;
  return [{ value: detected, label: `Your timezone (${detected})` }, ...TIMEZONE_OPTIONS];
}

// Shows the appointment converted to whoever is looking at it right now,
// with when it ends: "Wed, Oct 21 · 6:30 – 7:30 PM CDT". Falls back to the
// raw stored value (old behavior) for appointments logged before timezones
// were tracked.
export function fmtApptDateTime(a) {
  const start = new Date(apptStartMs(a));
  const end = new Date(apptEndMs(a));
  const dateStr = a.appointmentAt
    ? start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : fmtDisplayDate(a.appointmentDate);
  return `${dateStr} · ${fmtClockRange(start, end, !!a.appointmentAt)}`;
}

// ---------------------------------------------------------------------
// appointment lengths — every appointment has one (duration_minutes);
// rows from before lengths were saved count as 30 minutes, the length
// their Zoom meeting and invite were made with.
// ---------------------------------------------------------------------
export const LEGACY_APPT_MINUTES = 30;

export function apptMinutes(a) {
  const n = Number(a && a.durationMinutes);
  return n > 0 ? n : LEGACY_APPT_MINUTES;
}

export function apptEndMs(a) {
  return apptStartMs(a) + apptMinutes(a) * 60000;
}

// The end time as a clock, "7:30 PM", for whoever is looking.
export function apptEndClock(a) {
  return new Date(apptEndMs(a)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const CLOCK = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
function clockParts(d) {
  const p = {};
  // (Older Safari calls the AM/PM part "dayperiod".)
  CLOCK.formatToParts(d).forEach(x => { if (x.type !== 'literal') p[x.type.toLowerCase()] = x.value; });
  return { hm: `${p.hour}:${p.minute}`, ampm: p.dayperiod || '', zone: p.timezonename || '' };
}

// "6:30 – 7:30 PM CDT", or "11:30 AM – 12:30 PM CDT" across noon.
export function fmtClockRange(start, end, withZone = true) {
  const s = clockParts(start), e = clockParts(end);
  const from = s.ampm === e.ampm ? s.hm : [s.hm, s.ampm].filter(Boolean).join(' ');
  return `${from} – ${[e.hm, e.ampm, withZone ? e.zone : ''].filter(Boolean).join(' ')}`;
}

// "30 min", "1 hr", "1 hr 30 min".
export function durationLabel(minutes) {
  const n = Math.round(Number(minutes) || 0);
  const h = Math.floor(n / 60), m = n % 60;
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

// "HH:MM" plus some minutes, on a 24-hour clock ("23:30" + 60 = "00:30").
export function addMinutesToTime(timeStr, minutes) {
  const [h, m] = String(timeStr || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
  const total = (((h * 60 + m + Math.round(minutes)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Minutes from one "HH:MM" to the next; an end earlier than the start runs
// past midnight. 0 when they're the same or either is missing.
export function minutesBetweenTimes(startStr, endStr) {
  const toMin = t => { const [h, m] = String(t || '').split(':').map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN; };
  const s = toMin(startStr), e = toMin(endStr);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  return (((e - s) % 1440) + 1440) % 1440;
}

// A training posted at, say, 7pm ET needs to show as 6pm for someone in
// Central time — these convert the stored UTC instant into whichever
// calendar day and clock time it actually falls on for the person
// looking at it, rather than repeating the raw stored values verbatim.
// Falls back to the raw stored value for any training saved before this
// existed (training_at will be null until the row is re-saved).
// Same idea for appointments on the Calendar: a 7:30 PM Eastern
// appointment shows as 6:30 PM (and on the right day) for someone in
// Central time. Falls back to the stored values for legacy rows.
export function apptLocalDate(a) {
  if (!a.appointmentAt) return a.appointmentDate;
  const d = new Date(a.appointmentAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function apptLocalTimeKey(a) {
  if (!a.appointmentAt) return (a.appointmentTime || '00:00').slice(0, 5);
  const d = new Date(a.appointmentAt);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function trainingLocalDate(t) {
  return t.training_at ? fmtDate(new Date(t.training_at)) : t.training_date;
}

export function trainingLocalTimeKey(t) {
  if (!t.training_at) return (t.training_time || '00:00').slice(0, 5);
  const d = new Date(t.training_at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// The follow-up date/time saved on the ORIGINAL appointment — shown right
// where the "Needs follow-up" status lives, not just on the separate
// auto-created follow-up appointment.
export function fmtFollowUpDateTime(a) {
  if (!a.followUpAppointmentDate) return '';
  if (a.followUpAppointmentAt) {
    const d = new Date(a.followUpAppointmentAt);
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    return `${dateStr} · ${timeStr}`;
  }
  return `${fmtDisplayDate(a.followUpAppointmentDate)} · ${fmtTime(a.followUpAppointmentTime)}`;
}

export function monthStartOf(dateStr) {
  const d = parseDate(dateStr);
  return fmtDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function shiftMonth(dateStr, delta) {
  const d = parseDate(dateStr);
  return fmtDate(new Date(d.getFullYear(), d.getMonth() + delta, 1));
}

// A full 6x7 grid including the leading/trailing days from adjacent
// months needed to fill complete weeks.
export function buildMonthGrid(monthStartStr) {
  const start = parseDate(monthStartStr);
  const month = start.getMonth();
  const gridStart = addDays(start, -start.getDay());
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    cells.push({ date: fmtDate(d), inMonth: d.getMonth() === month, dayNum: d.getDate() });
  }
  return cells;
}

// Days/months/years since a timestamp, e.g. "1y 2m 5d"
// The date someone joined PaceLedger, e.g. 08/26/2026.
export function joinedDate(createdAt) {
  if (!createdAt) return '—';
  return new Date(createdAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

export function daysAgoLabel(dateStr) {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Logged today';
  if (days === 1) return 'Logged 1 day ago';
  return `Logged ${days} days ago`;
}

export function fmtShortDate(d) {
  return d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
}

// ---------------------------------------------------------------------
// Follow Up tab — every appointment whose time has passed lands here,
// with a dated running notes log, the logged outcome, next-appointment
// scheduling, and the client's intake link/answers all on one card.
// ---------------------------------------------------------------------
export function fmtNoteStamp(iso) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
}

export function fmtSentStamp(iso) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ---------------------------------------------------------------------
// Today — the landing page. Turns everything the other tabs know into an
// ordered plan for the day (what to log, how many to set, how many names
// to add, who to call), plus the First 30 days checklist for new people.
// Everything is computed from data the other tabs already own; the only
// thing saved here is the checklist summary managers see.
// ---------------------------------------------------------------------
export function greetingFor(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function apptClock(a) {
  return a.appointmentAt
    ? new Date(a.appointmentAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : fmtTime(a.appointmentTime);
}

export function apptStartMs(a) {
  return a.appointmentAt ? new Date(a.appointmentAt).getTime() : new Date(`${a.appointmentDate}T${a.appointmentTime || '00:00'}`).getTime();
}

export function startsInLabel(ms) {
  const mins = Math.round((ms - Date.now()) / 60000);
  if (mins <= 0) return 'Happening now';
  if (mins < 60) return `In ${mins} min`;
  return null;
}

export function apptStartMsSafe(a) {
  return a.appointmentAt ? new Date(a.appointmentAt).getTime() : new Date(`${a.appointmentDate}T${a.appointmentTime || '00:00'}`).getTime();
}
