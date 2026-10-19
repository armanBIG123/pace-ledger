// Today → Team wins and This week's top 3. Wins post themselves (sales,
// first sales, recruits, new teammates, licenses, promotions) and anyone
// can high-five them. The top 3 covers the whole agency for the week.
import React, { useCallback, useEffect, useState } from 'react';
import { Award, DollarSign, GraduationCap, Sparkles, Star, Trophy, UserPlus, X } from 'lucide-react';
import { addHighFive, fetchNewHighFives, fetchReactions, fetchWeeklyTop3, fetchWins, HIGH_FIVES, removeHighFive } from '../data/wins.js';
import { fetchOrgDirectory } from '../data/team.js';
import { tierInfo } from '../lib/milestones.js';
import { addDays, fmtDate, parseDate, todayStr, weekStartOf } from '../lib/dates.js';

const PAGE = 8;
const KIND_ICON = { sale: DollarSign, first_sale: Star, recruit: UserPlus, joined: Sparkles, licensed: GraduationCap, promotion: Award };
const first = name => (name || '').trim().split(/\s+/)[0] || 'Someone';

function ago(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// What the post says. `you` swaps in "You" for your own wins.
export function winText(w, nameOf, meId) {
  const you = w.user_id === meId;
  const who = you ? 'You' : nameOf(w.user_id) || 'Someone';
  switch (w.kind) {
    case 'first_sale': return <><strong>{who}</strong> made {you ? 'your' : 'their'} first sale!</>;
    case 'sale': return <><strong>{who}</strong> made a sale</>;
    case 'recruit': return <><strong>{who}</strong> recruited a new teammate</>;
    case 'joined': {
      const up = w.detail && w.detail.upline_id;
      return you ? <>You joined the team. <strong>Welcome!</strong></>
        : <>Welcome <strong>{who}</strong>{up && nameOf(up) ? <> to {up === meId ? 'your' : `${nameOf(up)}'s`} team</> : ' to the team'}!</>;
    }
    case 'licensed': return <><strong>{who}</strong> {you ? 'are' : 'is'} licensed and appointed</>;
    case 'promotion': {
      const t = tierInfo(w.detail && w.detail.tier);
      return <><strong>{who}</strong> {you ? 'were' : 'was'} promoted to {t ? t.name : 'a new level'}</>;
    }
    default: return <><strong>{who}</strong> had a win</>;
  }
}

// "Tasha", "Tasha and Derrick", "Tasha, Derrick and 3 others"
function whoList(names) {
  if (names.length <= 1) return <strong>{names[0] || 'Someone'}</strong>;
  if (names.length === 2) return <><strong>{names[0]}</strong> and <strong>{names[1]}</strong></>;
  const rest = names.length - 2;
  return <><strong>{names[0]}</strong>, <strong>{names[1]}</strong> and {rest} other{rest === 1 ? '' : 's'}</>;
}

const KIND_WORD = { sale: 'sale', first_sale: 'first sale', recruit: 'recruit', joined: 'welcome', licensed: 'license', promotion: 'promotion' };

export function TeamWinsSection({ user }) {
  const [wins, setWins] = useState(null);
  const [reactions, setReactions] = useState([]);
  const [names, setNames] = useState(() => new Map());
  const [top3, setTop3] = useState(null);
  const [limit, setLimit] = useState(PAGE);
  const [note, setNote] = useState(null);
  const seenKey = `pl_highfives_seen:${user.id}`;
  const weekStart = weekStartOf(todayStr());

  const load = useCallback(async (n) => {
    const [w, dir, t] = await Promise.all([fetchWins(n + 1), fetchOrgDirectory(), fetchWeeklyTop3(weekStart)]);
    setNames(new Map(dir.map(p => [p.id, p.display_name])));
    setTop3(t);
    if (w.unavailable) { setWins(false); return; }
    setWins(w.rows);
    setReactions(await fetchReactions(w.rows.map(x => x.id)));
  }, [weekStart]);
  useEffect(() => { load(limit); }, [load, limit]);

  // "Tasha and 3 others high-fived your sale", once per new batch.
  useEffect(() => {
    let since;
    try { since = localStorage.getItem(seenKey); } catch { since = null; }
    const from = since || new Date(Date.now() - 7 * 864e5).toISOString();
    fetchNewHighFives(user.id, from).then(({ reactions: rx, wins: mine }) => {
      try { localStorage.setItem(seenKey, new Date().toISOString()); } catch { /* ignore */ }
      if (!rx.length) return;
      const people = [...new Set(rx.map(r => r.user_id))];
      const winIds = [...new Set(rx.map(r => r.win_id))];
      const kind = winIds.length === 1 ? (mine.find(m => m.id === winIds[0]) || {}).kind : null;
      setNote({ people, what: kind ? `your ${KIND_WORD[kind] || 'win'}` : 'your wins' });
    });
  }, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const nameOf = id => names.get(id) || '';

  async function toggle(win, key) {
    const mine = reactions.some(r => r.win_id === win.id && r.user_id === user.id && r.emoji === key);
    const before = reactions;
    setReactions(mine ? reactions.filter(r => !(r.win_id === win.id && r.user_id === user.id && r.emoji === key))
      : [...reactions, { win_id: win.id, user_id: user.id, emoji: key, created_at: new Date().toISOString() }]);
    const ok = mine ? await removeHighFive(win.id, user.id, key) : await addHighFive(win.id, user.id, key);
    if (!ok) setReactions(before);
  }

  if (wins === false && !top3) return null;
  const shown = (wins || []).slice(0, limit);
  const more = (wins || []).length > limit;
  const weekEnd = fmtDate(addDays(parseDate(weekStart), 6));
  const fmtDay = d => parseDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="tr-wins-wrap">
      {wins !== false && (
        <section className="tr-card tr-wins" aria-labelledby="tr-wins-title">
          <div className="tr-row-head">
            <h3 className="tr-h3" id="tr-wins-title" style={{ margin: 0 }}><Trophy size={16} aria-hidden="true" /> Team wins</h3>
          </div>
          <p className="tr-wins-sub">Sales, recruits, licenses and promotions across the agency, as they happen. Give them a high-five.</p>
          {note && (
            <div className="tr-wins-note" role="status">
              <span>🙌 {whoList(note.people.map(id => first(nameOf(id))))} high-fived {note.what}!</span>
              <button type="button" className="tr-icon-btn" onClick={() => setNote(null)} aria-label="Dismiss"><X size={14} /></button>
            </div>
          )}
          {wins === null ? <p className="tr-empty">Loading…</p> : shown.length === 0 ? (
            <p className="tr-empty">No wins posted yet. The next sale, recruit or license shows up here.</p>
          ) : (
            <ul className="tr-wins-list">
              {shown.map(w => {
                const Icon = KIND_ICON[w.kind] || Award;
                const rx = reactions.filter(r => r.win_id === w.id);
                return (
                  <li key={w.id} className={`tr-win tr-win-${w.kind} ${w.user_id === user.id ? 'tr-win-mine' : ''}`}>
                    <span className="tr-win-icon" aria-hidden="true"><Icon size={15} /></span>
                    <div className="tr-win-main">
                      <div className="tr-win-text">{winText(w, nameOf, user.id)}</div>
                      <div className="tr-win-meta">
                        <span>{ago(w.occurred_at)}</span>
                        <span className="tr-win-hf" role="group" aria-label="High-fives">
                          {HIGH_FIVES.map(h => {
                            const these = rx.filter(r => r.emoji === h.key);
                            const mine = these.some(r => r.user_id === user.id);
                            const who = these.map(r => (r.user_id === user.id ? 'You' : first(nameOf(r.user_id)))).join(', ');
                            return (
                              <button key={h.key} type="button" className={`tr-hf ${mine ? 'tr-hf-on' : ''}`} aria-pressed={mine}
                                title={who ? `${h.label}: ${who}` : h.label} aria-label={`${h.label}${these.length ? `, ${these.length}` : ''}`} onClick={() => toggle(w, h.key)}>
                                <span aria-hidden="true">{h.emoji}</span>{these.length ? <span className="tr-hf-n">{these.length}</span> : null}
                              </button>
                            );
                          })}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {more && <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm tr-wins-more" onClick={() => setLimit(l => l + PAGE * 2)}>Show more</button>}
        </section>
      )}

      {top3 && (
        <section className="tr-card tr-top3" aria-labelledby="tr-top3-title">
          <h3 className="tr-h3" id="tr-top3-title" style={{ margin: 0 }}>This week's top 3</h3>
          <p className="tr-wins-sub">{fmtDay(weekStart)} – {fmtDay(weekEnd)} · the whole agency</p>
          {[['pace', 'Appointments set'], ['sales', 'Sales'], ['recruits', 'Recruits']].map(([key, label]) => (
            <div key={key} className="tr-top3-group">
              <div className="tr-top3-label">{label}</div>
              {top3[key].length === 0 ? <p className="tr-top3-empty">Nobody yet this week. Be the first!</p> : (
                <ol className="tr-top3-list">
                  {top3[key].map((r, i) => (
                    <li key={r.user_id} className={r.user_id === user.id ? 'tr-top3-you' : ''}>
                      <span className="tr-top3-medal" aria-hidden="true">{['🥇', '🥈', '🥉'][i]}</span>
                      <span className="tr-top3-name">{r.display_name}{r.user_id === user.id ? <span className="tr-org-you">you</span> : null}</span>
                      <span className="tr-top3-n">{r.n}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
