// The challenge banner on Today (the BIG Bird Blitz and any push after it):
// the live top 3 in each category with where you stand, a countdown, and
// the winners once it ends. Super admins start, change and remove
// challenges (challengeEditor.jsx). People can fold it down to a slim bar.
import { lazy, Suspense, useEffect, useState } from 'react';
import { CalendarPlus, ChevronDown, ChevronUp, Pencil, Trophy, UserPlus } from 'lucide-react';
import bigMark from '../assets/big-logo-mark.png';
import { useLive } from '../data/live.js';
import { CHALLENGES_CHANGED, fetchChallengeBoard, fetchChallenges } from '../data/challenges.js';
import {
  centralDay, countdown, countdownShort, dayLabel, groupBoard, lastDayOf, METRICS, ordinal, phaseOf, pickChallenge,
  shortName, standingLine, winnersDayOf,
} from '../lib/challenges.js';
import { isGalaxyAdmin } from '../lib/roles.js';
import { personInitials } from '../lib/format.js';
import { Avatar, useAvatars } from './avatar.jsx';
import { LeafScatter, TrophyArt, TurkeyArt } from './challengeArt.jsx';

const ChallengeEditor = lazy(() => import('./challengeEditor.jsx'));
const ICONS = { appointments: CalendarPlus, recruits: UserPlus };
const firstName = n => String(n || '').trim().split(/\s+/)[0];
const foldKey = id => `pl_challenge_folded:${id}`;
const readFolded = id => { try { return localStorage.getItem(foldKey(id)) === '1'; } catch { return false; } };

export function ChallengeBanner({ user }) {
  const list = useLive(['challenges', user.id], fetchChallenges);
  const [now, setNow] = useState(() => Date.now());
  const ch = pickChallenge(list.data, now);
  const phase = phaseOf(ch, now);
  const showsBoard = phase === 'live' || phase === 'winners';
  const board = useLive(['challenge-board', ch ? ch.id : '-'], () => fetchChallengeBoard(ch.id), { topics: ['appointments'], enabled: !!ch && showsBoard });
  const [folded, setFolded] = useState(false);
  const [editing, setEditing] = useState(false);
  const avatars = useAvatars();
  const admin = isGalaxyAdmin(user);

  useEffect(() => { if (ch) setFolded(readFolded(ch.id)); }, [ch && ch.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // The countdown and the phase move on their own; the board refreshes every
  // minute while it's live and on screen.
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      if (phase === 'live' && document.visibilityState === 'visible') board.reload();
    }, 30000);
    return () => clearInterval(t);
  }, [phase, board.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const again = () => { list.reload(); board.reload(); };
    window.addEventListener(CHALLENGES_CHANGED, again);
    return () => window.removeEventListener(CHALLENGES_CHANGED, again);
  }, [list.reload, board.reload]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ch || phase === 'over') return null;
  const fold = v => { setFolded(v); try { localStorage.setItem(foldKey(ch.id), v ? '1' : '0'); } catch { /* private window */ } };
  const groups = groupBoard(board.data || [], ch.metrics, user.id);
  const theme = ch.theme === 'thanksgiving' ? 'thanksgiving' : 'classic';
  const art = theme === 'thanksgiving' ? <TurkeyArt medal={phase === 'winners'} /> : <TrophyArt />;
  const editor = editing ? (
    <Suspense fallback={null}><ChallengeEditor challenge={ch} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} /></Suspense>
  ) : null;
  const editBtn = admin ? (
    <button type="button" className="tr-chal-tool" onClick={() => setEditing(true)} aria-label="Edit challenge" title="Edit challenge"><Pencil size={15} /></button>
  ) : null;

  if (folded) {
    return (
      <>
      <section className={`tr-chal tr-chal-slim tr-chal-${theme}`} aria-label={ch.title}>
        <span className="tr-chal-slim-art">{art}</span>
        <strong className="tr-chal-slim-title">{ch.title}</strong>
        <span className="tr-chal-slim-you">
          {phase === 'upcoming' ? `Starts ${dayLabel(centralDay(ch.starts_at))}`
            : ch.metrics.map(m => `${METRICS[m].short}: ${groups[m].me ? ordinal(groups[m].me.place) : '–'}`).join(' · ')}
        </span>
        {phase === 'live' ? <span className="tr-chal-slim-left">{countdownShort(ch.ends_at, now)} left</span> : null}
        {phase === 'winners' ? <span className="tr-chal-slim-left">Winners are in</span> : null}
        <span className="tr-chal-slim-tools">
          {editBtn}
          <button type="button" className="tr-chal-tool" onClick={() => fold(false)} aria-label={`Show ${ch.title}`} aria-expanded="false"><ChevronDown size={16} /></button>
        </span>
      </section>
      {editor}
      </>
    );
  }

  return (
    <>
    <section className={`tr-chal tr-chal-${theme} tr-chal-is-${phase}`} aria-labelledby="tr-chal-title">
      {theme === 'thanksgiving' ? <LeafScatter /> : null}
      <div className="tr-chal-art">{art}</div>
      <div className="tr-chal-intro">
        <div className="tr-chal-brand">
          <img className="tr-chal-logo" src={bigMark} alt="BIG" />
          <span className="tr-chal-brand-text"><span className="tr-chal-network">Big Insurance Network</span><span className="tr-chal-presents">presents</span></span>
        </div>
        <h2 className="tr-chal-title" id="tr-chal-title">{ch.title}</h2>
        {phase === 'winners' ? <p className="tr-chal-tagline">That’s a wrap. Congratulations to our winners!</p>
          : ch.tagline ? <p className="tr-chal-tagline">{ch.tagline}</p> : null}
        {phase === 'live' ? <Countdown until={ch.ends_at} now={now} /> : null}
        <p className="tr-chal-when">
          {phase === 'upcoming' ? <span>Starts <b>{dayLabel(centralDay(ch.starts_at))}</b> · runs through {dayLabel(lastDayOf(ch))}</span>
            : phase === 'live' ? <><span className="tr-chal-live"><span className="tr-chal-dot" aria-hidden="true" />Live</span><span>Through {dayLabel(lastDayOf(ch))} · winners {dayLabel(winnersDayOf(ch))}</span></>
              : <span><Trophy size={13} aria-hidden="true" className="tr-chal-final-ic" /> Final results · ended {dayLabel(lastDayOf(ch))}</span>}
        </p>
      </div>
      <div className={`tr-chal-boards tr-chal-boards-${ch.metrics.length}`}>
        {phase === 'upcoming' ? (
          <div className="tr-chal-board tr-chal-soon">
            <h3 className="tr-chal-board-title">What counts</h3>
            <ul>{ch.metrics.map(m => <li key={m}>{METRICS[m].label}{m === 'recruits' ? ' (people who sign up with your invite link)' : ' (new ones you book)'}</li>)}</ul>
            <p className="tr-chal-you">The top 3 in each show here, live, once it starts.</p>
          </div>
        ) : ch.metrics.map(m => (
          phase === 'winners'
            ? <Podium key={m} metric={m} group={groups[m]} meId={user.id} avatars={avatars} loading={board.data === undefined} />
            : <Board key={m} metric={m} group={groups[m]} meId={user.id} avatars={avatars} loading={board.data === undefined} />
        ))}
      </div>
      <div className="tr-chal-tools">
        {editBtn}
        <button type="button" className="tr-chal-tool" onClick={() => fold(true)} aria-label={`Fold ${ch.title} down`} aria-expanded="true" title="Fold down"><ChevronUp size={16} /></button>
      </div>
    </section>
    {editor}
    </>
  );
}

function Countdown({ until, now }) {
  const { days, hours, minutes } = countdown(until, now);
  const parts = [[days, days === 1 ? 'day' : 'days'], [hours, hours === 1 ? 'hr' : 'hrs'], [minutes, 'min']];
  return (
    <div className="tr-chal-count" role="timer" aria-label={`${days} days, ${hours} hours and ${minutes} minutes left`}>
      {parts.map(([n, l]) => <span key={l} className="tr-chal-count-cell"><b>{n}</b><small>{l}</small></span>)}
      <span className="tr-chal-count-left">left</span>
    </div>
  );
}

function Medal({ place }) {
  return <span className={`tr-chal-medal tr-chal-medal-${place}`} aria-label={`${ordinal(place)} place`}>{place}</span>;
}

function Board({ metric, group, meId, avatars, loading }) {
  const Icon = ICONS[metric];
  return (
    <div className="tr-chal-board" data-metric={metric}>
      <div className="tr-chal-board-head">
        <span className={`tr-chal-ic tr-chal-ic-${metric}`} aria-hidden="true"><Icon size={14} /></span>
        <h3 className="tr-chal-board-title">{METRICS[metric].label}</h3>
        {group.people > 3 ? <span className="tr-chal-people">{group.people} on the board</span> : null}
      </div>
      <ol className="tr-chal-rows" aria-label={`Top 3, ${METRICS[metric].label.toLowerCase()}`}>
        {[1, 2, 3].map(place => {
          const r = group.top.find(x => x.place === place);
          if (!r) return <li key={place} className="tr-chal-row tr-chal-open"><Medal place={place} /><span className="tr-chal-name">{loading ? '…' : 'Up for grabs'}</span></li>;
          const you = r.user_id === meId;
          return (
            <li key={place} className={`tr-chal-row ${place === 1 ? 'tr-chal-lead' : ''} ${you ? 'tr-chal-row-you' : ''}`}>
              <Medal place={place} />
              <Avatar url={avatars.get(r.user_id)} className="tr-chal-face">{personInitials(r.display_name || '?')}</Avatar>
              <span className="tr-chal-name"><span className="tr-chal-full">{r.display_name}</span><span className="tr-chal-short">{shortName(r.display_name)}</span>{you ? <span className="tr-org-you">you</span> : null}</span>
              <span className="tr-chal-n">{r.n}</span>
            </li>
          );
        })}
      </ol>
      {loading ? null : <p className="tr-chal-you">{standingLine(group, metric)}</p>}
    </div>
  );
}

// Winners: 2nd, 1st, 3rd on a podium.
function Podium({ metric, group, meId, avatars, loading }) {
  const Icon = ICONS[metric];
  const line = standingLine(group, metric, 'winners');
  return (
    <div className="tr-chal-board tr-chal-podium-card" data-metric={metric}>
      <div className="tr-chal-board-head">
        <span className={`tr-chal-ic tr-chal-ic-${metric}`} aria-hidden="true"><Icon size={14} /></span>
        <h3 className="tr-chal-board-title">{METRICS[metric].label}</h3>
      </div>
      {!loading && !group.top.length ? <p className="tr-chal-you">Nobody on the board this time.</p> : (
        <ol className="tr-chal-podium" aria-label={`Winners, ${METRICS[metric].label.toLowerCase()}`}>
          {[2, 1, 3].map(place => {
            const r = group.top.find(x => x.place === place);
            return (
              <li key={place} className={`tr-chal-step tr-chal-step-${place} ${r && r.user_id === meId ? 'tr-chal-step-you' : ''}`} style={{ order: place === 1 ? 2 : place === 2 ? 1 : 3 }}>
                {r ? (
                  <>
                    {place === 1 ? <Crown /> : null}
                    <Avatar url={avatars.get(r.user_id)} className="tr-chal-face">{personInitials(r.display_name || '?')}</Avatar>
                    <span className="tr-chal-name"><span className="tr-chal-full">{r.display_name}</span><span className="tr-chal-short">{shortName(r.display_name)}</span><span className="tr-chal-first">{firstName(r.display_name)}</span></span>
                    {r.user_id === meId ? <span className="tr-org-you">you</span> : null}
                    <span className="tr-chal-n">{r.n}</span>
                  </>
                ) : <span className="tr-chal-name tr-chal-nobody">–</span>}
                <span className="tr-chal-block"><Medal place={place} /></span>
              </li>
            );
          })}
        </ol>
      )}
      {line ? <p className="tr-chal-you">{line}</p> : null}
    </div>
  );
}

function Crown() {
  return (
    <svg className="tr-chal-crown" viewBox="0 0 24 16" aria-hidden="true">
      <path d="M2 14 L3 4 L8.5 9 L12 2 L15.5 9 L21 4 L22 14 Z" fill="#E9B949" stroke="#B8872A" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="12" cy="10.5" r="1.6" fill="#B0432F" />
    </svg>
  );
}
