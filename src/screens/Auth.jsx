// Log in, sign up (from an invitation link) and reset password.
import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import { supabase } from '../supabaseClient.js';
import { fetchInvitePreview } from '../invites.js';
import { isNativeApp, PUBLIC_SITE_URL } from '../native.js';
import { readJoinToken } from '../data/auth.js';
import { Shell, Spinner } from '../components/ui.jsx';

export function AuthScreen() {
  const [joinToken] = useState(readJoinToken);
  const [invite, setInvite] = useState(joinToken ? { loading: true } : null); // null = no link
  const [mode, setMode] = useState(joinToken ? 'signup' : 'login');
  const [email, setEmail] = useState('');
  const [passwordState, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);
  // Android's autofill can fill these boxes without telling React, so login
  // reads what's actually in the boxes at the moment you tap the button.
  const emailInputRef = useRef(null);
  const pwInputRef = useRef(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!joinToken) return;
    fetchInvitePreview(joinToken).then(res => {
      setInvite(res);
      if (res && res.valid) setDisplayName(res.inviteeName || '');
      else setMode('login');
    });
  }, [joinToken]);

  const canSignUp = !!(invite && invite.valid);

  async function submit() {
    setError(''); setNotice('');
    const typedEmail = (emailInputRef.current && emailInputRef.current.value) || email;
    const password = (pwInputRef.current && pwInputRef.current.value) || passwordState;
    // Keep what's on screen and what the app knows the same from here on.
    if (typedEmail !== email) setEmail(typedEmail);
    if (password !== passwordState) setPassword(password);
    // Phone keyboards can add capitals or spaces; email addresses ignore both.
    const mail = typedEmail.trim().toLowerCase();
    if (!mail || !password) { setError('Enter an email and password.'); return; }
    setBusy(true);
    try {
      if (mode === 'signup') {
        if (!canSignUp) { setError('You need an invitation link to create an account.'); return; }
        if (displayName.trim().split(/\s+/).filter(Boolean).length < 2) { setError('Enter your first and last name.'); return; }
        if (password.length < 6) { setError('Password needs to be at least 6 characters.'); return; }
        const { data, error: signErr } = await supabase.auth.signUp({
          email: mail,
          password,
          // Only the invitation is sent; the database works out the team from it.
          options: { data: { display_name: displayName.trim(), invite_token: joinToken } },
        });
        if (signErr) {
          setError(/database error/i.test(signErr.message)
            ? "This invitation link can't be used anymore. Ask the person who invited you for a new one."
            : signErr.message);
          return;
        }
        // Supabase answers "success" without creating anything when the
        // email already has an account (the invitation isn't used).
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setError('An account with this email already exists. Choose "I already have one" to log in.');
          return;
        }
        // The link is used up now; drop it from the address bar.
        window.history.replaceState({}, '', window.location.pathname);
        if (!data.session) {
          setNotice('Account created. Check your email to confirm it, then log in.');
          setInvite(null);
          setMode('login');
        }
      } else {
        let { error: loginErr } = await supabase.auth.signInWithPassword({ email: mail, password });
        // An autofilled or predicted password sometimes picks up a space at
        // the start or end; if the exact one fails, try it without.
        if (loginErr && password !== password.trim()) {
          ({ error: loginErr } = await supabase.auth.signInWithPassword({ email: mail, password: password.trim() }));
        }
        if (loginErr) {
          setError(/invalid login credentials/i.test(loginErr.message)
            ? "That email and password don't match. Tap the eye to check what's typed (watch for autofill), or use \"Forgot password?\"."
            : loginErr.message);
          return;
        }
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  async function forgotPassword() {
    setError(''); setNotice('');
    const mail = email.trim();
    if (!mail) { setError('Enter your email above first, then click "Forgot password?".'); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(mail, {
      redirectTo: isNativeApp() ? PUBLIC_SITE_URL : window.location.origin,
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setNotice('Check your email for a link to reset your password.');
  }
  function handleKeyDown(e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } }

  const inviteProblem = invite && !invite.loading && !invite.valid
    ? (invite.reason === 'used' ? 'This invitation link has already been used to create an account.'
      : invite.reason === 'expired' ? 'This invitation link has expired.'
      : invite.reason === 'error' ? "We couldn't check your invitation. Check your connection and reload this page."
      : "This invitation link isn't valid.")
    : '';
  const teamLine = canSignUp
    ? [invite.uplineName, ...(invite.aboveUpline || [])].filter(Boolean).join(' → ')
    : '';

  return (
    <Shell>
      <div className="tr-auth-wrap">
        <div className="tr-auth-card" onKeyDown={handleKeyDown}>
          <div className="tr-brand tr-brand-center"><ShieldCheck size={22} /> <span>Pace<em>Ledger</em></span></div>
          <p className="tr-auth-sub">{canSignUp ? 'You\'ve been invited to PaceLedger. Create your account to get started.' : 'Appointment-setting pace tracking for advisors and managers.'}</p>
          {canSignUp && (
            <div className="tr-tabs">
              <button className={`tr-tab ${mode === 'signup' ? 'tr-tab-active' : ''}`} onClick={() => { setMode('signup'); setError(''); setNotice(''); }}>Create account</button>
              <button className={`tr-tab ${mode === 'login' ? 'tr-tab-active' : ''}`} onClick={() => { setMode('login'); setError(''); setNotice(''); }}>I already have one</button>
            </div>
          )}
          {invite && invite.loading ? <Spinner label="Checking your invitation…" /> : (
          <div className="tr-auth-form">
            {inviteProblem && (
              <div className="tr-error" style={{ marginTop: 0 }}>{inviteProblem}{invite.reason === 'error' ? '' : ' Ask the person who invited you to send a new link.'}</div>
            )}
            {mode === 'signup' && canSignUp && (
              <div className="tr-join-box">
                <div>You're joining <strong>{invite.uplineName}</strong>'s team.</div>
                {invite.aboveUpline && invite.aboveUpline.length > 0 && (
                  <div className="tr-join-chain">{teamLine}</div>
                )}
              </div>
            )}
            {mode === 'signup' && (
              <label className="tr-field">
                <span>First and last name</span>
                <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Jordan Blake" autoComplete="name" />
              </label>
            )}
            <label className="tr-field">
              <span>Email</span>
              <input ref={emailInputRef} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jordan@yourcompany.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="email" />
            </label>
            <label className="tr-field">
              <span>Password</span>
              <div className="tr-pw-wrap">
                <input
                  ref={pwInputRef} type={showPw ? 'text' : 'password'} value={passwordState} onChange={e => setPassword(e.target.value)}
                  autoCapitalize="none" autoCorrect="off" spellCheck={false}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
                <button type="button" className="tr-pw-toggle" onClick={e => { e.preventDefault(); setShowPw(v => !v); }}
                  aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw}>
                  {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            {mode === 'login' && (
              <button type="button" className="tr-link-btn" onClick={forgotPassword} disabled={busy}>Forgot password?</button>
            )}
            {notice && <div className="tr-badge tr-badge-weekday">{notice}</div>}
            {error && <div className="tr-error">{error}</div>}
            <button type="button" className="tr-btn tr-btn-brass tr-btn-block" onClick={submit} disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? <><LogIn size={16} /> Log in</> : <><UserPlus size={16} /> Create account</>}
            </button>
            {!canSignUp && (
              <p className="tr-auth-invite-note">New to PaceLedger? Accounts are by invitation only. Ask the person recruiting you for your sign-up link.</p>
            )}
          </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

export function ResetPasswordScreen({ onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (password.length < 6) { setError('Password needs to be at least 6 characters.'); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) { setError(err.message); return; }
    onDone();
  }
  function handleKeyDown(e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } }

  return (
    <Shell>
      <div className="tr-auth-wrap">
        <div className="tr-auth-card" onKeyDown={handleKeyDown}>
          <div className="tr-brand tr-brand-center"><ShieldCheck size={22} /> <span>Pace<em>Ledger</em></span></div>
          <p className="tr-auth-sub">Set a new password for your account.</p>
          <div className="tr-auth-form">
            <label className="tr-field">
              <span>New password</span>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
            </label>
            <label className="tr-field">
              <span>Confirm new password</span>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} />
            </label>
            {error && <div className="tr-error">{error}</div>}
            <button type="button" className="tr-btn tr-btn-brass tr-btn-block" onClick={submit} disabled={busy}>
              {busy ? 'Saving…' : 'Set new password'}
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}
