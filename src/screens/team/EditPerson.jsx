// Manage Team → Edit: one person at a time. Their name, phone, role,
// reports-to and comp level, saved together with Save changes. A role,
// reports-to or comp level change needs a reason; every change goes in the
// activity log with who made it and why (pl_admin_save_person in
// migration-manage-team-edits.sql).
import { useEffect, useMemo, useRef, useState } from 'react';
import { History, X } from 'lucide-react';
import { Modal } from '../../components/ui.jsx';
import { askConfirm } from '../../components/confirm.jsx';
import { HIERARCHY_TIERS } from '../../hierarchy.js';
import { adminSavePerson, fetchPersonHistory } from '../../data/team.js';
import { auditAction, changesPayload, needsReason, personChanges, phoneDigits } from '../../lib/personEdits.js';
import { fmtPhone } from '../../lib/phone.js';
import { joinedDate } from '../../lib/dates.js';

const squish = s => String(s || '').trim().replace(/\s+/g, ' ');
export const logTime = at => new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// roleOptions: [[value, label]]. uplineOptions: <option>s for Reports to.
// lockOwn: a Super Manager editing themselves (name and phone only).
export function EditPersonSheet({ person, phone = '', phonesOn = true, nameOf, roleOptions, roleLocked = false, uplineOptions, lockOwn = false, onClose, onSaved }) {
  const start = useMemo(() => ({
    display_name: person.display_name || '', phone: phone ? fmtPhone(phone) : '', role: person.role,
    manager_id: person.manager_id || '', hierarchy_tier: person.hierarchy_tier || '',
  }), [person, phone]);
  const [f, setF] = useState(start);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [history, setHistory] = useState(null);
  const reasonRef = useRef(null);
  const nameRef = useRef(null);
  useEffect(() => {
    let alive = true;
    fetchPersonHistory(person.id, person.display_name).then(rows => { if (alive) setHistory(rows); });
    return () => { alive = false; };
  }, [person.id, person.display_name]);

  const set = (k, v) => { setF(x => ({ ...x, [k]: v })); setErr(''); };
  const changes = personChanges({ ...person, phone }, f, nameOf);
  const why = needsReason(changes);
  const nameChanged = changes.some(c => c.key === 'display_name');
  const phoneBad = !!f.phone.trim() && phoneDigits(f.phone) === null;
  const showsUpline = ['advisor', 'manager', 'super_manager'].includes(f.role);
  const first = squish(person.display_name).split(' ')[0] || 'them';

  async function close() {
    if (busy) return;
    if (changes.length || phoneBad) {
      const ok = await askConfirm({ title: 'Discard your changes?', body: `${person.display_name}'s account stays as it was.`, confirmLabel: 'Discard', danger: true });
      if (!ok) return;
    }
    onClose();
  }

  async function save(e) {
    e.preventDefault();
    if (busy) return;
    if (nameChanged && squish(f.display_name).split(' ').length < 2) { setErr('Enter their first and last name.'); if (nameRef.current) nameRef.current.focus(); return; }
    if (phoneBad) { setErr('Enter a 10-digit phone number, with the area code.'); return; }
    if (!changes.length) return;
    if (why && !reason.trim()) { setErr('Add a reason for the change.'); if (reasonRef.current) reasonRef.current.focus(); return; }
    setBusy(true); setErr('');
    const res = await adminSavePerson(person.id, changesPayload(changes, f), reason.trim());
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    onSaved(res.person, changes);
  }

  return (
    <Modal onClose={close} labelledBy="tr-edit-person-title" className="tr-edit-person">
      <form onSubmit={save} noValidate>
        <div className="tr-row-head">
          <div style={{ minWidth: 0 }}>
            <h3 className="tr-h3" id="tr-edit-person-title" style={{ margin: 0 }}>Edit {person.display_name}</h3>
            <p className="tr-subtitle" style={{ margin: '2px 0 0' }}>Joined {joinedDate(person.created_at)}{person.email ? ` · ${person.email}` : ''}</p>
          </div>
          <button type="button" className="tr-icon-btn" onClick={close} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="tr-ep-fields">
          <label className="tr-field tr-ep-wide">
            <span>Name</span>
            <input ref={nameRef} value={f.display_name} onChange={e => set('display_name', e.target.value)} maxLength={80} autoComplete="off" />
          </label>
          {phonesOn ? (
            <label className="tr-field tr-ep-wide">
              <span>Phone</span>
              <input type="tel" inputMode="tel" value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="Not added yet" autoComplete="off" maxLength={20}
                aria-invalid={phoneBad || undefined} />
              <small className="tr-field-hint">{phoneBad ? 'Enter 10 digits, with the area code.' : `Only ${first}, their upline and admins see it.`}</small>
            </label>
          ) : null}
          <label className="tr-field">
            <span>Role</span>
            <select value={f.role} onChange={e => set('role', e.target.value)} disabled={roleLocked || lockOwn}>
              {roleOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="tr-field">
            <span>Reports to</span>
            {showsUpline ? (
              <select value={f.manager_id} onChange={e => set('manager_id', e.target.value)} disabled={lockOwn}>{uplineOptions}</select>
            ) : <select disabled value=""><option value="">— nobody (super admin) —</option></select>}
          </label>
          <label className="tr-field tr-ep-wide">
            <span>Comp level</span>
            <select value={f.hierarchy_tier} onChange={e => set('hierarchy_tier', e.target.value)} disabled={lockOwn}>
              <option value="">— not set —</option>
              {HIERARCHY_TIERS.map(t => <option key={t.key} value={t.key}>{t.key} · {t.name} · {t.commission}%</option>)}
            </select>
          </label>
          {lockOwn ? <p className="tr-field-hint tr-ep-wide" style={{ margin: 0 }}>Only a super admin can change your own role, upline or comp level.</p> : null}
        </div>

        {changes.length ? (
          <div className="tr-ep-changes" aria-live="polite">
            <div className="tr-ep-changes-h">{changes.length === 1 ? 'You’re changing' : `You’re changing ${changes.length} things`}</div>
            <ul>
              {changes.map(c => <li key={c.key}><strong>{c.label}:</strong> {c.from} → {c.to}</li>)}
            </ul>
            <label className="tr-field">
              <span>{why ? 'Reason for the change' : 'Reason (optional)'}</span>
              <textarea ref={reasonRef} rows={2} value={reason} onChange={e => { setReason(e.target.value); setErr(''); }} maxLength={500}
                placeholder={why ? 'For example: passed the exam and got contracted' : 'For example: fixed a typo'} aria-required={why || undefined} />
              {why ? <small className="tr-field-hint">Needed for a role, reports-to or comp level change. It goes in the activity log.</small> : null}
            </label>
          </div>
        ) : null}

        {err ? <div className="tr-error" role="alert">{err}</div> : null}
        <div className="tr-form-actions">
          <button type="button" className="tr-btn tr-btn-ghost" onClick={close} disabled={busy}>Cancel</button>
          <button type="submit" className="tr-btn tr-btn-brass" disabled={busy || !changes.length}>{busy ? 'Saving…' : 'Save changes'}</button>
        </div>

        <div className="tr-ep-history">
          <div className="tr-ep-history-h"><History size={14} aria-hidden="true" /> Recent changes to {first}’s account</div>
          {history === null ? <p className="tr-empty">Loading…</p> : history.length === 0 ? <p className="tr-empty">Nothing logged yet.</p> : (
            <ul>
              {history.map(h => (
                <li key={h.id}>
                  <span className="tr-audit-time">{logTime(h.created_at)}</span>
                  <span>
                    <strong>{h.actor_name}</strong> {auditAction(h.action).toLowerCase()}{h.details ? <span className="tr-note"> ({h.details})</span> : null}
                    {h.reason ? <span className="tr-audit-reason">“{h.reason}”</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </form>
    </Modal>
  );
}
