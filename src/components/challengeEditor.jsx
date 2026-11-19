// Start, change or remove a challenge (super admins). Opened from + New →
// Start a challenge, and from the pencil on the banner.
import { useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { Modal, openPicker } from './ui.jsx';
import { askConfirm } from './confirm.jsx';
import { deleteChallenge, saveChallenge } from '../data/challenges.js';
import { centralDay, formOf, formProblem, METRIC_KEYS, METRICS, TAGLINE_MAX, THEMES, TITLE_MAX } from '../lib/challenges.js';

const COUNTS = {
  appointments: 'New appointments they book (not follow-ups)',
  recruits: 'People who sign up with their invite link',
};

export function ChallengeEditor({ challenge = null, onClose, onSaved }) {
  const [f, setF] = useState(() => formOf(challenge, centralDay(new Date().toISOString())));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const nameRef = useRef(null);
  const set = (k, v) => { setF(prev => ({ ...prev, [k]: v })); setErr(''); };
  const toggle = m => set('metrics', f.metrics.includes(m) ? f.metrics.filter(x => x !== m) : METRIC_KEYS.filter(x => x === m || f.metrics.includes(x)));

  async function save(e) {
    e.preventDefault();
    const problem = formProblem(f);
    if (problem) { setErr(problem); return; }
    setBusy(true);
    const res = await saveChallenge(f, challenge ? challenge.id : null);
    setBusy(false);
    if (!res.ok) { setErr("Couldn't save. Check your connection and try again."); return; }
    onSaved(res.record);
  }
  async function remove() {
    if (!(await askConfirm({ title: `Remove "${challenge.title}"?`, body: 'It comes off Today for everyone, with its board. Nobody’s appointments or recruits change.', confirmLabel: 'Remove', danger: true }))) return;
    setBusy(true);
    const ok = await deleteChallenge(challenge.id);
    setBusy(false);
    if (!ok) { setErr("Couldn't remove it. Check your connection and try again."); return; }
    onSaved(null);
  }

  return (
    <Modal onClose={busy ? () => {} : onClose} labelledBy="tr-chal-edit-title" className="tr-chal-editor">
      <form onSubmit={save} noValidate>
        <div className="tr-row-head">
          <div style={{ minWidth: 0 }}>
            <h3 className="tr-h3" id="tr-chal-edit-title" style={{ margin: 0 }}>{challenge ? 'Edit challenge' : 'Start a challenge'}</h3>
            <p className="tr-subtitle" style={{ margin: '2px 0 0' }}>A banner on everyone’s Today with the live top 3, then the winners.</p>
          </div>
          <button type="button" className="tr-icon-btn" onClick={onClose} aria-label="Close" disabled={busy}><X size={16} /></button>
        </div>

        <div className="tr-ep-fields">
          <label className="tr-field tr-ep-wide">
            <span>Name</span>
            <input ref={nameRef} value={f.title} onChange={e => set('title', e.target.value)} maxLength={TITLE_MAX} placeholder="BIG Bird Blitz" autoComplete="off" autoFocus={!challenge} />
          </label>
          <label className="tr-field tr-ep-wide">
            <span>Line under the name (optional)</span>
            <input value={f.tagline} onChange={e => set('tagline', e.target.value)} maxLength={TAGLINE_MAX} placeholder="Close out the month strong." autoComplete="off" />
          </label>
          <fieldset className="tr-field tr-ep-wide tr-chal-counts">
            <legend>What counts</legend>
            {METRIC_KEYS.map(m => (
              <label key={m} className={`tr-chal-count-opt ${f.metrics.includes(m) ? 'tr-chal-count-on' : ''}`}>
                <input type="checkbox" checked={f.metrics.includes(m)} onChange={() => toggle(m)} />
                <span><b>{METRICS[m].label}</b><small>{COUNTS[m]}</small></span>
              </label>
            ))}
          </fieldset>
          <div className="tr-chal-dates tr-ep-wide">
            <label className="tr-field"><span>First day</span><input type="date" value={f.startDay} onChange={e => set('startDay', e.target.value)} onClick={openPicker} /></label>
            <label className="tr-field"><span>Last day</span><input type="date" value={f.lastDay} onChange={e => set('lastDay', e.target.value)} onClick={openPicker} /></label>
            <label className="tr-field"><span>Show winners until</span><input type="date" value={f.winnersUntil} onChange={e => set('winnersUntil', e.target.value)} onClick={openPicker} /></label>
            <small className="tr-field-hint">Central Time: it counts from 12:00 AM on the first day through 11:59 PM on the last day. The winners show the next morning.</small>
          </div>
          <div className="tr-field tr-ep-wide">
            <span id="tr-chal-look">Look</span>
            <div className="tr-seg tr-chal-look" role="group" aria-labelledby="tr-chal-look">
              {THEMES.map(t => <button key={t.value} type="button" className={f.theme === t.value ? 'tr-seg-on' : ''} aria-pressed={f.theme === t.value} onClick={() => set('theme', t.value)}>{t.label}</button>)}
            </div>
          </div>
        </div>

        {err ? <div className="tr-error" role="alert">{err}</div> : null}
        <div className="tr-form-actions">
          {challenge ? <button type="button" className="tr-btn tr-btn-ghost tr-chal-remove" onClick={remove} disabled={busy}><Trash2 size={15} aria-hidden="true" /> Remove</button> : null}
          <button type="button" className="tr-btn tr-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="tr-btn tr-btn-brass" disabled={busy}>{busy ? 'Saving…' : challenge ? 'Save changes' : 'Start challenge'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default ChallengeEditor;
