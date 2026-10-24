// Follow Up: past appointments, notes, next steps, intake forms and recruit sign-up.
import { useEffect, useRef, useState } from 'react';
import { CheckCheck, ChevronDown, ChevronUp, Pencil, Plus, Presentation, Search, Trash2, X } from 'lucide-react';
import { deleteClientIntakeCandidate, fetchClientIntakeCandidates } from '../clientIntake.js';
import { intakeChanged, openIntakeSend } from '../lib/intakeEvents.js';
import { intakeStatusText, intakeStatusTone } from '../lib/intakeStatus.js';
import { lowerFirst } from '../lib/format.js';
import { ClientIntakeSection } from '../ClientIntake.jsx';
import { addFollowUpNote, deleteFollowUpNote, fetchMyFollowUpNotes } from '../followUpNotes.js';
import { daysSince, fmtApptDateTime, fmtFollowUpDateTime, fmtNoteStamp } from '../lib/dates.js';
import { applyFollowUpToList, fetchAppointmentsImOn, fetchMyAppointments, isPastAppointment, isRecruitType, isSaleType, loggedSummary, logPresentedAppointment, OUTCOME_OPTIONS, persistFollowUp, setAppointmentIntakeRequested, STATUS_OPTIONS, typeLabel } from '../data/appointments.js';
import { normName } from '../data/prospects.js';
import { fetchOrgDirectory } from '../data/team.js';
import { PageHead, SkelBlock } from '../components/ui.jsx';
import { appointmentTexts, ContactRow } from '../components/contact.jsx';
import { RecruitSignupSection } from '../components/invites.jsx';
import { FollowUpModal } from '../components/followUpModal.jsx';
import { applyAppointmentEdit, openAppointment, useAppointmentEdits } from '../components/appointmentPanel.jsx';

// One-tap note starters, so logging a touch takes a second.
export const QUICK_NOTE_TAGS = ['Called', 'Left voicemail', 'Texted', 'Emailed', 'Met in person', 'No answer'];

export const FOLLOW_UP_VIEW_TITLES = {
  all: 'All past appointments', nolog: 'Outcome not logged', presented: 'You presented', needs: 'Needs follow-up', reschedule: 'Needs reschedule',
  completed: 'Completed', not_completed: "Didn't happen",
  nointake: 'Intake not started', sent: 'Intake link sent', received: 'Intake received',
  recruit_open: 'Recruits not signed up yet', recruit_joined: 'Recruits signed up',
};

const ALL_VIEWS = ['all', 'nolog', 'presented', 'needs', 'reschedule', 'completed', 'not_completed', 'nointake', 'sent', 'received', 'recruit_open', 'recruit_joined'];
// "You presented": appointments your team booked that you presented, from
// the last 30 days. You can log how they went; the advisor's own log stands.
export const PRESENTED_DAYS = 30;

// A request can name a list ('needs'), or a list and one card to open:
// { view: 'needs', open: appointmentId } (Today's "Follow up with …").
const intentView = i => (i && typeof i === 'object' ? intentView(i.view) : i === 'intake' ? 'nointake' : i);
const intentOpen = i => (i && typeof i === 'object' ? i.open || null : null);

// views: which of the lists above this screen offers (Pipeline shows "Log
// outcome" and "Follow-up" as two stages, each with its own lists); the
// first is where it opens unless a request asks for another.
export function FollowUpBody({ user, onScheduleNext, initialIntent, onIntentConsumed, views = ALL_VIEWS }) {
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState([]);
  const [notes, setNotes] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [view, setView] = useState(views.includes(intentView(initialIntent)) ? intentView(initialIntent) : views[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [flash, setFlash] = useState('');
  useEffect(() => { if (!flash) return undefined; const t = setTimeout(() => setFlash(''), 6000); return () => clearTimeout(t); }, [flash]);
  const [expandedId, setExpandedId] = useState(() => intentOpen(initialIntent));
  const [noteDrafts, setNoteDrafts] = useState({});
  const [modalTarget, setModalTarget] = useState(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [orgDirectory, setOrgDirectory] = useState([]);
  const [presented, setPresented] = useState([]);
  const [presentedTarget, setPresentedTarget] = useState(null);
  // Cards you just sent an intake from stay in the list you're on.
  const [pinned, setPinned] = useState(() => new Set());
  useEffect(() => { setPinned(new Set()); }, [view]);
  // An intake form was made or sent from the send window: show it here.
  useEffect(() => {
    const on = e => {
      const d = e && e.detail;
      if (!d || !d.candidate || d.candidate.advisor_id !== user.id) return;
      setCandidates(prev => [d.candidate, ...prev.filter(c => c.id !== d.candidate.id)]);
      if (d.candidate.source_appointment_id) setAppointments(prev => prev.map(x => (x.id === d.candidate.source_appointment_id ? { ...x, clientIntakeRequested: true } : x)));
    };
    window.addEventListener('paceledger:intake-changed', on);
    return () => window.removeEventListener('paceledger:intake-changed', on);
  }, [user.id]);

  useEffect(() => { if (initialIntent) onIntentConsumed?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Requests that arrive while this tab is already open (+ New → Log how it went).
  useEffect(() => {
    if (initialIntent && views.includes(intentView(initialIntent))) {
      setView(intentView(initialIntent));
      if (intentOpen(initialIntent)) setExpandedId(intentOpen(initialIntent));
      onIntentConsumed?.();
    }
  }, [initialIntent]); // eslint-disable-line react-hooks/exhaustive-deps
  // The card asked for is open: bring it into view once the list is there.
  const scrolledTo = useRef(null);
  useEffect(() => {
    if (loading || !expandedId || scrolledTo.current === expandedId) return;
    scrolledTo.current = expandedId;
    const el = document.querySelector(`[data-fu-card="${expandedId}"]`);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [loading, expandedId]);
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchMyAppointments(user.id), fetchMyFollowUpNotes(user.id), fetchClientIntakeCandidates(user.id), fetchOrgDirectory(),
      views.includes('presented') ? fetchAppointmentsImOn(user.id).catch(() => []) : Promise.resolve([]),
    ]).then(([a, n, c, org, on]) => {
      if (!alive) return;
      setOrgDirectory(org);
      setPresented(on.filter(x => x.presentingFor));
      setAppointments(a);
      setNotes(n);
      setCandidates(c.filter(x => x.advisor_id === user.id));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [user.id]);
  // "Edit appointment" opens it in a window; this list follows what changed.
  useAppointmentEdits(change => {
    if (change.reload) fetchMyAppointments(user.id).then(setAppointments);
    else setAppointments(prev => applyAppointmentEdit(prev, change));
  });

  if (loading) return <SkelBlock w="100%" h="260px" />;

  const apptTime = a => (a.appointmentAt ? new Date(a.appointmentAt).getTime() : new Date(`${a.appointmentDate}T${a.appointmentTime || '00:00'}`).getTime());
  const past = appointments.filter(isPastAppointment).sort((a, b) => apptTime(b) - apptTime(a));
  const candByAppt = {};
  candidates.forEach(c => { if (c.source_appointment_id) candByAppt[c.source_appointment_id] = c; });
  const notesByAppt = {};
  notes.forEach(n => { (notesByAppt[n.appointment_id] = notesByAppt[n.appointment_id] || []).push(n); });

  // A link made but never sent still counts as not started.
  const intakeState = a => { const c = candByAppt[a.id]; return !c ? 'none' : c.status === 'submitted' ? 'received' : c.sent_via ? 'sent' : 'none'; };
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
    if (v === 'completed') return a.status === 'completed';
    if (v === 'not_completed') return a.status === 'not_completed';
    return intakeState(a) === (v === 'nointake' ? 'none' : v);
  };
  const presentedFrom = Date.now() - PRESENTED_DAYS * 864e5;
  const presentedPast = presented.filter(a => isPastAppointment(a) && apptTime(a) >= presentedFrom).sort((a, b) => apptTime(b) - apptTime(a));
  const nameOf = id => (orgDirectory.find(p => p.id === id) || {}).display_name || '';
  const counts = {
    all: past.length,
    nolog: past.filter(a => matchesView(a, 'nolog')).length,
    presented: presentedPast.filter(a => !a.followUpCompletedAt).length,
    reschedule: past.filter(a => matchesView(a, 'reschedule')).length,
    completed: past.filter(a => matchesView(a, 'completed')).length,
    not_completed: past.filter(a => matchesView(a, 'not_completed')).length,
    recruit_open: past.filter(a => matchesView(a, 'recruit_open')).length,
    recruit_joined: past.filter(a => matchesView(a, 'recruit_joined')).length,
    needs: past.filter(a => a.status === 'needs_follow_up').length,
    nointake: past.filter(a => intakeState(a) === 'none').length,
    sent: past.filter(a => intakeState(a) === 'sent').length,
    received: past.filter(a => intakeState(a) === 'received').length,
  };
  const q = searchQuery.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, '');
  const found = a => !q || a.client.toLowerCase().includes(q) || (qDigits.length >= 3 && (a.clientPhone || '').replace(/\D/g, '').includes(qDigits));
  const list = view === 'presented' ? presentedPast.filter(found) : past
    .filter(a => matchesView(a, view) || pinned.has(a.id))
    .filter(found);

  async function handleSaveOutcome(id, data) {
    setModalSaving(true);
    const original = appointments.find(a => a.id === id);
    const res = await persistFollowUp(user, id, original, data);
    setModalSaving(false);
    if (!res.ok) return;
    setAppointments(prev => applyFollowUpToList(prev, id, data, res.followUpTimezone, res.newAppt));
    window.dispatchEvent(new Event('paceledger:appointments-changed'));
    if (data.clientIntake === true) {
      const c = await fetchClientIntakeCandidates(user.id);
      setCandidates(c.filter(x => x.advisor_id === user.id));
    }
    setModalTarget(null);
  }
  // One you presented: saved on the advisor's appointment, so the sale or
  // recruit counts for them.
  async function handlePresentedSave(id, data) {
    setModalSaving(true);
    const original = presented.find(a => a.id === id);
    const res = await logPresentedAppointment(id, data);
    setModalSaving(false);
    const who = original && original.setByName ? original.setByName.split(' ')[0] : 'The advisor';
    if (!res.ok) {
      if (/already_logged/.test(res.error || '')) {
        setPresentedTarget(null);
        setFlash(`${who} already logged this one, so it's theirs to change.`);
        const on = await fetchAppointmentsImOn(user.id).catch(() => null);
        if (on) setPresented(on.filter(x => x.presentingFor));
      } else setFlash("Couldn't save. Check your connection and try again.");
      return;
    }
    setPresented(prev => prev.map(a => (a.id === id ? { ...a, ...res.record } : a)));
    window.dispatchEvent(new Event('paceledger:appointments-changed'));
    setPresentedTarget(null);
    setFlash(`Saved — ${res.record.client}. ${who} will see it on their Today.${res.followUp ? ` The follow-up is on ${who === 'The advisor' ? 'their' : `${who}'s`} list.` : ''}`);
  }
  // "Pick a new time" in the log window moved it back to upcoming.
  function handleRescheduled(rec, info) {
    setAppointments(prev => prev.map(a => (a.id === rec.id ? rec : a)));
    window.dispatchEvent(new Event('paceledger:appointments-changed'));
    setModalTarget(null);
    setFlash(`Moved ${rec.client} to ${fmtApptDateTime(rec)}. It's back with your booked appointments.${info && info.emailed === true ? ' Updated invite emailed.' : info && info.emailed === false ? " The updated invite didn't send." : ''}`);
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
  // Opens the send window (text, email or copy the link). The card stays
  // in this list until you switch lists, even once it's no longer
  // "not started", so the link and what happened stay in view.
  function handleSendIntake(a, cand = null) {
    setPinned(prev => new Set(prev).add(a.id));
    openIntakeSend({ appointment: a, candidate: cand });
  }
  async function handleRemoveIntake(a, candidate) {
    if (!window.confirm(`Remove ${a.client}'s intake? Their link will stop working and any answers are deleted.`)) return;
    if (await deleteClientIntakeCandidate(candidate.id)) {
      await setAppointmentIntakeRequested(a.id, false);
      setCandidates(prev => prev.filter(c => c.id !== candidate.id));
      setAppointments(prev => prev.map(x => x.id === a.id ? { ...x, clientIntakeRequested: false } : x));
      intakeChanged({ removedId: candidate.id });
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
        {[
          ['To do', [['nolog', 'Outcome not logged', 'rust'], ['presented', 'You presented', 'blue'], ['needs', 'Needs follow-up', 'amber'], ['reschedule', 'Needs reschedule', 'violet']]],
          ['Done', [['completed', 'Completed', 'green'], ['not_completed', "Didn't happen", 'rust']]],
          ['Client intake', [['nointake', 'Intake not started', 'none'], ['sent', 'Intake link sent', 'amber'], ['received', 'Intake received', 'green']]],
          ['Recruits', [['recruit_open', 'Recruit not signed up', 'recruit'], ['recruit_joined', 'Recruit signed up', 'green']]],
          ['', [['all', 'All past', 'week']]],
        ].map(([group, items]) => {
          // "You presented" only for people who present for their team.
          const shown = items.filter(([v]) => views.includes(v) && (v !== 'presented' || presentedPast.length > 0 || view === 'presented'));
          if (!shown.length) return null;
          return [group && views.length > shown.length ? <div key={`d-${group}`} className="tr-sidebar-divider">{group}</div> : null, ...shown.map(([v, label, color]) => navBtn(v, label, color))];
        })}
      </nav>
      <div className="tr-appts-main">
        <PageHead title={FOLLOW_UP_VIEW_TITLES[view] || 'Follow up'}
          sub={view === 'presented'
            ? `Your team booked these and you presented them (last ${PRESENTED_DAYS} days). Log how they went; the sale or recruit still counts for the person who booked it.`
            : view === 'all' ? `${past.length} past appointment${past.length === 1 ? '' : 's'}${counts.nolog ? ` · ${counts.nolog} still need an outcome` : ''}` : `${list.length} of ${past.length} past appointments`} />
        {flash ? <div className="tr-flash" role="status">{flash}</div> : null}
        <div className="tr-search-row">
          <Search size={15} className="tr-search-icon" />
          <input className="tr-search-input" type="text" placeholder="Search by name or phone…" aria-label="Search past appointments by client name or phone" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          {searchQuery && <button type="button" className="tr-icon-btn" onClick={() => setSearchQuery('')} title="Clear search"><X size={15} /></button>}
        </div>
        <div className="tr-fu-list">
        {list.length === 0 ? (
          <div className="tr-card"><p className="tr-empty">{view === 'presented' ? `Nothing you presented in the last ${PRESENTED_DAYS} days${q ? ' matches' : ''}.` : past.length === 0 ? 'Appointments land here once their time has passed.' : 'Nothing matches this view.'}</p></div>
        ) : view === 'presented' ? list.map(a => {
          const loggedByMe = a.outcomeLoggedBy === user.id;
          const logger = loggedByMe ? 'you' : (a.outcomeLoggedBy ? nameOf(a.outcomeLoggedBy) : '') || a.setByName || 'the advisor';
          return (
            <div className="tr-card tr-fu-card" key={a.id}>
              <div className="tr-fu-head tr-fu-head-static">
                <div>
                  <strong>{a.client}</strong>
                  {typeLabel(a) ? <span className="tr-empty"> · {typeLabel(a)}</span> : null}
                  <span className="tr-presented-tag"><Presentation size={12} aria-hidden="true" /> You presented</span>
                  <div className="tr-empty" style={{ margin: 0 }}>{fmtApptDateTime(a)}{a.setByName ? <> · set by <strong className="tr-fu-setby">{a.setByName}</strong></> : null}</div>
                  {a.followUpCompletedAt ? (
                    <div className="tr-fu-logged"><CheckCheck size={13} aria-hidden="true" /> Logged by {logger}{loggedSummary(a) ? ` · ${loggedSummary(a)}` : ''}</div>
                  ) : null}
                </div>
                <div className="tr-fu-chips">
                  {!a.followUpCompletedAt
                    ? <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={() => setPresentedTarget(a)}>Log outcome</button>
                    : loggedByMe ? <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => setPresentedTarget(a)}>Edit</button> : null}
                </div>
              </div>
            </div>
          );
        }) : list.map(a => {
          const open = expandedId === a.id;
          const st = STATUS_OPTIONS.find(o => o.value === a.status);
          const outcome = OUTCOME_OPTIONS.find(o => o.value === a.outcome);
          const cand = candByAppt[a.id];
          const apptNotes = notesByAppt[a.id] || [];
          return (
            <div className="tr-card tr-fu-card" key={a.id} data-fu-card={a.id}>
              <div
                role="button" tabIndex={0} className="tr-fu-head" aria-expanded={open}
                onClick={() => setExpandedId(open ? null : a.id)}
                onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setExpandedId(open ? null : a.id); } }}>
                <div>
                  <strong>{a.client}</strong>
                  {typeLabel(a) ? <span className="tr-empty"> · {typeLabel(a)}</span> : null}
                  <div className="tr-empty" style={{ margin: 0 }}>{fmtApptDateTime(a)}</div>
                  {a.followUpAppointmentDate && <div className="tr-empty" style={{ margin: 0 }}>Next: {fmtFollowUpDateTime(a)}</div>}
                  {a.followUpCompletedAt && a.outcomeLoggedBy && a.outcomeLoggedBy !== user.id ? (
                    <div className="tr-fu-logged"><CheckCheck size={13} aria-hidden="true" /> Logged by {nameOf(a.outcomeLoggedBy) || a.presenter || 'your presenter'}</div>
                  ) : null}
                  {apptNotes.length > 0 && (
                    <div className="tr-fu-lastnote">
                      Last touch {daysSince(apptNotes[0].created_at) === 0 ? 'today' : `${daysSince(apptNotes[0].created_at)}d ago`}: {apptNotes[0].note}
                    </div>
                  )}
                </div>
                <div className="tr-fu-chips">
                  {a.followUpCompletedAt
                    ? (st && st.value ? <span className={`tr-status tr-status-${st.color}`}>{st.label}</span> : null)
                    : open ? null /* (it's in the section below once open) */ : <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={e => { e.stopPropagation(); setModalTarget(a); }}>Log outcome</button>}
                  {cand ? <span className={`tr-status tr-status-${intakeStatusTone(cand)}`}>{cand.status === 'submitted' ? 'Intake received' : `Intake: ${lowerFirst(intakeStatusText(cand))}`}</span> : null}
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
                    <ContactRow phone={a.clientPhone} email={a.clientEmail} name={a.client} texts={appointmentTexts(a, user.displayName)} />
                    <div className="tr-form-actions" style={{ marginTop: 8, justifyContent: 'flex-start' }}>
                      <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={() => setModalTarget(a)}>{a.followUpCompletedAt ? 'Update outcome' : 'Log outcome'}</button>
                      <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => onScheduleNext({ client: a.client, notes: '', clientEmail: a.clientEmail, clientPhone: a.clientPhone, prospectId: a.prospectId, typeRecruit: isRecruitType(a), typeSale: isSaleType(a) })}>
                        <Plus size={13} /> Schedule next appointment
                      </button>
                      <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => openAppointment(a)}>
                        <Pencil size={13} /> Edit appointment
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
                      <ClientIntakeSection candidate={cand} canManage onRemove={() => handleRemoveIntake(a, cand)} onSend={() => handleSendIntake(a, cand)} />
                    ) : (
                      <div className="tr-row-head">
                        <h4 className="tr-h4" style={{ margin: 0 }}>Client intake</h4>
                        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" disabled={busyId === a.id} onClick={() => handleSendIntake(a)}>Send intake form</button>
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
                        className="tr-search-input" style={{ flex: 1 }} type="text" placeholder="Add a note (called, texted…)" aria-label="Add a follow-up note (called, texted, wants intake, next steps)"
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
      {modalTarget && <FollowUpModal appointment={modalTarget} onClose={() => setModalTarget(null)} onSave={handleSaveOutcome} onRescheduled={handleRescheduled} saving={modalSaving}
        onEdit={() => { const x = modalTarget; setModalTarget(null); openAppointment(x); }} />}
      {presentedTarget && <FollowUpModal appointment={presentedTarget} presenter setByName={presentedTarget.setByName} onClose={() => setPresentedTarget(null)} onSave={handlePresentedSave} saving={modalSaving} />}
    </div>
  );
}
