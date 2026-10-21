// MegaPhone announcements outside Chat: the card at the top of Today (for
// everyone), the card at the top of the Team overview (with how your team
// is doing), and the pop-up for important ones, which stays over
// PaceLedger until it's confirmed.
import { Fragment, useEffect, useRef, useState } from 'react';
import { Check, CheckCircle2, Megaphone } from 'lucide-react';
import { audienceOf, confirmAnnouncement, dayLabel, fetchConfirmations, isLive, useAnnouncements, waitingFor, whenLabel } from '../data/announcements.js';
import { fetchHierarchyPeopleShared } from '../data/team.js';
import { computeDownline } from '../hierarchy.js';
import { personInitials } from '../lib/format.js';
import { Avatar, useAvatars } from './avatar.jsx';

const COLORS = ['#2D68A8', '#6B51A0', '#2E7D5B', '#A0522D', '#8E6B1F', '#24548A', '#7A3E5C'];
const colorOf = id => COLORS[[...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length];

export function MegaBadge() {
  return <span className="tr-ann-badge"><Megaphone size={13} aria-hidden="true" /> MegaPhone</span>;
}

// The message, with web links clickable.
export function AnnText({ text, id }) {
  const parts = String(text || '').split(/(https?:\/\/[^\s<>"]+)/g);
  return (
    <p className="tr-ann-body" id={id}>
      {parts.map((p, i) => (i % 2 === 1
        ? <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p.replace(/^https?:\/\//, '').replace(/[.,!?)]+$/, '')}</a>
        : <Fragment key={i}>{p}</Fragment>))}
    </p>
  );
}

// "I've read and understand this" and Confirm.
export function ConfirmRow({ id, onDone, hint = true }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function confirm() {
    setBusy(true); setErr('');
    const ok = await confirmAnnouncement(id);
    setBusy(false);
    if (!ok) { setErr("Couldn't save. Check your connection and try again."); return; }
    if (onDone) onDone();
  }
  return (
    <div className="tr-ann-foot">
      <label className="tr-ann-check">
        <input type="checkbox" checked={checked} onChange={e => { setChecked(e.target.checked); setErr(''); }} /> I've read and understand this
      </label>
      {hint ? <span className="tr-ann-hint">Your confirmation goes to the super admins.</span> : null}
      <button type="button" className="tr-btn tr-btn-brass tr-ann-confirm" disabled={!checked || busy} onClick={confirm}>
        <Check size={15} aria-hidden="true" /> {busy ? 'Saving…' : 'Confirm'}
      </button>
      {err ? <div className="tr-error tr-ann-err" role="alert">{err}</div> : null}
    </div>
  );
}

// Today: the first thing everyone sees, one announcement at a time (the
// pop-up ones show in the pop-up).
export function AnnouncementToday({ user }) {
  const state = useAnnouncements(user);
  const [done, setDone] = useState(() => new Set());
  const waiting = waitingFor(state, user, { popup: false }).filter(a => !done.has(a.id));
  if (!waiting.length) return null;
  const a = waiting[0];
  return (
    <section className="tr-ann" aria-labelledby={`tr-ann-t-${a.id}`}>
      <div className="tr-ann-top">
        <MegaBadge />
        <span className="tr-ann-meta">from <strong>{a.created_by_name || 'a super admin'}</strong> · {whenLabel(a.created_at)}</span>
        <span className="tr-ann-right"><span>Showing until {dayLabel(a.ends_at)}</span>{waiting.length > 1 ? <span className="tr-ann-of">1 of {waiting.length}</span> : null}</span>
      </div>
      <h3 className="tr-ann-title" id={`tr-ann-t-${a.id}`}>{a.title}</h3>
      <AnnText text={a.body} />
      <ConfirmRow key={a.id} id={a.id} onDone={() => setDone(s => new Set([...s, a.id]))} />
    </section>
  );
}

// Who on your team (or, for super admins, everyone) has confirmed it.
export function ConfirmedBar({ label, yes, total, open, onToggle, notYet: not, avatars }) {
  return (
    <div className="tr-ann-team">
      <div className="tr-ann-team-head">
        <strong>{label}: {yes} of {total} confirmed</strong>
        <span className="tr-ann-bar" aria-hidden="true"><i style={{ width: `${total ? Math.round((100 * yes) / total) : 0}%` }} /></span>
        {not.length
          ? <button type="button" className="tr-link-btn tr-ann-toggle" onClick={onToggle} aria-expanded={open}>{open ? 'Hide' : `See who hasn't (${not.length})`}</button>
          : <span className="tr-ann-done"><CheckCircle2 size={15} aria-hidden="true" /> Everyone has</span>}
      </div>
      {open && not.length ? (
        <>
          <div className="tr-ann-sub">Not yet ({not.length})</div>
          <div className="tr-ann-people">
            {not.slice(0, 30).map(p => (
              <span key={p.id} className="tr-ann-person">
                <Avatar url={avatars.get(p.id)} className="tr-ann-av" style={{ background: colorOf(p.id) }}>{personInitials(p.display_name)}</Avatar>{p.display_name}
              </span>
            ))}
            {not.length > 30 ? <span className="tr-ann-more">and {not.length - 30} more</span> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

// Team overview: each live announcement, whether you've confirmed it, and
// who on your team hasn't yet.
export function AnnouncementTeam({ user }) {
  const state = useAnnouncements(user);
  const avatars = useAvatars();
  const [people, setPeople] = useState(null);
  const [confs, setConfs] = useState(null);
  const [toggled, setToggled] = useState(() => new Set()); // lists opened or closed by hand
  const live = state && state.ok ? state.list.filter(a => isLive(a)).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))) : [];
  const ids = live.map(a => a.id).join(',');
  useEffect(() => {
    if (!ids) return undefined;
    let alive = true;
    Promise.all([fetchHierarchyPeopleShared(), fetchConfirmations(ids.split(','))]).then(([list, rows]) => {
      if (!alive) return;
      setPeople(list || []);
      setConfs(rows || []);
    });
    return () => { alive = false; };
  }, [ids, state]);
  if (!live.length) return null;
  const isAdmin = user.role === 'super_admin';
  const below = people ? new Set(computeDownline(user.id, people).map(p => p.id).filter(id => id !== user.id)) : new Set();
  return (
    <>
      {live.map(a => {
        const posted = a.created_by === user.id;
        const mineAt = state.mine.get(a.id);
        const scope = people ? audienceOf(a, people).filter(p => isAdmin || below.has(p.id)) : [];
        const doneIds = new Set((confs || []).filter(c => c.announcement_id === a.id).map(c => c.user_id));
        const not = scope.filter(p => !doneIds.has(p.id)).sort((x, y) => (x.display_name || '').localeCompare(y.display_name || ''));
        return (
          <section key={a.id} className="tr-ann tr-ann-compact" aria-labelledby={`tr-ann-o-${a.id}`}>
            <div className="tr-ann-top">
              <MegaBadge />
              <span className="tr-ann-meta">from <strong>{a.created_by_name || 'a super admin'}</strong> · {whenLabel(a.created_at)}</span>
              <span className="tr-ann-right">
                {posted ? <span className="tr-ann-done">You posted this</span>
                  : mineAt ? <span className="tr-ann-done"><CheckCircle2 size={15} aria-hidden="true" /> You confirmed {whenLabel(mineAt).replace('Today, ', '')}</span>
                    : <span>Showing until {dayLabel(a.ends_at)}</span>}
              </span>
            </div>
            <h3 className="tr-ann-title" id={`tr-ann-o-${a.id}`}>{a.title}</h3>
            {!posted && !mineAt ? <><AnnText text={a.body} /><ConfirmRow key={a.id} id={a.id} hint={false} /></> : null}
            {people && confs && scope.length ? (
              <ConfirmedBar label={isAdmin ? 'Everyone' : 'Your team'} yes={scope.length - not.length} total={scope.length} notYet={not} avatars={avatars}
                open={(not.length <= 12) !== toggled.has(a.id)} onToggle={() => setToggled(s => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })} />
            ) : null}
          </section>
        );
      })}
    </>
  );
}

// Important announcements: over everything until it's confirmed.
export function AnnouncementGate({ user }) {
  const state = useAnnouncements(user);
  const [done, setDone] = useState(() => new Set());
  const card = useRef(null);
  const queue = waitingFor(state, user, { popup: true }).filter(a => !done.has(a.id));
  const a = queue[0] || null;
  const showing = a ? a.id : null;
  useEffect(() => {
    if (!showing) return undefined;
    if (card.current) card.current.focus();
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = before; };
  }, [showing]);
  if (!a) return null;
  // Keep the keyboard inside the window.
  function onKeyDown(e) {
    if (e.key !== 'Tab' || !card.current) return;
    const items = [...card.current.querySelectorAll('a[href], button:not([disabled]), input:not([disabled])')];
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === card.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  return (
    <div className="tr-ann-gate">
      <div className="tr-ann-gate-card" role="alertdialog" aria-modal="true" aria-labelledby="tr-ann-gate-title" aria-describedby="tr-ann-gate-body"
        tabIndex={-1} ref={card} onKeyDown={onKeyDown}>
        <div className="tr-ann-top">
          <MegaBadge />
          <span className="tr-ann-must">Please read and confirm to continue</span>
          {queue.length > 1 ? <span className="tr-ann-right"><span className="tr-ann-of">1 of {queue.length}</span></span> : null}
        </div>
        <h3 className="tr-ann-title" id="tr-ann-gate-title">{a.title}</h3>
        <AnnText text={a.body} id="tr-ann-gate-body" />
        <p className="tr-ann-gate-note">from <strong>{a.created_by_name || 'a super admin'}</strong> · {whenLabel(a.created_at)} · showing until {dayLabel(a.ends_at)}</p>
        <ConfirmRow key={a.id} id={a.id} hint={false} onDone={() => setDone(s => new Set([...s, a.id]))} />
      </div>
    </div>
  );
}
