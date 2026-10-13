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
  { key: 'appointed', title: 'Get your carrier writing number', short: 'Appointed' },
];

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
