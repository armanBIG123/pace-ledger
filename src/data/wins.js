// Team wins (posted automatically by the database), high-fives and the
// weekly top 3. See migration-wins.sql.
import { supabase } from '../supabaseClient.js';

const missing = error => !!error && (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202' || error.code === '42883' || /does not exist|could not find/i.test(error.message || ''));

export const HIGH_FIVES = [
  { key: 'clap', emoji: '👏', label: 'Clap' },
  { key: 'fire', emoji: '🔥', label: 'Fire' },
  { key: 'muscle', emoji: '💪', label: 'Strong' },
];

// The newest wins across the agency.
export async function fetchWins(limit = 12) {
  const { data, error } = await supabase.from('wins').select('*').order('occurred_at', { ascending: false }).limit(limit);
  if (error) { if (!missing(error)) console.error(error); return { rows: [], unavailable: true }; }
  return { rows: data || [] };
}

export async function fetchReactions(winIds) {
  if (!winIds.length) return [];
  const { data, error } = await supabase.from('win_reactions').select('*').in('win_id', winIds);
  if (error) { if (!missing(error)) console.error(error); return []; }
  return data || [];
}

export async function addHighFive(winId, userId, emoji) {
  const { error } = await supabase.from('win_reactions').insert({ win_id: winId, user_id: userId, emoji });
  if (error && error.code !== '23505') { console.error(error); return false; }
  return true;
}

export async function removeHighFive(winId, userId, emoji) {
  const { error } = await supabase.from('win_reactions').delete().eq('win_id', winId).eq('user_id', userId).eq('emoji', emoji);
  if (error) { console.error(error); return false; }
  return true;
}

// High-fives other people gave your wins since a moment in time.
export async function fetchNewHighFives(userId, sinceIso) {
  const since60 = new Date(Date.now() - 60 * 864e5).toISOString();
  const { data: mine, error } = await supabase.from('wins').select('id, kind').eq('user_id', userId).gte('occurred_at', since60).limit(200);
  if (error || !mine || !mine.length) return { reactions: [], wins: [] };
  const { data, error: e2 } = await supabase.from('win_reactions').select('*')
    .in('win_id', mine.map(w => w.id)).gt('created_at', sinceIso).neq('user_id', userId)
    .order('created_at', { ascending: false }).limit(200);
  if (e2) return { reactions: [], wins: mine };
  return { reactions: data || [], wins: mine };
}

// weekStart: the Saturday the PaceLedger week starts on (YYYY-MM-DD).
export async function fetchWeeklyTop3(weekStart) {
  const { data, error } = await supabase.rpc('weekly_top3', { p_week_start: weekStart });
  if (error) { if (!missing(error)) console.error(error); return null; }
  const out = { pace: [], sales: [], recruits: [] };
  (data || []).forEach(r => { if (out[r.category]) out[r.category].push(r); });
  return out;
}
