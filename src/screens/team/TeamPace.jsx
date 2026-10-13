// Team Pace: weekly pace, promotion readiness and licensing for the team.
import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, UserCog, Users } from 'lucide-react';
import { daysBetween, examWhen, fetchLicensingForUsers, licensingStatus } from '../../licensing.js';
import { fetchTeamOnboarding, ONBOARDING_DAYS, onboardingDay, onboardingStepTitle, onboardingStepWeek } from '../../onboarding.js';
import { hierarchyTierLabel } from '../../hierarchy.js';
import { DATE_SET_OPTIONS, getStatus, WEEKLY_TOTAL_TARGET } from '../../lib/pace.js';
import { addDays, apptStartMsSafe, fmtApptDateTime, fmtDate, fmtShortDate, parseDate, shiftWeekStr, todayStr, weekStartOf } from '../../lib/dates.js';
import { fetchAppointmentsForWeek, isPastAppointment, isRecruitType, isSaleType } from '../../data/appointments.js';
import { addCoachingNote, approvePromotion, fetchCoachingNotes, fetchDirectManagers, fetchHierarchyPeople, fetchTeamMembers, loadPromotionReadiness } from '../../data/team.js';
import { MemberSubline, MiniBar, SkelBlock, SkeletonTable, StatusBadge, StatusChip, TypeBadge, TypeFilter, WeekNav } from '../../components/ui.jsx';
import { RequirementRow } from '../Milestones.jsx';

// A general, week-scoped feedback channel a manager can leave for an
// advisor — separate from Open Requirements' policy-specific notes.
export function CoachingNotesPanel({ advisorId, weekOf, currentUser }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchCoachingNotes(advisorId, weekOf).then(rows => { setNotes(rows); setLoading(false); });
  }, [advisorId, weekOf]);

  async function submit() {
    if (!newNote.trim()) return;
    setSaving(true);
    const res = await addCoachingNote(advisorId, weekOf, currentUser.id, currentUser.displayName, newNote);
    setSaving(false);
    if (res.ok) { setNotes(prev => [...prev, res.record]); setNewNote(''); }
  }
  function handleKeyDown(e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } }

  return (
    <div className="tr-coaching-panel" onClick={e => e.stopPropagation()}>
      <h4 className="tr-h4">Coaching notes for this week</h4>
      {loading ? <SkelBlock w="100%" h="30px" /> : notes.length === 0 ? (
        <p className="tr-empty">No notes yet for this week.</p>
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
      <div className="tr-note-add" onKeyDown={handleKeyDown}>
        <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Leave a note about this week…" />
        <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={submit} disabled={saving || !newNote.trim()}>Add</button>
      </div>
    </div>
  );
}

// Team Pace: how each person in their first couple of months is doing on
// their First 30 days checklist, so a manager knows who needs a hand.
export function NewAdvisorsCard({ members }) {
  const [rows, setRows] = useState(null);
  const recent = members.filter(m => {
    const d = onboardingDay(m.created_at);
    return d != null && d <= 60;
  });
  const ids = recent.map(m => m.id).join(',');
  useEffect(() => {
    let alive = true;
    if (!recent.length) { setRows([]); return undefined; }
    fetchTeamOnboarding(recent.map(m => m.id)).then(r => { if (alive) setRows(r || 'error'); });
    return () => { alive = false; };
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!recent.length || rows === null || rows === 'error') return null;
  const byId = {};
  rows.forEach(r => { byId[r.user_id] = r; });
  const list = recent.map(m => {
    // A row with no totals only holds a show/hide choice, not progress.
    const r = byId[m.id] && byId[m.id].total_count > 0 ? byId[m.id] : null;
    const day = onboardingDay(m.created_at);
    const nextWeek = r && r.next_step ? onboardingStepWeek(r.next_step) : null;
    const behind = !!(nextWeek && day > nextWeek.days[1]);
    return { m, r, day, behind, done: !!(r && r.total_count && r.done_count >= r.total_count) };
  }).sort((a, b) => (Number(b.behind || !b.r) - Number(a.behind || !a.r)) || (a.day - b.day));
  return (
    <div className="tr-card tr-newadv">
      <div className="tr-row-head">
        <div>
          <h3 className="tr-h3" style={{ margin: 0 }}>New advisors · first 30 days</h3>
          <p className="tr-empty" style={{ margin: '2px 0 0' }}>Everyone who joined in the last 60 days, and the next step on their checklist.</p>
        </div>
      </div>
      <ul className="tr-newadv-list">
        {list.map(({ m, r, day, behind, done }) => {
          const pctDone = r && r.total_count ? Math.round((r.done_count / r.total_count) * 100) : 0;
          const lastSeen = r && r.last_seen_at ? Math.floor((Date.now() - new Date(r.last_seen_at).getTime()) / 86400000) : null;
          return (
            <li key={m.id} className="tr-newadv-row">
              <div className="tr-newadv-who">
                <strong>{m.display_name}</strong>
                <span className="tr-empty">Day {day}{day <= ONBOARDING_DAYS ? ` of ${ONBOARDING_DAYS}` : ''}</span>
              </div>
              <div className="tr-newadv-progress">
                <div className="tr-ov-bar"><div className={`tr-ov-bar-fill ${done ? 'tr-ov-bar-fill-alt' : ''}`} style={{ width: `${pctDone}%` }} /></div>
                <span className="tr-mono">{r ? `${r.done_count}/${r.total_count}` : '—'}</span>
              </div>
              <div className="tr-newadv-next">
                {!r ? <span className="tr-status tr-status-rust">No checklist activity yet</span>
                  : done ? <span className="tr-status tr-status-green">Checklist complete</span>
                  : <>
                      <span className="tr-newadv-step">Next: {onboardingStepTitle(r.next_step)}</span>
                      {behind ? <span className="tr-status tr-status-amber">Behind</span> : <span className="tr-status tr-status-green">On track</span>}
                    </>}
                {r && lastSeen != null && lastSeen >= 4 ? <span className="tr-newadv-seen">Last opened {lastSeen} days ago</span> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Team Pace: one person's week, opened from their row. A compact list
// (not nested tables) so it fits the card on any screen.
export function TeamWeekDetail({ groups, counts, filter }) {
  const byWhen = (x, y) => apptStartMsSafe(x) - apptStartMsSafe(y);
  return (
    <div className="tr-weekdetail">
      {DATE_SET_OPTIONS.map((opt, i) => {
        const list = filter(groups[i]).slice().sort(byWhen);
        const met = counts[i] >= opt.target;
        return (
          <section className="tr-weekdetail-batch" key={opt.value}>
            <div className="tr-weekdetail-head">
              <span className="tr-weekdetail-title">{opt.batchLabel}</span>
              <span className={`tr-weekdetail-count ${met ? 'tr-weekdetail-met' : ''}`}>{counts[i]} of {opt.target} set</span>
            </div>
            {list.length === 0 ? (
              <div className="tr-weekdetail-none">{groups[i].length ? 'None of this type.' : 'None logged.'}</div>
            ) : (
              <ul className="tr-weekdetail-list">
                {list.map(a => (
                  <li key={a.id} className="tr-weekdetail-row">
                    <span className="tr-weekdetail-when">{fmtApptDateTime(a)}</span>
                    <span className="tr-weekdetail-client">
                      <strong>{a.client}</strong> <TypeBadge appt={a} />
                      <span className="tr-weekdetail-meta">
                        {a.presenter ? `with ${a.presenter}` : ''}{a.trainee ? ` · trainee ${a.trainee}` : ''}
                      </span>
                    </span>
                    <span className="tr-weekdetail-state">
                      {a.status ? <StatusChip status={a.status} />
                        : isPastAppointment(a) ? <span className="tr-status tr-status-none">No outcome yet</span>
                        : a.zoomUrl ? <a href={a.zoomUrl} target="_blank" rel="noopener noreferrer" className="tr-note tr-link">Join Zoom</a>
                        : <span className="tr-weekdetail-upcoming">Upcoming</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function TeamPaceSubView({ user, members, loadingMembers, heading, Icon, emptyMessage, memberLabel }) {
  const [weekAppts, setWeekAppts] = useState([]);
  const [loadingAppts, setLoadingAppts] = useState(true);
  const [weekMonday, setWeekMonday] = useState(weekStartOf(todayStr()));
  const [expanded, setExpanded] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');

  function byType(list) {
    if (typeFilter === 'all') return list;
    if (typeFilter === 'recruit') return list.filter(isRecruitType);
    if (typeFilter === 'sale') return list.filter(isSaleType);
    return list;
  }

  const refreshAppts = useCallback(async () => {
    setLoadingAppts(true);
    setWeekAppts(await fetchAppointmentsForWeek(weekMonday));
    setLoadingAppts(false);
  }, [weekMonday]);

  useEffect(() => { refreshAppts(); }, [refreshAppts]);

  const loading = loadingMembers || loadingAppts;

  // Same classification already used per-row below, just tallied up front
  // so managers get the answer without reading every row themselves.
  const memberStatuses = members.map(m => {
    const list = weekAppts.filter(a => a.userId === m.id && !a.isFollowUp);
    const counts = DATE_SET_OPTIONS.map(opt => list.filter(a => a.dateSetOption === opt.value).length);
    return getStatus(counts, weekMonday);
  });
  const metCount = memberStatuses.filter(s => s === 'met').length;
  const missedCount = memberStatuses.filter(s => s === 'missed').length;
  // Early warning, not just an end-of-week verdict — flags anyone with
  // zero appointments logged so far this week, once there's been enough
  // time (through Tuesday) that it's a meaningful signal rather than
  // just "it's still early." Only meaningful when looking at the actual
  // current week, not one being browsed in the past or future.
  const isCurrentWeek = weekMonday === weekStartOf(todayStr());
  const daysElapsedInWeek = Math.floor((new Date(todayStr()) - new Date(weekMonday)) / (1000 * 60 * 60 * 24));
  const showInactivityWarning = isCurrentWeek && daysElapsedInWeek >= 4;
  const inactiveCount = showInactivityWarning
    ? members.filter(m => weekAppts.filter(a => a.userId === m.id && !a.isFollowUp).length === 0).length
    : 0;

  return (
    <>
      <WeekNav weekMonday={weekMonday} onShift={d => setWeekMonday(shiftWeekStr(weekMonday, d))} onToday={() => setWeekMonday(weekStartOf(todayStr()))} />
      <div className="tr-row-head">
        <h2 className="tr-h2"><Icon size={18} /> {heading}</h2>
        <button className="tr-btn tr-btn-ghost tr-btn-sm" onClick={refreshAppts}>Refresh</button>
      </div>
      {!loadingMembers && <NewAdvisorsCard members={members} />}
      <div className="tr-typefilter-row">
        <span className="tr-typefilter-label">Show:</span>
        <TypeFilter value={typeFilter} onChange={setTypeFilter} />
        <span className="tr-typefilter-note">Tap anyone's name to see their appointments for the week. The filter only changes those lists; pace counts always include everything.</span>
      </div>
      {loading ? <SkeletonTable rows={5} cols={6} /> : members.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">{emptyMessage}</p></div>
      ) : (
        <>
          <div className="tr-health-line">
            <strong className="tr-health-good">{metCount} of {members.length} on pace</strong>
            {missedCount > 0 && <span className="tr-health-bad"> · {missedCount} behind</span>}
            {showInactivityWarning && inactiveCount > 0 && (
              <span className="tr-health-warn"> · {inactiveCount} with nothing logged yet this week</span>
            )}
            {' '}this week.
          </div>
          <div className="tr-card tr-summary-card">
          <div className="tr-table-wrap">
            <table className="tr-table tr-table-summary">
              <thead>
                <tr>
                  <th>{memberLabel}</th>
                  {DATE_SET_OPTIONS.map(opt => <th key={opt.value}>{opt.shortLabel}</th>)}
                  <th>Total</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {members.map(adv => {
                  const list = weekAppts.filter(a => a.userId === adv.id && !a.isFollowUp);
                  const groups = DATE_SET_OPTIONS.map(opt => list.filter(a => a.dateSetOption === opt.value));
                  const counts = groups.map(g => g.length);
                  const total = counts.reduce((s, c) => s + c, 0);
                  const status = getStatus(counts, weekMonday);
                  const isOpen = expanded === adv.id;
                  return (
                    <React.Fragment key={adv.id}>
                      <tr
                        className={`tr-clickable-row ${isOpen ? 'tr-row-open' : ''}`} onClick={() => setExpanded(isOpen ? null : adv.id)}
                        tabIndex={0} aria-expanded={isOpen}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(isOpen ? null : adv.id); } }}>
                        <td>
                          <span className="tr-row-toggle">{isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
                          {adv.display_name}
                          {adv.role === 'manager' ? <span className="tr-note"> — manager</span> : null}
                          {adv.role === 'super_admin' ? <span className="tr-note"> — admin</span> : null}
                          <MemberSubline member={adv} />
                        </td>
                        {DATE_SET_OPTIONS.map((opt, i) => (
                          <td key={opt.value}><MiniBar count={counts[i]} target={opt.target} /></td>
                        ))}
                        <td className="tr-mono">{total}/{WEEKLY_TOTAL_TARGET}</td>
                        <td><StatusBadge status={status} /></td>
                      </tr>
                      {isOpen && (
                        <tr className="tr-expand-row"><td colSpan={DATE_SET_OPTIONS.length + 3}>
                          <div className="tr-expand-inner">
                            <TeamWeekDetail groups={groups} counts={counts} filter={byType} />
                            {adv.id !== user.id && <CoachingNotesPanel advisorId={adv.id} weekOf={weekMonday} currentUser={user} />}
                          </div>
                        </td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}
    </>
  );
}

// Every eligible team member's live progress toward their next tier, in
// one scannable table — not just who's already ready, but where
// everyone currently stands, so a manager can see who's close too.
// Expanding a row shows the exact same requirement breakdown their own
// Milestones page would show them.
export function TeamPromotionSubView({ user, members, loadingMembers, memberLabel, emptyMessage }) {
  const [loading, setLoading] = useState(true);
  const [progressList, setProgressList] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const isAdmin = user.role === 'super_admin';

  const refresh = useCallback(async () => {
    if (members.length === 0) { setProgressList([]); setLoading(false); return; }
    setLoading(true);
    const { list } = await loadPromotionReadiness(user, members.map(m => m.id));
    // Ready first, then closest to ready.
    list.sort((a, b) => (b.progress.allMet - a.progress.allMet)
      || (b.progress.results.filter(r => r.met).length / b.progress.results.length) - (a.progress.results.filter(r => r.met).length / a.progress.results.length)
      || (a.member.display_name || '').localeCompare(b.member.display_name || ''));
    setProgressList(list);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);

  useEffect(() => { refresh(); }, [refresh]);

  async function approve(member, nextTier) {
    if (!window.confirm(`Promote ${member.display_name} to ${nextTier.name} (${nextTier.key})?`)) return;
    setBusyId(member.id); setNotice(null);
    const err = await approvePromotion(user, member, nextTier);
    setBusyId(null);
    if (err) { setNotice({ kind: 'warn', text: `Couldn't promote ${member.display_name}: ${err}` }); return; }
    setNotice({ kind: 'ok', text: `${member.display_name} is now ${nextTier.name} (${nextTier.key}).` });
    refresh();
  }

  const readyCount = progressList.filter(r => r.progress?.allMet).length;
  const isLoading = loadingMembers || loading;

  return (
    <>
      <div className="tr-row-head">
        <h2 className="tr-h2">Promotion readiness</h2>
        <button className="tr-btn tr-btn-ghost tr-btn-sm" onClick={refresh}>Refresh</button>
      </div>
      <p className="tr-subtitle">
        Live progress toward each person's next tier — the same numbers their own Milestones page shows them.
        {isAdmin ? ' Approve a promotion here when someone is ready.' : ' Super admins approve promotions.'}
      </p>
      {notice && <div className={notice.kind === 'ok' ? 'tr-flash' : 'tr-error'} style={{ marginBottom: 12 }}>{notice.text}</div>}
      {isLoading ? <SkeletonTable rows={5} cols={4} /> : members.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">{emptyMessage}</p></div>
      ) : progressList.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">No one here has a hierarchy tier set yet, or everyone's already at the top of the ladder.</p></div>
      ) : (
        <>
          {readyCount > 0 && (
            <div className="tr-health-line">
              <span className="tr-type-badge tr-type-badge-both">🎉 {readyCount} ready for promotion</span>
            </div>
          )}
          <div className="tr-card tr-summary-card">
            <div className="tr-table-wrap">
              <table className="tr-table tr-table-summary">
                <thead><tr><th>{memberLabel}</th><th>Current tier</th><th>Next tier</th><th>Progress</th></tr></thead>
                <tbody>
                  {progressList.map(({ member, progress }) => {
                    const isOpen = expanded === member.id;
                    const metCount = progress.results.filter(r => r.met).length;
                    const totalCount = progress.results.length;
                    return (
                      <React.Fragment key={member.id}>
                        <tr className={`tr-clickable-row ${isOpen ? 'tr-row-open' : ''}`} onClick={() => setExpanded(isOpen ? null : member.id)}>
                          <td>
                            <span className="tr-row-toggle">{isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
                            {member.display_name}
                          </td>
                          <td>{hierarchyTierLabel(member.hierarchy_tier)}</td>
                          <td>{progress.nextTier.name} ({progress.nextTier.key})</td>
                          <td>
                            {progress.allMet ? (
                              <span className="tr-promo-ready-cell">
                                <span className="tr-type-badge tr-type-badge-both">✓ Ready!</span>
                                {isAdmin && (
                                  <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" disabled={busyId === member.id}
                                    onClick={e => { e.stopPropagation(); approve(member, progress.nextTier); }}>
                                    {busyId === member.id ? 'Saving…' : `Promote to ${progress.nextTier.key}`}
                                  </button>
                                )}
                              </span>
                            ) : (
                              <span className="tr-mono">{metCount} / {totalCount} met</span>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="tr-expand-row"><td colSpan={4}>
                            {progress.results.map((req, i) => <RequirementRow key={i} req={req} />)}
                          </td></tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// Team Pace → Licensing: everyone not yet licensed, where they are, and
// who's stuck; plus how long licensing has been taking.
export const LICENSING_STUCK_DAYS = 10;

export function TeamLicensingSubView({ members, loadingMembers, memberLabel, emptyMessage }) {
  const [rows, setRows] = useState(null);
  const refresh = useCallback(async () => {
    if (!members.length) { setRows([]); return; }
    setRows(null);
    const ids = members.map(m => m.id);
    const [people, prog] = await Promise.all([fetchHierarchyPeople(), fetchLicensingForUsers(ids)]);
    const byId = new Map(people.map(p => [p.id, p]));
    setRows(members.map(m => {
      const person = byId.get(m.id) || m;
      const pr = prog.get(m.id) || null;
      const st = licensingStatus(pr, person);
      const lastMove = pr && pr.updated_at ? pr.updated_at : person.created_at;
      const idle = lastMove ? daysBetween(lastMove, new Date()) : 0;
      return { member: m, person, pr, st, idle, stuck: !st.licensed && idle >= LICENSING_STUCK_DAYS };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);
  useEffect(() => { refresh(); }, [refresh]);

  if (loadingMembers || rows === null) return <SkeletonTable rows={5} cols={5} />;
  if (members.length === 0) return <div className="tr-card"><p className="tr-empty">{emptyMessage}</p></div>;
  const open = rows.filter(r => !r.st.licensed)
    .sort((a, b) => (b.stuck - a.stuck) || (b.st.nextIndex - a.st.nextIndex) || (a.member.display_name || '').localeCompare(b.member.display_name || ''));
  const weekAhead = fmtDate(addDays(parseDate(todayStr()), 7));
  const examsSoon = open.filter(r => r.pr && r.pr.exam_on && !r.st.done.examPassed && r.pr.exam_on >= todayStr() && r.pr.exam_on <= weekAhead).length;
  const recent = rows.filter(r => r.st.licensed && r.person.licensed_at && daysBetween(r.person.licensed_at, new Date()) <= 90 && r.person.created_at);
  const avgDays = recent.length ? Math.round(recent.reduce((t, r) => t + daysBetween(r.person.created_at, r.person.licensed_at), 0) / recent.length) : null;
  const stuck = open.filter(r => r.stuck).length;

  return (
    <>
      <div className="tr-row-head">
        <h2 className="tr-h2">Licensing</h2>
        <button className="tr-btn tr-btn-ghost tr-btn-sm" onClick={refresh}>Refresh</button>
      </div>
      <p className="tr-subtitle">Where everyone on your team is on the path to licensed. "Stuck" means no progress in {LICENSING_STUCK_DAYS}+ days, so it's a good time to check in.</p>
      <div className="tr-org-stats">
        <span><strong>{open.length}</strong> not licensed yet</span>
        {stuck > 0 && <span className="tr-lic-stat-warn"><strong>{stuck}</strong> stuck</span>}
        <span><strong>{examsSoon}</strong> exam{examsSoon === 1 ? '' : 's'} in the next 7 days</span>
        <span>{avgDays != null ? <><strong>{avgDays} days</strong> to licensed on average (last 90 days)</> : 'Days to licensed: not enough data yet'}</span>
      </div>
      {open.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">Everyone here is licensed and appointed. 🎉</p></div>
      ) : (
        <div className="tr-card tr-summary-card">
          <div className="tr-table-wrap">
            <table className="tr-table tr-table-summary">
              <thead><tr><th>{memberLabel}</th><th>Progress</th><th>Next step</th><th>Exam</th><th>Status</th></tr></thead>
              <tbody>
                {open.map(r => (
                  <tr key={r.member.id}>
                    <td>{r.member.display_name}<MemberSubline member={r.member} /></td>
                    <td>
                      <div className="tr-minibar-wrap">
                        <div className="tr-minibar-track"><div className="tr-minibar-fill" style={{ width: `${(r.st.doneCount / r.st.total) * 100}%` }} /></div>
                        <span className="tr-mono tr-minibar-num">{r.st.doneCount}/{r.st.total}</span>
                      </div>
                    </td>
                    <td>{r.st.next.short === 'Course started' ? 'Start the course' : r.st.next.title}{r.pr && r.pr.resident_state ? <div className="tr-tenure">{r.pr.resident_state}</div> : null}</td>
                    <td>{r.pr && r.pr.exam_on && !r.st.done.examPassed ? <>{fmtShortDate(r.pr.exam_on)}<div className="tr-tenure">{examWhen(r.pr.exam_on)}</div></> : r.pr && r.pr.exam_attempts ? <span className="tr-tenure">Retake needed</span> : '—'}</td>
                    <td>{r.stuck ? <span className="tr-status tr-status-rust">Stuck {r.idle} days</span> : <span className="tr-status tr-status-green">Moving</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {recent.length > 0 && (
        <div className="tr-card tr-lic-recent">
          <h3 className="tr-h3" style={{ marginTop: 0 }}>Licensed in the last 90 days</h3>
          <ul className="tr-promo-list" style={{ marginLeft: 0 }}>
            {recent.map(r => <li key={r.member.id}><span><strong>{r.member.display_name}</strong> · {daysBetween(r.person.created_at, r.person.licensed_at)} days from joining</span></li>)}
          </ul>
        </div>
      )}
    </>
  );
}

export function PeoplePaceBody({ user, fetchMembers, heading, Icon, emptyMessage, memberLabel, initialView }) {
  const [view, setView] = useState(['promotion', 'licensing'].includes(initialView) ? initialView : 'pace'); // 'pace' | 'promotion' | 'licensing'
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  const refreshMembers = useCallback(async () => {
    setLoadingMembers(true);
    setMembers(await fetchMembers(user));
    setLoadingMembers(false);
  }, [user.id, user.role]);

  useEffect(() => { refreshMembers(); }, [refreshMembers]);

  return (
    <div className="tr-appts-shell">
      <nav className="tr-appts-sidebar">
        <button
          type="button" className={`tr-sidebar-item tr-sidebar-item-week ${view === 'pace' ? 'tr-sidebar-item-active' : ''}`}
          onClick={() => setView('pace')}>
          <span>Pace</span>
        </button>
        <button
          type="button" className={`tr-sidebar-item tr-sidebar-item-week ${view === 'promotion' ? 'tr-sidebar-item-active' : ''}`}
          onClick={() => setView('promotion')}>
          <span>Promotion</span>
        </button>
        <button
          type="button" className={`tr-sidebar-item tr-sidebar-item-week ${view === 'licensing' ? 'tr-sidebar-item-active' : ''}`}
          onClick={() => setView('licensing')}>
          <span>Licensing</span>
        </button>
      </nav>
      <div className="tr-appts-main">
        {view === 'pace' ? (
          <TeamPaceSubView
            user={user} members={members} loadingMembers={loadingMembers}
            heading={heading} Icon={Icon} emptyMessage={emptyMessage} memberLabel={memberLabel} />
        ) : view === 'licensing' ? (
          <TeamLicensingSubView members={members} loadingMembers={loadingMembers} memberLabel={memberLabel} emptyMessage={emptyMessage} />
        ) : (
          <TeamPromotionSubView user={user} members={members} loadingMembers={loadingMembers} memberLabel={memberLabel} emptyMessage={emptyMessage} />
        )}
      </div>
    </div>
  );
}

// Super admins can narrow Team Pace down to just the managers who report
// directly to them (formerly a separate "Direct Managers" tab). Regular
// managers never see this toggle — they only ever have one scope.
export function TeamPaceBody({ user, initialView, onIntentConsumed }) {
  useEffect(() => { if (initialView) onIntentConsumed?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [scope, setScope] = useState('all'); // 'all' | 'directs'
  const isSuperAdmin = user.role === 'super_admin';
  const showDirects = isSuperAdmin && scope === 'directs';
  const fetchMembers = showDirects ? fetchDirectManagers : fetchTeamMembers;
  const heading = showDirects ? 'Direct managers' : 'Team pace';
  const Icon = showDirects ? UserCog : Users;
  const memberLabel = showDirects ? 'Manager' : 'Team member';
  const emptyMessage = showDirects
    ? 'No managers assigned to you yet. Assign them from Manage Team → Reports To.'
    : "No team members yet. Once people create accounts and start logging, they'll show up here.";
  return (
    <>
      {isSuperAdmin && (
        <div className="tr-pillrow" style={{ marginBottom: 14 }}>
          <button type="button" className={`tr-pill-btn ${scope === 'all' ? 'tr-pill-btn-active' : ''}`} onClick={() => setScope('all')}>All Team</button>
          <button type="button" className={`tr-pill-btn ${scope === 'directs' ? 'tr-pill-btn-active' : ''}`} onClick={() => setScope('directs')}>My Direct Managers</button>
        </div>
      )}
      <PeoplePaceBody
        key={scope} user={user} fetchMembers={fetchMembers} heading={heading} Icon={Icon} memberLabel={memberLabel} initialView={initialView}
        emptyMessage={emptyMessage} />
    </>
  );
}
