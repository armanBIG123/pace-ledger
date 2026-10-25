// "Log them all": every past appointment still waiting for an outcome, in
// one list, newest first. One tap logs each one: Sold (with the premium, or
// add it later), Went well, Not interested, No show or Rescheduled. "More"
// opens the full "How did it go?" window (follow-up, tax and home/auto
// interest, client intake). Logged rows stay in the list, with what was
// saved and Change, until the list is closed.
// presenter: appointments your team booked and you presented. They save on
// the advisor's appointment, so the sale or recruit counts for them.
import { useState } from 'react';
import { CalendarClock, Check, CircleX, DollarSign, ThumbsUp, UserX, X } from 'lucide-react';
import { applyFollowUpToList, logPresentedAppointment, persistFollowUp, typeLabel } from '../data/appointments.js';
import { fmtApptDateTime } from '../lib/dates.js';
import { fmtCurrency } from '../lib/format.js';
import { FollowUpModal } from './followUpModal.jsx';
import { Modal } from './ui.jsx';

const QUICK = [
  { value: 'sold', label: 'Sold', Icon: DollarSign },
  { value: 'went_well', label: 'Went well', Icon: ThumbsUp },
  { value: 'not_interested', label: 'Not interested', Icon: CircleX },
  { value: 'no_show', label: 'No show', Icon: UserX },
  { value: 'rescheduled', label: 'Rescheduled', Icon: CalendarClock },
];
const first = n => (n || '').trim().split(/\s+/)[0] || '';

// What one tap saves: the outcome, and a sale with its premium. Recruits
// count on their own from sign-ups, so that stays as it is.
export function quickOutcome(appointment, kind, premium = '') {
  const sold = kind === 'sold';
  return {
    outcome: sold ? 'went_well' : kind,
    followUpScheduled: null, followUpDate: null, followUpTime: null,
    officiallyRecruited: !!appointment.officiallyRecruited,
    officiallySold: sold,
    targetPremium: sold && Number(premium) > 0 ? String(Number(premium)) : '',
    interestedTax: null, interestedInsurance: null, clientIntake: false,
  };
}

function savedLabel(data, presenter, a) {
  if (data.officiallySold) return Number(data.targetPremium) > 0 ? `Sold · ${fmtCurrency(Number(data.targetPremium))}` : 'Sold · add the premium later';
  if (data.outcome === 'rescheduled') return presenter ? `Rescheduled · ${first(a.setByName) || 'the advisor'} picks the new time` : 'Rescheduled · on your Reschedule list';
  if (data.outcome === 'no_show') return presenter ? 'No show' : 'No show · rebook it from Didn\'t happen';
  return { went_well: 'Went well', not_interested: 'Not interested' }[data.outcome] || 'Logged';
}

export function LogAllSheet({ user, items, presenter = false, onClose, onLogged, onMoved }) {
  const [rows] = useState(() => items); // the list as it was when it opened
  const [saved, setSaved] = useState(() => new Map()); // id -> { label, record }
  const [busy, setBusy] = useState(null);
  const [selling, setSelling] = useState(null); // id with the premium box open
  const [premium, setPremium] = useState('');
  const [errs, setErrs] = useState(() => new Map());
  const [full, setFull] = useState(null); // open in the full window
  const [fullSaving, setFullSaving] = useState(false);
  const setErr = (id, msg) => setErrs(m => { const n = new Map(m); if (msg) n.set(id, msg); else n.delete(id); return n; });
  const current = a => (saved.get(a.id) || {}).record || a;

  async function save(a, data) {
    setBusy(a.id);
    setErr(a.id, '');
    const base = current(a);
    const res = presenter ? await logPresentedAppointment(a.id, data) : await persistFollowUp(user, a.id, base, data);
    setBusy(null);
    if (!res.ok) {
      setErr(a.id, presenter && /already_logged/.test(res.error || '')
        ? `${first(a.setByName) || 'The advisor'} already logged this one, so it's theirs to change.`
        : "Couldn't save. Check your connection and try again.");
      return false;
    }
    const record = presenter ? { ...base, ...res.record } : applyFollowUpToList([base], a.id, data, res.followUpTimezone, null)[0];
    setSaved(m => new Map(m).set(a.id, { label: savedLabel(data, presenter, a), record }));
    setSelling(null);
    if (onLogged) onLogged(a, data, res);
    window.dispatchEvent(new Event('paceledger:appointments-changed'));
    return true;
  }
  function tap(a, kind) {
    if (kind === 'sold') { setSelling(a.id); setPremium(''); setErr(a.id, ''); return; }
    setSelling(null);
    save(a, quickOutcome(a, kind));
  }
  function saveSale(e, a) {
    e.preventDefault();
    if (!(Number(premium) > 0)) { setErr(a.id, 'Enter the premium, or tap "Add it later".'); return; }
    save(a, quickOutcome(a, 'sold', premium));
  }
  async function saveFull(id, data) {
    const a = rows.find(x => x.id === id);
    if (!a) return;
    setFullSaving(true);
    const ok = await save(a, data);
    setFullSaving(false);
    if (ok) setFull(null);
  }
  function moved(rec) {
    setSaved(m => new Map(m).set(rec.id, { label: `Moved to ${fmtApptDateTime(rec)}`, record: rec, moved: true }));
    setFull(null);
    if (onMoved) onMoved(rec);
    window.dispatchEvent(new Event('paceledger:appointments-changed'));
  }

  const left = rows.filter(a => !saved.has(a.id)).length;
  return (
    <>
      <Modal onClose={onClose} className="tr-modal-form tr-logall" labelledBy="tr-logall-title">
        <div className="tr-modal-head">
          <div>
            <h3 className="tr-h3" id="tr-logall-title">{presenter ? 'Log the ones you presented' : 'Log how they went'}</h3>
            <p className="tr-subtitle tr-logall-count">
              {left === 0 ? <><Check size={14} aria-hidden="true" /> All logged</> : `${left} to go`}
              {saved.size ? ` · ${saved.size} logged just now` : ' · newest first'}
            </p>
          </div>
          <button type="button" className="tr-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="tr-modal-body">
          <ul className="tr-logall-list">
            {rows.map(a => {
              const done = saved.get(a.id);
              const err = errs.get(a.id);
              const with_ = presenter ? (a.setByName ? `booked by ${a.setByName}` : '')
                : (a.presenter && a.presenter !== user.displayName ? `with ${a.presenter}` : '');
              return (
                <li key={a.id} data-appt={a.id} className={`tr-logall-row ${done ? 'tr-logall-row-done' : ''}`}>
                  <div className="tr-logall-who">
                    <strong>{a.client}</strong>
                    <span>{[fmtApptDateTime(a), typeLabel(a), with_].filter(Boolean).join(' · ')}</span>
                  </div>
                  {done ? (
                    <div className="tr-logall-saved">
                      <span><Check size={14} aria-hidden="true" /> {done.label}</span>
                      {done.moved ? null : <button type="button" className="tr-link-btn" onClick={() => setFull(done.record)}>Change</button>}
                    </div>
                  ) : selling === a.id ? (
                    <form className="tr-logall-sale" onSubmit={e => saveSale(e, a)}>
                      <label className="tr-logall-premium">
                        <span>Premium</span>
                        <input type="number" min="0" step="1" inputMode="decimal" autoFocus value={premium}
                          onChange={e => { setPremium(e.target.value); setErr(a.id, ''); }} placeholder="e.g. 1200" aria-label={`Premium for ${a.client}`} />
                      </label>
                      <button type="submit" className="tr-btn tr-btn-brass tr-btn-sm" disabled={busy === a.id}>{busy === a.id ? 'Saving…' : 'Save sale'}</button>
                      <button type="button" className="tr-link-btn" disabled={busy === a.id} onClick={() => save(a, quickOutcome(a, 'sold'))}>Add it later</button>
                      <button type="button" className="tr-link-btn tr-logall-cancel" onClick={() => { setSelling(null); setErr(a.id, ''); }}>Cancel</button>
                    </form>
                  ) : (
                    <div className="tr-logall-acts" role="group" aria-label={`How did it go with ${a.client}?`}>
                      {QUICK.map(({ value, label, Icon }) => (
                        <button key={value} type="button" className={`tr-logall-btn tr-logall-${value}`} disabled={busy === a.id} onClick={() => tap(a, value)}>
                          <Icon size={14} aria-hidden="true" /> {label}
                        </button>
                      ))}
                      <button type="button" className="tr-link-btn tr-logall-more" onClick={() => setFull(a)}>More…</button>
                    </div>
                  )}
                  {err ? <div className="tr-error tr-logall-err">{err}</div> : null}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="tr-modal-foot">
          <div className="tr-form-actions">
            <span className="tr-empty tr-logall-foot-note">{left ? 'Anything you skip stays on Today.' : 'Nice. Everything is logged.'}</span>
            <button type="button" className="tr-btn tr-btn-brass" onClick={onClose}>Done</button>
          </div>
        </div>
      </Modal>
      {full && (
        <FollowUpModal appointment={full} presenter={presenter} setByName={full.setByName} saving={fullSaving}
          onClose={() => setFull(null)} onSave={saveFull} onRescheduled={presenter ? null : moved} />
      )}
    </>
  );
}
