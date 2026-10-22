// + New (add or log anything from any tab) and search (find any teammate,
// appointment, client or prospect from any tab).
import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, CalendarPlus, ClipboardCheck, Search, Send, Star, User, UserPlus, X } from 'lucide-react';
import { apptLocalDate, apptStartMs, fmtApptDateTime, todayStr } from '../lib/dates.js';
import { buildChildrenMap, downlineIds, hierarchyTierLabel } from '../hierarchy.js';
import { fetchMyAppointments, typeLabel } from '../data/appointments.js';
import { fetchMyProspects, LEANING_LABELS, prospectLeaningKey, prospectTotalChecked } from '../data/prospects.js';
import { fmtPhone } from '../lib/phone.js';
import { fetchHierarchyPeople } from '../data/team.js';
import { InviteSomeone } from './Header.jsx';
import { openAppointment } from './appointmentPanel.jsx';

// ---------------------------------------------------------------------
// + New
// ---------------------------------------------------------------------
export const NEW_ITEMS = [
  { kind: 'appointment', Icon: CalendarPlus, title: 'Log an appointment', sub: 'Sale, recruit or both' },
  { kind: 'prospect', Icon: UserPlus, title: 'Add a prospect', sub: 'A name for your list' },
  { kind: 'outcome', Icon: ClipboardCheck, title: 'Log how it went', sub: 'Appointments with no outcome yet' },
  { kind: 'invite', Icon: Send, title: 'Invite a recruit', sub: 'Text or email their sign-up link' },
];

// A dropdown under the header's + New on a computer; a sheet from the
// bottom (opened by the + in the bottom bar) on a phone.
export function NewMenu({ open, onClose, onPick, anchor }) {
  const firstRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    if (firstRef.current) firstRef.current.focus({ preventScroll: true });
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="tr-new-backdrop" onClick={onClose}>
      <div className="tr-new-menu" role="menu" aria-label="Add or log" onClick={e => e.stopPropagation()}
        style={anchor ? { top: anchor.bottom + 8, left: Math.max(12, Math.min(anchor.right - 300, window.innerWidth - 312)) } : undefined}>
        <div className="tr-sheet-grip tr-new-grip" />
        <div className="tr-new-head">Add or log</div>
        {NEW_ITEMS.map((it, i) => (
          <button key={it.kind} ref={i === 0 ? firstRef : null} type="button" role="menuitem" className="tr-new-item" onClick={() => onPick(it.kind)}>
            <span className="tr-new-icon"><it.Icon size={17} /></span>
            <span className="tr-new-text"><strong>{it.title}</strong><span>{it.sub}</span></span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function InviteModal({ user, onClose }) {
  return (
    <div className="tr-modal-backdrop" onClick={onClose}>
      <div className="tr-modal-card tr-invite-modal" role="dialog" aria-modal="true" aria-labelledby="tr-invite-modal-title" onClick={e => e.stopPropagation()}>
        <div className="tr-row-head">
          <h3 className="tr-h3" id="tr-invite-modal-title" style={{ margin: 0 }}>Invite a recruit</h3>
          <button type="button" className="tr-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <p className="tr-subtitle" style={{ margin: '4px 0 12px' }}>A personal sign-up link that puts them directly on your team. It works once.</p>
        <InviteSomeone user={user} startOpen onCancel={onClose} />
      </div>
    </div>
  );
}

// Everything a view needs for + New: open it, and the menu + invite
// window to render. `go(tab, intent)` is the view's navigation.
export function useNewMenu(user, go) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const [inviting, setInviting] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  function pick(kind) {
    setOpen(false);
    if (kind === 'invite') setInviting(true);
    else if (kind === 'appointment') go('mine', 'new');
    else if (kind === 'prospect') go('systems', 'new');
    else if (kind === 'outcome') go('followup', 'nolog');
  }
  const el = (
    <>
      <NewMenu open={open} onClose={close} onPick={pick} anchor={anchor} />
      {inviting && <InviteModal user={user} onClose={() => setInviting(false)} />}
    </>
  );
  // Opened from the header button: the menu drops down under it. From the
  // phone's bottom bar: it opens as a sheet (no anchor).
  function openNew(e) {
    const r = e && e.currentTarget && e.currentTarget.closest('.tr-header-row') ? e.currentTarget.getBoundingClientRect() : null;
    setAnchor(r ? { bottom: r.bottom, right: r.right } : null);
    setOpen(true);
  }
  return { openNew, newEl: el };
}

// ---------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const hit = (hay, terms) => { const h = norm(hay); return terms.every(t => h.includes(t)); };
// 0 when every term starts a word ("an" → "Andre"), 1 when it's only inside one ("Brianna").
const rank = (hay, terms) => { const words = norm(hay).split(/[\s-]+/); return terms.every(t => words.some(w => w.startsWith(t))) ? 0 : 1; };

// Matches across your team, your appointments (and clients) and your
// prospects, five of each at most. Pure, so it's easy to check.
export function searchEverything(data, query, nowMs = Date.now()) {
  const terms = norm(query).split(/\s+/).filter(Boolean);
  if (!terms.length || !data) return [];
  // A phone number (or part of one) finds clients and prospects by number.
  const digits = String(query).replace(/\D/g, '');
  const byPhone = digits.length >= 3 && !/[a-z]/i.test(query);
  const phoneHit = ph => byPhone && String(ph || '').replace(/\D/g, '').includes(digits);
  const groups = [];
  const people = (data.people || []).filter(p => hit(p.display_name, terms))
    .sort((a, b) => rank(a.display_name, terms) - rank(b.display_name, terms) || (a.display_name || '').localeCompare(b.display_name || '')).slice(0, 5)
    .map(p => {
      const up = p.manager_id && data.byId ? data.byId.get(p.manager_id) : null;
      return {
        kind: 'person', id: p.id, title: p.display_name, Icon: User,
        sub: [p.hierarchy_tier ? hierarchyTierLabel(p.hierarchy_tier) : 'No level set', up ? `reports to ${up.display_name}` : ''].filter(Boolean).join(' · '),
      };
    });
  if (people.length) groups.push({ label: 'People', items: people });
  const today = todayStr();
  const appts = (data.appts || []).filter(a => hit(a.client, terms) || phoneHit(a.clientPhone))
    .sort((a, b) => {
      const r = rank(a.client, terms) - rank(b.client, terms);
      if (r) return r;
      const fa = apptStartMs(a) >= nowMs, fb = apptStartMs(b) >= nowMs;
      if (fa !== fb) return fa ? -1 : 1;
      return fa ? apptStartMs(a) - apptStartMs(b) : apptStartMs(b) - apptStartMs(a);
    }).slice(0, 5)
    .map(a => ({
      kind: 'appointment', id: a.id, title: a.client, Icon: CalendarDays, search: a.client,
      sub: `${typeLabel(a) || 'Appointment'} · ${fmtApptDateTime(a)}${phoneHit(a.clientPhone) ? ` · ${fmtPhone(a.clientPhone)}` : ''}`,
      tag: apptLocalDate(a) === today ? 'Today' : a.officiallySold ? 'Sold' : a.officiallyRecruited ? 'Recruited' : null,
    }));
  if (appts.length) groups.push({ label: 'Appointments and clients', items: appts });
  const prospects = (data.prospects || []).filter(p => hit(`${p.firstName} ${p.lastName}`, terms) || phoneHit(p.phone))
    .sort((a, b) => rank(`${a.firstName} ${a.lastName}`, terms) - rank(`${b.firstName} ${b.lastName}`, terms)).slice(0, 5)
    .map(p => {
      const n = prospectTotalChecked(p);
      return {
        kind: 'prospect', id: p.id, title: `${p.firstName} ${p.lastName}`, Icon: Star, search: `${p.firstName} ${p.lastName}`,
        sub: [n > 0 ? `${LEANING_LABELS[prospectLeaningKey(p)]} · ${n}/9` : 'Not scored yet', phoneHit(p.phone) ? fmtPhone(p.phone) : p.source || ''].filter(Boolean).join(' · '),
      };
    });
  if (prospects.length) groups.push({ label: 'Prospects', items: prospects });
  return groups;
}

// The header search box on a computer; a search button that opens a
// full-screen search on a phone. `withPeople` adds your team.
export function GlobalSearch({ user, go, withPeople }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const [data, setData] = useState(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const phoneInputRef = useRef(null);
  const wrapRef = useRef(null);
  const loadedAt = useRef(0);

  const load = useCallback(async () => {
    if (Date.now() - loadedAt.current < 30000) return;
    loadedAt.current = Date.now();
    const [appts, prospects, people] = await Promise.all([
      fetchMyAppointments(user.id), fetchMyProspects(user.id), withPeople ? fetchHierarchyPeople() : Promise.resolve([]),
    ]);
    let team = [];
    if (withPeople) {
      const ids = user.role === 'super_admin' ? new Set(people.map(p => p.id)) : new Set(downlineIds(user.id, buildChildrenMap(people)));
      ids.delete(user.id);
      team = people.filter(p => ids.has(p.id));
    }
    setData({ appts, prospects, people: team, byId: new Map(people.map(p => [p.id, p])) });
  }, [user.id, user.role, withPeople]);

  // "/" jumps to search, like most web apps.
  useEffect(() => {
    const onKey = e => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (!inputRef.current || inputRef.current.offsetParent === null) return;
      e.preventDefault();
      inputRef.current.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  useEffect(() => { if (overlay && phoneInputRef.current) phoneInputRef.current.focus(); }, [overlay]);
  useEffect(() => { setActive(0); }, [q]);

  const groups = searchEverything(data, q);
  const flat = groups.flatMap(g => g.items);

  function choose(item) {
    setOpen(false); setOverlay(false); setQ('');
    if (inputRef.current) inputRef.current.blur();
    if (item.kind === 'person') go('org', { person: item.id });
    else if (item.kind === 'appointment') {
      // Opens that appointment right where you are.
      const appt = ((data && data.appts) || []).find(a => a.id === item.id);
      if (appt) openAppointment(appt); else go('mine', { search: item.search });
    }
    else if (item.kind === 'prospect') go('systems', { search: item.search });
  }
  function onKeyDown(e) {
    if (e.key === 'Escape') { setOpen(false); setOverlay(false); e.currentTarget.blur(); return; }
    if (!flat.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % flat.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i - 1 + flat.length) % flat.length); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(flat[Math.min(active, flat.length - 1)]); }
  }
  const placeholder = withPeople ? 'Search people, clients, prospects…' : 'Search clients and prospects…';

  function results() {
    if (!q.trim()) return <p className="tr-gsearch-empty">Type a name to find {withPeople ? 'teammates, ' : ''}appointments, clients and prospects, or a phone number to find a client or prospect.</p>;
    if (!data) return <p className="tr-gsearch-empty">Searching…</p>;
    if (!flat.length) return <p className="tr-gsearch-empty">No matches for “{q.trim()}”.</p>;
    let n = -1;
    return groups.map(g => (
      <div key={g.label} className="tr-gsearch-group" role="group" aria-label={g.label}>
        <div className="tr-gsearch-label">{g.label}</div>
        {g.items.map(it => {
          n += 1;
          const idx = n;
          return (
            <button key={`${it.kind}-${it.id}`} type="button" role="option" aria-selected={idx === active} id={`tr-gs-${idx}`}
              className={`tr-gsearch-item ${idx === active ? 'tr-gsearch-item-on' : ''}`}
              onMouseEnter={() => setActive(idx)} onClick={() => choose(it)}>
              <span className="tr-gsearch-icon"><it.Icon size={15} /></span>
              <span className="tr-gsearch-text"><strong>{it.title}</strong><span>{it.sub}</span></span>
              {it.tag ? <span className={`tr-gsearch-tag ${it.tag === 'Today' ? 'tr-gsearch-tag-today' : ''}`}>{it.tag}</span> : null}
            </button>
          );
        })}
      </div>
    ));
  }

  return (
    <>
      <div className="tr-gsearch" ref={wrapRef}>
        <div className="tr-gsearch-box">
          <Search size={15} aria-hidden="true" />
          <input ref={inputRef} type="search" value={q} placeholder={placeholder} aria-label="Search" autoComplete="off" spellCheck={false}
            role="combobox" aria-expanded={open && !!q.trim()} aria-controls="tr-gsearch-list" aria-activedescendant={open && flat.length ? `tr-gs-${active}` : undefined}
            onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => { setOpen(true); load(); }} onKeyDown={onKeyDown} />
          <kbd aria-hidden="true">/</kbd>
        </div>
        {open && q.trim() ? <div className="tr-gsearch-pop" id="tr-gsearch-list" role="listbox">{results()}</div> : null}
      </div>
      <button type="button" className="tr-icon-btn tr-gsearch-phone" aria-label="Search" onClick={() => { setOverlay(true); load(); }}><Search size={19} /></button>
      {overlay && (
        <div className="tr-search-overlay" role="dialog" aria-modal="true" aria-label="Search">
          <div className="tr-search-overlay-top">
            <div className="tr-gsearch-box tr-gsearch-box-phone">
              <Search size={17} aria-hidden="true" />
              <input ref={phoneInputRef} type="search" value={q} placeholder={placeholder} aria-label="Search" autoComplete="off" spellCheck={false}
                onChange={e => setQ(e.target.value)} onKeyDown={onKeyDown} />
            </div>
            <button type="button" className="tr-search-cancel" onClick={() => { setOverlay(false); setQ(''); }}>Cancel</button>
          </div>
          <div className="tr-search-overlay-body" role="listbox">{results()}</div>
        </div>
      )}
    </>
  );
}
