// In-app confirm boxes and Undo, instead of the browser's pop-ups.
//
//   if (!(await askConfirm({ title: 'Delete this note?', confirmLabel: 'Delete', danger: true }))) return;
//   const pick = await askChoice({ title, body, choices: [{ value: 'one', label: 'Just this date' }, ...] });
//   const note = await askText({ title, label, placeholder });          // null when cancelled
//   undoable({ text: 'Note deleted', apply, revert, commit });
//
// The boxes are drawn by <DialogHost />, mounted once at the root of the
// app. Before it's mounted (signing in), askConfirm falls back to the
// browser's own box so nothing is ever silently skipped.
//
// undoable(): the change shows right away (apply), and the real delete
// (commit) waits a few seconds so "Undo" can put it back (revert). It's
// committed when the time's up, when another one starts, or when the app is
// put away. If the commit fails, it's put back and the person is told.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Undo2, X } from 'lucide-react';
import { Modal } from './ui.jsx';

const UNDO_MS = 6000;
let host = null; // { open(dialog), undo(item) } while <DialogHost /> is mounted
let seq = 0;
// The browser's own boxes instead, and no Undo wait: only for automated
// tests written before these boxes existed (they set this flag).
const live = () => host && !(typeof window !== 'undefined' && window.__plNativeDialogs);

export function askConfirm({ title, body = '', confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false }) {
  if (!live()) return Promise.resolve(window.confirm([title, body].filter(Boolean).join('\n\n')));
  return new Promise(resolve => host.open({ kind: 'confirm', title, body, confirmLabel, cancelLabel, danger, resolve }));
}

// choices: [{ value, label, sub?, danger? }]. Resolves to the value picked,
// or null for Cancel.
export function askChoice({ title, body = '', choices, cancelLabel = 'Cancel' }) {
  if (!live()) return Promise.resolve(window.confirm([title, body].filter(Boolean).join('\n\n')) ? choices[0].value : null);
  return new Promise(resolve => host.open({ kind: 'choice', title, body, choices, cancelLabel, resolve }));
}

// A box with a text field. Resolves to the text (may be empty), or null for
// Cancel.
export function askText({ title, body = '', label = '', placeholder = '', confirmLabel = 'OK', cancelLabel = 'Cancel', initial = '', multiline = true }) {
  if (!live()) { const v = window.prompt([title, body].filter(Boolean).join('\n\n'), initial); return Promise.resolve(v); }
  return new Promise(resolve => host.open({ kind: 'text', title, body, label, placeholder, confirmLabel, cancelLabel, initial, multiline, resolve }));
}

export function undoable({ text, apply, revert, commit, failText }) {
  if (!live()) {
    // No Undo bar here: just do it.
    apply && apply();
    return Promise.resolve(commit()).then(ok => { if (ok === false && revert) revert(); });
  }
  host.undo({ text, apply, revert, commit, failText });
  return undefined;
}

// The everyday delete of one thing in a list: an in-app confirm, then it's
// gone with Undo. setList is the list's state setter; sort puts it back in
// order on Undo. Returns false if they changed their mind.
export const newestFirst = (a, b) => String(b.created_at || b.createdAt || '').localeCompare(String(a.created_at || a.createdAt || ''));
export async function confirmDelete({ title, body = '', confirmLabel = 'Delete', undoText, item, setList, commit, failText, sort = null }) {
  if (!(await askConfirm({ title, body, confirmLabel, danger: true }))) return false;
  undoable({
    text: undoText,
    apply: () => setList(prev => (prev || []).filter(x => x.id !== item.id)),
    revert: () => setList(prev => {
      const list = prev || [];
      if (list.some(x => x.id === item.id)) return list;
      const next = [...list, item];
      return sort ? next.sort(sort) : next;
    }),
    commit,
    failText,
  });
  return true;
}

// Settles any delete still waiting for its Undo time (tests, and before the
// app is put away).
export function flushUndo() { if (host) host.flush(); }

// A few lines of text, keeping its line breaks as paragraphs.
function Body({ text }) {
  if (!text) return null;
  const parts = String(text).split(/\n{2,}/);
  return <div className="tr-confirm-body">{parts.map((p, i) => <p key={i}>{p}</p>)}</div>;
}

function DialogBox({ d, onDone }) {
  const [value, setValue] = useState(d.initial || '');
  const safe = useRef(null);
  const field = useRef(null);
  // The safe choice has the focus (Cancel), or the text field.
  useEffect(() => {
    const t = setTimeout(() => { if (d.kind === 'text' && field.current) field.current.focus(); else if (safe.current) safe.current.focus(); }, 0);
    return () => clearTimeout(t);
  }, [d]);
  const cancel = () => onDone(d.kind === 'confirm' ? false : null);
  const id = 'tr-confirm-title';
  // At the end of the page, so it's over any window already open (and
  // takes Escape first).
  return createPortal(
    <Modal onClose={cancel} className={`tr-confirm ${d.danger ? 'tr-confirm-danger' : ''}`} labelledBy={id}>
      <div className="tr-confirm-head">
        {d.danger ? <span className="tr-confirm-icon" aria-hidden="true"><AlertTriangle size={18} /></span> : null}
        <h3 className="tr-h3" id={id}>{d.title}</h3>
      </div>
      <Body text={d.body} />
      {d.kind === 'text' ? (
        <label className="tr-field tr-confirm-field">
          {d.label ? <span>{d.label}</span> : null}
          {d.multiline
            ? <textarea ref={field} rows={3} value={value} placeholder={d.placeholder} onChange={e => setValue(e.target.value)} />
            : <input ref={field} value={value} placeholder={d.placeholder} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onDone(value); } }} />}
        </label>
      ) : null}
      {d.kind === 'choice' ? (
        <div className="tr-confirm-choices">
          {d.choices.map(c => (
            <button key={c.value} type="button" className={`tr-confirm-choice ${c.danger ? 'tr-confirm-choice-danger' : ''}`} onClick={() => onDone(c.value)}>
              <strong>{c.label}</strong>
              {c.sub ? <span>{c.sub}</span> : null}
            </button>
          ))}
          <button ref={safe} type="button" className="tr-btn tr-btn-ghost tr-confirm-cancel" onClick={cancel}>{d.cancelLabel}</button>
        </div>
      ) : (
        <div className="tr-confirm-actions">
          <button ref={safe} type="button" className="tr-btn tr-btn-ghost" onClick={cancel}>{d.cancelLabel}</button>
          <button type="button" className={`tr-btn ${d.danger ? 'tr-btn-danger' : 'tr-btn-brass'}`} onClick={() => onDone(d.kind === 'text' ? value : true)}>{d.confirmLabel}</button>
        </div>
      )}
    </Modal>,
    document.querySelector('.tr-root') || document.body,
  );
}

export function DialogHost() {
  const [dialogs, setDialogs] = useState([]);
  const [pending, setPending] = useState(null); // the delete waiting for its Undo time
  const [notice, setNotice] = useState(null);   // "Couldn't delete …"
  const pendingRef = useRef(null);
  const timer = useRef(null);

  function settle(item, undo) {
    if (!item) return;
    clearTimeout(timer.current);
    if (pendingRef.current === item) { pendingRef.current = null; setPending(null); }
    if (undo) { item.revert && item.revert(); return; }
    Promise.resolve()
      .then(() => item.commit())
      .catch(() => false)
      .then(ok => {
        if (ok === false) {
          item.revert && item.revert();
          setNotice(item.failText || "Couldn't do that. Check your connection and try again. It's been put back.");
        }
      });
  }

  useEffect(() => {
    host = {
      open: d => setDialogs(list => [...list, { ...d, id: ++seq }]),
      undo: item => {
        if (pendingRef.current) settle(pendingRef.current, false);
        item.apply && item.apply();
        pendingRef.current = item;
        setPending({ ...item, at: Date.now() });
        clearTimeout(timer.current);
        timer.current = setTimeout(() => { if (pendingRef.current === item) settle(item, false); }, UNDO_MS);
      },
      flush: () => { if (pendingRef.current) settle(pendingRef.current, false); },
    };
    // Put away (another app, phone locked, tab closed): do it now.
    const away = () => { if (document.visibilityState === 'hidden' && pendingRef.current) settle(pendingRef.current, false); };
    const leaving = () => { if (pendingRef.current) settle(pendingRef.current, false); };
    document.addEventListener('visibilitychange', away);
    window.addEventListener('pagehide', leaving);
    return () => {
      host = null;
      document.removeEventListener('visibilitychange', away);
      window.removeEventListener('pagehide', leaving);
      if (pendingRef.current) settle(pendingRef.current, false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(t);
  }, [notice]);

  const top = dialogs[0];
  function done(result) {
    top.resolve(result);
    setDialogs(list => list.slice(1));
  }
  return (
    <>
      {top ? <DialogBox key={top.id} d={top} onDone={done} /> : null}
      {pending ? (
        <div className="tr-undo" role="status" aria-live="polite">
          <span className="tr-undo-text">{pending.text}</span>
          <button type="button" className="tr-undo-btn" onClick={() => settle(pendingRef.current, true)}><Undo2 size={15} aria-hidden="true" /> Undo</button>
          <button type="button" className="tr-undo-close" aria-label="Dismiss" onClick={() => settle(pendingRef.current, false)}><X size={15} /></button>
          <span key={pending.at} className="tr-undo-time" aria-hidden="true" style={{ animationDuration: `${UNDO_MS}ms` }} />
        </div>
      ) : null}
      {notice ? (
        <div className="tr-toast tr-toast-error" role="alert">
          {notice}
          <button type="button" className="tr-toast-close" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
        </div>
      ) : null}
    </>
  );
}
