// Challenges (supabase/migrations/20261119160000_challenges.sql): the list,
// a challenge's board, and a super admin's changes.
import { supabase } from '../supabaseClient.js';
import { rowOf } from '../lib/challenges.js';

const missing = error => !!error && (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202' || error.code === '42883' || /does not exist|could not find/i.test(error.message || ''));
export const CHALLENGES_CHANGED = 'paceledger:challenges-changed';
export const challengesChanged = () => window.dispatchEvent(new CustomEvent(CHALLENGES_CHANGED));

// The ones still showing (live, winners, or coming up). [] before the
// database update is in.
export async function fetchChallenges() {
  const { data, error } = await supabase.from('challenges').select('*').gt('show_until', new Date().toISOString()).order('starts_at');
  if (error) { if (!missing(error)) console.error(error); return []; }
  return data || [];
}

// Rows of { metric, place, user_id, display_name, n, people }: the top 3 in
// each category and your own row. null if it couldn't load.
export async function fetchChallengeBoard(id) {
  const { data, error } = await supabase.rpc('challenge_board', { p_challenge: id });
  if (error) { if (!missing(error)) console.error(error); return null; }
  return data || [];
}

export async function saveChallenge(form, id = null) {
  const row = rowOf(form);
  const q = id ? supabase.from('challenges').update(row).eq('id', id) : supabase.from('challenges').insert(row);
  const { data, error } = await q.select().single();
  if (error) { console.error(error); return { ok: false }; }
  challengesChanged();
  return { ok: true, record: data };
}

export async function deleteChallenge(id) {
  const { error } = await supabase.from('challenges').delete().eq('id', id);
  if (error) { console.error(error); return false; }
  challengesChanged();
  return true;
}
