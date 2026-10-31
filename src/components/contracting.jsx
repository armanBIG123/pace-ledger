// An agent's side of contracting: signing the producer agreement
// (DocuSeal, inside PaceLedger), the secure contracting form, and their
// signed agreements. The contracting team's side is screens/team/Contracting.jsx.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Eye, EyeOff, FileText, Lock, Paperclip, ShieldCheck, Trash2 } from 'lucide-react';
import { Sheet } from './ui.jsx';
import { askConfirm } from './confirm.jsx';
import { agreementLink, contractingWords, fetchMyContracting, sendContractingInfo, startAgreement, syncAgreement } from '../data/contracting.js';
import { BACKGROUND_QUESTIONS, FILE_TYPES, fmtDay, fmtWhen, formProblems, fieldsFromForm, MAX_FILE_BYTES } from '../lib/contracting.js';
import { US_STATES } from '../lib/profiles.js';
import { shrinkImage } from '../lib/vault.js';
import { todayStr } from '../lib/dates.js';
import { isNativeApp, openInBrowserSheet } from '../native.js';

// ---- Loading an agent's status --------------------------------------------------
export function useMyContracting(user, enabled = true) {
  const [data, setData] = useState(null);
  const load = useCallback(() => (enabled ? fetchMyContracting(user.id).then(setData) : Promise.resolve()), [user.id, enabled]);
  useEffect(() => {
    if (!enabled) return undefined;
    load();
    window.addEventListener('paceledger:contracting-changed', load);
    return () => window.removeEventListener('paceledger:contracting-changed', load);
  }, [load]);
  return [data, load];
}
export const contractingChanged = () => window.dispatchEvent(new Event('paceledger:contracting-changed'));

// ---- DocuSeal's signing form -----------------------------------------------------
let docusealScript = null;
function loadDocuSeal() {
  if (window.customElements && window.customElements.get('docuseal-form')) return Promise.resolve();
  if (!docusealScript) {
    docusealScript = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.docuseal.com/js/form.js';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { docusealScript = null; reject(new Error('docuseal')); };
      document.head.appendChild(s);
    });
  }
  return docusealScript;
}
const DOCUSEAL_CSS = '#submit_form_button, .submit-form-button { background-color: #C49A3C !important; color: #13212E !important; } .base-button { border-radius: 8px !important; }';

export function DocuSealForm({ src, email, onCompleted, onDeclined }) {
  const ref = useRef(null);
  const [state, setState] = useState('loading');
  const done = useRef(onCompleted);
  done.current = onCompleted;
  const declined = useRef(onDeclined);
  declined.current = onDeclined;
  useEffect(() => {
    let alive = true;
    loadDocuSeal().then(() => { if (alive) setState('ready'); }).catch(() => { if (alive) setState('failed'); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (state !== 'ready' || !ref.current) return undefined;
    const host = ref.current;
    host.innerHTML = '';
    const el = document.createElement('docuseal-form');
    el.setAttribute('data-src', src);
    if (email) el.setAttribute('data-email', email);
    el.setAttribute('data-with-title', 'false');
    el.setAttribute('data-with-send-copy-button', 'false');
    el.setAttribute('data-with-download-button', 'false');
    el.setAttribute('data-language', 'en');
    el.setAttribute('data-custom-css', DOCUSEAL_CSS);
    const onDone = e => done.current && done.current(e.detail || {});
    const onNo = e => declined.current && declined.current(e.detail || {});
    el.addEventListener('completed', onDone);
    el.addEventListener('declined', onNo);
    host.appendChild(el);
    return () => { el.removeEventListener('completed', onDone); el.removeEventListener('declined', onNo); host.innerHTML = ''; };
  }, [state, src, email]);
  if (state === 'failed') return <p className="tr-error">The signing form didn't load. Check your connection and try again.</p>;
  return (
    <div className="tr-ds">
      {state === 'loading' ? <p className="tr-empty">Loading the signing form…</p> : null}
      <div ref={ref} />
    </div>
  );
}

// ---- Signing (agents) ---------------------------------------------------------------
export function AgreementSheet({ onClose }) {
  const [state, setState] = useState({ kind: 'loading' });
  const agreementId = useRef(null);
  useEffect(() => {
    let alive = true;
    startAgreement().then(res => {
      if (!alive) return;
      if (!res.ok) { setState({ kind: 'error', message: contractingWords(res.error) }); return; }
      const d = res.data;
      if (d.agreement) agreementId.current = d.agreement.id;
      if (d.status === 'sent') setState({ kind: 'sign', src: d.src, email: d.email });
      else setState({ kind: d.status });
    });
    return () => { alive = false; };
  }, []);
  async function finished() {
    setState({ kind: 'saving' });
    let status = 'agent_signed';
    if (agreementId.current) {
      // DocuSeal tells us too (webhook); this just makes it show right away.
      for (let i = 0; i < 3; i++) {
        const res = await syncAgreement(agreementId.current);
        if (res.ok && res.data.status !== 'sent') { status = res.data.status; break; }
        await new Promise(r => setTimeout(r, 1500));
      }
    }
    contractingChanged();
    setState({ kind: status });
  }
  return (
    <Sheet labelledBy="tr-ag-title" onClose={onClose}>
      <div className="tr-fsheet-head">
        <h2 id="tr-ag-title" className="tr-fsheet-title">Producer agreement</h2>
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onClose}>{state.kind === 'sign' ? 'Finish later' : 'Close'}</button>
      </div>
      <div className="tr-fsheet-body">
        {state.kind === 'loading' || state.kind === 'saving' ? <p className="tr-empty">{state.kind === 'saving' ? 'Saving your signature…' : 'Getting your agreement ready…'}</p> : null}
        {state.kind === 'error' ? <p className="tr-error">{state.message}</p> : null}
        {state.kind === 'sign' ? (
          <>
            <p className="tr-ct-note">Your name, email and today's date are filled in. Adopt your signature once, then tap each spot. Every tap is recorded with the time, your email and your IP address.</p>
            <DocuSealForm src={state.src} email={state.email} onCompleted={finished} onDeclined={() => { contractingChanged(); setState({ kind: 'declined' }); }} />
          </>
        ) : null}
        {state.kind === 'agent_signed' ? (
          <div className="tr-ct-done">
            <ShieldCheck size={28} aria-hidden="true" />
            <p><strong>Signed.</strong> BIG countersigns next, then your contracting form opens here. You'll see it in Growth → Licensing.</p>
            <button type="button" className="tr-btn tr-btn-brass" onClick={onClose}>Done</button>
          </div>
        ) : null}
        {state.kind === 'completed' ? (
          <div className="tr-ct-done">
            <ShieldCheck size={28} aria-hidden="true" />
            <p><strong>Your agreement is signed and countersigned.</strong> Next, send your contracting info.</p>
            <button type="button" className="tr-btn tr-btn-brass" onClick={onClose}>Done</button>
          </div>
        ) : null}
        {state.kind === 'declined' ? <p className="tr-error">You declined the agreement. Talk to your upline if that wasn't on purpose; they can help you start again.</p> : null}
      </div>
    </Sheet>
  );
}

// ---- The contracting form (agents) ---------------------------------------------------
const STATE_OPTIONS = US_STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>);
function YesNo({ value, onChange, label, name }) {
  return (
    <div className="tr-ct-yn" role="radiogroup" aria-label={label}>
      {['yes', 'no'].map(v => (
        <button key={v} type="button" role="radio" aria-checked={value === v} name={name}
          className={value === v ? 'tr-ct-yn-on' : ''} onClick={() => onChange(v)}>{v === 'yes' ? 'Yes' : 'No'}</button>
      ))}
    </div>
  );
}
function Field({ label, error, hint, children, id }) {
  return (
    <label className={`tr-field ${error ? 'tr-ct-bad' : ''}`} id={id}>
      <span>{label}</span>
      {children}
      {error ? <em className="tr-ct-err">{error}</em> : hint ? <em className="tr-ct-hint">{hint}</em> : null}
    </label>
  );
}
function FilePick({ label, file, onPick, error, accept = 'application/pdf,image/jpeg,image/png', capture, id }) {
  const input = useRef(null);
  return (
    <div className={`tr-ct-file ${error ? 'tr-ct-bad' : ''}`} id={id}>
      {file ? (
        <div className="tr-ct-file-row">
          <FileText size={18} aria-hidden="true" />
          <span className="tr-ct-file-name">{file.name}<i>{Math.max(1, Math.round(file.size / 1024))} KB · encrypted when you send</i></span>
          <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => onPick(null)} aria-label={`Remove ${label}`}><Trash2 size={14} /></button>
        </div>
      ) : (
        <button type="button" className="tr-ct-file-add" onClick={() => input.current && input.current.click()}><Paperclip size={16} aria-hidden="true" /> {label}</button>
      )}
      <input ref={input} type="file" accept={accept} capture={capture} hidden onChange={e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) onPick(f); }} />
      {error ? <em className="tr-ct-err">{error}</em> : null}
    </div>
  );
}
async function bytesOf(file) {
  if (/^image\//.test(file.type) && file.type !== 'image/png') {
    try { return { mime: 'image/jpeg', bytes: await shrinkImage(file) }; } catch { /* fall through */ }
  }
  return { mime: file.type, bytes: new Uint8Array(await file.arrayBuffer()) };
}

export function ContractingFormSheet({ user, settings, onClose, onSent }) {
  const [parts] = useState(() => String(user.displayName || '').trim().split(/\s+/));
  const [f, setF] = useState(() => ({
    first_name: parts[0] || '', middle_name: '', last_name: parts.length > 1 ? parts[parts.length - 1] : '',
    ssn: '', dob: '', gender: '', email: user.email || '', phone: '',
    street: '', city: '', state: '', zip: '', dl_number: '', dl_state: '', dl_expires: '',
    bank_name: '', account_type: 'Checking', routing: '', account: '', account2: '',
    eo_has: '', eo_carrier: '', eo_policy: '', eo_amount: '', eo_expires: '', eo_file: null,
    aml_done: '', aml_provider: '', aml_date: '', aml_file: null, dl_file: null,
    bg: BACKGROUND_QUESTIONS.map(() => ''), bgNotes: {}, bgFiles: [], confirm: false,
  }));
  const [showSsn, setShowSsn] = useState(false);
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState('');
  const [error, setError] = useState('');
  const touched = useRef(false);
  const set = (k, v) => { touched.current = true; setF(prev => ({ ...prev, [k]: v })); };
  const today = todayStr();
  const problems = formProblems(f, today);
  const shown = tried ? problems : {};
  const nProblems = Object.keys(problems).length;
  const fileErr = file => (file && !FILE_TYPES.includes(file.type) && !/^image\//.test(file.type) ? 'Use a PDF, JPG or PNG.' : file && file.size > 12 * 1024 * 1024 ? 'That file is too big.' : '');

  async function close() {
    if (sending) return;
    if (touched.current && !(await askConfirm({ title: 'Close without sending?', body: "Nothing you typed is saved on this device. You'd start again next time.", confirmLabel: 'Close', cancelLabel: 'Keep going' }))) return;
    onClose();
  }
  async function send() {
    setTried(true); setError('');
    if (nProblems) {
      const first = Object.keys(problems)[0];
      const el = document.getElementById(`ct-${first}`) || document.getElementById(`ct-${first.replace(/_\d+$/, '')}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const picked = [
      f.dl_file && { kind: 'dl_front', file: f.dl_file },
      f.eo_has === 'yes' && f.eo_file && { kind: 'eo_certificate', file: f.eo_file },
      f.aml_done === 'yes' && f.aml_file && { kind: 'aml_certificate', file: f.aml_file },
      ...f.bgFiles.map(file => ({ kind: 'background_doc', file })),
    ].filter(Boolean);
    for (const p of picked) { const bad = fileErr(p.file); if (bad) { setError(`${p.file.name}: ${bad}`); return; } }
    setSending('Getting files ready…');
    const files = [];
    for (const p of picked) {
      const { mime, bytes } = await bytesOf(p.file);
      if (bytes.length > MAX_FILE_BYTES) { setSending(''); setError(`${p.file.name} is over 4 MB. Take a smaller photo or a smaller PDF.`); return; }
      files.push({ kind: p.kind, name: p.file.name, mime: FILE_TYPES.includes(mime) ? mime : 'application/pdf', bytes });
    }
    const res = await sendContractingInfo({ settings, userId: user.id, fields: fieldsFromForm(f), files, onProgress: setSending });
    setSending('');
    if (!res.ok) { setError(res.error === 'encrypt_failed' ? "This device couldn't encrypt the form. Update your browser or app and try again." : contractingWords(res.error)); return; }
    contractingChanged();
    window.dispatchEvent(new Event('paceledger:onboarding-changed'));
    onSent(res.expiresAt);
  }

  return (
    <Sheet labelledBy="tr-ct-title" onClose={close}>
      <div className="tr-fsheet-head">
        <h2 id="tr-ct-title" className="tr-fsheet-title">Contracting info</h2>
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={close} disabled={!!sending}>Close</button>
      </div>
      <form className="tr-fsheet-body tr-ct-form" autoComplete="off" onSubmit={e => { e.preventDefault(); send(); }} noValidate>
        <div className="tr-ct-lock">
          <Lock size={18} aria-hidden="true" />
          <div>
            <strong>Encrypted on this device before it's sent</strong>
            <p>Only BIG's contracting team can open it. PaceLedger deletes it once it's entered in SureLC, and after 72 hours at most. Nothing is saved on this device.</p>
          </div>
        </div>

        <fieldset className="tr-ct-sec">
          <legend>1 · Your legal name and identity</legend>
          <div className="tr-ct-grid3">
            <Field id="ct-first_name" label="Legal first name" error={shown.first_name}><input value={f.first_name} onChange={e => set('first_name', e.target.value)} maxLength={60} autoComplete="off" /></Field>
            <Field label="Middle name"><input value={f.middle_name} onChange={e => set('middle_name', e.target.value)} maxLength={60} autoComplete="off" /></Field>
            <Field id="ct-last_name" label="Legal last name" error={shown.last_name}><input value={f.last_name} onChange={e => set('last_name', e.target.value)} maxLength={60} autoComplete="off" /></Field>
          </div>
          <Field id="ct-ssn" label="Social Security number" error={shown.ssn} hint="Hidden as you type.">
            <span className="tr-ct-secret">
              <input type={showSsn ? 'text' : 'password'} inputMode="numeric" value={f.ssn} maxLength={11} autoComplete="off" data-lpignore="true"
                onChange={e => set('ssn', e.target.value.replace(/[^\d-]/g, ''))} />
              <button type="button" className="tr-btn tr-btn-ghost" aria-label={showSsn ? 'Hide SSN' : 'Show SSN'} onClick={() => setShowSsn(s => !s)}>{showSsn ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </span>
          </Field>
          <div className="tr-ct-grid2">
            <Field id="ct-dob" label="Date of birth" error={shown.dob}><input type="date" value={f.dob} max={today} onChange={e => set('dob', e.target.value)} /></Field>
            <Field id="ct-gender" label="Gender" error={shown.gender}>
              <select value={f.gender} onChange={e => set('gender', e.target.value)}><option value="">Choose</option><option>Female</option><option>Male</option></select>
            </Field>
          </div>
        </fieldset>

        <fieldset className="tr-ct-sec">
          <legend>2 · Contact and home address</legend>
          <div className="tr-ct-grid2">
            <Field id="ct-email" label="Email" error={shown.email}><input type="email" value={f.email} onChange={e => set('email', e.target.value)} maxLength={120} /></Field>
            <Field id="ct-phone" label="Phone" error={shown.phone}><input type="tel" inputMode="tel" value={f.phone} onChange={e => set('phone', e.target.value)} maxLength={20} /></Field>
          </div>
          <Field id="ct-street" label="Street address" error={shown.street}><input value={f.street} onChange={e => set('street', e.target.value)} maxLength={120} autoComplete="off" /></Field>
          <div className="tr-ct-grid3">
            <Field id="ct-city" label="City" error={shown.city}><input value={f.city} onChange={e => set('city', e.target.value)} maxLength={60} autoComplete="off" /></Field>
            <Field id="ct-state" label="State" error={shown.state}><select value={f.state} onChange={e => set('state', e.target.value)}><option value="">Choose</option>{STATE_OPTIONS}</select></Field>
            <Field id="ct-zip" label="ZIP code" error={shown.zip}><input inputMode="numeric" value={f.zip} onChange={e => set('zip', e.target.value)} maxLength={10} autoComplete="off" /></Field>
          </div>
        </fieldset>

        <fieldset className="tr-ct-sec">
          <legend>3 · Driver's license</legend>
          <div className="tr-ct-grid3">
            <Field id="ct-dl_number" label="License number" error={shown.dl_number}><input value={f.dl_number} onChange={e => set('dl_number', e.target.value)} maxLength={30} autoComplete="off" /></Field>
            <Field id="ct-dl_state" label="State" error={shown.dl_state}><select value={f.dl_state} onChange={e => set('dl_state', e.target.value)}><option value="">Choose</option>{STATE_OPTIONS}</select></Field>
            <Field id="ct-dl_expires" label="Expires" error={shown.dl_expires}><input type="date" value={f.dl_expires} min={today} onChange={e => set('dl_expires', e.target.value)} /></Field>
          </div>
          <FilePick label="Photo of the front (optional)" file={f.dl_file} onPick={v => set('dl_file', v)} accept="image/*" capture="environment" />
        </fieldset>

        <fieldset className="tr-ct-sec">
          <legend>4 · Commission deposits</legend>
          <Field id="ct-bank_name" label="Bank name" error={shown.bank_name}><input value={f.bank_name} onChange={e => set('bank_name', e.target.value)} maxLength={80} autoComplete="off" /></Field>
          <div className="tr-field"><span>Account type</span>
            <div className="tr-ct-yn" role="radiogroup" aria-label="Account type">
              {['Checking', 'Savings'].map(v => <button key={v} type="button" role="radio" aria-checked={f.account_type === v} className={f.account_type === v ? 'tr-ct-yn-on' : ''} onClick={() => set('account_type', v)}>{v}</button>)}
            </div>
          </div>
          <div className="tr-ct-grid3">
            <Field id="ct-routing" label="Routing number" error={shown.routing}><input inputMode="numeric" value={f.routing} onChange={e => set('routing', e.target.value)} maxLength={9} autoComplete="off" data-lpignore="true" /></Field>
            <Field id="ct-account" label="Account number" error={shown.account}><input inputMode="numeric" value={f.account} onChange={e => set('account', e.target.value)} maxLength={17} autoComplete="off" data-lpignore="true" /></Field>
            <Field id="ct-account2" label="Account number again" error={shown.account2}><input type="password" inputMode="numeric" value={f.account2} onChange={e => set('account2', e.target.value)} maxLength={17} autoComplete="off" data-lpignore="true" onPaste={e => e.preventDefault()} /></Field>
          </div>
          <p className="tr-ct-hint">Use an account in your name. Any later change to where commissions go has to come from you.</p>
        </fieldset>

        <fieldset className="tr-ct-sec">
          <legend>5 · E&amp;O and AML</legend>
          <div className="tr-field" id="ct-eo_has"><span>Do you have E&amp;O insurance?</span><YesNo value={f.eo_has} onChange={v => set('eo_has', v)} label="Do you have E&O insurance?" />{shown.eo_has ? <em className="tr-ct-err">{shown.eo_has}</em> : null}</div>
          {f.eo_has === 'yes' ? (
            <>
              <div className="tr-ct-grid2">
                <Field id="ct-eo_carrier" label="E&O carrier" error={shown.eo_carrier}><input value={f.eo_carrier} onChange={e => set('eo_carrier', e.target.value)} maxLength={80} /></Field>
                <Field id="ct-eo_policy" label="Policy number" error={shown.eo_policy}><input value={f.eo_policy} onChange={e => set('eo_policy', e.target.value)} maxLength={40} /></Field>
                <Field label="Coverage per claim (optional)"><input value={f.eo_amount} onChange={e => set('eo_amount', e.target.value)} maxLength={20} placeholder="$1,000,000" /></Field>
                <Field id="ct-eo_expires" label="Expires" error={shown.eo_expires}><input type="date" value={f.eo_expires} min={today} onChange={e => set('eo_expires', e.target.value)} /></Field>
              </div>
              <FilePick id="ct-eo_file" label="E&O certificate" file={f.eo_file} onPick={v => set('eo_file', v)} error={shown.eo_file} />
            </>
          ) : f.eo_has === 'no' ? <p className="tr-ct-hint">That's OK for now. BIG will help you get E&amp;O before you're appointed.</p> : null}
          <div className="tr-field" id="ct-aml_done"><span>Have you finished AML (anti-money laundering) training?</span><YesNo value={f.aml_done} onChange={v => set('aml_done', v)} label="Finished AML training?" />{shown.aml_done ? <em className="tr-ct-err">{shown.aml_done}</em> : null}</div>
          {f.aml_done === 'yes' ? (
            <>
              <div className="tr-ct-grid2">
                <Field label="Provider (optional)"><input value={f.aml_provider} onChange={e => set('aml_provider', e.target.value)} maxLength={80} /></Field>
                <Field label="Completed on (optional)"><input type="date" value={f.aml_date} max={today} onChange={e => set('aml_date', e.target.value)} /></Field>
              </div>
              <FilePick id="ct-aml_file" label="AML certificate" file={f.aml_file} onPick={v => set('aml_file', v)} error={shown.aml_file} />
            </>
          ) : f.aml_done === 'no' ? <p className="tr-ct-hint">BIG will send you the training before you're appointed.</p> : null}
        </fieldset>

        <fieldset className="tr-ct-sec">
          <legend>6 · Background questions</legend>
          <p className="tr-ct-hint">Answer honestly. A Yes isn't automatically a problem: explain it and BIG will go over it with you. You'll confirm these again in SureLC.</p>
          <div className="tr-ct-bg-all">
            <button type="button" className="tr-link-btn" onClick={() => set('bg', BACKGROUND_QUESTIONS.map((_, i) => f.bg[i] || 'no'))}>Answer the rest No</button>
          </div>
          <ol className="tr-ct-bg">
            {BACKGROUND_QUESTIONS.map((q, i) => (
              <li key={i} id={`ct-bg_${i}`} className={shown[`bg_${i}`] ? 'tr-ct-bad' : ''}>
                <p>{q}</p>
                <YesNo value={f.bg[i]} onChange={v => set('bg', f.bg.map((x, j) => (j === i ? v : x)))} label={`Question ${i + 1}`} />
                {f.bg[i] === 'yes' ? (
                  <textarea rows={3} maxLength={1000} placeholder="What happened, when, and how it was resolved" aria-label={`Explain question ${i + 1}`}
                    value={f.bgNotes[i] || ''} onChange={e => set('bgNotes', { ...f.bgNotes, [i]: e.target.value })} />
                ) : null}
                {shown[`bg_${i}`] ? <em className="tr-ct-err">{shown[`bg_${i}`]}</em> : null}
              </li>
            ))}
          </ol>
          {f.bg.some(a => a === 'yes') ? (
            <div className="tr-ct-bgfiles">
              {f.bgFiles.map((file, i) => <FilePick key={i} label="Document" file={file} onPick={v => set('bgFiles', v ? f.bgFiles.map((x, j) => (j === i ? v : x)) : f.bgFiles.filter((_, j) => j !== i))} />)}
              {f.bgFiles.length < 5 ? <FilePick label="Add a supporting document (optional)" file={null} onPick={v => v && set('bgFiles', [...f.bgFiles, v])} /> : null}
            </div>
          ) : null}
        </fieldset>

        <label className={`tr-ct-confirm ${shown.confirm ? 'tr-ct-bad' : ''}`} id="ct-confirm">
          <input type="checkbox" checked={f.confirm} onChange={e => set('confirm', e.target.checked)} />
          <span>I confirm this is true and complete, and I authorize BIG to use it for contracting as my producer agreement describes.</span>
        </label>
        {tried && nProblems ? <p className="tr-error" role="alert">{nProblems === 1 ? '1 answer needs' : `${nProblems} answers need`} a look. They're marked in red.</p> : null}
        {error ? <p className="tr-error" role="alert">{error}</p> : null}
        <button type="submit" className="tr-btn tr-btn-brass tr-ct-send" disabled={!!sending}><Lock size={16} aria-hidden="true" /> {sending || 'Encrypt and send to BIG'}</button>
      </form>
    </Sheet>
  );
}

// ---- Signed agreements (anyone, about themselves) -----------------------------------
// In the app: an in-app Safari sheet. On the web: a new tab, or this tab
// if the browser blocks it.
export async function openAgreementFile(path) {
  const url = await agreementLink(path);
  if (!url) return false;
  if (isNativeApp()) { await openInBrowserSheet(url).catch(() => {}); return true; }
  const tab = window.open(url, '_blank');
  if (!tab) window.location.assign(url);
  return true;
}
export function AgreementHistory({ agreements }) {
  const signed = (agreements || []).filter(a => a.status === 'completed');
  const [err, setErr] = useState('');
  if (!signed.length) return null;
  const latest = signed[0];
  const open = async path => { setErr(''); if (!(await openAgreementFile(path))) setErr("Couldn't open it. Try again."); };
  return (
    <div className="tr-card tr-ct-agreement">
      <h3 className="tr-h3"><FileText size={17} aria-hidden="true" /> Signed producer agreement</h3>
      <div className="tr-ct-ag-grid">
        <div><span>Signed by</span><strong>{latest.agent_name}</strong></div>
        <div><span>Signed</span><strong>{fmtDay(latest.agent_signed_at)}</strong></div>
        <div><span>Version</span><strong>{latest.version}{latest.election ? ` · ${latest.election}` : ''}</strong></div>
      </div>
      <div className="tr-ct-ag-btns">
        {latest.pdf_path ? <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => open(latest.pdf_path)}><Download size={14} aria-hidden="true" /> Signed PDF</button> : null}
        {latest.audit_path ? <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => open(latest.audit_path)}><Download size={14} aria-hidden="true" /> Audit certificate</button> : null}
      </div>
      {signed.length > 1 ? (
        <div className="tr-ct-ag-history">
          <p className="tr-ct-hint">Every version you sign stays on file. Signing a new one never replaces an old one.</p>
          <ul>
            {signed.map(a => (
              <li key={a.id}>
                <span><strong>Version {a.version}</strong><i>Signed {fmtDay(a.agent_signed_at)} · countersigned {fmtDay(a.countersigned_at)}</i></span>
                {a.pdf_path ? <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" aria-label={`Download version ${a.version}`} onClick={() => open(a.pdf_path)}><Download size={14} /></button> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : <p className="tr-ct-hint">Countersigned by BIG {fmtWhen(latest.countersigned_at)}. Kept on file for good.</p>}
      {err ? <p className="tr-error">{err}</p> : null}
    </div>
  );
}
