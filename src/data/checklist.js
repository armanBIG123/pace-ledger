// A leader's daily checklist on Team → Overview: which of today's suggested
// tasks they've checked off, and tasks they added themselves. Each person
// only ever sees their own rows (see migration-manager-checklist.sql).
import { supabase } from '../supabaseClient.js';

const missing = error => !!error && (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message || ''));

// Today's rows, plus your own tasks from the last 30 days that aren't done
// yet (or were finished today), so unfinished tasks carry over.
export async function fetchChecklist(userId, day) {
  const dayStart = new Date(`${day}T00:00:00`).toISOString();
  const since = new Date(`${day}T00:00:00`); since.setDate(since.getDate() - 30);
  const sinceDay = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`;
  const { data, error } = await supabase.from('team_checklist').select('*')
    .eq('user_id', userId).gte('day', sinceDay)
    .order('created_at', { ascending: true });
  if (error) { if (!missing(error)) console.error(error); return { error: true, missingTable: missing(error), rows: [] }; }
  const startMs = new Date(dayStart).getTime();
  const rows = (data || []).filter(r => r.day === day || (r.custom && (!r.done || (r.done_at && new Date(r.done_at).getTime() >= startMs))));
  return { rows };
}

// Check or uncheck one of today's suggested tasks.
export async function setSuggestedDone(userId, day, itemKey, done) {
  const { data, error } = await supabase.from('team_checklist')
    .upsert({ user_id: userId, day, item_key: itemKey, done, done_at: done ? new Date().toISOString() : null }, { onConflict: 'user_id,day,item_key' })
    .select().single();
  if (error) { console.error(error); return { ok: false }; }
  return { ok: true, row: data };
}

export async function addOwnTask(userId, day, label) {
  const key = `custom:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const { data, error } = await supabase.from('team_checklist')
    .insert({ user_id: userId, day, item_key: key, label: label.trim().slice(0, 200), custom: true })
    .select().single();
  if (error) { console.error(error); return { ok: false }; }
  return { ok: true, row: data };
}

export async function setOwnTaskDone(id, done) {
  const { data, error } = await supabase.from('team_checklist')
    .update({ done, done_at: done ? new Date().toISOString() : null }).eq('id', id).select().single();
  if (error) { console.error(error); return { ok: false }; }
  return { ok: true, row: data };
}

export async function deleteOwnTask(id) {
  const { error } = await supabase.from('team_checklist').delete().eq('id', id);
  if (error) { console.error(error); return false; }
  return true;
}
