import { supabase } from './supabaseClient.js';

// ---------------------------------------------------------------------
// manager availability ("My Schedule") — blocked-out times a manager
// posts for themselves, visible to everyone (same visibility model as
// Trainings), plus the conflict check that runs before any appointment
// is saved so advisors can't double-book a presenter who's already busy.
// ---------------------------------------------------------------------
export async function fetchScheduleBlocksInRange(startDate, endDate) {
  const { data, error } = await supabase
    .from('manager_availability_blocks').select('*')
    .gte('block_date', startDate)
    .lte('block_date', endDate)
    .order('block_date', { ascending: true })
    .order('start_time', { ascending: true });
  if (error) { console.error(error); return []; }
  return data;
}
export async function createScheduleBlock({ userId, userName, date, startTime, endTime, label, timezone, recurring, repeatUntil }) {
  const base = { user_id: userId, user_name: userName || null, start_time: startTime, end_time: endTime, label: label || null, timezone: timezone || null };
  if (!recurring || !repeatUntil) {
    const { data, error } = await supabase.from('manager_availability_blocks').insert({ ...base, block_date: date }).select().single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, records: [data] };
  }
  // One row per week from the start date through repeatUntil (inclusive) —
  // same pattern as recurring trainings, so each occurrence can still be
  // individually deleted later.
  const groupId = crypto.randomUUID();
  const rows = [];
  let cursor = date;
  while (cursor <= repeatUntil) {
    rows.push({ ...base, block_date: cursor, recurring_group_id: groupId });
    cursor = fmtDateISO(addDaysISO(cursor, 7));
  }
  const { data, error } = await supabase.from('manager_availability_blocks').insert(rows).select();
  if (error) return { ok: false, error: error.message };
  return { ok: true, records: data };
}
export async function deleteScheduleBlock(id) {
  const { error } = await supabase.from('manager_availability_blocks').delete().eq('id', id);
  return !error;
}
// Deletes this occurrence and every future one in the same weekly series,
// leaving past occurrences intact as history.
export async function deleteScheduleBlockSeries(groupId, fromDate) {
  const { error } = await supabase.from('manager_availability_blocks').delete().eq('recurring_group_id', groupId).gte('block_date', fromDate);
  return !error;
}
// Asks the database whether this presenter already has an appointment at
// this exact date/time, or has marked it unavailable via My Schedule.
// Runs through a security-definer function rather than a direct query so
// it works for any advisor checking any presenter in their upline,
// without needing broad read access to that presenter's whole calendar.
// Timezone matters here: the advisor booking and the presenter being
// checked may be in different time zones (e.g. a 6:30pm Central booking
// against a presenter who blocked 7:30pm Eastern — the same instant), so
// the chosen time zone is passed through and compared as a true instant
// on the database side rather than as raw wall-clock digits.
export async function checkAppointmentConflict(presenterId, date, time, timezone, excludeAppointmentId) {
  const { data, error } = await supabase.rpc('check_appointment_conflict', {
    p_presenter_id: presenterId, p_date: date, p_time: time, p_timezone: timezone || null,
    p_exclude_appointment_id: excludeAppointmentId || null,
  });
  if (error) { console.error(error); return { conflict: false }; } // fail open — never block saving over a network hiccup
  return data;
}
// Minimal local date-math helpers (no timezone conversion needed — a
// block's date/time is compared directly against appointment_date /
// appointment_time, the same way appointment conflicts are).
function addDaysISO(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d;
}
function fmtDateISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
