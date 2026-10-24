// Team wins (posted automatically by the database), high-fives and the
// weekly top 3. See migration-wins.sql and migration-wins-more.sql.
import { supabase } from '../supabaseClient.js';

const missing = error => !!error && (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202' || error.code === '42883' || /does not exist|could not find/i.test(error.message || ''));

// The first three work everywhere; the last three need
// migration-wins-more.sql (see postDueWins).
export const HIGH_FIVES = [
  { key: 'clap', emoji: '👏', label: 'Clap' },
  { key: 'fire', emoji: '🔥', label: 'Fire' },
  { key: 'muscle', emoji: '💪', label: 'Strong' },
  { key: 'party', emoji: '🎉', label: 'Party' },
  { key: 'raise', emoji: '🙌', label: 'Hands up' },
  { key: 'hundred', emoji: '💯', label: '100' },
];

// Posts what's due when Team wins opens (a policy whose effective date has
// arrived, last week's winners). Once per session. Resolves to true when
// the database update is in (six reactions, the new kinds of win), false
// if not yet.
let dueAsked = null;
export function postDueWins() {
  if (!dueAsked) {
    dueAsked = supabase.rpc('post_due_wins').then(({ error }) => {
      if (error) {
        if (missing(error)) return false;
        console.error(error);
        dueAsked = null; // offline etc.: ask again next time
        return true;
      }
      return true;
    });
  }
  return dueAsked;
}

// Live: onWin(type, row) for new or removed wins, onReaction(type, row) for
// high-fives given or taken back (type: 'INSERT' | 'DELETE'). Returns a
// function that stops it.
export function subscribeWins({ onWin, onReaction }) {
  if (!supabase.channel) return () => {};
  const row = p => (p.eventType === 'DELETE' ? p.old : p.new) || {};
  const ch = supabase.channel(`wins-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wins' }, p => { if (p && row(p).id) onWin(p.eventType, row(p)); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'win_reactions' }, p => { if (p && row(p).win_id) onReaction(p.eventType, row(p)); })
    .subscribe();
  return () => { try { supabase.removeChannel(ch); } catch { /* already closed */ } };
}

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
