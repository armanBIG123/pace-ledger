// Recruit sign-up links: share, copy or email them.
import { useEffect, useState } from 'react';
import { Check, Copy, Mail, UserPlus } from 'lucide-react';
import { buildInviteLink, createInvite, emailInvite, fetchInviteForAppointment, inviteState } from '../invites.js';
import { isNativeApp, shareOrCopy } from '../native.js';
import { fmtSentStamp } from '../lib/dates.js';
import { isValidEmail } from '../lib/format.js';

// Recruit sign-up link for one recruit: a personal, single-use invitation
// that puts them directly under the advisor who sends it. It can be
// copied, shared, or emailed straight from PaceLedger.
export function inviteEmailError(code) {
  if (code === 'bad_email') return "That email address doesn't look right.";
  if (code === 'too_soon') return 'It was just sent. Wait a minute before sending it again.';
  if (code === 'link_limit') return "This link has been emailed 5 times already. Copy it and send it yourself instead.";
  if (code === 'daily_limit') return "You've hit today's limit for emailed sign-up links. Copy the link instead, or try tomorrow.";
  if (code === 'used') return 'This link has already been used to create an account.';
  if (code === 'expired') return 'This link has expired. Make a new one.';
  if (code === 'email_not_configured') return "PaceLedger's email sending isn't set up yet. Copy the link instead.";
  return "The email couldn't be sent. Check your connection and try again, or copy the link instead.";
}

export function InviteShare({ invite, recruitName, defaultEmail }) {
  const [copied, setCopied] = useState('');
  const [to, setTo] = useState(invite.emailed_to || defaultEmail || '');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(invite.emailed_to ? { to: invite.emailed_to, at: invite.emailed_at } : null);
  const [emailErr, setEmailErr] = useState('');
  const link = buildInviteLink(invite.token);
  const first = (recruitName || '').trim().split(' ')[0];
  const message = `Hey ${first || 'there'}! Here's your personal link to create your PaceLedger account. It's already set up to put you on my team: ${link}`;
  async function copy(kind) {
    const res = await shareOrCopy(kind === 'link' ? { url: link, title: 'PaceLedger sign-up link' } : { text: message });
    if (res === 'copied') {
      setCopied(kind);
      setTimeout(() => setCopied(''), 2000);
    }
  }
  async function sendEmail(e) {
    e.preventDefault();
    const addr = to.trim();
    if (!isValidEmail(addr)) { setEmailErr(inviteEmailError('bad_email')); return; }
    setSending(true); setEmailErr('');
    const res = await emailInvite(invite.id, addr);
    setSending(false);
    if (res.sent) setSent({ to: res.emailedTo || addr, at: res.emailedAt || new Date().toISOString() });
    else setEmailErr(inviteEmailError(res.error));
  }
  const sameAsSent = sent && to.trim().toLowerCase() === sent.to;
  return (
    <>
      <div className="tr-intake-link-row" style={{ marginTop: 8 }}>
        <span className="tr-intake-link-box">{link}</span>
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => copy('link')}><Copy size={13} /> {copied === 'link' ? 'Copied!' : isNativeApp() ? 'Share link' : 'Copy link'}</button>
      </div>
      <div className="tr-form-actions" style={{ marginTop: 8, justifyContent: 'flex-start', alignItems: 'center' }}>
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => copy('message')}>{copied === 'message' ? 'Copied!' : isNativeApp() ? 'Send as a message' : 'Copy as a text message'}</button>
        <span className="tr-note" style={{ fontSize: 12.5 }}>
          Works once{invite.expires_at && !isNaN(new Date(invite.expires_at)) ? ` · expires ${new Date(invite.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
        </span>
      </div>
      <form className="tr-invite-email" onSubmit={sendEmail} noValidate>
        <label className="tr-invite-email-label" htmlFor={`invite-email-${invite.id}`}>Or email it to them</label>
        <div className="tr-invite-email-row">
          <input
            id={`invite-email-${invite.id}`} type="email" inputMode="email" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            className="tr-invite-email-input" value={to} placeholder="name@example.com"
            onChange={e => { setTo(e.target.value); setEmailErr(''); }} />
          <button type="submit" className="tr-btn tr-btn-brass tr-btn-sm" disabled={sending || !to.trim()}>
            <Mail size={13} /> {sending ? 'Sending…' : sameAsSent ? 'Send again' : 'Email link'}
          </button>
        </div>
        {sent && !emailErr && <div className="tr-invite-email-sent"><Check size={13} /> Emailed to {sent.to}{sent.at ? ` · ${fmtSentStamp(sent.at)}` : ''}. Replies come to you.</div>}
        {emailErr && <div className="tr-error" style={{ marginTop: 6 }}>{emailErr}</div>}
      </form>
    </>
  );
}

export function RecruitSignupSection({ user, recruitName, recruitEmail, joined, appointmentId }) {
  const [invite, setInvite] = useState(undefined); // undefined = loading
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    fetchInviteForAppointment(appointmentId).then(inv => { if (alive) setInvite(inv); });
    return () => { alive = false; };
  }, [appointmentId]);
  const state = inviteState(invite);
  const signedUp = joined || state === 'used';
  async function makeLink() {
    setBusy(true); setErr('');
    const res = await createInvite({ uplineId: user.id, createdBy: user.id, inviteeName: recruitName, appointmentId });
    setBusy(false);
    if (!res.ok) { setErr("Couldn't create the link. Try again."); return; }
    setInvite(res.invite);
  }
  return (
    <div>
      <div className="tr-row-head">
        <h4 className="tr-h4" style={{ margin: 0 }}>Recruit sign-up</h4>
        {signedUp
          ? <span className="tr-status tr-status-green">Signed up</span>
          : <span className="tr-status tr-status-none">Not signed up yet</span>}
      </div>
      {signedUp && !joined && state === 'used' && (
        <button type="button" className="tr-link-btn" style={{ marginTop: 8 }} onClick={makeLink} disabled={busy}>
          Someone else used the link? Create a new one
        </button>
      )}
      {!signedUp && invite !== undefined && (
        <>
          {state === 'active' ? (
            <>
              <p className="tr-empty" style={{ margin: '6px 0 0' }}>Their personal sign-up link. It puts them directly under you, and they can't change it.</p>
              <InviteShare key={invite.id} invite={invite} recruitName={recruitName} defaultEmail={recruitEmail} />
            </>
          ) : (
            <>
              <p className="tr-empty" style={{ margin: '6px 0 0' }}>
                {state === 'expired' ? 'Their sign-up link expired. Make a new one to send them.' : 'PaceLedger is invitation-only. Make a personal sign-up link that puts them directly under you.'}
              </p>
              <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" style={{ marginTop: 8 }} onClick={makeLink} disabled={busy}>
                <UserPlus size={14} /> {busy ? 'Creating…' : state === 'expired' ? 'Create a new link' : 'Create sign-up link'}
              </button>
            </>
          )}
          {err && <div className="tr-error">{err}</div>}
        </>
      )}
    </div>
  );
}
