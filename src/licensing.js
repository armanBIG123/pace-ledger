// ---------------------------------------------------------------------
// Licensing tracker — the path from "just joined" to licensed and
// appointed. The course and exam steps live in licensing_progress; the
// license number (NPN) and writing number live on profiles, as before.
// ---------------------------------------------------------------------
import { supabase } from './supabaseClient.js';

export const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'District of Columbia',
  'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine',
  'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
  'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia',
  'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
];

export const LICENSING_STEPS = [
  { key: 'course', title: 'Start your pre-licensing course', short: 'Course started' },
  { key: 'courseDone', title: 'Finish the course', short: 'Course finished' },
  { key: 'examBooked', title: 'Book your state exam', short: 'Exam booked' },
  { key: 'examPassed', title: 'Pass the exam', short: 'Exam passed' },
  { key: 'npn', title: 'Get your license number (NPN)', short: 'Licensed' },
  { key: 'insuracloud', title: 'Get your contracting link from your manager', short: 'Link sent' },
  { key: 'profileSubmitted', title: 'Submit your contracting profile', short: 'Profile submitted' },
  { key: 'appointed', title: 'Get your F&G writing number', short: 'Appointed' },
];

// The next step in a leader's words ("Book the state exam", "Send them the
// contracting link").
const LEADER_STEP = {
  course: 'Start the pre-licensing course', courseDone: 'Finish the course', examBooked: 'Book the state exam',
  examPassed: 'Pass the exam', npn: 'Get their license number (NPN)', insuracloud: 'Send them the contracting link',
  profileSubmitted: 'Submit their contracting profile', appointed: 'Get their F&G writing number',
};
export const leaderStepText = step => (step ? LEADER_STEP[step.key] || step.title : '');

// Contracting in PaceLedger (Profiles -> Contracting -> Setup -> Turn it on)
// replaces the contracting link. The same two steps keep their place on the
// path: the producer agreement where the link was, and sending the
// contracting info where the profile was. Their dates are filled in by the
// database when the agreement is countersigned and the info is sent, so
// every screen that reads this path keeps working.
const STEP_WORDS = {
  insuracloud: {
    old: { title: 'Get your contracting link from your manager', short: 'Link sent', leader: 'Send them the contracting link' },
    app: { title: 'Sign your producer agreement', short: 'Agreement signed', leader: 'Have them sign their producer agreement' },
  },
  profileSubmitted: {
    old: { title: 'Submit your contracting profile', short: 'Profile submitted', leader: 'Submit their contracting profile' },
    app: { title: 'Send your contracting info', short: 'Info sent', leader: 'Have them send their contracting info' },
  },
};
let inApp = false;
export const contractingInApp = () => inApp;
export function setContractingInApp(on) {
  inApp = !!on;
  for (const s of LICENSING_STEPS) {
    const w = STEP_WORDS[s.key];
    if (!w) continue;
    const pick = inApp ? w.app : w.old;
    s.title = pick.title; s.short = pick.short;
    LEADER_STEP[s.key] = pick.leader;
  }
}

// The F&G writing number usually arrives within this many business days of
// the contracting profile being submitted.
export const WRITING_NUMBER_BUSINESS_DAYS = 2;

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// "YYYY-MM-DD" plus n weekdays (Saturdays and Sundays skipped).
export function addBusinessDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00`);
  let left = n;
  while (left > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) left--; }
  return ymd(d);
}
// Weekdays from one date to another (0 if the second isn't later).
export function businessDaysBetween(fromStr, toStr) {
  const d = new Date(`${fromStr}T12:00:00`);
  const end = new Date(`${toStr}T12:00:00`);
  let n = 0;
  while (d < end) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) n++; }
  return n;
}

const filled = v => !!(v && String(v).trim());

// Where someone is: which steps are done, the next one, and whether
// they're fully licensed. `profile` needs npn and fg_writing_number.
export function licensingStatus(progress, profile) {
  const p = progress || {};
  const npn = filled(profile && profile.npn);
  const appointed = filled(profile && profile.fg_writing_number);
  const licensedNow = npn && appointed;
  // Anyone with a license number has, by definition, done the earlier steps.
  const done = {
    course: licensedNow || npn || !!p.course_started_on || !!p.course_completed_on || !!p.exam_on || !!p.exam_passed_on,
    courseDone: licensedNow || npn || !!p.course_completed_on || !!p.exam_passed_on,
    examBooked: licensedNow || npn || !!p.exam_on || !!p.exam_passed_on,
    examPassed: licensedNow || npn || !!p.exam_passed_on,
    npn,
    insuracloud: appointed || !!p.contracting_sent_on || !!p.profile_submitted_on,
    profileSubmitted: appointed || !!p.profile_submitted_on,
    appointed,
  };
  const doneCount = LICENSING_STEPS.filter(s => done[s.key]).length;
  const next = LICENSING_STEPS.find(s => !done[s.key]) || null;
  const nextIndex = next ? LICENSING_STEPS.indexOf(next) : LICENSING_STEPS.length;
  return { done, doneCount, total: LICENSING_STEPS.length, next, nextIndex, licensed: licensedNow };
}

export function daysBetween(a, b) {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 864e5));
}
// "in 3 days", "today", "2 days ago" for an exam date (YYYY-MM-DD).
export function examWhen(dateStr) {
  if (!dateStr) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${dateStr}T00:00:00`);
  const n = Math.round((d.getTime() - today.getTime()) / 864e5);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n > 1) return `in ${n} days`;
  if (n === -1) return 'yesterday';
  return `${-n} days ago`;
}

export async function fetchLicensingProgress(userId) {
  const { data, error } = await supabase.from('licensing_progress').select('*').eq('user_id', userId).maybeSingle();
  if (error) { console.error(error); return { error: true }; }
  return data || null;
}
export async function saveLicensingProgress(userId, patch) {
  const { data, error } = await supabase.from('licensing_progress')
    .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' }).select().single();
  if (error) { console.error(error); return { ok: false, error: error.message }; }
  return { ok: true, row: data };
}
// Everyone's progress the viewer is allowed to see (their downline, or
// everyone for super admins), keyed by user id.
export async function fetchLicensingForUsers(userIds) {
  if (!userIds.length) return new Map();
  const { data, error } = await supabase.from('licensing_progress').select('*').in('user_id', userIds);
  if (error) { console.error(error); return new Map(); }
  return new Map(data.map(r => [r.user_id, r]));
}

// A leader (or the person themselves) ticks a contracting step:
// 'sent' | 'unsent' | 'submitted' | 'unsubmitted'.
export async function markContractingStep(userId, step) {
  const { data, error } = await supabase.rpc('mark_contracting_step', { p_user: userId, p_step: step });
  if (error) { console.error(error); return { ok: false, error: error.message }; }
  return { ok: true, row: data };
}
