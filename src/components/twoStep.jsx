// Two-step login for the contracting team: an authenticator app code on top
// of the password. The database and the edge function check it too; this
// is the screen that asks for it. It also locks after 15 minutes without a
// tap or keypress, and asks again 12 hours after the last code.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { supabase } from '../supabaseClient.js';

export const IDLE_LOCK_MS = 15 * 60 * 1000;
const FRESH_SECONDS = 12 * 3600;

let lastActive = Date.now();
const touch = () => { lastActive = Date.now(); };

function claimsOf(session) {
  try {
    const part = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4)));
  } catch {
    return {};
  }
}
export function twoStepFresh(session, nowSec = Math.floor(Date.now() / 1000)) {
  const c = session ? claimsOf(session) : {};
  return c.aal === 'aal2' && Array.isArray(c.amr) && c.amr.some(a => a && a.method === 'totp' && Number(a.timestamp) > nowSec - FRESH_SECONDS);
}

function CodeInput({ value, onChange, onDone, disabled }) {
  return (
    <input className="tr-2s-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]*"
      value={value} disabled={disabled} aria-label="6-digit code" placeholder="000000" autoFocus
      onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); onChange(v); if (v.length === 6 && onDone) onDone(v); }} />
  );
}

export function TwoStepGate({ children, title = 'Contracting' }) {
  const [state, setState] = useState('checking'); // checking | enroll | verify | ok
  const [locked, setLocked] = useState(false);
  const [factorId, setFactorId] = useState('');
  const [enrolling, setEnrolling] = useState(null); // { id, qr, secret }
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const stateRef = useRef(state);
  stateRef.current = state;

  const check = useCallback(async () => {
    setError('');
    const [{ data: f }, { data: s }] = await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.getSession()]);
    const verified = ((f && f.totp) || []).filter(x => x.status === 'verified');
    if (!verified.length) { setState('enroll'); return; }
    setFactorId(verified[0].id);
    const fresh = twoStepFresh(s && s.session) && Date.now() - lastActive < IDLE_LOCK_MS;
    setState(fresh ? 'ok' : 'verify');
  }, []);
  useEffect(() => { touch(); check(); }, [check]);

  // Lock after 15 minutes idle, or when the server says a fresh code is needed.
  useEffect(() => {
    const opts = { passive: true, capture: true };
    window.addEventListener('pointerdown', touch, opts);
    window.addEventListener('keydown', touch, opts);
    const lock = () => { if (stateRef.current === 'ok') { setLocked(true); setCode(''); setState('verify'); } };
    const t = setInterval(() => { if (Date.now() - lastActive >= IDLE_LOCK_MS) lock(); }, 20000);
    const onNeed = () => lock();
    window.addEventListener('paceledger:two-step-required', onNeed);
    return () => {
      window.removeEventListener('pointerdown', touch, opts);
      window.removeEventListener('keydown', touch, opts);
      window.removeEventListener('paceledger:two-step-required', onNeed);
      clearInterval(t);
    };
  }, []);

  async function startEnroll() {
    setBusy(true); setError('');
    const { data: f } = await supabase.auth.mfa.listFactors();
    for (const x of ((f && f.all) || []).filter(z => z.factor_type === 'totp' && z.status !== 'verified')) {
      await supabase.auth.mfa.unenroll({ factorId: x.id });
    }
    const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `PaceLedger ${new Date().toISOString().slice(0, 10)}` });
    setBusy(false);
    if (err || !data) { setError("Couldn't start setup. Try again."); return; }
    setEnrolling({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }
  async function verify(v = code) {
    const id = enrolling ? enrolling.id : factorId;
    if (!id || v.length !== 6 || busy) return;
    setBusy(true); setError('');
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code: v });
    setBusy(false);
    if (err) { setError("That code didn't work. Codes change every 30 seconds: try the newest one."); setCode(''); return; }
    touch();
    setLocked(false); setEnrolling(null); setCode('');
    setState('ok');
  }

  if (state === 'ok') return children;
  if (state === 'checking') return <div className="tr-card tr-2s"><p className="tr-empty">Checking…</p></div>;
  return (
    <div className="tr-card tr-2s" role="region" aria-labelledby="tr-2s-title">
      <span className="tr-2s-icon" aria-hidden="true">{state === 'enroll' ? <ShieldCheck size={22} /> : <Lock size={22} />}</span>
      {state === 'enroll' ? (
        <>
          <h2 id="tr-2s-title" className="tr-2s-title">Turn on two-step login</h2>
          <p className="tr-2s-text">{title} holds people's Social Security and bank numbers, so it needs a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy) every time you open it.</p>
          {!enrolling ? (
            <button type="button" className="tr-btn tr-btn-brass" disabled={busy} onClick={startEnroll}>{busy ? 'Starting…' : 'Set it up'}</button>
          ) : (
            <div className="tr-2s-enroll">
              <ol className="tr-2s-steps">
                <li>Open your authenticator app and add an account.</li>
                <li>Scan this code, or type the key below.</li>
                <li>Enter the 6-digit code it shows.</li>
              </ol>
              <img className="tr-2s-qr" src={enrolling.qr} alt="QR code for your authenticator app" width="168" height="168" />
              <p className="tr-2s-secret">Key: <code>{enrolling.secret}</code></p>
              <label className="tr-field"><span>Code from the app</span><CodeInput value={code} onChange={setCode} onDone={verify} disabled={busy} /></label>
              <button type="button" className="tr-btn tr-btn-brass" disabled={busy || code.length !== 6} onClick={() => verify()}>{busy ? 'Checking…' : 'Turn it on'}</button>
            </div>
          )}
        </>
      ) : (
        <>
          <h2 id="tr-2s-title" className="tr-2s-title">Confirm it's you</h2>
          <p className="tr-2s-text">{locked ? 'Locked after 15 minutes without activity. ' : ''}Enter the 6-digit code from your authenticator app.</p>
          <label className="tr-field"><span>Code</span><CodeInput value={code} onChange={setCode} onDone={verify} disabled={busy} /></label>
          <button type="button" className="tr-btn tr-btn-brass" disabled={busy || code.length !== 6} onClick={() => verify()}>{busy ? 'Checking…' : 'Verify'}</button>
          <p className="tr-2s-note">You stay verified until you're idle for 15 minutes, and for 12 hours at most.</p>
        </>
      )}
      {error ? <p className="tr-error" role="alert">{error}</p> : null}
    </div>
  );
}
