// The top bar and the Your account sheet.
import { useEffect, useState } from 'react';
import { LogOut, ShieldCheck, UserPlus, X } from 'lucide-react';
import { createInvite } from '../invites.js';
import { fetchMyOnboarding, onboardingDay, setOnboardingVisibility, shouldShowOnboarding } from '../onboarding.js';
import { PUBLIC_SITE_URL } from '../native.js';
import { deleteMyAccount, signOut } from '../data/auth.js';
import { InviteShare } from './invites.jsx';

// The navy band at the top: brand + account on one row, and (when a view
// passes `nav`) the section tabs on a second row, so navigation reads as
// part of the frame rather than floating over the page.
export function Header({ user, nav }) {
  const [accountOpen, setAccountOpen] = useState(false);
  return (
    <>
    <header className={`tr-header ${nav ? 'tr-header-with-nav' : ''}`}>
      <div className="tr-header-row">
        <div className="tr-brand"><ShieldCheck size={20} /> <span>Pace<em>Ledger</em></span></div>
        <div className="tr-header-user">
          <button type="button" className="tr-header-account" onClick={() => setAccountOpen(true)} title="Your account">
            <span className="tr-header-name">{user.displayName}</span>
            <span className="tr-header-firstname">{(user.displayName || '').trim().split(/\s+/)[0]}</span>
            <span className="tr-header-role">{user.role === 'super_admin' ? 'Admin' : user.role}</span>
          </button>
          <button className="tr-icon-btn" onClick={signOut} title="Log out" aria-label="Log out"><LogOut size={16} /></button>
        </div>
      </div>
      {nav ? <div className="tr-header-nav">{nav}</div> : null}
    </header>
    {/* Outside the header so header styles and stacking don't apply to it. */}
    {accountOpen && <AccountSheet user={user} onClose={() => setAccountOpen(false)} />}
    </>
  );
}

// Invite anyone onto your own team (for recruits who aren't tied to a
// logged appointment). The link is personal, single-use and puts them
// directly under you.
export function InviteSomeone({ user }) {
  const [open, setOpen] = useState(false);
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
            <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => setOpen(false)}>Cancel</button>
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

export function AccountSheet({ user, onClose }) {
  const [step, setStep] = useState('view'); // 'view' | 'confirm'
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function handleDelete() {
    setBusy(true); setError('');
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
        <dl className="tr-account-list">
          <div><dt>Name</dt><dd>{user.displayName}</dd></div>
          <div><dt>Email</dt><dd>{user.email || '—'}</dd></div>
          <div><dt>Role</dt><dd style={{ textTransform: 'capitalize' }}>{user.role === 'super_admin' ? 'Admin' : user.role}</dd></div>
        </dl>
        <div className="tr-account-links">
          <a href={`${PUBLIC_SITE_URL}/privacy-policy.html`} target="_blank" rel="noopener noreferrer">Privacy policy</a>
          <a href={`${PUBLIC_SITE_URL}/terms-of-service.html`} target="_blank" rel="noopener noreferrer">Terms of service</a>
          <a href={`${PUBLIC_SITE_URL}/support.html`} target="_blank" rel="noopener noreferrer">Support</a>
        </div>
        <OnboardingToggle user={user} />
        <InviteSomeone user={user} />
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-block" onClick={signOut}><LogOut size={15} /> Log out</button>

        <div className="tr-account-danger">
          {step === 'view' ? (
            <button type="button" className="tr-link-danger" onClick={() => setStep('confirm')}>Delete my account</button>
          ) : (
            <>
              <h4 className="tr-h4" style={{ color: 'var(--rust)' }}>Delete your account permanently</h4>
              <p className="tr-account-warn">
                This deletes your login and everything you've added: appointments, prospects, follow-up notes, your business plan,
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
