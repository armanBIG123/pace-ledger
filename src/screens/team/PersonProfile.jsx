// Profiles → a person: their licensing and contracting steps (super
// admins can fix dates and numbers), info, their entity, flag and notes.
import { useState } from 'react';
import { Building2, ChevronLeft, Circle, CircleDot, CheckCircle2, Flag, Pencil } from 'lucide-react';
import { adminUpdateLicensing, clearPersonFlag, setPersonFlag } from '../../data/adminProfiles.js';
import { contractingInApp, LICENSING_STEPS } from '../../licensing.js';
import { hierarchyTierLabel } from '../../hierarchy.js';
import { personInitials } from '../../lib/format.js';
import { entityProgress, PERSON_STEP_TEXT, personProgress, personStepDetail } from '../../lib/profiles.js';
import { Avatar } from '../../components/avatar.jsx';
import { FlagBar, FlagDialog, LagBadge, NotesCard, PersonDots, stampDate } from './profileParts.jsx';
import { roleLabel } from '../../lib/roles.js';

const personReasons = () => ['Not responding', 'Waiting on the exam', 'Waiting on contracting', 'Waiting on the carrier', 'Needs help from their upline'];
// The editable fields behind the 8 steps, in order.
const EDIT_FIELDS = [
  ['course_started_on', 'Course started', 'date'], ['course_completed_on', 'Course finished', 'date'],
  ['exam_on', 'Exam date', 'date'], ['exam_passed_on', 'Exam passed', 'date'],
  ['npn', 'NPN (license number)', 'text'], ['contracting_sent_on', 'Contracting link sent', 'date'],
  ['profile_submitted_on', 'Contracting profile submitted', 'date'], ['fg_writing_number', 'F&G writing number', 'text'],
];
const fieldLabel = (k, label) => (!contractingInApp() ? label : k === 'contracting_sent_on' ? 'Agreement countersigned' : k === 'profile_submitted_on' ? 'Contracting info sent' : label);

export function PersonProfile({ person, progress, flag, people, entities, checksOf, photo, backLabel = 'Back', onBack, onOpenEntity, onChanged, onFlagChanged }) {
  const [flagging, setFlagging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const pp = personProgress(person, progress);
  const p = progress || {};
  const manager = person.manager_id ? people.find(x => x.id === person.manager_id) : null;
  const mine = entities.filter(e => e.partner_id === person.id);

  function startEdit() {
    const f = {};
    EDIT_FIELDS.forEach(([k]) => { f[k] = k === 'npn' || k === 'fg_writing_number' ? (person[k] || '') : (p[k] ? String(p[k]).slice(0, 10) : ''); });
    setForm(f); setErr(''); setEditing(true);
  }
  async function saveEdit(e) {
    e.preventDefault();
    const changed = {};
    EDIT_FIELDS.forEach(([k]) => {
      const before = k === 'npn' || k === 'fg_writing_number' ? (person[k] || '') : (p[k] ? String(p[k]).slice(0, 10) : '');
      if ((form[k] || '').trim() !== before) changed[k] = (form[k] || '').trim();
    });
    if (!Object.keys(changed).length) { setEditing(false); return; }
    setBusy(true); setErr('');
    const res = await adminUpdateLicensing(person.id, changed);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    onChanged({ npn: res.npn, fg_writing_number: res.fg_writing_number, licensed_at: res.licensed_at }, res.progress);
    setEditing(false);
    setNote('Saved. They see the same steps in Growth → Licensing.');
  }
  async function saveFlag(reason) {
    const res = await setPersonFlag(person.id, reason);
    if (!res.ok) return false;
    onFlagChanged(res.record); setFlagging(false); return true;
  }
  async function clearFlag() {
    if (!(await clearPersonFlag(person.id))) return false;
    onFlagChanged(null); setFlagging(false); return true;
  }

  function stepLine(s, i) {
    const isDone = !!pp.done[s.key], isNow = !pp.admin && i === pp.nextIndex && !pp.licensed;
    const detail = personStepDetail(s.key, person, progress);
    return (
      <li key={s.key} className={isDone ? 'tr-pf-lic-done' : isNow ? 'tr-pf-lic-now' : ''}>
        <span className="tr-pf-step-icon" aria-hidden="true">{isDone ? <CheckCircle2 size={17} /> : isNow ? <CircleDot size={17} /> : <Circle size={17} />}</span>
        <span className="tr-pf-lic-text">{isDone ? s.short : PERSON_STEP_TEXT[s.key]}{isDone ? <span className="tr-sr-only"> (done)</span> : isNow ? <span className="tr-sr-only"> (the step they're on)</span> : null}</span>
        <span className="tr-pf-lic-detail">{isNow ? <LagBadge days={pp.days} stalled={pp.stalled} note={pp.examAhead ? `Exam ${personStepDetail('examBooked', person, progress)}` : ''} /> : detail}</span>
      </li>
    );
  }

  return (
    <div className="tr-pf-detail">
      <button type="button" className="tr-pf-back" onClick={onBack} data-android-back><ChevronLeft size={16} aria-hidden="true" /> {backLabel}</button>
      <div className="tr-pf-detail-head">
        <div className="tr-pf-who">
          <Avatar url={photo} className="tr-pf-avatar tr-pf-avatar-lg">{personInitials(person.display_name)}</Avatar>
          <div className="tr-pf-detail-title">
            <h2 className="tr-h2">{person.display_name}</h2>
            <p className="tr-pf-detail-sub">
              {[hierarchyTierLabel(person.hierarchy_tier) || roleLabel(person.role),
                manager ? `reports to ${manager.display_name}` : '', person.created_at ? `joined ${stampDate(person.created_at)}` : ''].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="tr-pf-detail-actions">
          <button type="button" className={`tr-btn tr-btn-sm ${flag ? 'tr-pf-btn-flagged' : 'tr-btn-ghost'}`} onClick={() => setFlagging(true)}><Flag size={14} aria-hidden="true" /> {flag ? 'Flagged' : 'Flag'}</button>
          <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={startEdit}><Pencil size={13} aria-hidden="true" /> Edit steps</button>
        </div>
      </div>
      <FlagBar reason={flag && flag.reason} by={flag && flag.flagged_by_name} at={flag && flag.flagged_at} onClear={clearFlag} />
      {note ? <div className="tr-flash" role="status">{note}</div> : null}

      <div className="tr-pf-two">
        <section className="tr-card tr-pf-checklist" aria-labelledby="tr-pf-lic-title">
          <div className="tr-pf-checklist-head">
            <h3 className="tr-pf-box-title" id="tr-pf-lic-title">Licensing and contracting</h3>
            <PersonDots done={LICENSING_STEPS.map(s => !!pp.done[s.key])} currentIndex={pp.nextIndex} />
            <span className="tr-pf-light">{pp.admin ? 'Admin · not tracked' : pp.licensed ? 'All 8 steps done' : `${pp.doneCount} of 8 · now on step ${pp.nextIndex + 1}`}</span>
          </div>
          {editing ? (
            <form className="tr-pf-editsteps" onSubmit={saveEdit}>
              <p className="tr-pf-light">Fix a date or number, or clear one. They see the same steps in Growth → Licensing.</p>
              <div className="tr-form-grid">
                {EDIT_FIELDS.map(([k, label, type]) => (
                  <label key={k} className="tr-field">
                    <span>{fieldLabel(k, label)}</span>
                    <input type={type} value={form[k] || ''} onChange={e => { setForm(prev => ({ ...prev, [k]: e.target.value })); setErr(''); }}
                      {...(type === 'text' ? { autoComplete: 'off', maxLength: k === 'npn' ? 20 : 40, inputMode: k === 'npn' ? 'numeric' : undefined } : {})} />
                  </label>
                ))}
              </div>
              {err && <div className="tr-error">{err}</div>}
              <div className="tr-form-actions">
                <button type="button" className="tr-btn tr-btn-ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
                <button type="submit" className="tr-btn tr-btn-brass" disabled={busy}>{busy ? 'Saving…' : 'Save steps'}</button>
              </div>
            </form>
          ) : (
            <>
              <h4 className="tr-pf-lic-group">Licensing</h4>
              <ol className="tr-pf-licsteps">{LICENSING_STEPS.slice(0, 5).map((s, i) => stepLine(s, i))}</ol>
              <h4 className="tr-pf-lic-group">Contracting</h4>
              <ol className="tr-pf-licsteps" start={6}>{LICENSING_STEPS.slice(5).map((s, i) => stepLine(s, i + 5))}</ol>
            </>
          )}
        </section>

        <div className="tr-pf-side">
          <section className="tr-card tr-pf-box" aria-labelledby="tr-pf-pinfo-title">
            <h3 className="tr-pf-box-title" id="tr-pf-pinfo-title">Details</h3>
            <dl className="tr-pf-dl">
              <div><dt>Email</dt><dd>{person.email ? <a href={`mailto:${person.email}`}>{person.email}</a> : <span className="tr-pf-light">Not added</span>}</dd></div>
              <div><dt>NPN</dt><dd>{person.npn || <span className="tr-pf-light">Not added yet</span>}</dd></div>
              <div><dt>F&amp;G writing #</dt><dd>{person.fg_writing_number || <span className="tr-pf-light">Not added yet</span>}</dd></div>
              <div><dt>Resident state</dt><dd>{p.resident_state || <span className="tr-pf-light">Not added yet</span>}</dd></div>
              {p.course_provider ? <div><dt>Course</dt><dd>{p.course_provider}</dd></div> : null}
              {p.exam_attempts ? <div><dt>Exam attempts</dt><dd>{p.exam_attempts + (p.exam_passed_on ? 1 : 0)}</dd></div> : null}
              <div><dt>Entity</dt><dd>{mine.length ? mine.map(e => {
                const ep = entityProgress(e, checksOf(e.id));
                return <button key={e.id} type="button" className="tr-link-btn tr-pf-inline-link tr-pf-entity-link" onClick={() => onOpenEntity(e.id)}><Building2 size={12} aria-hidden="true" /> {e.name} · {ep.completed ? 'all done' : `${ep.doneCount} of 9`}</button>;
              }) : <span className="tr-pf-light">None</span>}</dd></div>
            </dl>
          </section>
          <NotesCard subject={{ personId: person.id }} />
        </div>
      </div>

      {flagging ? <FlagDialog title={`Flag ${person.display_name}`} current={flag ? flag.reason : ''} reasons={personReasons()} onSave={saveFlag} onClear={clearFlag} onClose={() => setFlagging(false)} /> : null}
    </div>
  );
}
