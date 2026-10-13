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

export async function createTraining({ title, date, time, timezone, zoomUrl, notes, userId, userName, recurring, repeatUntil }) {
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
