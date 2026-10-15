// Follow Up: past appointments, notes, next steps, intake forms and recruit sign-up.
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Search, Trash2, X } from 'lucide-react';
import { supabase } from '../supabaseClient.js';
import { createClientIntakeCandidate, deleteClientIntakeCandidate, fetchClientIntakeCandidates } from '../clientIntake.js';
import { ClientIntakeSection } from '../ClientIntake.jsx';
import { addFollowUpNote, deleteFollowUpNote, fetchMyFollowUpNotes } from '../followUpNotes.js';
import { daysSince, fmtApptDateTime, fmtFollowUpDateTime, fmtNoteStamp } from '../lib/dates.js';
import { applyFollowUpToList, fetchMyAppointments, isPastAppointment, isRecruitType, isSaleType, OUTCOME_OPTIONS, persistFollowUp, STATUS_OPTIONS, typeLabel } from '../data/appointments.js';
import { normName } from '../data/prospects.js';
import { fetchOrgDirectory } from '../data/team.js';
import { ContactLinks, PageHead, SkelBlock } from '../components/ui.jsx';
import { RecruitSignupSection } from '../components/invites.jsx';
import { FollowUpModal } from './Appointments.jsx';

// One-tap note starters, so logging a touch takes a second.
export const QUICK_NOTE_TAGS = ['Called', 'Left voicemail', 'Texted', 'Emailed', 'Met in person', 'No answer'];

export const FOLLOW_UP_VIEW_TITLES = {
  all: 'Follow up', nolog: 'Outcome not logged', needs: 'Needs follow-up', reschedule: 'Needs reschedule',
  nointake: 'Intake not started', sent: 'Intake link sent', received: 'Intake received',
  recruit_open: 'Recruits not signed up yet', recruit_joined: 'Recruits signed up',
};

export function FollowUpBody({ user, onScheduleNext, initialIntent, onIntentConsumed }) {
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState([]);
  const [notes, setNotes] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [view, setView] = useState(['nolog', 'needs', 'reschedule'].includes(initialIntent) ? initialIntent : initialIntent === 'intake' ? 'nointake' : 'all'); // all | nolog | needs | reschedule | nointake | sent | received
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [noteDrafts, setNoteDrafts] = useState({});
  const [modalTarget, setModalTarget] = useState(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [orgDirectory, setOrgDirectory] = useState([]);

  useEffect(() => { if (initialIntent) onIntentConsumed?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Requests that arrive while this tab is already open (+ New → Log how it went).
  useEffect(() => {
    if (['nolog', 'needs', 'reschedule'].includes(initialIntent)) { setView(initialIntent); onIntentConsumed?.(); }
  }, [initialIntent]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true;
    Promise.all([fetchMyAppointments(user.id), fetchMyFollowUpNotes(user.id), fetchClientIntakeCandidates(user.id), fetchOrgDirectory()]).then(([a, n, c, org]) => {
      if (!alive) return;
      setOrgDirectory(org);
      setAppointments(a);
      setNotes(n);
      setCandidates(c.filter(x => x.advisor_id === user.id));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [user.id]);

  if (loading) return <SkelBlock w="100%" h="260px" />;

  const apptTime = a => (a.appointmentAt ? new Date(a.appointmentAt).getTime() : new Date(`${a.appointmentDate}T${a.appointmentTime || '00:00'}`).getTime());
  const past = appointments.filter(isPastAppointment).sort((a, b) => apptTime(b) - apptTime(a));
  const candByAppt = {};
  candidates.forEach(c => { if (c.source_appointment_id) candByAppt[c.source_appointment_id] = c; });
  const notesByAppt = {};
  notes.forEach(n => { (notesByAppt[n.appointment_id] = notesByAppt[n.appointment_id] || []).push(n); });

  const intakeState = a => { const c = candByAppt[a.id]; return !c ? 'none' : c.status === 'submitted' ? 'received' : 'sent'; };
  // A recruit counts as signed up once someone with their name has joined
  // directly under you.
  const myRecruitNames = new Set(orgDirectory.filter(p => p.manager_id === user.id).map(p => normName(p.display_name)));
  const recruitJoined = a => myRecruitNames.has(normName(a.client));
  const matchesView = (a, v) => {
    if (v === 'all') return true;
    if (v === 'recruit_open') return isRecruitType(a) && !recruitJoined(a);
    if (v === 'recruit_joined') return isRecruitType(a) && recruitJoined(a);
    if (v === 'nolog') return !a.followUpCompletedAt;
    if (v === 'needs') return a.status === 'needs_follow_up';
    if (v === 'reschedule') return a.status === 'needs_reschedule';
    return intakeState(a) === (v === 'nointake' ? 'none' : v);
  };
  const counts = {
    all: past.length,
    nolog: past.filter(a => matchesView(a, 'nolog')).length,
    reschedule: past.filter(a => matchesView(a, 'reschedule')).length,
    recruit_open: past.filter(a => matchesView(a, 'recruit_open')).length,
    recruit_joined: past.filter(a => matchesView(a, 'recruit_joined')).length,
    needs: past.filter(a => a.status === 'needs_follow_up').length,
    nointake: past.filter(a => intakeState(a) === 'none').length,
    sent: past.filter(a => intakeState(a) === 'sent').length,
    received: past.filter(a => intakeState(a) === 'received').length,
  };
  const q = searchQuery.trim().toLowerCase();
  const list = past
    .filter(a => matchesView(a, view))
    .filter(a => !q || a.client.toLowerCase().includes(q));

  async function handleSaveOutcome(id, data) {
    setModalSaving(true);
    const original = appointments.find(a => a.id === id);
    const res = await persistFollowUp(user, id, original, data);
    setModalSaving(false);
    if (!res.ok) return;
    setAppointments(prev => applyFollowUpToList(prev, id, data, res.followUpTimezone, res.newAppt));
    if (data.clientIntake === true) {
      const c = await fetchClientIntakeCandidates(user.id);
      setCandidates(c.filter(x => x.advisor_id === user.id));
    }
    setModalTarget(null);
  }
  async function handleAddNote(a, preset) {
    const text = (preset || noteDrafts[a.id] || '').trim();
    if (!text) return;
    setBusyId(a.id);
    const res = await addFollowUpNote({ appointmentId: a.id, authorId: user.id, authorName: user.displayName, note: text });
    setBusyId(null);
    if (!res.ok) return;
    setNotes(prev => [res.record, ...prev]);
    if (!preset) setNoteDrafts(prev => ({ ...prev, [a.id]: '' }));
  }
  async function handleDeleteNote(n) {
    if (!window.confirm('Delete this note?')) return;
    if (await deleteFollowUpNote(n.id)) setNotes(prev => prev.filter(x => x.id !== n.id));
  }
  async function handleSendIntake(a) {
    setBusyId(a.id);
    const res = await createClientIntakeCandidate({ advisorId: user.id, advisorName: user.displayName, appointmentId: a.id, clientName: a.client });
    if (res.ok) {
      await supabase.from('appointments').update({ client_intake_requested: true }).eq('id', a.id);
      setCandidates(prev => [res.record, ...prev]);
      setAppointments(prev => prev.map(x => x.id === a.id ? { ...x, clientIntakeRequested: true } : x));
    }
    setBusyId(null);
  }
  async function handleRemoveIntake(a, candidate) {
    if (!window.confirm(`Remove ${a.client}'s intake? Their link will stop working and any answers are deleted.`)) return;
    if (await deleteClientIntakeCandidate(candidate.id)) {
      await supabase.from('appointments').update({ client_intake_requested: false }).eq('id', a.id);
      setCandidates(prev => prev.filter(c => c.id !== candidate.id));
      setAppointments(prev => prev.map(x => x.id === a.id ? { ...x, clientIntakeRequested: false } : x));
    }
  }

  const navBtn = (v, label, color = 'week') => (
    <button type="button" key={v} className={`tr-sidebar-item tr-sidebar-item-${color} ${view === v ? 'tr-sidebar-item-active' : ''}`} onClick={() => setView(v)}>
      <span>{label}</span><span className="tr-mono">{counts[v]}</span>
    </button>
  );

  return (
    <div className="tr-appts-shell">
      <nav className="tr-appts-sidebar">
        {navBtn('all', 'All past')}
        <div className="tr-sidebar-divider">To do</div>
        {navBtn('nolog', 'Outcome not logged', 'rust')}
        {navBtn('needs', 'Needs follow-up', 'amber')}
        {navBtn('reschedule', 'Needs reschedule', 'violet')}
        <div className="tr-sidebar-divider">Client intake</div>
        {navBtn('nointake', 'Not started', 'none')}
        {navBtn('sent', 'Link sent', 'amber')}
        {navBtn('received', 'Received', 'green')}
        <div className="tr-sidebar-divider">Recruits</div>
        {navBtn('recruit_open', 'Not signed up yet', 'recruit')}
        {navBtn('recruit_joined', 'Signed up', 'green')}
      </nav>
      <div className="tr-appts-main">
        <PageHead title={FOLLOW_UP_VIEW_TITLES[view] || 'Follow up'}
          sub={view === 'all' ? `${past.length} past appointment${past.length === 1 ? '' : 's'}${counts.nolog ? ` · ${counts.nolog} still need an outcome` : ''}` : `${list.length} of ${past.length} past appointments`} />
        <div className="tr-search-row">
          <Search size={15} className="tr-search-icon" />
          <input className="tr-search-input" type="text" placeholder="Search by client name…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          {searchQuery && <button type="button" className="tr-icon-btn" onClick={() => setSearchQuery('')} title="Clear search"><X size={15} /></button>}
        </div>
        <div className="tr-fu-list">
        {list.length === 0 ? (
          <div className="tr-card"><p className="tr-empty">{past.length === 0 ? 'Appointments land here once their time has passed.' : 'Nothing matches this view.'}</p></div>
        ) : list.map(a => {
          const open = expandedId === a.id;
          const st = STATUS_OPTIONS.find(o => o.value === a.status);
          const outcome = OUTCOME_OPTIONS.find(o => o.value === a.outcome);
          const cand = candByAppt[a.id];
          const istate = intakeState(a);
          const apptNotes = notesByAppt[a.id] || [];
          return (
            <div className="tr-card tr-fu-card" key={a.id}>
              <div
                role="button" tabIndex={0} className="tr-fu-head" aria-expanded={open}
                onClick={() => setExpandedId(open ? null : a.id)}
                onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setExpandedId(open ? null : a.id); } }}>
                <div>
                  <strong>{a.client}</strong>
                  {typeLabel(a) ? <span className="tr-empty"> · {typeLabel(a)}</span> : null}
                  <div className="tr-empty" style={{ margin: 0 }}>{fmtApptDateTime(a)}</div>
                  {a.followUpAppointmentDate && <div className="tr-empty" style={{ margin: 0 }}>Next: {fmtFollowUpDateTime(a)}</div>}
                  {apptNotes.length > 0 && (
                    <div className="tr-fu-lastnote">
                      Last touch {daysSince(apptNotes[0].created_at) === 0 ? 'today' : `${daysSince(apptNotes[0].created_at)}d ago`}: {apptNotes[0].note}
                    </div>
                  )}
                </div>
                <div className="tr-fu-chips">
                  {a.followUpCompletedAt
                    ? (st && st.value ? <span className={`tr-status tr-status-${st.color}`}>{st.label}</span> : null)
                    : <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={e => { e.stopPropagation(); setModalTarget(a); }}>Log outcome</button>}
                  {istate !== 'none' && <span className={`tr-status ${istate === 'received' ? 'tr-status-green' : 'tr-status-amber'}`}>{istate === 'received' ? 'Intake received' : 'Intake sent'}</span>}
                  {apptNotes.length > 0 && <span className="tr-status tr-status-none">{apptNotes.length} note{apptNotes.length === 1 ? '' : 's'}</span>}
                  {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>
              {open && (
                <div className="tr-fu-body">
                  <div className="tr-fu-section">
                    <div className="tr-row-head">
                      <h4 className="tr-h4" style={{ margin: 0 }}>Outcome</h4>
                      <span className="tr-empty" style={{ margin: 0 }}>{outcome ? outcome.label : 'Not logged yet'}</span>
                    </div>
                    <ContactLinks email={a.clientEmail} />
                    <div className="tr-form-actions" style={{ marginTop: 8, justifyContent: 'flex-start' }}>
                      <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={() => setModalTarget(a)}>{a.followUpCompletedAt ? 'Update outcome' : 'Log outcome'}</button>
                      <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => onScheduleNext({ client: a.client, notes: '', clientEmail: a.clientEmail, typeRecruit: isRecruitType(a), typeSale: isSaleType(a) })}>
                        <Plus size={13} /> Schedule next appointment
                      </button>
                    </div>
                  </div>

                  {isRecruitType(a) && (
                    <div className="tr-fu-section">
                      <RecruitSignupSection user={user} recruitName={a.client} recruitEmail={a.clientEmail} joined={recruitJoined(a)} appointmentId={a.id} />
                    </div>
                  )}

                  <div className="tr-fu-section">
                    {cand ? (
                      <ClientIntakeSection candidate={cand} canManage onRemove={() => handleRemoveIntake(a, cand)} />
                    ) : (
                      <div className="tr-row-head">
                        <h4 className="tr-h4" style={{ margin: 0 }}>Client intake</h4>
                        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" disabled={busyId === a.id} onClick={() => handleSendIntake(a)}>Send client intake</button>
                      </div>
                    )}
                  </div>

                  <div className="tr-fu-section">
                    <h4 className="tr-h4">Follow-up notes</h4>
                    <div className="tr-fu-quicktags">
                      {QUICK_NOTE_TAGS.map(tag => (
                        <button key={tag} type="button" className="tr-pill-btn" disabled={busyId === a.id} onClick={() => handleAddNote(a, tag)} title={`Log "${tag}" with today's date`}>+ {tag}</button>
                      ))}
                    </div>
                    <div className="tr-intake-link-row">
                      <input
                        className="tr-search-input" style={{ flex: 1 }} type="text" placeholder="Add a note — called, texted, wants intake, next steps…"
                        value={noteDrafts[a.id] || ''} onChange={e => setNoteDrafts(prev => ({ ...prev, [a.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddNote(a); }} />
                      <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" disabled={busyId === a.id || !(noteDrafts[a.id] || '').trim()} onClick={() => handleAddNote(a)}>Add</button>
                    </div>
                    {apptNotes.length === 0 ? (
                      <p className="tr-empty">No notes yet.</p>
                    ) : (
                      <div className="tr-notes-list" style={{ marginTop: 10 }}>
                        {apptNotes.map(n => (
                          <div className="tr-note-item" key={n.id}>
                            <div className="tr-row-head">
                              <div className="tr-note-meta">{fmtNoteStamp(n.created_at)}</div>
                              <button type="button" className="tr-icon-btn" onClick={() => handleDeleteNote(n)} title="Delete note"><Trash2 size={14} /></button>
                            </div>
                            <div>{n.note}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        </div>
      </div>
      {modalTarget && <FollowUpModal appointment={modalTarget} onClose={() => setModalTarget(null)} onSave={handleSaveOutcome} saving={modalSaving} />}
    </div>
  );
}
