// Today → Team wins and This week's top 3. Wins post themselves (sales,
// first sales, recruits, new teammates, licenses, promotions, 33 in a week,
// policies issued, exams passed, last week's winners) and anyone can
// high-five them. New wins and high-fives show up live. The top 3 covers
// the whole agency for the week.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Award, BadgeCheck, DollarSign, GraduationCap, ShieldCheck, Sparkles, Star, Target, Trophy, UserPlus, X } from 'lucide-react';
import { addHighFive, fetchNewHighFives, fetchReactions, fetchWeeklyTop3, fetchWins, HIGH_FIVES, postDueWins, removeHighFive, subscribeWins } from '../data/wins.js';
import { fetchOrgDirectoryShared } from '../data/team.js';
import { tierInfo } from '../lib/milestones.js';
import { addDays, fmtDate, parseDate, todayStr, weekStartOf } from '../lib/dates.js';
import { Modal } from './ui.jsx';

const PAGE = 8;
const KIND_ICON = { sale: DollarSign, first_sale: Star, recruit: UserPlus, joined: Sparkles, licensed: GraduationCap, promotion: Award, pace: Target, issued: ShieldCheck, exam: BadgeCheck, winners: Trophy };
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
    case 'recruit': {
      // From a sign-up: who joined. ("Tasha recruited Marcus Reed. Welcome to the team!")
      const r = w.detail && w.detail.recruit_id;
      if (r && r === meId) return <><strong>{who}</strong> recruited you. <strong>Welcome to the team!</strong></>;
      if (r && nameOf(r)) return <><strong>{who}</strong> recruited <strong>{nameOf(r)}</strong>. Welcome to the team!</>;
      return <><strong>{who}</strong> recruited a new teammate</>;
    }
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
    case 'pace': {
      const wk = w.detail && w.detail.week_of;
      const when = !wk || wk === weekStartOf(todayStr()) ? 'this week' : 'last week';
      return <><strong>{who}</strong> hit 33 appointments {when}!</>;
    }
    case 'issued': return <><strong>{who}</strong> got a policy issued</>;
    case 'exam': {
      const st = w.detail && w.detail.state;
      return <><strong>{who}</strong> passed the {st ? `${st} ` : ''}licensing exam</>;
    }
    case 'winners': return <WinnersText w={w} meId={meId} />;
    default: return <><strong>{who}</strong> had a win</>;
  }
}

// Last week's winners: #1 for appointments set, sales and recruits (ties
// share it).
const WINNER_ROWS = [['pace', 'Appointments'], ['sales', 'Sales'], ['recruits', 'Recruits']];
function WinnersText({ w, meId }) {
  const d = w.detail || {};
  const day = s => (s ? parseDate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
  const last = d.week_start === fmtDate(addDays(parseDate(weekStartOf(todayStr())), -7));
  return (
    <>
      <strong>{last ? "Last week's winners" : 'Winners'}</strong> <span className="tr-win-week">{day(d.week_start)} – {day(d.week_end)}</span>
      <ul className="tr-win-winners">
        {WINNER_ROWS.filter(([k]) => (d[k] || []).length).map(([k, label]) => (
          <li key={k}>
            <span aria-hidden="true">🥇</span>
            <span className="tr-win-winners-what">{label}</span>
            <span className="tr-win-winners-who">{d[k].map(x => (x.user_id === meId ? 'You' : x.name)).join(', ')} · {d[k][0].n}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

// Who reacted to a win: "Tasha, Derrick and 3 others" (you first). Tapping
// it lists everyone and what they sent.
function reactorNames(rx, meId, nameOf) {
  const order = [];
  [...rx].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).forEach(r => { if (!order.includes(r.user_id)) order.push(r.user_id); });
  const ids = order.includes(meId) ? [meId, ...order.filter(id => id !== meId)] : order;
  return ids.map(id => ({ id, name: id === meId ? 'You' : nameOf(id) || 'Someone' }));
}
function ReactorsLine({ rx, meId, nameOf, onOpen }) {
  const people = reactorNames(rx, meId, nameOf);
  if (!people.length) return null;
  const firsts = people.map(p => (p.id === meId ? 'You' : first(p.name)));
  const text = firsts.length <= 2 ? firsts.join(' and ') : `${firsts[0]}, ${firsts[1]} and ${firsts.length - 2} other${firsts.length - 2 === 1 ? '' : 's'}`;
  return <button type="button" className="tr-win-who" onClick={onOpen} aria-haspopup="dialog">{text}</button>;
}
function ReactorsWindow({ win, rx, meId, nameOf, onClose }) {
  const people = reactorNames(rx, meId, nameOf);
  return (
    <Modal onClose={onClose} className="tr-reactors-modal" labelledBy="tr-reactors-title">
      <div className="tr-row-head">
        <h3 className="tr-h3" id="tr-reactors-title" style={{ margin: 0 }}>High-fives</h3>
        <button type="button" className="tr-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </div>
      <p className="tr-reactors-win">{winText(win, nameOf, meId)}</p>
      <ul className="tr-reactors-list">
        {people.map(p => (
          <li key={p.id}>
            <span className="tr-reactors-name">{p.name}</span>
            <span className="tr-reactors-emoji" aria-label={HIGH_FIVES.filter(h => rx.some(r => r.user_id === p.id && r.emoji === h.key)).map(h => h.label).join(', ')}>
              {HIGH_FIVES.filter(h => rx.some(r => r.user_id === p.id && r.emoji === h.key)).map(h => h.emoji).join(' ')}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

// "Tasha", "Tasha and Derrick", "Tasha, Derrick and 3 others"
function whoList(names) {
  if (names.length <= 1) return <strong>{names[0] || 'Someone'}</strong>;
  if (names.length === 2) return <><strong>{names[0]}</strong> and <strong>{names[1]}</strong></>;
  const rest = names.length - 2;
  return <><strong>{names[0]}</strong>, <strong>{names[1]}</strong> and {rest} other{rest === 1 ? '' : 's'}</>;
}

const KIND_WORD = { sale: 'sale', first_sale: 'first sale', recruit: 'recruit', joined: 'welcome', licensed: 'license', promotion: 'promotion', pace: 'week of 33', issued: 'issued policy', exam: 'exam pass' };

// compact: Today's side column (3 wins, then "See all", and the top 3
// lists in full).
const TOP3_BOARDS = [['pace', 'Appointments set', 'Appointments'], ['sales', 'Sales', 'Sales'], ['recruits', 'Recruits', 'Recruits']];

export function TeamWinsSection({ user, compact = false }) {
  const [board, setBoard] = useState('pace');
  const first0 = compact ? 3 : PAGE;
  const [wins, setWins] = useState(null);
  const [reactions, setReactions] = useState([]);
  const [names, setNames] = useState(() => new Map());
  const [top3, setTop3] = useState(null);
  const [limit, setLimit] = useState(first0);
  const [note, setNote] = useState(null);
  // Six reactions once the database update is in; three until then.
  const [extended, setExtended] = useState(true);
  const [whoFor, setWhoFor] = useState(null); // the win whose high-fives are open
  const [fresh, setFresh] = useState(() => new Set()); // wins that just arrived live
  const winsRef = useRef(null);
  winsRef.current = wins;
  const seenKey = `pl_highfives_seen:${user.id}`;
  const weekStart = weekStartOf(todayStr());

  // Names and the top 3 once; wins again when "See all" asks for more.
  useEffect(() => {
    let alive = true;
    Promise.all([fetchOrgDirectoryShared(), fetchWeeklyTop3(weekStart)]).then(([dir, t]) => {
      if (!alive) return;
      setNames(new Map(dir.map(p => [p.id, p.display_name])));
      setTop3(t);
    });
    return () => { alive = false; };
  }, [weekStart]);
  const load = useCallback(async (n) => {
    setExtended(await postDueWins());
    const w = await fetchWins(n + 1);
    if (w.unavailable) { setWins(false); return; }
    setWins(w.rows);
    setReactions(await fetchReactions(w.rows.map(x => x.id)));
  }, []);
  // The first load waits a beat so the top of the screen shows first.
  const firstLoad = React.useRef(true);
  useEffect(() => {
    const wait = firstLoad.current ? 250 : 0;
    firstLoad.current = false;
    const t = setTimeout(() => load(limit), wait);
    return () => clearTimeout(t);
  }, [load, limit]);

  // Live: new wins slide in at the top, high-fives update as they're given,
  // and "Tasha high-fived your sale" shows the moment it happens.
  useEffect(() => {
    let top3Timer = null;
    const stop = subscribeWins({
      onWin: (type, row) => {
        if (type === 'DELETE') { setWins(prev => (Array.isArray(prev) ? prev.filter(w => w.id !== row.id) : prev)); return; }
        if (type !== 'INSERT') return;
        setWins(prev => (Array.isArray(prev) && !prev.some(w => w.id === row.id)
          ? [row, ...prev].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)) : prev));
        setFresh(prev => new Set(prev).add(row.id));
        setTimeout(() => setFresh(prev => { const next = new Set(prev); next.delete(row.id); return next; }), 2500);
        clearTimeout(top3Timer);
        top3Timer = setTimeout(() => fetchWeeklyTop3(weekStart).then(t => { if (t) setTop3(t); }), 1200);
      },
      onReaction: (type, row) => {
        const same = r => r.win_id === row.win_id && r.user_id === row.user_id && r.emoji === row.emoji;
        if (type === 'DELETE') { setReactions(prev => prev.filter(r => !same(r))); return; }
        if (type !== 'INSERT') return;
        setReactions(prev => (prev.some(same) ? prev : [...prev, row]));
        const win = (winsRef.current || []).find(w => w.id === row.win_id);
        if (win && win.user_id === user.id && row.user_id !== user.id) {
          setNote(prev => (prev && prev.live && prev.winId === win.id
            ? { ...prev, people: prev.people.includes(row.user_id) ? prev.people : [row.user_id, ...prev.people] }
            : { people: [row.user_id], what: `your ${KIND_WORD[win.kind] || 'win'}`, live: true, winId: win.id }));
          try { localStorage.setItem(seenKey, new Date().toISOString()); } catch { /* ignore */ }
        }
      },
    });
    return () => { clearTimeout(top3Timer); stop(); };
  }, [user.id, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Tasha and 3 others high-fived your sale", once per new batch.
  useEffect(() => {
    let since; let checked = 0;
    try { since = localStorage.getItem(seenKey); checked = Number(localStorage.getItem(`${seenKey}:checked`)) || 0; } catch { since = null; }
    if (Date.now() - checked < 10 * 60000) return;
    try { localStorage.setItem(`${seenKey}:checked`, String(Date.now())); } catch { /* ignore */ }
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
    <div className={`tr-wins-wrap ${compact ? 'tr-wins-compact' : ''}`}>
      {wins !== false && (
        <section className="tr-card tr-wins" aria-labelledby="tr-wins-title">
          <div className="tr-row-head">
            <h3 className="tr-h3" id="tr-wins-title" style={{ margin: 0 }}><Trophy size={16} aria-hidden="true" /> Team wins</h3>
            {compact ? <span className="tr-wins-scope" title="Sales, recruits, licenses and promotions across the agency, as they happen">agency</span> : null}
          </div>
          {compact ? null : <p className="tr-wins-sub">Sales, recruits, licenses and promotions across the agency, as they happen. Give them a high-five.</p>}
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
                  <li key={w.id} className={`tr-win tr-win-${w.kind} ${w.user_id === user.id ? 'tr-win-mine' : ''} ${fresh.has(w.id) ? 'tr-win-fresh' : ''}`}>
                    <span className="tr-win-icon" aria-hidden="true"><Icon size={15} /></span>
                    <div className="tr-win-main">
                      <div className="tr-win-text">{winText(w, nameOf, user.id)}</div>
                      <div className="tr-win-meta">
                        <span className="tr-win-hf" role="group" aria-label="High-fives">
                          {(extended ? HIGH_FIVES : HIGH_FIVES.slice(0, 3)).map(h => {
                            const these = rx.filter(r => r.emoji === h.key);
                            const mine = these.some(r => r.user_id === user.id);
                            const who = these.map(r => (r.user_id === user.id ? 'You' : first(nameOf(r.user_id)))).join(', ');
                            return (
                              <button key={h.key} type="button" className={`tr-hf ${mine ? 'tr-hf-on' : ''} ${these.length ? '' : 'tr-hf-empty'}`} aria-pressed={mine}
                                title={who ? `${h.label}: ${who}` : h.label} aria-label={`${h.label}${these.length ? `, ${these.length}` : ''}`} onClick={() => toggle(w, h.key)}>
                                <span aria-hidden="true">{h.emoji}</span>{these.length ? <span className="tr-hf-n">{these.length}</span> : null}
                              </button>
                            );
                          })}
                        </span>
                        <span className="tr-win-when">
                          <span>{ago(w.occurred_at)}</span>
                          {rx.length ? <><span className="tr-win-dot" aria-hidden="true">·</span><ReactorsLine rx={rx} meId={user.id} nameOf={nameOf} onOpen={() => setWhoFor(w.id)} /></> : null}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {more && <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm tr-wins-more" onClick={() => setLimit(l => l + PAGE * 2)}>{limit === first0 && compact ? 'See all wins' : 'Show more'}</button>}
          {whoFor && (wins || []).some(w => w.id === whoFor) && (
            <ReactorsWindow win={wins.find(w => w.id === whoFor)} rx={reactions.filter(r => r.win_id === whoFor)} meId={user.id} nameOf={nameOf} onClose={() => setWhoFor(null)} />
          )}
        </section>
      )}

      {top3 && (
        <section className="tr-card tr-top3" aria-labelledby="tr-top3-title">
          {compact ? (
            <div className="tr-row-head">
              <h3 className="tr-h3" id="tr-top3-title" style={{ margin: 0 }}>This week's top 3</h3>
              <span className="tr-wins-scope">{fmtDay(weekStart)} – {fmtDay(weekEnd)}</span>
            </div>
          ) : (
            <>
              <h3 className="tr-h3" id="tr-top3-title" style={{ margin: 0 }}>This week's top 3</h3>
              <p className="tr-wins-sub">{fmtDay(weekStart)} – {fmtDay(weekEnd)} · the whole agency</p>
            </>
          )}
          {/* On Today, one list at a time behind three tabs; elsewhere all three. */}
          {compact ? (
            <div className="tr-seg tr-top3-tabs" role="group" aria-label="Top 3 for">
              {TOP3_BOARDS.map(([key, , short]) => (
                <button key={key} type="button" className={board === key ? 'tr-seg-on' : ''} aria-pressed={board === key} onClick={() => setBoard(key)}>{short}</button>
              ))}
            </div>
          ) : null}
          {TOP3_BOARDS.filter(([key]) => !compact || key === board).map(([key, label]) => (
            <div key={key} className="tr-top3-group">
              {compact ? null : <div className="tr-top3-label">{label}</div>}
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
