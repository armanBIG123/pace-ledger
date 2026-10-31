// Team & admin → Profiles → Contracting (the contracting team: super admins
// added in Setup). Behind two-step login. The queue of agents, one agent's
// encrypted info (revealed or copied one field at a time, every time
// logged), "I entered it in SureLC" (deletes it), the steps after SureLC,
// countersigning, setup, the kill switch and the access log.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ClipboardCheck, Clock, Copy, Download, Eye, EyeOff, FileText, KeyRound, ListChecks, Lock, PauseCircle, Settings, ShieldCheck, Trash2, Users } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { askConfirm } from '../../components/confirm.jsx';
import { TwoStepGate } from '../../components/twoStep.jsx';
import { DocuSealForm, openAgreementFile } from '../../components/contracting.jsx';
import { Sheet } from '../../components/ui.jsx';
import {
  checkKey, contractingWords, countersignSession, docusealCheck, fetchAdminLog, fetchContractingCase, fetchContractingQueue,
  fetchContractingSettings, fetchStaffList, fileBlobUrl, killSwitch, makeNewKey, markEntered, markReviewed, markStep,
  openContractingFile, revealField, setAgreement, setEnabled, setPaused, setStaff, syncAgreement,
} from '../../data/contracting.js';
import { FIELD_LABELS, FILE_LABELS, fmtDay, fmtWhen, hoursLeft, LOG_WORDS, maskFor, readBackground, SECTIONS, timeLeft } from '../../lib/contracting.js';

const REVEAL_MS = 30000;

// What to do next for one row of the queue.
export function nextStep(q) {
  if (q.has_info) return { key: 'enter', text: 'Enter in SureLC', action: 'Open', primary: true };
  if (q.agreement_status === 'agent_signed') return { key: 'countersign', text: 'Countersign their agreement', action: 'Countersign', primary: true };
  if (q.agreement_status === 'sent') return { key: 'signing', text: 'Signing their agreement' };
  if (q.agreement_status === 'declined') return { key: 'declined', text: 'Declined the agreement' };
  if (q.entered_at && (!q.info_deleted_at || q.delete_reason === 'entered')) {
    if (!q.review_sent_at) return { key: 'review_sent', text: 'Send their SureLC review', action: 'Review sent', step: 'review_sent' };
    if (!q.surelc_signed_at) return { key: 'agent_signed', text: 'Waiting on their SureLC signature', action: 'They signed', step: 'agent_signed' };
    if (!q.sent_to_carrier_at) return { key: 'sent_to_carrier', text: 'Send to the carrier', action: 'Sent to carrier', step: 'sent_to_carrier', primary: true };
    return q.has_writing_number ? { key: 'done', text: 'Contracted' } : { key: 'number', text: 'Waiting on their writing number' };
  }
  if (q.delete_reason === 'expired') return { key: 'resend', text: 'Their info expired. Waiting for them to send it again' };
  if (q.delete_reason === 'withdrawn') return { key: 'resend', text: 'They withdrew their info' };
  if (q.delete_reason === 'kill_switch') return { key: 'resend', text: 'Deleted by the kill switch. Waiting for them to send it again' };
  return { key: 'waiting', text: 'Waiting on their contracting info' };
}
const agreementText = q => ({ sent: 'Signing', agent_signed: 'Needs your countersign', completed: `Signed · ${q.version || ''}${q.election ? ` · ${q.election}` : ''}`, declined: 'Declined', voided: 'Voided' }[q.agreement_status] || 'Not started');

function TimeBar({ expiresAt, now }) {
  const h = hoursLeft(expiresAt, now);
  const pct = Math.max(2, Math.min(100, (h / 72) * 100));
  return (
    <span className={`tr-ct-time ${h < 24 ? 'tr-ct-time-soon' : ''}`}>
      <span className="tr-ct-time-bar"><i style={{ width: `${pct}%` }} /></span>
      <span>{timeLeft(expiresAt, now)} left</span>
    </span>
  );
}

// ---- Countersigning ------------------------------------------------------------
// A decrypted file, shown inside PaceLedger (no new tab to forget open).
// The decrypted copy lives only in this window and is thrown away on close.
function FileViewer({ file, onClose }) {
  useEffect(() => () => URL.revokeObjectURL(file.url), [file.url]);
  const isPdf = file.mime === 'application/pdf';
  return (
    <Sheet labelledBy="tr-ct-fv-title" onClose={onClose}>
      <div className="tr-fsheet-head">
        <h2 id="tr-ct-fv-title" className="tr-fsheet-title">{file.label}</h2>
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onClose}>Close</button>
      </div>
      <div className="tr-fsheet-body">
        <div className="tr-ct-viewer">
          {isPdf
            ? <iframe title={file.label} src={file.url} />
            : <img src={file.url} alt={file.label} />}
        </div>
        <p className="tr-ct-viewer-foot">
          <span>{file.name}</span>
          <a className="tr-btn tr-btn-ghost tr-btn-sm" href={file.url} download={file.name}><Download size={14} aria-hidden="true" /> Download</a>
        </p>
        <p className="tr-subtitle" style={{ margin: 0 }}>If you download it, upload it to SureLC and then delete it from your computer.</p>
      </div>
    </Sheet>
  );
}

function CountersignSheet({ agreement, onClose, onDone }) {
  const [state, setState] = useState({ kind: 'loading' });
  useEffect(() => {
    let alive = true;
    countersignSession(agreement.id).then(res => {
      if (!alive) return;
      if (!res.ok) setState({ kind: 'error', message: res.error === 'docuseal' ? `DocuSeal: ${res.detail || 'error'}` : contractingWords(res.error) });
      else if (res.data.status === 'completed') setState({ kind: 'done' });
      else setState({ kind: 'sign', src: res.data.src, email: res.data.email });
    });
    return () => { alive = false; };
  }, [agreement.id]);
  async function finished() {
    setState({ kind: 'saving' });
    for (let i = 0; i < 4; i++) {
      const res = await syncAgreement(agreement.id);
      if (res.ok && res.data.status === 'completed') break;
      await new Promise(r => setTimeout(r, 1500));
    }
    setState({ kind: 'done' });
    onDone();
  }
  return (
    <Sheet labelledBy="tr-cs-title" onClose={onClose}>
      <div className="tr-fsheet-head">
        <h2 id="tr-cs-title" className="tr-fsheet-title">Countersign · {agreement.agent_name}</h2>
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onClose}>Close</button>
      </div>
      <div className="tr-fsheet-body">
        {state.kind === 'loading' || state.kind === 'saving' ? <p className="tr-empty">{state.kind === 'saving' ? 'Saving the signed agreement…' : 'Getting the agreement…'}</p> : null}
        {state.kind === 'error' ? <p className="tr-error">{state.message}</p> : null}
        {state.kind === 'sign' ? <DocuSealForm src={state.src} email={state.email} onCompleted={finished} /> : null}
        {state.kind === 'done' ? (
          <div className="tr-ct-done"><ShieldCheck size={28} aria-hidden="true" /><p><strong>Countersigned.</strong> The signed PDF and audit certificate are saved. Their contracting form is open now.</p>
            <button type="button" className="tr-btn tr-btn-brass" onClick={onClose}>Done</button></div>
        ) : null}
      </div>
    </Sheet>
  );
}

// ---- The queue ---------------------------------------------------------------------
function Queue({ rows, settings, now, onOpen, onCountersign, onStep, onSetup, onLog, onKill, onPause, onReviewed, busy }) {
  const toEnter = rows.filter(q => q.has_info);
  const countersign = rows.filter(q => q.agreement_status === 'agent_signed');
  const after = rows.filter(q => { const n = nextStep(q).key; return n === 'review_sent' || n === 'agent_signed' || n === 'sent_to_carrier'; });
  const oldest = toEnter.reduce((m, q) => (!m || q.expires_at < m ? q.expires_at : m), null);
  const reviewDue = !settings.last_review_at || Date.now() - new Date(settings.last_review_at).getTime() > 90 * 864e5;
  return (
    <>
      <div className="tr-ct-tiles">
        <div className="tr-card tr-ct-tile"><span>To enter in SureLC</span><strong>{toEnter.length}</strong><i className={oldest && hoursLeft(oldest, now) < 24 ? 'tr-ct-warn' : ''}>{oldest ? `Oldest deletes in ${timeLeft(oldest, now)}` : 'Nothing waiting'}</i></div>
        <div className="tr-card tr-ct-tile"><span>Needs your countersign</span><strong>{countersign.length}</strong><i>Their form opens after you sign</i></div>
        <div className="tr-card tr-ct-tile"><span>After SureLC</span><strong>{after.length}</strong><i>Review, their signature, the carrier</i></div>
      </div>
      <div className="tr-card tr-ct-list">
        <div className="tr-ct-row tr-ct-row-head" aria-hidden="true"><span>Agent</span><span>Agreement</span><span>Contracting info</span><span>Next step</span></div>
        {rows.length === 0 ? <p className="tr-empty tr-ct-none">No one yet. Agents show up here once they start signing their producer agreement.</p> : rows.map(q => {
          const n = nextStep(q);
          return (
            <div key={q.user_id} className="tr-ct-row">
              <button type="button" className="tr-ct-who" onClick={() => onOpen(q.user_id)}>
                <strong>{q.name}</strong><i>{[q.upline ? `Upline: ${q.upline}` : '', q.solar_system].filter(Boolean).join(' · ')}</i>
              </button>
              <span className={`tr-ct-ag tr-ct-ag-${q.agreement_status || 'none'}`}>{agreementText(q)}</span>
              <span className="tr-ct-info">
                {q.has_info ? <><span>Sent {fmtWhen(q.info_sent_at)}{q.files ? ` · ${q.files} file${q.files === 1 ? '' : 's'}` : ''}</span><TimeBar expiresAt={q.expires_at} now={now} /></>
                  : q.entered_at && q.delete_reason === 'entered' ? <span className="tr-ct-quiet">Entered {fmtDay(q.entered_at)} · deleted</span>
                  : q.info_deleted_at ? <span className="tr-ct-quiet">Deleted {fmtDay(q.info_deleted_at)}</span>
                  : <span className="tr-ct-quiet">{q.agreement_status === 'completed' ? 'Not sent yet' : 'Opens after countersigning'}</span>}
              </span>
              <span className="tr-ct-next">
                <span>{n.text}</span>
                {n.action ? (
                  <button type="button" className={`tr-btn tr-btn-sm ${n.primary ? 'tr-btn-brass' : 'tr-btn-ghost'}`} disabled={busy === q.user_id}
                    onClick={() => (n.key === 'enter' ? onOpen(q.user_id) : n.key === 'countersign' ? onCountersign(q) : onStep(q, n.step))}>{n.action}</button>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
      <div className="tr-ct-cards">
        <div className="tr-card tr-ct-side">
          <h3 className="tr-h3"><ClipboardCheck size={17} aria-hidden="true" /> Access review</h3>
          <p className={reviewDue ? 'tr-ct-warn' : ''}>{settings.last_review_at ? `Last done ${fmtDay(settings.last_review_at)}.` : 'Not done yet.'} Every 3 months: check who's on the contracting team and read the activity log.</p>
          <div className="tr-ct-btns">
            <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onLog}><ListChecks size={14} aria-hidden="true" /> Activity log</button>
            <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onSetup}><Users size={14} aria-hidden="true" /> The team</button>
            <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onReviewed}><Check size={14} aria-hidden="true" /> Mark reviewed</button>
          </div>
        </div>
        <div className="tr-card tr-ct-side tr-ct-kill">
          <h3 className="tr-h3">Kill switch</h3>
          <p>If anything looks wrong: delete every pending submission now and pause the form for all agents.</p>
          <div className="tr-ct-btns">
            <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onPause}><PauseCircle size={14} aria-hidden="true" /> {settings.paused ? 'Unpause the form' : 'Pause the form'}</button>
            <button type="button" className="tr-btn tr-btn-sm tr-ct-danger" onClick={onKill}><Trash2 size={14} aria-hidden="true" /> Delete all pending and pause</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ---- One agent ------------------------------------------------------------------------
function CaseView({ userId, now, onBack, onChanged, setFlash, onCountersign }) {
  const [c, setC] = useState(null);
  const [error, setError] = useState('');
  const [shown, setShown] = useState({}); // key -> value
  const [busy, setBusy] = useState('');
  const [viewing, setViewing] = useState(null); // a decrypted file
  const timers = useRef({});
  const load = useCallback(async () => {
    const res = await fetchContractingCase(userId);
    if (!res.ok) { setError(contractingWords(res.error)); return; }
    setC(res.data); setError('');
  }, [userId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); setShown({}); }, []);

  if (error) return <div className="tr-ct-case"><button type="button" className="tr-ct-back" onClick={onBack}><ArrowLeft size={15} aria-hidden="true" /> Contracting</button><p className="tr-error">{error}</p></div>;
  if (!c) return <div className="tr-ct-case"><p className="tr-empty">Loading…</p></div>;
  const p = c.person || {};
  const info = c.info;
  const kase = c.case || {};
  const agreements = c.agreements || [];
  const latest = agreements[0] || null;
  const has = new Set(info ? info.fields : []);

  const hide = key => { clearTimeout(timers.current[key]); setShown(s => { const n = { ...s }; delete n[key]; return n; }); };
  async function reveal(key) {
    setBusy(`r-${key}`);
    const res = await revealField(userId, key, 'view');
    setBusy('');
    if (!res.ok) { setFlash(contractingWords(res.error)); if (res.error === 'gone') load(); return; }
    setShown(s => ({ ...s, [key]: res.data.value }));
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => hide(key), REVEAL_MS);
  }
  async function copy(key) {
    setBusy(`c-${key}`);
    const res = await revealField(userId, key, 'copy');
    setBusy('');
    if (!res.ok) { setFlash(contractingWords(res.error)); return; }
    try { await navigator.clipboard.writeText(res.data.value); setFlash(`${FIELD_LABELS[key]} copied. Paste it into SureLC.`); } catch { setFlash("Couldn't copy. Use Reveal instead."); }
  }
  async function viewFile(f) {
    setBusy(`f-${f.id}`);
    const res = await openContractingFile(userId, f.id);
    setBusy('');
    if (!res.ok) { setFlash(contractingWords(res.error)); return; }
    setViewing({ url: fileBlobUrl(res.data), mime: res.data.mime, name: res.data.name || 'file', label: FILE_LABELS[f.kind] || 'File' });
  }
  async function entered() {
    if (!(await askConfirm({ title: `Delete ${p.name}'s info now?`, body: "Only after it's all in SureLC. This deletes it from PaceLedger for good and can't be undone.", confirmLabel: 'Yes, it\'s in SureLC', danger: true }))) return;
    setBusy('entered');
    const res = await markEntered(userId);
    setBusy('');
    if (!res.ok) { setFlash(contractingWords(res.error)); return; }
    setShown({});
    setFlash(`Marked entered. ${p.name}'s info was deleted from PaceLedger.`);
    load(); onChanged();
  }
  async function step(stepKey, on) {
    setBusy(stepKey);
    const res = await markStep(userId, stepKey, on);
    setBusy('');
    if (!res.ok) { setFlash(contractingWords(res.error)); return; }
    load(); onChanged();
  }

  const stepRow = (done, label, when, action) => (
    <li className={done ? 'tr-ct-step-done' : ''}>
      <span className="tr-ct-step-dot" aria-hidden="true">{done ? <Check size={12} strokeWidth={3} /> : null}</span>
      <span className="tr-ct-step-main"><strong>{label}</strong>{when ? <i>{when}</i> : null}</span>
      {action || null}
    </li>
  );
  const entered_ = !!kase.entered_at && (!kase.info_deleted_at || kase.delete_reason === 'entered');
  const undo = key => <button type="button" className="tr-link-btn" disabled={busy === key} onClick={() => step(key, false)}>Undo</button>;
  const mark = (key, label) => <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" disabled={busy === key} onClick={() => step(key, true)}>{label}</button>;

  return (
    <div className="tr-ct-case">
      <button type="button" className="tr-ct-back" onClick={onBack}><ArrowLeft size={15} aria-hidden="true" /> Contracting</button>
      <div className="tr-ct-case-head">
        <div>
          <h2 className="tr-h2">{p.name}</h2>
          <p className="tr-subtitle">{[p.upline ? `Upline ${p.upline}` : '', p.solar_system, p.npn ? `NPN ${p.npn}` : '', p.email].filter(Boolean).join(' · ')}</p>
        </div>
        {info ? <span className={`tr-ct-pill ${hoursLeft(info.expires_at, now) < 24 ? 'tr-ct-pill-soon' : ''}`}><Clock size={14} aria-hidden="true" /> Deletes automatically in {timeLeft(info.expires_at, now)}</span> : null}
      </div>
      <div className="tr-ct-case-grid">
        <section className="tr-card tr-ct-fields">
          <h3 className="tr-h3">Contracting info</h3>
          {info ? (
            <>
              <p className="tr-ct-hint">Hidden until you reveal it, one field at a time; it hides again after 30 seconds. Copy goes straight to your clipboard to paste into SureLC. Every reveal and copy is logged.</p>
              {SECTIONS.map(sec => {
                const keys = sec.keys.filter(k => has.has(k));
                const files = (info.files || []).filter(f => (sec.files || []).includes(f.kind));
                if (!keys.length && !files.length) return null;
                return (
                  <div key={sec.title} className="tr-ct-sec-block">
                    <h4>{sec.title}</h4>
                    {keys.map(k => {
                      const v = shown[k];
                      const isBg = k === 'background';
                      return (
                        <div key={k} className={`tr-ct-frow ${v !== undefined ? 'tr-ct-frow-on' : ''}`}>
                          <span className="tr-ct-flabel">{FIELD_LABELS[k]}</span>
                          <span className="tr-ct-fval">{v === undefined ? maskFor(k) : isBg ? 'Shown below' : v}{v !== undefined ? <em>Hides in 30s</em> : null}</span>
                          <span className="tr-ct-fbtns">
                            {v === undefined
                              ? <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" disabled={busy === `r-${k}`} onClick={() => reveal(k)}><Eye size={14} aria-hidden="true" /> Reveal</button>
                              : <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => hide(k)}><EyeOff size={14} aria-hidden="true" /> Hide</button>}
                            {!isBg ? <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" disabled={busy === `c-${k}`} onClick={() => copy(k)}><Copy size={14} aria-hidden="true" /> Copy</button> : null}
                          </span>
                          {isBg && v !== undefined ? (
                            <ol className="tr-ct-bgread">
                              {readBackground(v).map(b => <li key={b.n} className={b.a === 'Yes' ? 'tr-ct-yes' : ''}><span>{b.n}. {b.q}</span><strong>{b.a}</strong>{b.note ? <p>{b.note}</p> : null}</li>)}
                            </ol>
                          ) : null}
                        </div>
                      );
                    })}
                    {files.map(f => (
                      <div key={f.id} className="tr-ct-frow">
                        <span className="tr-ct-flabel">{FILE_LABELS[f.kind]}</span>
                        <span className="tr-ct-fval tr-ct-quiet">{f.mime === 'application/pdf' ? 'PDF' : 'Photo'} · {Math.max(1, Math.round(f.size / 1024))} KB · encrypted</span>
                        <span className="tr-ct-fbtns"><button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" disabled={busy === `f-${f.id}`} onClick={() => viewFile(f)}><FileText size={14} aria-hidden="true" /> View</button></span>
                      </div>
                    ))}
                  </div>
                );
              })}
              <div className="tr-ct-enter">
                <button type="button" className="tr-btn tr-btn-brass" disabled={busy === 'entered'} onClick={entered}><Check size={16} aria-hidden="true" /> I entered it in SureLC</button>
                <span>Deletes all of it from PaceLedger right away.</span>
              </div>
            </>
          ) : (
            <p className="tr-empty">
              {entered_ ? `Entered in SureLC ${fmtWhen(kase.entered_at)}. Their info was deleted from PaceLedger.`
                : kase.delete_reason === 'expired' ? `Their info was deleted automatically 72 hours after they sent it (${fmtWhen(kase.info_deleted_at)}). They'll need to send it again.`
                : kase.delete_reason === 'withdrawn' ? `They withdrew their info ${fmtWhen(kase.info_deleted_at)}.`
                : kase.delete_reason === 'kill_switch' ? `Deleted by the kill switch ${fmtWhen(kase.info_deleted_at)}.`
                : latest && latest.status === 'completed' ? "They haven't sent their contracting info yet."
                : 'Their contracting form opens once their agreement is countersigned.'}
            </p>
          )}
        </section>
        <aside className="tr-ct-aside">
          <section className="tr-card">
            <h3 className="tr-h3">Steps</h3>
            <ol className="tr-ct-steps">
              {stepRow(!!(latest && latest.agent_signed_at), 'Signed the producer agreement', latest && latest.agent_signed_at ? fmtWhen(latest.agent_signed_at) : '')}
              {stepRow(!!(latest && latest.status === 'completed'), 'Countersigned', latest && latest.countersigned_at ? `${fmtWhen(latest.countersigned_at)}${latest.countersigner_name ? ` · ${latest.countersigner_name}` : ''}` : '',
                latest && latest.status === 'agent_signed' ? <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={() => onCountersign(latest)}>Countersign</button> : null)}
              {stepRow(!!kase.info_sent_at && (!!info || entered_), 'Sent contracting info', kase.info_sent_at ? fmtWhen(kase.info_sent_at) : '')}
              {stepRow(entered_, 'Entered in SureLC (info deleted)', entered_ ? fmtWhen(kase.entered_at) : '')}
              {stepRow(!!kase.review_sent_at, 'SureLC review request sent', kase.review_sent_at ? fmtWhen(kase.review_sent_at) : '',
                !entered_ ? null : kase.review_sent_at ? (!kase.agent_signed_at ? undo('review_sent') : null) : mark('review_sent', 'Mark sent'))}
              {stepRow(!!kase.agent_signed_at, 'They reviewed and signed in SureLC', kase.agent_signed_at ? fmtWhen(kase.agent_signed_at) : '',
                !kase.review_sent_at ? null : kase.agent_signed_at ? (!kase.sent_to_carrier_at ? undo('agent_signed') : null) : mark('agent_signed', 'Mark signed'))}
              {stepRow(!!kase.sent_to_carrier_at, 'Sent to the carrier', kase.sent_to_carrier_at ? fmtWhen(kase.sent_to_carrier_at) : '',
                !kase.agent_signed_at ? null : kase.sent_to_carrier_at ? undo('sent_to_carrier') : mark('sent_to_carrier', 'Mark sent'))}
              {stepRow(!!p.writing_number, 'Writing number', p.writing_number ? 'On file' : 'They add it in PaceLedger when it arrives')}
            </ol>
          </section>
          {agreements.length ? (
            <section className="tr-card">
              <h3 className="tr-h3">Producer agreement</h3>
              {agreements.map(a => (
                <div key={a.id} className="tr-ct-agrow">
                  <span><strong>{a.version}</strong><i>{a.status === 'completed' ? `Signed ${fmtDay(a.agent_signed_at)}${a.election ? ` · ${a.election}` : ''}` : agreementText({ agreement_status: a.status })}</i></span>
                  {a.pdf_path ? <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => openAgreementFile(a.pdf_path)}><Download size={14} aria-hidden="true" /> PDF</button> : null}
                  {a.audit_path ? <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => openAgreementFile(a.audit_path)}><Download size={14} aria-hidden="true" /> Audit</button> : null}
                </div>
              ))}
              {latest && latest.pdf_sha256 ? <p className="tr-ct-hint">Fingerprint (SHA-256) {latest.pdf_sha256.slice(0, 16)}…</p> : null}
            </section>
          ) : null}
          <section className="tr-card">
            <h3 className="tr-h3">Activity</h3>
            <p className="tr-ct-hint">Who did what and when. Never the info itself.</p>
            <ul className="tr-ct-log">
              {(c.log || []).length === 0 ? <li className="tr-ct-quiet">Nothing yet.</li> : c.log.map((l, i) => (
                <li key={i}><span>{fmtWhen(l.at)}</span><span>{l.actor ? <strong>{l.actor}</strong> : <strong>PaceLedger</strong>} {(LOG_WORDS[l.action] || l.action).toLowerCase()}{l.action === 'revealed' || l.action === 'copied' || l.action === 'viewed_file' ? `: ${l.detail}` : ''}</span></li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
      {viewing ? <FileViewer file={viewing} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}

// ---- Setup ----------------------------------------------------------------------------
function SetupView({ user, settings, onBack, onChanged, setFlash, bootstrap }) {
  const [staff, setStaffList] = useState(null);
  const [version, setVersion] = useState(settings.agreement_version || 'BIG-IAA-2026.1');
  const [template, setTemplate] = useState(settings.docuseal_template_id ? String(settings.docuseal_template_id) : '');
  const [newKey, setNewKey] = useState(null);
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState('');
  const loadStaff = useCallback(() => fetchStaffList().then(r => setStaffList(r.ok ? r.data : [])), []);
  useEffect(() => { loadStaff(); }, [loadStaff]);
  const webhook = `${supabase.supabaseUrl}/functions/v1/contracting?webhook=`;

  async function toggleStaff(s) {
    if (s.on && s.id === user.id && !(await askConfirm({ title: 'Take yourself off the team?', body: "You won't be able to open contracting until someone on the team adds you back.", confirmLabel: 'Take me off', danger: true }))) return;
    setBusy(s.id);
    const res = await setStaff(s.id, !s.on);
    setBusy('');
    if (!res.ok) { setFlash(contractingWords(res.error)); return; }
    loadStaff(); onChanged();
  }
  async function makeKey() {
    if (settings.key_id && !(await askConfirm({ title: 'Make a new encryption key?', body: 'The old key stops working. You\'ll paste the new private key into Supabase right after.', confirmLabel: 'Make a new key' }))) return;
    setBusy('key');
    const res = await makeNewKey();
    setBusy('');
    if (!res.ok) { setFlash(contractingWords(res.error)); return; }
    setNewKey(res);
    onChanged();
  }
  async function testKey() {
    setBusy('check');
    const s = await fetchContractingSettings(true);
    const res = await checkKey(s, user.id);
    setBusy('');
    setFlash(res.ok ? 'The edge function has the matching private key. Encryption is ready.' : contractingWords(res.error));
    if (res.ok) setNewKey(null);
    onChanged();
  }
  async function saveAgreement() {
    setBusy('agreement');
    const res = await setAgreement(version.trim(), Number(template));
    setBusy('');
    setFlash(res.ok ? 'Saved.' : contractingWords(res.error));
    onChanged();
  }
  async function testDocuSeal() {
    setBusy('ds');
    const res = await docusealCheck(Number(template) || null);
    setBusy('');
    setCheck(res.ok ? res.data : { ok: false, error: res.error });
  }
  async function onOff() {
    setBusy('on');
    const res = await setEnabled(!settings.enabled);
    setBusy('');
    setFlash(res.ok ? (settings.enabled ? 'Contracting is off. Agents see the old steps again.' : 'Contracting is on. Agents now sign and send their info in PaceLedger.') : contractingWords(res.error));
    onChanged();
  }
  const ready = settings.key_id && settings.key_verified_at && settings.agreement_version && settings.docuseal_template_id;

  return (
    <div className="tr-ct-setup">
      {!bootstrap ? <button type="button" className="tr-ct-back" onClick={onBack}><ArrowLeft size={15} aria-hidden="true" /> Contracting</button> : null}
      <h2 className="tr-h2">Contracting setup</h2>
      <p className="tr-subtitle">{bootstrap ? 'No one is on the contracting team yet. Add yourself first; after that only the team can change the team.' : 'Four things, in order. The setup guide in the PaceLedger project has the details.'}</p>

      <section className="tr-card tr-ct-setup-step">
        <h3 className="tr-h3"><Users size={17} aria-hidden="true" /> 1 · The contracting team</h3>
        <p className="tr-ct-hint">Only these super admins can open agents' info, countersign and change setup. Keep it to the people who do contracting.</p>
        {!staff ? <p className="tr-empty">Loading…</p> : (
          <ul className="tr-ct-staff">
            {staff.map(s => (
              <li key={s.id}>
                <span>{s.name}{s.id === user.id ? ' (you)' : ''}{s.on ? <i className="tr-ct-onteam"><Check size={13} aria-hidden="true" /> On the team</i> : null}</span>
                <button type="button" className={`tr-btn tr-btn-sm ${s.on ? 'tr-btn-ghost' : 'tr-btn-brass'}`} disabled={busy === s.id} onClick={() => toggleStaff(s)} aria-label={s.on ? `Remove ${s.name} from the team` : `Add ${s.name} to the team`}>{s.on ? 'Remove' : 'Add'}</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!bootstrap ? (
        <>
          <section className="tr-card tr-ct-setup-step">
            <h3 className="tr-h3"><KeyRound size={17} aria-hidden="true" /> 2 · Encryption key</h3>
            <p className="tr-ct-hint">Agents' phones lock their info with PaceLedger's public key. Only the edge function holds the private key that opens it.</p>
            <p>{settings.key_id ? <>Key <code>{settings.key_id}</code>, made {fmtDay(settings.key_set_at)}. {settings.key_verified_at ? <span className="tr-ct-ok">Checked {fmtDay(settings.key_verified_at)}.</span> : <span className="tr-ct-warn">Not checked yet.</span>}</> : 'No key yet.'}</p>
            {newKey ? (
              <div className="tr-ct-newkey" role="region" aria-label="New private key">
                <p><strong>Copy this private key into Supabase now. It's shown only this once.</strong></p>
                <ol>
                  <li>Supabase → Edge Functions → Secrets → Add new secret.</li>
                  <li>Name: <code>CONTRACTING_PRIVATE_KEY</code>. Value: the key below.</li>
                  <li>Save, then click "Check the key" here.</li>
                </ol>
                <textarea readOnly rows={4} value={newKey.privateText} onFocus={e => e.target.select()} aria-label="Private key" />
                <div className="tr-ct-btns">
                  <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(newKey.privateText); setFlash('Private key copied. Paste it into Supabase.'); } catch { setFlash('Select the text and copy it.'); } }}><Copy size={14} aria-hidden="true" /> Copy</button>
                </div>
                <p className="tr-ct-warn">Don't paste it anywhere else: not chat, email, notes or GitHub. If it ever leaks, make a new key.</p>
              </div>
            ) : null}
            <div className="tr-ct-btns">
              <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" disabled={busy === 'key'} onClick={makeKey}><KeyRound size={14} aria-hidden="true" /> {settings.key_id ? 'Make a new key' : 'Make the key'}</button>
              {settings.key_id ? <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" disabled={busy === 'check'} onClick={testKey}><ShieldCheck size={14} aria-hidden="true" /> Check the key</button> : null}
            </div>
          </section>

          <section className="tr-card tr-ct-setup-step">
            <h3 className="tr-h3"><FileText size={17} aria-hidden="true" /> 3 · Producer agreement (DocuSeal)</h3>
            <p className="tr-ct-hint">The attorney-approved agreement, uploaded to DocuSeal as a template with two roles ("Agent" and "BIG Insurance Network") and fields named Agent Name, Agent Email, Agreement Date and Agent Type.</p>
            <div className="tr-ct-grid2">
              <label className="tr-field"><span>Agreement version</span><input value={version} maxLength={40} onChange={e => setVersion(e.target.value)} /></label>
              <label className="tr-field"><span>DocuSeal template number</span><input inputMode="numeric" value={template} maxLength={12} onChange={e => setTemplate(e.target.value.replace(/\D/g, ''))} /></label>
            </div>
            <div className="tr-ct-btns">
              <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" disabled={busy === 'agreement' || !template || !version.trim()} onClick={saveAgreement}>Save</button>
              <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" disabled={busy === 'ds' || !template} onClick={testDocuSeal}>Check DocuSeal</button>
            </div>
            {check ? (
              check.ok ? (
                <div className="tr-ct-check">
                  <p><span className="tr-ct-ok">DocuSeal works.</span> Template: <strong>{check.name || '(no name)'}</strong>. Roles: {check.roles.join(', ') || 'none'}.</p>
                  {check.warnings.length ? <ul className="tr-ct-warn">{check.warnings.map(w => <li key={w}>{w}</li>)}</ul> : <p className="tr-ct-ok">Roles and fields look right.</p>}
                  <p>{check.webhook ? 'Webhook token: set.' : <span className="tr-ct-warn">Webhook token (DOCUSEAL_WEBHOOK_TOKEN) isn't set.</span>} {check.email ? 'Emails: set.' : <span className="tr-ct-warn">Email keys aren't set, so the team won't get emails.</span>} {check.privateKey ? '' : <span className="tr-ct-warn">Private key isn't set.</span>}</p>
                </div>
              ) : <p className="tr-error">{check.error === 'bad_api_key' ? "DocuSeal didn't accept the API key (DOCUSEAL_API_KEY)." : check.error === 'template_not_found' ? 'DocuSeal has no template with that number.' : contractingWords(check.error)}</p>
            ) : null}
            <p className="tr-ct-hint">DocuSeal webhook URL (DocuSeal → Settings → Webhooks): <code>{webhook}</code><em>your-token</em>, with the same token as DOCUSEAL_WEBHOOK_TOKEN.</p>
          </section>

          <section className="tr-card tr-ct-setup-step">
            <h3 className="tr-h3"><Settings size={17} aria-hidden="true" /> 4 · Turn it on</h3>
            <p className="tr-ct-hint">When it's on, agents sign their agreement and send their info right here, instead of the contracting-link steps. Turning it off brings those back.</p>
            <p>Contracting is <strong>{settings.enabled ? 'on' : 'off'}</strong>{settings.paused ? ' (the form is paused)' : ''}.</p>
            <button type="button" className={`tr-btn tr-btn-sm ${settings.enabled ? 'tr-btn-ghost' : 'tr-btn-brass'}`} disabled={busy === 'on' || (!settings.enabled && !ready)} onClick={onOff}>{settings.enabled ? 'Turn it off' : 'Turn it on'}</button>
            {!settings.enabled && !ready ? <p className="tr-ct-hint">Finish steps 2 and 3 first.</p> : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

function LogView({ onBack }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { fetchAdminLog().then(r => { if (r.ok) setRows(r.data); else setError(contractingWords(r.error)); }); }, []);
  return (
    <div className="tr-ct-case">
      <button type="button" className="tr-ct-back" onClick={onBack}><ArrowLeft size={15} aria-hidden="true" /> Contracting</button>
      <h2 className="tr-h2">Activity log</h2>
      <p className="tr-subtitle">Every view, copy, deletion and setup change, newest first. It can't be edited or deleted. It never holds the info itself.</p>
      {error ? <p className="tr-error">{error}</p> : null}
      <div className="tr-card">
        {!rows ? <p className="tr-empty">Loading…</p> : rows.length === 0 ? <p className="tr-empty">Nothing yet.</p> : (
          <ul className="tr-ct-log tr-ct-log-wide">
            {rows.map((l, i) => (
              <li key={i}><span>{fmtWhen(l.at)}</span><span><strong>{l.actor || 'PaceLedger'}</strong> {(LOG_WORDS[l.action] || l.action).toLowerCase()}{l.agent ? ` · ${l.agent}` : ''}{l.detail && (l.action === 'revealed' || l.action === 'copied' || l.action === 'viewed_file' || !l.agent) ? ` · ${l.detail}` : ''}</span></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---- The screen -------------------------------------------------------------------------
function Desk({ user }) {
  const [settings, setSettings] = useState(null);
  const [rows, setRows] = useState(null);
  const [denied, setDenied] = useState(''); // '' | 'bootstrap' | 'not_staff'
  const [view, setView] = useState({ name: 'queue' });
  const [flash, setFlash] = useState('');
  const [busy, setBusy] = useState('');
  const [countersign, setCountersign] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [nonce, setNonce] = useState(0);
  const firstSetup = useRef(false); // just added the first person: carry on with Setup
  const load = useCallback(async () => {
    const [s, q] = await Promise.all([fetchContractingSettings(true), fetchContractingQueue()]);
    setSettings(s || {});
    if (q.ok) {
      setRows(q.data || []); setDenied('');
      if (firstSetup.current) { firstSetup.current = false; setView({ name: 'setup' }); }
      return;
    }
    if (q.error === 'not_contracting_staff') {
      const team = await fetchStaffList();
      firstSetup.current = team.ok;
      setDenied(team.ok ? 'bootstrap' : 'not_staff');
      setRows([]);
      return;
    }
    setFlash(contractingWords(q.error));
    setRows([]);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!flash) return undefined; const t = setTimeout(() => setFlash(''), 6000); return () => clearTimeout(t); }, [flash]);
  const say = setFlash;

  async function step(q, stepKey) {
    setBusy(q.user_id);
    const res = await markStep(q.user_id, stepKey, true);
    setBusy('');
    if (!res.ok) { say(contractingWords(res.error)); return; }
    load();
  }
  async function kill() {
    if (!(await askConfirm({ title: 'Delete all pending info and pause?', body: 'Every submission waiting to be entered is deleted for good, and agents can\'t send new ones until you unpause. Use this if something looks wrong.', confirmLabel: 'Delete all and pause', danger: true }))) return;
    const res = await killSwitch();
    say(res.ok ? `Deleted ${res.data} submission${res.data === 1 ? '' : 's'} and paused the form.` : contractingWords(res.error));
    load();
  }
  async function pause() {
    const res = await setPaused(!settings.paused);
    say(res.ok ? (settings.paused ? 'The form is open again.' : 'Paused. Agents can\'t send new info until you unpause.') : contractingWords(res.error));
    load();
  }
  async function reviewed() {
    const res = await markReviewed();
    say(res.ok ? 'Access review recorded.' : contractingWords(res.error));
    load();
  }

  if (!settings || !rows) return <div className="tr-card"><p className="tr-empty">Loading…</p></div>;
  if (denied === 'not_staff') {
    return <div className="tr-card tr-ct-denied"><Lock size={20} aria-hidden="true" /><p>You're not on the contracting team. Someone on the team can add you in Contracting → Setup.</p></div>;
  }
  return (
    <div className="tr-ct-desk">
      {flash ? <div className="tr-flash tr-ct-flash" role="status">{flash}</div> : null}
      {denied === 'bootstrap' || view.name === 'setup' ? (
        <SetupView user={user} settings={settings} bootstrap={denied === 'bootstrap'} setFlash={say}
          onBack={() => setView({ name: 'queue' })} onChanged={load} />
      ) : view.name === 'case' ? (
        <CaseView key={`${view.userId}-${nonce}`} userId={view.userId} now={now} setFlash={say} onChanged={load}
          onBack={() => { setView({ name: 'queue' }); load(); }} onCountersign={a => setCountersign(a)} />
      ) : view.name === 'log' ? (
        <LogView onBack={() => setView({ name: 'queue' })} />
      ) : (
        <>
          <div className="tr-ct-head">
            <div className="tr-ct-safe">
              <span><ShieldCheck size={15} aria-hidden="true" /> Two-step login verified</span>
              <span><Clock size={15} aria-hidden="true" /> Locks after 15 minutes idle</span>
              <span><Eye size={15} aria-hidden="true" /> Every view and copy is logged</span>
              <span className={`tr-ct-state ${settings.enabled ? (settings.paused ? 'tr-ct-state-paused' : 'tr-ct-state-on') : ''}`}>{settings.enabled ? (settings.paused ? 'Paused' : 'On') : 'Off'}</span>
            </div>
            <div className="tr-ct-btns">
              <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => setView({ name: 'log' })}><ListChecks size={14} aria-hidden="true" /> Activity log</button>
              <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => setView({ name: 'setup' })}><Settings size={14} aria-hidden="true" /> Setup</button>
            </div>
          </div>
          {!settings.enabled ? <p className="tr-ct-off">Contracting in PaceLedger is off: agents still see the contracting-link steps. Finish <button type="button" className="tr-link-btn" onClick={() => setView({ name: 'setup' })}>Setup</button> to turn it on.</p> : null}
          <Queue rows={rows} settings={settings} now={now} busy={busy}
            onOpen={id => setView({ name: 'case', userId: id })} onCountersign={q => setCountersign({ id: q.agreement_id, agent_name: q.name })}
            onStep={step} onSetup={() => setView({ name: 'setup' })} onLog={() => setView({ name: 'log' })}
            onKill={kill} onPause={pause} onReviewed={reviewed} />
        </>
      )}
      {countersign ? <CountersignSheet agreement={countersign} onClose={() => { setCountersign(null); setNonce(n => n + 1); load(); }} onDone={load} /> : null}
    </div>
  );
}

export function ContractingBody({ user }) {
  return <TwoStepGate title="Contracting"><Desk user={user} /></TwoStepGate>;
}
