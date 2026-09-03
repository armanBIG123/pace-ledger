import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LogIn, LogOut, Plus, Trash2, ChevronLeft, ChevronRight, Users,
  CalendarDays, ShieldCheck, UserPlus, Loader2, Pencil, ClipboardCheck, TrendingUp, UserCog, DollarSign,
  Download, Search, X
} from 'lucide-react';
import { supabase } from './supabaseClient.js';

const WEEKEND_TARGET = 8;
const WEEKDAY_TARGET = 5;
const WEEKLY_TOTAL_TARGET = WEEKEND_TARGET + WEEKDAY_TARGET * 5; // 33

// ---------------------------------------------------------------------
// date helpers
// ---------------------------------------------------------------------
function fmtDate(d) { return d.toISOString().slice(0, 10); }
function todayStr() { return fmtDate(new Date()); }
function parseDate(s) { return new Date(s + 'T00:00:00'); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

// Tracking weeks run Saturday through the following Friday — the weekend
// that "opens" a week (e.g. Sat Aug 15 / Sun Aug 16) belongs to that same
// week (Aug 15–21), not the calendar week after it.
function weekStartOf(dateStr) {
  const d = parseDate(dateStr);
  const day = d.getDay(); // 0=Sun...6=Sat
  const diff = -((day + 1) % 7);
  return fmtDate(addDays(d, diff));
}

// Date-set options: which day the advisor set the appointment on.
// Saturday/Sunday -> that week's weekend batch (target 8)
// Monday-Friday -> that week's weekday additions (target 5)
const DATE_SET_OPTIONS = [
  { value: 'weekend', label: 'Saturday/Sunday', batchLabel: 'Weekend Batch', shortLabel: 'Wknd', category: 'weekend', target: WEEKEND_TARGET },
  { value: 'monday', label: 'Monday', batchLabel: 'Monday Batch', shortLabel: 'Mon', category: 'weekday', target: WEEKDAY_TARGET },
  { value: 'tuesday', label: 'Tuesday', batchLabel: 'Tuesday Batch', shortLabel: 'Tue', category: 'weekday', target: WEEKDAY_TARGET },
  { value: 'wednesday', label: 'Wednesday', batchLabel: 'Wednesday Batch', shortLabel: 'Wed', category: 'weekday', target: WEEKDAY_TARGET },
  { value: 'thursday', label: 'Thursday', batchLabel: 'Thursday Batch', shortLabel: 'Thu', category: 'weekday', target: WEEKDAY_TARGET },
  { value: 'friday', label: 'Friday', batchLabel: 'Friday Batch', shortLabel: 'Fri', category: 'weekday', target: WEEKDAY_TARGET },
];
const WEEK_TOTAL_TARGET = DATE_SET_OPTIONS.reduce((s, o) => s + o.target, 0);
function dateSetMeta(value) {
  return DATE_SET_OPTIONS.find(o => o.value === value) || DATE_SET_OPTIONS[0];
}
function defaultDateSetOption() {
  const map = { 0: 'weekend', 6: 'weekend', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday' };
  return map[new Date().getDay()];
}

function weekLabel(mondayStr) {
  const m = parseDate(mondayStr);
  const sun = addDays(m, 6);
  const opts = { month: 'short', day: 'numeric' };
  return `${m.toLocaleDateString('en-US', opts)} – ${sun.toLocaleDateString('en-US', opts)}, ${sun.getFullYear()}`;
}
function shiftWeekStr(mondayStr, weeks) { return fmtDate(addDays(parseDate(mondayStr), weeks * 7)); }
function fmtDisplayDate(s) {
  if (!s) return '';
  return parseDate(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtTime(t) {
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
const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Phoenix', label: 'Arizona (no DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
];
function detectTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'; }
  catch { return 'America/New_York'; }
}
function timezoneOptionsWithDetected() {
  const detected = detectTimezone();
  if (TIMEZONE_OPTIONS.some(o => o.value === detected)) return TIMEZONE_OPTIONS;
  return [{ value: detected, label: `Your timezone (${detected})` }, ...TIMEZONE_OPTIONS];
}
// Shows the appointment converted to whoever is looking at it right now.
// Falls back to the raw stored value (old behavior) for appointments
// logged before timezones were tracked.
function fmtApptDateTime(a) {
  if (a.appointmentAt) {
    const d = new Date(a.appointmentAt);
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    return `${dateStr} · ${timeStr}`;
  }
  return `${fmtDisplayDate(a.appointmentDate)} · ${fmtTime(a.appointmentTime)}`;
}
// The follow-up date/time saved on the ORIGINAL appointment — shown right
// where the "Needs follow-up" status lives, not just on the separate
// auto-created follow-up appointment.
function fmtFollowUpDateTime(a) {
  if (!a.followUpAppointmentDate) return '';
  if (a.followUpAppointmentAt) {
    const d = new Date(a.followUpAppointmentAt);
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    return `${dateStr} · ${timeStr}`;
  }
  return `${fmtDisplayDate(a.followUpAppointmentDate)} · ${fmtTime(a.followUpAppointmentTime)}`;
}

function getStatus(counts, weekMonday) {
  const allMet = DATE_SET_OPTIONS.every((opt, i) => (counts[i] || 0) >= opt.target);
  if (allMet) return 'met';
  const weekSunday = fmtDate(addDays(parseDate(weekMonday), 6));
  if (weekSunday < todayStr()) return 'missed';
  return 'progress';
}

// ---------------------------------------------------------------------
// data layer (Supabase Postgres, guarded by Row Level Security)
// ---------------------------------------------------------------------
function rowToRecord(row) {
  const meta = dateSetMeta(row.date_set_option);
  return {
    id: row.id,
    userId: row.user_id,
    dateSetOption: row.date_set_option,
    dateSetLabel: meta.label,
    category: row.category,
    weekOf: row.week_of,
    appointmentDate: row.appointment_date,
    appointmentTime: (row.appointment_time || '').slice(0, 5),
    presenter: row.presenter,
    trainee: row.trainee || '',
    client: row.client_name,
    notes: row.notes || '',
    createdAt: row.created_at,
    outcome: row.outcome || '',
    followUpScheduled: row.follow_up_scheduled,
    result: row.result || '',
    interestedTax: row.interested_tax,
    interestedInsurance: row.interested_insurance,
    followUpCompletedAt: row.follow_up_completed_at,
    status: row.status || '',
    presentationType: row.presentation_type || '',
    presentationTypeSecondary: row.presentation_type_secondary || '',
    officiallyRecruited: row.officially_recruited || false,
    officiallySold: row.officially_sold || false,
    targetPremium: row.target_premium,
    appointmentTimezone: row.appointment_timezone || '',
    appointmentAt: row.appointment_at || null,
    isFollowUp: row.is_follow_up || false,
    followUpAppointmentDate: row.follow_up_appointment_date || '',
    followUpAppointmentTime: (row.follow_up_appointment_time || '').slice(0, 5),
    followUpAppointmentTimezone: row.follow_up_appointment_timezone || '',
    followUpAppointmentAt: row.follow_up_appointment_at || null,
    zoomUrl: row.zoom_url || '',
    effectiveDate: row.effective_date || '',
    requirementsCompleted: row.requirements_completed || false,
  };
}
// An appointment can now be logged as, and confirmed as, both a recruit
// AND a sale at once — these check both the primary and secondary type
// fields so "both" is never missed anywhere it's checked.
function isRecruitType(a) {
  return a.presentationType === 'recruit' || a.presentationTypeSecondary === 'recruit';
}
function isSaleType(a) {
  return a.presentationType === 'sale' || a.presentationTypeSecondary === 'sale';
}
function typeLabel(a) {
  const r = isRecruitType(a), s = isSaleType(a);
  if (r && s) return 'Recruit & Sale';
  if (r) return 'Recruit';
  if (s) return 'Sale';
  return '';
}
function isPastAppointment(a) {
  if (a.appointmentAt) return new Date(a.appointmentAt).getTime() < Date.now();
  const dt = new Date(`${a.appointmentDate}T${a.appointmentTime || '00:00'}`);
  return dt.getTime() < Date.now();
}
// A sold policy moves from "Sold Premium" to "Issued Premium" once the
// effective date has arrived AND requirements are marked complete —
// computed live, nothing needs to manually "move" it.
function isPolicyIssued(a) {
  return !!a.effectiveDate && a.effectiveDate <= todayStr() && a.requirementsCompleted === true;
}
// Every appointment marked "Sale" in its follow-up is a policy. Row Level
// Security automatically scopes this to whatever the current person is
// allowed to see: an advisor gets their own, a manager gets their own
// plus their assigned advisors', a super_admin gets everyone's.
async function fetchSoldPolicies() {
  const { data, error } = await supabase
    .from('appointments').select('*').eq('officially_sold', true)
    .order('appointment_date', { ascending: false });
  if (error) { console.error(error); return []; }
  return data.map(rowToRecord);
}
// Calendar view — same RLS-based scoping as everywhere else (own
// appointments, or own + team for managers/admins), just fetched by actual
// date range instead of pace week. Always reflects live appointment_date /
// appointment_time, so reschedules, follow-ups, and edits show up
// automatically with no extra sync logic needed.
async function fetchAppointmentsInRange(startDate, endDate) {
  const { data, error } = await supabase
    .from('appointments').select('*')
    .gte('appointment_date', startDate)
    .lte('appointment_date', endDate)
    .order('appointment_date', { ascending: true })
    .order('appointment_time', { ascending: true });
  if (error) { console.error(error); return []; }
  return data.map(rowToRecord);
}
function monthStartOf(dateStr) {
  const d = parseDate(dateStr);
  return fmtDate(new Date(d.getFullYear(), d.getMonth(), 1));
}
function shiftMonth(dateStr, delta) {
  const d = parseDate(dateStr);
  return fmtDate(new Date(d.getFullYear(), d.getMonth() + delta, 1));
}
// A full 6x7 grid including the leading/trailing days from adjacent
// months needed to fill complete weeks.
function buildMonthGrid(monthStartStr) {
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
async function updatePolicyFields(id, fields) {
  const payload = {};
  if ('effectiveDate' in fields) payload.effective_date = fields.effectiveDate || null;
  if ('requirementsCompleted' in fields) payload.requirements_completed = !!fields.requirementsCompleted;
  const { error } = await supabase.from('appointments').update(payload).eq('id', id);
  return !error;
}
async function fetchPolicyNotes(appointmentId) {
  const { data, error } = await supabase
    .from('policy_notes').select('*').eq('appointment_id', appointmentId)
    .order('created_at', { ascending: true });
  if (error) { console.error(error); return []; }
  return data;
}
async function addPolicyNote(appointmentId, authorId, authorName, note) {
  const { data, error } = await supabase.from('policy_notes').insert({
    appointment_id: appointmentId, author_id: authorId, author_name: authorName, note: note.trim(),
  }).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, record: data };
}
function fmtCurrency(n) {
  if (n === null || n === undefined || isNaN(n)) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
// Client-side CSV export — no backend involved, just builds a file in the
// browser and triggers a normal download.
function downloadCSV(filename, rows) {
  const csv = rows.map(row => row.map(cell => {
    const s = String(cell ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
// Days/months/years since a timestamp, e.g. "1y 2m 5d"
function tenureSince(createdAt) {
  if (!createdAt) return '—';
  const start = new Date(createdAt);
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  let days = now.getDate() - start.getDate();
  if (days < 0) {
    months -= 1;
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  }
  if (months < 0) { years -= 1; months += 12; }
  const parts = [];
  if (years > 0) parts.push(`${years}y`);
  if (months > 0) parts.push(`${months}m`);
  parts.push(`${days}d`);
  return parts.join(' ');
}
// Status is derived entirely from the follow-up answers — there's no
// separate manual status control, so the two can never disagree.
function deriveStatus(outcome, followUpScheduled) {
  if (followUpScheduled === true) return 'needs_follow_up';
  if (outcome === 'rescheduled') return 'needs_reschedule';
  if (outcome === 'no_show') return 'not_completed';
  if (outcome === 'went_well' || outcome === 'not_interested') return 'completed';
  return '';
}
async function saveFollowUp(id, data, followUpTimezone) {
  const status = deriveStatus(data.outcome, data.followUpScheduled);
  const scheduled = data.followUpScheduled === true;
  const { error } = await supabase.from('appointments').update({
    outcome: data.outcome || null,
    follow_up_scheduled: data.followUpScheduled,
    officially_recruited: !!data.officiallyRecruited,
    officially_sold: !!data.officiallySold,
    interested_tax: data.interestedTax,
    interested_insurance: data.interestedInsurance,
    target_premium: data.officiallySold && data.targetPremium ? Number(data.targetPremium) : null,
    follow_up_completed_at: new Date().toISOString(),
    status: status || null,
    follow_up_appointment_date: scheduled ? (data.followUpDate || null) : null,
    follow_up_appointment_time: scheduled ? (data.followUpTime || null) : null,
    follow_up_appointment_timezone: scheduled ? (followUpTimezone || null) : null,
  }).eq('id', id);
  return !error;
}
// Creates the actual next appointment when someone says a follow-up was
// scheduled — carries over presenter/client/type from the original so
// nothing needs re-entering, "set" as of today (right now).
async function insertFollowUpAppointment(userId, original, followUpDate, followUpTime, timezone) {
  const dateSetOption = defaultDateSetOption();
  const meta = dateSetMeta(dateSetOption);
  const { data, error } = await supabase.from('appointments').insert({
    user_id: userId,
    date_set_option: dateSetOption,
    category: meta.category,
    week_of: weekStartOf(todayStr()),
    appointment_date: followUpDate,
    appointment_time: followUpTime,
    appointment_timezone: timezone || original.appointmentTimezone || detectTimezone(),
    presenter: original.presenter,
    trainee: original.trainee || null,
    client_name: original.client,
    notes: `Follow-up to appointment on ${fmtDisplayDate(original.appointmentDate)}`,
    presentation_type: original.presentationType || null,
    presentation_type_secondary: original.presentationTypeSecondary || null,
    zoom_url: original.zoomUrl || null,
    is_follow_up: true,
  }).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, record: rowToRecord(data) };
}
async function fetchMyAppointments(userId) {
  const { data, error } = await supabase
    .from('appointments').select('*').eq('user_id', userId)
    .order('appointment_date', { ascending: true });
  if (error) { console.error(error); return []; }
  return data.map(rowToRecord);
}
async function fetchAppointmentsForWeek(weekMonday) {
  const { data, error } = await supabase
    .from('appointments').select('*').eq('week_of', weekMonday);
  if (error) { console.error(error); return []; }
  return data.map(rowToRecord);
}
async function insertAppointment(userId, form) {
  const meta = dateSetMeta(form.dateSetOption);
  const { data, error } = await supabase.from('appointments').insert({
    user_id: userId,
    date_set_option: form.dateSetOption,
    category: meta.category,
    week_of: form.weekOf,
    appointment_date: form.appointmentDate,
    appointment_time: form.appointmentTime,
    appointment_timezone: form.timezone || null,
    presenter: form.presenter.trim(),
    trainee: form.trainee.trim() || null,
    client_name: form.client.trim(),
    notes: form.notes.trim() || null,
    presentation_type: form.presentationType || null,
    presentation_type_secondary: form.presentationTypeSecondary || null,
  }).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, record: rowToRecord(data) };
}
// Editing normally never touches week_of — a typo fix shouldn't move pace
// counts. The one deliberate exception is rescheduling: if the appointment
// currently needs to be rescheduled, saving new details for it is genuinely
// new scheduling work, so it counts toward whichever batch it lands in now,
// and its stale follow-up state (status, outcome, etc.) is cleared since
// none of that applies to the newly-set time.
async function updateAppointment(id, form, isReschedule) {
  const meta = dateSetMeta(form.dateSetOption);
  const payload = {
    date_set_option: form.dateSetOption,
    category: meta.category,
    appointment_date: form.appointmentDate,
    appointment_time: form.appointmentTime,
    appointment_timezone: form.timezone || null,
    presenter: form.presenter.trim(),
    trainee: form.trainee.trim() || null,
    client_name: form.client.trim(),
    notes: form.notes.trim() || null,
    presentation_type: form.presentationType || null,
    presentation_type_secondary: form.presentationTypeSecondary || null,
  };
  if (isReschedule) {
    payload.week_of = weekStartOf(todayStr());
    payload.status = null;
    payload.outcome = null;
    payload.follow_up_scheduled = null;
    payload.officially_recruited = false;
    payload.officially_sold = false;
    payload.target_premium = null;
    payload.follow_up_completed_at = null;
    payload.follow_up_appointment_date = null;
    payload.follow_up_appointment_time = null;
    payload.follow_up_appointment_timezone = null;
  }
  const { data, error } = await supabase.from('appointments').update(payload).eq('id', id).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, record: rowToRecord(data) };
}
async function deleteAppointmentRow(id) {
  const { error } = await supabase.from('appointments').delete().eq('id', id);
  return !error;
}
async function fetchTeamMembers(viewer) {
  let query = supabase.from('profiles').select('*').order('display_name');
  if (viewer.role === 'super_admin') {
    query = query.in('role', ['advisor', 'manager', 'super_admin']);
  } else {
    // regular managers only ever see their own assigned advisors
    query = query.eq('role', 'advisor').eq('manager_id', viewer.id);
  }
  const { data, error } = await query;
  if (error) { console.error(error); return []; }
  return data;
}
// manager_id doubles as "reports to" for manager-role rows too — a manager
// assigned to a super_admin just has manager_id set to that admin's id.
async function fetchDirectManagers(viewer) {
  const { data, error } = await supabase
    .from('profiles').select('*').eq('role', 'manager').eq('manager_id', viewer.id).order('display_name');
  if (error) { console.error(error); return []; }
  return data;
}
async function fetchManagerDirectory() {
  const { data, error } = await supabase.from('manager_directory').select('*').order('display_name');
  if (error) { console.error(error); return []; }
  return data;
}

// ---------------------------------------------------------------------
// shell / shared UI
// ---------------------------------------------------------------------
function Shell({ children }) {
  return (
    <div className="tr-root">
      <style>{CSS}</style>
      {children}
    </div>
  );
}
function Spinner({ label }) {
  return (
    <div className="tr-spinner">
      <Loader2 className="tr-spin" size={18} />
      <span>{label}</span>
    </div>
  );
}
// Skeleton loading shapes — matches the shape of what's about to appear so
// the app feels like it's already loading the right thing, rather than a
// generic spinner with no relationship to the content.
function SkelBlock({ w, h, style }) {
  return <div className="tr-skel" style={{ width: w, height: h, ...style }} />;
}
function SkeletonRows({ count = 4 }) {
  return (
    <div className="tr-card">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="tr-skel-row">
          <SkelBlock w="70px" h="14px" />
          <div style={{ flex: 1 }}>
            <SkelBlock w="55%" h="13px" style={{ marginBottom: 6 }} />
            <SkelBlock w="35%" h="11px" />
          </div>
        </div>
      ))}
    </div>
  );
}
function SkeletonTable({ rows = 5, cols = 5 }) {
  return (
    <div className="tr-card">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="tr-skel-row">
          {Array.from({ length: cols }).map((_, c) => (
            <SkelBlock key={c} w={c === 0 ? '110px' : '60px'} h="12px" />
          ))}
        </div>
      ))}
    </div>
  );
}
function SkeletonCards({ count = 2 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="tr-card">
          <SkelBlock w="40%" h="15px" style={{ marginBottom: 10 }} />
          <SkelBlock w="70%" h="12px" style={{ marginBottom: 8 }} />
          <SkelBlock w="55%" h="12px" />
        </div>
      ))}
    </>
  );
}
function SkeletonCalendar() {
  return (
    <div className="tr-card tr-cal-card">
      <div className="tr-cal-grid">
        {Array.from({ length: 7 }).map((_, i) => <div key={i} className="tr-cal-headcell"><SkelBlock w="24px" h="10px" style={{ margin: '0 auto' }} /></div>)}
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="tr-cal-day"><SkelBlock w="16px" h="12px" /></div>
        ))}
      </div>
    </div>
  );
}
function Header({ user }) {
  return (
    <header className="tr-header">
      <div className="tr-brand"><ShieldCheck size={20} /> <span>Pace<em>Ledger</em></span></div>
      <div className="tr-header-user">
        <span className="tr-header-name">{user.displayName}</span>
        <span className="tr-header-role">{user.role}</span>
        <button className="tr-icon-btn" onClick={() => supabase.auth.signOut()} title="Log out"><LogOut size={16} /></button>
      </div>
    </header>
  );
}
function WeekNav({ weekMonday, onShift, onToday }) {
  return (
    <div className="tr-weeknav">
      <button className="tr-icon-btn" onClick={() => onShift(-1)} title="Previous week"><ChevronLeft size={18} /></button>
      <div className="tr-weeknav-label"><CalendarDays size={16} /><span>Week of {weekLabel(weekMonday)}</span></div>
      <button className="tr-icon-btn" onClick={() => onShift(1)} title="Next week"><ChevronRight size={18} /></button>
      <button className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onToday}>This week</button>
    </div>
  );
}
function DashboardStrip({ todayCount, needsFollowUpCount, soldThisWeekCount, onJumpToToday, onJumpToFollowUp }) {
  return (
    <div className="tr-dash-strip">
      <button type="button" className="tr-dash-stat" onClick={onJumpToToday}>
        <span className="tr-dash-num">{todayCount}</span>
        <span className="tr-dash-label">today</span>
      </button>
      <button type="button" className="tr-dash-stat" onClick={onJumpToFollowUp}>
        <span className="tr-dash-num">{needsFollowUpCount}</span>
        <span className="tr-dash-label">need follow-up</span>
      </button>
      <div className="tr-dash-stat tr-dash-stat-static">
        <span className="tr-dash-num">{soldThisWeekCount}</span>
        <span className="tr-dash-label">sold this week</span>
      </div>
    </div>
  );
}
function PaceStrip({ groups }) {
  return (
    <div className="tr-card tr-pace">
      <p className="tr-pace-hint">The {WEEKEND_TARGET} you commit to over the weekend for the week ahead, plus {WEEKDAY_TARGET} new ones each weekday.</p>
      <div className="tr-pace-grid">
        {groups.map(g => (
          <div className="tr-pace-group" key={g.option.value}>
            <div className="tr-pace-label">
              <span>{g.option.batchLabel}</span>
              <span className="tr-mono tr-pace-count">{g.count}/{g.option.target}</span>
            </div>
            <div className="tr-pace-row">
              {Array.from({ length: Math.max(g.option.target, g.count) }).map((_, i) => (
                <span
                  key={i}
                  className={`tr-pill ${g.option.category === 'weekday' ? 'tr-pill-alt' : ''} ${i < g.count ? 'tr-pill-filled' : ''}`}
                  title={g.list[i] ? `${g.list[i].client} · ${fmtDisplayDate(g.list[i].appointmentDate)}` : 'Not yet logged'}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
// A quick "was I better or worse than usual" view — computed entirely from
// already-loaded appointment data, no extra fetch needed.
function PaceTrend({ appointments, currentWeekMonday, numWeeks = 6 }) {
  const weeks = [];
  for (let i = numWeeks - 1; i >= 0; i--) {
    const weekOf = shiftWeekStr(currentWeekMonday, -i);
    const count = appointments.filter(a => a.weekOf === weekOf && !a.isFollowUp).length;
    weeks.push({ weekOf, count });
  }
  const maxVal = Math.max(WEEKLY_TOTAL_TARGET, ...weeks.map(w => w.count), 1);
  return (
    <div className="tr-card tr-trend">
      <div className="tr-trend-head">
        <span className="tr-trend-title">Last {numWeeks} weeks</span>
        <span className="tr-trend-target-line">Target: {WEEKLY_TOTAL_TARGET}/week</span>
      </div>
      <div className="tr-trend-bars">
        {weeks.map((w, i) => {
          const pct = Math.max(4, Math.min(100, (w.count / maxVal) * 100));
          const isCurrent = i === weeks.length - 1;
          const onPace = w.count >= WEEKLY_TOTAL_TARGET;
          return (
            <div key={w.weekOf} className="tr-trend-col" title={`Week of ${fmtDisplayDate(w.weekOf)}: ${w.count}/${WEEKLY_TOTAL_TARGET}`}>
              <div className="tr-trend-bar-track">
                <div className={`tr-trend-bar ${onPace ? 'tr-trend-bar-good' : ''} ${isCurrent ? 'tr-trend-bar-current' : ''}`} style={{ height: `${pct}%` }} />
              </div>
              <span className="tr-trend-num">{w.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
const STATUS_OPTIONS = [
  { value: '', label: 'No status', color: 'none' },
  { value: 'completed', label: 'Completed', color: 'green' },
  { value: 'needs_follow_up', label: 'Needs follow-up', color: 'amber' },
  { value: 'not_completed', label: "Didn't happen", color: 'rust' },
  { value: 'needs_reschedule', label: 'Needs reschedule', color: 'violet' },
];
// Sentinel values for the sidebar's Open Requirements section — distinct
// from any real status value (including '') so they can share the same
// statusView state cleanly.
const SOLD_PREMIUM_VIEW = '__sold_premium__';
const ISSUED_PREMIUM_VIEW = '__issued_premium__';
function StatusChip({ status }) {
  const opt = STATUS_OPTIONS.find(o => o.value === status);
  if (!opt || !opt.value) return null;
  return <span className={`tr-status tr-status-${opt.color}`}>{opt.label}</span>;
}
// Icon + text, never color alone — a colored border stripe elsewhere is a
// nice-to-have accent, but this badge is what actually conveys recruit vs
// sale to anyone who can't distinguish the two colors.
function TypeBadge({ appt }) {
  const r = isRecruitType(appt), s = isSaleType(appt);
  if (!r && !s) return null;
  if (r && s) return <span className="tr-type-badge tr-type-badge-both"><UserPlus size={11} /><DollarSign size={11} /> Recruit &amp; Sale</span>;
  if (r) return <span className="tr-type-badge tr-type-badge-recruit"><UserPlus size={11} /> Recruit</span>;
  return <span className="tr-type-badge tr-type-badge-sale"><DollarSign size={11} /> Sale</span>;
}
function ApptGroup({ title, list, onDelete, onFollowUp, onEdit, empty }) {
  return (
    <div className="tr-card tr-appt-group">
      {title ? <h3 className="tr-h3">{title}</h3> : null}
      {list.length === 0 ? <p className="tr-empty">{empty}</p> : (
        <div className="tr-table-wrap">
          <table className="tr-table">
            <thead>
              <tr><th>Set</th><th>Appointment</th><th>Presenter</th><th>Trainee</th><th>Client / recruit</th>{onDelete && <th></th>}</tr>
            </thead>
            <tbody>
              {list.map(a => {
                const typeClass = isRecruitType(a) && isSaleType(a) ? 'tr-type-both' : isRecruitType(a) ? 'tr-type-recruit' : isSaleType(a) ? 'tr-type-sale' : '';
                return (
                  <tr key={a.id}>
                    <td className={typeClass}>{a.dateSetLabel}</td>
                    <td>{fmtApptDateTime(a)}</td>
                    <td>{a.presenter}</td>
                    <td>{a.trainee || '—'}</td>
                    <td>
                      {a.client}
                      <TypeBadge appt={a} />
                      {a.status ? <span style={{ marginLeft: 6 }}><StatusChip status={a.status} /></span> : null}
                      {a.zoomUrl ? <div><a href={a.zoomUrl} target="_blank" rel="noopener noreferrer" className="tr-note tr-link">Join Zoom</a></div> : null}
                      {a.followUpAppointmentDate ? <div className="tr-note" style={{ marginTop: 2 }}>Follow-up: {fmtFollowUpDateTime(a)}</div> : null}
                      {a.notes ? <span className="tr-note"> — {a.notes}</span> : null}
                    </td>
                    {onDelete && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {onFollowUp && isPastAppointment(a) && (
                          <button className="tr-icon-btn" onClick={() => onFollowUp(a)} title={a.followUpCompletedAt ? 'Edit follow-up' : 'Follow up'}>
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

// ---------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------
function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [managerId, setManagerId] = useState('');
  const [managers, setManagers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    fetchManagerDirectory().then(setManagers);
  }, []);

  async function submit() {
    setError(''); setNotice('');
    const mail = email.trim();
    if (!mail || !password) { setError('Enter an email and password.'); return; }
    setBusy(true);
    try {
      if (mode === 'signup') {
        if (!displayName.trim()) { setError('Enter your full name.'); setBusy(false); return; }
        if (password.length < 6) { setError('Password needs to be at least 6 characters.'); setBusy(false); return; }
        if (managers.length > 0 && !managerId) { setError('Please select your manager.'); setBusy(false); return; }
        const { data, error: signErr } = await supabase.auth.signUp({
          email: mail,
          password,
          options: { data: { display_name: displayName.trim(), manager_id: managerId || '' } },
        });
        if (signErr) { setError(signErr.message); setBusy(false); return; }
        if (!data.session) {
          setNotice('Account created — check your email to confirm it, then log in.');
          setMode('login');
        }
      } else {
        const { error: loginErr } = await supabase.auth.signInWithPassword({ email: mail, password });
        if (loginErr) { setError(loginErr.message); setBusy(false); return; }
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  async function forgotPassword() {
    setError(''); setNotice('');
    const mail = email.trim();
    if (!mail) { setError('Enter your email above first, then click "Forgot password?".'); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(mail, {
      redirectTo: window.location.origin,
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setNotice('Check your email for a link to reset your password.');
  }
  function handleKeyDown(e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } }

  return (
    <Shell>
      <div className="tr-auth-wrap">
        <div className="tr-auth-card" onKeyDown={handleKeyDown}>
          <div className="tr-brand tr-brand-center"><ShieldCheck size={22} /> <span>Pace<em>Ledger</em></span></div>
          <p className="tr-auth-sub">Appointment-setting pace tracking for advisors and managers.</p>
          <div className="tr-tabs">
            <button className={`tr-tab ${mode === 'login' ? 'tr-tab-active' : ''}`} onClick={() => { setMode('login'); setError(''); setNotice(''); }}>Log in</button>
            <button className={`tr-tab ${mode === 'signup' ? 'tr-tab-active' : ''}`} onClick={() => { setMode('signup'); setError(''); setNotice(''); }}>Create account</button>
          </div>
          <div className="tr-auth-form">
            {mode === 'signup' && (
              <label className="tr-field">
                <span>Full name</span>
                <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Jordan Blake" />
              </label>
            )}
            <label className="tr-field">
              <span>Email</span>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jordan@yourcompany.com" autoCapitalize="none" />
            </label>
            <label className="tr-field">
              <span>Password</span>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
            </label>
            {mode === 'login' && (
              <button type="button" className="tr-link-btn" onClick={forgotPassword} disabled={busy}>Forgot password?</button>
            )}
            {mode === 'signup' && managers.length > 0 && (
              <label className="tr-field">
                <span>Your manager</span>
                <select value={managerId} onChange={e => setManagerId(e.target.value)}>
                  <option value="">Select your manager…</option>
                  {managers.map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}
                </select>
              </label>
            )}
            {mode === 'signup' && managers.length === 0 && (
              <div className="tr-badge tr-badge-weekday">No managers set up yet — you can sign up now and be assigned one later.</div>
            )}
            {notice && <div className="tr-badge tr-badge-weekday">{notice}</div>}
            {error && <div className="tr-error">{error}</div>}
            <button type="button" className="tr-btn tr-btn-brass tr-btn-block" onClick={submit} disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? <><LogIn size={16} /> Log in</> : <><UserPlus size={16} /> Create account</>}
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function ResetPasswordScreen({ onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (password.length < 6) { setError('Password needs to be at least 6 characters.'); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) { setError(err.message); return; }
    onDone();
  }
  function handleKeyDown(e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } }

  return (
    <Shell>
      <div className="tr-auth-wrap">
        <div className="tr-auth-card" onKeyDown={handleKeyDown}>
          <div className="tr-brand tr-brand-center"><ShieldCheck size={22} /> <span>Pace<em>Ledger</em></span></div>
          <p className="tr-auth-sub">Set a new password for your account.</p>
          <div className="tr-auth-form">
            <label className="tr-field">
              <span>New password</span>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
            </label>
            <label className="tr-field">
              <span>Confirm new password</span>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} />
            </label>
            {error && <div className="tr-error">{error}</div>}
            <button type="button" className="tr-btn tr-btn-brass tr-btn-block" onClick={submit} disabled={busy}>
              {busy ? 'Saving…' : 'Set new password'}
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------
// appointment form
// ---------------------------------------------------------------------
function openPicker(e) {
  if (typeof e.target.showPicker === 'function') {
    try { e.target.showPicker(); } catch { /* unsupported in this browser, ignore */ }
  }
}
async function fetchCalendlyContacts() {
  const { data, error } = await supabase
    .from('profiles').select('id, display_name, role, calendly_url')
    .in('role', ['manager', 'super_admin'])
    .not('calendly_url', 'is', null)
    .order('display_name');
  if (error) { console.error(error); return []; }
  return data;
}
async function fetchZoomConnectedManagers() {
  const { data, error } = await supabase
    .from('zoom_connected_managers').select('id, display_name').order('display_name');
  if (error) { console.error(error); return []; }
  return data;
}

// ---------------------------------------------------------------------
// follow-up — quick, tap-to-answer questions for past appointments
// ---------------------------------------------------------------------
function Modal({ onClose, children }) {
  function handleKeyDown(e) { if (e.key === 'Escape') onClose(); }
  return (
    <div className="tr-modal-backdrop" onClick={onClose} onKeyDown={handleKeyDown} tabIndex={-1}>
      <div className="tr-modal-card" onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  );
}
function PillChoice({ options, value, onChange }) {
  return (
    <div className="tr-pillrow">
      {options.map(opt => (
        <button
          key={opt.value} type="button"
          className={`tr-pill-btn ${value === opt.value ? 'tr-pill-btn-active' : ''}`}
          onClick={() => onChange(opt.value)}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}
const OUTCOME_OPTIONS = [
  { value: 'went_well', label: 'Went well' },
  { value: 'no_show', label: 'No show' },
  { value: 'rescheduled', label: 'Rescheduled' },
  { value: 'not_interested', label: 'Not interested' },
];
const YES_NO_OPTIONS = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
function boolToYesNo(v) { return v === true ? 'yes' : v === false ? 'no' : ''; }
function yesNoToBool(v) { return v === 'yes' ? true : v === 'no' ? false : null; }

function FollowUpModal({ appointment, onClose, onSave, saving }) {
  const [outcome, setOutcome] = useState(appointment.outcome || '');
  const [followUpScheduled, setFollowUpScheduled] = useState(boolToYesNo(appointment.followUpScheduled));
  const [followUpDate, setFollowUpDate] = useState(appointment.followUpAppointmentDate || '');
  const [followUpTime, setFollowUpTime] = useState(appointment.followUpAppointmentTime || '');
  const [officiallyRecruited, setOfficiallyRecruited] = useState(boolToYesNo(appointment.officiallyRecruited));
  const [officiallySold, setOfficiallySold] = useState(boolToYesNo(appointment.officiallySold));
  const [targetPremium, setTargetPremium] = useState(appointment.targetPremium != null ? String(appointment.targetPremium) : '');
  const [interestedTax, setInterestedTax] = useState(boolToYesNo(appointment.interestedTax));
  const [interestedInsurance, setInterestedInsurance] = useState(boolToYesNo(appointment.interestedInsurance));
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
      </div>
      {err && <div className="tr-error">{err}</div>}
      <div className="tr-form-actions">
        <button type="button" className="tr-btn tr-btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="tr-btn tr-btn-brass" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save follow-up'}</button>
      </div>
    </Modal>
  );
}

function TypeFilter({ value, onChange }) {
  return (
    <div className="tr-pillrow">
      <button type="button" className={`tr-pill-btn ${value === 'all' ? 'tr-pill-btn-active' : ''}`} onClick={() => onChange('all')}>All</button>
      <button type="button" className={`tr-pill-btn tr-pill-recruit ${value === 'recruit' ? 'tr-pill-btn-active-recruit' : ''}`} onClick={() => onChange('recruit')}>Recruits</button>
      <button type="button" className={`tr-pill-btn tr-pill-sale ${value === 'sale' ? 'tr-pill-btn-active-sale' : ''}`} onClick={() => onChange('sale')}>Sales</button>
    </div>
  );
}
function TypeChoice({ recruit, sale, onToggleRecruit, onToggleSale }) {
  return (
    <div className="tr-pillrow">
      <button type="button" className={`tr-pill-btn tr-pill-recruit ${recruit ? 'tr-pill-btn-active-recruit' : ''}`} onClick={onToggleRecruit}>Recruit</button>
      <button type="button" className={`tr-pill-btn tr-pill-sale ${sale ? 'tr-pill-btn-active-sale' : ''}`} onClick={onToggleSale}>Sale</button>
    </div>
  );
}

function AppointmentForm({ user, weekMonday, editing, onCancel, onSubmit, saving }) {
  const [dateSetOption, setDateSetOption] = useState(editing?.dateSetOption || defaultDateSetOption());
  const [appointmentDate, setAppointmentDate] = useState(editing?.appointmentDate || '');
  const [appointmentTime, setAppointmentTime] = useState(editing?.appointmentTime || '');
  const [timezone, setTimezone] = useState(editing?.appointmentTimezone || detectTimezone());
  const [presenter, setPresenter] = useState(editing?.presenter || user.displayName || '');
  const [trainee, setTrainee] = useState(editing?.trainee || '');
  const [client, setClient] = useState(editing?.client || '');
  const [notes, setNotes] = useState(editing?.notes || '');
  const [typeRecruit, setTypeRecruit] = useState(editing ? isRecruitType(editing) : false);
  const [typeSale, setTypeSale] = useState(editing ? isSaleType(editing) : false);
  const [zoomHostId, setZoomHostId] = useState('');
  const [err, setErr] = useState('');
  const [calendlyContacts, setCalendlyContacts] = useState([]);
  const [zoomManagers, setZoomManagers] = useState([]);
  // Quick log: only the fields that actually vary trip-to-trip start
  // visible. Everything else uses a sensible default silently, editable
  // by expanding. Editing an existing appointment always shows everything.
  const [showMore, setShowMore] = useState(!!editing);
  const timezoneOptions = timezoneOptionsWithDetected();

  useEffect(() => {
    fetchCalendlyContacts().then(setCalendlyContacts);
    fetchZoomConnectedManagers().then(setZoomManagers);
  }, []);

  const meta = dateSetMeta(dateSetOption);

  function submit() {
    if (!appointmentDate || !appointmentTime || !presenter.trim() || !client.trim() || (!typeRecruit && !typeSale)) {
      setErr('Fill in the appointment date/time, presenter, client/recruit, and whether it\'s a recruit and/or sale.');
      return;
    }
    setErr('');
    let presentationType = null, presentationTypeSecondary = null;
    if (typeRecruit && typeSale) { presentationType = 'recruit'; presentationTypeSecondary = 'sale'; }
    else if (typeRecruit) { presentationType = 'recruit'; }
    else if (typeSale) { presentationType = 'sale'; }
    onSubmit({ dateSetOption, appointmentDate, appointmentTime, timezone, presenter, trainee, client, notes, presentationType, presentationTypeSecondary, zoomHostId: zoomHostId || null });
  }
  function handleKeyDown(e) {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); submit(); }
  }

  return (
    <div className="tr-card tr-form" onKeyDown={handleKeyDown}>
      <h3 className="tr-h3">{editing ? 'Edit appointment' : 'Log a new appointment'}</h3>
      {editing?.status === 'needs_reschedule' && (
        <div className="tr-badge tr-badge-weekday tr-form-section">
          This one needs to be rescheduled — saving will count it toward this week's batch as a new entry, and clear its old follow-up status.
        </div>
      )}
      {showMore && calendlyContacts.length > 0 && (
        <div className="tr-field tr-field-wide tr-form-section">
          <span>If a manager is presenting, open their Calendly to schedule</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {calendlyContacts.map(c => (
              <a key={c.id} href={c.calendly_url} target="_blank" rel="noopener noreferrer" className="tr-btn tr-btn-ghost tr-btn-sm">
                {c.display_name}'s Calendly
              </a>
            ))}
          </div>
        </div>
      )}
      {showMore && !editing && zoomManagers.length > 0 && (
        <label className="tr-field tr-field-wide tr-form-section">
          <span>Which manager is presenting? (uses their connected Zoom to create the meeting)</span>
          <select value={zoomHostId} onChange={e => setZoomHostId(e.target.value)}>
            <option value="">Me — use my own connected Zoom</option>
            {zoomManagers.map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}
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
          <input value={presenter} onChange={e => setPresenter(e.target.value)} placeholder="Who is presenting" />
        </label>
        <label className="tr-field">
          <span>Client / recruit</span>
          <input value={client} onChange={e => setClient(e.target.value)} placeholder="Who is being presented to" />
        </label>
        {showMore && (
          <>
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
            <label className="tr-field">
              <span>Trainee (optional)</span>
              <input value={trainee} onChange={e => setTrainee(e.target.value)} placeholder="Who is being trained" />
            </label>
            <label className="tr-field tr-field-wide">
              <span>Notes (optional)</span>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything else worth noting" />
            </label>
          </>
        )}
      </div>
      {!editing && (
        <button type="button" className="tr-more-toggle" onClick={() => setShowMore(v => !v)}>
          {showMore ? '▲ Fewer details' : '▾ More details (date set, time zone, trainee, notes)'}
        </button>
      )}
      {err && <div className="tr-error">{err}</div>}
      <div className="tr-form-actions">
        <button type="button" className="tr-btn tr-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="tr-btn tr-btn-brass" onClick={submit} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save appointment'}</button>
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
function PolicyCard({ policy, canEdit, currentUser, onSaved }) {
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
function OpenRequirementsBody({ view, user }) {
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
        <h2 className="tr-h2">{view === 'issued' ? 'Issued Premium' : 'Sold Premium'}</h2>
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

// ---------------------------------------------------------------------
// calendar — a live month view of every appointment's actual date/time
// ---------------------------------------------------------------------

// TODO: replace with your real Google OAuth client ID once you've created
// it in Google Cloud Console — see GOOGLE-CALENDAR-SETUP.md.
const GOOGLE_CLIENT_ID = '106061643707-avmoqp1oe5idqdioocen9vnpsqd9i82l.apps.googleusercontent.com';

function googleOAuthUrl(accessToken) {
  const redirectUri = `${supabase.supabaseUrl}/functions/v1/google-oauth-callback`;
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    access_type: 'offline',
    prompt: 'consent',
    state: accessToken,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
async function connectGoogleCalendar() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  window.location.href = googleOAuthUrl(data.session.access_token);
}
async function fetchGoogleConnectionStatus() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { connected: false };
  // Only ever select the two display-safe columns — never the tokens,
  // even though the security rules would technically allow it for your
  // own row.
  const { data, error } = await supabase
    .from('google_calendar_connections')
    .select('google_email, connected_at')
    .eq('user_id', sessionData.session.user.id)
    .maybeSingle();
  if (error || !data) return { connected: false };
  return { connected: true, googleEmail: data.google_email };
}
async function disconnectGoogleCalendar() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return false;
  const { error } = await supabase.from('google_calendar_connections').delete().eq('user_id', data.session.user.id);
  return !error;
}
async function fetchGoogleEvents(startDate, endDate) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { connected: false, events: [] };
  try {
    const res = await fetch(`${supabase.supabaseUrl}/functions/v1/google-calendar-events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionData.session.access_token}`,
        apikey: supabase.supabaseKey,
      },
      body: JSON.stringify({ startDate, endDate }),
    });
    if (!res.ok) return { connected: false, events: [] };
    return await res.json();
  } catch {
    return { connected: false, events: [] };
  }
}

// TODO: replace with your real Zoom OAuth client ID once you've created it
// in the Zoom App Marketplace — see ZOOM-INTEGRATION-SETUP.md.
const ZOOM_CLIENT_ID = 'uTaIzgPhRMuVSfpHOCwKw';

function zoomOAuthUrl(accessToken) {
  const redirectUri = `${supabase.supabaseUrl}/functions/v1/zoom-oauth-callback`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: ZOOM_CLIENT_ID,
    redirect_uri: redirectUri,
    state: accessToken,
  });
  return `https://zoom.us/oauth/authorize?${params.toString()}`;
}
async function connectZoom() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  window.location.href = zoomOAuthUrl(data.session.access_token);
}
async function fetchZoomConnectionStatus() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { connected: false };
  const { data, error } = await supabase
    .from('zoom_connections').select('zoom_email, connected_at').eq('user_id', sessionData.session.user.id).maybeSingle();
  if (error || !data) return { connected: false };
  return { connected: true, zoomEmail: data.zoom_email };
}
async function disconnectZoom() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return false;
  const { error } = await supabase.from('zoom_connections').delete().eq('user_id', data.session.user.id);
  return !error;
}
// Calls the server-side function to actually create a real, unique Zoom
// meeting for this specific appointment via Zoom's API.
async function createZoomMeeting({ topic, startTime, durationMinutes, timezone, hostUserId }) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { connected: false };
  try {
    const res = await fetch(`${supabase.supabaseUrl}/functions/v1/zoom-create-meeting`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionData.session.access_token}`,
        apikey: supabase.supabaseKey,
      },
      body: JSON.stringify({ topic, startTime, durationMinutes, timezone, hostUserId: hostUserId || null }),
    });
    if (!res.ok) return { connected: false };
    return await res.json();
  } catch {
    return { connected: false };
  }
}
async function updateAppointmentZoomUrl(id, zoomUrl) {
  const { error } = await supabase.from('appointments').update({ zoom_url: zoomUrl }).eq('id', id);
  return !error;
}
function ZoomConnect({ status, connecting, onConnect, onDisconnect }) {
  return (
    <div className="tr-card tr-google-card">
      <div>
        <strong>Zoom (auto-create meetings)</strong>
        <div className="tr-note">
          {status.connected
            ? `Connected as ${status.zoomEmail || 'your Zoom account'} — a unique Zoom meeting is created automatically for every new appointment you log.`
            : "Connect to automatically create a real Zoom meeting (with its own unique link) whenever you log a new appointment."}
        </div>
      </div>
      {status.connected ? (
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onDisconnect}>Disconnect</button>
      ) : (
        <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={onConnect} disabled={connecting}>
          {connecting ? 'Redirecting…' : 'Connect Zoom'}
        </button>
      )}
    </div>
  );
}

function GoogleCalendarConnect({ status, connecting, onConnect, onDisconnect }) {
  return (
    <div className="tr-card tr-google-card">
      <div>
        <strong>Google Calendar</strong>
        <div className="tr-note">
          {status.connected ? `Connected as ${status.googleEmail || 'your Google account'}` : 'Connect to see your Google events here too.'}
        </div>
      </div>
      {status.connected ? (
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onDisconnect}>Disconnect</button>
      ) : (
        <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={onConnect} disabled={connecting}>
          {connecting ? 'Redirecting…' : 'Connect Google Calendar'}
        </button>
      )}
    </div>
  );
}

function googleEventTimeKey(e) {
  if (e.allDay) return '00:00';
  const d = new Date(e.start);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function CalendarDay({ cell, appts, googleEvents, ownerName, onOpen }) {
  const isToday = cell.date === todayStr();
  const items = [
    ...appts.map(a => ({ kind: 'appt', data: a, timeKey: a.appointmentTime || '00:00' })),
    ...googleEvents.map(e => ({ kind: 'google', data: e, timeKey: googleEventTimeKey(e) })),
  ].sort((a, b) => a.timeKey.localeCompare(b.timeKey));
  const visible = items.slice(0, 3);
  const extra = items.length - visible.length;
  return (
    <div
      className={`tr-cal-day ${cell.inMonth ? '' : 'tr-cal-day-out'} ${isToday ? 'tr-cal-day-today' : ''}`}
      onClick={() => items.length > 0 && onOpen(cell.date, appts, googleEvents)}>
      <div className="tr-cal-daynum">{cell.dayNum}</div>
      <div className="tr-cal-appts">
        {visible.map((item, i) => item.kind === 'appt' ? (
          <div key={item.data.id} className={`tr-cal-appt ${isRecruitType(item.data) && isSaleType(item.data) ? 'tr-cal-appt-both' : isRecruitType(item.data) ? 'tr-cal-appt-recruit' : isSaleType(item.data) ? 'tr-cal-appt-sale' : ''}`}>
            {fmtTime(item.data.appointmentTime)} {item.data.client}
          </div>
        ) : (
          <div key={item.data.id} className="tr-cal-appt tr-cal-appt-google">
            {item.data.allDay ? item.data.title : `${fmtTime(item.timeKey)} ${item.data.title}`}
          </div>
        ))}
        {extra > 0 && <div className="tr-cal-more">+{extra} more</div>}
      </div>
    </div>
  );
}
function CalendarBody({ user }) {
  const [monthStartStr, setMonthStartStr] = useState(monthStartOf(todayStr()));
  const [appts, setAppts] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dayModal, setDayModal] = useState(null);
  const [googleStatus, setGoogleStatus] = useState({ connected: false });
  const [googleEvents, setGoogleEvents] = useState([]);
  const [googleConnecting, setGoogleConnecting] = useState(false);
  // 'all' | 'mine' | a specific person's userId — only meaningful for
  // managers/admins, who see more than just their own appointments here.
  const [personFilter, setPersonFilter] = useState('all');

  const cells = buildMonthGrid(monthStartStr);
  const rangeStart = cells[0].date;
  const rangeEnd = cells[cells.length - 1].date;

  const refresh = useCallback(async () => {
    setLoading(true);
    const tasks = [fetchAppointmentsInRange(rangeStart, rangeEnd), fetchGoogleConnectionStatus()];
    if (user.role !== 'advisor') tasks.push(fetchTeamMembers(user));
    const [apptList, status, memberList] = await Promise.all(tasks);
    setAppts(apptList);
    setGoogleStatus(status);
    if (memberList) setMembers(memberList);
    if (status.connected) {
      const g = await fetchGoogleEvents(rangeStart, rangeEnd);
      setGoogleEvents(g.events || []);
      if (g.connected === false) setGoogleStatus({ connected: false }); // token was revoked server-side
    } else {
      setGoogleEvents([]);
    }
    setLoading(false);
  }, [rangeStart, rangeEnd, user.id, user.role]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleConnect() {
    setGoogleConnecting(true);
    await connectGoogleCalendar();
  }
  async function handleDisconnect() {
    const ok = await disconnectGoogleCalendar();
    if (ok) { setGoogleStatus({ connected: false }); setGoogleEvents([]); }
  }

  function apptsForDay(dateStr) {
    let list = appts.filter(a => a.appointmentDate === dateStr);
    if (personFilter === 'mine') list = list.filter(a => a.userId === user.id);
    else if (personFilter !== 'all') list = list.filter(a => a.userId === personFilter);
    return list;
  }
  function googleForDay(dateStr) {
    if (personFilter !== 'all' && personFilter !== 'mine') return []; // Google events are always mine, not theirs
    return googleEvents.filter(e => (e.start || '').slice(0, 10) === dateStr);
  }
  function ownerName(userId) {
    if (user.role === 'advisor') return '';
    if (userId === user.id) return user.displayName;
    const m = members.find(mm => mm.id === userId);
    return m ? m.display_name : '';
  }

  const monthLabel = parseDate(monthStartStr).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <>
      <GoogleCalendarConnect status={googleStatus} connecting={googleConnecting} onConnect={handleConnect} onDisconnect={handleDisconnect} />
      <div className="tr-weeknav">
        <button className="tr-icon-btn" onClick={() => setMonthStartStr(shiftMonth(monthStartStr, -1))} title="Previous month"><ChevronLeft size={18} /></button>
        <div className="tr-weeknav-label"><CalendarDays size={16} /><span>{monthLabel}</span></div>
        <button className="tr-icon-btn" onClick={() => setMonthStartStr(shiftMonth(monthStartStr, 1))} title="Next month"><ChevronRight size={18} /></button>
        <button className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => setMonthStartStr(monthStartOf(todayStr()))}>This month</button>
        <button className="tr-btn tr-btn-ghost tr-btn-sm" onClick={refresh}>Refresh</button>
        {user.role !== 'advisor' && (
          <select className="tr-cal-personfilter" value={personFilter} onChange={e => setPersonFilter(e.target.value)}>
            <option value="all">Everyone</option>
            <option value="mine">Just me</option>
            {members.filter(m => m.id !== user.id).map(m => (
              <option key={m.id} value={m.id}>{m.display_name}</option>
            ))}
          </select>
        )}
      </div>
      {loading ? <SkeletonCalendar /> : (
        <div className="tr-card tr-cal-card">
          <div className="tr-cal-grid">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="tr-cal-headcell">{d}</div>)}
            {cells.map(cell => (
              <CalendarDay
                key={cell.date} cell={cell} appts={apptsForDay(cell.date)} googleEvents={googleForDay(cell.date)}
                ownerName={ownerName} onOpen={(date, dayAppts, dayGoogle) => setDayModal({ date, appts: dayAppts, googleEvents: dayGoogle })} />
            ))}
          </div>
        </div>
      )}
      {dayModal && (
        <Modal onClose={() => setDayModal(null)}>
          <h3 className="tr-h3">{fmtDisplayDate(dayModal.date)}</h3>
          <div className="tr-notes-list" style={{ maxHeight: '60vh' }}>
            {dayModal.appts.map(a => (
              <div key={a.id} className="tr-note-item">
                <div className="tr-note-meta">
                  {fmtApptDateTime(a)}
                  {typeLabel(a) ? ` · ${typeLabel(a)}` : ''}
                  {a.isFollowUp ? ' · Follow-up' : ''}
                </div>
                <div><strong>{a.client}</strong> — {a.presenter}{a.trainee ? ` (training ${a.trainee})` : ''}</div>
                {a.zoomUrl && <div><a href={a.zoomUrl} target="_blank" rel="noopener noreferrer" className="tr-note tr-link">Join Zoom</a></div>}
                {ownerName(a.userId) && <div className="tr-note">Logged by {ownerName(a.userId)}</div>}
                {a.notes && <div className="tr-note">{a.notes}</div>}
              </div>
            ))}
            {dayModal.googleEvents.map(e => (
              <div key={e.id} className="tr-note-item tr-note-item-google">
                <div className="tr-note-meta">{e.allDay ? 'All day' : fmtTime(googleEventTimeKey(e))} · Google Calendar</div>
                <div><strong>{e.title}</strong></div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

function CalendlyLinkEditor({ user }) {
  const [link, setLink] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('profiles').select('calendly_url').eq('id', user.id).single()
      .then(({ data }) => { setLink(data?.calendly_url || ''); setLoaded(true); });
  }, [user.id]);

  async function save() {
    setSaving(true); setSaved(false); setError('');
    const { error: err } = await supabase.from('profiles').update({ calendly_url: link.trim() || null }).eq('id', user.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!loaded) return null;

  return (
    <div className="tr-card">
      <h3 className="tr-h3">Your Calendly link</h3>
      <p className="tr-subtitle">
        Advisors will see this and can click it when they log an appointment where you're the presenter.
      </p>
      <div className="tr-form-grid">
        <label className="tr-field tr-field-wide">
          <span>Calendly URL</span>
          <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://calendly.com/your-name/30min" />
        </label>
      </div>
      {error && <div className="tr-error">{error}</div>}
      <div className="tr-form-actions">
        <button type="button" className="tr-btn tr-btn-brass" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save link'}
        </button>
      </div>
    </div>
  );
}
function MyAppointmentsBody({ user }) {
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

  const searchResults = searchQuery.trim()
    ? appointments
        .filter(a => a.client.toLowerCase().includes(searchQuery.trim().toLowerCase()))
        .sort((a, b) => (b.appointmentDate + b.appointmentTime).localeCompare(a.appointmentDate + a.appointmentTime))
    : [];
  const todayCount = appointments.filter(a => a.appointmentDate === todayStr()).length;
  const needsFollowUpCount = appointments.filter(a => a.status === 'needs_follow_up').length;

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

  async function handleZoomConnect() {
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
  const soldThisWeekCount = weekAppts.filter(a => a.officiallySold).length;
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

  function closeForm() { setShowForm(false); setEditingAppt(null); }
  function openEdit(appt) { setEditingAppt(appt); setShowForm(true); }

  async function handleFormSubmit(form) {
    setSaving(true);
    setError('');
    if (editingAppt) {
      const isReschedule = editingAppt.status === 'needs_reschedule';
      const res = await updateAppointment(editingAppt.id, form, isReschedule);
      setSaving(false);
      if (!res.ok) { setError(res.error || 'Could not save. Try again.'); return; }
      setAppointments(prev => prev.map(a => a.id === editingAppt.id ? res.record : a));
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
    const followUpTimezone = (original && original.appointmentTimezone) || detectTimezone();
    const ok = await saveFollowUp(id, data, followUpTimezone);
    if (!ok) { setFollowUpSaving(false); return; }

    let newAppt = null;
    if (data.followUpScheduled === true && data.followUpDate && data.followUpTime && original) {
      const res = await insertFollowUpAppointment(user.id, original, data.followUpDate, data.followUpTime, followUpTimezone);
      if (res.ok) newAppt = res.record;
    }
    setFollowUpSaving(false);

    const status = deriveStatus(data.outcome, data.followUpScheduled);
    const scheduled = data.followUpScheduled === true;
    setAppointments(prev => {
      const updated = prev.map(a => a.id === id ? {
        ...a, ...data, status, followUpCompletedAt: new Date().toISOString(),
        followUpAppointmentDate: scheduled ? data.followUpDate : '',
        followUpAppointmentTime: scheduled ? data.followUpTime : '',
        followUpAppointmentTimezone: scheduled ? followUpTimezone : '',
        followUpAppointmentAt: newAppt ? newAppt.appointmentAt : a.followUpAppointmentAt,
      } : a);
      return newAppt ? [...updated, newAppt] : updated;
    });
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
        <div className="tr-sidebar-divider">Needs attention</div>
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
        <div className="tr-search-row">
          <Search size={15} className="tr-search-icon" />
          <input
            className="tr-search-input" type="text" placeholder="Search by client or recruit name…"
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          {searchQuery && (
            <button type="button" className="tr-icon-btn" onClick={() => setSearchQuery('')} title="Clear search"><X size={15} /></button>
          )}
        </div>
        <div className="tr-typefilter-row">
          <span className="tr-typefilter-label">Show:</span>
          <TypeFilter value={typeFilter} onChange={setTypeFilter} />
          <span className="tr-typefilter-note">Only filters what's listed below — your weekly pace count always includes everything.</span>
        </div>
        {searchQuery.trim() ? (
          <>
            <h2 className="tr-h2">Search results for "{searchQuery.trim()}"</h2>
            <p className="tr-subtitle">Across every appointment you've ever logged, regardless of week.</p>
            {searchResults.length === 0 ? (
              <div className="tr-card"><p className="tr-empty">No matches.</p></div>
            ) : (
              <ApptGroup list={byType(searchResults)} onDelete={handleDelete} onFollowUp={setFollowUpTarget} onEdit={openEdit} empty="" />
            )}
          </>
        ) : statusView === null ? (
          <>
            <DashboardStrip
              todayCount={todayCount} needsFollowUpCount={needsFollowUpCount} soldThisWeekCount={soldThisWeekCount}
              onJumpToToday={() => setWeekMonday(weekStartOf(todayStr()))}
              onJumpToFollowUp={() => setStatusView('needs_follow_up')} />
            <ZoomConnect status={zoomStatus} connecting={zoomConnecting} onConnect={handleZoomConnect} onDisconnect={handleZoomDisconnect} />
            {(user.role === 'manager' || user.role === 'super_admin') && <CalendlyLinkEditor user={user} />}
            <WeekNav weekMonday={weekMonday} onShift={d => setWeekMonday(shiftWeekStr(weekMonday, d))} onToday={() => setWeekMonday(weekStartOf(todayStr()))} />
            <PaceStrip groups={groups.map(g => ({ option: g.option, count: g.list.length, list: g.list }))} />
            <PaceTrend appointments={appointments} currentWeekMonday={weekMonday} />
            {upcomingFollowUps.length > 0 && (
              <ApptGroup
                title={`Upcoming follow-ups (${upcomingFollowUps.length})`}
                list={byType(upcomingFollowUps)} onDelete={handleDelete} onFollowUp={setFollowUpTarget}
                onEdit={openEdit} empty="" />
            )}
            <div className="tr-row-head">
              <h2 className="tr-h2">Your appointments this week</h2>
              <button className="tr-btn tr-btn-brass" onClick={() => (showForm ? closeForm() : setShowForm(true))}>
                <Plus size={16} /> {showForm ? 'Close' : 'Log appointment'}
              </button>
            </div>
            {error && <div className="tr-error">{error}</div>}
            {showForm && (
              <AppointmentForm user={user} weekMonday={weekMonday} editing={editingAppt} onCancel={closeForm} onSubmit={handleFormSubmit} saving={saving} />
            )}
            {loading ? <SkeletonRows count={5} /> : groups.map(g => (
              <ApptGroup
                key={g.option.value}
                title={`${g.option.batchLabel} (${g.list.length}/${g.option.target})`}
                list={byType(g.list)} onDelete={handleDelete} onFollowUp={setFollowUpTarget}
                onEdit={openEdit}
                empty={`No ${typeFilter === 'all' ? '' : typeFilter + ' '}appointments logged for ${g.option.label} yet.`} />
            ))}
          </>
        ) : statusView === SOLD_PREMIUM_VIEW ? (
          <OpenRequirementsBody view="sold" user={user} />
        ) : statusView === ISSUED_PREMIUM_VIEW ? (
          <OpenRequirementsBody view="issued" user={user} />
        ) : (
          <>
            <h2 className="tr-h2">{STATUS_OPTIONS.find(o => o.value === statusView)?.label}</h2>
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
function AdvisorView({ user }) {
  const [tab, setTab] = useState('mine');
  return (
    <Shell>
      <Header user={user} />
      <main className="tr-main">
        <div className="tr-tabs" style={{ maxWidth: 320 }}>
          <button className={`tr-tab ${tab === 'mine' ? 'tr-tab-active' : ''}`} onClick={() => setTab('mine')}>My Appointments</button>
          <button className={`tr-tab ${tab === 'calendar' ? 'tr-tab-active' : ''}`} onClick={() => setTab('calendar')}>Calendar</button>
        </div>
        {tab === 'mine' && <MyAppointmentsBody user={user} />}
        {tab === 'calendar' && <CalendarBody user={user} />}
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------
// manager view
// ---------------------------------------------------------------------
function StatusBadge({ status }) {
  const map = { met: ['On pace', 'green'], missed: ['Missed', 'rust'], progress: ['In progress', 'amber'] };
  const [label, tone] = map[status];
  return <span className={`tr-status tr-status-${tone}`}>{label}</span>;
}
function MiniBar({ count, target }) {
  const pct = Math.min(100, Math.round((count / target) * 100));
  return (
    <div className="tr-minibar-wrap">
      <div className="tr-minibar-track"><div className="tr-minibar-fill" style={{ width: `${pct}%` }} /></div>
      <span className="tr-mono tr-minibar-num">{count}/{target}</span>
    </div>
  );
}
function PeoplePaceBody({ user, fetchMembers, heading, Icon, emptyMessage, memberLabel }) {
  const [members, setMembers] = useState([]);
  const [weekAppts, setWeekAppts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weekMonday, setWeekMonday] = useState(weekStartOf(todayStr()));
  const [expanded, setExpanded] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');

  function byType(list) {
    if (typeFilter === 'all') return list;
    if (typeFilter === 'recruit') return list.filter(isRecruitType);
    if (typeFilter === 'sale') return list.filter(isSaleType);
    return list;
  }

  const refresh = useCallback(async () => {
    setLoading(true);
    const [memberList, appts] = await Promise.all([
      fetchMembers(user),
      fetchAppointmentsForWeek(weekMonday),
    ]);
    setMembers(memberList);
    setWeekAppts(appts);
    setLoading(false);
  }, [weekMonday, user.id, user.role]);

  useEffect(() => { refresh(); }, [refresh]);

  // Same classification already used per-row below, just tallied up front
  // so managers get the answer without reading every row themselves.
  const memberStatuses = members.map(m => {
    const list = weekAppts.filter(a => a.userId === m.id && !a.isFollowUp);
    const counts = DATE_SET_OPTIONS.map(opt => list.filter(a => a.dateSetOption === opt.value).length);
    return getStatus(counts, weekMonday);
  });
  const metCount = memberStatuses.filter(s => s === 'met').length;
  const missedCount = memberStatuses.filter(s => s === 'missed').length;

  return (
    <>
      <WeekNav weekMonday={weekMonday} onShift={d => setWeekMonday(shiftWeekStr(weekMonday, d))} onToday={() => setWeekMonday(weekStartOf(todayStr()))} />
      <div className="tr-row-head">
        <h2 className="tr-h2"><Icon size={18} /> {heading}</h2>
        <button className="tr-btn tr-btn-ghost tr-btn-sm" onClick={refresh}>Refresh</button>
      </div>
      <div className="tr-typefilter-row">
        <span className="tr-typefilter-label">Show:</span>
        <TypeFilter value={typeFilter} onChange={setTypeFilter} />
        <span className="tr-typefilter-note">Only affects the expanded appointment lists below — pace counts always include everything.</span>
      </div>
      {loading ? <SkeletonTable rows={5} cols={6} /> : members.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">{emptyMessage}</p></div>
      ) : (
        <>
          <div className="tr-health-line">
            <strong className="tr-health-good">{metCount} of {members.length} on pace</strong>
            {missedCount > 0 && <span className="tr-health-bad"> · {missedCount} behind</span>}
            {' '}this week.
          </div>
          <div className="tr-card tr-summary-card">
          <div className="tr-table-wrap">
            <table className="tr-table tr-table-summary">
              <thead>
                <tr>
                  <th>{memberLabel}</th>
                  {DATE_SET_OPTIONS.map(opt => <th key={opt.value}>{opt.shortLabel}</th>)}
                  <th>Total</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {members.map(adv => {
                  const list = weekAppts.filter(a => a.userId === adv.id && !a.isFollowUp);
                  const groups = DATE_SET_OPTIONS.map(opt => list.filter(a => a.dateSetOption === opt.value));
                  const counts = groups.map(g => g.length);
                  const total = counts.reduce((s, c) => s + c, 0);
                  const status = getStatus(counts, weekMonday);
                  const isOpen = expanded === adv.id;
                  return (
                    <React.Fragment key={adv.id}>
                      <tr className="tr-clickable-row" onClick={() => setExpanded(isOpen ? null : adv.id)}>
                        <td>
                          {adv.display_name}
                          {adv.role === 'manager' ? <span className="tr-note"> — manager</span> : null}
                          {adv.role === 'super_admin' ? <span className="tr-note"> — admin</span> : null}
                          <div className="tr-tenure">Member for {tenureSince(adv.created_at)}</div>
                        </td>
                        {DATE_SET_OPTIONS.map((opt, i) => (
                          <td key={opt.value}><MiniBar count={counts[i]} target={opt.target} /></td>
                        ))}
                        <td className="tr-mono">{total}/{WEEK_TOTAL_TARGET}</td>
                        <td><StatusBadge status={status} /></td>
                      </tr>
                      {isOpen && (
                        <tr className="tr-expand-row"><td colSpan={DATE_SET_OPTIONS.length + 3}>
                          {DATE_SET_OPTIONS.map((opt, i) => (
                            <ApptGroup key={opt.value} title={`${opt.batchLabel} (${counts[i]}/${opt.target})`} list={byType(groups[i])} empty="None logged." />
                          ))}
                        </td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}
    </>
  );
}
function TeamPaceBody({ user }) {
  return (
    <PeoplePaceBody
      user={user} fetchMembers={fetchTeamMembers} heading="Team pace" Icon={Users} memberLabel="Team member"
      emptyMessage="No team members yet. Once people create accounts and start logging, they'll show up here." />
  );
}
function DirectManagersBody({ user }) {
  return (
    <PeoplePaceBody
      user={user} fetchMembers={fetchDirectManagers} heading="Direct managers" Icon={UserCog} memberLabel="Manager"
      emptyMessage="No managers assigned to you yet. Assign them from Manage Team → Reports To." />
  );
}

// ---------------------------------------------------------------------
// track production — sold premium + recruits for the week, manager/admin only
// ---------------------------------------------------------------------
function TrackProductionBody({ user }) {
  const [members, setMembers] = useState([]);
  const [weekAppts, setWeekAppts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weekMonday, setWeekMonday] = useState(weekStartOf(todayStr()));

  const refresh = useCallback(async () => {
    setLoading(true);
    const [memberList, appts] = await Promise.all([
      fetchTeamMembers(user),
      fetchAppointmentsForWeek(weekMonday),
    ]);
    setMembers(memberList);
    setWeekAppts(appts);
    setLoading(false);
  }, [weekMonday, user.id, user.role]);

  useEffect(() => { refresh(); }, [refresh]);

  function handleExport() {
    const rows = [['Team member', 'Role', 'Sold premium', 'Sales count', 'Recruits']];
    members.forEach(m => {
      const list = weekAppts.filter(a => a.userId === m.id);
      const sold = list.filter(a => a.officiallySold);
      const recruited = list.filter(a => a.officiallyRecruited);
      const totalPremium = sold.reduce((s, a) => s + (Number(a.targetPremium) || 0), 0);
      rows.push([m.display_name, m.role, totalPremium, sold.length, recruited.map(a => a.client).join('; ')]);
    });
    downloadCSV(`track-production-week-of-${weekMonday}.csv`, rows);
  }

  return (
    <>
      <WeekNav weekMonday={weekMonday} onShift={d => setWeekMonday(shiftWeekStr(weekMonday, d))} onToday={() => setWeekMonday(weekStartOf(todayStr()))} />
      <div className="tr-row-head">
        <h2 className="tr-h2"><TrendingUp size={18} /> Track production</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="tr-btn tr-btn-ghost tr-btn-sm" onClick={handleExport} disabled={loading || members.length === 0}><Download size={14} /> Export CSV</button>
          <button className="tr-btn tr-btn-ghost tr-btn-sm" onClick={refresh}>Refresh</button>
        </div>
      </div>
      <p className="tr-subtitle">Based on what's been marked Sold or Recruited in each person's follow-up for this week.</p>
      {loading ? <SkeletonTable rows={5} cols={4} /> : members.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">No team members yet.</p></div>
      ) : (
        <div className="tr-card tr-summary-card">
          <div className="tr-table-wrap">
            <table className="tr-table tr-table-summary">
              <thead><tr><th>Team member</th><th>Sold premium</th><th>Recruits</th></tr></thead>
              <tbody>
                {members.map(m => {
                  const list = weekAppts.filter(a => a.userId === m.id);
                  const sold = list.filter(a => a.officiallySold);
                  const recruited = list.filter(a => a.officiallyRecruited);
                  const totalPremium = sold.reduce((s, a) => s + (Number(a.targetPremium) || 0), 0);
                  return (
                    <tr key={m.id}>
                      <td>
                        {m.display_name}
                        {m.role === 'manager' ? <span className="tr-note"> — manager</span> : null}
                        {m.role === 'super_admin' ? <span className="tr-note"> — admin</span> : null}
                      </td>
                      <td className="tr-mono">{fmtCurrency(totalPremium)}{sold.length ? <span className="tr-note"> ({sold.length})</span> : null}</td>
                      <td>{recruited.length === 0 ? '—' : recruited.map(a => a.client).join(', ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function ManagerView({ user }) {
  const [tab, setTab] = useState('mine');
  return (
    <Shell>
      <Header user={user} />
      <main className="tr-main">
        <div className="tr-tabs" style={{ maxWidth: 600 }}>
          <button className={`tr-tab ${tab === 'mine' ? 'tr-tab-active' : ''}`} onClick={() => setTab('mine')}>My Appointments</button>
          <button className={`tr-tab ${tab === 'calendar' ? 'tr-tab-active' : ''}`} onClick={() => setTab('calendar')}>Calendar</button>
          <button className={`tr-tab ${tab === 'pace' ? 'tr-tab-active' : ''}`} onClick={() => setTab('pace')}>Team Pace</button>
          <button className={`tr-tab ${tab === 'production' ? 'tr-tab-active' : ''}`} onClick={() => setTab('production')}>Track Production</button>
        </div>
        {tab === 'mine' && <MyAppointmentsBody user={user} />}
        {tab === 'calendar' && <CalendarBody user={user} />}
        {tab === 'pace' && <TeamPaceBody user={user} />}
        {tab === 'production' && <TrackProductionBody user={user} />}
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------
// super admin — promote/demote people, plus the same team pace view
// ---------------------------------------------------------------------
async function fetchAllUsers() {
  const { data, error } = await supabase.from('profiles').select('*').order('display_name');
  if (error) { console.error(error); return []; }
  return data;
}
async function changeUserRole(id, newRole) {
  const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', id);
  return !error ? null : error.message;
}
async function deleteUserProfile(id) {
  const { error } = await supabase.from('profiles').delete().eq('id', id);
  return !error ? null : error.message;
}
async function changeUserManager(id, newManagerId) {
  const { error } = await supabase.from('profiles').update({ manager_id: newManagerId || null }).eq('id', id);
  return !error ? null : error.message;
}
async function logAuditEvent(actorId, actorName, action, targetName, details) {
  await supabase.from('audit_log').insert({ actor_id: actorId, actor_name: actorName, action, target_name: targetName, details });
}
async function fetchAuditLog() {
  const { data, error } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) { console.error(error); return []; }
  return data;
}
function ManageUsersView({ currentUserId, currentUserName }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setUsers(await fetchAllUsers());
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const managerOptions = users.filter(u => u.role === 'manager');
  const adminOptions = users.filter(u => u.role === 'super_admin');

  async function handleChange(id, newRole) {
    const target = users.find(u => u.id === id);
    setSavingId(id);
    setError('');
    const err = await changeUserRole(id, newRole);
    setSavingId(null);
    if (err) { setError(err); return; }
    setUsers(prev => prev.map(u => u.id === id ? { ...u, role: newRole } : u));
    logAuditEvent(currentUserId, currentUserName, 'Changed role', target?.display_name, `${target?.role || '?'} → ${newRole}`);
  }

  async function handleManagerChange(id, newManagerId) {
    const target = users.find(u => u.id === id);
    const newManagerName = newManagerId ? users.find(u => u.id === newManagerId)?.display_name : 'nobody';
    setSavingId(id);
    setError('');
    const err = await changeUserManager(id, newManagerId);
    setSavingId(null);
    if (err) { setError(err); return; }
    setUsers(prev => prev.map(u => u.id === id ? { ...u, manager_id: newManagerId || null } : u));
    logAuditEvent(currentUserId, currentUserName, 'Changed reports-to', target?.display_name, `now reports to ${newManagerName || 'nobody'}`);
  }

  async function handleDelete(id, name) {
    const ok = window.confirm(`Remove ${name} from the team? They'll no longer be able to use the app. Their past appointment history is kept, not deleted.`);
    if (!ok) return;
    setSavingId(id);
    setError('');
    const err = await deleteUserProfile(id);
    setSavingId(null);
    if (err) { setError(err); return; }
    setUsers(prev => prev.filter(u => u.id !== id));
    logAuditEvent(currentUserId, currentUserName, 'Removed user', name, null);
  }

  return (
    <>
    <div className="tr-card tr-summary-card">
      {error && <div className="tr-error" style={{ margin: 16 }}>{error}</div>}
      {loading ? <SkeletonTable rows={6} cols={5} /> : (
        <div className="tr-table-wrap">
          <table className="tr-table tr-table-summary">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Reports To</th><th></th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    {u.display_name}{u.id === currentUserId ? ' (you)' : ''}
                    <div className="tr-tenure">Member for {tenureSince(u.created_at)}</div>
                  </td>
                  <td>{u.email || '—'}</td>
                  <td>
                    <select value={u.role} disabled={savingId === u.id} onChange={e => handleChange(u.id, e.target.value)}>
                      <option value="advisor">Advisor</option>
                      <option value="manager">Manager</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </td>
                  <td>
                    {u.role === 'advisor' ? (
                      <select value={u.manager_id || ''} disabled={savingId === u.id} onChange={e => handleManagerChange(u.id, e.target.value)}>
                        <option value="">— none —</option>
                        {managerOptions.map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}
                      </select>
                    ) : u.role === 'manager' ? (
                      <select value={u.manager_id || ''} disabled={savingId === u.id} onChange={e => handleManagerChange(u.id, e.target.value)}>
                        <option value="">— none —</option>
                        {adminOptions.map(a => <option key={a.id} value={a.id}>{a.display_name}</option>)}
                      </select>
                    ) : '—'}
                  </td>
                  <td>
                    {u.id !== currentUserId && (
                      <button className="tr-icon-btn" onClick={() => handleDelete(u.id, u.display_name)} disabled={savingId === u.id} title="Remove from team">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
    <AuditLogView />
    </>
  );
}
function AuditLogView() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchAuditLog().then(rows => { setEntries(rows); setLoading(false); });
  }, [open]);

  return (
    <div className="tr-card" style={{ marginTop: 16 }}>
      <button type="button" className="tr-more-toggle" style={{ padding: 0 }} onClick={() => setOpen(v => !v)}>
        {open ? '▲ Hide activity log' : '▾ Show activity log'}
      </button>
      {open && (
        loading ? <SkeletonRows count={4} /> : entries.length === 0 ? (
          <p className="tr-empty">No activity recorded yet.</p>
        ) : (
          <div className="tr-audit-list">
            {entries.map(e => (
              <div key={e.id} className="tr-audit-row">
                <span className="tr-audit-time">{new Date(e.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                <span><strong>{e.actor_name}</strong> {e.action.toLowerCase()}{e.target_name ? ` — ${e.target_name}` : ''}{e.details ? <span className="tr-note"> ({e.details})</span> : ''}</span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
function AdminView({ user }) {
  const [tab, setTab] = useState('mine');
  return (
    <Shell>
      <Header user={user} />
      <main className="tr-main">
        <div className="tr-tabs" style={{ maxWidth: 900 }}>
          <button className={`tr-tab ${tab === 'mine' ? 'tr-tab-active' : ''}`} onClick={() => setTab('mine')}>My Appointments</button>
          <button className={`tr-tab ${tab === 'calendar' ? 'tr-tab-active' : ''}`} onClick={() => setTab('calendar')}>Calendar</button>
          <button className={`tr-tab ${tab === 'pace' ? 'tr-tab-active' : ''}`} onClick={() => setTab('pace')}>Team Pace</button>
          <button className={`tr-tab ${tab === 'directs' ? 'tr-tab-active' : ''}`} onClick={() => setTab('directs')}>Direct Managers</button>
          <button className={`tr-tab ${tab === 'production' ? 'tr-tab-active' : ''}`} onClick={() => setTab('production')}>Track Production</button>
          <button className={`tr-tab ${tab === 'users' ? 'tr-tab-active' : ''}`} onClick={() => setTab('users')}>Manage Team</button>
        </div>
        {tab === 'mine' && <MyAppointmentsBody user={user} />}
        {tab === 'calendar' && <CalendarBody user={user} />}
        {tab === 'pace' && <TeamPaceBody user={user} />}
        {tab === 'directs' && <DirectManagersBody user={user} />}
        {tab === 'production' && <TrackProductionBody user={user} />}
        {tab === 'users' && <ManageUsersView currentUserId={user.id} currentUserName={user.displayName} />}
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------
// root — handles the Supabase session/profile lifecycle
// ---------------------------------------------------------------------
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = checking, null = logged out
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [connectionBanner, setConnectionBanner] = useState(null);
  // Tracks which user we've already loaded a profile for, so a background
  // token refresh (e.g. from switching browser tabs and back) doesn't
  // re-trigger the loading screen and unmount everything below it.
  const fetchedForUserId = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Google or Zoom redirects back here (via their respective Edge
  // Functions) after someone connects or cancels — surface a clear
  // message either way, then clean the URL so refreshing doesn't re-show it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const google = params.get('google');
    const zoom = params.get('zoom');
    if (google === 'connected') {
      setConnectionBanner({ type: 'success', message: 'Google Calendar connected.' });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (google === 'error') {
      setConnectionBanner({ type: 'error', message: `Could not connect Google Calendar (${params.get('reason') || 'unknown error'}). Please try again.` });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (zoom === 'connected') {
      setConnectionBanner({ type: 'success', message: 'Zoom connected.' });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (zoom === 'error') {
      setConnectionBanner({ type: 'error', message: `Could not connect Zoom (${params.get('reason') || 'unknown error'}). Please try again.` });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const userId = session && session.user ? session.user.id : null;

    if (!userId) {
      setProfile(null);
      fetchedForUserId.current = null;
      return;
    }
    if (fetchedForUserId.current === userId) return; // same person, already loaded — do nothing

    setProfileLoading(true);
    setProfileError('');
    supabase.from('profiles').select('*').eq('id', userId).single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setProfileError('Could not load your profile. Try refreshing the page.');
        setProfile(data || null);
        setProfileLoading(false);
        fetchedForUserId.current = userId;
      });
    return () => { cancelled = true; };
  }, [session]);

  if (session === undefined) return <Shell><Spinner label="Loading…" /></Shell>;
  if (recoveryMode) return <ResetPasswordScreen onDone={() => setRecoveryMode(false)} />;
  if (!session) return <AuthScreen />;
  if (profileError) {
    return (
      <Shell>
        <div className="tr-auth-wrap"><div className="tr-card"><p className="tr-error">{profileError}</p></div></div>
      </Shell>
    );
  }
  if (profileLoading || !profile) return <Shell><Spinner label="Loading your account…" /></Shell>;

  const user = { id: session.user.id, displayName: profile.display_name, role: profile.role };
  return (
    <>
      <ConnectionBanner banner={connectionBanner} onDismiss={() => setConnectionBanner(null)} />
      {user.role === 'super_admin' ? <AdminView user={user} /> : user.role === 'manager' ? <ManagerView user={user} /> : <AdvisorView user={user} />}
    </>
  );
}
function ConnectionBanner({ banner, onDismiss }) {
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(onDismiss, 6000);
    return () => clearTimeout(t);
  }, [banner, onDismiss]);
  if (!banner) return null;
  return (
    <div className={`tr-toast tr-toast-${banner.type}`}>
      {banner.message}
      <button type="button" className="tr-toast-close" onClick={onDismiss} aria-label="Dismiss">×</button>
    </div>
  );
}

// ---------------------------------------------------------------------
// styles
// ---------------------------------------------------------------------
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,600;6..72,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap');

.tr-root {
  --ink: #14202B;
  --ink-2: #1C2E3D;
  --paper: #FBFAF6;
  --paper-dim: #EFEBDF;
  --card: #FFFFFF;
  --brass: #C9A24B;
  --brass-dark: #A9843A;
  --green: #3F8F6C;
  --amber: #D98E3B;
  --rust: #B8503D;
  --violet: #7C5FA6;
  --violet-dark: #6B4E96;
  --type-recruit: #3574B8;
  --type-recruit-dark: #285A91;
  --type-sale: #D9772E;
  --type-sale-dark: #B45F1E;
  --slate: #33414D;
  --slate-light: #7C8998;
  --line: rgba(19,35,48,0.12);

  font-family: 'IBM Plex Sans', system-ui, sans-serif;
  color: var(--slate);
  background: var(--paper-dim);
  min-height: 100vh;
  width: 100%;
}
.tr-root *, .tr-root *::before, .tr-root *::after { box-sizing: border-box; }
.tr-root :focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }
.tr-mono { font-family: 'IBM Plex Mono', monospace; }

/* header */
.tr-header {
  background: var(--ink);
  color: var(--paper);
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 24px;
  position: sticky; top: 0; z-index: 10;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.tr-brand { display: flex; align-items: center; gap: 8px; font-family: 'Newsreader', serif; font-size: 20px; font-weight: 600; color: var(--brass); letter-spacing: 0.2px; }
.tr-brand em { font-style: italic; color: var(--paper); font-weight: 600; }
.tr-brand-center { justify-content: center; }
.tr-header-user { display: flex; align-items: center; gap: 12px; }
.tr-header-name { font-weight: 500; }
.tr-header-role { text-transform: capitalize; font-size: 12px; padding: 3px 9px; border-radius: 999px; background: rgba(201,162,75,0.18); color: var(--brass); border: 1px solid rgba(201,162,75,0.35); }

/* layout */
.tr-main { max-width: 980px; margin: 0 auto; padding: 24px 20px 64px; display: flex; flex-direction: column; gap: 20px; }
.tr-row-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.tr-h2 { font-family: 'Newsreader', serif; font-size: 21px; font-weight: 600; color: var(--ink); display: flex; align-items: center; gap: 8px; margin: 0; }
.tr-h3 { font-family: 'Newsreader', serif; font-size: 16px; font-weight: 600; color: var(--ink); margin: 0 0 10px; }
.tr-h4 { font-size: 12.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--slate-light); margin: 0 0 8px; }

/* open requirements: policy cards */
.tr-policy-card { display: flex; flex-direction: column; gap: 14px; }
.tr-policy-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.tr-policy-premium { font-size: 17px; font-weight: 600; color: var(--brass-dark); }
.tr-policy-fields { display: flex; flex-wrap: wrap; gap: 20px; padding: 12px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.tr-policy-notes { display: flex; flex-direction: column; gap: 10px; }
.tr-notes-list { display: flex; flex-direction: column; gap: 10px; max-height: 260px; overflow-y: auto; }
.tr-note-item { background: var(--paper); border-radius: 8px; padding: 8px 10px; font-size: 13.5px; }
.tr-note-meta { font-size: 11px; color: var(--slate-light); margin-bottom: 3px; }
.tr-note-add { display: flex; gap: 8px; }
.tr-note-add input { flex: 1; font-family: inherit; font-size: 14px; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); }
.tr-note-add input:focus { border-color: var(--brass); }

/* card */
.tr-card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 18px 20px; box-shadow: 0 1px 2px rgba(19,35,48,0.04); }
.tr-appt-group + .tr-appt-group { margin-top: 0; }

/* week nav */
.tr-weeknav { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.tr-weeknav-label { display: flex; align-items: center; gap: 8px; font-weight: 500; color: var(--ink); margin-right: auto; font-size: 15px; }
.tr-cal-personfilter { font-family: inherit; font-size: 13px; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); cursor: pointer; }
.tr-cal-personfilter:focus { border-color: var(--brass); }

/* buttons */
.tr-btn { display: inline-flex; align-items: center; gap: 6px; font-family: inherit; font-size: 14px; font-weight: 500; padding: 9px 16px; border-radius: 7px; border: 1px solid transparent; cursor: pointer; transition: background .15s, border-color .15s, transform .1s; }
.tr-btn:active { transform: translateY(1px); }
.tr-btn-brass { background: var(--brass); color: var(--ink); }
.tr-btn-brass:hover { background: var(--brass-dark); }
.tr-btn-brass:disabled { opacity: 0.6; cursor: default; }
.tr-btn-ghost { background: transparent; border-color: var(--line); color: var(--slate); }
.tr-btn-ghost:hover { background: var(--paper-dim); }
.tr-btn-sm { padding: 6px 12px; font-size: 13px; }
.tr-btn-block { width: 100%; justify-content: center; margin-top: 6px; }
.tr-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 7px; border: 1px solid transparent; background: transparent; color: inherit; cursor: pointer; }
.tr-header .tr-icon-btn { color: var(--paper); }
.tr-header .tr-icon-btn:hover { background: rgba(255,255,255,0.1); }
.tr-main .tr-icon-btn:hover { background: var(--paper-dim); }

/* pace strip (signature element) */
.tr-pace { display: flex; flex-direction: column; gap: 14px; }
.tr-pace-hint { margin: 0; font-size: 13px; color: var(--slate-light); }
.tr-pace-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px 28px; }
.tr-pace-group { display: flex; flex-direction: column; gap: 8px; }
.tr-pace-label { display: flex; justify-content: space-between; font-size: 13px; font-weight: 500; color: var(--ink); text-transform: uppercase; letter-spacing: 0.04em; }
.tr-pace-count { color: var(--brass-dark); }
.tr-pace-row { display: flex; flex-wrap: wrap; gap: 7px; }
.tr-pill { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--line); background: transparent; display: inline-block; transition: background .15s, border-color .15s; }
.tr-pill-filled { background: var(--brass); border-color: var(--brass-dark); }
.tr-pill-alt.tr-pill-filled { background: var(--green); border-color: #2E6E51; }

/* forms */
.tr-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.tr-field { display: flex; flex-direction: column; gap: 5px; font-size: 13px; font-weight: 500; color: var(--slate); }
.tr-field-wide { grid-column: 1 / -1; }
.tr-field input, .tr-field select { font-family: inherit; font-size: 14px; padding: 9px 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); }
.tr-field input:focus, .tr-field select:focus { border-color: var(--brass); }
.tr-badge { font-size: 12.5px; font-weight: 500; padding: 8px 10px; border-radius: 6px; border: 1px dashed var(--line); background: var(--paper); }
.tr-badge-weekend { color: var(--brass-dark); border-color: rgba(201,162,75,0.5); background: rgba(201,162,75,0.08); }
.tr-badge-weekday { color: #2E6E51; border-color: rgba(63,143,108,0.4); background: rgba(63,143,108,0.08); }
.tr-form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }
.tr-error { margin-top: 10px; font-size: 13px; color: var(--rust); background: rgba(184,80,61,0.08); border: 1px solid rgba(184,80,61,0.3); padding: 8px 10px; border-radius: 6px; }
.tr-link-btn { align-self: flex-start; background: none; border: none; padding: 0; margin-top: -4px; font-family: inherit; font-size: 12.5px; font-weight: 500; color: var(--brass-dark); cursor: pointer; text-decoration: underline; }
.tr-link-btn:hover { color: var(--ink); }
.tr-link-btn:disabled { opacity: 0.6; cursor: default; }

/* follow-up modal + pill choices */
.tr-modal-backdrop { position: fixed; inset: 0; background: rgba(20,32,43,0.55); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
.tr-modal-card { background: var(--card); border-radius: 12px; padding: 24px 22px; max-width: 440px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 8px 40px rgba(19,35,48,0.28); }
.tr-followup-list { display: flex; flex-direction: column; gap: 16px; margin-top: 4px; }
.tr-followup-subfields { display: flex; flex-direction: column; gap: 12px; padding: 12px; margin-top: -4px; border-left: 2px solid var(--line); background: var(--paper); border-radius: 0 8px 8px 0; }
.tr-pillrow { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 5px; }
.tr-pill-btn { font-family: inherit; font-size: 12.5px; font-weight: 500; padding: 7px 13px; border-radius: 999px; border: 1px solid var(--line); background: var(--paper); color: var(--slate); cursor: pointer; transition: background .15s, border-color .15s, color .15s; }
.tr-pill-btn:hover { border-color: var(--brass); }
.tr-pill-btn-active { background: var(--brass); border-color: var(--brass-dark); color: var(--ink); }

/* tables */
.tr-table-wrap { overflow-x: auto; }
.tr-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.tr-table th { text-align: left; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--slate-light); padding: 6px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.tr-table td { padding: 9px 10px; border-bottom: 1px solid var(--line); color: var(--ink); vertical-align: top; }
.tr-table tbody tr:last-child td { border-bottom: none; }
.tr-note { color: var(--slate-light); }
.tr-empty { font-size: 13.5px; color: var(--slate-light); margin: 4px 0 0; }
.tr-subtitle { font-size: 13.5px; color: var(--slate-light); margin: -8px 0 16px; }
.tr-link { color: inherit; text-decoration: underline; }
.tr-form-section { margin-bottom: 14px; }
.tr-more-toggle { display: block; background: none; border: none; color: var(--brass-dark); font-family: inherit; font-size: 13px; font-weight: 500; cursor: pointer; padding: 4px 0 12px; }
.tr-more-toggle:hover { text-decoration: underline; }
.tr-trend-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
.tr-trend-title { font-size: 13px; font-weight: 600; color: var(--ink); }
.tr-trend-target-line { font-size: 11.5px; color: var(--slate-light); }
.tr-trend-bars { display: flex; align-items: flex-end; gap: 8px; height: 70px; }
.tr-trend-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; }
.tr-trend-bar-track { flex: 1; width: 100%; display: flex; align-items: flex-end; }
.tr-trend-bar { width: 100%; background: var(--paper-dim); border-radius: 3px 3px 0 0; transition: height .3s ease; }
.tr-trend-bar-good { background: rgba(63,143,108,0.55); }
.tr-trend-bar-current { background: var(--brass); }
.tr-trend-bar-current.tr-trend-bar-good { background: #3F8F6C; }
.tr-trend-num { font-size: 10.5px; color: var(--slate-light); font-variant-numeric: tabular-nums; }
.tr-health-line { font-size: 13.5px; color: var(--slate); margin-bottom: 10px; }
.tr-health-good { color: #2E6E51; }
.tr-health-bad { color: var(--rust); font-weight: 600; }
.tr-audit-list { margin-top: 12px; display: flex; flex-direction: column; gap: 2px; }
.tr-audit-row { display: flex; gap: 10px; font-size: 13px; padding: 7px 0; border-bottom: 1px solid var(--line); }
.tr-audit-row:last-child { border-bottom: none; }
.tr-audit-time { color: var(--slate-light); font-size: 11.5px; white-space: nowrap; min-width: 110px; }

.tr-summary-card { padding: 0; overflow: hidden; }
.tr-table-summary th, .tr-table-summary td { padding: 12px 16px; }
.tr-clickable-row { cursor: pointer; }
.tr-clickable-row:hover { background: var(--paper-dim); }
.tr-expand-row td { background: var(--paper); padding: 16px; }
.tr-expand-row .tr-card { margin-bottom: 12px; }
.tr-expand-row .tr-card:last-child { margin-bottom: 0; }

.tr-minibar-wrap { display: flex; align-items: center; gap: 6px; min-width: 84px; }
.tr-minibar-track { flex: 1; height: 7px; border-radius: 999px; background: var(--paper-dim); overflow: hidden; }
.tr-minibar-fill { height: 100%; background: var(--brass); border-radius: 999px; }
.tr-minibar-num { font-size: 12px; color: var(--slate-light); white-space: nowrap; }

.tr-status { font-size: 12px; font-weight: 500; padding: 4px 10px; border-radius: 999px; white-space: nowrap; }
.tr-status-green { background: rgba(63,143,108,0.12); color: #2E6E51; }
.tr-status-amber { background: rgba(217,142,59,0.14); color: #9C6423; }
.tr-status-rust { background: rgba(184,80,61,0.12); color: var(--rust); }
.tr-status-violet { background: rgba(124,95,166,0.14); color: var(--violet-dark); }
.tr-status-none { background: transparent; color: var(--slate-light); border: 1px dashed var(--line); }

/* recruit/sale type coding */
.tr-type-badge { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; font-weight: 500; padding: 3px 7px 3px 6px; border-radius: 999px; white-space: nowrap; margin-left: 6px; vertical-align: middle; }
.tr-type-badge-recruit { background: rgba(53,116,184,0.12); color: var(--type-recruit-dark); }
.tr-type-badge-sale { background: rgba(217,119,46,0.12); color: var(--type-sale-dark); }
.tr-type-badge-both { background: linear-gradient(90deg, rgba(53,116,184,0.12), rgba(217,119,46,0.12)); color: var(--ink); }
.tr-type-recruit { box-shadow: inset 3px 0 0 0 var(--type-recruit); }
.tr-type-sale { box-shadow: inset 3px 0 0 0 var(--type-sale); }
.tr-type-both { border-left: 4px solid transparent; border-image: linear-gradient(180deg, var(--type-recruit) 50%, var(--type-sale) 50%) 1; }
.tr-pill-recruit.tr-pill-btn-active-recruit { background: var(--type-recruit); border-color: var(--type-recruit-dark); color: #fff; }
.tr-pill-sale.tr-pill-btn-active-sale { background: var(--type-sale); border-color: var(--type-sale-dark); color: #fff; }
.tr-typefilter-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.tr-search-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; background: var(--paper); border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px; }
.tr-search-icon { color: var(--slate-light); flex-shrink: 0; }
.tr-search-input { flex: 1; border: none; background: none; font-family: inherit; font-size: 14px; color: var(--ink); outline: none; }
.tr-search-input::placeholder { color: var(--slate-light); }
.tr-dash-strip { display: flex; gap: 12px; margin-bottom: 14px; }
.tr-dash-stat { flex: 1; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; background: var(--paper); border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; cursor: pointer; transition: border-color .15s, background .15s; font-family: inherit; text-align: left; }
.tr-dash-stat:hover { border-color: var(--brass); background: var(--paper-dim); }
.tr-dash-stat-static { cursor: default; }
.tr-dash-stat-static:hover { border-color: var(--line); background: var(--paper); }
.tr-dash-num { font-size: 22px; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }
.tr-dash-label { font-size: 12px; color: var(--slate-light); }
.tr-typefilter-label { font-size: 13px; font-weight: 500; color: var(--slate); }
.tr-typefilter-note { font-size: 12px; color: var(--slate-light); }

/* tenure */
.tr-tenure { font-size: 11px; color: var(--slate-light); margin-top: 2px; }

/* calendar */
.tr-cal-card { padding: 0; overflow: hidden; }
.tr-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); }
.tr-cal-headcell { padding: 10px 6px; text-align: center; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--slate-light); border-bottom: 1px solid var(--line); }
.tr-cal-day { min-width: 0; min-height: 92px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 6px; cursor: default; display: flex; flex-direction: column; gap: 3px; }
.tr-cal-day:nth-child(7n) { border-right: none; }
.tr-cal-day-out { background: var(--paper); }
.tr-cal-day-out .tr-cal-daynum { color: var(--slate-light); }
.tr-cal-day-today { background: rgba(201,162,75,0.08); }
.tr-cal-daynum { font-size: 12.5px; font-weight: 600; color: var(--ink); }
.tr-cal-appts { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tr-cal-appt { font-size: 10.5px; line-height: 1.3; padding: 1px 4px; border-radius: 3px; background: var(--paper-dim); color: var(--slate); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; min-width: 0; }
.tr-cal-appt-recruit { border-left: 2px solid var(--type-recruit); }
.tr-cal-appt-sale { border-left: 2px solid var(--type-sale); }
.tr-cal-appt-both { border-left: 3px solid transparent; border-image: linear-gradient(180deg, var(--type-recruit) 50%, var(--type-sale) 50%) 1; }
.tr-cal-more { font-size: 10px; color: var(--slate-light); padding-left: 4px; }

/* google calendar */
.tr-google-card { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
.tr-cal-appt-google { border-left: 2px solid var(--slate-light); font-style: italic; }
.tr-note-item-google { border-left: 3px solid var(--slate-light); }

/* toast banner */
.tr-toast { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 200; padding: 12px 40px 12px 16px; border-radius: 8px; font-size: 13.5px; font-weight: 500; box-shadow: 0 4px 20px rgba(19,35,48,0.25); max-width: 90vw; }
.tr-toast-success { background: #2E6E51; color: #fff; }
.tr-toast-error { background: var(--rust); color: #fff; }
.tr-toast-close { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; color: inherit; font-size: 18px; line-height: 1; cursor: pointer; opacity: 0.85; padding: 4px; }
.tr-cal-day:hover { background: var(--paper-dim); }

/* needs-attention sidebar */
.tr-appts-shell { display: flex; gap: 24px; align-items: flex-start; }
.tr-appts-sidebar { display: flex; flex-direction: column; gap: 4px; min-width: 190px; flex-shrink: 0; }
.tr-appts-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 20px; }
.tr-sidebar-item { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 9px 12px; border-radius: 8px; border: 1px solid transparent; border-left-width: 3px; background: transparent; font-family: inherit; font-size: 13px; font-weight: 500; color: var(--slate); cursor: pointer; text-align: left; }
.tr-sidebar-item:hover { background: var(--paper-dim); }
.tr-sidebar-item-active { background: var(--paper-dim); border-color: var(--line); }
.tr-sidebar-item .tr-mono { font-size: 11.5px; color: var(--slate-light); background: var(--paper); border-radius: 999px; padding: 1px 7px; }
.tr-sidebar-item-week { border-left-color: var(--brass); font-family: 'Newsreader', serif; font-size: 14.5px; }
.tr-sidebar-item-none { border-left-color: var(--slate-light); }
.tr-sidebar-item-green { border-left-color: var(--green); }
.tr-sidebar-item-amber { border-left-color: var(--amber); }
.tr-sidebar-item-rust { border-left-color: var(--rust); }
.tr-sidebar-item-violet { border-left-color: var(--violet); }
.tr-sidebar-divider { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--slate-light); padding: 14px 12px 2px; }

/* auth */
.tr-auth-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
.tr-auth-card { width: 100%; max-width: 400px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 28px 26px; box-shadow: 0 4px 24px rgba(19,35,48,0.08); }
.tr-auth-sub { text-align: center; font-size: 13.5px; color: var(--slate-light); margin: 6px 0 18px; }
.tr-tabs { display: flex; background: var(--paper-dim); border-radius: 8px; padding: 3px; margin-bottom: 18px; }
.tr-tab { flex: 1; padding: 8px; border: none; background: transparent; border-radius: 6px; font-family: inherit; font-size: 13.5px; font-weight: 500; color: var(--slate-light); cursor: pointer; }
.tr-tab-active { background: var(--card); color: var(--ink); box-shadow: 0 1px 2px rgba(19,35,48,0.08); }
.tr-auth-form { display: flex; flex-direction: column; gap: 12px; }

/* spinner */
.tr-spinner { display: flex; align-items: center; gap: 8px; color: var(--slate-light); font-size: 13.5px; padding: 24px; justify-content: center; }

/* skeleton loading */
.tr-skel { border-radius: 4px; background: linear-gradient(90deg, var(--paper-dim) 25%, var(--line) 37%, var(--paper-dim) 63%); background-size: 400% 100%; animation: tr-skel-shimmer 1.4s ease infinite; }
@keyframes tr-skel-shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
.tr-skel-row { display: flex; align-items: center; gap: 14px; padding: 10px 0; border-bottom: 1px solid var(--line); }
.tr-skel-row:last-child { border-bottom: none; }
@media (prefers-reduced-motion: no-preference) { .tr-spin { animation: tr-rotate 0.9s linear infinite; } }
@keyframes tr-rotate { to { transform: rotate(360deg); } }

/* responsive */
@media (max-width: 720px) {
  .tr-pace-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
  .tr-form-grid { grid-template-columns: 1fr; }
  .tr-pace-grid { grid-template-columns: 1fr; }
  .tr-header { padding: 12px 16px; }
  .tr-header-name { display: none; }
  .tr-main { padding: 18px 14px 48px; }
  .tr-tabs { flex-wrap: wrap; }
  .tr-tabs .tr-tab { flex: 1 1 45%; }
  .tr-appts-shell { flex-direction: column; }
  .tr-appts-sidebar { flex-direction: row; flex-wrap: wrap; min-width: 0; width: 100%; gap: 6px; }
  .tr-sidebar-divider { flex-basis: 100%; padding: 8px 4px 0; }
  .tr-cal-day { min-height: 60px; padding: 3px; }
  .tr-cal-headcell { font-size: 9px; padding: 6px 1px; }
  .tr-cal-daynum { font-size: 11px; }
  .tr-cal-appt { font-size: 8.5px; padding: 0 2px; }
  .tr-dash-strip { gap: 8px; }
  .tr-dash-stat { padding: 10px 10px; }
  .tr-dash-num { font-size: 18px; }
  .tr-dash-label { font-size: 10.5px; }
  .tr-policy-fields { gap: 12px; }
  .tr-skel-row { gap: 8px; overflow-x: hidden; }
  .tr-skel-row .tr-skel { flex-shrink: 1; min-width: 30px; }
}
`;
