// Pieces shared by Profiles → Individuals and Entities: the progress bars,
// the waiting badge, flags, notes, and the entity form.
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Flag, Hourglass, Trash2, X } from 'lucide-react';
import { Modal } from '../../components/ui.jsx';
import { addProfileNote, deleteProfileNote, fetchProfileNotes } from '../../data/adminProfiles.js';
import { ENTITY_PHASES, STALLED_DAYS, stateName, US_STATES } from '../../lib/profiles.js';
import { isValidEmail } from '../../lib/format.js';
import { isValidPhone } from '../../lib/phone.js';
import { todayStr } from '../../lib/dates.js';

export const shortDate = d => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
export const stampDate = iso => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
export const initialsOf = n => (n || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

// 9 little blocks in 3 phase groups: done green, the current step brass
// (red when flagged), the rest grey.
export function EntitySegs({ done, currentIndex, flagged = false }) {
  let i = 0;
  return (
    <span className={`tr-pf-segs ${flagged ? 'tr-pf-segs-flag' : ''}`} aria-hidden="true">
      {ENTITY_PHASES.map(p => (
        <span key={p.key} className="tr-pf-seg-group">
          {p.steps.map(s => {
            const idx = i++;
            return <i key={s.key} className={done[idx] ? 'tr-pf-seg-done' : idx === currentIndex ? 'tr-pf-seg-now' : ''} />;
          })}
        </span>
      ))}
    </span>
  );
}

// 8 dots: licensing (5), then contracting (3).
export function PersonDots({ done, currentIndex, total = 8, split = 5 }) {
  return (
    <span className="tr-pf-dots" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className="tr-pf-dot-wrap">
          <i className={done[i] ? 'tr-pf-dot-done' : i === currentIndex ? 'tr-pf-dot-now' : ''} />
          {i === split - 1 ? <b /> : null}
        </span>
      ))}
    </span>
  );
}

// "3 days on this step", "Stalled · 21 days", or "Done Oct 2".
export function LagBadge({ days, stalled, completedOn = null, note = '' }) {
  if (completedOn) return <span className="tr-pf-lag tr-pf-lag-done"><CheckCircle2 size={13} aria-hidden="true" /> Done {shortDate(completedOn)}</span>;
  if (note) return <span className="tr-pf-lag">{note}</span>;
  if (stalled) return <span className="tr-pf-lag tr-pf-lag-stalled" title={`No progress in ${STALLED_DAYS}+ days`}><Hourglass size={13} aria-hidden="true" /> Stalled · {days} days</span>;
  return <span className="tr-pf-lag">{days === 0 ? 'Moved today' : `${days} day${days === 1 ? '' : 's'} on this step`}</span>;
}

export function FlagBar({ reason, by, at, onClear }) {
  if (!reason) return null;
  return (
    <div className="tr-pf-flagbar" role="status">
      <Flag size={15} aria-hidden="true" />
      <div><strong>Flagged{by ? ` by ${by}` : ''}{at ? `, ${stampDate(at)}` : ''}:</strong> {reason}</div>
      {onClear ? <button type="button" className="tr-link-btn tr-pf-flagbar-clear" onClick={onClear}>Clear flag</button> : null}
    </div>
  );
}

// Flag with a reason (or change / clear it).
export function FlagDialog({ title, current = '', reasons, onSave, onClear, onClose }) {
  const [text, setText] = useState(current || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const box = useRef(null);
  useEffect(() => { if (box.current) box.current.focus(); }, []); // so Escape closes it
  async function save() {
    if (!text.trim()) { setErr('Say what is holding it up.'); return; }
    setBusy(true); setErr('');
    const ok = await onSave(text.trim());
    setBusy(false);
    if (!ok) setErr("Couldn't save. Check your connection and try again.");
  }
  async function clear() {
    setBusy(true);
    const ok = await onClear();
    setBusy(false);
    if (!ok) setErr("Couldn't clear it. Check your connection and try again.");
  }
  return (
    <Modal onClose={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="tr-pf-flag-title" ref={box} tabIndex={-1} className="tr-pf-dialog">
        <div className="tr-row-head"><h3 className="tr-h3" id="tr-pf-flag-title" style={{ margin: 0 }}>{title}</h3><button type="button" className="tr-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        <p className="tr-subtitle">Flagged profiles show in red at the top of the list, for every super admin.</p>
        <label className="tr-field">
          <span>What's holding it up?</span>
          <textarea rows={3} maxLength={500} value={text} onChange={e => { setText(e.target.value); setErr(''); }} placeholder="For example: waiting on the operating agreement signatures" />
        </label>
        <div className="tr-pf-reasons" role="group" aria-label="Quick reasons">
          {reasons.map(r => <button key={r} type="button" className={`tr-pill-btn ${text === r ? 'tr-pill-btn-active' : ''}`} onClick={() => { setText(r); setErr(''); }}>{r}</button>)}
        </div>
        {err && <div className="tr-error">{err}</div>}
        <div className="tr-form-actions">
          {current && onClear ? <button type="button" className="tr-btn tr-btn-ghost" onClick={clear} disabled={busy}>Clear flag</button> : null}
          <button type="button" className="tr-btn tr-btn-brass" onClick={save} disabled={busy}><Flag size={14} aria-hidden="true" /> {busy ? 'Saving…' : current ? 'Update flag' : 'Flag it'}</button>
        </div>
      </div>
    </Modal>
  );
}

// Notes on a person or an entity, newest first. subject: { entityId } or { personId }.
export function NotesCard({ subject }) {
  const key = subject.entityId || subject.personId;
  const [notes, setNotes] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    fetchProfileNotes(subject).then(n => { if (alive) setNotes(n); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  async function add(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true); setErr('');
    const res = await addProfileNote(subject, draft);
    setBusy(false);
    if (!res.ok) { setErr("Couldn't save the note. Check your connection and try again."); return; }
    setNotes(prev => [res.record, ...(prev || [])]);
    setDraft('');
  }
  async function remove(n) {
    if (!window.confirm('Delete this note?')) return;
    if (await deleteProfileNote(n.id)) setNotes(prev => prev.filter(x => x.id !== n.id));
  }
  return (
    <section className="tr-card tr-pf-box" aria-labelledby={`tr-pf-notes-${key}`}>
      <h3 className="tr-pf-box-title" id={`tr-pf-notes-${key}`}>Notes</h3>
      <form className="tr-pf-noteform" onSubmit={add}>
        <textarea rows={2} maxLength={4000} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add a note…" aria-label="Add a note" />
        <button type="submit" className="tr-btn tr-btn-ghost tr-btn-sm" disabled={busy || !draft.trim()}>{busy ? 'Saving…' : 'Add note'}</button>
      </form>
      {err && <div className="tr-error">{err}</div>}
      {notes === null ? <p className="tr-empty">Loading…</p> : notes.length === 0 ? <p className="tr-empty">No notes yet.</p> : (
        <ul className="tr-pf-notes">
          {notes.map(n => (
            <li key={n.id}>
              <div className="tr-pf-note-head"><strong>{n.author_name || 'Someone'}</strong><span>{new Date(n.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                <button type="button" className="tr-icon-btn tr-pf-note-del" onClick={() => remove(n)} aria-label="Delete note" title="Delete note"><Trash2 size={13} /></button></div>
              <p>{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// The states a subsidiary will operate in: chips, plus a list to add one.
export function StatesPicker({ value, onChange, home }) {
  const chosen = value || [];
  return (
    <div className="tr-pf-states">
      {chosen.map(c => (
        <span key={c} className="tr-pf-state-chip">{stateName(c)}{c === home ? <em> (home)</em> : null}
          <button type="button" onClick={() => onChange(chosen.filter(x => x !== c))} aria-label={`Remove ${stateName(c)}`}><X size={12} /></button>
        </span>
      ))}
      <select value="" onChange={e => { if (e.target.value) onChange([...chosen, e.target.value]); }} aria-label="Add a state">
        <option value="">+ Add a state</option>
        {US_STATES.filter(([c]) => !chosen.includes(c)).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
      </select>
    </div>
  );
}

// Add an entity, or edit one. people: everyone (to pick the partner).
export function EntityForm({ entity = null, people, onSave, onClose, onArchive, onDelete }) {
  const editing = !!entity;
  const known = entity && entity.partner_id && people.some(p => p.id === entity.partner_id);
  const [f, setF] = useState(() => ({
    name: entity ? entity.name : '',
    partner: entity ? (known ? entity.partner_id : (entity.partner_name ? '__other' : '')) : '',
    partner_name: entity && !known ? (entity.partner_name || '') : '',
    formed_in: entity ? entity.formed_in : 'Nevada',
    operating_states: entity ? (entity.operating_states || []) : ['NV'],
    nv_entity_number: entity?.nv_entity_number || '', ein: entity?.ein || '', entity_npn: entity?.entity_npn || '',
    resident_license_number: entity?.resident_license_number || '', eo_carrier: entity?.eo_carrier || '',
    eo_policy_number: entity?.eo_policy_number || '', eo_expires_on: entity?.eo_expires_on || '',
    fg_writing_number: entity?.fg_writing_number || '', bank_name: entity?.bank_name || '',
    contact_email: entity?.contact_email || '', contact_phone: entity?.contact_phone || '',
    received_on: '', note: '',
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const box = useRef(null);
  useEffect(() => { if (box.current) box.current.focus(); }, []); // so Escape closes it
  const set = (k, v) => { setF(prev => ({ ...prev, [k]: v })); setErr(''); };
  const sorted = [...people].sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));
  const home = (US_STATES.find(s => s[1] === f.formed_in) || [''])[0];

  async function save() {
    if (!f.name.trim()) { setErr('Enter the entity name.'); return; }
    if (f.partner === '__other' && !f.partner_name.trim()) { setErr("Enter the partner's name, or pick someone on the team."); return; }
    if (f.contact_email.trim() && !isValidEmail(f.contact_email)) { setErr("The contact email doesn't look right."); return; }
    if (f.contact_phone.trim() && !isValidPhone(f.contact_phone)) { setErr("The contact phone doesn't look right. Include the area code."); return; }
    if (f.ein.trim() && !/^\d{2}-?\d{7}$/.test(f.ein.trim())) { setErr('The EIN is 9 digits, like 12-3456789.'); return; }
    if (f.received_on && f.received_on > todayStr()) { setErr("The application date can't be in the future."); return; }
    const partner = f.partner && f.partner !== '__other' ? people.find(p => p.id === f.partner) : null;
    const fields = {
      name: f.name, partner_id: partner ? partner.id : null,
      partner_name: partner ? partner.display_name : (f.partner === '__other' ? f.partner_name : null),
      formed_in: f.formed_in, operating_states: f.operating_states,
      nv_entity_number: f.nv_entity_number, ein: f.ein, entity_npn: f.entity_npn, resident_license_number: f.resident_license_number,
      eo_carrier: f.eo_carrier, eo_policy_number: f.eo_policy_number, eo_expires_on: f.eo_expires_on || null,
      fg_writing_number: f.fg_writing_number, bank_name: f.bank_name, contact_email: f.contact_email, contact_phone: f.contact_phone,
    };
    setBusy(true);
    const ok = await onSave(fields, { receivedOn: f.received_on, note: f.note.trim() });
    setBusy(false);
    if (!ok) setErr("Couldn't save. Check your connection and try again.");
  }

  const text = (k, label, props = {}) => (
    <label className="tr-field" key={k}>
      <span>{label}</span>
      <input value={f[k]} onChange={e => set(k, e.target.value)} autoComplete="off" {...props} />
    </label>
  );
  return (
    <Modal onClose={onClose}>
      <div className="tr-pf-form" role="dialog" aria-modal="true" aria-labelledby="tr-pf-form-title" ref={box} tabIndex={-1}>
        <div className="tr-row-head"><h3 className="tr-h3" id="tr-pf-form-title" style={{ margin: 0 }}>{editing ? 'Edit details' : 'Add an entity'}</h3><button type="button" className="tr-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        {editing ? null : <p className="tr-subtitle">A new subsidiary. It starts at Phase 1, step 1.</p>}
        {text('name', 'Entity name', { placeholder: 'Proposed or registered LLC name', maxLength: 160 })}
        <label className="tr-field">
          <span>Subsidiary partner</span>
          <select value={f.partner} onChange={e => set('partner', e.target.value)}>
            <option value="">Not picked yet</option>
            {sorted.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
            <option value="__other">Someone not in PaceLedger…</option>
          </select>
        </label>
        {f.partner === '__other' ? text('partner_name', "Partner's name", { maxLength: 120 }) : null}
        <div className="tr-form-grid">
          <label className="tr-field">
            <span>Formed in</span>
            <select value={f.formed_in} onChange={e => set('formed_in', e.target.value)}>
              {US_STATES.map(([c, n]) => <option key={c} value={n}>{n}</option>)}
            </select>
          </label>
          {editing ? null : (
            <label className="tr-field">
              <span>Application received (optional)</span>
              <input type="date" value={f.received_on} max={todayStr()} onChange={e => set('received_on', e.target.value)} />
              <small className="tr-field-hint">Ticks step 1 · Received</small>
            </label>
          )}
        </div>
        <div className="tr-field">
          <span>States it will operate in <em className="tr-pf-light">(each one other than {f.formed_in} needs a non-resident license)</em></span>
          <StatesPicker value={f.operating_states} home={home} onChange={v => set('operating_states', v)} />
        </div>
        <div className="tr-form-grid">
          {text('contact_email', 'Contact email', { type: 'email', inputMode: 'email', autoCapitalize: 'none', placeholder: 'optional' })}
          {text('contact_phone', 'Contact phone', { type: 'tel', inputMode: 'tel', placeholder: 'optional' })}
        </div>
        {editing ? (
          <>
            <div className="tr-pf-form-sub">Formation and licensing</div>
            <div className="tr-form-grid">
              {text('nv_entity_number', 'NV entity #', { maxLength: 60 })}
              {text('ein', 'EIN', { placeholder: '12-3456789', inputMode: 'numeric', maxLength: 10 })}
              {text('resident_license_number', 'NV license #', { maxLength: 60 })}
              {text('entity_npn', 'Entity NPN', { inputMode: 'numeric', maxLength: 20 })}
              {text('fg_writing_number', 'F&G writing #', { maxLength: 40 })}
              {text('bank_name', 'Bank (name only)', { maxLength: 120, placeholder: 'No account numbers' })}
            </div>
            <div className="tr-pf-form-sub">Errors and omissions</div>
            <div className="tr-form-grid">
              {text('eo_carrier', 'Carrier', { maxLength: 120 })}
              {text('eo_policy_number', 'Policy #', { maxLength: 60 })}
              <label className="tr-field"><span>Expires</span><input type="date" value={f.eo_expires_on || ''} onChange={e => set('eo_expires_on', e.target.value)} /></label>
            </div>
          </>
        ) : (
          <label className="tr-field">
            <span>Note (optional)</span>
            <textarea rows={2} maxLength={4000} value={f.note} onChange={e => set('note', e.target.value)} placeholder="Anything the other super admins should know" />
          </label>
        )}
        {err && <div className="tr-error">{err}</div>}
        <div className="tr-form-actions tr-pf-form-actions">
          {editing && onArchive ? <button type="button" className="tr-link-btn" onClick={onArchive} disabled={busy}>{entity.archived_at ? 'Bring back from archive' : 'Archive'}</button> : null}
          {editing && onDelete ? <button type="button" className="tr-link-btn tr-pf-danger" onClick={onDelete} disabled={busy}>Delete</button> : null}
          <span className="tr-pf-grow" />
          <button type="button" className="tr-btn tr-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="tr-btn tr-btn-brass" onClick={save} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add entity'}</button>
        </div>
      </div>
    </Modal>
  );
}
