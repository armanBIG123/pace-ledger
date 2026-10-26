// The top bar and the Your account sheet.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CalendarClock, CalendarDays, ChevronDown, LifeBuoy, LogOut, Plus, ShieldCheck, UserPlus, UserRound, X } from 'lucide-react';
import { createInvite } from '../invites.js';
import { fetchMyOnboarding, onboardingDay, setOnboardingVisibility, shouldShowOnboarding } from '../onboarding.js';
import { isNativeApp, PUBLIC_SITE_URL } from '../native.js';
import { disconnectZoom, fetchZoomConnectionStatus, startZoomConnect } from '../data/integrations.js';
import { deleteMyAccount, signOut } from '../data/auth.js';
import { fetchMyLicensing, updateMyProfile } from '../data/team.js';
import { avatarUrl, removeAllMyAvatarFiles } from '../data/avatars.js';
import { InviteShare } from './invites.jsx';
import { ProfilePhoto } from './profilePhoto.jsx';
import { isGalaxyAdmin, roleLabel } from '../lib/roles.js';
import { askConfirm } from './confirm.jsx';
import { ConnectionsSheet, presentsForTeam } from './connections.jsx';

// True when the top bar's row is wider than the screen (only with very
// large phone text): then the PaceLedger wordmark steps aside (the shield
// stays) so the buttons stay on screen. Checks again when the bar or
// anything in it changes size.
function useHeaderFits(ref) {
  const [tight, setTight] = useState(false);
  const overflowing = () => {
    const el = ref.current;
    if (!el) return false;
    const right = el.getBoundingClientRect().right;
    return el.scrollWidth > el.clientWidth + 1 || [...el.querySelectorAll('button')].some(b => b.getBoundingClientRect().right > right + 1);
  };
  useLayoutEffect(() => { if (!tight && overflowing()) setTight(true); });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (overflowing()) setTight(true); }).catch(() => {});
    if (typeof ResizeObserver === 'undefined') return undefined;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => { if (el.clientWidth > w + 24) setTight(false); else if (overflowing()) setTight(true); w = el.clientWidth; });
    // The row, and what's in it (the name or text size can change too).
    [el, ...el.children].forEach(c => ro.observe(c));
    return () => ro.disconnect();
  }, [ref]); // eslint-disable-line react-hooks/exhaustive-deps
  return tight;
}

// The navy band at the top: brand, search, + New and account on one row,
// and (when a view passes `nav`) the section tabs on a second row, so
// navigation reads as part of the frame rather than floating over the page.
// `search` is the view's search box; `onNew` opens its + New menu (on a
// phone, + New lives in the bottom bar instead).
export function Header({ user, nav, search, onNew, chat }) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [connOpen, setConnOpen] = useState(false);
  const [focusName, setFocusName] = useState(false);
  const rowRef = useRef(null);
  const tight = useHeaderFits(rowRef);
  // Other screens can open Your account (e.g. Today's "Add your last name"),
  // and Calendar & Zoom.
  useEffect(() => {
    const open = e => { setFocusName(!!(e.detail && e.detail.focus === 'name')); setAccountOpen(true); };
    const conn = () => setConnOpen(true);
    window.addEventListener('paceledger:open-account', open);
    window.addEventListener('paceledger:open-connections', conn);
    return () => { window.removeEventListener('paceledger:open-account', open); window.removeEventListener('paceledger:open-connections', conn); };
  }, []);
  return (
    <>
    <header className={`tr-header ${nav ? 'tr-header-with-nav' : ''}`}>
      <div className={`tr-header-row ${tight ? 'tr-header-tight' : ''}`} ref={rowRef}>
        <div className="tr-brand"><ShieldCheck size={20} /> <span>Pace<em>Ledger</em></span></div>
        {search || null}
        <div className="tr-header-user">
          {chat || null}
          {onNew ? <button type="button" className="tr-btn tr-btn-brass tr-btn-sm tr-header-new" onClick={onNew} aria-haspopup="menu"><Plus size={15} /> New</button> : null}
          <AccountMenu user={user}
            onProfile={() => { setFocusName(false); setAccountOpen(true); }}
            onConnections={() => setConnOpen(true)} />
        </div>
      </div>
      {nav ? <div className="tr-header-nav">{nav}</div> : null}
    </header>
    {/* Outside the header so header styles and stacking don't apply to it. */}
    {accountOpen && <AccountSheet user={user} focusName={focusName} onClose={() => setAccountOpen(false)} onConnections={() => { setAccountOpen(false); setConnOpen(true); }} />}
    {connOpen && <ConnectionsSheet user={user} onClose={() => setConnOpen(false)} onEditHours={() => window.dispatchEvent(new Event('paceledger:edit-presenting-hours'))} />}
    </>
  );
}

const initialsOf = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();

// Your name in the top bar opens this menu: your profile, Calendar & Zoom,
// presenting hours, help, and Sign out (which used to be an icon right next
// to Chat, one slip away).
function AccountMenu({ user, onProfile, onConnections }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const button = useRef(null);
  const items = useRef([]);
  const first = (user.displayName || '').trim().split(/\s+/)[0];
  useEffect(() => {
    if (!open) return undefined;
    const away = e => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); if (button.current) button.current.focus(); return; }
      const list = items.current.filter(Boolean);
      const i = list.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); (list[(i + 1) % list.length] || list[0]).focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); (list[(i - 1 + list.length) % list.length] || list[list.length - 1]).focus(); }
      if (e.key === 'Home') { e.preventDefault(); list[0] && list[0].focus(); }
      if (e.key === 'End') { e.preventDefault(); list[list.length - 1] && list[list.length - 1].focus(); }
      if (e.key === 'Tab') setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    // The first item has the focus, for the keyboard.
    const t = setTimeout(() => { const f = items.current.filter(Boolean)[0]; if (f) f.focus({ preventScroll: true }); }, 0);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); clearTimeout(t); };
  }, [open]);
  items.current = [];
  const item = (label, Icon, onClick, extra = {}) => (
    <button type="button" role="menuitem" className={`tr-acct-item ${extra.danger ? 'tr-acct-item-danger' : ''}`} ref={el => items.current.push(el)}
      onClick={() => { setOpen(false); onClick(); }}>
      <Icon size={16} aria-hidden="true" /><span>{label}</span>
    </button>
  );
  return (
    <div className="tr-acct" ref={wrap}>
      <button ref={button} type="button" className="tr-header-account" aria-haspopup="menu" aria-expanded={open} aria-controls="tr-acct-menu"
        onClick={() => setOpen(v => !v)} title="Your account">
        {user.avatarPath
          ? <img className="tr-header-avatar" src={avatarUrl(user.avatarPath)} alt="" aria-hidden="true" />
          : <span className="tr-header-initials" aria-hidden="true">{initialsOf(user.displayName)}</span>}
        <span className="tr-header-name">{user.displayName}</span>
        <span className="tr-header-firstname">{first}</span>
        <span className="tr-header-role">{roleLabel(user.role)}</span>
        <ChevronDown size={14} className="tr-acct-chev" aria-hidden="true" />
      </button>
      {open ? (
        <div className="tr-acct-menu" id="tr-acct-menu" role="menu" aria-label="Your account">
          <div className="tr-acct-who">
            <strong>{user.displayName}</strong>
            <span>{user.email}{user.email ? ' · ' : ''}{roleLabel(user.role)}</span>
          </div>
          {item('My profile', UserRound, onProfile)}
          {item('Calendar & Zoom', CalendarDays, onConnections)}
          {presentsForTeam(user) ? item('Presenting hours', CalendarClock, () => window.dispatchEvent(new Event('paceledger:edit-presenting-hours'))) : null}
          <a role="menuitem" className="tr-acct-item" ref={el => items.current.push(el)} href={`${PUBLIC_SITE_URL}/support.html`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
            <LifeBuoy size={16} aria-hidden="true" /><span>Help &amp; support</span>
          </a>
          <div className="tr-acct-sep" role="separator" />
          {item('Sign out', LogOut, signOut, { danger: true })}
        </div>
      ) : null}
    </div>
  );
}

// Invite anyone onto your own team (for recruits who aren't tied to a
// logged appointment). The link is personal, single-use and puts them
// directly under you.
export function InviteSomeone({ user, startOpen = false, onCancel }) {
  const [open, setOpen] = useState(startOpen);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function make() {
    setBusy(true); setErr('');
    const res = await createInvite({ uplineId: user.id, createdBy: user.id, inviteeName: name });
    setBusy(false);
    if (!res.ok) { setErr("Couldn't create the link. Try again."); return; }
    setInvite(res.invite);
  }
  if (!open) {
    return <button type="button" className="tr-btn tr-btn-ghost tr-btn-block" style={{ marginBottom: 8 }} onClick={() => setOpen(true)}><UserPlus size={15} /> Invite someone to your team</button>;
  }
  return (
    <div className="tr-invite-box" style={{ marginBottom: 12 }}>
      <div className="tr-invite-title">Invite someone to your team</div>
      {invite ? (
        <>
          <p className="tr-empty" style={{ margin: 0 }}>Send this to {invite.invitee_name || 'them'}. It puts them directly under you.</p>
          <InviteShare key={invite.id} invite={invite} recruitName={invite.invitee_name} defaultEmail={email} />
          <button type="button" className="tr-link-btn" style={{ marginTop: 6 }} onClick={() => { setInvite(null); setName(''); setEmail(''); }}>Invite someone else</button>
        </>
      ) : (
        <>
          <label className="tr-field">
            <span>Their name (optional)</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Jordan Blake" />
          </label>
          <label className="tr-field">
            <span>Their email (optional, to email them the link)</span>
            <input type="email" inputMode="email" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={email} onChange={e => setEmail(e.target.value)} placeholder="jordan@example.com" />
          </label>
          {err && <div className="tr-error">{err}</div>}
          <div className="tr-form-actions" style={{ marginTop: 8 }}>
            <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => { setOpen(false); if (onCancel) onCancel(); }}>Cancel</button>
            <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={make} disabled={busy}>{busy ? 'Creating…' : 'Create link'}</button>
          </div>
        </>
      )}
    </div>
  );
}

// Your account: turn the First 30 days checklist on Today on or off.
export function OnboardingToggle({ user }) {
  const [row, setRow] = useState(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetchMyOnboarding(user.id).then(r => setRow(r && !r.error ? r : null)); }, [user.id]);
  if (row === undefined) return null;
  const day = onboardingDay(user.createdAt);
  const vis = (row && row.visibility) || 'auto';
  const allDone = !!(row && row.total_count > 0 && !row.next_step);
  const showing = shouldShowOnboarding(day, vis, allDone);
  async function flip() {
    setBusy(true);
    const next = showing ? 'hidden' : 'shown';
    if (await setOnboardingVisibility(user.id, next)) setRow(r => ({ ...(r || {}), visibility: next }));
    setBusy(false);
  }
  return (
    <div className="tr-account-toggle">
      <div>
        <div className="tr-account-toggle-title">First 30 days checklist</div>
        <div className="tr-account-toggle-sub">The step-by-step guide for new advisors on Today.</div>
      </div>
      <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={flip} disabled={busy}>{showing ? 'Hide' : 'Show on Today'}</button>
    </div>
  );
}

// Zoom: connected or not, with Connect / Disconnect (the same as the
// reminder on Pipeline → Appointments).
function ZoomAccountRow() {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => fetchZoomConnectionStatus().then(setSt).catch(() => setSt({ connected: false }));
  useEffect(() => { load(); }, []);
  if (!st) return null;
  async function disconnect() {
    if (!(await askConfirm({ title: 'Disconnect Zoom?', body: "New appointments won't get their own meeting link until you connect it again.", confirmLabel: 'Disconnect', danger: true }))) return;
    setBusy(true);
    if (await disconnectZoom()) setSt({ connected: false });
    setBusy(false);
  }
  return (
    <div className="tr-account-toggle">
      <div>
        <div className="tr-account-toggle-title">Zoom</div>
        <div className="tr-account-toggle-sub">{st.connected ? `Connected as ${st.zoomEmail || 'your Zoom account'}. New appointments get their own meeting link.` : 'Not connected. Connect it and new appointments get their own meeting link.'}</div>
      </div>
      {st.connected
        ? <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={disconnect} disabled={busy}>Disconnect</button>
        : <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={() => { if (!isNativeApp()) setBusy(true); startZoomConnect(load); }} disabled={busy}>{busy ? 'Opening…' : 'Connect'}</button>}
    </div>
  );
}

// Your name, NPN (license number) and F&G writing number, editable by you.
// Saving updates the name everywhere it shows, and the same numbers as
// Milestones -> Licensing.
const words = s => (s || '').trim().split(/\s+/).filter(Boolean);
const cleanNpn = s => (s || '').replace(/[\s-]/g, '');

export function ProfileForm({ user, focusName }) {
  const [saved, setSaved] = useState(null); // { name, npn, fg }
  const [name, setName] = useState(user.displayName || '');
  const [npn, setNpn] = useState('');
  const [fg, setFg] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const nameRef = useRef(null);
  useEffect(() => {
    let alive = true;
    fetchMyLicensing(user.id).then(d => {
      if (!alive) return;
      const n = (d && d.npn) || '', f = (d && d.fg_writing_number) || '';
      setSaved({ name: user.displayName || '', npn: n, fg: f });
      setNpn(n); setFg(f);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);
  useEffect(() => {
    if (focusName && saved && nameRef.current) nameRef.current.focus();
  }, [focusName, saved]);

  const changed = !!saved && (name.trim() !== saved.name.trim() || cleanNpn(npn) !== cleanNpn(saved.npn) || fg.trim() !== saved.fg.trim());
  const oneWord = words(name).length < 2;

  async function save() {
    setError(''); setDone(false);
    if (oneWord) { setError('Enter your first and last name.'); if (nameRef.current) nameRef.current.focus(); return; }
    if (cleanNpn(npn) && !/^[0-9]+$/.test(cleanNpn(npn))) { setError('Your NPN is numbers only.'); return; }
    setBusy(true);
    const res = await updateMyProfile({ displayName: name, npn, fgWritingNumber: fg });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    const p = res.profile;
    const next = { name: p.display_name || name.trim(), npn: p.npn || '', fg: p.fg_writing_number || '' };
    setSaved(next); setName(next.name); setNpn(next.npn); setFg(next.fg);
    setDone(true);
    window.dispatchEvent(new CustomEvent('paceledger:profile-changed', { detail: p }));
    window.dispatchEvent(new Event('paceledger:onboarding-changed'));
  }

  return (
    <form className="tr-profile-form" onSubmit={e => { e.preventDefault(); if (changed && !busy) save(); }}>
      <label className="tr-field">
        <span>Name</span>
        <input ref={nameRef} value={name} onChange={e => { setName(e.target.value); setDone(false); setError(''); }} placeholder="First and last name" autoComplete="name" maxLength={80} />
        {oneWord && name.trim() ? <small className="tr-field-hint">Add your last name so your team can tell you apart.</small> : null}
      </label>
      <div className="tr-form-grid">
        <label className="tr-field">
          <span>NPN (license number)</span>
          <input value={npn} onChange={e => { setNpn(e.target.value); setDone(false); setError(''); }} placeholder={saved ? 'Not added yet' : 'Loading…'} inputMode="numeric" autoComplete="off" maxLength={20} disabled={!saved} />
        </label>
        <label className="tr-field">
          <span>F&amp;G writing number</span>
          <input value={fg} onChange={e => { setFg(e.target.value); setDone(false); setError(''); }} placeholder={saved ? 'Not added yet' : 'Loading…'} autoComplete="off" autoCapitalize="characters" maxLength={40} disabled={!saved} />
        </label>
      </div>
      {error && <div className="tr-error">{error}</div>}
      <div className="tr-profile-actions">
        {done && !changed ? <span className="tr-profile-saved" role="status">Saved</span> : null}
        <button type="submit" className="tr-btn tr-btn-brass tr-btn-sm" disabled={!changed || busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </form>
  );
}

export function AccountSheet({ user, focusName = false, onClose, onConnections = null }) {
  const [step, setStep] = useState('view'); // 'view' | 'confirm'
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function handleDelete() {
    setBusy(true); setError('');
    await removeAllMyAvatarFiles(user.id);
    const res = await deleteMyAccount();
    if (!res.ok) {
      setBusy(false);
      setError(res.error === 'last_admin'
        ? "You're the only admin. Make someone else an admin in Manage Team first, then delete your account."
        : "Your account couldn't be deleted. Check your connection and try again, or contact support.");
      return;
    }
    await signOut();
  }
  return (
    <div className="tr-modal-backdrop" onClick={onClose}>
      <div className="tr-modal-card tr-account" role="dialog" aria-modal="true" aria-labelledby="tr-account-title" onClick={e => e.stopPropagation()}>
        <div className="tr-row-head">
          <h3 className="tr-h3" id="tr-account-title" style={{ margin: 0 }}>Your account</h3>
          <button type="button" className="tr-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <ProfilePhoto user={user} />
        <ProfileForm user={user} focusName={focusName} />
        <dl className="tr-account-list">
          <div><dt>Email</dt><dd>{user.email || '—'}</dd></div>
          <div><dt>Role</dt><dd>{roleLabel(user.role)}</dd></div>
          {isGalaxyAdmin(user) && user.solarSystemName ? <div><dt>Solar system</dt><dd>{user.solarSystemName}</dd></div> : null}
        </dl>
        <div className="tr-account-links">
          <a href={`${PUBLIC_SITE_URL}/privacy-policy.html`} target="_blank" rel="noopener noreferrer">Privacy policy</a>
          <a href={`${PUBLIC_SITE_URL}/terms-of-service.html`} target="_blank" rel="noopener noreferrer">Terms of service</a>
          <a href={`${PUBLIC_SITE_URL}/support.html`} target="_blank" rel="noopener noreferrer">Support</a>
        </div>
        <OnboardingToggle user={user} />
        {onConnections ? (
          <div className="tr-account-toggle">
            <div>
              <div className="tr-account-toggle-title">Calendar &amp; Zoom</div>
              <div className="tr-account-toggle-sub">Google Calendar, Zoom{presentsForTeam(user) ? ' and your presenting hours' : ''}.</div>
            </div>
            <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onConnections}>Open</button>
          </div>
        ) : <ZoomAccountRow />}
        <InviteSomeone user={user} />
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-block" onClick={signOut}><LogOut size={15} /> Sign out</button>

        <div className="tr-account-danger">
          {step === 'view' ? (
            <button type="button" className="tr-link-danger" onClick={() => setStep('confirm')}>Delete my account</button>
          ) : (
            <>
              <h4 className="tr-h4" style={{ color: 'var(--rust)' }}>Delete your account permanently</h4>
              <p className="tr-account-warn">
                This deletes your login and everything you've added: your profile photo, appointments, prospects, follow-up notes, your business plan,
                client intake forms you sent, and your Google Calendar and Zoom connections. It can't be undone.
                Anyone who reports to you will move up to report to your upline.
              </p>
              <label className="tr-field">
                <span>Type DELETE to confirm</span>
                <input value={typed} onChange={e => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" />
              </label>
              {error && <div className="tr-error">{error}</div>}
              <div className="tr-form-actions">
                <button type="button" className="tr-btn tr-btn-ghost" onClick={() => { setStep('view'); setTyped(''); setError(''); }} disabled={busy}>Cancel</button>
                <button type="button" className="tr-btn tr-btn-danger" onClick={handleDelete} disabled={typed.trim().toUpperCase() !== 'DELETE' || busy}>
                  {busy ? 'Deleting…' : 'Delete my account'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
