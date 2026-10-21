// Chat → MegaPhone: announcements from super admins. Everyone can read them
// here (what's live, what they've confirmed, and past ones); only super
// admins post, edit or end them, and see who has confirmed each one.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Megaphone, Pencil, Plus, X } from 'lucide-react';
import {
  ANN_BODY_MAX, ANN_TITLE_MAX, audienceOf, dayLabel, deleteAnnouncement, endAnnouncement, fetchConfirmations, isLive,
  localDateOf, postAnnouncement, updateAnnouncement, useAnnouncements, whenLabel,
} from '../data/announcements.js';
import { fetchHierarchyPeopleShared } from '../data/team.js';
import { addDays, fmtDate, todayStr } from '../lib/dates.js';
import { personInitials } from '../lib/format.js';
import { Avatar, useAvatars } from '../components/avatar.jsx';
import { SkelBlock } from '../components/ui.jsx';
import { AnnText, ConfirmRow } from '../components/announcements.jsx';

export const MEGAPHONE_ABOUT = 'Announcements from super admins. Everyone can read them here; only super admins post.';
const COLORS = ['#2D68A8', '#6B51A0', '#2E7D5B', '#A0522D', '#8E6B1F', '#24548A', '#7A3E5C'];
const colorOf = id => COLORS[[...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length];
const first = n => (n || '').trim().split(/\s+/)[0] || '';

// Post a new announcement, or change one.
function Composer({ editing, onSaved, onCancel }) {
  const [f, setF] = useState(() => (editing
    ? { title: editing.title, body: editing.body, until: localDateOf(editing.ends_at), audience: editing.audience, mustConfirm: !!editing.must_confirm }
    : { title: '', body: '', until: fmtDate(addDays(new Date(), 7)), audience: 'everyone', mustConfirm: false }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const box = useRef(null);
  useEffect(() => { if (box.current) box.current.scrollIntoView({ block: 'nearest' }); }, []);
  const set = (k, v) => { setF(prev => ({ ...prev, [k]: v })); setErr(''); };

  async function save(e) {
    e.preventDefault();
    if (!f.title.trim()) { setErr('Add a title.'); return; }
    if (!f.body.trim()) { setErr('Add the message.'); return; }
    if (!f.until || f.until < todayStr()) { setErr('Pick a show-until date from today on.'); return; }
    setBusy(true);
    const res = editing ? await updateAnnouncement(editing.id, f) : await postAnnouncement(f);
    setBusy(false);
    if (!res.ok) { setErr("Couldn't save. Check your connection and try again."); return; }
    onSaved(res.record, !editing);
  }
  async function remove() {
    if (!window.confirm(`Delete "${editing.title}" for good, with who confirmed it? To just take it off Today, use End now instead.`)) return;
    setBusy(true);
    const ok = await deleteAnnouncement(editing.id);
    setBusy(false);
    if (!ok) { setErr("Couldn't delete it. Check your connection and try again."); return; }
    onSaved(null, false);
  }

  return (
    <form className="tr-mega-new" onSubmit={save} ref={box} aria-labelledby="tr-mega-new-title" noValidate>
      <div className="tr-mega-new-h">
        <h3 id="tr-mega-new-title">{editing ? 'Edit announcement' : 'New announcement'}</h3>
        <button type="button" className="tr-icon-btn" onClick={onCancel} aria-label="Close"><X size={16} /></button>
      </div>
      <label className="tr-field">
        <span>Title</span>
        <input value={f.title} maxLength={ANN_TITLE_MAX} onChange={e => set('title', e.target.value)} placeholder="For example: Office closed Thursday for the team summit" />
      </label>
      <label className="tr-field">
        <span>Message</span>
        <textarea rows={4} value={f.body} maxLength={ANN_BODY_MAX} onChange={e => set('body', e.target.value)} placeholder="What everyone needs to know" />
        {f.body.length > ANN_BODY_MAX - 200 ? <small className="tr-field-hint">{ANN_BODY_MAX - f.body.length} characters left</small> : null}
      </label>
      <div className="tr-mega-row">
        <label className="tr-field">
          <span>Show until</span>
          <input type="date" value={f.until} min={todayStr()} onChange={e => set('until', e.target.value)} />
        </label>
        <div className="tr-field">
          <span id="tr-mega-who-label">Who sees it</span>
          <div className="tr-mega-seg" role="group" aria-labelledby="tr-mega-who-label">
            {[['everyone', 'Everyone'], ['leaders', 'Leaders only']].map(([k, label]) => (
              <button key={k} type="button" className={f.audience === k ? 'tr-mega-seg-on' : ''} aria-pressed={f.audience === k} onClick={() => set('audience', k)}>{label}</button>
            ))}
          </div>
        </div>
      </div>
      {f.audience === 'leaders' ? <p className="tr-mega-help">Leaders: managers, super admins and anyone with people reporting to them.</p> : null}
      <label className="tr-mega-opt">
        <input type="checkbox" checked={f.mustConfirm} onChange={e => set('mustConfirm', e.target.checked)} />
        <span><b>Pop up until they confirm.</b> For important ones: it opens over PaceLedger until they check the box.</span>
      </label>
      {err ? <div className="tr-error" role="alert">{err}</div> : null}
      <div className="tr-mega-actions">
        {editing ? <button type="button" className="tr-link-btn tr-mega-delete" onClick={remove} disabled={busy}>Delete</button> : null}
        <span className="tr-mega-grow" />
        <button type="button" className="tr-btn tr-btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="tr-btn tr-btn-brass" disabled={busy}>
          {editing ? (busy ? 'Saving…' : 'Save changes') : <><Megaphone size={15} aria-hidden="true" /> {busy ? 'Posting…' : f.audience === 'leaders' ? 'Post to leaders' : 'Post to everyone'}</>}
        </button>
      </div>
    </form>
  );
}

// Super admins: who has and hasn't confirmed one announcement.
function WhoConfirmed({ a, people, confs, avatars, open, onToggle }) {
  const scope = audienceOf(a, people);
  const when = new Map(confs.filter(c => c.announcement_id === a.id).map(c => [c.user_id, c.confirmed_at]));
  const yes = scope.filter(p => when.has(p.id)).sort((x, y) => String(when.get(x.id)).localeCompare(String(when.get(y.id))));
  const not = scope.filter(p => !when.has(p.id)).sort((x, y) => (x.display_name || '').localeCompare(y.display_name || ''));
  const byId = new Map(people.map(p => [p.id, p]));
  const av = p => <Avatar url={avatars.get(p.id)} className="tr-ann-av" style={{ background: colorOf(p.id) }}>{personInitials(p.display_name)}</Avatar>;
  const teamOf = p => { const m = p.manager_id ? byId.get(p.manager_id) : null; return [p.hierarchy_tier, m ? `${first(m.display_name)}'s team` : ''].filter(Boolean).join(' · '); };
  return (
    <div className="tr-ann-team">
      <div className="tr-ann-team-head">
        <strong>{yes.length} of {scope.length} confirmed</strong>
        <span className="tr-ann-bar" aria-hidden="true"><i style={{ width: `${scope.length ? Math.round((100 * yes.length) / scope.length) : 0}%` }} /></span>
        <button type="button" className="tr-link-btn tr-ann-toggle" onClick={onToggle} aria-expanded={open}>{open ? 'Hide who' : 'See who'}</button>
      </div>
      {open ? (
        <div className="tr-mega-who">
          <div>
            <div className="tr-ann-sub">Not yet ({not.length})</div>
            {not.length ? <ul>{not.map(p => <li key={p.id}>{av(p)}<span>{p.display_name}</span><em>{teamOf(p)}</em></li>)}</ul> : <p className="tr-empty">Everyone has confirmed.</p>}
          </div>
          <div>
            <div className="tr-ann-sub">Confirmed ({yes.length})</div>
            {yes.length ? (
              <ul>
                {yes.slice(0, 40).map(p => <li key={p.id}>{av(p)}<span>{p.display_name}</span><em>{whenLabel(when.get(p.id))}</em></li>)}
                {yes.length > 40 ? <li className="tr-mega-more">and {yes.length - 40} more</li> : null}
              </ul>
            ) : <p className="tr-empty">No one yet.</p>}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MegaPhoneRoom({ user, isPhone, onBack }) {
  const state = useAnnouncements(user);
  const isAdmin = user.role === 'super_admin';
  const avatars = useAvatars();
  const [composing, setComposing] = useState(null); // null | 'new' | an announcement
  const [people, setPeople] = useState(null);
  const [confs, setConfs] = useState(null);
  const [open, setOpen] = useState(() => new Set());
  const [flash, setFlash] = useState('');
  const [err, setErr] = useState('');
  const list = state && state.ok ? state.list : [];
  const ids = isAdmin ? list.map(a => a.id).join(',') : '';
  useEffect(() => {
    if (!ids) return undefined;
    let alive = true;
    Promise.all([fetchHierarchyPeopleShared(), fetchConfirmations(ids.split(','))]).then(([p, c]) => {
      if (!alive) return;
      setPeople(p || []);
      setConfs(c || []);
    });
    return () => { alive = false; };
  }, [ids, state]);
  useEffect(() => { if (!flash) return undefined; const t = setTimeout(() => setFlash(''), 7000); return () => clearTimeout(t); }, [flash]);

  const live = list.filter(a => isLive(a));
  const past = list.filter(a => !isLive(a));
  const ordered = [...live, ...past];

  async function end(a) {
    if (!window.confirm(`End "${a.title}" now? It comes off everyone's Today page and stays here in MegaPhone.`)) return;
    setErr('');
    if (await endAnnouncement(a.id)) setFlash(`Ended "${a.title}".`);
    else setErr("Couldn't end it. Check your connection and try again.");
  }
  function saved(record, isNew) {
    setComposing(null);
    if (!record) { setFlash('Deleted.'); return; }
    setFlash(isNew
      ? `Posted. ${record.audience === 'leaders' ? 'Leaders see' : 'Everyone sees'} it first on Today until ${dayLabel(record.ends_at)}${record.must_confirm ? ', and it pops up until they confirm' : ''}.`
      : 'Saved.');
  }

  return (
    <section className="tr-chat-main tr-mega-main" aria-label="MegaPhone">
      <header className="tr-chat-head">
        {isPhone ? <button type="button" className="tr-icon-btn" onClick={onBack} aria-label="All chats"><ArrowLeft size={18} /></button> : null}
        <div>
          <h2 className="tr-chat-title"><Megaphone size={17} aria-hidden="true" />MegaPhone</h2>
          <p className="tr-chat-about">{MEGAPHONE_ABOUT}</p>
        </div>
        {isAdmin && !composing ? (
          <button type="button" className="tr-btn tr-btn-brass tr-btn-sm tr-mega-newbtn" onClick={() => { setComposing('new'); setFlash(''); }}>
            <Plus size={15} aria-hidden="true" /><span>New<span className="tr-hide-mobile"> announcement</span></span>
          </button>
        ) : null}
      </header>
      <div className="tr-chat-scroll tr-mega">
        {flash ? <div className="tr-flash" role="status">{flash}</div> : null}
        {err ? <div className="tr-error" role="alert">{err}</div> : null}
        {composing ? <Composer key={composing === 'new' ? 'new' : composing.id} editing={composing === 'new' ? null : composing} onSaved={saved} onCancel={() => setComposing(null)} /> : null}
        {state === null ? <SkelBlock w="100%" h="160px" />
          : !state.ok ? <p className="tr-error">Couldn't load announcements. Check your connection and try again.</p>
            : !ordered.length ? (
              <div className="tr-chat-empty">
                <p><strong>No announcements yet.</strong></p>
                <p>{isAdmin ? 'Post the first one with New announcement. Everyone sees it first on their Today page.' : 'When a super admin posts one, it shows here and first on your Today page.'}</p>
              </div>
            ) : ordered.map(a => {
              const liveNow = isLive(a);
              const mineAt = state.mine.get(a.id);
              const posted = a.created_by === user.id;
              return (
                <article key={a.id} className={`tr-mega-item ${liveNow ? 'tr-mega-item-live' : ''}`} aria-labelledby={`tr-mega-t-${a.id}`}>
                  <div className="tr-ann-top">
                    <span className={`tr-mega-status ${liveNow ? 'tr-mega-status-live' : ''}`}>{liveNow ? `Live until ${dayLabel(a.ends_at)}` : `Ended ${dayLabel(a.ended_at || a.ends_at)}`}</span>
                    {isAdmin && a.must_confirm ? <span className="tr-mega-status tr-mega-status-pop">Pops up</span> : null}
                    <span className="tr-ann-meta">{isAdmin ? `${a.audience === 'leaders' ? 'Leaders only' : 'Everyone'} · ` : ''}from <strong>{a.created_by_name || 'a super admin'}</strong> · {whenLabel(a.created_at)}</span>
                    {isAdmin ? (
                      <span className="tr-mega-acts">
                        <button type="button" className="tr-btn tr-btn-ghost tr-btn-xs" onClick={() => { setComposing(a); setFlash(''); }}><Pencil size={12} aria-hidden="true" /> Edit</button>
                        {liveNow ? <button type="button" className="tr-btn tr-btn-ghost tr-btn-xs" onClick={() => end(a)}>End now</button> : null}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="tr-ann-title" id={`tr-mega-t-${a.id}`}>{a.title}</h3>
                  <AnnText text={a.body} />
                  {posted ? null : mineAt ? <div className="tr-ann-done tr-mega-mine"><CheckCircle2 size={15} aria-hidden="true" /> You confirmed {whenLabel(mineAt)}</div>
                    : liveNow ? <ConfirmRow key={a.id} id={a.id} hint={false} /> : null}
                  {isAdmin && people && confs ? (
                    <WhoConfirmed a={a} people={people} confs={confs} avatars={avatars} open={open.has(a.id)}
                      onToggle={() => setOpen(s => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })} />
                  ) : null}
                </article>
              );
            })}
      </div>
    </section>
  );
}
