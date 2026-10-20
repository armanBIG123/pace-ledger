// Call and Text: buttons that use the phone itself, and a few ready-made
// texts to pick from. Texts open in your own Messages app with the words
// filled in; PaceLedger never sends a text by itself.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, MessageSquareText, Phone } from 'lucide-react';
import { fmtPhone, smsHref, telHref } from '../lib/phone.js';
import { EmailButton } from './email.jsx';
import { Modal } from './ui.jsx';

const AGENCY = 'Big Insurance Network';
const firstOf = n => (n || '').trim().split(/\s+/)[0] || '';
// "it's Arman with Big Insurance Network" (or just the agency, without a name).
const fromLine = m => (m ? `it's ${m} with ${AGENCY}` : `it's ${AGENCY}`);

// Texts for someone on your list.
export function prospectTexts(name, me) {
  const f = firstOf(name), m = firstOf(me);
  return [
    { label: 'Say hello', text: `Hi ${f}, ${fromLine(m)}. Do you have a few minutes this week to catch up?` },
    { label: 'Follow up', text: `Hi ${f}, ${m ? `it's ${m}` : fromLine('')}. Following up on our conversation. Would a quick call this week work for you?` },
    { label: 'Thanks', text: `Thanks for your time, ${f}. Reach out any time with questions.` },
  ];
}

// "tonight at 7:00 PM", "today at 11:00 AM", "tomorrow at 7:00 PM", or
// "Thursday, Oct 22 at 7:00 PM".
export function whenText(dateStr, timeStr) {
  if (!dateStr) return 'our appointment';
  const d = new Date(`${dateStr}T${(timeStr || '12:00').slice(0, 5)}:00`);
  const today = new Date(); const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
  const time = timeStr ? ` at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : '';
  if (d.toDateString() === today.toDateString()) return `${timeStr && d.getHours() >= 17 ? 'tonight' : 'today'}${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow${time}`;
  return `${d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}${time}`;
}

// Texts for an appointment's client.
export function appointmentTexts(appt, me) {
  const f = firstOf(appt.client), m = firstOf(me);
  const zoom = appt.zoomUrl ? ` Here's your Zoom link: ${appt.zoomUrl}` : '';
  return [
    { label: 'Reminder', text: `Hi ${f}, ${fromLine(m)}. Looking forward to ${whenText(appt.appointmentDate, appt.appointmentTime)}.${zoom}` },
    { label: 'Running a few minutes late', text: `Hi ${f}, running about 5 minutes behind.${appt.zoomUrl ? ' Same Zoom link.' : ''} See you shortly!` },
    { label: 'Thanks for your time', text: `Thanks for meeting with us, ${f}. Reach out any time with questions.` },
  ];
}

function TextSheet({ name, phone, texts, onClose }) {
  const [pick, setPick] = useState(0);
  const [body, setBody] = useState(texts.length ? texts[0].text : '');
  const [copied, setCopied] = useState('');
  // Start inside the window, so Escape closes it and Tab moves through it.
  const box = useRef(null);
  useEffect(() => { if (box.current) box.current.focus(); }, []);
  async function copy(what, value) {
    try { await navigator.clipboard.writeText(value); setCopied(what); } catch { setCopied(''); }
  }
  return (
    <Modal onClose={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="tr-text-title" ref={box} tabIndex={-1} className="tr-text-sheet">
        <h3 className="tr-h3" id="tr-text-title" style={{ marginBottom: 2 }}>Text {name}</h3>
        <p className="tr-subtitle">{fmtPhone(phone)} · pick one, change it if you like</p>
        <div className="tr-text-picks" role="radiogroup" aria-label="Message">
          {texts.map((t, i) => (
            <button key={t.label} type="button" role="radio" aria-checked={pick === i} className={`tr-text-pick ${pick === i ? 'tr-text-pick-on' : ''}`}
              onClick={() => { setPick(i); setBody(t.text); setCopied(''); }}>
              <strong>{t.label}</strong><span>{t.text}</span>
            </button>
          ))}
        </div>
        <label className="tr-field">
          <span>Message</span>
          <textarea rows={3} value={body} onChange={e => { setBody(e.target.value); setCopied(''); }} />
        </label>
        <div className="tr-form-actions">
          <button type="button" className="tr-btn tr-btn-ghost" onClick={() => copy('text', body)}><Copy size={14} /> {copied === 'text' ? 'Copied' : 'Copy text'}</button>
          <a className="tr-btn tr-btn-brass" href={smsHref(phone, body)} onClick={() => setTimeout(onClose, 300)}><MessageSquareText size={15} /> Open in Messages</a>
        </div>
        <p className="tr-text-note">Sends from your own phone number. On a computer, Copy text and send it from your phone if Messages doesn't open.</p>
      </div>
    </Modal>
  );
}

// compact: icon-only (for tight rows).
export function CallButton({ phone, compact = false }) {
  if (!phone) return null;
  return (
    <a className={`tr-btn tr-btn-sm tr-btn-call ${compact ? 'tr-btn-icononly' : ''}`} href={telHref(phone)} title={`Call ${fmtPhone(phone)}`} aria-label={`Call ${fmtPhone(phone)}`}>
      <Phone size={14} aria-hidden="true" />{compact ? null : ' Call'}
    </a>
  );
}

export function TextButton({ phone, name, texts, compact = false }) {
  const [open, setOpen] = useState(false);
  if (!phone) return null;
  return (
    <>
      <button type="button" className={`tr-btn tr-btn-sm tr-btn-ghost ${compact ? 'tr-btn-icononly' : ''}`} onClick={() => setOpen(true)} title={`Text ${name}`} aria-label={`Text ${name}`}>
        <MessageSquareText size={14} aria-hidden="true" />{compact ? null : ' Text'}
      </button>
      {open && createPortal(<TextSheet name={name} phone={phone} texts={texts} onClose={() => setOpen(false)} />, document.querySelector('.tr-root') || document.body)}
    </>
  );
}

// The number with Call and Text, and the email with Email, wherever someone's
// contact details show.
export function ContactRow({ phone, email, name, texts }) {
  if (!phone && !email) return null;
  return (
    <div className="tr-contact-links">
      {phone ? (
        <>
          <CallButton phone={phone} />
          <TextButton phone={phone} name={name} texts={texts} />
          <span className="tr-contact-detail tr-contact-phone">{fmtPhone(phone)}</span>
        </>
      ) : null}
      {email ? (
        <>
          <EmailButton to={email.trim()} Icon={null} />
          <span className="tr-contact-detail">{email.trim()}</span>
        </>
      ) : null}
    </div>
  );
}
