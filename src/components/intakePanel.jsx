// Sending a client their intake form, from anywhere: Follow-up, the
// appointment window, + New, right after Log how it went, and Today's
// nudges. One window makes the link (or finds the one already made) and
// texts it (Messages opens with the link filled in), emails it (sent from
// PaceLedger) or copies it. It notes how and when it went, so Follow-up and
// Today can say "Texted Oct 22" and nudge clients who haven't filled it in.
// Mounted once per view (see RoleViews), like the appointment window.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, Copy, FileText, Mail, MessageSquareText, Search, X } from 'lucide-react';
import { buildIntakeLink, createClientIntakeCandidate, fetchIntakeForAppointment, fetchMyIntakeStatus, markIntakeSent, sendIntakeEmail } from '../clientIntake.js';
import { fetchMyAppointments, isPastAppointment, saveAppointmentContact, setAppointmentIntakeRequested } from '../data/appointments.js';
import { apptStartMs, fmtApptDateTime } from '../lib/dates.js';
import { isValidEmail } from '../lib/format.js';
import { intakeChanged, openIntakeSend } from '../lib/intakeEvents.js';
import { dayWord, intakeStatusText, intakeStatusTone } from '../lib/intakeStatus.js';
import { fmtPhone, isValidPhone, smsHref } from '../lib/phone.js';
import { isNativeApp, shareOrCopy } from '../native.js';
import { whenText } from './contact.jsx';
import { Modal, Sheet, useIsPhone } from './ui.jsx';

export { intakeStatusText, openIntakeSend };

const AGENCY = 'Big Insurance Network';
const firstOf = n => String(n || '').trim().split(/\s+/)[0] || '';

// The words that go with the link.
export function intakeMessage(appointment, me, link) {
  const f = firstOf(appointment.client);
  const from = firstOf(me) ? `it's ${firstOf(me)} with ${AGENCY}` : `it's ${AGENCY}`;
  const ahead = !isPastAppointment(appointment) && appointment.appointmentDate;
  return ahead
    ? `Hi ${f}, ${from}. Before we meet ${whenText(appointment.appointmentDate, appointment.appointmentTime)}, could you fill in this short form? It takes about 10 minutes and saves as you go: ${link}`
    : `Hi ${f}, ${from}. Thanks for meeting with us. Could you fill in this short form so we can put your plan together? It takes about 10 minutes and saves as you go: ${link}`;
}

// One link per appointment, even if the window is opened twice at once.
const making = new Map();
function findOrMake(user, appointment) {
  if (making.has(appointment.id)) return making.get(appointment.id);
  const p = (async () => {
    const found = await fetchIntakeForAppointment(user.id, appointment.id);
    if (found) return { ok: true, record: found };
    const res = await createClientIntakeCandidate({ advisorId: user.id, advisorName: user.displayName, appointmentId: appointment.id, clientName: appointment.client });
    if (res.ok) setAppointmentIntakeRequested(appointment.id, true);
    return res;
  })();
  making.set(appointment.id, p);
  p.finally(() => setTimeout(() => making.delete(appointment.id), 2000));
  return p;
}

export function IntakePanel({ user }) {
  const [req, setReq] = useState(null);
  useEffect(() => {
    const on = e => setReq((e && e.detail) || null);
    window.addEventListener('paceledger:open-intake', on);
    return () => window.removeEventListener('paceledger:open-intake', on);
  }, []);
  if (!req) return null;
  const close = () => setReq(null);
  if (req.pick) return <IntakePicker user={user} onPick={appointment => setReq({ appointment })} onClose={close} />;
  if (!req.appointment) return null;
  return <IntakeSendWindow key={req.appointment.id} user={user} appointment={req.appointment} candidate={req.candidate || null} onClose={close} />;
}

// A window on a computer, a sheet from the bottom on a phone.
function Frame({ title, onClose, children, foot = null }) {
  const isPhone = useIsPhone();
  const head = (
    <div className={isPhone ? 'tr-fsheet-head' : 'tr-modal-head'}>
      <h3 className="tr-h3" id="tr-intake-title">{title}</h3>
      <button type="button" className={`tr-icon-btn ${isPhone ? 'tr-fsheet-close' : ''}`} onClick={onClose} aria-label="Close"><X size={18} /></button>
    </div>
  );
  if (isPhone) {
    return (
      <Sheet labelledBy="tr-intake-title" onClose={onClose}>
        {head}
        <div className="tr-fsheet-body tr-intake-body">{children}</div>
        {foot ? <div className="tr-fsheet-actions">{foot}</div> : null}
      </Sheet>
    );
  }
  return (
    <Modal onClose={onClose} labelledBy="tr-intake-title" className="tr-intake-modal">
      {head}
      <div className="tr-intake-body">{children}</div>
      {foot ? <div className="tr-form-actions">{foot}</div> : null}
    </Modal>
  );
}

function IntakeSendWindow({ user, appointment, candidate: initial, onClose }) {
  const [cand, setCand] = useState(initial);
  const [error, setError] = useState('');
  const [phone, setPhone] = useState(appointment.clientPhone || '');
  const [email, setEmail] = useState(appointment.clientEmail || '');
  const [asking, setAsking] = useState(null); // 'phone' | 'email' while typing one in
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null); // { kind: 'ok' | 'warn', text }
  useEffect(() => {
    if (cand) return undefined;
    let alive = true;
    findOrMake(user, appointment).then(res => {
      if (!alive) return;
      if (!res.ok) { setError("Couldn't make their link. Check your connection and try again."); return; }
      setCand(res.record);
      intakeChanged({ candidate: res.record });
    });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const link = cand ? buildIntakeLink(cand.token) : '';
  const message = cand ? intakeMessage(appointment, user.displayName, link) : '';
  const first = firstOf(appointment.client) || 'them';
  const phoneOk = isValidPhone(phone);
  const emailOk = isValidEmail(email);

  async function recordSent(via) {
    const res = await markIntakeSent(cand.id, via);
    const next = { ...cand, ...(res || { sent_at: new Date().toISOString(), sent_via: via }) };
    setCand(next);
    intakeChanged({ candidate: next });
  }
  // A number or address typed in here is kept on the appointment.
  function keepContact(kind) {
    if (kind === 'phone' && phone.trim() && !appointment.clientPhone) saveAppointmentContact(appointment.id, { clientPhone: phone.trim() });
    if (kind === 'email' && email.trim() && !appointment.clientEmail) saveAppointmentContact(appointment.id, { clientEmail: email.trim() });
  }
  function texted() {
    keepContact('phone');
    recordSent('text');
    setNote({ kind: 'ok', text: `Messages opened with ${first}'s link. Send it from there.` });
  }
  async function emailIt() {
    if (!emailOk) { setAsking('email'); return; }
    setBusy(true); setNote(null);
    const r = await sendIntakeEmail(cand.id, email.trim());
    setBusy(false);
    if (r.sent) {
      keepContact('email');
      const next = { ...cand, sent_at: new Date().toISOString(), sent_via: 'email' };
      setCand(next);
      intakeChanged({ candidate: next });
      setNote({ kind: 'ok', text: `Emailed to ${email.trim()}.` });
      return;
    }
    setNote({
      kind: 'warn',
      text: r.error === 'not_set_up' || r.error === 'email_not_configured' ? "Emailing it from PaceLedger isn't switched on yet. Text it or copy the link instead."
        : r.error === 'too_soon' ? 'It was just emailed. Give it a minute before sending again.'
          : r.error === 'daily_limit' ? "You've emailed a lot of forms today. Text it or copy the link instead."
            : r.error === 'already_received' ? `${first} already filled it in.`
              : r.error === 'form_limit' ? 'This form has been emailed 5 times already. Text it or copy the link instead.'
                : r.error === 'bad_email' ? "That email address doesn't look right."
              : "The email didn't send. Text it or copy the link instead.",
    });
  }
  async function copyIt() {
    const res = await shareOrCopy({ url: link, title: 'Client intake form', text: isNativeApp() ? message.replace(` ${link}`, '') : undefined });
    if (res === 'failed') return;
    recordSent('copy');
    setNote({ kind: 'ok', text: res === 'copied' ? 'Link copied. Paste it into a text or email.' : 'Shared.' });
  }

  const title = `Send ${appointment.client || 'them'} the intake form`;
  if (error) {
    return <Frame title={title} onClose={onClose}><div className="tr-error">{error}</div></Frame>;
  }
  if (!cand) {
    return <Frame title={title} onClose={onClose}><p className="tr-empty">Getting their link…</p></Frame>;
  }
  if (cand.status === 'submitted') {
    return (
      <Frame title={`${appointment.client}'s intake form`} onClose={onClose} foot={<button type="button" className="tr-btn tr-btn-brass" onClick={onClose}>Done</button>}>
        <p className="tr-intake-status tr-intake-status-green"><Check size={15} aria-hidden="true" /> {first} filled it in {dayWord(cand.submitted_at)}.</p>
        <p className="tr-empty">The answers are on their card in Pipeline → Follow-up.</p>
      </Frame>
    );
  }
  return (
    <Frame title={title} onClose={onClose} foot={<button type="button" className="tr-btn tr-btn-ghost" onClick={onClose}>Done</button>}>
      <p className={`tr-intake-status tr-intake-status-${intakeStatusTone(cand)}`}>
        {cand.sent_via ? <Check size={15} aria-hidden="true" /> : null}
        {intakeStatusText(cand)}{cand.sent_via ? ' · not filled in yet' : ''}
      </p>
      <div className="tr-intake-ways">
        {/* Text: Messages opens with the words and the link filled in. */}
        {phoneOk && asking !== 'phone' ? (
          <a className="tr-intake-way" href={smsHref(phone, message)} onClick={texted}>
            <span className="tr-intake-way-icon"><MessageSquareText size={18} aria-hidden="true" /></span>
            <span className="tr-intake-way-text"><strong>Text it</strong><span>Opens Messages to {fmtPhone(phone)}</span></span>
          </a>
        ) : (
          <div className="tr-intake-way tr-intake-way-ask">
            <span className="tr-intake-way-icon"><MessageSquareText size={18} aria-hidden="true" /></span>
            <span className="tr-intake-way-text">
              <strong>Text it</strong>
              <label className="tr-intake-inline">
                <span className="tr-sr-only">{first}'s mobile number</span>
                <input type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={e => { setAsking('phone'); setPhone(e.target.value); }} placeholder="Their mobile number" />
              </label>
            </span>
            {phoneOk ? <a className="tr-btn tr-btn-brass tr-btn-sm" href={smsHref(phone, message)} onClick={() => { setAsking(null); texted(); }}>Text</a> : null}
          </div>
        )}
        {/* Email: sent from PaceLedger, replies come to you. */}
        {emailOk && asking !== 'email' ? (
          <button type="button" className="tr-intake-way" onClick={emailIt} disabled={busy}>
            <span className="tr-intake-way-icon"><Mail size={18} aria-hidden="true" /></span>
            <span className="tr-intake-way-text"><strong>{busy ? 'Sending…' : 'Email it'}</strong><span>From PaceLedger to {email.trim()}</span></span>
          </button>
        ) : (
          <div className="tr-intake-way tr-intake-way-ask">
            <span className="tr-intake-way-icon"><Mail size={18} aria-hidden="true" /></span>
            <span className="tr-intake-way-text">
              <strong>Email it</strong>
              <label className="tr-intake-inline">
                <span className="tr-sr-only">{first}'s email address</span>
                <input type="email" inputMode="email" autoComplete="off" autoCapitalize="none" value={email} onChange={e => { setAsking('email'); setEmail(e.target.value); }} placeholder="Their email address"
                  onKeyDown={e => { if (e.key === 'Enter' && emailOk) { e.preventDefault(); setAsking(null); emailIt(); } }} />
              </label>
            </span>
            {emailOk ? <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" disabled={busy} onClick={() => { setAsking(null); emailIt(); }}>{busy ? 'Sending…' : 'Send'}</button> : null}
          </div>
        )}
        <button type="button" className="tr-intake-way" onClick={copyIt}>
          <span className="tr-intake-way-icon"><Copy size={18} aria-hidden="true" /></span>
          <span className="tr-intake-way-text"><strong>{isNativeApp() ? 'Share the link' : 'Copy the link'}</strong><span>{isNativeApp() ? 'WhatsApp, Mail, anything' : 'Paste it into any text or email'}</span></span>
        </button>
      </div>
      {note ? <div className={note.kind === 'ok' ? 'tr-flash' : 'tr-error'} role="status">{note.text}</div> : null}
      <details className="tr-intake-preview">
        <summary>What they'll get</summary>
        <p>{message}</p>
      </details>
    </Frame>
  );
}

// + New → Send a client intake: pick whose. Your upcoming appointments
// first (soonest first), then the last 60 days (latest first), one row per
// client.
function IntakePicker({ user, onPick, onClose }) {
  const [appts, setAppts] = useState(null);
  const [forms, setForms] = useState([]);
  const [q, setQ] = useState('');
  const box = useRef(null);
  useEffect(() => {
    let alive = true;
    Promise.all([fetchMyAppointments(user.id), fetchMyIntakeStatus(user.id).catch(() => [])]).then(([a, f]) => {
      if (!alive) return;
      setAppts(a);
      setForms(f);
    });
    return () => { alive = false; };
  }, [user.id]);
  useEffect(() => { if (box.current) box.current.focus({ preventScroll: true }); }, [appts]);
  const rows = useMemo(() => {
    if (!appts) return [];
    const now = Date.now();
    const since = now - 60 * 864e5;
    const byAppt = new Map(forms.filter(f => f.source_appointment_id).map(f => [f.source_appointment_id, f]));
    const ahead = appts.filter(a => apptStartMs(a) >= now).sort((a, b) => apptStartMs(a) - apptStartMs(b));
    const past = appts.filter(a => apptStartMs(a) < now && apptStartMs(a) >= since).sort((a, b) => apptStartMs(b) - apptStartMs(a));
    const seen = new Set();
    const out = [];
    [...ahead, ...past].forEach(a => {
      const key = String(a.client || '').trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push({ a, form: byAppt.get(a.id) || null });
    });
    return out;
  }, [appts, forms]);
  const terms = q.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  const shown = rows.filter(({ a }) => !terms || String(a.client).toLowerCase().includes(terms) || (digits.length >= 3 && String(a.clientPhone || '').replace(/\D/g, '').includes(digits)));
  return (
    <Frame title="Send a client intake" onClose={onClose}>
      <div className="tr-search-row tr-intake-search">
        <Search size={15} className="tr-search-icon" />
        <input ref={box} className="tr-search-input" type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Find a client…" aria-label="Find a client by name or phone" />
      </div>
      {!appts ? <p className="tr-empty">Loading your clients…</p> : shown.length === 0 ? (
        <p className="tr-empty">{rows.length ? 'No one matches.' : 'Clients show up here once you log an appointment with them.'}</p>
      ) : (
        <ul className="tr-intake-pick">
          {shown.slice(0, 40).map(({ a, form }) => (
            <li key={a.id}>
              <button type="button" onClick={() => onPick(a)} disabled={form && form.status === 'submitted'}>
                <span className="tr-intake-pick-main">
                  <strong>{a.client}</strong>
                  <span><CalendarDays size={12} aria-hidden="true" /> {fmtApptDateTime(a)}</span>
                </span>
                <span className={`tr-status tr-status-${intakeStatusTone(form)}`}>{form ? intakeStatusText(form) : 'Not sent'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

// In the appointment window: where this client's form stands, and a button
// to send it (or send it again).
export function IntakeStatusRow({ user, appointment }) {
  const [cand, setCand] = useState(undefined); // undefined while loading
  useEffect(() => {
    let alive = true;
    fetchIntakeForAppointment(user.id, appointment.id).then(c => { if (alive) setCand(c); }).catch(() => { if (alive) setCand(null); });
    const on = e => {
      const d = e && e.detail;
      if (d && d.candidate && d.candidate.source_appointment_id === appointment.id) setCand(d.candidate);
      if (d && d.removedId) setCand(c => (c && c.id === d.removedId ? null : c));
    };
    window.addEventListener('paceledger:intake-changed', on);
    return () => { alive = false; window.removeEventListener('paceledger:intake-changed', on); };
  }, [user.id, appointment.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (cand === undefined) return null;
  const submitted = cand && cand.status === 'submitted';
  return (
    <div className="tr-intake-row tr-form-section">
      <FileText size={16} aria-hidden="true" />
      <span className="tr-intake-row-text">Client intake: <strong>{intakeStatusText(cand)}</strong></span>
      {submitted ? null : (
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => openIntakeSend({ appointment, candidate: cand || null })}>
          {cand && cand.sent_via ? 'Send again' : 'Send it'}
        </button>
      )}
    </div>
  );
}

// "Send them the client intake form" ticked when booking: emails it if
// there's an email address, otherwise (or if the email doesn't go) opens
// the send window to text or copy it. Returns a note to show, or null.
export async function sendIntakeAfterBooking(user, appointment) {
  const res = await findOrMake(user, appointment);
  if (!res.ok) return { kind: 'warn', text: "The intake form wasn't made. Open the appointment to send it." };
  intakeChanged({ candidate: res.record });
  const email = String(appointment.clientEmail || '').trim();
  if (isValidEmail(email)) {
    const r = await sendIntakeEmail(res.record.id, email);
    if (r.sent) {
      intakeChanged({ candidate: { ...res.record, sent_at: new Date().toISOString(), sent_via: 'email' } });
      return { kind: 'ok', text: `Intake form emailed to ${email}.` };
    }
  }
  openIntakeSend({ appointment, candidate: res.record });
  return null;
}
