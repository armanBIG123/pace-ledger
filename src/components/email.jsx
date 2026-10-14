// Emailing someone from PaceLedger: a small window with a ready-to-send
// message you can edit, then open it in Gmail, Outlook or your email app,
// or copy it. (A plain email link does nothing on a computer with no email
// app set up, which is most people who use Gmail or Outlook in a browser.)
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Mail, X } from 'lucide-react';
import { isNativeApp, openInBrowserSheet } from '../native.js';

const enc = s => encodeURIComponent(s || '');
export const gmailComposeUrl = ({ to, subject, body }) => `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(to)}&su=${enc(subject)}&body=${enc(body)}`;
export const outlookComposeUrl = ({ to, subject, body }) => `https://outlook.office.com/mail/deeplink/compose?to=${enc(to)}&subject=${enc(subject)}&body=${enc(body)}`;
export const mailtoUrl = ({ to, subject, body }) => `mailto:${to}?subject=${enc(subject)}&body=${enc(body)}`;

// Web pages open in a new tab on a computer; in the phone app they open in
// an in-app browser sheet.
export function webLinkProps(url) {
  if (isNativeApp()) return { href: url, onClick: e => { e.preventDefault(); openInBrowserSheet(url).catch(() => {}); } };
  return { href: url, target: '_blank', rel: 'noopener noreferrer' };
}

export function ComposeEmail({ to, name, subject: initialSubject = '', body: initialBody = '', onClose }) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [copied, setCopied] = useState('');
  const closeRef = useRef(null);
  useEffect(() => {
    if (closeRef.current) closeRef.current.focus({ preventScroll: true });
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const msg = { to, subject, body };
  async function copy(what) {
    const text = what === 'address' ? to : `${subject ? `${subject}\n\n` : ''}${body}`;
    try { await navigator.clipboard.writeText(text); setCopied(what); } catch { window.prompt('Copy this:', text); }
    setTimeout(() => setCopied(''), 2500);
  }
  const first = (name || '').trim().split(/\s+/)[0] || to;
  return (
    <div className="tr-modal-backdrop" onClick={onClose}>
      <div className="tr-modal-card tr-compose" role="dialog" aria-modal="true" aria-labelledby="tr-compose-title" onClick={e => e.stopPropagation()}>
        <div className="tr-row-head">
          <h3 className="tr-h3" id="tr-compose-title" style={{ margin: 0 }}>Email {first}</h3>
          <button ref={closeRef} type="button" className="tr-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="tr-compose-to">
          <span>To</span><strong>{to}</strong>
          <button type="button" className="tr-link-btn" onClick={() => copy('address')}>{copied === 'address' ? 'Copied' : 'Copy'}</button>
        </div>
        <label className="tr-field">
          <span>Subject</span>
          <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={150} />
        </label>
        <label className="tr-field">
          <span>Message</span>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={7} maxLength={3000} />
        </label>
        <div className="tr-compose-label">Open it in</div>
        <div className="tr-compose-actions">
          <a className="tr-btn tr-btn-brass tr-btn-sm" {...webLinkProps(gmailComposeUrl(msg))} onClickCapture={() => setTimeout(onClose, 300)}>Gmail</a>
          <a className="tr-btn tr-btn-ghost tr-btn-sm" {...webLinkProps(outlookComposeUrl(msg))} onClickCapture={() => setTimeout(onClose, 300)}>Outlook</a>
          <a className="tr-btn tr-btn-ghost tr-btn-sm" href={mailtoUrl(msg)} onClick={() => setTimeout(onClose, 300)}><Mail size={14} /> Email app</a>
          <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => copy('message')}><Copy size={14} /> {copied === 'message' ? 'Copied' : 'Copy message'}</button>
        </div>
        <p className="tr-compose-note">Nothing is sent until you press Send in your email.</p>
      </div>
    </div>
  );
}

// A button that opens ComposeEmail. `label` and `icon` set how it looks.
export function EmailButton({ to, name, subject, body, label = 'Email', Icon = Mail, className = 'tr-btn tr-btn-ghost tr-btn-sm' }) {
  const [open, setOpen] = useState(false);
  if (!to) return null;
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{Icon ? <Icon size={14} /> : null} {label}</button>
      {/* Rendered at the top of the app, so it isn't trapped inside a card or popover. */}
      {open && createPortal(<ComposeEmail to={to.trim()} name={name} subject={subject} body={body} onClose={() => setOpen(false)} />, document.querySelector('.tr-root') || document.body)}
    </>
  );
}
