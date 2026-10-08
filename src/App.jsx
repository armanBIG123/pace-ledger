import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LogIn, LogOut, Plus, Trash2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Users,
  CalendarDays, ShieldCheck, UserPlus, Loader2, Pencil, ClipboardCheck, TrendingUp, UserCog, DollarSign,
  Download, Search, X, GraduationCap, FileText, Ban, Menu, Award, Calendar, Copy, Check,
  Sun, Video, Sparkles
} from 'lucide-react';
import { supabase } from './supabaseClient.js';
import { buildInviteLink, inviteState, fetchInviteForAppointment, createInvite, fetchInvitePreview } from './invites.js';
import {
  ONBOARDING_DAYS, ONBOARDING_WEEKS, onboardingDay, weekForDay, computeOnboarding, shouldShowOnboarding,
  fetchMyOnboarding, saveOnboardingSnapshot, setOnboardingVisibility, fetchTeamOnboarding,
  onboardingStepTitle, onboardingStepWeek,
} from './onboarding.js';
import {
  isNativeApp, publicBaseUrl, openInBrowserSheet, shareOrCopy, shareCsvFile, PUBLIC_SITE_URL,
  reminderPermission, requestReminderPermission, syncAppointmentReminders, clearAppointmentReminders,
  onAppResume, onReminderTapped, REMINDER_MINUTES, onAndroidBack, minimizeAndroidApp,
  exactReminderStatus, requestExactReminders,
} from './native.js';

// Signs out, first clearing this person's appointment reminders from the phone.
async function signOut() {
  await clearAppointmentReminders();
  await supabase.auth.signOut();
}
import {
  HIERARCHY_TIERS, HIERARCHY_TIER_WINDOW_LABELS, hierarchyTierLabel,
  nextTierAfter, isLicensed, computeTierProgress, computeDownline, computeUpline,
} from './hierarchy.js';
import {
  fetchDocuments, uploadDocument, deleteDocument, updateDocumentTitle,
  fetchImportantLinks, addImportantLink, updateImportantLink, deleteImportantLink,
  getDocumentDownloadUrl, formatFileSize,
} from './documents.js';
import {
  fetchScheduleBlocksInRange, createScheduleBlock, deleteScheduleBlock, deleteScheduleBlockSeries,
  checkAppointmentConflict,
} from './schedule.js';
import {
  DEFAULT_BUSINESS_PLAN_FIELDS, rowToBusinessPlanFields, fetchBusinessPlan, saveBusinessPlan,
  computeExpensesSubtotal, computeMonthlyGrossIncomeNeeded, computeAnnualGrossIncomeNeeded,
  computeCommissionPerTransaction, computeTransactionsNeededPerYear, computeProspectsNeededPerYear,
  computeMonthlyProspects, computeDailyProspects,
} from './businessPlan.js';
import { createClientIntakeCandidate, fetchClientIntakeCandidates, deleteClientIntakeCandidate } from './clientIntake.js';
import { ClientIntakePublicForm, ClientIntakeSection } from './ClientIntake.jsx';
import { fetchMyFollowUpNotes, addFollowUpNote, deleteFollowUpNote } from './followUpNotes.js';
import { CSS } from './styles.js';

const WEEKEND_TARGET = 8;
const WEEKDAY_TARGET = 5;
const WEEKLY_TOTAL_TARGET = WEEKEND_TARGET + WEEKDAY_TARGET * 5; // 33

// ---------------------------------------------------------------------
// date helpers
// ---------------------------------------------------------------------
// Calendar date in the viewer's own timezone. (This previously used
// toISOString(), which is UTC — so after 7 PM Central "today" flipped to
// tomorrow, and a Friday-evening log could land in the next week.)
function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// Adds minutes to a date+time pair, correctly rolling over into the next
// day if needed (e.g. an 11:45 PM appointment + 30 min).
function addMinutesToDateTime(dateStr, timeStr, minutesToAdd) {
  const dt = new Date(`${dateStr}T${timeStr}:00`);
  dt.setMinutes(dt.getMinutes() + minutesToAdd);
  const pad = n => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:00`;
}
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
// A training posted at, say, 7pm ET needs to show as 6pm for someone in
// Central time — these convert the stored UTC instant into whichever
// calendar day and clock time it actually falls on for the person
// looking at it, rather than repeating the raw stored values verbatim.
// Falls back to the raw stored value for any training saved before this
// existed (training_at will be null until the row is re-saved).
// Same idea for appointments on the Calendar: a 7:30 PM Eastern
// appointment shows as 6:30 PM (and on the right day) for someone in
// Central time. Falls back to the stored values for legacy rows.
function apptLocalDate(a) {
  if (!a.appointmentAt) return a.appointmentDate;
  const d = new Date(a.appointmentAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function apptLocalTimeKey(a) {
  if (!a.appointmentAt) return (a.appointmentTime || '00:00').slice(0, 5);
  const d = new Date(a.appointmentAt);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function trainingLocalDate(t) {
  return t.training_at ? fmtDate(new Date(t.training_at)) : t.training_date;
}
function trainingLocalTimeKey(t) {
  if (!t.training_at) return (t.training_time || '00:00').slice(0, 5);
  const d = new Date(t.training_at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
    presenterId: row.presenter_id || '',
    trainee: row.trainee || '',
    traineeId: row.trainee_id || '',
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
    clientIntakeRequested: row.client_intake_requested || false,
    clientEmail: row.client_email || '',
    inviteeEmails: row.invitee_emails || [],
    inviteMethod: row.invite_method || '',
    inviteSentAt: row.invite_sent_at || null,
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
// Trainings are org-wide — RLS returns every training to every signed-in
// person, regardless of role or reporting structure, unlike appointments.
async function fetchTrainingsInRange(startDate, endDate) {
  const { data, error } = await supabase
    .from('trainings').select('*')
    .gte('training_date', startDate)
    .lte('training_date', endDate)
    .order('training_date', { ascending: true })
    .order('training_time', { ascending: true });
  if (error) { console.error(error); return []; }
  return data;
}
async function createTraining({ title, date, time, timezone, zoomUrl, notes, userId, userName, recurring, repeatUntil }) {
  const base = {
    title, training_time: time, timezone,
    zoom_url: zoomUrl || null, notes: notes || null,
    created_by: userId, created_by_name: userName,
  };
  if (!recurring || !repeatUntil) {
    const { data, error } = await supabase.from('trainings').insert({ ...base, training_date: date }).select().single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, records: [data] };
  }
  // One row per week from the start date through repeatUntil (inclusive) —
  // simpler and more robust than computing recurrence at read time, and
  // lets each occurrence be individually edited/deleted later if needed.
  const groupId = crypto.randomUUID();
  const rows = [];
  let cursor = date;
  while (cursor <= repeatUntil) {
    rows.push({ ...base, training_date: cursor, recurring_group_id: groupId });
    cursor = fmtDate(addDays(parseDate(cursor), 7));
  }
  const { data, error } = await supabase.from('trainings').insert(rows).select();
  if (error) return { ok: false, error: error.message };
  return { ok: true, records: data };
}
async function deleteTraining(id) {
  const { error } = await supabase.from('trainings').delete().eq('id', id);
  return !error;
}
// Deletes this occurrence and every future one in the same weekly series,
// leaving past occurrences intact as history.
async function deleteTrainingSeries(groupId, fromDate) {
  const { error } = await supabase.from('trainings').delete().eq('recurring_group_id', groupId).gte('training_date', fromDate);
  return !error;
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
async function downloadCSV(filename, rows) {
  const csv = rows.map(row => row.map(cell => {
    const s = String(cell ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n');
  // Inside the iPhone app a browser download does nothing; use the share sheet.
  try { if (await shareCsvFile(filename, csv)) return; } catch { /* fall back to a normal download */ }
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
// The date someone joined PaceLedger, e.g. 08/26/2026.
function joinedDate(createdAt) {
  if (!createdAt) return '—';
  return new Date(createdAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
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
  const updatePayload = {
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
  };
  // Only ever flips this on — never overwrites an existing "yes" back to
  // "no" if a follow-up is edited/re-saved later without touching this
  // question, so the candidate record it created is never orphaned.
  if (data.clientIntake === true) updatePayload.client_intake_requested = true;
  const { error } = await supabase.from('appointments').update(updatePayload).eq('id', id);
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
    client_email: original.clientEmail || null,
    notes: `Follow-up to appointment on ${fmtDisplayDate(original.appointmentDate)}`,
    presentation_type: original.presentationType || null,
    presentation_type_secondary: original.presentationTypeSecondary || null,
    zoom_url: original.zoomUrl || null,
    is_follow_up: true,
  }).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, record: rowToRecord(data) };
}
// ---------------------------------------------------------------------
// systems — prospecting ability
// ---------------------------------------------------------------------
// Characteristics 1-5 skew toward sale potential; 6-9 skew toward recruit
// potential. A prospect strong in both is good for either.
const SALE_CHARACTERISTICS = [
  { key: 'charAge25Plus', dbCol: 'char_age_25_plus', label: 'Is 25 years or older', hint: 'Key age for financial planning' },
  { key: 'charMarried', dbCol: 'char_married_or_relationship', label: 'Married, or in a relationship', hint: 'Someone big they care about' },
  { key: 'charDependents', dbCol: 'char_has_dependents', label: 'Has children or dependents', hint: 'People relying on them' },
  { key: 'charHomeowner', dbCol: 'char_homeowner', label: 'Is a homeowner', hint: 'Needs to protect their assets' },
  { key: 'charWorking', dbCol: 'char_currently_working', label: 'Is currently working', hint: 'Needs to protect their income' },
];
const RECRUIT_CHARACTERISTICS = [
  { key: 'charAmbitious', dbCol: 'char_ambitious', label: 'Ambitious' },
  { key: 'charDissatisfied', dbCol: 'char_dissatisfied', label: 'Dissatisfied with where they are' },
  { key: 'charCoachable', dbCol: 'char_coachable', label: 'Coachable / positive mindset and attitude' },
  { key: 'charEntrepreneur', dbCol: 'char_entrepreneur', label: 'Entrepreneur' },
];
const ALL_CHARACTERISTICS = [...SALE_CHARACTERISTICS, ...RECRUIT_CHARACTERISTICS];
const LEANING_LABELS = { none: 'Not yet scored', sale: 'Sale potential', recruit: 'Recruit potential', both: 'Both' };
const PROSPECT_SOURCES = ['Referral', 'Cold outreach', 'Event', 'Social media', 'Other'];
// Tier definitions, downline/upline traversal, and the tier-progress
// engine (HIERARCHY_TIERS, computeTierProgress, computeDownline,
// computeUpline, isLicensed, etc.) now live in ./hierarchy.js — see the
// import at the top of this file.

// For a manager checking their whole team at once, rather than one
// person checking their own progress — runs the same engine per member,
// in parallel, and returns everyone's full progress toward their next
// tier. Skips anyone with no tier set or already at the top, since
// there's nothing to compute for them. Filter the result for allMet to
// get just who's ready.
async function computeTeamPromotionProgress(members, orgDirectory) {
  const eligible = members.filter(m => m.hierarchy_tier && nextTierAfter(m.hierarchy_tier));
  const results = await Promise.all(eligible.map(async m => {
    const [myAppts, traineeAppts] = await Promise.all([
      fetchMyAppointments(m.id),
      fetchAppointmentsAsTrainee(m.id),
    ]);
    const downline = computeDownline(m.id, orgDirectory).filter(p => p.id !== m.id);
    const downlineAppts = await fetchAppointmentsForUserIds(downline.map(p => p.id));
    const progress = computeTierProgress(m, orgDirectory, myAppts, downlineAppts, traineeAppts);
    return { member: m, progress };
  }));
  return results;
}

function prospectSaleScore(p) { return SALE_CHARACTERISTICS.filter(c => p[c.key]).length; }
function prospectRecruitScore(p) { return RECRUIT_CHARACTERISTICS.filter(c => p[c.key]).length; }
function prospectTotalChecked(p) { return prospectSaleScore(p) + prospectRecruitScore(p); }
function prospectLeaningKey(p) {
  const s = prospectSaleScore(p), r = prospectRecruitScore(p);
  if (s === 0 && r === 0) return 'none';
  if (s > r) return 'sale';
  if (r > s) return 'recruit';
  return 'both';
}
// Carries a prospect's leaning and notes straight into the appointment
// form, not just their name, so logging the resulting appointment doesn't
// mean re-entering what was already captured while prospecting.
function prospectToAppointmentPrefill(p) {
  const leaning = prospectLeaningKey(p);
  return {
    client: `${p.firstName} ${p.lastName}`,
    notes: p.notes || '',
    clientEmail: p.email || '',
    typeRecruit: leaning === 'recruit' || leaning === 'both',
    typeSale: leaning === 'sale' || leaning === 'both',
  };
}
function daysAgoLabel(dateStr) {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Logged today';
  if (days === 1) return 'Logged 1 day ago';
  return `Logged ${days} days ago`;
}
// No "last contacted" field exists yet, so createdAt is the best available
// proxy — a prospect still sitting active (unconverted) two-plus weeks
// after being logged is a fair signal it needs a follow-up nudge.
const STALE_PROSPECT_DAYS = 14;
function normName(s) { return (s || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
function prospectNameKey(p) { return normName(`${p.firstName || ''} ${p.lastName || ''}`); }
// A prospect only counts as stale if nothing has happened with them —
// pass the set of client names you've logged appointments for and anyone
// with an appointment on the books is no longer considered stale.
function isStaleProspect(p, apptNames) {
  if (p.markedRecruited || p.markedSold) return false;
  if (apptNames instanceof Set && apptNames.has(prospectNameKey(p))) return false;
  const days = Math.floor((Date.now() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24));
  return days >= STALE_PROSPECT_DAYS;
}
function rowToProspect(row) {
  const rec = {
    id: row.id, userId: row.user_id,
    firstName: row.first_name, lastName: row.last_name,
    age: row.age, relationshipStrength: row.relationship_strength,
    notes: row.notes || '', createdAt: row.created_at, source: row.source || '',
    email: row.email || '',
    markedSold: row.marked_sold || false, markedRecruited: row.marked_recruited || false,
  };
  ALL_CHARACTERISTICS.forEach(c => { rec[c.key] = !!row[c.dbCol]; });
  return rec;
}
async function fetchMyProspects(userId) {
  const { data, error } = await supabase.from('prospects').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return data.map(rowToProspect);
}
// For managers/admins — RLS automatically scopes this to their own
// prospects plus their team's (or everyone's, for super_admin), same
// pattern as fetchSoldPolicies.
async function fetchAllVisibleProspects() {
  const { data, error } = await supabase.from('prospects').select('*').order('created_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return data.map(rowToProspect);
}
async function insertProspect(userId, form) {
  const payload = {
    user_id: userId,
    first_name: form.firstName.trim(),
    last_name: form.lastName.trim(),
    age: form.age ? Number(form.age) : null,
    relationship_strength: form.relationshipStrength,
    notes: form.notes.trim() || null,
    source: form.source || null,
    email: (form.email || '').trim() || null,
  };
  ALL_CHARACTERISTICS.forEach(c => { payload[c.dbCol] = !!form[c.key]; });
  const { data, error } = await supabase.from('prospects').insert(payload).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, record: rowToProspect(data) };
}
async function updateProspect(id, form) {
  const payload = {
    first_name: form.firstName.trim(),
    last_name: form.lastName.trim(),
    age: form.age ? Number(form.age) : null,
    relationship_strength: form.relationshipStrength,
    notes: form.notes.trim() || null,
    source: form.source || null,
    email: (form.email || '').trim() || null,
  };
  ALL_CHARACTERISTICS.forEach(c => { payload[c.dbCol] = !!form[c.key]; });
  const { data, error } = await supabase.from('prospects').update(payload).eq('id', id).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, record: rowToProspect(data) };
}
async function updateProspectOutcome(id, { markedSold, markedRecruited }) {
  const payload = {};
  if (markedSold !== undefined) payload.marked_sold = markedSold;
  if (markedRecruited !== undefined) payload.marked_recruited = markedRecruited;
  const { error } = await supabase.from('prospects').update(payload).eq('id', id);
  return !error;
}
async function deleteProspect(id) {
  const { error } = await supabase.from('prospects').delete().eq('id', id);
  return !error;
}

async function fetchMyAppointments(userId) {
  const { data, error } = await supabase
    .from('appointments').select('*').eq('user_id', userId)
    .order('appointment_date', { ascending: true });
  if (error) { console.error(error); return []; }
  return data.map(rowToRecord);
}
// For Base Shop premium — relies on the recursive-downline RLS policy to
// correctly include everyone under someone, at any depth, not just
// direct reports.
async function fetchAppointmentsForUserIds(userIds) {
  if (userIds.length === 0) return [];
  const { data, error } = await supabase.from('appointments').select('*').in('user_id', userIds);
  if (error) { console.error(error); return []; }
  return data.map(rowToRecord);
}
// For observation-sales tracking — appointments where this person was
// the trainee, regardless of who logged it (relies on the
// trainee-visibility RLS policy).
async function fetchAppointmentsAsTrainee(userId) {
  const { data, error } = await supabase.from('appointments').select('*').eq('trainee_id', userId);
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
    presenter_id: form.presenterId || null,
    trainee: form.trainee.trim() || null,
    trainee_id: form.traineeId || null,
    client_name: form.client.trim(),
    client_email: (form.clientEmail || '').trim() || null,
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
    presenter_id: form.presenterId || null,
    trainee: form.trainee.trim() || null,
    trainee_id: form.traineeId || null,
    client_name: form.client.trim(),
    client_email: (form.clientEmail || '').trim() || null,
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
function inviteFailureMessage(code, isUpdate = false) {
  if (code === 'too_soon') return "Saved. An invite for this appointment was just sent, so another wasn't sent — wait a minute and try again.";
  if (code === 'daily_limit') return "Saved, but you've hit today's limit for emailed invites. Try again tomorrow.";
  if (code === 'email_not_configured') return isUpdate
    ? "Saved, but the updated invite wasn't emailed — PaceLedger's email sending isn't set up yet."
    : "Saved, but the invite wasn't emailed — connect Google Calendar (Calendar tab), or ask your admin to finish PaceLedger's email setup.";
  return "Saved, but the invite couldn't be emailed. You can try again by editing the appointment and checking \"Email an updated invite\".";
}
// Records who the Zoom link was sent to, and how ('google' or 'email').
async function markInviteSent(id, emails, method) {
  const { error } = await supabase.from('appointments')
    .update({ invitee_emails: emails, invite_method: method, invite_sent_at: new Date().toISOString() }).eq('id', id);
  return !error;
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
async function fetchOrgDirectory() {
  const { data, error } = await supabase.from('org_directory').select('*');
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
// One consistent page title row: title, an optional one-line summary,
// and the page's main action(s) on the right.
function PageHead({ title, sub, children }) {
  return (
    <div className="tr-pagehead">
      <div className="tr-pagehead-text">
        <h2 className="tr-h2">{title}</h2>
        {sub ? <p className="tr-pagehead-sub">{sub}</p> : null}
      </div>
      {children ? <div className="tr-pagehead-actions">{children}</div> : null}
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
// The navy band at the top: brand + account on one row, and (when a view
// passes `nav`) the section tabs on a second row, so navigation reads as
// part of the frame rather than floating over the page.
function Header({ user, nav }) {
  const [accountOpen, setAccountOpen] = useState(false);
  return (
    <>
    <header className={`tr-header ${nav ? 'tr-header-with-nav' : ''}`}>
      <div className="tr-header-row">
        <div className="tr-brand"><ShieldCheck size={20} /> <span>Pace<em>Ledger</em></span></div>
        <div className="tr-header-user">
          <button type="button" className="tr-header-account" onClick={() => setAccountOpen(true)} title="Your account">
            <span className="tr-header-name">{user.displayName}</span>
            <span className="tr-header-firstname">{(user.displayName || '').trim().split(/\s+/)[0]}</span>
            <span className="tr-header-role">{user.role === 'super_admin' ? 'Admin' : user.role}</span>
          </button>
          <button className="tr-icon-btn" onClick={signOut} title="Log out" aria-label="Log out"><LogOut size={16} /></button>
        </div>
      </div>
      {nav ? <div className="tr-header-nav">{nav}</div> : null}
    </header>
    {/* Outside the header so header styles and stacking don't apply to it. */}
    {accountOpen && <AccountSheet user={user} onClose={() => setAccountOpen(false)} />}
    </>
  );
}
// Deletes the signed-in person's account and everything they own. Done by
// a server function because only the server may remove a login.
async function deleteMyAccount() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return { ok: false, error: 'not_signed_in' };
  try {
    const res = await fetch(`${supabase.supabaseUrl}/functions/v1/delete-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}`, apikey: supabase.supabaseKey },
      body: JSON.stringify({ confirm: 'DELETE' }),
    });
    const json = await res.json().catch(() => ({}));
    return res.ok && json.deleted ? { ok: true } : { ok: false, error: json.error || `http_${res.status}` };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}
// Invite anyone onto your own team (for recruits who aren't tied to a
// logged appointment). The link is personal, single-use and puts them
// directly under you.
function InviteSomeone({ user }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function make() {
    setBusy(true); setErr('');
    const res = await createInvite({ uplineId: user.id, createdBy: user.id, inviteeName: name });
    setBusy(false);
    if (!res.ok) { setErr("Couldn't create the link. Try again."); return; }
    setInvite(res.invite);
  }
  if (!open) {
    return <button type="button" className="tr-btn tr-btn-ghost tr-btn-block" style={{ marginBottom: 8 }} onClick={() => setOpen(true)}><UserPlus size={15} /> Invite someone to your team</button>;
  }
  return (
    <div className="tr-invite-box" style={{ marginBottom: 12 }}>
      <div className="tr-invite-title">Invite someone to your team</div>
      {invite ? (
        <>
          <p className="tr-empty" style={{ margin: 0 }}>Send this to {invite.invitee_name || 'them'}. It puts them directly under you.</p>
          <InviteShare invite={invite} recruitName={invite.invitee_name} />
          <button type="button" className="tr-link-btn" style={{ marginTop: 6 }} onClick={() => { setInvite(null); setName(''); }}>Invite someone else</button>
        </>
      ) : (
        <>
          <label className="tr-field">
            <span>Their name (optional)</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Jordan Blake" />
          </label>
          {err && <div className="tr-error">{err}</div>}
          <div className="tr-form-actions" style={{ marginTop: 8 }}>
            <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={make} disabled={busy}>{busy ? 'Creating…' : 'Create link'}</button>
          </div>
        </>
      )}
    </div>
  );
}
// Your account: turn the First 30 days checklist on Today on or off.
function OnboardingToggle({ user }) {
  const [row, setRow] = useState(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetchMyOnboarding(user.id).then(r => setRow(r && !r.error ? r : null)); }, [user.id]);
  if (row === undefined) return null;
  const day = onboardingDay(user.createdAt);
  const vis = (row && row.visibility) || 'auto';
  const allDone = !!(row && row.total_count > 0 && !row.next_step);
  const showing = shouldShowOnboarding(day, vis, allDone);
  async function flip() {
    setBusy(true);
    const next = showing ? 'hidden' : 'shown';
    if (await setOnboardingVisibility(user.id, next)) setRow(r => ({ ...(r || {}), visibility: next }));
    setBusy(false);
  }
  return (
    <div className="tr-account-toggle">
      <div>
        <div className="tr-account-toggle-title">First 30 days checklist</div>
        <div className="tr-account-toggle-sub">The step-by-step guide for new advisors on Today.</div>
      </div>
      <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={flip} disabled={busy}>{showing ? 'Hide' : 'Show on Today'}</button>
    </div>
  );
}
function AccountSheet({ user, onClose }) {
  const [step, setStep] = useState('view'); // 'view' | 'confirm'
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function handleDelete() {
    setBusy(true); setError('');
    const res = await deleteMyAccount();
    if (!res.ok) {
      setBusy(false);
      setError(res.error === 'last_admin'
        ? "You're the only admin. Make someone else an admin in Manage Team first, then delete your account."
        : "Your account couldn't be deleted. Check your connection and try again, or contact support.");
      return;
    }
    await signOut();
  }
  return (
    <div className="tr-modal-backdrop" onClick={onClose}>
      <div className="tr-modal-card tr-account" role="dialog" aria-modal="true" aria-labelledby="tr-account-title" onClick={e => e.stopPropagation()}>
        <div className="tr-row-head">
          <h3 className="tr-h3" id="tr-account-title" style={{ margin: 0 }}>Your account</h3>
          <button type="button" className="tr-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <dl className="tr-account-list">
          <div><dt>Name</dt><dd>{user.displayName}</dd></div>
          <div><dt>Email</dt><dd>{user.email || '—'}</dd></div>
          <div><dt>Role</dt><dd style={{ textTransform: 'capitalize' }}>{user.role === 'super_admin' ? 'Admin' : user.role}</dd></div>
        </dl>
        <div className="tr-account-links">
          <a href={`${PUBLIC_SITE_URL}/privacy-policy.html`} target="_blank" rel="noopener noreferrer">Privacy policy</a>
          <a href={`${PUBLIC_SITE_URL}/terms-of-service.html`} target="_blank" rel="noopener noreferrer">Terms of service</a>
          <a href={`${PUBLIC_SITE_URL}/support.html`} target="_blank" rel="noopener noreferrer">Support</a>
        </div>
        <OnboardingToggle user={user} />
        <InviteSomeone user={user} />
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-block" onClick={signOut}><LogOut size={15} /> Log out</button>

        <div className="tr-account-danger">
          {step === 'view' ? (
            <button type="button" className="tr-link-danger" onClick={() => setStep('confirm')}>Delete my account</button>
          ) : (
            <>
              <h4 className="tr-h4" style={{ color: 'var(--rust)' }}>Delete your account permanently</h4>
              <p className="tr-account-warn">
                This deletes your login and everything you've added: appointments, prospects, follow-up notes, your business plan,
                client intake forms you sent, and your Google Calendar and Zoom connections. It can't be undone.
                Anyone who reports to you will need a new manager assigned by an admin.
              </p>
              <label className="tr-field">
                <span>Type DELETE to confirm</span>
                <input value={typed} onChange={e => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" />
              </label>
              {error && <div className="tr-error">{error}</div>}
              <div className="tr-form-actions">
                <button type="button" className="tr-btn tr-btn-ghost" onClick={() => { setStep('view'); setTyped(''); setError(''); }} disabled={busy}>Cancel</button>
                <button type="button" className="tr-btn tr-btn-danger" onClick={handleDelete} disabled={typed.trim().toUpperCase() !== 'DELETE' || busy}>
                  {busy ? 'Deleting…' : 'Delete my account'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
// Manager/admin switch between their own work and the team views.
function GroupSwitch({ group, onSelect, teamLabel }) {
  return (
    <div className="tr-groupswitch" role="tablist" aria-label="Workspace">
      <button type="button" role="tab" aria-selected={group === 'mine'} className={group === 'mine' ? 'tr-groupswitch-on' : ''} onClick={() => onSelect('mine')}>My work</button>
      <button type="button" role="tab" aria-selected={group === 'team'} className={group === 'team' ? 'tr-groupswitch-on' : ''} onClick={() => onSelect('team')}>{teamLabel}</button>
    </div>
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
// Read-only for the advisor — they can see what their manager left for the
// week they're currently viewing, but only a manager/admin can write one.
function MyCoachingNotes({ userId, weekOf }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchCoachingNotes(userId, weekOf).then(rows => { setNotes(rows); setLoading(false); });
  }, [userId, weekOf]);

  if (loading || notes.length === 0) return null;

  return (
    <div className="tr-card tr-coaching-panel" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
      <h4 className="tr-h4">A note from your manager, for this week</h4>
      <div className="tr-notes-list">
        {notes.map(n => (
          <div key={n.id} className="tr-note-item">
            <div className="tr-note-meta">{n.author_name} · {new Date(n.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
            <div>{n.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
function PaceStrip({ groups, header }) {
  const total = groups.reduce((n, g) => n + g.count, 0);
  const target = groups.reduce((n, g) => n + g.option.target, 0);
  return (
    <div className="tr-card tr-pace">
      {header ? <div className="tr-pace-head">{header}<span className="tr-pace-total"><strong>{total}</strong> / {target} set</span></div> : null}
      <p className="tr-pace-hint">The {WEEKEND_TARGET} you commit to over the weekend for the week ahead, plus {WEEKDAY_TARGET} new ones each weekday.</p>
      <div className="tr-pace-grid">
        {groups.map(g => (
          <div className="tr-pace-group" key={g.option.value}>
            <div className="tr-pace-label">
              <span><span className="tr-hide-mobile">{g.option.batchLabel}</span><span className="tr-mobile-only">{g.option.category === 'weekend' ? 'Weekend' : g.option.label}</span></span>
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
// Best week ever, current streak, and longest-ever streak of weeks
// hitting the 33/week target — computed from whatever's already loaded,
// no extra fetch. Walks real calendar weeks via shiftWeekStr rather than
// just array positions, so a gap in the data correctly breaks a streak.
function computeStreaksAndBests(appointments) {
  const weekTotals = {};
  appointments.filter(a => !a.isFollowUp).forEach(a => {
    weekTotals[a.weekOf] = (weekTotals[a.weekOf] || 0) + 1;
  });
  const currentActualWeek = weekStartOf(todayStr());

  let bestWeekCount = 0;
  Object.values(weekTotals).forEach(c => { if (c > bestWeekCount) bestWeekCount = c; });

  // Current streak: walk backward from the most recently completed week.
  let currentStreak = 0;
  let cursor = shiftWeekStr(currentActualWeek, -1);
  while ((weekTotals[cursor] || 0) >= WEEKLY_TOTAL_TARGET) {
    currentStreak++;
    cursor = shiftWeekStr(cursor, -1);
  }

  // Longest streak ever: walk forward across real weeks from the earliest
  // one with any data, through the last completed week.
  let longestStreak = 0;
  const allWeeks = Object.keys(weekTotals).sort();
  if (allWeeks.length > 0) {
    let runLength = 0;
    let w = allWeeks[0];
    const lastCompletedWeek = shiftWeekStr(currentActualWeek, -1);
    while (w <= lastCompletedWeek) {
      if ((weekTotals[w] || 0) >= WEEKLY_TOTAL_TARGET) {
        runLength++;
        longestStreak = Math.max(longestStreak, runLength);
      } else {
        runLength = 0;
      }
      w = shiftWeekStr(w, 1);
    }
  }

  return { bestWeekCount, currentStreak, longestStreak };
}
function PersonalBests({ appointments }) {
  const { bestWeekCount, currentStreak, longestStreak } = computeStreaksAndBests(appointments);
  if (bestWeekCount === 0) return null;
  return (
    <div className="tr-card tr-bests">
      <div className="tr-bests-stat">
        <span className="tr-dash-num">{bestWeekCount}</span>
        <span className="tr-dash-label">best week ever</span>
      </div>
      <div className="tr-bests-stat">
        <span className="tr-dash-num">{currentStreak}</span>
        <span className="tr-dash-label">week streak{currentStreak !== 1 ? 's' : ''} on pace</span>
      </div>
      <div className="tr-bests-stat">
        <span className="tr-dash-num">{longestStreak}</span>
        <span className="tr-dash-label">longest streak ever</span>
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
function ApptGroup({ title, list, onDelete, onFollowUp, onEdit, empty, hideSet }) {
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

// ---------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// Sign-up is by invitation only: big-pace-ledger.com/?join=<token>.
// The link (made by the inviter, see invites.js) decides the new person's
// team; the database enforces it, so it can't be changed from the browser.
// ---------------------------------------------------------------------
function readJoinToken() {
  return new URLSearchParams(window.location.search).get('join') || '';
}
function AuthScreen() {
  const [joinToken] = useState(readJoinToken);
  const [invite, setInvite] = useState(joinToken ? { loading: true } : null); // null = no link
  const [mode, setMode] = useState(joinToken ? 'signup' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!joinToken) return;
    fetchInvitePreview(joinToken).then(res => {
      setInvite(res);
      if (res && res.valid) setDisplayName(res.inviteeName || '');
      else setMode('login');
    });
  }, [joinToken]);

  const canSignUp = !!(invite && invite.valid);

  async function submit() {
    setError(''); setNotice('');
    const mail = email.trim();
    if (!mail || !password) { setError('Enter an email and password.'); return; }
    setBusy(true);
    try {
      if (mode === 'signup') {
        if (!canSignUp) { setError('You need an invitation link to create an account.'); return; }
        if (!displayName.trim()) { setError('Enter your full name.'); return; }
        if (password.length < 6) { setError('Password needs to be at least 6 characters.'); return; }
        const { data, error: signErr } = await supabase.auth.signUp({
          email: mail,
          password,
          // Only the invitation is sent; the database works out the team from it.
          options: { data: { display_name: displayName.trim(), invite_token: joinToken } },
        });
        if (signErr) {
          setError(/database error/i.test(signErr.message)
            ? "This invitation link can't be used anymore. Ask the person who invited you for a new one."
            : signErr.message);
          return;
        }
        // Supabase answers "success" without creating anything when the
        // email already has an account (the invitation isn't used).
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setError('An account with this email already exists. Choose "I already have one" to log in.');
          return;
        }
        // The link is used up now; drop it from the address bar.
        window.history.replaceState({}, '', window.location.pathname);
        if (!data.session) {
          setNotice('Account created. Check your email to confirm it, then log in.');
          setInvite(null);
          setMode('login');
        }
      } else {
        const { error: loginErr } = await supabase.auth.signInWithPassword({ email: mail, password });
        if (loginErr) { setError(loginErr.message); return; }
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
      redirectTo: isNativeApp() ? PUBLIC_SITE_URL : window.location.origin,
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setNotice('Check your email for a link to reset your password.');
  }
  function handleKeyDown(e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } }

  const inviteProblem = invite && !invite.loading && !invite.valid
    ? (invite.reason === 'used' ? 'This invitation link has already been used to create an account.'
      : invite.reason === 'expired' ? 'This invitation link has expired.'
      : invite.reason === 'error' ? "We couldn't check your invitation. Check your connection and reload this page."
      : "This invitation link isn't valid.")
    : '';
  const teamLine = canSignUp
    ? [invite.uplineName, ...(invite.aboveUpline || [])].filter(Boolean).join(' → ')
    : '';

  return (
    <Shell>
      <div className="tr-auth-wrap">
        <div className="tr-auth-card" onKeyDown={handleKeyDown}>
          <div className="tr-brand tr-brand-center"><ShieldCheck size={22} /> <span>Pace<em>Ledger</em></span></div>
          <p className="tr-auth-sub">{canSignUp ? 'You\'ve been invited to PaceLedger. Create your account to get started.' : 'Appointment-setting pace tracking for advisors and managers.'}</p>
          {canSignUp && (
            <div className="tr-tabs">
              <button className={`tr-tab ${mode === 'signup' ? 'tr-tab-active' : ''}`} onClick={() => { setMode('signup'); setError(''); setNotice(''); }}>Create account</button>
              <button className={`tr-tab ${mode === 'login' ? 'tr-tab-active' : ''}`} onClick={() => { setMode('login'); setError(''); setNotice(''); }}>I already have one</button>
            </div>
          )}
          {invite && invite.loading ? <Spinner label="Checking your invitation…" /> : (
          <div className="tr-auth-form">
            {inviteProblem && (
              <div className="tr-error" style={{ marginTop: 0 }}>{inviteProblem}{invite.reason === 'error' ? '' : ' Ask the person who invited you to send a new link.'}</div>
            )}
            {mode === 'signup' && canSignUp && (
              <div className="tr-join-box">
                <div>You're joining <strong>{invite.uplineName}</strong>'s team.</div>
                {invite.aboveUpline && invite.aboveUpline.length > 0 && (
                  <div className="tr-join-chain">{teamLine}</div>
                )}
              </div>
            )}
            {mode === 'signup' && (
              <label className="tr-field">
                <span>Full name</span>
                <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Jordan Blake" autoComplete="name" />
              </label>
            )}
            <label className="tr-field">
              <span>Email</span>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jordan@yourcompany.com" autoCapitalize="none" autoComplete="email" />
            </label>
            <label className="tr-field">
              <span>Password</span>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
            </label>
            {mode === 'login' && (
              <button type="button" className="tr-link-btn" onClick={forgotPassword} disabled={busy}>Forgot password?</button>
            )}
            {notice && <div className="tr-badge tr-badge-weekday">{notice}</div>}
            {error && <div className="tr-error">{error}</div>}
            <button type="button" className="tr-btn tr-btn-brass tr-btn-block" onClick={submit} disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? <><LogIn size={16} /> Log in</> : <><UserPlus size={16} /> Create account</>}
            </button>
            {!canSignUp && (
              <p className="tr-auth-invite-note">New to PaceLedger? Accounts are by invitation only. Ask the person recruiting you for your sign-up link.</p>
            )}
          </div>
          )}
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

function TypeFilter({ value, onChange }) {
  return (
    <div className="tr-seg" role="group" aria-label="Show">
      {[['all', 'All'], ['recruit', 'Recruits'], ['sale', 'Sales']].map(([v, label]) => (
        <button key={v} type="button" className={value === v ? 'tr-seg-on' : ''} aria-pressed={value === v} onClick={() => onChange(v)}>{label}</button>
      ))}
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

function AppointmentForm({ user, weekMonday, editing, prefillData, onCancel, onSubmit, saving }) {
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

// ---------------------------------------------------------------------
// calendar — a live month view of every appointment's actual date/time
// ---------------------------------------------------------------------

const GOOGLE_CLIENT_ID = '106061643707-avmoqp1oe5idqdioocen9vnpsqd9i82l.apps.googleusercontent.com';

// Google Calendar and Zoom both follow the identical connect / check
// status / disconnect shape, differing only in which table and which
// email column they use — these three shared helpers do the real work
// once, so the provider-specific functions below are one line each.
async function connectProvider(buildAuthUrl) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  window.location.href = buildAuthUrl(data.session.access_token);
}
async function fetchProviderConnectionStatus(table, emailColumn, emailKey) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { connected: false };
  // Only the two display-safe columns — the database doesn't let the
  // browser read the token columns at all.
  const { data, error } = await supabase
    .from(table).select(`${emailColumn}, connected_at`).eq('user_id', sessionData.session.user.id).maybeSingle();
  if (error || !data) return { connected: false };
  return { connected: true, [emailKey]: data[emailColumn] };
}
async function disconnectProvider(table) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return false;
  const { error } = await supabase.from(table).delete().eq('user_id', data.session.user.id);
  return !error;
}

// Google sends people back to this site's own address (e.g.
// https://big-pace-ledger.com/), not to a supabase.co URL — Google's app
// verification requires every redirect domain to be one we own and have
// verified. The app then hands the one-time code to the
// google-oauth-callback Edge Function over an authenticated request.
const GOOGLE_OAUTH_STATE_KEY = 'pl_google_oauth_state';
function googleRedirectUri() { return `${window.location.origin}/`; }
function newOAuthState() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
function googleOAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    // calendar.events: read events, create them, and add the attendees the
    // advisor chooses (we only ever use their primary calendar). This is the
    // scope under Google review. The google-oauth-callback function also
    // accepts calendar.events.owned, so narrowing later is a one-line change.
    scope: 'https://www.googleapis.com/auth/calendar.events',
    access_type: 'offline',
    prompt: 'consent',
    // A random one-time value (not a login token) that we check on the
    // way back, so a stray or forged redirect can't attach someone else's
    // Google account.
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
async function connectGoogleCalendar() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const state = newOAuthState();
  try { sessionStorage.setItem(GOOGLE_OAUTH_STATE_KEY, state); } catch { /* checked on return */ }
  window.location.href = googleOAuthUrl(state);
}
// Called once when Google sends the person back here. Returns
// { ok: true } or { ok: false, reason }.
async function finishGoogleConnect(params) {
  let expected = null;
  try {
    expected = sessionStorage.getItem(GOOGLE_OAUTH_STATE_KEY);
    sessionStorage.removeItem(GOOGLE_OAUTH_STATE_KEY);
  } catch { /* storage blocked */ }
  if (params.get('error')) return { ok: false, reason: params.get('error') === 'access_denied' ? 'cancelled' : params.get('error') };
  if (!expected || params.get('state') !== expected) return { ok: false, reason: 'state_mismatch' };
  const { data } = await supabase.auth.getSession();
  if (!data.session) return { ok: false, reason: 'not_signed_in' };
  try {
    const res = await fetch(`${supabase.supabaseUrl}/functions/v1/google-oauth-callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.session.access_token}`,
        apikey: supabase.supabaseKey,
      },
      body: JSON.stringify({ code: params.get('code'), redirectUri: googleRedirectUri() }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.connected) return { ok: false, reason: json.error || `http_${res.status}` };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'network_error' };
  }
}
// True when the current URL is Google returning from the connect screen
// (and not, say, some other link that happens to carry ?code=).
function isGoogleOAuthReturn(params) {
  if (!params.get('state') || !(params.get('code') || params.get('error'))) return false;
  let pending = null;
  try { pending = sessionStorage.getItem(GOOGLE_OAUTH_STATE_KEY); } catch { /* ignore */ }
  return !!pending || (params.get('scope') || '').includes('googleapis.com');
}
async function fetchGoogleConnectionStatus() { return fetchProviderConnectionStatus('google_calendar_connections', 'google_email', 'googleEmail'); }
// Revokes PaceLedger's access at Google as well as deleting the stored
// tokens (done server-side, where the tokens live). Falls back to a plain
// delete if the function can't be reached.
async function disconnectGoogleCalendar() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return false;
  try {
    const res = await fetch(`${supabase.supabaseUrl}/functions/v1/google-oauth-callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.session.access_token}`,
        apikey: supabase.supabaseKey,
      },
      body: JSON.stringify({ action: 'disconnect' }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.disconnected) return true;
  } catch { /* fall through */ }
  return disconnectProvider('google_calendar_connections');
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
// Pushes a new appointment onto the advisor's own Google Calendar, and —
// if a presenting manager's Zoom was used — that manager's calendar too,
// as two independent events. Best-effort: failures here never block the
// appointment itself from being saved.
async function pushAppointmentToGoogleCalendar({ title, description, location, attendees, startDateTime, endDateTime, timezone, managerHostId }) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { ownPushed: false, managerPushed: false };
  try {
    const res = await fetch(`${supabase.supabaseUrl}/functions/v1/google-create-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionData.session.access_token}`,
        apikey: supabase.supabaseKey,
      },
      body: JSON.stringify({ title, description, location, attendees: attendees || [], startDateTime, endDateTime, timezone, managerHostId: managerHostId || null }),
    });
    if (!res.ok) return { ownPushed: false, managerPushed: false };
    return await res.json();
  } catch {
    return { ownPushed: false, managerPushed: false };
  }
}
// Fallback when Google Calendar isn't connected: PaceLedger emails the
// meeting details (and Zoom link) itself — see send-appointment-invite.
async function sendAppointmentInviteEmail(appointmentId, emails, updated = false) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { sent: false, error: 'not_signed_in' };
  try {
    const res = await fetch(`${supabase.supabaseUrl}/functions/v1/send-appointment-invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionData.session.access_token}`,
        apikey: supabase.supabaseKey,
      },
      body: JSON.stringify({ appointmentId, emails, updated }),
    });
    if (!res.ok) return { sent: false, error: 'request_failed' };
    return await res.json();
  } catch {
    return { sent: false, error: 'request_failed' };
  }
}

const ZOOM_CLIENT_ID = 'QfE5XHQXRuyAaOPOY60bvg'; // Production client ID (works for any Zoom account now the app is published)

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
async function connectZoom() { return connectProvider(zoomOAuthUrl); }
async function fetchZoomConnectionStatus() { return fetchProviderConnectionStatus('zoom_connections', 'zoom_email', 'zoomEmail'); }
async function disconnectZoom() { return disconnectProvider('zoom_connections'); }
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
    <div className={`tr-connect-slim ${status.connected ? 'tr-connect-slim-on' : ''}`}>
      <span className="tr-connect-dot" />
      <span className="tr-connect-text">
        {status.connected
          ? <><strong>Zoom connected</strong> as {status.zoomEmail || 'your Zoom account'} — every new appointment gets its own meeting link.</>
          : <><strong>Zoom not connected.</strong> Connect it and every appointment you log gets its own meeting link automatically.</>}
      </span>
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
    <div className={`tr-connect-slim ${status.connected ? 'tr-connect-slim-on' : ''}`}>
      <span className="tr-connect-dot" />
      <span className="tr-connect-text">
        {status.connected
          ? <><strong>Google Calendar connected</strong> as {status.googleEmail || 'your Google account'}.</>
          : <><strong>Google Calendar not connected.</strong> Connect it to see your Google events here and to put appointments (and their invites) on your Google Calendar.</>}
      </span>
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
// ---------------------------------------------------------------------
// trainings — org-wide announcements, visible to everyone regardless of
// role or reporting structure, posted by super admins only
// ---------------------------------------------------------------------
function TrainingPostCard({ user, onPosted }) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [timezone, setTimezone] = useState(detectTimezone());
  const [zoomUrl, setZoomUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [repeatUntil, setRepeatUntil] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const timezoneOptions = timezoneOptionsWithDetected();

  async function submit() {
    if (!title.trim() || !date || !time) { setErr('Fill in the title, date, and time.'); return; }
    if (recurring && (!repeatUntil || repeatUntil < date)) { setErr('Pick a "repeat until" date on or after the first training date.'); return; }
    setSaving(true); setErr('');
    const res = await createTraining({
      title: title.trim(), date, time, timezone, zoomUrl: zoomUrl.trim(), notes: notes.trim(),
      userId: user.id, userName: user.displayName, recurring, repeatUntil: recurring ? repeatUntil : null,
    });
    setSaving(false);
    if (!res.ok) { setErr(res.error || 'Could not post. Try again.'); return; }
    setTitle(''); setDate(''); setTime(''); setZoomUrl(''); setNotes(''); setRecurring(false); setRepeatUntil('');
    setShowForm(false);
    res.records.forEach(onPosted);
  }

  return (
    <div className="tr-card tr-training-post">
      <div className="tr-row-head" style={{ marginBottom: showForm ? 14 : 0 }}>
        <h3 className="tr-h3" style={{ margin: 0 }}><GraduationCap size={16} /> Post a training</h3>
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : '+ New training'}</button>
      </div>
      {showForm && (
        <>
          <div className="tr-form-grid">
            <label className="tr-field tr-field-wide">
              <span>Title</span>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. New Product Training" />
            </label>
            <label className="tr-field">
              <span>Date</span>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} onClick={openPicker} />
            </label>
            <label className="tr-field">
              <span>Time</span>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} onClick={openPicker} />
            </label>
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
        </>
      )}
    </div>
  );
}
// ---------------------------------------------------------------------
// my schedule — a manager blocking out times they're not free, so
// advisors booking an appointment with them as presenter can be stopped
// from double-booking that time (see checkAppointmentConflict).
// ---------------------------------------------------------------------
function SchedulePostCard({ user, onPosted }) {
  const [showForm, setShowForm] = useState(false);
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
    setShowForm(false);
    res.records.forEach(onPosted);
  }

  return (
    <div className="tr-card tr-training-post">
      <div className="tr-row-head" style={{ marginBottom: showForm ? 14 : 0 }}>
        <h3 className="tr-h3" style={{ margin: 0 }}><Ban size={16} /> My schedule</h3>
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : '+ Block out time'}</button>
      </div>
      {showForm && (
        <>
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
        </>
      )}
    </div>
  );
}
function calendarItems(appts, googleEvents, trainings, scheduleBlocks) {
  return [
    ...appts.map(a => ({ kind: 'appt', data: a, timeKey: apptLocalTimeKey(a) })),
    ...googleEvents.map(e => ({ kind: 'google', data: e, timeKey: googleEventTimeKey(e) })),
    ...trainings.map(t => ({ kind: 'training', data: t, timeKey: trainingLocalTimeKey(t) })),
    ...scheduleBlocks.map(b => ({ kind: 'block', data: b, timeKey: b.start_time.slice(0, 5) })),
  ].sort((a, b) => a.timeKey.localeCompare(b.timeKey));
}
function CalendarDay({ cell, appts, googleEvents, trainings, scheduleBlocks, highlightTrainings, ownerName, onOpen }) {
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
        {visible.map((item, i) => item.kind === 'appt' ? (
          <div key={item.data.id} className={`tr-cal-appt ${isRecruitType(item.data) && isSaleType(item.data) ? 'tr-cal-appt-both' : isRecruitType(item.data) ? 'tr-cal-appt-recruit' : isSaleType(item.data) ? 'tr-cal-appt-sale' : ''}`}>
            {fmtTime(item.timeKey)} {item.data.client}
          </div>
        ) : item.kind === 'training' ? (
          <div key={item.data.id} className="tr-cal-appt tr-cal-appt-training">
            <GraduationCap size={9} /> {fmtTime(item.timeKey)} {item.data.title}
          </div>
        ) : item.kind === 'block' ? (
          <div key={item.data.id} className="tr-cal-appt tr-cal-appt-unavailable">
            <Ban size={9} /> {fmtTime(item.timeKey)} {item.data.user_name || 'Unavailable'}
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
function CalendarBody({ user, onLogAppointment }) {
  const [monthStartStr, setMonthStartStr] = useState(monthStartOf(todayStr()));
  // The month grid gets cramped on a phone, so phones start on the list.
  const [calView, setCalView] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 'agenda' : 'month'));
  const [appts, setAppts] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dayModal, setDayModal] = useState(null);
  const [googleStatus, setGoogleStatus] = useState({ connected: false });
  const [googleEvents, setGoogleEvents] = useState([]);
  const [googleConnecting, setGoogleConnecting] = useState(false);
  const [trainings, setTrainings] = useState([]);
  const [scheduleBlocks, setScheduleBlocks] = useState([]);
  const [highlightTrainings, setHighlightTrainings] = useState(false);
  // 'all' | 'mine' | a specific person's userId — only meaningful for
  // managers/admins, who see more than just their own appointments here.
  const [personFilter, setPersonFilter] = useState('all');

  const cells = buildMonthGrid(monthStartStr);
  const rangeStart = cells[0].date;
  const rangeEnd = cells[cells.length - 1].date;

  const refresh = useCallback(async () => {
    setLoading(true);
    // One extra day each side: appointments are placed by your local date,
    // which can differ by a day from the stored date across timezones.
    const tasks = [fetchAppointmentsInRange(fmtDate(addDays(parseDate(rangeStart), -1)), fmtDate(addDays(parseDate(rangeEnd), 1))), fetchGoogleConnectionStatus(), fetchTrainingsInRange(rangeStart, rangeEnd), fetchScheduleBlocksInRange(rangeStart, rangeEnd)];
    if (user.role !== 'advisor') tasks.push(fetchTeamMembers(user));
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
  }, [rangeStart, rangeEnd, user.id, user.role]);

  useEffect(() => { refresh(); }, [refresh]);
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
        return;
      }
    }
    if (!window.confirm('Remove this training for everyone? This can\'t be undone.')) return;
    const ok = await deleteTraining(training.id);
    if (ok) setTrainings(prev => prev.filter(t => t.id !== training.id));
  }
  async function handleDeleteScheduleBlock(block) {
    if (block.recurring_group_id) {
      const deleteAll = window.confirm(
        "This is part of a weekly series.\n\nOK = delete this and all future occurrences\nCancel = just this one date"
      );
      if (deleteAll) {
        const ok = await deleteScheduleBlockSeries(block.recurring_group_id, block.block_date);
        if (ok) setScheduleBlocks(prev => prev.filter(b => !(b.recurring_group_id === block.recurring_group_id && b.block_date >= block.block_date)));
        return;
      }
    }
    if (!window.confirm('Remove this blocked time?')) return;
    const ok = await deleteScheduleBlock(block.id);
    if (ok) setScheduleBlocks(prev => prev.filter(b => b.id !== block.id));
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
    if (user.role === 'advisor') return '';
    if (userId === user.id) return user.displayName;
    const m = members.find(mm => mm.id === userId);
    return m ? m.display_name : '';
  }

  const monthLabel = parseDate(monthStartStr).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <>
      <PageHead title="Calendar" sub="Your appointments, team trainings and Google events in one place." />
      <GoogleCalendarConnect status={googleStatus} connecting={googleConnecting} onConnect={handleConnect} onDisconnect={handleDisconnect} />
      {user.role === 'super_admin' && <TrainingPostCard user={user} onPosted={t => setTrainings(prev => [...prev, t])} />}
      {(user.role === 'manager' || user.role === 'super_admin') && (
        <SchedulePostCard user={user} onPosted={b => setScheduleBlocks(prev => [...prev, b])} />
      )}
      <div className="tr-weeknav">
        <div className="tr-seg" role="group" aria-label="Calendar view">
          <button type="button" className={calView === 'month' ? 'tr-seg-on' : ''} onClick={() => setCalView('month')}>Month</button>
          <button type="button" className={calView === 'agenda' ? 'tr-seg-on' : ''} onClick={() => setCalView('agenda')}>List</button>
        </div>
        <button className="tr-icon-btn" onClick={() => setMonthStartStr(shiftMonth(monthStartStr, -1))} title="Previous month"><ChevronLeft size={18} /></button>
        <div className="tr-weeknav-label"><CalendarDays size={16} /><span>{monthLabel}</span></div>
        <button className="tr-icon-btn" onClick={() => setMonthStartStr(shiftMonth(monthStartStr, 1))} title="Next month"><ChevronRight size={18} /></button>
        <button className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => setMonthStartStr(monthStartOf(todayStr()))}>This month</button>
        <button className="tr-btn tr-btn-ghost tr-btn-sm" onClick={refresh}>Refresh</button>
        <button
          type="button" className={`tr-btn tr-btn-sm ${highlightTrainings ? 'tr-btn-brass' : 'tr-btn-ghost'}`}
          onClick={() => setHighlightTrainings(v => !v)} title="Highlight days with trainings">
          <GraduationCap size={14} /> Trainings
        </button>
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
                <button type="button" className="tr-agenda-date" onClick={() => setDayModal({ date: d.date, appts: d.dayAppts, googleEvents: d.dayGoogle, trainings: d.dayTrainings, blocks: d.dayBlocks })}>
                  {d.date === today ? 'Today' : fmtDisplayDate(d.date)}
                </button>
                {d.items.map(item => (
                  <div key={`${item.kind}-${item.data.id}`} className={`tr-agenda-item tr-agenda-${item.kind} ${item.kind === 'appt' ? (isRecruitType(item.data) && !isSaleType(item.data) ? 'tr-agenda-recruit' : 'tr-agenda-sale') : ''}`}>
                    <span className="tr-agenda-time">{item.kind === 'google' && item.data.allDay ? 'All day' : fmtTime(item.timeKey)}</span>
                    <span className="tr-agenda-what">
                      {item.kind === 'appt' && <><strong>{item.data.client}</strong>{typeLabel(item.data) ? ` · ${typeLabel(item.data)}` : ''}{ownerName(item.data.userId) && item.data.userId !== user.id ? ` · ${ownerName(item.data.userId)}` : ''}</>}
                      {item.kind === 'training' && <><GraduationCap size={12} /> <strong>{item.data.title}</strong> · Training</>}
                      {item.kind === 'block' && <><Ban size={12} /> {item.data.user_name || 'Someone'} unavailable{item.data.label ? ` — ${item.data.label}` : ''}</>}
                      {item.kind === 'google' && <>{item.data.title} <span className="tr-empty">· Google</span></>}
                    </span>
                    {(item.data.zoomUrl || item.data.zoom_url) && <a className="tr-btn tr-btn-ghost tr-btn-sm" href={item.data.zoomUrl || item.data.zoom_url} target="_blank" rel="noopener noreferrer">Join Zoom</a>}
                  </div>
                ))}
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
                ownerName={ownerName}
                onOpen={(date, dayAppts, dayGoogle, dayTrainings, dayBlocks) => setDayModal({ date, appts: dayAppts, googleEvents: dayGoogle, trainings: dayTrainings, blocks: dayBlocks })} />
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
        <span className="tr-cal-legend-hint">Click any day to see details{onLogAppointment ? ' or book an appointment' : ''}.</span>
      </div>
      {dayModal && (
        <Modal onClose={() => setDayModal(null)}>
          <div className="tr-row-head">
            <h3 className="tr-h3" style={{ margin: 0 }}>{fmtDisplayDate(dayModal.date)}</h3>
            {onLogAppointment && dayModal.date >= todayStr() && (
              <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={() => { const date = dayModal.date; setDayModal(null); onLogAppointment({ appointmentDate: date }); }}>
                <Plus size={14} /> Log appointment this day
              </button>
            )}
          </div>
          {dayModal.appts.length + dayModal.trainings.length + dayModal.blocks.length + dayModal.googleEvents.length === 0 && (
            <p className="tr-empty">Nothing scheduled.</p>
          )}
          <div className="tr-notes-list" style={{ maxHeight: '60vh', marginTop: 12 }}>
            {dayModal.trainings.map(t => (
              <div key={t.id} className="tr-note-item tr-note-item-training">
                <div className="tr-note-meta"><GraduationCap size={12} /> {fmtTime(trainingLocalTimeKey(t))} · Training{t.recurring_group_id ? ' · Weekly' : ''}</div>
                <div><strong>{t.title}</strong></div>
                {t.zoom_url && <div><a href={t.zoom_url} target="_blank" rel="noopener noreferrer" className="tr-note tr-link">Join Zoom</a></div>}
                {t.notes && <div className="tr-note">{t.notes}</div>}
                <div className="tr-note">Posted by {t.created_by_name}</div>
                {user.role === 'super_admin' && (
                  <button type="button" className="tr-icon-btn" style={{ marginTop: 4 }} onClick={() => handleDeleteTraining(t)} title="Remove training"><Trash2 size={13} /></button>
                )}
              </div>
            ))}
            {dayModal.blocks.map(b => (
              <div key={b.id} className="tr-note-item tr-note-item-unavailable">
                <div className="tr-note-meta"><Ban size={12} /> {fmtTime(b.start_time.slice(0, 5))}–{fmtTime(b.end_time.slice(0, 5))} · Unavailable{b.recurring_group_id ? ' · Weekly' : ''}</div>
                <div><strong>{b.user_name || 'Someone'}</strong>{b.label ? ` — ${b.label}` : ''}</div>
                {(user.id === b.user_id || user.role === 'super_admin') && (
                  <button type="button" className="tr-icon-btn" style={{ marginTop: 4 }} onClick={() => handleDeleteScheduleBlock(b)} title="Remove blocked time"><Trash2 size={13} /></button>
                )}
              </div>
            ))}
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

// ---------------------------------------------------------------------
// Business Plan — a personal living-expenses worksheet (Expenses) and a
// prospecting-goal calculator built from it (Goals). Available to every
// role; each person only ever sees and edits their own.
// ---------------------------------------------------------------------
const EXPENSE_FIELD_DEFS = [
  ['mortgageRent', 'Mortgage Payment (Rent)'],
  ['household', 'Household (heat, water, etc.)'],
  ['food', 'Food (groceries, dining in and out)'],
  ['car', 'Car expenses (payments, gas, etc.)'],
  ['entertainment', 'Entertainment'],
  ['childCare', 'Child Care'],
  ['education', 'Education'],
  ['investmentsSavings', 'Investments/Savings'],
  ['otherExpenses', 'Other Living Expenses'],
];
function BusinessPlanBody({ user }) {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('expenses'); // 'expenses' | 'goals' | 'marketing'
  const [fields, setFields] = useState(DEFAULT_BUSINESS_PLAN_FIELDS);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [loadFailed, setLoadFailed] = useState(false);
  // Latest edits, for flushing a pending autosave if you leave the tab
  // before the debounce fires.
  const pendingRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetchBusinessPlan(user.id).then(row => {
      if (!alive) return;
      // Never autosave over a plan we failed to load — that would replace
      // the real numbers with blanks.
      if (row && row.loadError) setLoadFailed(true);
      else if (row) setFields(rowToBusinessPlanFields(row));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [user.id]);

  // Autosave: a moment after you stop typing, everything is saved — no
  // Save button to forget before switching tabs.
  useEffect(() => {
    if (!dirty) return undefined;
    pendingRef.current = fields;
    const t = setTimeout(async () => {
      setSaveState('saving');
      const res = await saveBusinessPlan(user.id, fields);
      if (res.ok) {
        if (pendingRef.current === fields) { pendingRef.current = null; setDirty(false); }
        setSaveState('saved');
      } else {
        setSaveState('error');
      }
    }, 900);
    return () => clearTimeout(t);
  }, [fields, dirty, user.id]);
  useEffect(() => () => {
    if (pendingRef.current) saveBusinessPlan(user.id, pendingRef.current);
  }, [user.id]);

  function setField(key, value) {
    setFields(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  }
  async function handleRetrySave() {
    setSaveState('saving');
    const res = await saveBusinessPlan(user.id, fields);
    if (res.ok) { pendingRef.current = null; setDirty(false); setSaveState('saved'); } else setSaveState('error');
  }

  const subtotal = computeExpensesSubtotal(fields);
  const monthlyGrossIncomeNeeded = computeMonthlyGrossIncomeNeeded(subtotal);
  const annualGrossIncomeNeeded = computeAnnualGrossIncomeNeeded(monthlyGrossIncomeNeeded);
  const cpt = computeCommissionPerTransaction(fields.targetPremium, fields.commissionRate);
  const usingCalculatedIncomeGoal = fields.incomeGoalOverride === '';
  const incomeGoal = usingCalculatedIncomeGoal ? annualGrossIncomeNeeded : (Number(fields.incomeGoalOverride) || 0);
  const tny = computeTransactionsNeededPerYear(incomeGoal, cpt);
  const tpn = computeProspectsNeededPerYear(tny);
  const monthlyProspects = computeMonthlyProspects(tpn);
  const dailyProspects = computeDailyProspects(monthlyProspects);

  if (loading) return <SkelBlock w="100%" h="220px" />;
  if (loadFailed) {
    return (
      <div className="tr-card">
        <p className="tr-error" style={{ margin: 0 }}>Couldn't load your Business Plan. Refresh the page to try again — nothing has been changed.</p>
      </div>
    );
  }

  return (
    <div className="tr-appts-shell">
      <nav className="tr-appts-sidebar">
        <button type="button" className={`tr-sidebar-item tr-sidebar-item-week ${view === 'expenses' ? 'tr-sidebar-item-active' : ''}`} onClick={() => setView('expenses')}>
          <span>Expenses</span>
        </button>
        <button type="button" className={`tr-sidebar-item tr-sidebar-item-week ${view === 'goals' ? 'tr-sidebar-item-active' : ''}`} onClick={() => setView('goals')}>
          <span>Goals</span>
        </button>
        <button type="button" className={`tr-sidebar-item tr-sidebar-item-week ${view === 'marketing' ? 'tr-sidebar-item-active' : ''}`} onClick={() => setView('marketing')}>
          <span>Marketing Plan</span>
        </button>
        {tny > 0 && (
          <div className="tr-bizplan-glance">
            <div className="tr-sidebar-divider" style={{ padding: '6px 0 4px' }}>Your numbers</div>
            <div><span>Income goal</span><strong>{fmtCurrency(incomeGoal)}</strong></div>
            <div><span>Sales / month</span><strong>{(tny / 12).toFixed(1)}</strong></div>
            <div><span>Prospects / week</span><strong>{(tpn / 52).toFixed(1)}</strong></div>
            <div><span>Prospects / day</span><strong>{dailyProspects.toFixed(1)}</strong></div>
          </div>
        )}
      </nav>
      <div className="tr-appts-main">
        <PageHead
          title={view === 'goals' ? 'Goals' : view === 'marketing' ? 'Marketing plan' : 'Business plan'}
          sub={view === 'goals' ? 'Turn your income goal into the sales and prospects you need.' : view === 'marketing' ? 'How you will reach your goals, and when.' : 'Start with what you need to live on; everything else is worked out from it.'} />
        <div className="tr-card">
          {view === 'expenses' && (
            <BusinessPlanExpensesPanel
              fields={fields} setField={setField}
              subtotal={subtotal} monthlyGrossIncomeNeeded={monthlyGrossIncomeNeeded} annualGrossIncomeNeeded={annualGrossIncomeNeeded} />
          )}
          {view === 'goals' && (
            <BusinessPlanGoalsPanel
              fields={fields} setField={setField}
              annualGrossIncomeNeeded={annualGrossIncomeNeeded} usingCalculatedIncomeGoal={usingCalculatedIncomeGoal}
              cpt={cpt} tny={tny} tpn={tpn} monthlyProspects={monthlyProspects} dailyProspects={dailyProspects} />
          )}
          {view === 'marketing' && (
            <BusinessPlanMarketingPanel fields={fields} setField={setField} />
          )}
          <div className="tr-autosave">
            {saveState === 'error' ? (
              <><span className="tr-autosave-error">Couldn't save your last change.</span> <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={handleRetrySave}>Try again</button></>
            ) : dirty || saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'All changes saved' : 'Changes save automatically'}
          </div>
        </div>
      </div>
    </div>
  );
}
function BusinessPlanExpensesPanel({ fields, setField, subtotal, monthlyGrossIncomeNeeded, annualGrossIncomeNeeded }) {
  return (
    <>
      <h3 className="tr-h3">Living Expenses</h3>
      <p className="tr-empty" style={{ margin: '-6px 0 14px' }}>Fill in your typical monthly costs. Everything below recalculates as you type.</p>
      <div className="tr-form-grid">
        {EXPENSE_FIELD_DEFS.map(([key, label]) => (
          <label className="tr-field" key={key}>
            <span>{label}</span>
            <span className="tr-input-affix tr-input-affix-pre"><span>$</span><input type="number" min="0" step="1" inputMode="decimal" value={fields[key]} onChange={e => setField(key, e.target.value)} placeholder="0" /></span>
          </label>
        ))}
      </div>
      <div className="tr-bizplan-summary">
        <div className="tr-bizplan-summary-row">
          <span>Subtotal (income needed after taxes)</span>
          <span className="tr-mono">{fmtCurrency(subtotal)}</span>
        </div>
        <div className="tr-bizplan-summary-row">
          <span>÷ 0.7 = Monthly gross income needed</span>
          <span className="tr-mono">{fmtCurrency(monthlyGrossIncomeNeeded)}</span>
        </div>
        <div className="tr-bizplan-summary-row tr-bizplan-summary-highlight">
          <span>× 12 = Annual gross income needed</span>
          <span className="tr-mono">{fmtCurrency(annualGrossIncomeNeeded)}</span>
        </div>
      </div>
    </>
  );
}
function BusinessPlanGoalsPanel({ fields, setField, annualGrossIncomeNeeded, usingCalculatedIncomeGoal, cpt, tny, tpn, monthlyProspects, dailyProspects }) {
  return (
    <>
      <h3 className="tr-h3">Transactions &amp; Prospecting Goals</h3>

      <div className="tr-bizplan-step">
        <h4 className="tr-h4">Step 1 · Average commission per transaction</h4>
        <div className="tr-form-grid">
          <label className="tr-field">
            <span>Average target premium (TP)</span>
            <span className="tr-input-affix tr-input-affix-pre"><span>$</span><input type="number" min="0" step="1" inputMode="decimal" value={fields.targetPremium} onChange={e => setField('targetPremium', e.target.value)} /></span>
          </label>
          <label className="tr-field">
            <span>Commission rate, % (CR)</span>
            <span className="tr-input-affix tr-input-affix-post"><input type="number" min="0" max="100" step="1" inputMode="decimal" value={fields.commissionRate} onChange={e => setField('commissionRate', e.target.value)} /><span>%</span></span>
          </label>
        </div>
        <div className="tr-bizplan-summary">
          <div className="tr-bizplan-summary-row">
            <span>TP × CR = Commission per transaction (CPT)</span>
            <span className="tr-mono">{fmtCurrency(cpt)}</span>
          </div>
        </div>
      </div>

      <div className="tr-bizplan-step">
        <h4 className="tr-h4">Step 2 · Income goal</h4>
        <label className="tr-field tr-field-wide">
          <span>Income goal (IG){usingCalculatedIncomeGoal ? ' — using your calculated annual gross income needed' : ''}</span>
          <span className="tr-input-affix tr-input-affix-pre"><span>$</span><input
            type="number" min="0" step="1" inputMode="decimal"
            value={usingCalculatedIncomeGoal ? String(Math.round(annualGrossIncomeNeeded)) : fields.incomeGoalOverride}
            onChange={e => setField('incomeGoalOverride', e.target.value)} /></span>
        </label>
        {!usingCalculatedIncomeGoal && (
          <button type="button" className="tr-bizplan-reset-link" onClick={() => setField('incomeGoalOverride', '')}>
            Use calculated value ({fmtCurrency(annualGrossIncomeNeeded)})
          </button>
        )}
        <div className="tr-bizplan-summary">
          <div className="tr-bizplan-summary-row">
            <span>IG ÷ CPT = Transactions needed per year (TNY)</span>
            <span className="tr-mono">{tny.toFixed(1)}</span>
          </div>
        </div>
      </div>

      <div className="tr-bizplan-step">
        <h4 className="tr-h4">Step 3 · Prospects needed</h4>
        <div className="tr-bizplan-summary">
          <div className="tr-bizplan-summary-row">
            <span>TNY × 5 (prospect-to-sale ratio) = Total prospects needed per year (TPN)</span>
            <span className="tr-mono">{Math.round(tpn)}</span>
          </div>
        </div>
      </div>

      <div className="tr-bizplan-step">
        <h4 className="tr-h4">Step 4 · Break it down daily</h4>
        <div className="tr-bizplan-summary">
          <div className="tr-bizplan-summary-row">
            <span>TPN ÷ 52 weeks = Weekly prospects needed</span>
            <span className="tr-mono">{(tpn / 52).toFixed(1)}</span>
          </div>
          <div className="tr-bizplan-summary-row">
            <span>TPN ÷ 12 months = Monthly prospects needed</span>
            <span className="tr-mono">{monthlyProspects.toFixed(1)}</span>
          </div>
          <div className="tr-bizplan-summary-row tr-bizplan-summary-highlight">
            <span>÷ 30 days = Prospects needed each day</span>
            <span className="tr-mono">{dailyProspects.toFixed(1)}</span>
          </div>
        </div>
      </div>
    </>
  );
}
function BusinessPlanMarketingPanel({ fields, setField }) {
  return (
    <>
      <h3 className="tr-h3">Marketing Plan</h3>
      <p className="tr-empty" style={{ marginTop: -6 }}>Three questions worth revisiting as your business changes.</p>
      <div className="tr-form-grid">
        <label className="tr-field tr-field-wide">
          <span>Goals — what will be accomplished and when?</span>
          <textarea rows={4} value={fields.marketingGoals} onChange={e => setField('marketingGoals', e.target.value)} placeholder="What will be accomplished, and by when?" />
        </label>
        <label className="tr-field tr-field-wide">
          <span>Strategies — how will you reach your goals?</span>
          <textarea rows={4} value={fields.marketingStrategies} onChange={e => setField('marketingStrategies', e.target.value)} placeholder="How will you reach the goals above?" />
        </label>
        <label className="tr-field tr-field-wide">
          <span>Tactics — what will change and when?</span>
          <textarea rows={4} value={fields.marketingTactics} onChange={e => setField('marketingTactics', e.target.value)} placeholder="What will change, and when?" />
        </label>
      </div>
    </>
  );
}

function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((v || '').trim()); }
// One-tap Email for anyone with an email saved.
function ContactLinks({ email }) {
  if (!email) return null;
  return (
    <div className="tr-contact-links">
      <a className="tr-btn tr-btn-ghost tr-btn-sm" href={`mailto:${email.trim()}`}>Email</a>
      <span className="tr-contact-detail">{email.trim()}</span>
    </div>
  );
}
function ProspectForm({ editing, onCancel, onSubmit, saving, onOpenJogger }) {
  const [firstName, setFirstName] = useState(editing?.firstName || '');
  const [lastName, setLastName] = useState(editing?.lastName || '');
  const [age, setAge] = useState(editing?.age != null ? String(editing.age) : '');
  const [relationshipStrength, setRelationshipStrength] = useState(editing?.relationshipStrength ?? 5);
  const [chars, setChars] = useState(() => {
    const initial = {};
    ALL_CHARACTERISTICS.forEach(c => { initial[c.key] = editing ? !!editing[c.key] : false; });
    return initial;
  });
  const [notes, setNotes] = useState(editing?.notes || '');
  const [source, setSource] = useState(editing?.source || '');
  const [email, setEmail] = useState(editing?.email || '');
  const [err, setErr] = useState('');

  function toggleChar(key) { setChars(prev => ({ ...prev, [key]: !prev[key] })); }

  function submit(another = false) {
    if (!firstName.trim() || !lastName.trim()) { setErr("Enter the prospect's first and last name."); return; }
    if (email.trim() && !isValidEmail(email)) { setErr("That email address doesn't look right."); return; }
    setErr('');
    onSubmit({ firstName, lastName, age, relationshipStrength, notes, source, email, ...chars }, { another });
  }
  const liveScore = prospectTotalChecked({ age, ...chars });
  const liveLeaning = prospectLeaningKey({ age, ...chars });

  return (
    <div className="tr-card tr-form">
      <div className="tr-row-head">
        <h3 className="tr-h3" style={{ margin: 0 }}>{editing ? 'Edit prospect' : 'New prospect'}</h3>
        <div className="tr-prospect-live-score">
          <span className="tr-mono">{liveScore}/9</span>
          <span className={`tr-type-badge ${liveLeaning === 'sale' ? 'tr-type-badge-sale' : liveLeaning === 'recruit' ? 'tr-type-badge-recruit' : liveLeaning === 'both' ? 'tr-type-badge-both' : ''}`}>{LEANING_LABELS[liveLeaning]}</span>
        </div>
      </div>
      {!editing && onOpenJogger && (
        <p className="tr-empty" style={{ margin: '4px 0 12px' }}>
          Stuck on who to add next? <button type="button" className="tr-ov-link" onClick={onOpenJogger}>Open the Memory Jogger</button>
        </p>
      )}
      <div className="tr-form-grid">
        <label className="tr-field">
          <span>First name</span>
          <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" />
        </label>
        <label className="tr-field">
          <span>Last name</span>
          <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" />
        </label>
        <label className="tr-field">
          <span>Email (optional)</span>
          <input type="email" inputMode="email" autoComplete="off" autoCapitalize="none" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" />
        </label>
        <label className="tr-field">
          <span>Age</span>
          <input type="number" min="0" max="120" value={age} onChange={e => setAge(e.target.value)} placeholder="Age" />
        </label>
        <label className="tr-field">
          <span>Source</span>
          <select value={source} onChange={e => setSource(e.target.value)}>
            <option value="">— not specified —</option>
            {PROSPECT_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="tr-field tr-field-wide">
          <span>Relationship strength: {relationshipStrength}/10</span>
          <input type="range" min="0" max="10" value={relationshipStrength} onChange={e => setRelationshipStrength(Number(e.target.value))} />
        </label>
      </div>
      <div className="tr-prospect-chars">
        <div className="tr-prospect-char-group">
          <h4 className="tr-h4">Sale indicators</h4>
          {SALE_CHARACTERISTICS.map(c => (
            <label key={c.key} className="tr-checkbox-field tr-prospect-char-row">
              <input type="checkbox" checked={chars[c.key]} onChange={() => toggleChar(c.key)} />
              <span>{c.label}{c.hint ? <span className="tr-note"> — {c.hint}</span> : null}</span>
            </label>
          ))}
        </div>
        <div className="tr-prospect-char-group">
          <h4 className="tr-h4">Recruit indicators</h4>
          {RECRUIT_CHARACTERISTICS.map(c => (
            <label key={c.key} className="tr-checkbox-field tr-prospect-char-row">
              <input type="checkbox" checked={chars[c.key]} onChange={() => toggleChar(c.key)} />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </div>
      <label className="tr-field tr-field-wide" style={{ marginTop: 14 }}>
        <span>Notes (optional)</span>
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything else worth noting about this prospect" />
      </label>
      {err && <div className="tr-error">{err}</div>}
      <div className="tr-form-actions">
        <button type="button" className="tr-btn tr-btn-ghost" onClick={onCancel}>Cancel</button>
        {!editing && <button type="button" className="tr-btn tr-btn-ghost" onClick={() => submit(true)} disabled={saving}>Save &amp; add another</button>}
        <button type="button" className="tr-btn tr-btn-brass" onClick={() => submit(false)} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save prospect'}</button>
      </div>
    </div>
  );
}
// Reused both personally (Systems > List) and aggregated (Team
// Prospecting) — takes whatever set of prospects is relevant and shows
// where the drop-off actually happens.
function ProspectFunnel({ prospects, title }) {
  const total = prospects.length;
  if (total === 0) return null;
  const converted = prospects.filter(p => p.markedRecruited || p.markedSold).length;
  const recruited = prospects.filter(p => p.markedRecruited).length;
  const sold = prospects.filter(p => p.markedSold).length;
  const pct = n => Math.round((n / total) * 100);
  const stages = [
    { label: 'Logged', count: total, pct: 100, cls: '' },
    { label: 'Converted', count: converted, pct: pct(converted), cls: 'tr-funnel-bar-converted' },
    { label: 'Recruited', count: recruited, pct: pct(recruited), cls: 'tr-funnel-bar-recruit' },
    { label: 'Sold', count: sold, pct: pct(sold), cls: 'tr-funnel-bar-sale' },
  ];
  return (
    <div className="tr-card tr-funnel">
      {title ? <h4 className="tr-h4">{title}</h4> : null}
      <div className="tr-funnel-strip">
        {stages.map(s => (
          <div key={s.label} className="tr-funnel-cell">
            <span className="tr-funnel-num">{s.count}</span>
            <span className="tr-funnel-stage-label">{s.label}{s.label !== 'Logged' ? <span className="tr-funnel-pct"> · {s.pct}%</span> : null}</span>
            <div className="tr-funnel-track"><div className={`tr-funnel-bar ${s.cls}`} style={{ width: `${Math.max(s.pct, s.count > 0 ? 4 : 0)}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
function ProspectCard({ prospect, rank, onDelete, onToggleOutcome, onLogAppointment, onEdit, readOnly, collapsible, apptNames, apptDate }) {
  const [open, setOpen] = useState(!collapsible);
  const total = prospectTotalChecked(prospect);
  const leaning = prospectLeaningKey(prospect);
  const checkedChars = ALL_CHARACTERISTICS.filter(c => prospect[c.key]);
  const stale = isStaleProspect(prospect, apptNames);
  return (
    <div className={`tr-card tr-prospect-card ${collapsible ? 'tr-prospect-card-compact' : ''} ${collapsible && open ? 'tr-prospect-card-open' : ''}`}>
      <div className="tr-policy-head">
        <div
          style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: '1 1 240px', minWidth: 0, cursor: collapsible ? 'pointer' : 'default' }}
          onClick={collapsible ? () => setOpen(o => !o) : undefined}>
          {rank && <span className="tr-prospect-rank" aria-label={`Rank ${rank}`}>{rank}</span>}
          <div style={{ minWidth: 0 }}>
            <strong>{prospect.firstName} {prospect.lastName}</strong>
            <div className="tr-note">
              {prospect.age ? `${prospect.age} yrs · ` : ''}Relationship {prospect.relationshipStrength}/10 · {daysAgoLabel(prospect.createdAt).replace('Logged ', 'added ')}{prospect.source ? ` · ${prospect.source}` : ''}
            </div>
          </div>
        </div>
        <div className="tr-prospect-card-side">
          {apptDate && <span className="tr-type-badge tr-type-badge-appt" title="An appointment is logged with this name">Appt {fmtDisplayDate(apptDate).replace(/^\w+, /, '')}</span>}
          {stale && <span className="tr-type-badge tr-type-badge-stale" title={`Added ${STALE_PROSPECT_DAYS}+ days ago and no appointment logged yet`}>No activity {STALE_PROSPECT_DAYS}d+</span>}
          <span className={`tr-type-badge ${leaning === 'sale' ? 'tr-type-badge-sale' : leaning === 'recruit' ? 'tr-type-badge-recruit' : leaning === 'both' ? 'tr-type-badge-both' : ''}`}>
            {LEANING_LABELS[leaning]}
          </span>
          <span className="tr-score" title={`${total} of 9 characteristics checked`}>
            <span className="tr-score-track"><span className="tr-score-fill" style={{ width: `${(total / 9) * 100}%` }} /></span>
            <span className="tr-mono">{total}/9</span>
          </span>
          {collapsible && !readOnly && onLogAppointment && !open && (
            <button type="button" className="tr-btn tr-btn-sm tr-btn-ghost" onClick={() => onLogAppointment(prospect)} title="Log an appointment for this prospect">
              <CalendarDays size={13} /><span className="tr-hide-mobile"> Log appt</span>
            </button>
          )}
          {collapsible && (
            <button type="button" className="tr-icon-btn tr-prospect-toggle" onClick={() => setOpen(o => !o)} title={open ? 'Collapse' : 'Show details'} aria-expanded={open}>
              {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          )}
          {(!collapsible || open) && onEdit && <button type="button" className="tr-icon-btn" onClick={() => onEdit(prospect)} title="Edit prospect"><Pencil size={14} /></button>}
          {(!collapsible || open) && onDelete && <button type="button" className="tr-icon-btn" onClick={() => onDelete(prospect.id)} title="Delete prospect"><Trash2 size={14} /></button>}
        </div>
      </div>
      {open && <>
      {checkedChars.length > 0 && (
        <div className="tr-prospect-char-pills">
          {checkedChars.map(c => <span key={c.key} className="tr-prospect-char-pill">{c.label}</span>)}
        </div>
      )}
      {prospect.notes && <p className="tr-note" style={{ marginTop: 8 }}>{prospect.notes}</p>}
      <ContactLinks email={prospect.email} />
      {!readOnly && (
      <div className="tr-prospect-outcome-row">
        {onLogAppointment && (
          <button type="button" className="tr-btn tr-btn-sm tr-btn-ghost" onClick={() => onLogAppointment(prospect)}>
            <CalendarDays size={13} /> Log appointment
          </button>
        )}
        <button
          type="button" className={`tr-btn tr-btn-sm ${prospect.markedRecruited ? 'tr-btn-brass' : 'tr-btn-ghost'}`}
          onClick={() => onToggleOutcome(prospect, 'markedRecruited')}>
          {prospect.markedRecruited ? '✓ Recruited' : 'Mark recruited'}
        </button>
        <button
          type="button" className={`tr-btn tr-btn-sm ${prospect.markedSold ? 'tr-btn-brass' : 'tr-btn-ghost'}`}
          onClick={() => onToggleOutcome(prospect, 'markedSold')}>
          {prospect.markedSold ? '✓ Sold' : 'Mark sold'}
        </button>
      </div>
      )}
      </>}
    </div>
  );
}
// ---------------------------------------------------------------------
// milestones — career-ladder reference, licensing, and live promotion
// progress tracking; Incentives is still a placeholder
// ---------------------------------------------------------------------
async function fetchMyLicensing(userId) {
  const { data, error } = await supabase.from('profiles').select('npn, fg_writing_number, hierarchy_tier_changed_at').eq('id', userId).single();
  if (error) { console.error(error); return { npn: '', fg_writing_number: '' }; }
  return data;
}
async function saveLicensing(userId, npn, fgWritingNumber) {
  const { error } = await supabase.from('profiles').update({ npn: npn.trim() || null, fg_writing_number: fgWritingNumber.trim() || null }).eq('id', userId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
// The career ladder: one rung per tier, top of the ladder first. Rungs
// already reached are marked done, your current one is highlighted, and the
// rest show what it takes to get there.
function TierLadder({ currentTierKey }) {
  const currentIdx = HIERARCHY_TIERS.findIndex(t => t.key === currentTierKey);
  const rungs = HIERARCHY_TIERS.map((tier, i) => ({ tier, i })).reverse();
  return (
    <ol className="tr-card tr-ladder" aria-label="Promotion ladder">
      {rungs.map(({ tier, i }) => {
        const state = currentIdx === -1 ? 'ahead' : i < currentIdx ? 'done' : i === currentIdx ? 'current' : i === currentIdx + 1 ? 'next' : 'ahead';
        return (
          <li key={tier.key} className={`tr-rung tr-rung-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="tr-rung-node" aria-hidden="true">{state === 'done' ? <Check size={13} strokeWidth={3} /> : null}</span>
            <div className="tr-rung-body">
              <div className="tr-rung-head">
                <span className="tr-rung-name">{tier.name} <span className="tr-rung-abbr">{tier.key}</span></span>
                {state === 'current' ? <span className="tr-status tr-status-amber">You are here</span> : state === 'next' ? <span className="tr-status tr-status-none">Next</span> : null}
                <span className="tr-rung-pct">{tier.commission}%</span>
              </div>
              {tier.criteria.length === 0 ? (
                <div className="tr-rung-meta">Automatically assigned at sign-up.</div>
              ) : state !== 'done' ? (
                <>
                  <div className="tr-rung-meta">{HIERARCHY_TIER_WINDOW_LABELS[tier.window]}</div>
                  <ul className="tr-rung-criteria">{tier.criteria.map((c, k) => <li key={k}>{c}</li>)}</ul>
                </>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
function RequirementRow({ req }) {
  if (req.kind === 'status') {
    return (
      <div className="tr-req-row">
        <span className="tr-req-label">{req.label}</span>
        <span className={`tr-type-badge ${req.met ? 'tr-type-badge-both' : ''}`}>{req.met ? '✓ Done' : 'Not yet'}</span>
      </div>
    );
  }
  if (req.kind === 'count' || req.kind === 'money') {
    const isMoney = req.kind === 'money';
    const pct = Math.min(100, (req.current / req.target) * 100);
    return (
      <div className="tr-req-row tr-req-row-bar">
        <div className="tr-req-head">
          <span className="tr-req-label">{req.label}</span>
          <span className="tr-req-nums">{isMoney ? `$${req.current.toLocaleString()} / $${req.target.toLocaleString()}` : `${req.current} / ${req.target}`}</span>
        </div>
        <div className="tr-req-track"><div className={`tr-req-bar ${req.met ? 'tr-req-bar-met' : ''}`} style={{ width: `${Math.max(pct, req.current > 0 ? 4 : 0)}%` }} /></div>
      </div>
    );
  }
  if (req.kind === 'money-consecutive') {
    return (
      <div className="tr-req-row tr-req-row-bar">
        <div className="tr-req-head">
          <span className="tr-req-label">{req.label} — 2 consecutive months at ${req.target.toLocaleString()}+</span>
        </div>
        <div className="tr-req-months">
          {req.months.map(m => (
            <div key={`${m.year}-${m.month}`} className={`tr-req-month ${m.met ? 'tr-req-month-met' : ''} ${m.applicable === false ? 'tr-req-month-na' : ''}`}>
              <span className="tr-req-month-label">{m.label}{m.isCurrent ? ' (so far)' : ''}</span>
              <span className="tr-req-month-sum">{m.applicable === false ? 'Before promotion' : `$${m.sum.toLocaleString()}`}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
}
function MyProgressCard({ user }) {
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(null);
  const [notSet, setNotSet] = useState(false);
  const [atTop, setAtTop] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [orgDirectory, licensing, myAppts, traineeAppts] = await Promise.all([
      fetchOrgDirectory(),
      fetchMyLicensing(user.id),
      fetchMyAppointments(user.id),
      fetchAppointmentsAsTrainee(user.id),
    ]);
    const person = { ...(orgDirectory.find(p => p.id === user.id) || { id: user.id, manager_id: null }), hierarchy_tier: user.hierarchyTier, ...licensing };
    if (!person.hierarchy_tier) { setNotSet(true); setAtTop(false); setProgress(null); setLoading(false); return; }
    if (!nextTierAfter(person.hierarchy_tier)) { setAtTop(true); setNotSet(false); setProgress(null); setLoading(false); return; }
    const downline = computeDownline(user.id, orgDirectory).filter(p => p.id !== user.id);
    const downlineAppts = await fetchAppointmentsForUserIds(downline.map(p => p.id));
    setNotSet(false); setAtTop(false);
    setProgress(computeTierProgress(person, orgDirectory, myAppts, downlineAppts, traineeAppts));
    setLoading(false);
  }, [user.id, user.hierarchyTier]);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading) return <SkeletonCards count={2} />;
  if (notSet) {
    return <div className="tr-card"><p className="tr-empty">Your hierarchy tier hasn't been set yet — ask a super admin to set it in Manage Team.</p></div>;
  }
  if (atTop) {
    return <div className="tr-card"><p className="tr-empty">You've reached the top of the ladder — Executive Vice Chairman.</p></div>;
  }
  if (!progress) return null;

  return (
    <div className="tr-card tr-progress-card">
      <div className="tr-row-head" style={{ marginBottom: 2 }}>
        <h3 className="tr-h3" style={{ margin: 0 }}>Your progress toward {progress.nextTier.name} ({progress.nextTier.key})</h3>
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={refresh}>Refresh</button>
      </div>
      <p className="tr-subtitle" style={{ margin: '2px 0 14px' }}>{HIERARCHY_TIER_WINDOW_LABELS[progress.nextTier.window]}</p>
      {progress.results.map((req, i) => <RequirementRow key={i} req={req} />)}
      {progress.allMet && (
        <div className="tr-badge tr-badge-weekday" style={{ marginTop: 12 }}>All requirements met — ready for promotion!</div>
      )}
    </div>
  );
}
function PromotionGuidelinesBody({ user }) {
  return (
    <>
      <PageHead
        title="Promotion guidelines"
        sub={HIERARCHY_TIERS.some(t => t.key === user.hierarchyTier)
          ? `Your tier: ${hierarchyTierLabel(user.hierarchyTier)} · ${HIERARCHY_TIERS.find(t => t.key === user.hierarchyTier).commission}% commission`
          : "Your tier hasn't been set yet. Ask a super admin to set it in Manage Team."} />
      <MyProgressCard user={user} />
      <TierLadder currentTierKey={user.hierarchyTier} />
    </>
  );
}
function IncentivesBody() {
  return (
    <>
      <PageHead title="Incentives" />
      <div className="tr-card"><p className="tr-empty">Coming soon.</p></div>
    </>
  );
}
function LicensingBody({ user }) {
  const [savedNpn, setSavedNpn] = useState('');
  const [savedFgNumber, setSavedFgNumber] = useState('');
  const [npn, setNpn] = useState('');
  const [fgNumber, setFgNumber] = useState('');
  const [editing, setEditing] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchMyLicensing(user.id).then(data => {
      const n = data.npn || '', f = data.fg_writing_number || '';
      setSavedNpn(n); setSavedFgNumber(f);
      setNpn(n); setFgNumber(f);
      setEditing(!(n && f)); // only start locked if already fully licensed
      setLoaded(true);
    });
  }, [user.id]);

  async function save() {
    setSaving(true); setError('');
    const res = await saveLicensing(user.id, npn, fgNumber);
    setSaving(false);
    if (!res.ok) { setError(res.error || 'Could not save. Try again.'); return; }
    setSavedNpn(npn.trim()); setSavedFgNumber(fgNumber.trim());
    setEditing(false); // lock once saved — matches what's now actually on file
  }
  function cancelEdit() {
    setNpn(savedNpn); setFgNumber(savedFgNumber);
    setError('');
    setEditing(!(savedNpn && savedFgNumber));
  }
  function startEdit() {
    setError('');
    setEditing(true);
  }

  // Based on what's actually saved, not whatever's currently typed —
  // the badge shouldn't flip on before Save locks it in.
  const licensed = isLicensed({ npn: savedNpn, fg_writing_number: savedFgNumber });

  return (
    <>
      <PageHead title="Licensing" sub="Field Associates start right away, even before they're licensed. Record your numbers here once you are." />
      {!loaded ? <SkeletonCards count={1} /> : (
        <div className="tr-card">
          <div className="tr-row-head" style={{ marginBottom: 14 }}>
            <h3 className="tr-h3" style={{ margin: 0 }}>Your licensing info</h3>
            {licensed && <span className="tr-type-badge tr-type-badge-both">✓ Licensed</span>}
          </div>
          {editing ? (
            <>
              <div className="tr-form-grid">
                <label className="tr-field">
                  <span>National Producer Number (NPN)</span>
                  <input value={npn} onChange={e => setNpn(e.target.value)} placeholder="e.g. 1234567" />
                </label>
                <label className="tr-field">
                  <span>Fidelity &amp; Guaranty (F&amp;G) Writing Number</span>
                  <input value={fgNumber} onChange={e => setFgNumber(e.target.value)} placeholder="Your F&G writing number" />
                </label>
              </div>
              {!isLicensed({ npn, fg_writing_number: fgNumber }) && (
                <p className="tr-note" style={{ marginTop: 4 }}>Both fields need to be filled in to count as licensed.</p>
              )}
              {error && <div className="tr-error">{error}</div>}
              <div className="tr-form-actions">
                {savedNpn && savedFgNumber && (
                  <button type="button" className="tr-btn tr-btn-ghost" onClick={cancelEdit}>Cancel</button>
                )}
                <button type="button" className="tr-btn tr-btn-brass" onClick={save} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="tr-form-grid">
                <div className="tr-field">
                  <span>National Producer Number (NPN)</span>
                  <div className="tr-locked-value">{savedNpn}</div>
                </div>
                <div className="tr-field">
                  <span>Fidelity &amp; Guaranty (F&amp;G) Writing Number</span>
                  <div className="tr-locked-value">{savedFgNumber}</div>
                </div>
              </div>
              <div className="tr-form-actions">
                <button type="button" className="tr-btn tr-btn-ghost" onClick={startEdit}><Pencil size={14} /> Edit</button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
function MilestonesBody({ user, initialIntent, onIntentConsumed }) {
  const [view, setView] = useState(initialIntent === 'licensing' ? 'licensing' : 'guidelines'); // 'guidelines' | 'licensing' | 'incentives'
  useEffect(() => { if (initialIntent) onIntentConsumed?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="tr-appts-shell">
      <nav className="tr-appts-sidebar">
        <button
          type="button" className={`tr-sidebar-item tr-sidebar-item-week ${view === 'guidelines' ? 'tr-sidebar-item-active' : ''}`}
          onClick={() => setView('guidelines')}>
          <span>Promotion Guidelines</span>
        </button>
        <button
          type="button" className={`tr-sidebar-item tr-sidebar-item-week ${view === 'licensing' ? 'tr-sidebar-item-active' : ''}`}
          onClick={() => setView('licensing')}>
          <span>Licensing</span>
        </button>
        <button
          type="button" className={`tr-sidebar-item tr-sidebar-item-week ${view === 'incentives' ? 'tr-sidebar-item-active' : ''}`}
          onClick={() => setView('incentives')}>
          <span>Incentives</span>
        </button>
      </nav>
      <div className="tr-appts-main">
        {view === 'guidelines' && <PromotionGuidelinesBody user={user} />}
        {view === 'licensing' && <LicensingBody user={user} />}
        {view === 'incentives' && <IncentivesBody />}
      </div>
    </div>
  );
}
// ---------------------------------------------------------------------
// documents — shared PDF library, open to everyone; upload/delete is
// super_admin only
// ---------------------------------------------------------------------
// Clickable link library — same super-admin-manages, everyone-views model
// as PDF/PPTX Documents, just title+URL instead of a file.
function ImportantLinksSection({ user }) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLinks(await fetchImportantLinks());
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // A link without a scheme (someone typing "success.fglife.com" instead
  // of "https://success.fglife.com") would open as a broken relative path
  // rather than a real external link — this quietly fixes that on save.
  function normalizeUrl(u) {
    const trimmed = u.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  async function handleAdd() {
    if (!newTitle.trim() || !newUrl.trim()) { setError('Give the link a title and a URL.'); return; }
    setSaving(true);
    setError('');
    const res = await addImportantLink(newTitle, normalizeUrl(newUrl), user.id, user.displayName);
    setSaving(false);
    if (!res.ok) { setError(res.error || 'Could not save. Try again.'); return; }
    setLinks(prev => [...prev, res.record]);
    setNewTitle(''); setNewUrl(''); setShowAdd(false);
  }
  async function handleDelete(link) {
    if (!window.confirm(`Remove "${link.title}"?`)) return;
    const prev = links;
    setLinks(links.filter(l => l.id !== link.id));
    const ok = await deleteImportantLink(link.id);
    if (!ok) setLinks(prev);
  }
  function startEdit(link) {
    setEditingId(link.id);
    setEditTitle(link.title);
    setEditUrl(link.url);
    setError('');
  }
  function cancelEdit() {
    setEditingId(null);
    setEditTitle(''); setEditUrl('');
  }
  async function saveEdit(link) {
    if (!editTitle.trim() || !editUrl.trim()) { setError('Title and URL can\'t be empty.'); return; }
    setSavingEdit(true);
    setError('');
    const normalized = normalizeUrl(editUrl);
    const ok = await updateImportantLink(link.id, editTitle, normalized);
    setSavingEdit(false);
    if (!ok) { setError('Could not save. Try again.'); return; }
    setLinks(prev => prev.map(l => l.id === link.id ? { ...l, title: editTitle.trim(), url: normalized } : l));
    setEditingId(null);
  }

  return (
    <>
      <div className="tr-row-head">
        <h2 className="tr-h2">Important Links</h2>
        {user.role === 'super_admin' && (
          <button className="tr-btn tr-btn-brass" onClick={() => setShowAdd(v => !v)}>
            <Plus size={16} /> {showAdd ? 'Close' : 'Add link'}
          </button>
        )}
      </div>
      <p className="tr-subtitle">Quick access to the resources the whole team uses regularly.</p>
      {error && <div className="tr-error">{error}</div>}
      {showAdd && (
        <div className="tr-card tr-form">
          <div className="tr-form-grid">
            <label className="tr-field tr-field-wide">
              <span>Link text</span>
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. F&G Webinar Center" />
            </label>
            <label className="tr-field tr-field-wide">
              <span>URL</span>
              <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://…" />
            </label>
          </div>
          <div className="tr-form-actions">
            <button type="button" className="tr-btn tr-btn-brass" onClick={handleAdd} disabled={saving}>{saving ? 'Saving…' : 'Add link'}</button>
          </div>
        </div>
      )}
      {loading ? <SkeletonCards count={3} /> : links.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">No links added yet.</p></div>
      ) : (
        <div className="tr-card">
          <ul className="tr-links-list">
            {links.map(link => (
              <li key={link.id} className="tr-links-row">
                {editingId === link.id ? (
                  <div className="tr-links-edit-row">
                    <input value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Link text" />
                    <input value={editUrl} onChange={e => setEditUrl(e.target.value)} placeholder="https://…" />
                    <button type="button" className="tr-btn tr-btn-sm tr-btn-brass" onClick={() => saveEdit(link)} disabled={savingEdit}>{savingEdit ? 'Saving…' : 'Save'}</button>
                    <button type="button" className="tr-btn tr-btn-sm tr-btn-ghost" onClick={cancelEdit} disabled={savingEdit}>Cancel</button>
                  </div>
                ) : (
                  <>
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="tr-links-anchor">{link.title}</a>
                    {user.role === 'super_admin' && (
                      <div className="tr-links-actions">
                        <button type="button" className="tr-icon-btn" onClick={() => startEdit(link)} title="Edit link"><Pencil size={14} /></button>
                        <button type="button" className="tr-icon-btn" onClick={() => handleDelete(link)} title="Remove link"><Trash2 size={14} /></button>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
function DocumentsBody({ user }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('pdf'); // 'pdf' | 'pptx' | 'links'
  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [renaming, setRenaming] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setDocuments(await fetchDocuments());
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const pdfDocs = documents.filter(d => (d.file_type || 'pdf') === 'pdf');
  const pptxDocs = documents.filter(d => d.file_type === 'pptx');
  const activeDocs = view === 'pdf' ? pdfDocs : pptxDocs;

  function switchView(v) {
    setView(v);
    setShowUpload(false);
    setError('');
    setTitle('');
    setFile(null);
  }

  async function handleUpload() {
    if (!file) { setError(`Choose a ${view === 'pdf' ? 'PDF' : 'PPTX'} file to upload.`); return; }
    if (!title.trim()) { setError('Give the document a title.'); return; }
    setUploading(true);
    setError('');
    const res = await uploadDocument(file, title, user.id, user.displayName, view);
    setUploading(false);
    if (!res.ok) { setError(res.error || 'Upload failed. Try again.'); return; }
    setDocuments(prev => [res.record, ...prev]);
    setTitle(''); setFile(null); setShowUpload(false);
  }
  async function handleDelete(doc) {
    if (!window.confirm(`Delete "${doc.title}"? This can't be undone.`)) return;
    const prev = documents;
    setDocuments(documents.filter(d => d.id !== doc.id));
    const ok = await deleteDocument(doc.id, doc.file_path);
    if (!ok) setDocuments(prev);
  }
  async function handleDownload(doc) {
    setDownloadingId(doc.id);
    const url = await getDocumentDownloadUrl(doc.file_path);
    setDownloadingId(null);
    if (url) window.open(url, '_blank');
    else setError('Could not generate a download link. Try again.');
  }
  function startRename(doc) {
    setEditingId(doc.id);
    setEditTitle(doc.title);
    setError('');
  }
  function cancelRename() {
    setEditingId(null);
    setEditTitle('');
  }
  async function saveRename(doc) {
    if (!editTitle.trim()) { setError('Title can\'t be empty.'); return; }
    setRenaming(true);
    setError('');
    const ok = await updateDocumentTitle(doc.id, editTitle);
    setRenaming(false);
    if (!ok) { setError('Could not rename. Try again.'); return; }
    setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, title: editTitle.trim() } : d));
    setEditingId(null);
    setEditTitle('');
  }

  return (
    <div className="tr-appts-shell">
      <nav className="tr-appts-sidebar">
        <button
          type="button" className={`tr-sidebar-item tr-sidebar-item-week ${view === 'pdf' ? 'tr-sidebar-item-active' : ''}`}
          onClick={() => switchView('pdf')}>
          <span>PDF Documents</span>
          <span className="tr-mono">{pdfDocs.length}</span>
        </button>
        <button
          type="button" className={`tr-sidebar-item tr-sidebar-item-week ${view === 'pptx' ? 'tr-sidebar-item-active' : ''}`}
          onClick={() => switchView('pptx')}>
          <span>PPTX Documents</span>
          <span className="tr-mono">{pptxDocs.length}</span>
        </button>
        <button
          type="button" className={`tr-sidebar-item tr-sidebar-item-week ${view === 'links' ? 'tr-sidebar-item-active' : ''}`}
          onClick={() => switchView('links')}>
          <span>Important Links</span>
        </button>
      </nav>
      <div className="tr-appts-main">
        {view === 'links' ? <ImportantLinksSection user={user} /> : (
        <>
        <div className="tr-row-head">
          <h2 className="tr-h2"><FileText size={18} /> {view === 'pdf' ? 'PDF Documents' : 'PPTX Documents'}</h2>
          {user.role === 'super_admin' && (
            <button className="tr-btn tr-btn-brass" onClick={() => setShowUpload(v => !v)}>
              <Plus size={16} /> {showUpload ? 'Close' : 'Upload document'}
            </button>
          )}
        </div>
        <p className="tr-subtitle">Training and presentation materials the whole team can download and practice with.</p>
        {error && <div className="tr-error">{error}</div>}
        {showUpload && (
          <div className="tr-card tr-form">
            <div className="tr-form-grid">
              <label className="tr-field tr-field-wide">
                <span>Title</span>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. New Product Presentation" />
              </label>
              <label className="tr-field tr-field-wide">
                <span>{view === 'pdf' ? 'PDF file' : 'PPTX file'}</span>
                <input
                  type="file"
                  accept={view === 'pdf' ? 'application/pdf' : '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation'}
                  onChange={e => setFile(e.target.files[0] || null)} />
              </label>
            </div>
            <div className="tr-form-actions">
              <button type="button" className="tr-btn tr-btn-brass" onClick={handleUpload} disabled={uploading}>{uploading ? 'Uploading…' : 'Upload'}</button>
            </div>
          </div>
        )}
        {loading ? <SkeletonCards count={3} /> : activeDocs.length === 0 ? (
          <div className="tr-card"><p className="tr-empty">No {view === 'pdf' ? 'PDF' : 'PPTX'} documents uploaded yet.</p></div>
        ) : (
          activeDocs.map(doc => (
            <div key={doc.id} className="tr-card tr-document-card">
              <div className="tr-policy-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <FileText size={20} className="tr-document-icon" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingId === doc.id ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          value={editTitle} onChange={e => setEditTitle(e.target.value)} autoFocus
                          style={{ flex: 1, minWidth: 0, font: 'inherit', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--line)' }} />
                        <button type="button" className="tr-btn tr-btn-sm tr-btn-brass" onClick={() => saveRename(doc)} disabled={renaming}>
                          {renaming ? 'Saving…' : 'Save'}
                        </button>
                        <button type="button" className="tr-btn tr-btn-sm tr-btn-ghost" onClick={cancelRename} disabled={renaming}>Cancel</button>
                      </div>
                    ) : (
                      <strong>{doc.title}</strong>
                    )}
                    <div className="tr-note">
                      Uploaded by {doc.uploaded_by_name} · {new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {doc.file_size ? ` · ${formatFileSize(doc.file_size)}` : ''}
                    </div>
                  </div>
                </div>
                {editingId !== doc.id && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button type="button" className="tr-btn tr-btn-sm tr-btn-ghost" onClick={() => handleDownload(doc)} disabled={downloadingId === doc.id}>
                      <Download size={13} /> {downloadingId === doc.id ? 'Preparing…' : 'Download'}
                    </button>
                    {user.role === 'super_admin' && (
                      <>
                        <button type="button" className="tr-icon-btn" onClick={() => startRename(doc)} title="Rename document"><Pencil size={14} /></button>
                        <button type="button" className="tr-icon-btn" onClick={() => handleDelete(doc)} title="Delete document"><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        </>
        )}
      </div>
    </div>
  );
}
// A curated subset of BIG's "Prospect List Worksheet - Memory Jogger"
// handout — every category from the original, trimmed down to the
// entries most likely to actually jog a name loose, so it reads as a
// quick nudge rather than a wall of text to scroll through.
const MEMORY_JOGGER_CATEGORIES = [
  {
    title: 'Family & Friends',
    items: ['Best Friend', "Best Friend's Parents", 'Brother / Sister', 'Brother-in-law / Sister-in-law', 'Cousin', "Spouse's Best Friend", 'Aunt / Uncle', 'Parents'],
  },
  {
    title: 'Who...',
    items: [
      'Is very ambitious', 'Is a consultant or trainer', 'Is in a high-profile job', 'Is a prominent business owner',
      'Recently had children', 'Has influence with others', 'Wants more out of life', 'Missed last promotion',
      'Will be / has been laid off', 'Needs a part-time job', 'Is looking for a new profession', 'Is known by everyone in town',
    ],
  },
  {
    title: 'Who do you know at...',
    items: ['Church', 'Golf Club', 'Health Club', 'Hospital', 'Library', 'Past Jobs', 'Supermarket', 'Volunteer Group', 'Night School'],
  },
  {
    title: 'Who owns or runs a...',
    items: ['Convenience Store', 'Department Store', 'Restaurant', 'Hotel Business', 'Service Station', 'Hardware Store', 'Machine Shop', 'Eye Center'],
  },
  {
    title: 'Who sold you your...',
    items: ['Car / Truck', 'House', 'Car Insurance', 'Furniture', 'Computer', 'Business Machines', 'Office Supplies', 'Telephone System', 'Cable / Satellite TV', 'Jewelry'],
  },
  {
    title: 'Do you know a...',
    items: [
      'Accountant', 'Business Owner', 'Company Executive', 'Contractor', 'Dentist', 'Doctor', 'Engineer', 'Nurse',
      'Pharmacist', 'Real Estate Agent', 'Restaurant Owner', 'Teacher', 'Veterinarian', 'Chiropractor', 'Architect',
    ],
  },
];
function MemoryJoggerPanel() {
  const [openCats, setOpenCats] = useState(() => new Set([0]));
  function toggle(i) {
    setOpenCats(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }
  return (
    <div className="tr-card">
      <h3 className="tr-h3">Memory Jogger</h3>
      <p className="tr-empty" style={{ marginTop: -6 }}>Stuck on who to add next? Work down these — someone on the list almost always jogs a name loose.</p>
      {MEMORY_JOGGER_CATEGORIES.map((cat, i) => {
        const open = openCats.has(i);
        return (
          <div className="tr-bizplan-step" key={cat.title}>
            <button type="button" className="tr-jogger-cat-head" onClick={() => toggle(i)}>
              <h4 className="tr-h4" style={{ margin: 0 }}>{cat.title}</h4>
              {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            {open && (
              <div className="tr-pillrow" style={{ marginTop: 10 }}>
                {cat.items.map(item => <span className="tr-pill-btn" key={item}>{item}</span>)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
function SystemsBody({ user, onLogAppointment, initialIntent, onIntentConsumed }) {
  const [prospects, setProspects] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [systemsView, setSystemsView] = useState(initialIntent === 'new' ? 'prospect' : initialIntent === 'jogger' ? 'jogger' : 'list'); // 'prospect' | 'list' | 'recruit' | 'sold' | 'jogger'
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [leaningFilter, setLeaningFilter] = useState('all'); // 'all' | 'sale' | 'recruit' | 'both'
  const [sortBy, setSortBy] = useState('score'); // 'score' | 'newest' | 'oldest'
  const [searchQuery, setSearchQuery] = useState('');
  const [editingProspect, setEditingProspect] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const [quickFirst, setQuickFirst] = useState('');
  const [quickLast, setQuickLast] = useState('');
  const [staleOnly, setStaleOnly] = useState(initialIntent === 'stale');

  useEffect(() => { if (initialIntent) onIntentConsumed?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(async () => {
    setLoading(true);
    const [p, a] = await Promise.all([fetchMyProspects(user.id), fetchMyAppointments(user.id)]);
    setProspects(p);
    setAppointments(a);
    setLoading(false);
  }, [user.id]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(''), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  // Most recent appointment per client name, so prospect cards can show
  // "Appt Oct 5" once they've been booked.
  const apptNames = new Set();
  const latestApptByName = {};
  appointments.forEach(a => {
    const k = normName(a.client);
    apptNames.add(k);
    if (!latestApptByName[k] || a.appointmentDate > latestApptByName[k]) latestApptByName[k] = a.appointmentDate;
  });

  async function handleSubmit(form, { another } = {}) {
    setSaving(true);
    setError('');
    if (editingProspect) {
      const res = await updateProspect(editingProspect.id, form);
      setSaving(false);
      if (!res.ok) { setError(res.error || 'Could not save. Try again.'); return; }
      setProspects(prev => prev.map(p => p.id === editingProspect.id ? res.record : p));
      setEditingProspect(null);
      setSystemsView('list');
      return;
    }
    const res = await insertProspect(user.id, form);
    setSaving(false);
    if (!res.ok) { setError(res.error || 'Could not save. Try again.'); return; }
    setProspects(prev => [res.record, ...prev]);
    setFlash(`Saved ${res.record.firstName} ${res.record.lastName}.`);
    if (another) { setFormKey(k => k + 1); window.scrollTo(0, 0); } else setSystemsView('list');
  }
  async function handleQuickAdd(e) {
    e.preventDefault();
    if (!quickFirst.trim() || !quickLast.trim()) { setError('Enter a first and last name to quick-add.'); return; }
    setError('');
    setSaving(true);
    const blank = { firstName: quickFirst, lastName: quickLast, age: '', relationshipStrength: 5, notes: '', source: '' };
    ALL_CHARACTERISTICS.forEach(c => { blank[c.key] = false; });
    const res = await insertProspect(user.id, blank);
    setSaving(false);
    if (!res.ok) { setError(res.error || 'Could not save. Try again.'); return; }
    setProspects(prev => [res.record, ...prev]);
    setQuickFirst(''); setQuickLast('');
    setSortBy('newest');
    setFlash(`Added ${res.record.firstName} ${res.record.lastName} — open them and tap the pencil to score them.`);
  }
  function handleEdit(prospect) {
    setEditingProspect(prospect);
    setSystemsView('prospect');
  }
  async function handleDelete(id) {
    if (!window.confirm("Delete this prospect? This can't be undone.")) return;
    const prev = prospects;
    setProspects(prospects.filter(p => p.id !== id));
    const ok = await deleteProspect(id);
    if (!ok) setProspects(prev);
  }
  async function handleToggleOutcome(prospect, field) {
    const nextValue = !prospect[field];
    const prev = prospects;
    setProspects(prospects.map(p => p.id === prospect.id ? { ...p, [field]: nextValue } : p));
    const ok = await updateProspectOutcome(prospect.id, { [field]: nextValue });
    if (!ok) setProspects(prev);
  }

  const sorters = {
    score: (a, b) => prospectTotalChecked(b) - prospectTotalChecked(a),
    newest: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''),
    oldest: (a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''),
  };
  // List is purely for active prospecting — once marked recruited and/or
  // sold, a prospect moves out of List and lives in those tabs instead
  // (both, if marked as both).
  function bySearch(list) {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.trim().toLowerCase();
    return list.filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q));
  }
  const listAll = prospects.filter(p => !p.markedRecruited && !p.markedSold);
  const staleCount = listAll.filter(p => isStaleProspect(p, apptNames)).length;
  const recruitedAll = prospects.filter(p => p.markedRecruited);
  const soldAll = prospects.filter(p => p.markedSold);
  const listSorted = bySearch(listAll
    .filter(p => leaningFilter === 'all' || prospectLeaningKey(p) === leaningFilter)
    .filter(p => !staleOnly || isStaleProspect(p, apptNames))).sort(sorters[sortBy]);
  const recruitedProspects = bySearch(recruitedAll).sort(sorters[sortBy]);
  const soldProspects = bySearch(soldAll).sort(sorters[sortBy]);

  const activeList = systemsView === 'recruit' ? recruitedProspects : systemsView === 'sold' ? soldProspects : listSorted;
  const activeTitle = systemsView === 'recruit' ? 'Recruited' : systemsView === 'sold' ? 'Sold' : 'Prospects';
  const activeSub = systemsView === 'recruit' ? 'Prospects you marked as recruited.' : systemsView === 'sold' ? 'Prospects you marked as sold.'
    : `${listAll.length} active · ranked by how many of the 9 characteristics they meet`;
  const activeEmpty = systemsView === 'recruit' ? 'No prospects marked recruited yet.' : systemsView === 'sold' ? 'No prospects marked sold yet.'
    : searchQuery || leaningFilter !== 'all' || staleOnly ? 'No prospects match this search or filter.' : 'No prospects yet — quick-add a name above, or use New prospect to score them as you go.';

  const sideBtn = (v, label, color, count) => (
    <button
      type="button" className={`tr-sidebar-item tr-sidebar-item-${color} ${systemsView === v ? 'tr-sidebar-item-active' : ''}`}
      onClick={() => { if (v === 'prospect') setEditingProspect(null); setSystemsView(v); }}>
      <span>{label}</span>
      {count !== undefined && <span className="tr-mono">{count}</span>}
    </button>
  );

  return (
    <div className="tr-appts-shell">
      <nav className="tr-appts-sidebar">
        {sideBtn('list', 'Active', 'week', listAll.length)}
        {sideBtn('recruit', 'Recruit', 'recruit', recruitedAll.length)}
        {sideBtn('sold', 'Sold', 'sale', soldAll.length)}
        <div className="tr-sidebar-divider">Tools</div>
        {sideBtn('jogger', 'Memory Jogger', 'none')}
      </nav>
      <div className="tr-appts-main">
        {error && <div className="tr-error">{error}</div>}
        {flash && <div className="tr-flash">{flash}</div>}
        {systemsView === 'prospect' ? (
          <ProspectForm
            key={`${editingProspect ? editingProspect.id : 'new'}-${formKey}`}
            editing={editingProspect}
            onCancel={() => { setEditingProspect(null); setSystemsView('list'); }}
            onSubmit={handleSubmit} saving={saving}
            onOpenJogger={() => setSystemsView('jogger')} />
        ) : systemsView === 'jogger' ? (
          <>
            <MemoryJoggerPanel />
            <button type="button" className="tr-btn tr-btn-brass" style={{ alignSelf: 'flex-start' }} onClick={() => { setEditingProspect(null); setSystemsView('prospect'); }}>
              <Plus size={16} /> Thought of someone? Add them
            </button>
          </>
        ) : (
          <>
            <PageHead title={activeTitle} sub={activeSub}>
              <button className="tr-btn tr-btn-brass" onClick={() => { setEditingProspect(null); setSystemsView('prospect'); }}><Plus size={16} /> New prospect</button>
            </PageHead>
            {systemsView === 'list' && <ProspectFunnel prospects={prospects} />}
            {systemsView === 'list' && (
              <form className="tr-card tr-quickadd" onSubmit={handleQuickAdd}>
                <span className="tr-quickadd-label">Quick add</span>
                <input value={quickFirst} onChange={e => setQuickFirst(e.target.value)} placeholder="First name" aria-label="First name" />
                <input value={quickLast} onChange={e => setQuickLast(e.target.value)} placeholder="Last name" aria-label="Last name" />
                <button type="submit" className="tr-btn tr-btn-ghost tr-btn-sm" disabled={saving}><Plus size={14} /> Add</button>
              </form>
            )}
            <div className="tr-toolbar">
              <div className="tr-search-row">
                <Search size={15} className="tr-search-icon" />
                <input
                  className="tr-search-input" type="text" placeholder="Search by name…"
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                {searchQuery && (
                  <button type="button" className="tr-icon-btn" onClick={() => setSearchQuery('')} title="Clear search"><X size={15} /></button>
                )}
              </div>
              <select className="tr-toolbar-select" value={sortBy} onChange={e => setSortBy(e.target.value)} aria-label="Sort prospects">
                <option value="score">Best match first</option>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>
            {systemsView === 'list' && (
              <div className="tr-filterbar">
                <div className="tr-seg" role="group" aria-label="Show">
                  {[['all', 'All'], ['sale', 'Sale'], ['recruit', 'Recruit'], ['both', 'Both']].map(([v, label]) => (
                    <button key={v} type="button" className={leaningFilter === v ? 'tr-seg-on' : ''} aria-pressed={leaningFilter === v} onClick={() => setLeaningFilter(v)}>{label}</button>
                  ))}
                </div>
                {(staleCount > 0 || staleOnly) && (
                  <button type="button" className={`tr-chip-toggle ${staleOnly ? 'tr-chip-toggle-on' : ''}`} aria-pressed={staleOnly} onClick={() => setStaleOnly(v => !v)}
                    title={`Added ${STALE_PROSPECT_DAYS}+ days ago with no appointment logged yet`}>
                    <span className="tr-chip-dot" /> {staleCount} with no activity in {STALE_PROSPECT_DAYS}+ days
                    {staleOnly ? <X size={13} /> : null}
                  </button>
                )}
              </div>
            )}
            {loading ? <SkeletonCards count={3} /> : activeList.length === 0 ? (
              <div className="tr-card"><p className="tr-empty">{activeEmpty}</p></div>
            ) : (
              <div className="tr-prospect-list">
                {activeList.map((p, i) => (
                  <ProspectCard
                    key={p.id} prospect={p} rank={sortBy === 'score' ? i + 1 : null} collapsible
                    apptNames={apptNames} apptDate={latestApptByName[prospectNameKey(p)]}
                    onDelete={handleDelete} onToggleOutcome={handleToggleOutcome} onLogAppointment={onLogAppointment} onEdit={handleEdit} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
// Shared by My Appointments and the Follow Up tab: saves the follow-up
// answers, auto-creates the next appointment if one was scheduled, and
// spins up an intake candidate once (idempotent against the ORIGINAL
// appointment's flag, so re-saving never creates a second link).
async function persistFollowUp(user, id, original, data) {
  const followUpTimezone = (original && original.appointmentTimezone) || detectTimezone();
  const ok = await saveFollowUp(id, data, followUpTimezone);
  if (!ok) return { ok: false };
  let newAppt = null;
  if (data.followUpScheduled === true && data.followUpDate && data.followUpTime && original) {
    const res = await insertFollowUpAppointment(user.id, original, data.followUpDate, data.followUpTime, followUpTimezone);
    if (res.ok) newAppt = res.record;
  }
  if (data.clientIntake === true && original && !original.clientIntakeRequested) {
    await createClientIntakeCandidate({
      advisorId: user.id, advisorName: user.displayName,
      appointmentId: id, clientName: original.client,
    });
  }
  return { ok: true, newAppt, followUpTimezone };
}
function applyFollowUpToList(prev, id, data, followUpTimezone, newAppt) {
  const status = deriveStatus(data.outcome, data.followUpScheduled);
  const scheduled = data.followUpScheduled === true;
  const updated = prev.map(a => a.id === id ? {
    ...a, ...data, status, followUpCompletedAt: new Date().toISOString(),
    followUpAppointmentDate: scheduled ? data.followUpDate : '',
    followUpAppointmentTime: scheduled ? data.followUpTime : '',
    followUpAppointmentTimezone: scheduled ? followUpTimezone : '',
    followUpAppointmentAt: newAppt ? newAppt.appointmentAt : a.followUpAppointmentAt,
    clientIntakeRequested: a.clientIntakeRequested || data.clientIntake === true,
  } : a);
  return newAppt ? [...updated, newAppt] : updated;
}
function MyAppointmentsBody({ user, prefillData, onPrefillConsumed }) {
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
      // Invites: Google Calendar sends them when it's connected; otherwise
      // PaceLedger emails them itself.
      if (inviteEmails.length) {
        if (google.ownInvited) {
          await markInviteSent(record.id, inviteEmails, 'google');
          record = { ...record, inviteeEmails: inviteEmails, inviteMethod: 'google', inviteSentAt: new Date().toISOString() };
          setNotice({ kind: 'ok', text: `Google Calendar invite sent to ${inviteEmails.join(', ')}${record.zoomUrl ? ' with the Zoom link' : ''}.` });
        } else {
          const r = await sendAppointmentInviteEmail(record.id, inviteEmails);
          if (r.sent) {
            record = { ...record, inviteeEmails: r.recipients || inviteEmails, inviteMethod: 'email', inviteSentAt: new Date().toISOString() };
            setNotice({ kind: 'ok', text: `Invite emailed to ${(r.recipients || inviteEmails).join(', ')}${record.zoomUrl ? ' with the Zoom link' : ''}.` });
          } else {
            setNotice({ kind: 'warn', text: inviteFailureMessage(r.error) });
          }
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
// ---------------------------------------------------------------------
// Follow Up tab — every appointment whose time has passed lands here,
// with a dated running notes log, the logged outcome, next-appointment
// scheduling, and the client's intake link/answers all on one card.
// ---------------------------------------------------------------------
function fmtNoteStamp(iso) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
// One-tap note starters, so logging a touch takes a second.
const QUICK_NOTE_TAGS = ['Called', 'Left voicemail', 'Texted', 'Emailed', 'Met in person', 'No answer'];
function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
}
// Recruit sign-up link for one recruit: a personal, single-use invitation
// that puts them directly under the advisor who sends it.
function InviteShare({ invite, recruitName }) {
  const [copied, setCopied] = useState('');
  const link = buildInviteLink(invite.token);
  const first = (recruitName || '').trim().split(' ')[0];
  const message = `Hey ${first || 'there'}! Here's your personal link to create your PaceLedger account. It's already set up to put you on my team: ${link}`;
  async function copy(kind) {
    const res = await shareOrCopy(kind === 'link' ? { url: link, title: 'PaceLedger sign-up link' } : { text: message });
    if (res === 'copied') {
      setCopied(kind);
      setTimeout(() => setCopied(''), 2000);
    }
  }
  return (
    <>
      <div className="tr-intake-link-row" style={{ marginTop: 8 }}>
        <span className="tr-intake-link-box">{link}</span>
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => copy('link')}><Copy size={13} /> {copied === 'link' ? 'Copied!' : isNativeApp() ? 'Share link' : 'Copy link'}</button>
      </div>
      <div className="tr-form-actions" style={{ marginTop: 8, justifyContent: 'flex-start', alignItems: 'center' }}>
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => copy('message')}>{copied === 'message' ? 'Copied!' : isNativeApp() ? 'Send as a message' : 'Copy as a text message'}</button>
        <span className="tr-note" style={{ fontSize: 12.5 }}>
          Works once{invite.expires_at && !isNaN(new Date(invite.expires_at)) ? ` · expires ${new Date(invite.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
        </span>
      </div>
    </>
  );
}
function RecruitSignupSection({ user, recruitName, joined, appointmentId }) {
  const [invite, setInvite] = useState(undefined); // undefined = loading
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    fetchInviteForAppointment(appointmentId).then(inv => { if (alive) setInvite(inv); });
    return () => { alive = false; };
  }, [appointmentId]);
  const state = inviteState(invite);
  const signedUp = joined || state === 'used';
  async function makeLink() {
    setBusy(true); setErr('');
    const res = await createInvite({ uplineId: user.id, createdBy: user.id, inviteeName: recruitName, appointmentId });
    setBusy(false);
    if (!res.ok) { setErr("Couldn't create the link. Try again."); return; }
    setInvite(res.invite);
  }
  return (
    <div>
      <div className="tr-row-head">
        <h4 className="tr-h4" style={{ margin: 0 }}>Recruit sign-up</h4>
        {signedUp
          ? <span className="tr-status tr-status-green">Signed up</span>
          : <span className="tr-status tr-status-none">Not signed up yet</span>}
      </div>
      {signedUp && !joined && state === 'used' && (
        <button type="button" className="tr-link-btn" style={{ marginTop: 8 }} onClick={makeLink} disabled={busy}>
          Someone else used the link? Create a new one
        </button>
      )}
      {!signedUp && invite !== undefined && (
        <>
          {state === 'active' ? (
            <>
              <p className="tr-empty" style={{ margin: '6px 0 0' }}>Their personal sign-up link. It puts them directly under you, and they can't change it.</p>
              <InviteShare invite={invite} recruitName={recruitName} />
            </>
          ) : (
            <>
              <p className="tr-empty" style={{ margin: '6px 0 0' }}>
                {state === 'expired' ? 'Their sign-up link expired. Make a new one to send them.' : 'PaceLedger is invitation-only. Make a personal sign-up link that puts them directly under you.'}
              </p>
              <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" style={{ marginTop: 8 }} onClick={makeLink} disabled={busy}>
                <UserPlus size={14} /> {busy ? 'Creating…' : state === 'expired' ? 'Create a new link' : 'Create sign-up link'}
              </button>
            </>
          )}
          {err && <div className="tr-error">{err}</div>}
        </>
      )}
    </div>
  );
}
const FOLLOW_UP_VIEW_TITLES = {
  all: 'Follow up', nolog: 'Outcome not logged', needs: 'Needs follow-up', reschedule: 'Needs reschedule',
  nointake: 'Intake not started', sent: 'Intake link sent', received: 'Intake received',
  recruit_open: 'Recruits not signed up yet', recruit_joined: 'Recruits signed up',
};
function FollowUpBody({ user, onScheduleNext, initialIntent, onIntentConsumed }) {
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState([]);
  const [notes, setNotes] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [view, setView] = useState(['nolog', 'needs', 'reschedule'].includes(initialIntent) ? initialIntent : initialIntent === 'intake' ? 'nointake' : 'all'); // all | nolog | needs | reschedule | nointake | sent | received
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [noteDrafts, setNoteDrafts] = useState({});
  const [modalTarget, setModalTarget] = useState(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [orgDirectory, setOrgDirectory] = useState([]);

  useEffect(() => { if (initialIntent) onIntentConsumed?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true;
    Promise.all([fetchMyAppointments(user.id), fetchMyFollowUpNotes(user.id), fetchClientIntakeCandidates(), fetchOrgDirectory()]).then(([a, n, c, org]) => {
      if (!alive) return;
      setOrgDirectory(org);
      setAppointments(a);
      setNotes(n);
      setCandidates(c.filter(x => x.advisor_id === user.id));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [user.id]);

  if (loading) return <SkelBlock w="100%" h="260px" />;

  const apptTime = a => (a.appointmentAt ? new Date(a.appointmentAt).getTime() : new Date(`${a.appointmentDate}T${a.appointmentTime || '00:00'}`).getTime());
  const past = appointments.filter(isPastAppointment).sort((a, b) => apptTime(b) - apptTime(a));
  const candByAppt = {};
  candidates.forEach(c => { if (c.source_appointment_id) candByAppt[c.source_appointment_id] = c; });
  const notesByAppt = {};
  notes.forEach(n => { (notesByAppt[n.appointment_id] = notesByAppt[n.appointment_id] || []).push(n); });

  const intakeState = a => { const c = candByAppt[a.id]; return !c ? 'none' : c.status === 'submitted' ? 'received' : 'sent'; };
  // A recruit counts as signed up once someone with their name has joined
  // directly under you.
  const myRecruitNames = new Set(orgDirectory.filter(p => p.manager_id === user.id).map(p => normName(p.display_name)));
  const recruitJoined = a => myRecruitNames.has(normName(a.client));
  const matchesView = (a, v) => {
    if (v === 'all') return true;
    if (v === 'recruit_open') return isRecruitType(a) && !recruitJoined(a);
    if (v === 'recruit_joined') return isRecruitType(a) && recruitJoined(a);
    if (v === 'nolog') return !a.followUpCompletedAt;
    if (v === 'needs') return a.status === 'needs_follow_up';
    if (v === 'reschedule') return a.status === 'needs_reschedule';
    return intakeState(a) === (v === 'nointake' ? 'none' : v);
  };
  const counts = {
    all: past.length,
    nolog: past.filter(a => matchesView(a, 'nolog')).length,
    reschedule: past.filter(a => matchesView(a, 'reschedule')).length,
    recruit_open: past.filter(a => matchesView(a, 'recruit_open')).length,
    recruit_joined: past.filter(a => matchesView(a, 'recruit_joined')).length,
    needs: past.filter(a => a.status === 'needs_follow_up').length,
    nointake: past.filter(a => intakeState(a) === 'none').length,
    sent: past.filter(a => intakeState(a) === 'sent').length,
    received: past.filter(a => intakeState(a) === 'received').length,
  };
  const q = searchQuery.trim().toLowerCase();
  const list = past
    .filter(a => matchesView(a, view))
    .filter(a => !q || a.client.toLowerCase().includes(q));

  async function handleSaveOutcome(id, data) {
    setModalSaving(true);
    const original = appointments.find(a => a.id === id);
    const res = await persistFollowUp(user, id, original, data);
    setModalSaving(false);
    if (!res.ok) return;
    setAppointments(prev => applyFollowUpToList(prev, id, data, res.followUpTimezone, res.newAppt));
    if (data.clientIntake === true) {
      const c = await fetchClientIntakeCandidates();
      setCandidates(c.filter(x => x.advisor_id === user.id));
    }
    setModalTarget(null);
  }
  async function handleAddNote(a, preset) {
    const text = (preset || noteDrafts[a.id] || '').trim();
    if (!text) return;
    setBusyId(a.id);
    const res = await addFollowUpNote({ appointmentId: a.id, authorId: user.id, authorName: user.displayName, note: text });
    setBusyId(null);
    if (!res.ok) return;
    setNotes(prev => [res.record, ...prev]);
    if (!preset) setNoteDrafts(prev => ({ ...prev, [a.id]: '' }));
  }
  async function handleDeleteNote(n) {
    if (!window.confirm('Delete this note?')) return;
    if (await deleteFollowUpNote(n.id)) setNotes(prev => prev.filter(x => x.id !== n.id));
  }
  async function handleSendIntake(a) {
    setBusyId(a.id);
    const res = await createClientIntakeCandidate({ advisorId: user.id, advisorName: user.displayName, appointmentId: a.id, clientName: a.client });
    if (res.ok) {
      await supabase.from('appointments').update({ client_intake_requested: true }).eq('id', a.id);
      setCandidates(prev => [res.record, ...prev]);
      setAppointments(prev => prev.map(x => x.id === a.id ? { ...x, clientIntakeRequested: true } : x));
    }
    setBusyId(null);
  }
  async function handleRemoveIntake(a, candidate) {
    if (!window.confirm(`Remove ${a.client}'s intake? Their link will stop working and any answers are deleted.`)) return;
    if (await deleteClientIntakeCandidate(candidate.id)) {
      await supabase.from('appointments').update({ client_intake_requested: false }).eq('id', a.id);
      setCandidates(prev => prev.filter(c => c.id !== candidate.id));
      setAppointments(prev => prev.map(x => x.id === a.id ? { ...x, clientIntakeRequested: false } : x));
    }
  }

  const navBtn = (v, label, color = 'week') => (
    <button type="button" key={v} className={`tr-sidebar-item tr-sidebar-item-${color} ${view === v ? 'tr-sidebar-item-active' : ''}`} onClick={() => setView(v)}>
      <span>{label}</span><span className="tr-mono">{counts[v]}</span>
    </button>
  );

  return (
    <div className="tr-appts-shell">
      <nav className="tr-appts-sidebar">
        {navBtn('all', 'All past')}
        <div className="tr-sidebar-divider">To do</div>
        {navBtn('nolog', 'Outcome not logged', 'rust')}
        {navBtn('needs', 'Needs follow-up', 'amber')}
        {navBtn('reschedule', 'Needs reschedule', 'violet')}
        <div className="tr-sidebar-divider">Client intake</div>
        {navBtn('nointake', 'Not started', 'none')}
        {navBtn('sent', 'Link sent', 'amber')}
        {navBtn('received', 'Received', 'green')}
        <div className="tr-sidebar-divider">Recruits</div>
        {navBtn('recruit_open', 'Not signed up yet', 'recruit')}
        {navBtn('recruit_joined', 'Signed up', 'green')}
      </nav>
      <div className="tr-appts-main">
        <PageHead title={FOLLOW_UP_VIEW_TITLES[view] || 'Follow up'}
          sub={view === 'all' ? `${past.length} past appointment${past.length === 1 ? '' : 's'}${counts.nolog ? ` · ${counts.nolog} still need an outcome` : ''}` : `${list.length} of ${past.length} past appointments`} />
        <div className="tr-search-row">
          <Search size={15} className="tr-search-icon" />
          <input className="tr-search-input" type="text" placeholder="Search by client name…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          {searchQuery && <button type="button" className="tr-icon-btn" onClick={() => setSearchQuery('')} title="Clear search"><X size={15} /></button>}
        </div>
        <div className="tr-fu-list">
        {list.length === 0 ? (
          <div className="tr-card"><p className="tr-empty">{past.length === 0 ? 'Appointments land here once their time has passed.' : 'Nothing matches this view.'}</p></div>
        ) : list.map(a => {
          const open = expandedId === a.id;
          const st = STATUS_OPTIONS.find(o => o.value === a.status);
          const outcome = OUTCOME_OPTIONS.find(o => o.value === a.outcome);
          const cand = candByAppt[a.id];
          const istate = intakeState(a);
          const apptNotes = notesByAppt[a.id] || [];
          return (
            <div className="tr-card tr-fu-card" key={a.id}>
              <div
                role="button" tabIndex={0} className="tr-fu-head" aria-expanded={open}
                onClick={() => setExpandedId(open ? null : a.id)}
                onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setExpandedId(open ? null : a.id); } }}>
                <div>
                  <strong>{a.client}</strong>
                  {typeLabel(a) ? <span className="tr-empty"> · {typeLabel(a)}</span> : null}
                  <div className="tr-empty" style={{ margin: 0 }}>{fmtApptDateTime(a)}</div>
                  {a.followUpAppointmentDate && <div className="tr-empty" style={{ margin: 0 }}>Next: {fmtFollowUpDateTime(a)}</div>}
                  {apptNotes.length > 0 && (
                    <div className="tr-fu-lastnote">
                      Last touch {daysSince(apptNotes[0].created_at) === 0 ? 'today' : `${daysSince(apptNotes[0].created_at)}d ago`}: {apptNotes[0].note}
                    </div>
                  )}
                </div>
                <div className="tr-fu-chips">
                  {a.followUpCompletedAt
                    ? (st && st.value ? <span className={`tr-status tr-status-${st.color}`}>{st.label}</span> : null)
                    : <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={e => { e.stopPropagation(); setModalTarget(a); }}>Log outcome</button>}
                  {istate !== 'none' && <span className={`tr-status ${istate === 'received' ? 'tr-status-green' : 'tr-status-amber'}`}>{istate === 'received' ? 'Intake received' : 'Intake sent'}</span>}
                  {apptNotes.length > 0 && <span className="tr-status tr-status-none">{apptNotes.length} note{apptNotes.length === 1 ? '' : 's'}</span>}
                  {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>
              {open && (
                <div className="tr-fu-body">
                  <div className="tr-fu-section">
                    <div className="tr-row-head">
                      <h4 className="tr-h4" style={{ margin: 0 }}>Outcome</h4>
                      <span className="tr-empty" style={{ margin: 0 }}>{outcome ? outcome.label : 'Not logged yet'}</span>
                    </div>
                    <ContactLinks email={a.clientEmail} />
                    <div className="tr-form-actions" style={{ marginTop: 8, justifyContent: 'flex-start' }}>
                      <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={() => setModalTarget(a)}>{a.followUpCompletedAt ? 'Update outcome' : 'Log outcome'}</button>
                      <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => onScheduleNext({ client: a.client, notes: '', clientEmail: a.clientEmail, typeRecruit: isRecruitType(a), typeSale: isSaleType(a) })}>
                        <Plus size={13} /> Schedule next appointment
                      </button>
                    </div>
                  </div>

                  {isRecruitType(a) && (
                    <div className="tr-fu-section">
                      <RecruitSignupSection user={user} recruitName={a.client} joined={recruitJoined(a)} appointmentId={a.id} />
                    </div>
                  )}

                  <div className="tr-fu-section">
                    {cand ? (
                      <ClientIntakeSection candidate={cand} canManage onRemove={() => handleRemoveIntake(a, cand)} />
                    ) : (
                      <div className="tr-row-head">
                        <h4 className="tr-h4" style={{ margin: 0 }}>Client intake</h4>
                        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" disabled={busyId === a.id} onClick={() => handleSendIntake(a)}>Send client intake</button>
                      </div>
                    )}
                  </div>

                  <div className="tr-fu-section">
                    <h4 className="tr-h4">Follow-up notes</h4>
                    <div className="tr-fu-quicktags">
                      {QUICK_NOTE_TAGS.map(tag => (
                        <button key={tag} type="button" className="tr-pill-btn" disabled={busyId === a.id} onClick={() => handleAddNote(a, tag)} title={`Log "${tag}" with today's date`}>+ {tag}</button>
                      ))}
                    </div>
                    <div className="tr-intake-link-row">
                      <input
                        className="tr-search-input" style={{ flex: 1 }} type="text" placeholder="Add a note — called, texted, wants intake, next steps…"
                        value={noteDrafts[a.id] || ''} onChange={e => setNoteDrafts(prev => ({ ...prev, [a.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddNote(a); }} />
                      <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" disabled={busyId === a.id || !(noteDrafts[a.id] || '').trim()} onClick={() => handleAddNote(a)}>Add</button>
                    </div>
                    {apptNotes.length === 0 ? (
                      <p className="tr-empty">No notes yet.</p>
                    ) : (
                      <div className="tr-notes-list" style={{ marginTop: 10 }}>
                        {apptNotes.map(n => (
                          <div className="tr-note-item" key={n.id}>
                            <div className="tr-row-head">
                              <div className="tr-note-meta">{fmtNoteStamp(n.created_at)}</div>
                              <button type="button" className="tr-icon-btn" onClick={() => handleDeleteNote(n)} title="Delete note"><Trash2 size={14} /></button>
                            </div>
                            <div>{n.note}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        </div>
      </div>
      {modalTarget && <FollowUpModal appointment={modalTarget} onClose={() => setModalTarget(null)} onSave={handleSaveOutcome} saving={modalSaving} />}
    </div>
  );
}
// ---------------------------------------------------------------------
// Today — the landing page. Turns everything the other tabs know into an
// ordered plan for the day (what to log, how many to set, how many names
// to add, who to call), plus the First 30 days checklist for new people.
// Everything is computed from data the other tabs already own; the only
// thing saved here is the checklist summary managers see.
// ---------------------------------------------------------------------
function greetingFor(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
function ProgressRing({ done, total, size = 58, stroke = 6, children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, done / total) : 1;
  return (
    <div className="tr-ring" style={{ width: size, height: size }} role="img" aria-label={`${done} of ${total} done`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--paper-dim)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={pct >= 1 ? 'var(--green)' : 'var(--brass)'} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="tr-ring-arc" />
      </svg>
      <div className="tr-ring-label">{children}</div>
    </div>
  );
}
function apptClock(a) {
  return a.appointmentAt
    ? new Date(a.appointmentAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : fmtTime(a.appointmentTime);
}
function apptStartMs(a) {
  return a.appointmentAt ? new Date(a.appointmentAt).getTime() : new Date(`${a.appointmentDate}T${a.appointmentTime || '00:00'}`).getTime();
}
function startsInLabel(ms) {
  const mins = Math.round((ms - Date.now()) / 60000);
  if (mins <= 0) return 'Happening now';
  if (mins < 60) return `In ${mins} min`;
  return null;
}

// The checklist card. `result` comes from computeOnboarding().
function FirstThirtyDays({ result, day, onGo, onHide }) {
  const currentWeek = weekForDay(day || 1);
  const [showAll, setShowAll] = useState(() => !(window.matchMedia && window.matchMedia('(max-width: 640px)').matches));
  const next = result.next;
  const nextWeek = next ? ONBOARDING_WEEKS.find(w => w.key === next.week) : null;
  const behind = next && day && nextWeek && day > nextWeek.days[1];

  if (result.allDone) {
    return (
      <section className="tr-card tr-f30 tr-f30-complete" aria-label="First 30 days">
        <div className="tr-f30-head">
          <ProgressRing done={result.total} total={result.total}><Award size={22} /></ProgressRing>
          <div className="tr-f30-head-main">
            <div className="tr-f30-kicker">Your first 30 days</div>
            <h3 className="tr-f30-title">Checklist complete. Well done.</h3>
            <p className="tr-f30-why">You've set up your plan, built your list, booked and held appointments, and got your first result. From here, Today keeps you on pace every day.</p>
          </div>
          <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onHide}>Hide this</button>
        </div>
      </section>
    );
  }

  return (
    <section className="tr-card tr-f30" aria-label="First 30 days">
      <div className="tr-f30-head">
        <ProgressRing done={result.doneCount} total={result.total}>
          <strong>{result.doneCount}</strong><span>of {result.total}</span>
        </ProgressRing>
        <div className="tr-f30-head-main">
          <div className="tr-f30-kicker">
            First 30 days{day ? <> · <span className="tr-f30-day">Day {Math.min(day, 99)}{day <= ONBOARDING_DAYS ? ` of ${ONBOARDING_DAYS}` : ''}</span></> : null}
            {behind ? <span className="tr-status tr-status-amber tr-f30-flag">Catch up</span> : null}
          </div>
          <h3 className="tr-f30-title">Next: {next.title}{next.target ? <span className="tr-f30-count"> · {next.n} of {next.target}</span> : null}</h3>
          <p className="tr-f30-why">{next.why}</p>
          {next.target ? (
            <div className="tr-ov-bar tr-f30-stepbar"><div className="tr-ov-bar-fill" style={{ width: `${Math.round((next.n / next.target) * 100)}%` }} /></div>
          ) : null}
          <div className="tr-f30-actions">
            <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={() => onGo(next)}>{next.cta} <ChevronRight size={14} /></button>
            <button type="button" className="tr-f30-toggle" onClick={() => setShowAll(s => !s)} aria-expanded={showAll}>
              {showAll ? 'Hide all steps' : 'See all steps'} {showAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>
        <button type="button" className="tr-icon-btn tr-f30-close" onClick={onHide} aria-label="Hide the First 30 days checklist" title="Hide (you can turn it back on in Your account)"><X size={16} /></button>
      </div>

      {showAll && (
        <div className="tr-f30-weeks">
          {ONBOARDING_WEEKS.map(w => {
            const steps = result.steps.filter(s => s.week === w.key);
            const doneHere = steps.filter(s => s.done).length;
            const isNow = w.key === currentWeek.key;
            return (
              <div key={w.key} className={`tr-f30-week ${isNow ? 'tr-f30-week-now' : ''}`}>
                <div className="tr-f30-week-head">
                  <span className="tr-f30-week-label">{w.label}{isNow ? <span className="tr-f30-here">You're here</span> : null}</span>
                  <span className="tr-f30-week-title">{w.title}</span>
                  <span className="tr-f30-week-meta">Days {w.days[0]}–{w.days[1]} · {doneHere}/{steps.length} done</span>
                </div>
                <ul className="tr-f30-steps">
                  {steps.map(s => {
                    const isNext = next && s.key === next.key;
                    return (
                      <li key={s.key}>
                        <button type="button" className={`tr-f30-step ${s.done ? 'tr-f30-step-done' : ''} ${isNext ? 'tr-f30-step-next' : ''}`} onClick={() => onGo(s)}>
                          <span className="tr-f30-node" aria-hidden="true">{s.done ? <Check size={12} strokeWidth={3} /> : null}</span>
                          <span className="tr-f30-step-title">{s.title}<span className="tr-sr-only">{s.done ? ' (done)' : ''}</span></span>
                          {s.target && !s.done ? <span className="tr-f30-step-count">{s.n}/{s.target}</span> : null}
                          <ChevronRight size={14} className="tr-f30-step-go" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
      <p className="tr-f30-foot">Every step checks itself off as you use PaceLedger. Your manager can see your progress, so they know when to help.</p>
    </section>
  );
}

// "Who to call": the best-scored people on your list you haven't booked yet.
function topProspectsToCall(prospects, apptNames, n = 3) {
  return prospects
    .filter(p => !p.markedSold && !p.markedRecruited && !apptNames.has(prospectNameKey(p)))
    .sort((a, b) => (prospectTotalChecked(b) - prospectTotalChecked(a))
      || ((b.relationshipStrength || 0) - (a.relationshipStrength || 0))
      || String(a.createdAt).localeCompare(String(b.createdAt)))
    .slice(0, n);
}

function TodayTask({ task, children }) {
  return (
    <li className={`tr-task ${task.done ? 'tr-task-done' : ''} tr-task-${task.tone || 'brass'}`}>
      <span className="tr-task-node" aria-hidden="true">{task.done ? <Check size={13} strokeWidth={3} /> : <task.Icon size={15} />}</span>
      <div className="tr-task-body">
        <div className="tr-task-title">{task.title}{task.done ? <span className="tr-sr-only"> (done)</span> : null}</div>
        {task.meta ? <div className="tr-task-meta">{task.meta}</div> : null}
        {children}
      </div>
      {task.action && !task.done ? (
        <button type="button" className={`tr-btn tr-btn-sm ${task.primary ? 'tr-btn-brass' : 'tr-btn-ghost'} tr-task-btn`} onClick={task.action.run}>{task.action.label}</button>
      ) : null}
    </li>
  );
}

function TodayBody({ user, onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState([]);
  const [involvedToday, setInvolvedToday] = useState([]);
  const [prospects, setProspects] = useState([]);
  const [plan, setPlan] = useState(null);
  const [facts, setFacts] = useState({ google: false, licensed: false, reminders: 'unsupported' });
  const [onboardingRow, setOnboardingRow] = useState(null);
  const [modalTarget, setModalTarget] = useState(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [flash, setFlash] = useState('');
  const [quickFirst, setQuickFirst] = useState('');
  const [quickLast, setQuickLast] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickErr, setQuickErr] = useState('');
  const [showMoreLater, setShowMoreLater] = useState(false);
  const [showAllDone, setShowAllDone] = useState(false);
  const savedSnapshotFor = useRef('');

  const load = useCallback(async () => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const [a, p, row, g, lic, ob, perm, inv] = await Promise.all([
      fetchMyAppointments(user.id), fetchMyProspects(user.id), fetchBusinessPlan(user.id),
      fetchGoogleConnectionStatus().catch(() => ({ connected: false })),
      fetchMyLicensing(user.id), fetchMyOnboarding(user.id), reminderPermission(),
      // Appointments you're presenting or training on today (someone else logged them).
      supabase.from('appointments').select('*')
        .or(`presenter_id.eq.${user.id},trainee_id.eq.${user.id}`)
        .gte('appointment_at', start.toISOString()).lt('appointment_at', end.toISOString())
        .then(r => (r.error ? [] : (r.data || []).map(rowToRecord)), () => []),
    ]);
    setAppointments(a);
    setProspects(p);
    setPlan(row && !row.loadError ? rowToBusinessPlanFields(row) : null);
    setFacts({ google: !!(g && g.connected), licensed: isLicensed(lic), reminders: perm });
    setOnboardingRow(ob && !ob.error ? ob : null);
    setInvolvedToday(inv);
    setLoading(false);
  }, [user.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const again = () => { load(); };
    window.addEventListener('paceledger:onboarding-changed', again);
    const offResume = onAppResume(again);
    return () => { window.removeEventListener('paceledger:onboarding-changed', again); offResume(); };
  }, [load]);
  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(''), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  // ---- First 30 days ------------------------------------------------
  const day = onboardingDay(user.createdAt);
  const hasPlan = !!plan && computeExpensesSubtotal(plan) > 0;
  const onboarding = computeOnboarding({
    native: isNativeApp(),
    remindersOn: facts.reminders === 'granted',
    hasPlan,
    prospectCount: prospects.length,
    scoredCount: prospects.filter(x => prospectTotalChecked(x) > 0).length,
    calendarConnected: facts.google,
    bookedCount: appointments.filter(x => !x.isFollowUp).length,
    outcomeLogged: appointments.some(x => x.followUpCompletedAt),
    hasWin: appointments.some(x => x.officiallySold || x.officiallyRecruited) || prospects.some(x => x.markedSold || x.markedRecruited),
    licensed: facts.licensed,
  });
  const visibility = (onboardingRow && onboardingRow.visibility) || 'auto';
  const showOnboarding = !loading && shouldShowOnboarding(day, visibility, onboarding.allDone);
  // Keep the manager's view current (only for people still in their first
  // couple of months, or who turned the checklist on themselves).
  useEffect(() => {
    if (loading) return;
    if (!(visibility === 'shown' || (day != null && day <= 60))) return;
    const sig = `${onboarding.doneCount}/${onboarding.total}/${onboarding.next ? onboarding.next.key : ''}`;
    if (savedSnapshotFor.current === sig) return;
    savedSnapshotFor.current = sig;
    saveOnboardingSnapshot(user.id, onboardingRow, onboarding).then(r => { if (r) setOnboardingRow(r); }).catch(() => {});
  }, [loading, onboarding.doneCount, onboarding.total, onboarding.next && onboarding.next.key]); // eslint-disable-line react-hooks/exhaustive-deps

  async function goStep(step) {
    const [tab, intent] = step.go;
    if (tab === 'reminders') {
      const res = await requestReminderPermission();
      setFacts(f => ({ ...f, reminders: res }));
      if (res === 'granted') window.dispatchEvent(new Event('paceledger:reminders-enabled'));
      else setFlash("Notifications are off for PaceLedger. Turn them on in your phone's Settings → PaceLedger → Notifications.");
      return;
    }
    onNavigate(tab, intent || null);
  }
  async function hideOnboarding() {
    const before = onboardingRow;
    setOnboardingRow(r => ({ ...(r || { user_id: user.id }), visibility: 'hidden' }));
    const ok = await setOnboardingVisibility(user.id, 'hidden');
    if (!ok) setOnboardingRow(before);
    setFlash(ok ? 'Checklist hidden. Turn it back on any time in Your account (tap your name).' : "Couldn't hide it. Check your connection and try again.");
  }

  // ---- outcome logging, right from Today ----------------------------
  async function handleSaveOutcome(id, data) {
    setModalSaving(true);
    const original = appointments.find(x => x.id === id);
    const res = await persistFollowUp(user, id, original, data);
    setModalSaving(false);
    if (!res.ok) { setFlash("Couldn't save. Check your connection and try again."); return; }
    setAppointments(prev => applyFollowUpToList(prev, id, data, res.followUpTimezone, res.newAppt));
    window.dispatchEvent(new Event('paceledger:appointments-changed'));
    setModalTarget(null);
    setFlash(`Saved — ${original ? original.client : 'appointment'}${res.newAppt ? '. The follow-up appointment is on your list.' : '.'}`);
  }
  async function handleQuickAdd(e) {
    e.preventDefault();
    if (!quickFirst.trim() || !quickLast.trim()) { setQuickErr('Enter a first and last name.'); return; }
    setQuickErr(''); setQuickBusy(true);
    const blank = { firstName: quickFirst, lastName: quickLast, age: '', relationshipStrength: 5, notes: '', source: '' };
    ALL_CHARACTERISTICS.forEach(c => { blank[c.key] = false; });
    const res = await insertProspect(user.id, blank);
    setQuickBusy(false);
    if (!res.ok) { setQuickErr(res.error || "Couldn't save. Try again."); return; }
    setProspects(prev => [res.record, ...prev]);
    setQuickFirst(''); setQuickLast('');
    setFlash(`Added ${res.record.firstName} ${res.record.lastName}. Score them in Prospecting when you have a minute.`);
  }

  if (loading) {
    return (
      <div className="tr-today">
        <SkelBlock w="45%" h="34px" />
        <div className="tr-today-grid" style={{ marginTop: 16 }}>
          <div className="tr-today-plan"><SkelBlock w="100%" h="340px" /></div>
          <div className="tr-today-side"><SkelBlock w="100%" h="160px" /><SkelBlock w="100%" h="160px" style={{ marginTop: 16 }} /></div>
        </div>
      </div>
    );
  }

  const now = new Date();
  const nowMs = now.getTime();
  const today = todayStr();
  const isToday = iso => !!iso && fmtDate(new Date(iso)) === today;
  const weekStart = weekStartOf(today);
  const weekEnd = fmtDate(addDays(parseDate(weekStart), 6));
  const monthPrefix = today.slice(0, 7);
  const firstName = (user.displayName || '').split(' ')[0];
  const apptNames = new Set(appointments.map(x => normName(x.client)));

  // Today's schedule: yours plus any you're presenting/training on, from an
  // hour ago onward (so a meeting in progress still shows its Zoom link).
  const todaysById = new Map();
  [...appointments.filter(x => apptLocalDate(x) === today), ...involvedToday.filter(x => apptLocalDate(x) === today)]
    .forEach(x => todaysById.set(x.id, x));
  const todaysAppts = [...todaysById.values()].sort((x, y) => apptStartMs(x) - apptStartMs(y));
  const comingUp = todaysAppts.filter(x => apptStartMs(x) >= nowMs - 60 * 60000);
  const inProgress = x => apptStartMs(x) <= nowMs && apptStartMs(x) >= nowMs - 60 * 60000;

  // Pace for today's batch (Sat/Sun count as one weekend batch).
  const todayOpt = defaultDateSetOption();
  const todayMeta = dateSetMeta(todayOpt);
  const isWeekend = todayOpt === 'weekend';
  const counted = appointments.filter(x => !x.isFollowUp);
  const batchSet = counted.filter(x => x.weekOf === weekStart && x.dateSetOption === todayOpt).length;
  const batchLeft = Math.max(0, todayMeta.target - batchSet);
  const setThisWeek = counted.filter(x => x.weekOf === weekStart).length;
  const todayIdx = DATE_SET_OPTIONS.findIndex(o => o.value === todayOpt);
  const expectedByNow = DATE_SET_OPTIONS.slice(0, todayIdx + 1).reduce((s, o) => s + o.target, 0);
  const weekShort = Math.max(0, expectedByNow - setThisWeek);

  // Names: the daily number from the Business Plan, or 3 until there is one.
  let goals = null;
  let dailyNames = 3;
  if (plan) {
    const monthlyGross = computeMonthlyGrossIncomeNeeded(computeExpensesSubtotal(plan));
    const incomeGoal = plan.incomeGoalOverride === '' ? computeAnnualGrossIncomeNeeded(monthlyGross) : (Number(plan.incomeGoalOverride) || 0);
    const tny = computeTransactionsNeededPerYear(incomeGoal, computeCommissionPerTransaction(plan.targetPremium, plan.commissionRate));
    if (tny > 0) {
      const monthly = computeMonthlyProspects(computeProspectsNeededPerYear(tny));
      goals = { prospects: Math.ceil(monthly), sales: Math.max(1, Math.ceil(tny / 12)) };
      dailyNames = Math.max(1, Math.ceil(computeDailyProspects(monthly)));
    }
  }
  const namesToday = prospects.filter(x => isToday(x.createdAt)).length;
  const namesLeft = Math.max(0, dailyNames - namesToday);

  // Outcomes: past appointments with nothing logged (except one still in
  // progress), most recent first; and the ones you logged today.
  const toLog = appointments
    .filter(x => isPastAppointment(x) && !x.followUpCompletedAt && !inProgress(x))
    .sort((x, y) => apptStartMs(y) - apptStartMs(x));
  const loggedToday = appointments.filter(x => isToday(x.followUpCompletedAt));
  const setToday = counted.filter(x => isToday(x.createdAt)).length;
  const callList = topProspectsToCall(prospects, apptNames);

  // ---- the plan ------------------------------------------------------
  const LOG_LIMIT = 4;
  const mustDo = [];
  toLog.slice(0, LOG_LIMIT).forEach(x => mustDo.push({
    key: `log-${x.id}`, Icon: ClipboardCheck, tone: 'rust', primary: true,
    title: <>Log how it went with <strong>{x.client}</strong></>,
    meta: `${fmtApptDateTime(x)}${typeLabel(x) ? ` · ${typeLabel(x)}` : ''}`,
    action: { label: 'Log outcome', run: () => setModalTarget(x) },
  }));
  mustDo.push({
    key: 'pace', Icon: CalendarDays, done: batchLeft === 0, primary: toLog.length === 0,
    title: batchLeft === 0
      ? <>{isWeekend ? 'Weekend' : todayMeta.label} batch complete: {batchSet} set</>
      : <>Set {batchLeft} more appointment{batchLeft === 1 ? '' : 's'} {isWeekend ? 'this weekend' : 'today'}</>,
    // In someone's first two weeks, "23 behind" is just discouraging.
    meta: `${todayMeta.batchLabel}: ${batchSet} of ${todayMeta.target}${day != null && day <= 14 && weekShort > 0 ? '' : ` · ${weekShort > 0 ? `${weekShort} behind for the week` : 'on pace for the week'}`}`,
    action: { label: 'Log appointment', run: () => onNavigate('mine', 'new') },
    callList: batchLeft > 0,
  });
  mustDo.push({
    key: 'names', Icon: UserPlus, done: namesLeft === 0,
    title: namesLeft === 0
      ? <>Added {namesToday} new name{namesToday === 1 ? '' : 's'} today</>
      : <>Add {namesLeft} new name{namesLeft === 1 ? '' : 's'} to your list</>,
    meta: goals
      ? `Daily goal from your Business Plan: ${dailyNames} · ${namesToday} added today`
      : `${namesToday} added today · your Business Plan sets your own daily number`,
    quickAdd: namesLeft > 0,
  });
  loggedToday.forEach(x => mustDo.push({
    key: `logged-${x.id}`, Icon: ClipboardCheck, done: true,
    title: <>Logged how it went with {x.client}</>,
    meta: (OUTCOME_OPTIONS.find(o => o.value === x.outcome) || {}).label || 'Outcome saved',
  }));
  const moreToLog = Math.max(0, toLog.length - LOG_LIMIT);
  const open = mustDo.filter(t => !t.done);
  const doneTasks = mustDo.filter(t => t.done);
  const totalCount = open.length + doneTasks.length + moreToLog;
  const doneCount = doneTasks.length;

  const later = [];
  appointments.filter(x => x.status === 'needs_reschedule').forEach(x => later.push({
    key: `rs-${x.id}`, Icon: CalendarDays, tone: 'violet',
    title: <>Reschedule <strong>{x.client}</strong></>, meta: `Was ${fmtApptDateTime(x)}`,
    action: { label: 'Open', run: () => onNavigate('followup', 'reschedule') },
  }));
  appointments.filter(x => x.status === 'needs_follow_up' && isPastAppointment(x)).forEach(x => later.push({
    key: `fu-${x.id}`, Icon: ClipboardCheck, tone: 'amber',
    title: <>Follow up with <strong>{x.client}</strong></>,
    meta: x.followUpAppointmentDate ? `Next meeting ${fmtDisplayDate(x.followUpAppointmentDate)}` : `Met ${fmtDisplayDate(x.appointmentDate)}`,
    action: { label: 'Open', run: () => onNavigate('followup', 'needs') },
  }));
  const staleCount = prospects.filter(x => isStaleProspect(x, apptNames)).length;
  if (staleCount) later.push({
    key: 'stale', Icon: Users, tone: 'amber',
    title: <>Reconnect with {staleCount} quiet prospect{staleCount === 1 ? '' : 's'}</>,
    meta: `No appointment in ${STALE_PROSPECT_DAYS}+ days since you added them`,
    action: { label: 'See them', run: () => onNavigate('systems', 'stale') },
  });
  const LATER_LIMIT = 4;
  const laterShown = showMoreLater ? later : later.slice(0, LATER_LIMIT);

  // ---- month goals + productivity (unchanged math) ------------------
  const ratingPct = expectedByNow > 0 ? Math.round((setThisWeek / expectedByNow) * 100) : 0;
  const newcomer = day != null && day <= 14;
  const rating = ratingPct >= 100 ? { label: 'On pace', cls: 'green' }
    : newcomer ? { label: 'Getting started', cls: 'none' }
    : ratingPct >= 70 ? { label: 'Close to pace', cls: 'amber' }
    : { label: 'Behind pace', cls: 'rust' };
  const weekBarPct = Math.min(100, Math.round((setThisWeek / WEEKLY_TOTAL_TARGET) * 100));
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate();
  const prospectsThisMonth = prospects.filter(x => x.createdAt && fmtDate(new Date(x.createdAt)).slice(0, 7) === monthPrefix).length;
  const salesThisMonth = appointments.filter(x => x.officiallySold && (x.appointmentDate || '').slice(0, 7) === monthPrefix).length;
  const pct = (d, g) => (g > 0 ? Math.min(100, Math.round((d / g) * 100)) : 0);
  const goalNote = (d, g) => (d >= g ? 'Goal reached for the month' : `${g - d} more in the ${daysLeft === 0 ? 'last day' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}`);

  const weekAppts = appointments
    .filter(x => apptLocalDate(x) >= weekStart && apptLocalDate(x) <= weekEnd && apptLocalDate(x) > today)
    .sort((x, y) => apptStartMs(x) - apptStartMs(y));
  const byDay = [];
  weekAppts.forEach(x => {
    const d = apptLocalDate(x);
    const last = byDay[byDay.length - 1];
    if (last && last.date === d) last.items.push(x); else byDay.push({ date: d, items: [x] });
  });

  const allClear = open.length === 0 && moreToLog === 0;
  const summary = allClear
    ? 'All done for today. Nice work.'
    : `${open.length + moreToLog} thing${open.length + moreToLog === 1 ? '' : 's'} left${doneCount ? ` · ${doneCount} done` : ''}`;

  return (
    <div className="tr-today">
      <div className="tr-ov-hello">
        <div>
          <h2 className="tr-h2" style={{ margin: 0 }}>{greetingFor(now)}{firstName ? `, ${firstName}` : ''}</h2>
          <p className="tr-empty" style={{ margin: '2px 0 0' }}>
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · {todaysAppts.length === 0 ? 'no appointments today' : `${todaysAppts.length} appointment${todaysAppts.length === 1 ? '' : 's'} today`}
          </p>
        </div>
        <div className="tr-ov-hello-actions">
          <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => onNavigate('systems', 'new')}><Plus size={14} /> Add prospect</button>
          <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={() => onNavigate('mine', 'new')}><Plus size={14} /> Log appointment</button>
        </div>
      </div>

      {flash && <div className="tr-flash" role="status">{flash}</div>}
      <RemindersPrompt />
      {showOnboarding && <FirstThirtyDays result={onboarding} day={day} onGo={goStep} onHide={hideOnboarding} />}

      <div className="tr-today-grid">
        <section className="tr-card tr-today-plan" aria-labelledby="tr-plan-title">
          <div className="tr-plan-head">
            <div>
              <h3 className="tr-plan-title" id="tr-plan-title">Today's plan</h3>
              <p className="tr-plan-sub">{summary}</p>
            </div>
            <ProgressRing done={doneCount} total={totalCount} size={52} stroke={5}>
              {allClear ? <Check size={18} strokeWidth={3} /> : <><strong>{doneCount}</strong><span>/{totalCount}</span></>}
            </ProgressRing>
          </div>
          <div className="tr-plan-score" aria-label="Today so far">
            <span><strong>{setToday}</strong> set</span>
            <span><strong>{namesToday}</strong> name{namesToday === 1 ? '' : 's'} added</span>
            <span><strong>{loggedToday.length}</strong> outcome{loggedToday.length === 1 ? '' : 's'} logged</span>
          </div>

          {comingUp.length > 0 && (
            <div className="tr-plan-section">
              <h4 className="tr-plan-label">On your calendar</h4>
              <ul className="tr-dayagenda">
                {comingUp.map(x => {
                  const soon = startsInLabel(apptStartMs(x));
                  const mine = x.userId === user.id;
                  return (
                    <li key={x.id} className={`tr-dayagenda-row ${soon ? 'tr-dayagenda-soon' : ''}`}>
                      <span className="tr-dayagenda-time">{apptClock(x)}</span>
                      <div className="tr-dayagenda-main">
                        <strong>{x.client}</strong>{typeLabel(x) ? <span className="tr-empty"> · {typeLabel(x)}</span> : null}
                        <div className="tr-dayagenda-meta">
                          {mine ? (x.presenter ? `with ${x.presenter}` : 'Your appointment') : x.presenterId === user.id ? "You're presenting" : "You're training on this one"}
                          {soon ? <span className="tr-dayagenda-badge">{soon}</span> : null}
                        </div>
                      </div>
                      {x.zoomUrl ? <a className={`tr-btn tr-btn-sm ${soon ? 'tr-btn-brass' : 'tr-btn-ghost'}`} href={x.zoomUrl} target="_blank" rel="noreferrer"><Video size={14} /> Join</a> : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="tr-plan-section">
            <h4 className="tr-plan-label">To do</h4>
            {open.length === 0 && moreToLog === 0 ? (
              <div className="tr-plan-clear">
                <Sparkles size={18} />
                <div>
                  <strong>You're caught up.</strong>
                  <p>Want to get ahead? Book tomorrow's appointments or add a few more names.</p>
                </div>
              </div>
            ) : (
              <ul className="tr-tasks">
                {open.map(t => (
                  <TodayTask key={t.key} task={t}>
                    {t.callList ? (
                      callList.length > 0 ? (
                        <div className="tr-calllist">
                          <div className="tr-calllist-head">Best people to call</div>
                          {callList.map(p => (
                            <div className="tr-calllist-row" key={p.id}>
                              <span className="tr-calllist-name">{p.firstName} {p.lastName}</span>
                              <span className={`tr-calllist-lean tr-calllist-${prospectLeaningKey(p)}`}>{prospectTotalChecked(p) > 0 ? `${LEANING_LABELS[prospectLeaningKey(p)]} · ${prospectTotalChecked(p)}/9` : 'Not scored'}</span>
                              <button type="button" className="tr-btn tr-btn-ghost tr-btn-xs" onClick={() => onNavigate('mine', { prefill: prospectToAppointmentPrefill(p) })}>Book</button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="tr-task-hint">{prospects.length === 0 ? 'Add names to your list first. You need people to call.' : "Everyone on your list is booked. Add more names below."}</p>
                      )
                    ) : null}
                    {t.quickAdd ? (
                      <form className="tr-task-quick" onSubmit={handleQuickAdd}>
                        <input aria-label="First name" placeholder="First name" value={quickFirst} onChange={e => setQuickFirst(e.target.value)} autoComplete="off" />
                        <input aria-label="Last name" placeholder="Last name" value={quickLast} onChange={e => setQuickLast(e.target.value)} autoComplete="off" />
                        <button type="submit" className="tr-btn tr-btn-ghost tr-btn-sm" disabled={quickBusy}>{quickBusy ? 'Adding…' : 'Add'}</button>
                        <button type="button" className="tr-task-link" onClick={() => onNavigate('systems', 'jogger')}>Need ideas?</button>
                        {quickErr ? <div className="tr-error tr-task-quick-err">{quickErr}</div> : null}
                      </form>
                    ) : null}
                  </TodayTask>
                ))}
                {moreToLog > 0 && (
                  <li className="tr-task tr-task-more">
                    <button type="button" className="tr-task-morebtn" onClick={() => onNavigate('followup', 'nolog')}>
                      {moreToLog} more appointment{moreToLog === 1 ? '' : 's'} without an outcome <ChevronRight size={14} />
                    </button>
                  </li>
                )}
              </ul>
            )}
            {doneTasks.length > 0 && (
              <ul className="tr-tasks tr-tasks-done" aria-label="Done today">
                {(showAllDone ? doneTasks : doneTasks.slice(0, 2)).map(t => <TodayTask key={t.key} task={t} />)}
              </ul>
            )}
            {doneTasks.length > 2 && (
              <button type="button" className="tr-task-link tr-plan-more" onClick={() => setShowAllDone(v => !v)}>
                {showAllDone ? 'Show less' : `Show ${doneTasks.length - 2} more done today`}
              </button>
            )}
          </div>

          {later.length > 0 && (
            <div className="tr-plan-section">
              <h4 className="tr-plan-label">When you have time</h4>
              <ul className="tr-tasks tr-tasks-later">
                {laterShown.map(t => <TodayTask key={t.key} task={t} />)}
              </ul>
              {later.length > LATER_LIMIT && (
                <button type="button" className="tr-task-link tr-plan-more" onClick={() => setShowMoreLater(s => !s)}>
                  {showMoreLater ? 'Show fewer' : `Show ${later.length - LATER_LIMIT} more`}
                </button>
              )}
            </div>
          )}
        </section>

        <div className="tr-today-side">
          <div className="tr-card">
            <div className="tr-row-head">
              <h3 className="tr-h3" style={{ margin: 0 }}>This week's pace</h3>
              <span className={`tr-status tr-status-${rating.cls}`}>{rating.label}</span>
            </div>
            <div className="tr-ov-big">{ratingPct}%</div>
            <p className="tr-empty" style={{ margin: '0 0 10px' }}>
              {newcomer && ratingPct < 100
                ? `${setThisWeek} set this week. The team standard is ${WEEKLY_TOTAL_TARGET} a week; build up to it.`
                : `${setThisWeek} set vs. ${expectedByNow} expected by today${weekShort > 0 ? ` — ${weekShort} to catch up` : ''}.`}
            </p>
            <div className="tr-ov-bar"><div className="tr-ov-bar-fill" style={{ width: `${weekBarPct}%` }} /></div>
            <p className="tr-empty" style={{ margin: '6px 0 0' }}>{setThisWeek} of {WEEKLY_TOTAL_TARGET} for the week</p>
          </div>

          <div className="tr-card">
            <h3 className="tr-h3">This month's goals</h3>
            {goals ? (
              <>
                <div className="tr-ov-goal">
                  <div className="tr-ov-goal-head"><span>Prospects added</span><span className="tr-mono">{prospectsThisMonth} / {goals.prospects}</span></div>
                  <div className="tr-ov-bar"><div className="tr-ov-bar-fill" style={{ width: `${pct(prospectsThisMonth, goals.prospects)}%` }} /></div>
                  <div className="tr-ov-goal-note">{goalNote(prospectsThisMonth, goals.prospects)}</div>
                </div>
                <div className="tr-ov-goal">
                  <div className="tr-ov-goal-head"><span>Sales closed</span><span className="tr-mono">{salesThisMonth} / {goals.sales}</span></div>
                  <div className="tr-ov-bar"><div className="tr-ov-bar-fill tr-ov-bar-fill-alt" style={{ width: `${pct(salesThisMonth, goals.sales)}%` }} /></div>
                  <div className="tr-ov-goal-note">{goalNote(salesThisMonth, goals.sales)}</div>
                </div>
                <button type="button" className="tr-ov-link" onClick={() => onNavigate('bizplan')}>Targets come from your Business Plan →</button>
              </>
            ) : (
              <>
                <p className="tr-empty">Fill in your Business Plan expenses to get monthly prospecting and sales targets here.</p>
                <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => onNavigate('bizplan')}>Open Business Plan</button>
              </>
            )}
          </div>

          <div className="tr-card">
            <div className="tr-row-head">
              <h3 className="tr-h3" style={{ margin: 0 }}>Later this week</h3>
              <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => onNavigate('mine')}>View all</button>
            </div>
            {byDay.length === 0 ? (
              <p className="tr-empty" style={{ marginTop: 10 }}>Nothing else booked this week yet.</p>
            ) : byDay.map(group => (
              <div key={group.date} className="tr-ov-day">
                <div className="tr-ov-day-label">{fmtDisplayDate(group.date)}</div>
                {group.items.map(x => (
                  <div className="tr-ov-row" key={x.id}>
                    <span className="tr-ov-time">{apptClock(x)}</span>
                    <div className="tr-ov-row-main">
                      <strong>{x.client}</strong>
                      {typeLabel(x) ? <span className="tr-empty"> · {typeLabel(x)}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {modalTarget && (
        <FollowUpModal appointment={modalTarget} saving={modalSaving} onClose={() => setModalTarget(null)} onSave={handleSaveOutcome} />
      )}
    </div>
  );
}
// ---------------------------------------------------------------------
// Tab navigation — a tab strip on desktop/tablet, and an app-style bar
// fixed to the bottom of the screen on phones (first four tabs plus a
// "More" sheet for the rest), so nothing hides off the edge of the screen.
// ---------------------------------------------------------------------
const MY_WORK_TABS = [
  { id: 'overview', label: 'Today', short: 'Today', Icon: Sun },
  { id: 'systems', label: 'Prospecting', short: 'Prospect', Icon: UserPlus },
  { id: 'mine', label: 'My Appointments', short: 'Appts', Icon: CalendarDays },
  { id: 'followup', label: 'Follow Up', short: 'Follow Up', Icon: ClipboardCheck },
  { id: 'bizplan', label: 'Business Plan', short: 'Biz Plan', Icon: DollarSign },
  { id: 'calendar', label: 'Calendar', short: 'Calendar', Icon: Calendar },
  { id: 'milestones', label: 'Milestones', short: 'Milestones', Icon: Award },
  { id: 'documents', label: 'Documents', short: 'Documents', Icon: FileText },
];
const TEAM_TABS = [
  { id: 'teamsystems', label: 'Team Prospecting', short: 'Prospecting', Icon: Users },
  { id: 'pace', label: 'Team Pace', short: 'Pace', Icon: TrendingUp },
  { id: 'production', label: 'Track Production', short: 'Production', Icon: DollarSign },
];
const ADMIN_TEAM_TABS = [...TEAM_TABS, { id: 'users', label: 'Manage Team', short: 'Manage', Icon: UserCog }];
function TabNav({ tabs, tab, onSelect }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = tabs.length > 5 ? tabs.slice(0, 4) : tabs;
  const overflow = tabs.length > 5 ? tabs.slice(4) : [];
  const inOverflow = overflow.some(t => t.id === tab);
  function pick(id) {
    setMoreOpen(false);
    onSelect(id);
    window.scrollTo(0, 0);
  }
  return (
    <>
      <div className="tr-navtabs">
        {tabs.map(t => (
          <button key={t.id} type="button" className={`tr-navtab ${tab === t.id ? 'tr-navtab-on' : ''}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => { onSelect(t.id); window.scrollTo(0, 0); }}>{t.label}</button>
        ))}
      </div>
      <nav className="tr-bottomnav" aria-label="Main">
        {primary.map(({ id, short, Icon }) => (
          <button key={id} type="button" className={tab === id ? 'tr-bottomnav-on' : ''} onClick={() => pick(id)} aria-current={tab === id ? 'page' : undefined}>
            <Icon size={21} /><span>{short}</span>
          </button>
        ))}
        {overflow.length > 0 && (
          <button type="button" className={inOverflow || moreOpen ? 'tr-bottomnav-on' : ''} onClick={() => setMoreOpen(o => !o)} aria-expanded={moreOpen}>
            <Menu size={21} /><span>{inOverflow ? overflow.find(t => t.id === tab).short : 'More'}</span>
          </button>
        )}
      </nav>
      {moreOpen && (
        <div className="tr-sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="tr-sheet" onClick={e => e.stopPropagation()}>
            <div className="tr-sheet-grip" />
            {overflow.map(({ id, label, Icon }) => (
              <button key={id} type="button" className={`tr-sheet-item ${tab === id ? 'tr-sheet-item-on' : ''}`} onClick={() => pick(id)}>
                <Icon size={19} /><span>{label}</span><ChevronRight size={16} />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
// iPhone app only: keeps a phone reminder scheduled 30 minutes before each
// upcoming appointment. Re-syncs on open, on return to the app, and
// whenever an appointment is logged.
function useAppointmentReminders(user) {
  useEffect(() => {
    if (!isNativeApp()) return undefined;
    let alive = true;
    const sync = async () => {
      if ((await reminderPermission()) !== 'granted') return;
      // Appointments I logged, am presenting, or am training on, from now on.
      const { data, error } = await supabase
        .from('appointments').select('*')
        .or(`user_id.eq.${user.id},presenter_id.eq.${user.id},trainee_id.eq.${user.id}`)
        .gte('appointment_at', new Date().toISOString());
      if (error || !alive) return; // offline etc.: keep the reminders already set
      await syncAppointmentReminders((data || []).map(rowToRecord)).catch(() => {});
    };
    sync();
    const offResume = onAppResume(sync);
    // Navigating (not window.open) lets iOS hand the link to the Zoom app.
    const offTap = onReminderTapped(extra => { if (extra && extra.zoomUrl) window.location.href = extra.zoomUrl; });
    window.addEventListener('paceledger:appointments-changed', sync);
    window.addEventListener('paceledger:reminders-enabled', sync);
    return () => {
      alive = false; offResume(); offTap();
      window.removeEventListener('paceledger:appointments-changed', sync);
      window.removeEventListener('paceledger:reminders-enabled', sync);
    };
  }, [user.id]);
}
// Today card asking (once) to turn on appointment reminders in the app. On
// Android it then asks for exact alarms, so reminders arrive on time.
const EXACT_DISMISS_KEY = 'pl_exact_reminders_dismissed';
function RemindersPrompt() {
  const [perm, setPerm] = useState(null);
  const [exact, setExact] = useState('granted');
  const [exactDismissed, setExactDismissed] = useState(() => { try { return localStorage.getItem(EXACT_DISMISS_KEY) === '1'; } catch { return false; } });
  useEffect(() => {
    reminderPermission().then(p => {
      setPerm(p);
      if (p === 'granted') exactReminderStatus().then(setExact);
    });
  }, []);
  async function enable() {
    const res = await requestReminderPermission();
    setPerm(res);
    if (res === 'granted') {
      window.dispatchEvent(new Event('paceledger:reminders-enabled'));
      setExact(await exactReminderStatus());
    }
  }
  async function allowExact() {
    const res = await requestExactReminders();
    setExact(res);
    // Re-schedule so existing reminders use exact timing too.
    if (res === 'granted') window.dispatchEvent(new Event('paceledger:reminders-enabled'));
  }
  function notNow() {
    setExactDismissed(true);
    try { localStorage.setItem(EXACT_DISMISS_KEY, '1'); } catch { /* fine */ }
  }
  if (perm === 'granted' && exact !== 'granted' && !exactDismissed) {
    return (
      <div className="tr-connect-slim tr-connect-slim-on">
        <span className="tr-connect-dot" />
        <span className="tr-connect-text"><strong>On-time reminders.</strong> Allow PaceLedger to set alarms so each reminder arrives exactly {REMINDER_MINUTES} minutes before.</span>
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={notNow}>Not now</button>
        <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={allowExact}>Allow</button>
      </div>
    );
  }
  if (perm !== 'prompt' && perm !== 'prompt-with-rationale') return null;
  return (
    <div className="tr-connect-slim tr-connect-slim-on">
      <span className="tr-connect-dot" />
      <span className="tr-connect-text"><strong>Appointment reminders.</strong> Get a notification {REMINDER_MINUTES} minutes before each appointment, with its Zoom link.</span>
      <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={enable}>Turn on</button>
    </div>
  );
}
// Android Back button on screens with nowhere to go back to (sign-in,
// loading): leaves the app, like other apps.
function AndroidBackLeavesApp() {
  useEffect(() => onAndroidBack(minimizeAndroidApp), []);
  return null;
}
// Android Back button: closes an open window or sheet first, then returns
// to Today, then (on Today) puts the app in the background like other apps.
function useAndroidBackButton(tab, goHome) {
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const homeRef = useRef(goHome);
  homeRef.current = goHome;
  useEffect(() => onAndroidBack(() => {
    const overlays = document.querySelectorAll('.tr-modal-backdrop, .tr-sheet-backdrop');
    if (overlays.length) { overlays[overlays.length - 1].click(); return; }
    if (tabRef.current !== 'overview') { homeRef.current(); window.scrollTo(0, 0); return; }
    minimizeAndroidApp();
  }), []);
}
function AdvisorView({ user }) {
  useAppointmentReminders(user);
  const [tab, setTab] = useState('overview');
  useAndroidBackButton(tab, () => setTab('overview'));
  const [prefillData, setPrefillData] = useState(null);
  // Lets one tab send you to a specific spot in another (e.g. Overview's
  // "3 appointments with no outcome logged" opens Follow Up on that filter).
  const [navIntent, setNavIntent] = useState(null);
  function go(t, intent = null) {
    if (t === 'mine' && intent === 'new') setPrefillData({});
    // Today's "Book" button hands over a prospect to prefill the form.
    if (t === 'mine' && intent && typeof intent === 'object') { setPrefillData(intent.prefill || {}); intent = null; }
    setNavIntent(intent ? { tab: t, intent } : null);
    setTab(t);
    window.scrollTo(0, 0);
  }
  const intentFor = t => (navIntent && navIntent.tab === t ? navIntent.intent : null);
  return (
    <Shell>
      <Header user={user} nav={<TabNav tabs={MY_WORK_TABS} tab={tab} onSelect={setTab} />} />
      <main className="tr-main">
        {tab === 'overview' && <TodayBody user={user} onNavigate={go} />}
        {tab === 'mine' && <MyAppointmentsBody user={user} prefillData={prefillData} onPrefillConsumed={() => setPrefillData(null)} />}
        {tab === 'bizplan' && <BusinessPlanBody user={user} />}
        {tab === 'followup' && <FollowUpBody user={user} initialIntent={intentFor('followup')} onIntentConsumed={() => setNavIntent(null)} onScheduleNext={p => { setPrefillData(p); setTab('mine'); }} />}
        {tab === 'calendar' && <CalendarBody user={user} onLogAppointment={p => { setPrefillData(p); setTab('mine'); }} />}
        {tab === 'systems' && (
          <SystemsBody user={user} initialIntent={intentFor('systems')} onIntentConsumed={() => setNavIntent(null)} onLogAppointment={p => { setPrefillData(prospectToAppointmentPrefill(p)); setTab('mine'); }} />
        )}
        {tab === 'milestones' && <MilestonesBody user={user} initialIntent={intentFor('milestones')} onIntentConsumed={() => setNavIntent(null)} />}
        {tab === 'documents' && <DocumentsBody user={user} />}
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
// A general, week-scoped feedback channel a manager can leave for an
// advisor — separate from Open Requirements' policy-specific notes.
function CoachingNotesPanel({ advisorId, weekOf, currentUser }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchCoachingNotes(advisorId, weekOf).then(rows => { setNotes(rows); setLoading(false); });
  }, [advisorId, weekOf]);

  async function submit() {
    if (!newNote.trim()) return;
    setSaving(true);
    const res = await addCoachingNote(advisorId, weekOf, currentUser.id, currentUser.displayName, newNote);
    setSaving(false);
    if (res.ok) { setNotes(prev => [...prev, res.record]); setNewNote(''); }
  }
  function handleKeyDown(e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } }

  return (
    <div className="tr-coaching-panel" onClick={e => e.stopPropagation()}>
      <h4 className="tr-h4">Coaching notes for this week</h4>
      {loading ? <SkelBlock w="100%" h="30px" /> : notes.length === 0 ? (
        <p className="tr-empty">No notes yet for this week.</p>
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
      <div className="tr-note-add" onKeyDown={handleKeyDown}>
        <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Leave a note about this week…" />
        <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={submit} disabled={saving || !newNote.trim()}>Add</button>
      </div>
    </div>
  );
}
// Team Pace: how each person in their first couple of months is doing on
// their First 30 days checklist, so a manager knows who needs a hand.
function NewAdvisorsCard({ members }) {
  const [rows, setRows] = useState(null);
  const recent = members.filter(m => {
    const d = onboardingDay(m.created_at);
    return d != null && d <= 60;
  });
  const ids = recent.map(m => m.id).join(',');
  useEffect(() => {
    let alive = true;
    if (!recent.length) { setRows([]); return undefined; }
    fetchTeamOnboarding(recent.map(m => m.id)).then(r => { if (alive) setRows(r || 'error'); });
    return () => { alive = false; };
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!recent.length || rows === null || rows === 'error') return null;
  const byId = {};
  rows.forEach(r => { byId[r.user_id] = r; });
  const list = recent.map(m => {
    // A row with no totals only holds a show/hide choice, not progress.
    const r = byId[m.id] && byId[m.id].total_count > 0 ? byId[m.id] : null;
    const day = onboardingDay(m.created_at);
    const nextWeek = r && r.next_step ? onboardingStepWeek(r.next_step) : null;
    const behind = !!(nextWeek && day > nextWeek.days[1]);
    return { m, r, day, behind, done: !!(r && r.total_count && r.done_count >= r.total_count) };
  }).sort((a, b) => (Number(b.behind || !b.r) - Number(a.behind || !a.r)) || (a.day - b.day));
  return (
    <div className="tr-card tr-newadv">
      <div className="tr-row-head">
        <div>
          <h3 className="tr-h3" style={{ margin: 0 }}>New advisors · first 30 days</h3>
          <p className="tr-empty" style={{ margin: '2px 0 0' }}>Everyone who joined in the last 60 days, and the next step on their checklist.</p>
        </div>
      </div>
      <ul className="tr-newadv-list">
        {list.map(({ m, r, day, behind, done }) => {
          const pctDone = r && r.total_count ? Math.round((r.done_count / r.total_count) * 100) : 0;
          const lastSeen = r && r.last_seen_at ? Math.floor((Date.now() - new Date(r.last_seen_at).getTime()) / 86400000) : null;
          return (
            <li key={m.id} className="tr-newadv-row">
              <div className="tr-newadv-who">
                <strong>{m.display_name}</strong>
                <span className="tr-empty">Day {day}{day <= ONBOARDING_DAYS ? ` of ${ONBOARDING_DAYS}` : ''}</span>
              </div>
              <div className="tr-newadv-progress">
                <div className="tr-ov-bar"><div className={`tr-ov-bar-fill ${done ? 'tr-ov-bar-fill-alt' : ''}`} style={{ width: `${pctDone}%` }} /></div>
                <span className="tr-mono">{r ? `${r.done_count}/${r.total_count}` : '—'}</span>
              </div>
              <div className="tr-newadv-next">
                {!r ? <span className="tr-status tr-status-rust">No checklist activity yet</span>
                  : done ? <span className="tr-status tr-status-green">Checklist complete</span>
                  : <>
                      <span className="tr-newadv-step">Next: {onboardingStepTitle(r.next_step)}</span>
                      {behind ? <span className="tr-status tr-status-amber">Behind</span> : <span className="tr-status tr-status-green">On track</span>}
                    </>}
                {r && lastSeen != null && lastSeen >= 4 ? <span className="tr-newadv-seen">Last opened {lastSeen} days ago</span> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
// Team Pace: one person's week, opened from their row. A compact list
// (not nested tables) so it fits the card on any screen.
function TeamWeekDetail({ groups, counts, filter }) {
  const byWhen = (x, y) => apptStartMsSafe(x) - apptStartMsSafe(y);
  return (
    <div className="tr-weekdetail">
      {DATE_SET_OPTIONS.map((opt, i) => {
        const list = filter(groups[i]).slice().sort(byWhen);
        const met = counts[i] >= opt.target;
        return (
          <section className="tr-weekdetail-batch" key={opt.value}>
            <div className="tr-weekdetail-head">
              <span className="tr-weekdetail-title">{opt.batchLabel}</span>
              <span className={`tr-weekdetail-count ${met ? 'tr-weekdetail-met' : ''}`}>{counts[i]} of {opt.target} set</span>
            </div>
            {list.length === 0 ? (
              <div className="tr-weekdetail-none">{groups[i].length ? 'None of this type.' : 'None logged.'}</div>
            ) : (
              <ul className="tr-weekdetail-list">
                {list.map(a => (
                  <li key={a.id} className="tr-weekdetail-row">
                    <span className="tr-weekdetail-when">{fmtApptDateTime(a)}</span>
                    <span className="tr-weekdetail-client">
                      <strong>{a.client}</strong> <TypeBadge appt={a} />
                      <span className="tr-weekdetail-meta">
                        {a.presenter ? `with ${a.presenter}` : ''}{a.trainee ? ` · trainee ${a.trainee}` : ''}
                      </span>
                    </span>
                    <span className="tr-weekdetail-state">
                      {a.status ? <StatusChip status={a.status} />
                        : isPastAppointment(a) ? <span className="tr-status tr-status-none">No outcome yet</span>
                        : a.zoomUrl ? <a href={a.zoomUrl} target="_blank" rel="noopener noreferrer" className="tr-note tr-link">Join Zoom</a>
                        : <span className="tr-weekdetail-upcoming">Upcoming</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
function apptStartMsSafe(a) {
  return a.appointmentAt ? new Date(a.appointmentAt).getTime() : new Date(`${a.appointmentDate}T${a.appointmentTime || '00:00'}`).getTime();
}
function TeamPaceSubView({ user, members, loadingMembers, heading, Icon, emptyMessage, memberLabel }) {
  const [weekAppts, setWeekAppts] = useState([]);
  const [loadingAppts, setLoadingAppts] = useState(true);
  const [weekMonday, setWeekMonday] = useState(weekStartOf(todayStr()));
  const [expanded, setExpanded] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');

  function byType(list) {
    if (typeFilter === 'all') return list;
    if (typeFilter === 'recruit') return list.filter(isRecruitType);
    if (typeFilter === 'sale') return list.filter(isSaleType);
    return list;
  }

  const refreshAppts = useCallback(async () => {
    setLoadingAppts(true);
    setWeekAppts(await fetchAppointmentsForWeek(weekMonday));
    setLoadingAppts(false);
  }, [weekMonday]);

  useEffect(() => { refreshAppts(); }, [refreshAppts]);

  const loading = loadingMembers || loadingAppts;

  // Same classification already used per-row below, just tallied up front
  // so managers get the answer without reading every row themselves.
  const memberStatuses = members.map(m => {
    const list = weekAppts.filter(a => a.userId === m.id && !a.isFollowUp);
    const counts = DATE_SET_OPTIONS.map(opt => list.filter(a => a.dateSetOption === opt.value).length);
    return getStatus(counts, weekMonday);
  });
  const metCount = memberStatuses.filter(s => s === 'met').length;
  const missedCount = memberStatuses.filter(s => s === 'missed').length;
  // Early warning, not just an end-of-week verdict — flags anyone with
  // zero appointments logged so far this week, once there's been enough
  // time (through Tuesday) that it's a meaningful signal rather than
  // just "it's still early." Only meaningful when looking at the actual
  // current week, not one being browsed in the past or future.
  const isCurrentWeek = weekMonday === weekStartOf(todayStr());
  const daysElapsedInWeek = Math.floor((new Date(todayStr()) - new Date(weekMonday)) / (1000 * 60 * 60 * 24));
  const showInactivityWarning = isCurrentWeek && daysElapsedInWeek >= 4;
  const inactiveCount = showInactivityWarning
    ? members.filter(m => weekAppts.filter(a => a.userId === m.id && !a.isFollowUp).length === 0).length
    : 0;

  return (
    <>
      <WeekNav weekMonday={weekMonday} onShift={d => setWeekMonday(shiftWeekStr(weekMonday, d))} onToday={() => setWeekMonday(weekStartOf(todayStr()))} />
      <div className="tr-row-head">
        <h2 className="tr-h2"><Icon size={18} /> {heading}</h2>
        <button className="tr-btn tr-btn-ghost tr-btn-sm" onClick={refreshAppts}>Refresh</button>
      </div>
      {!loadingMembers && <NewAdvisorsCard members={members} />}
      <div className="tr-typefilter-row">
        <span className="tr-typefilter-label">Show:</span>
        <TypeFilter value={typeFilter} onChange={setTypeFilter} />
        <span className="tr-typefilter-note">Tap anyone's name to see their appointments for the week. The filter only changes those lists; pace counts always include everything.</span>
      </div>
      {loading ? <SkeletonTable rows={5} cols={6} /> : members.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">{emptyMessage}</p></div>
      ) : (
        <>
          <div className="tr-health-line">
            <strong className="tr-health-good">{metCount} of {members.length} on pace</strong>
            {missedCount > 0 && <span className="tr-health-bad"> · {missedCount} behind</span>}
            {showInactivityWarning && inactiveCount > 0 && (
              <span className="tr-health-warn"> · {inactiveCount} with nothing logged yet this week</span>
            )}
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
                      <tr
                        className={`tr-clickable-row ${isOpen ? 'tr-row-open' : ''}`} onClick={() => setExpanded(isOpen ? null : adv.id)}
                        tabIndex={0} aria-expanded={isOpen}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(isOpen ? null : adv.id); } }}>
                        <td>
                          <span className="tr-row-toggle">{isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
                          {adv.display_name}
                          {adv.role === 'manager' ? <span className="tr-note"> — manager</span> : null}
                          {adv.role === 'super_admin' ? <span className="tr-note"> — admin</span> : null}
                          <div className="tr-tenure">Joined {joinedDate(adv.created_at)}</div>
                        </td>
                        {DATE_SET_OPTIONS.map((opt, i) => (
                          <td key={opt.value}><MiniBar count={counts[i]} target={opt.target} /></td>
                        ))}
                        <td className="tr-mono">{total}/{WEEKLY_TOTAL_TARGET}</td>
                        <td><StatusBadge status={status} /></td>
                      </tr>
                      {isOpen && (
                        <tr className="tr-expand-row"><td colSpan={DATE_SET_OPTIONS.length + 3}>
                          <div className="tr-expand-inner">
                            <TeamWeekDetail groups={groups} counts={counts} filter={byType} />
                            {adv.id !== user.id && <CoachingNotesPanel advisorId={adv.id} weekOf={weekMonday} currentUser={user} />}
                          </div>
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
// Every eligible team member's live progress toward their next tier, in
// one scannable table — not just who's already ready, but where
// everyone currently stands, so a manager can see who's close too.
// Expanding a row shows the exact same requirement breakdown their own
// Milestones page would show them.
function TeamPromotionSubView({ members, loadingMembers, memberLabel, emptyMessage }) {
  const [loading, setLoading] = useState(true);
  const [progressList, setProgressList] = useState([]);
  const [expanded, setExpanded] = useState(null);

  const refresh = useCallback(async () => {
    if (members.length === 0) { setProgressList([]); setLoading(false); return; }
    setLoading(true);
    const orgDirectory = await fetchOrgDirectory();
    setProgressList(await computeTeamPromotionProgress(members, orgDirectory));
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);

  useEffect(() => { refresh(); }, [refresh]);

  const readyCount = progressList.filter(r => r.progress?.allMet).length;
  const isLoading = loadingMembers || loading;

  return (
    <>
      <div className="tr-row-head">
        <h2 className="tr-h2">Promotion readiness</h2>
        <button className="tr-btn tr-btn-ghost tr-btn-sm" onClick={refresh}>Refresh</button>
      </div>
      <p className="tr-subtitle">Live progress toward each person's next tier — the same numbers their own Milestones page shows them.</p>
      {isLoading ? <SkeletonTable rows={5} cols={4} /> : members.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">{emptyMessage}</p></div>
      ) : progressList.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">No one here has a hierarchy tier set yet, or everyone's already at the top of the ladder.</p></div>
      ) : (
        <>
          {readyCount > 0 && (
            <div className="tr-health-line">
              <span className="tr-type-badge tr-type-badge-both">🎉 {readyCount} ready for promotion</span>
            </div>
          )}
          <div className="tr-card tr-summary-card">
            <div className="tr-table-wrap">
              <table className="tr-table tr-table-summary">
                <thead><tr><th>{memberLabel}</th><th>Current Tier</th><th>Next Tier</th><th>Progress</th></tr></thead>
                <tbody>
                  {progressList.map(({ member, progress }) => {
                    const isOpen = expanded === member.id;
                    const metCount = progress.results.filter(r => r.met).length;
                    const totalCount = progress.results.length;
                    return (
                      <React.Fragment key={member.id}>
                        <tr className="tr-clickable-row" onClick={() => setExpanded(isOpen ? null : member.id)}>
                          <td>{member.display_name}</td>
                          <td>{hierarchyTierLabel(member.hierarchy_tier)}</td>
                          <td>{progress.nextTier.name} ({progress.nextTier.key})</td>
                          <td>
                            {progress.allMet ? (
                              <span className="tr-type-badge tr-type-badge-both">✓ Ready!</span>
                            ) : (
                              <span className="tr-mono">{metCount} / {totalCount} met</span>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="tr-expand-row"><td colSpan={4}>
                            {progress.results.map((req, i) => <RequirementRow key={i} req={req} />)}
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
function PeoplePaceBody({ user, fetchMembers, heading, Icon, emptyMessage, memberLabel }) {
  const [view, setView] = useState('pace'); // 'pace' | 'promotion'
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  const refreshMembers = useCallback(async () => {
    setLoadingMembers(true);
    setMembers(await fetchMembers(user));
    setLoadingMembers(false);
  }, [user.id, user.role]);

  useEffect(() => { refreshMembers(); }, [refreshMembers]);

  return (
    <div className="tr-appts-shell">
      <nav className="tr-appts-sidebar">
        <button
          type="button" className={`tr-sidebar-item tr-sidebar-item-week ${view === 'pace' ? 'tr-sidebar-item-active' : ''}`}
          onClick={() => setView('pace')}>
          <span>Pace</span>
        </button>
        <button
          type="button" className={`tr-sidebar-item tr-sidebar-item-week ${view === 'promotion' ? 'tr-sidebar-item-active' : ''}`}
          onClick={() => setView('promotion')}>
          <span>Promotion</span>
        </button>
      </nav>
      <div className="tr-appts-main">
        {view === 'pace' ? (
          <TeamPaceSubView
            user={user} members={members} loadingMembers={loadingMembers}
            heading={heading} Icon={Icon} emptyMessage={emptyMessage} memberLabel={memberLabel} />
        ) : (
          <TeamPromotionSubView members={members} loadingMembers={loadingMembers} memberLabel={memberLabel} emptyMessage={emptyMessage} />
        )}
      </div>
    </div>
  );
}
// Super admins can narrow Team Pace down to just the managers who report
// directly to them (formerly a separate "Direct Managers" tab). Regular
// managers never see this toggle — they only ever have one scope.
function TeamPaceBody({ user }) {
  const [scope, setScope] = useState('all'); // 'all' | 'directs'
  const isSuperAdmin = user.role === 'super_admin';
  const showDirects = isSuperAdmin && scope === 'directs';
  const fetchMembers = showDirects ? fetchDirectManagers : fetchTeamMembers;
  const heading = showDirects ? 'Direct managers' : 'Team pace';
  const Icon = showDirects ? UserCog : Users;
  const memberLabel = showDirects ? 'Manager' : 'Team member';
  const emptyMessage = showDirects
    ? 'No managers assigned to you yet. Assign them from Manage Team → Reports To.'
    : "No team members yet. Once people create accounts and start logging, they'll show up here.";
  return (
    <>
      {isSuperAdmin && (
        <div className="tr-pillrow" style={{ marginBottom: 14 }}>
          <button type="button" className={`tr-pill-btn ${scope === 'all' ? 'tr-pill-btn-active' : ''}`} onClick={() => setScope('all')}>All Team</button>
          <button type="button" className={`tr-pill-btn ${scope === 'directs' ? 'tr-pill-btn-active' : ''}`} onClick={() => setScope('directs')}>My Direct Managers</button>
        </div>
      )}
      <PeoplePaceBody
        key={scope} user={user} fetchMembers={fetchMembers} heading={heading} Icon={Icon} memberLabel={memberLabel}
        emptyMessage={emptyMessage} />
    </>
  );
}

// ---------------------------------------------------------------------
// track production — sold premium + recruits for the week, manager/admin only
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// team prospecting — manager/admin visibility into their team's pipeline,
// aggregate counts only; individual prospect notes stay private
// ---------------------------------------------------------------------
function TeamProspectingBody({ user }) {
  const [members, setMembers] = useState([]);
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [memberList, prospectList] = await Promise.all([
      fetchTeamMembers(user),
      fetchAllVisibleProspects(),
    ]);
    setMembers(memberList);
    setProspects(prospectList);
    setLoading(false);
  }, [user.id, user.role]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <>
      <div className="tr-row-head">
        <h2 className="tr-h2"><Users size={18} /> Team prospecting</h2>
        <button className="tr-btn tr-btn-ghost tr-btn-sm" onClick={refresh}>Refresh</button>
      </div>
      <p className="tr-subtitle">
        Click a row to see that person's actual prospect list — same detail you'd see reviewing it with them directly.
      </p>
      {loading ? <SkeletonTable rows={5} cols={6} /> : members.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">No team members yet.</p></div>
      ) : (
        <>
          <ProspectFunnel prospects={prospects} title="Team conversion funnel" />
          <div className="tr-card tr-summary-card">
          <div className="tr-table-wrap">
            <table className="tr-table tr-table-summary">
              <thead>
                <tr>
                  <th>Team member</th>
                  <th>Active prospects</th>
                  <th>Sale potential</th>
                  <th>Recruit potential</th>
                  <th>Recruited</th>
                  <th>Sold</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => {
                  const list = prospects.filter(p => p.userId === m.id);
                  const active = list.filter(p => !p.markedRecruited && !p.markedSold);
                  const sale = active.filter(p => prospectLeaningKey(p) === 'sale').length;
                  const recruit = active.filter(p => prospectLeaningKey(p) === 'recruit').length;
                  const recruited = list.filter(p => p.markedRecruited).length;
                  const sold = list.filter(p => p.markedSold).length;
                  const isOpen = expanded === m.id;
                  const sortedList = list.slice().sort((a, b) => prospectTotalChecked(b) - prospectTotalChecked(a));
                  return (
                    <React.Fragment key={m.id}>
                      <tr className="tr-clickable-row" onClick={() => setExpanded(isOpen ? null : m.id)}>
                        <td>
                          {m.display_name}
                          <div className="tr-tenure">Joined {joinedDate(m.created_at)}</div>
                        </td>
                        <td className="tr-mono">{active.length}</td>
                        <td className="tr-mono">{sale}</td>
                        <td className="tr-mono">{recruit}</td>
                        <td className="tr-mono">{recruited}</td>
                        <td className="tr-mono">{sold}</td>
                      </tr>
                      {isOpen && (
                        <tr className="tr-expand-row"><td colSpan={6}>
                          {sortedList.length === 0 ? (
                            <p className="tr-empty">No prospects logged yet.</p>
                          ) : (
                            sortedList.map((p, i) => <ProspectCard key={p.id} prospect={p} rank={i + 1} readOnly />)
                          )}
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
  useAppointmentReminders(user);
  const [group, setGroup] = useState('mine'); // 'mine' | 'team'
  const [tab, setTab] = useState('overview');
  const [prefillData, setPrefillData] = useState(null);
  // Lets one tab send you to a specific spot in another (e.g. Overview's
  // "3 appointments with no outcome logged" opens Follow Up on that filter).
  const [navIntent, setNavIntent] = useState(null);
  function go(t, intent = null) {
    if (t === 'mine' && intent === 'new') setPrefillData({});
    // Today's "Book" button hands over a prospect to prefill the form.
    if (t === 'mine' && intent && typeof intent === 'object') { setPrefillData(intent.prefill || {}); intent = null; }
    setNavIntent(intent ? { tab: t, intent } : null);
    setTab(t);
    window.scrollTo(0, 0);
  }
  const intentFor = t => (navIntent && navIntent.tab === t ? navIntent.intent : null);

  function selectGroup(g) {
    setGroup(g);
    setTab(g === 'mine' ? 'overview' : 'teamsystems');
  }
  useAndroidBackButton(group === 'mine' ? tab : `team:${tab}`, () => selectGroup('mine'));

  return (
    <Shell>
      <Header user={user} nav={<>
        <GroupSwitch group={group} onSelect={selectGroup} teamLabel="Team" />
        <TabNav tabs={group === 'mine' ? MY_WORK_TABS : TEAM_TABS} tab={tab} onSelect={setTab} />
      </>} />
      <main className="tr-main">
        {tab === 'overview' && <TodayBody user={user} onNavigate={go} />}
        {tab === 'mine' && <MyAppointmentsBody user={user} prefillData={prefillData} onPrefillConsumed={() => setPrefillData(null)} />}
        {tab === 'bizplan' && <BusinessPlanBody user={user} />}
        {tab === 'followup' && <FollowUpBody user={user} initialIntent={intentFor('followup')} onIntentConsumed={() => setNavIntent(null)} onScheduleNext={p => { setPrefillData(p); setTab('mine'); }} />}
        {tab === 'calendar' && <CalendarBody user={user} onLogAppointment={p => { setPrefillData(p); setTab('mine'); }} />}
        {tab === 'systems' && (
          <SystemsBody user={user} initialIntent={intentFor('systems')} onIntentConsumed={() => setNavIntent(null)} onLogAppointment={p => { setPrefillData(prospectToAppointmentPrefill(p)); setTab('mine'); }} />
        )}
        {tab === 'milestones' && <MilestonesBody user={user} initialIntent={intentFor('milestones')} onIntentConsumed={() => setNavIntent(null)} />}
        {tab === 'documents' && <DocumentsBody user={user} />}
        {tab === 'teamsystems' && <TeamProspectingBody user={user} />}
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
async function changeUserTier(id, newTier) {
  const { error } = await supabase.from('profiles').update({ hierarchy_tier: newTier || null }).eq('id', id);
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
// Documents + Important Links data-layer functions now live in
// ./documents.js — see the import at the top of this file.

// Manager coaching notes — a general, week-scoped feedback channel,
// separate from Open Requirements' policy-specific notes.
async function fetchCoachingNotes(advisorId, weekOf) {
  const { data, error } = await supabase
    .from('coaching_notes').select('*').eq('advisor_id', advisorId).eq('week_of', weekOf)
    .order('created_at', { ascending: true });
  if (error) { console.error(error); return []; }
  return data;
}
async function addCoachingNote(advisorId, weekOf, authorId, authorName, note) {
  const { data, error } = await supabase.from('coaching_notes').insert({
    advisor_id: advisorId, week_of: weekOf, author_id: authorId, author_name: authorName, note: note.trim(),
  }).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, record: data };
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

  // A manager or super admin can personally be someone's direct upline —
  // used for both advisors and other managers reporting further up, so
  // the org can stack multiple manager levels without needing anything
  // new added later.
  const managerAndAdminOptions = users.filter(u => u.role === 'manager' || u.role === 'super_admin');

  const ROLE_LABELS = { advisor: 'Advisor', manager: 'Manager', super_admin: 'Super Admin' };
  function handleExportRoster() {
    const rows = [['Name', 'Email', 'Role', 'Hierarchy Tier', 'Reports To', 'Top-Level Team', 'Licensed', 'Member Since']];
    users.forEach(u => {
      const reportsTo = u.manager_id ? (users.find(m => m.id === u.manager_id)?.display_name || '') : '';
      // The root of the upline chain — whichever top-level manager or
      // super admin this person's org ultimately rolls up to, regardless
      // of how many management layers sit in between. Lets a filter on
      // this one column show everyone under a given leader at any depth.
      const upline = computeUpline(u.id, users);
      const topLevelTeam = upline.length > 0 ? upline[upline.length - 1].display_name : u.display_name;
      rows.push([
        u.display_name,
        u.email || '',
        ROLE_LABELS[u.role] || u.role,
        u.hierarchy_tier ? hierarchyTierLabel(u.hierarchy_tier) : '',
        reportsTo,
        topLevelTeam,
        isLicensed(u) ? 'Yes' : 'No',
        u.created_at ? new Date(u.created_at).toLocaleDateString('en-US') : '',
      ]);
    });
    downloadCSV(`team-roster-${todayStr()}.csv`, rows);
  }

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

  async function handleTierChange(id, newTier) {
    const target = users.find(u => u.id === id);
    setSavingId(id);
    setError('');
    const err = await changeUserTier(id, newTier);
    setSavingId(null);
    if (err) { setError(err); return; }
    setUsers(prev => prev.map(u => u.id === id ? { ...u, hierarchy_tier: newTier || null } : u));
    logAuditEvent(currentUserId, currentUserName, 'Changed hierarchy tier', target?.display_name, `${target?.hierarchy_tier || 'none'} → ${newTier || 'none'}`);
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
    <div className="tr-row-head">
      <h2 className="tr-h2">Manage Team</h2>
      <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={handleExportRoster} disabled={users.length === 0}>
        <Download size={14} /> Export CSV
      </button>
    </div>
    <div className="tr-card tr-summary-card">
      {error && <div className="tr-error" style={{ margin: 16 }}>{error}</div>}
      {loading ? <SkeletonTable rows={6} cols={5} /> : (
        <div className="tr-table-wrap">
          <table className="tr-table tr-table-summary">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Reports To</th><th>Tier</th><th></th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    {u.display_name}{u.id === currentUserId ? ' (you)' : ''}
                    <div className="tr-tenure">Joined {joinedDate(u.created_at)}</div>
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
                        {managerAndAdminOptions.map(m => <option key={m.id} value={m.id}>{m.display_name}{m.role === 'super_admin' ? ' (Super Admin)' : ''}</option>)}
                      </select>
                    ) : u.role === 'manager' ? (
                      <select value={u.manager_id || ''} disabled={savingId === u.id} onChange={e => handleManagerChange(u.id, e.target.value)}>
                        <option value="">— none —</option>
                        {managerAndAdminOptions.filter(m => m.id !== u.id).map(m => <option key={m.id} value={m.id}>{m.display_name}{m.role === 'super_admin' ? ' (Super Admin)' : ''}</option>)}
                      </select>
                    ) : '—'}
                  </td>
                  <td>
                    <select value={u.hierarchy_tier || ''} disabled={savingId === u.id} onChange={e => handleTierChange(u.id, e.target.value)}>
                      <option value="">— none —</option>
                      {HIERARCHY_TIERS.map(t => <option key={t.key} value={t.key}>{t.key} — {t.name}</option>)}
                    </select>
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
// Read-only history of role changes, reports-to changes, and removals —
// lives right under the user table above since it's really an extension
// of Manage Team, not a separate feature.
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
  useAppointmentReminders(user);
  const [group, setGroup] = useState('mine'); // 'mine' | 'team'
  const [tab, setTab] = useState('overview');
  const [prefillData, setPrefillData] = useState(null);
  // Lets one tab send you to a specific spot in another (e.g. Overview's
  // "3 appointments with no outcome logged" opens Follow Up on that filter).
  const [navIntent, setNavIntent] = useState(null);
  function go(t, intent = null) {
    if (t === 'mine' && intent === 'new') setPrefillData({});
    // Today's "Book" button hands over a prospect to prefill the form.
    if (t === 'mine' && intent && typeof intent === 'object') { setPrefillData(intent.prefill || {}); intent = null; }
    setNavIntent(intent ? { tab: t, intent } : null);
    setTab(t);
    window.scrollTo(0, 0);
  }
  const intentFor = t => (navIntent && navIntent.tab === t ? navIntent.intent : null);

  function selectGroup(g) {
    setGroup(g);
    setTab(g === 'mine' ? 'overview' : 'teamsystems');
  }
  useAndroidBackButton(group === 'mine' ? tab : `team:${tab}`, () => selectGroup('mine'));

  return (
    <Shell>
      <Header user={user} nav={<>
        <GroupSwitch group={group} onSelect={selectGroup} teamLabel="Team & admin" />
        <TabNav tabs={group === 'mine' ? MY_WORK_TABS : ADMIN_TEAM_TABS} tab={tab} onSelect={setTab} />
      </>} />
      <main className="tr-main">
        {tab === 'overview' && <TodayBody user={user} onNavigate={go} />}
        {tab === 'mine' && <MyAppointmentsBody user={user} prefillData={prefillData} onPrefillConsumed={() => setPrefillData(null)} />}
        {tab === 'bizplan' && <BusinessPlanBody user={user} />}
        {tab === 'followup' && <FollowUpBody user={user} initialIntent={intentFor('followup')} onIntentConsumed={() => setNavIntent(null)} onScheduleNext={p => { setPrefillData(p); setTab('mine'); }} />}
        {tab === 'calendar' && <CalendarBody user={user} onLogAppointment={p => { setPrefillData(p); setTab('mine'); }} />}
        {tab === 'systems' && (
          <SystemsBody user={user} initialIntent={intentFor('systems')} onIntentConsumed={() => setNavIntent(null)} onLogAppointment={p => { setPrefillData(prospectToAppointmentPrefill(p)); setTab('mine'); }} />
        )}
        {tab === 'milestones' && <MilestonesBody user={user} initialIntent={intentFor('milestones')} onIntentConsumed={() => setNavIntent(null)} />}
        {tab === 'documents' && <DocumentsBody user={user} />}
        {tab === 'teamsystems' && <TeamProspectingBody user={user} />}
        {tab === 'pace' && <TeamPaceBody user={user} />}
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
  // A client filling out their intake form has no account and no session —
  // this link works whether or not anyone is signed in on this browser, so
  // it's checked first and, if present, renders instead of the normal app.
  // Read once from the URL present at mount; nothing in this app changes
  // it via client-side navigation, so it's safe to branch before any hooks.
  // The old workers.dev address still serves the app; send everyone to the
  // real domain (keeping any ?intake=, ?zoom=… on the URL) so sign-ins,
  // Google's redirect and Zoom's all happen on big-pace-ledger.com.
  if (window.location.hostname.endsWith('.workers.dev')) {
    window.location.replace(`https://big-pace-ledger.com${window.location.pathname}${window.location.search}${window.location.hash}`);
    return null;
  }
  const intakeToken = new URLSearchParams(window.location.search).get('intake');
  if (intakeToken) return <ClientIntakePublicForm token={intakeToken} />;

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
    // New flow: Google returns straight to this site with ?code=&state=.
    if (isGoogleOAuthReturn(params)) {
      // Clear the one-time code from the address bar right away.
      window.history.replaceState({}, '', window.location.pathname);
      setConnectionBanner({ type: 'success', message: 'Finishing your Google Calendar connection…' });
      finishGoogleConnect(params).then(result => {
        if (result.ok) {
          setConnectionBanner({ type: 'success', message: 'Google Calendar connected.' });
          window.dispatchEvent(new Event('paceledger:google-connected'));
        } else if (result.reason === 'cancelled') {
          setConnectionBanner({ type: 'error', message: 'Google Calendar was not connected — you cancelled on the Google screen.' });
        } else {
          setConnectionBanner({ type: 'error', message: `Could not connect Google Calendar (${result.reason}). Please try again.` });
        }
      });
      return;
    }
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

  // ?connect=google|zoom — opened from the iPhone app in a Safari sheet,
  // because Google and Zoom sign-in can't run inside the app itself. Kept
  // until the person is signed in here, then started automatically.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const want = params.get('connect');
    if (want === 'google' || want === 'zoom') {
      try {
        sessionStorage.setItem('pl_pending_connect', want);
        sessionStorage.setItem('pl_pending_connect_for', params.get('for') || '');
      } catch { /* ignore */ }
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);
  useEffect(() => {
    if (!session || !profile) return;
    let want = null, forUser = '';
    try {
      want = sessionStorage.getItem('pl_pending_connect');
      forUser = sessionStorage.getItem('pl_pending_connect_for') || '';
      sessionStorage.removeItem('pl_pending_connect');
      sessionStorage.removeItem('pl_pending_connect_for');
    } catch { /* ignore */ }
    if (want && forUser && forUser !== session.user.id) {
      // Signed in here as someone else — don't attach their calendar to the wrong person.
      setConnectionBanner({ type: 'error', message: "You're signed in here with a different PaceLedger account than in the app. Log out, sign in with the same account, then connect again." });
      return;
    }
    if (want === 'google') connectGoogleCalendar();
    else if (want === 'zoom') connectZoom();
  }, [session, profile]);

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

  if (session === undefined) return <Shell><AndroidBackLeavesApp /><Spinner label="Loading…" /></Shell>;
  if (recoveryMode) return <><AndroidBackLeavesApp /><ResetPasswordScreen onDone={() => setRecoveryMode(false)} /></>;
  if (!session) return <><AndroidBackLeavesApp /><ConnectionBanner banner={connectionBanner} onDismiss={() => setConnectionBanner(null)} /><AuthScreen /></>;
  if (profileError) {
    return (
      <Shell>
        <AndroidBackLeavesApp />
        <div className="tr-auth-wrap"><div className="tr-card"><p className="tr-error">{profileError}</p></div></div>
      </Shell>
    );
  }
  if (profileLoading || !profile) return <Shell><AndroidBackLeavesApp /><Spinner label="Loading your account…" /></Shell>;

  const user = { id: session.user.id, email: session.user.email || profile.email || '', displayName: profile.display_name, role: profile.role, hierarchyTier: profile.hierarchy_tier, managerId: profile.manager_id, createdAt: profile.created_at };
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

