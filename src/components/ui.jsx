// Shared building blocks: page layout, headers, loading skeletons, modals, badges and small controls.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, DollarSign, Info, Loader2, MoreHorizontal, RefreshCw, UserPlus } from 'lucide-react';
import { CSS } from '../styles.js';
import { joinedDate, weekLabel } from '../lib/dates.js';
import { isRecruitType, isSaleType, STATUS_OPTIONS } from '../data/appointments.js';

// "Reports to Sam · Joined 08/26/2026" under a team member's name.
export function MemberSubline({ member }) {
  return (
    <div className="tr-tenure">
      {member.reports_to_name ? <>Reports to {member.reports_to_name} · </> : null}Joined {joinedDate(member.created_at)}
    </div>
  );
}

// ---------------------------------------------------------------------
// shell / shared UI
// ---------------------------------------------------------------------
export function Shell({ children }) {
  return (
    <div className="tr-root">
      <style>{CSS}</style>
      {children}
    </div>
  );
}

// One consistent page title row: title, an optional one-line summary,
// and the page's main action(s) on the right.
export function PageHead({ title, sub, children }) {
  return (
    <div className="tr-pagehead">
      <div className="tr-pagehead-text">
        <h2 className="tr-h2">{title}</h2>
        {sub ? <p className="tr-pagehead-sub">{sub}</p> : null}
      </div>
      {children ? <div className="tr-pagehead-actions">{children}</div> : null}
    </div>
  );
}

// Closes a popover on a tap outside it or Escape.
function useDismiss(open, setOpen, ref) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, setOpen, ref]);
}

// Keeps a popover inside the screen: shifts it left when it would run off
// the right edge.
function useInScreen(open, wrapRef, popRef) {
  useLayoutEffect(() => {
    const pop = popRef.current; const wrap = wrapRef.current;
    if (!open || !pop || !wrap) return;
    pop.style.left = '0px';
    const r = pop.getBoundingClientRect();
    const over = r.right - (window.innerWidth - 12);
    const under = 12 - (r.left - Math.max(0, over));
    pop.style.left = `${-Math.max(0, over) + Math.max(0, under)}px`;
  }, [open, wrapRef, popRef]);
}

// ⓘ next to a heading: the explanation that used to sit under it as a gray
// paragraph, shown on tap.
export function InfoTip({ label = 'About this', children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const popRef = useRef(null);
  const id = useId();
  useDismiss(open, setOpen, ref);
  useInScreen(open, ref, popRef);
  return (
    <span className="tr-info" ref={ref}>
      <button type="button" className="tr-info-btn" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}>
        <Info size={16} aria-hidden="true" />
      </button>
      {open ? <span ref={popRef} id={id} role="note" className="tr-info-pop">{children}</span> : null}
    </span>
  );
}

// A screen or section title with its ⓘ explanation.
export function TitleInfo({ title, info, as: Tag = 'h2', className = 'tr-h2', id }) {
  return (
    <div className="tr-titleline">
      <Tag className={className} id={id}>{title}</Tag>
      {info ? <InfoTip label={`About ${typeof title === 'string' ? title : 'this'}`}>{info}</InfoTip> : null}
    </div>
  );
}

export function RefreshButton({ onClick }) {
  return (
    <button type="button" className="tr-icon-btn tr-icon-btn-line" onClick={onClick} aria-label="Refresh" title="Refresh">
      <RefreshCw size={15} aria-hidden="true" />
    </button>
  );
}

// ⋯ with the less common actions for a row (undo, a second email...).
// items: [{ label, onClick, disabled }]; empty items show a spacer so the
// rows still line up.
export function MoreMenu({ items, label = 'More actions' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(open, setOpen, ref);
  const list = (items || []).filter(Boolean);
  if (!list.length) return <span className="tr-more-spacer" aria-hidden="true" />;
  return (
    <span className="tr-more" ref={ref}>
      <button type="button" className="tr-icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(v => !v)}>
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {open ? (
        <span role="menu" className="tr-more-pop">
          {list.map(it => (
            <button key={it.label} type="button" role="menuitem" className="tr-more-item" disabled={it.disabled}
              onClick={() => { setOpen(false); it.onClick(); }}>{it.label}</button>
          ))}
        </span>
      ) : null}
    </span>
  );
}

// True on phone-sized screens; follows rotation and window resizing.
const PHONE_QUERY = '(max-width: 640px)';
export function useIsPhone() {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(PHONE_QUERY).matches);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(PHONE_QUERY);
    const on = () => setPhone(mq.matches);
    on();
    if (mq.addEventListener) { mq.addEventListener('change', on); return () => mq.removeEventListener('change', on); }
    mq.addListener(on); return () => mq.removeListener(on);
  }, []);
  return phone;
}

// A sheet that slides up from the bottom of the screen (phones). Tapping
// outside doesn't close it, so nothing typed is lost; Escape or the
// sheet's own close button does.
export function Sheet({ labelledBy, onClose, children }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = e => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, []);
  return createPortal(
    <div className="tr-fsheet-backdrop">
      <div ref={ref} className="tr-fsheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <div className="tr-fsheet-grab" aria-hidden="true" />
        {children}
      </div>
    </div>,
    document.querySelector('.tr-root') || document.body,
  );
}

export function Spinner({ label }) {
  return (
    <div className="tr-spinner">
      <Loader2 className="tr-spin" size={18} />
      <span>{label}</span>
    </div>
  );
}

// Skeleton loading shapes — matches the shape of what's about to appear so
// the app feels like it's already loading the right thing, rather than a
// generic spinner with no relationship to the content.
export function SkelBlock({ w, h, style }) {
  return <div className="tr-skel" style={{ width: w, height: h, ...style }} />;
}

export function SkeletonRows({ count = 4 }) {
  return (
    <div className="tr-card">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="tr-skel-row">
          <SkelBlock w="70px" h="14px" />
          <div style={{ flex: 1 }}>
            <SkelBlock w="55%" h="13px" style={{ marginBottom: 6 }} />
            <SkelBlock w="35%" h="11px" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 5 }) {
  return (
    <div className="tr-card">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="tr-skel-row">
          {Array.from({ length: cols }).map((_, c) => (
            <SkelBlock key={c} w={c === 0 ? '110px' : '60px'} h="12px" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 2 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="tr-card">
          <SkelBlock w="40%" h="15px" style={{ marginBottom: 10 }} />
          <SkelBlock w="70%" h="12px" style={{ marginBottom: 8 }} />
          <SkelBlock w="55%" h="12px" />
        </div>
      ))}
    </>
  );
}

export function SkeletonCalendar() {
  return (
    <div className="tr-card tr-cal-card">
      <div className="tr-cal-grid">
        {Array.from({ length: 7 }).map((_, i) => <div key={i} className="tr-cal-headcell"><SkelBlock w="24px" h="10px" style={{ margin: '0 auto' }} /></div>)}
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="tr-cal-day"><SkelBlock w="16px" h="12px" /></div>
        ))}
      </div>
    </div>
  );
}

// Manager/admin switch between their own work and the team views.
export function GroupSwitch({ group, onSelect, teamLabel }) {
  return (
    <div className="tr-groupswitch" role="tablist" aria-label="Workspace">
      <button type="button" role="tab" aria-selected={group === 'mine'} className={group === 'mine' ? 'tr-groupswitch-on' : ''} onClick={() => onSelect('mine')}>My work</button>
      <button type="button" role="tab" aria-selected={group === 'team'} className={group === 'team' ? 'tr-groupswitch-on' : ''} onClick={() => onSelect('team')}>{teamLabel}</button>
    </div>
  );
}

export function WeekNav({ weekMonday, onShift, onToday }) {
  return (
    <div className="tr-weeknav">
      <button className="tr-icon-btn" onClick={() => onShift(-1)} title="Previous week"><ChevronLeft size={18} /></button>
      <div className="tr-weeknav-label"><CalendarDays size={16} /><span>Week of {weekLabel(weekMonday)}</span></div>
      <button className="tr-icon-btn" onClick={() => onShift(1)} title="Next week"><ChevronRight size={18} /></button>
      <button className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onToday}>This week</button>
    </div>
  );
}

export function StatusChip({ status }) {
  const opt = STATUS_OPTIONS.find(o => o.value === status);
  if (!opt || !opt.value) return null;
  return <span className={`tr-status tr-status-${opt.color}`}>{opt.label}</span>;
}

// Icon + text, never color alone — a colored border stripe elsewhere is a
// nice-to-have accent, but this badge is what actually conveys recruit vs
// sale to anyone who can't distinguish the two colors.
export function TypeBadge({ appt }) {
  const r = isRecruitType(appt), s = isSaleType(appt);
  if (!r && !s) return null;
  if (r && s) return <span className="tr-type-badge tr-type-badge-both"><UserPlus size={11} /><DollarSign size={11} /> Recruit &amp; Sale</span>;
  if (r) return <span className="tr-type-badge tr-type-badge-recruit"><UserPlus size={11} /> Recruit</span>;
  return <span className="tr-type-badge tr-type-badge-sale"><DollarSign size={11} /> Sale</span>;
}

// ---------------------------------------------------------------------
// appointment form
// ---------------------------------------------------------------------
export function openPicker(e) {
  if (typeof e.target.showPicker === 'function') {
    try { e.target.showPicker(); } catch { /* unsupported in this browser, ignore */ }
  }
}

// ---------------------------------------------------------------------
// follow-up — quick, tap-to-answer questions for past appointments
// ---------------------------------------------------------------------
// A window over the screen. It takes the keyboard focus when it opens (so
// Escape closes it) and gives it back to whatever had it when it closes.
export function Modal({ onClose, children, className = '', labelledBy }) {
  const card = useRef(null);
  useEffect(() => {
    const before = document.activeElement;
    const el = card.current;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
    return () => { if (before && before.isConnected && typeof before.focus === 'function') before.focus({ preventScroll: true }); };
  }, []);
  function handleKeyDown(e) { if (e.key === 'Escape') onClose(); }
  return (
    <div className="tr-modal-backdrop" onClick={onClose} onKeyDown={handleKeyDown} tabIndex={-1}>
      <div ref={card} className={`tr-modal-card ${className}`} onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}>{children}</div>
    </div>
  );
}

export function PillChoice({ options, value, onChange }) {
  return (
    <div className="tr-pillrow">
      {options.map(opt => (
        <button
          key={opt.value} type="button"
          className={`tr-pill-btn ${value === opt.value ? 'tr-pill-btn-active' : ''}`}
          onClick={() => onChange(opt.value)}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function TypeFilter({ value, onChange }) {
  return (
    <div className="tr-seg" role="group" aria-label="Show">
      {[['all', 'All'], ['recruit', 'Recruits'], ['sale', 'Sales']].map(([v, label]) => (
        <button key={v} type="button" className={value === v ? 'tr-seg-on' : ''} aria-pressed={value === v} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

export function TypeChoice({ recruit, sale, onToggleRecruit, onToggleSale }) {
  return (
    <div className="tr-pillrow">
      <button type="button" className={`tr-pill-btn tr-pill-recruit ${recruit ? 'tr-pill-btn-active-recruit' : ''}`} onClick={onToggleRecruit}>Recruit</button>
      <button type="button" className={`tr-pill-btn tr-pill-sale ${sale ? 'tr-pill-btn-active-sale' : ''}`} onClick={onToggleSale}>Sale</button>
    </div>
  );
}

// One-tap Email for anyone with an email saved.
export function ProgressRing({ done, total, size = 58, stroke = 6, children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, done / total) : 1;
  return (
    <div className="tr-ring" style={{ width: size, height: size }} role="img" aria-label={`${done} of ${total} done`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--paper-dim)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={pct >= 1 ? 'var(--green)' : 'var(--brass)'} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="tr-ring-arc" />
      </svg>
      <div className="tr-ring-label">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------
// manager view
// ---------------------------------------------------------------------
export function StatusBadge({ status }) {
  const map = { met: ['On pace', 'green'], missed: ['Missed', 'rust'], progress: ['In progress', 'amber'] };
  const [label, tone] = map[status];
  return <span className={`tr-status tr-status-${tone}`}>{label}</span>;
}

export function MiniBar({ count, target }) {
  const pct = Math.min(100, Math.round((count / target) * 100));
  return (
    <div className="tr-minibar-wrap">
      <div className="tr-minibar-track"><div className="tr-minibar-fill" style={{ width: `${pct}%` }} /></div>
      <span className="tr-mono tr-minibar-num">{count}/{target}</span>
    </div>
  );
}
