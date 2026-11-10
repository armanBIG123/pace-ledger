// Submitted and Issued Premium: sold policies tracked through to issue, with
// notes your leaders can add (Pipeline → Won, Team → Track Production).
import { useEffect, useState } from 'react';
import { fmtApptDateTime, fmtDisplayDate } from '../../lib/dates.js';
import { fmtCurrency } from '../../lib/format.js';
import { addPolicyNote, fetchPolicyNotes, fetchSoldPolicies, isPolicyIssued, updatePolicyFields } from '../../data/appointments.js';
import { useLive } from '../../data/live.js';
import { openPicker, SkelBlock, SkeletonCards, TitleInfo } from '../../components/ui.jsx';

const NONE = [];

export function PolicyCard({ policy, canEdit, currentUser, onSaved }) {
  const [effectiveDate, setEffectiveDate] = useState(policy.effectiveDate || '');
  const [requirementsCompleted, setRequirementsCompleted] = useState(!!policy.requirementsCompleted);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  useEffect(() => {
    fetchPolicyNotes(policy.id).then(n => { setNotes(n); setNotesLoading(false); });
  }, [policy.id]);

  async function saveEffectiveDate(value) {
    setSaving(true);
    const ok = await updatePolicyFields(policy.id, { effectiveDate: value });
    setSaving(false);
    if (ok) onSaved();
  }
  async function toggleRequirements() {
    const next = !requirementsCompleted;
    setRequirementsCompleted(next);
    setSaving(true);
    const ok = await updatePolicyFields(policy.id, { requirementsCompleted: next });
    setSaving(false);
    if (ok) onSaved(); else setRequirementsCompleted(!next);
  }
  async function submitNote() {
    if (!newNote.trim()) return;
    setNoteSaving(true);
    const res = await addPolicyNote(policy.id, currentUser.id, currentUser.displayName, newNote);
    setNoteSaving(false);
    if (res.ok) { setNotes(prev => [...prev, res.record]); setNewNote(''); }
  }
  function handleNoteKeyDown(e) { if (e.key === 'Enter') { e.preventDefault(); submitNote(); } }

  return (
    <div className="tr-card tr-policy-card">
      <div className="tr-policy-head">
        <div>
          <strong>{policy.client}</strong>
          <div className="tr-note">{policy.presenter ? `${policy.presenter} · ` : ''}Submitted {fmtApptDateTime(policy)}</div>
        </div>
        <div className="tr-mono tr-policy-premium">{fmtCurrency(policy.targetPremium)}</div>
      </div>
      <div className="tr-policy-fields">
        <label className="tr-field">
          <span>Effective date</span>
          {canEdit ? (
            <input type="date" value={effectiveDate} onChange={e => { setEffectiveDate(e.target.value); saveEffectiveDate(e.target.value); }} onClick={openPicker} />
          ) : (
            <div className="tr-empty">{effectiveDate ? fmtDisplayDate(effectiveDate) : 'Not set yet'}</div>
          )}
        </label>
        <div className="tr-field">
          <span>Requirements</span>
          {canEdit ? (
            <button type="button" className={`tr-btn tr-btn-sm ${requirementsCompleted ? 'tr-btn-brass' : 'tr-btn-ghost'}`} onClick={toggleRequirements} disabled={saving}>
              {requirementsCompleted ? '✓ Completed' : 'Mark complete'}
            </button>
          ) : (
            <div className="tr-empty">{requirementsCompleted ? '✓ Completed' : 'Pending'}</div>
          )}
        </div>
      </div>
      <div className="tr-policy-notes">
        <h4 className="tr-h4">Notes</h4>
        {notesLoading ? <SkelBlock w="100%" h="40px" /> : notes.length === 0 ? (
          <p className="tr-empty">No notes yet.</p>
        ) : (
          <div className="tr-notes-list">
            {notes.map(n => (
              <div key={n.id} className="tr-note-item">
                <div className="tr-note-meta">{n.author_name} · {new Date(n.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                <div>{n.note}</div>
              </div>
            ))}
          </div>
        )}
        <div className="tr-note-add" onKeyDown={handleNoteKeyDown}>
          <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Note an open requirement…" aria-label="Add a note about open requirements" />
          <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={submitNote} disabled={noteSaving || !newNote.trim()}>Add</button>
        </div>
      </div>
    </div>
  );
}

// mineOnly: just your own policies (Pipeline → Won; your team's are in Team
// → Track Production). head: false when the screen around it has a title.
export function OpenRequirementsBody({ view, user, mineOnly = false, head = true }) {
  const live = useLive(['sold-policies', user.id], () => fetchSoldPolicies(), { topics: ['appointments'] });
  const policies = live.data || NONE;
  const loading = live.loading;

  const filtered = policies
    .filter(p => !mineOnly || p.userId === user.id)
    .filter(p => (view === 'issued' ? isPolicyIssued(p) : !isPolicyIssued(p)))
    .sort((a, b) => b.appointmentDate.localeCompare(a.appointmentDate));

  return (
    <>
      {head && <div className="tr-row-head tr-screen-head">
        <TitleInfo className="tr-section-title" title={view === 'issued' ? 'Issued Premium' : 'Submitted Premium'}
          info={view === 'issued'
            ? 'Policies whose effective date has arrived and all requirements are complete.'
            : 'Submitted policies still waiting on their effective date and/or open requirements. Your leaders can see these too and add notes to help get them issued.'} />
      </div>}
      {loading ? <SkeletonCards count={2} /> : filtered.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">Nothing here yet.</p></div>
      ) : (
        filtered.map(p => (
          <PolicyCard key={p.id} policy={p} canEdit={p.userId === user.id} currentUser={user} onSaved={live.reload} />
        ))
      )}
    </>
  );
}
