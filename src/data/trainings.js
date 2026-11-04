// Team trainings posted on the calendar.
import { supabase } from '../supabaseClient.js';
import { addDays, fmtDate, parseDate } from '../lib/dates.js';

// Trainings are org-wide — RLS returns every training to every signed-in
// person, regardless of role or reporting structure, unlike appointments.
export async function fetchTrainingsInRange(startDate, endDate) {
  const { data, error } = await supabase
    .from('trainings').select('*')
    .gte('training_date', startDate)
    .lte('training_date', endDate)
    .order('training_date', { ascending: true })
    .order('training_time', { ascending: true });
  if (error) { console.error(error); return []; }
  return data;
}

// Before migration-team-edits-lengths.sql has run there's no
// duration_minutes column yet: save without the length instead of failing.
async function insertTrainings(rows) {
  let res = await supabase.from('trainings').insert(rows).select();
  if (res.error && /duration_minutes/.test(res.error.message || '')) {
    res = await supabase.from('trainings').insert(rows.map(r => { const rest = { ...r }; delete rest.duration_minutes; return rest; })).select();
  }
  return res;
}

export async function createTraining({ title, date, time, durationMinutes, timezone, zoomUrl, notes, userId, userName, recurring, repeatUntil }) {
  const base = {
    title, training_time: time, timezone,
    duration_minutes: durationMinutes || 60,
    zoom_url: zoomUrl || null, notes: notes || null,
    created_by: userId, created_by_name: userName,
  };
  if (!recurring || !repeatUntil) {
    const { data, error } = await insertTrainings([{ ...base, training_date: date }]);
    if (error) return { ok: false, error: error.message };
    return { ok: true, records: data };
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
  const { data, error } = await insertTrainings(rows);
  if (error) return { ok: false, error: error.message };
  return { ok: true, records: data };
}

// Changing a training (super admins and Super Managers; see
// migration-training-edits.sql). fields: { title, date, time,
// durationMinutes, timezone, zoomUrl, notes }.
const NEEDS_SQL = 'Editing trainings needs a quick database update (migration-training-edits.sql). Removing and posting it again works in the meantime.';
const trainingFields = f => ({
  title: f.title, training_time: f.time, duration_minutes: f.durationMinutes || 60, timezone: f.timezone,
  zoom_url: f.zoomUrl || null, notes: f.notes || null,
});

// Just this one date.
export async function updateTraining(id, fields) {
  const { data, error } = await supabase.from('trainings').update({ ...trainingFields(fields), training_date: fields.date }).eq('id', id).select();
  if (error) return { ok: false, error: error.message };
  // Nothing changed and no error: the database doesn't allow edits yet.
  if (!data || !data.length) return { ok: false, error: NEEDS_SQL };
  return { ok: true, count: data.length };
}

// A weekly training from this date on: every later week gets the same
// changes. shiftDays moves each of them by the same number of days (Tuesday
// to Wednesday is 1). Earlier weeks stay as they were.
export async function updateTrainingSeries(groupId, fromDate, shiftDays, fields) {
  const f = trainingFields(fields);
  const { data, error } = await supabase.rpc('pl_edit_training_series', {
    p_group: groupId, p_from: fromDate, p_shift_days: shiftDays || 0, p_title: f.title, p_time: f.training_time,
    p_duration: f.duration_minutes, p_timezone: f.timezone, p_zoom_url: f.zoom_url, p_notes: f.notes,
  });
  if (error) {
    const m = error.message || '';
    return { ok: false, error: /pl_edit_training_series|schema cache|does not exist/.test(m) ? NEEDS_SQL : /not_allowed/.test(m) ? 'Only super admins can change trainings.' : m };
  }
  if (!data) return { ok: false, error: 'Nothing changed. It may have just been removed. Refresh the calendar and try again.' };
  return { ok: true, count: data };
}

export async function deleteTraining(id) {
  const { error } = await supabase.from('trainings').delete().eq('id', id);
  return !error;
}

// Deletes this occurrence and every future one in the same weekly series,
// leaving past occurrences intact as history.
export async function deleteTrainingSeries(groupId, fromDate) {
  const { error } = await supabase.from('trainings').delete().eq('recurring_group_id', groupId).gte('training_date', fromDate);
  return !error;
}
