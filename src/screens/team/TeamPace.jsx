// Team Pace: weekly pace, promotion readiness and licensing for the team.
import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, UserCog, Users } from 'lucide-react';
import { daysBetween, examWhen, fetchLicensingForUsers, leaderStepText, licensingStatus } from '../../licensing.js';
import { fetchTeamOnboarding, ONBOARDING_DAYS, onboardingDay, onboardingStepTitle, onboardingStepWeek } from '../../onboarding.js';
import { hierarchyTierLabel } from '../../hierarchy.js';
import { countsTowardPace, DATE_SET_OPTIONS, getStatus, isPresentingFor, WEEKLY_TOTAL_TARGET } from '../../lib/pace.js';
import { addDays, apptStartMsSafe, fmtApptDateTime, fmtDate, fmtShortDate, parseDate, shiftWeekStr, todayStr, weekStartOf } from '../../lib/dates.js';
import { fetchAppointmentsForWeek, isPastAppointment, isRecruitType, isSaleType } from '../../data/appointments.js';
import { addCoachingNote, approvePromotion, fetchCoachingNotes, fetchDirectManagers, fetchHierarchyPeople, fetchTeamMembers, loadPromotionReadiness, logAuditEvent } from '../../data/team.js';
import { AGENCY_EMAIL, approvePromotionRequest, fetchPromotionRequests, resendPromotionEmail, sendBackPromotion, submitErrorText, submitPromotion } from '../../data/promotions.js';
import { MemberSubline, MiniBar, SkelBlock, SkeletonTable, StatusBadge, StatusChip, TypeBadge, TypeFilter, WeekNav } from '../../components/ui.jsx';
import { RequirementRow } from '../Milestones.jsx';
import { RecruitsSubView } from './Recruits.jsx';
import { FieldTrainingSubView } from './FieldTraining.jsx';

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
// Tap the heading to fold it away (remembered on this device), so the pace
// table below is right there.
export function NewAdvisorsCard({ members }) {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('pl_newadv_open') !== '0'; } catch { return true; } });
  function toggle() {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem('pl_newadv_open', next ? '1' : '0'); } catch { /* ignore */ }
  }
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
  const behindCount = list.filter(x => x.behind).length;
  const notStarted = list.filter(x => !x.r).length;
  const summary = [`${list.length} ${list.length === 1 ? 'person' : 'people'}`, behindCount ? `${behindCount} behind` : '', notStarted ? `${notStarted} not started yet` : ''].filter(Boolean).join(' · ');
  return (
    <div className={`tr-card tr-newadv ${open ? '' : 'tr-newadv-closed'}`}>
      <button type="button" className="tr-newadv-toggle" aria-expanded={open} aria-controls="tr-newadv-list" onClick={toggle}>
        <span className="tr-newadv-titles">
          <span className="tr-h3 tr-newadv-title">New advisors · first 30 days</span>
          <span className="tr-newadv-sub">{open ? 'Everyone who joined in the last 60 days, and the next step on their checklist.' : summary}</span>
        </span>
        <span className="tr-newadv-chev">{open ? <>Hide <ChevronUp size={16} /></> : <>Show <ChevronDown size={16} /></>}</span>
      </button>
      {open && <ul className="tr-newadv-list" id="tr-newadv-list">
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
      </ul>}
    </div>
  );
}

// Team Pace: one person's week, opened from their row. A compact list
// (not nested tables) so it fits the card on any screen.
export function TeamWeekDetail({ groups, counts, filter, personId, nameOf }) {
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
                        {isPresentingFor(a, personId)
                          ? <><span className="tr-presenting-chip">Presenting</span> set by {(nameOf && nameOf(a.userId)) || 'someone on the team'}</>
                          : <>{a.presenter ? `with ${a.presenter}` : ''}{a.trainee ? ` · trainee ${a.trainee}` : ''}</>}
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
    const list = weekAppts.filter(a => countsTowardPace(a, m.id));
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
    ? members.filter(m => weekAppts.filter(a => countsTowardPace(a, m.id)).length === 0).length
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
                  const list = weekAppts.filter(a => countsTowardPace(a, adv.id));
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
                            <TeamWeekDetail groups={groups} counts={counts} filter={byType} personId={adv.id} nameOf={id => (members.find(x => x.id === id) || {}).display_name} />
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
const fmtWhen = iso => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

// Where a submitted promotion stands, in a line under the person's progress.
function PromotionStatusLine({ req, canResend, busy, onResend }) {
  if (!req) return null;
  if (req.status === 'submitted') {
    return (
      <div className="tr-promo-status">
        Submitted {fmtWhen(req.submitted_at)}{req.submitted_by_name ? ` by ${req.submitted_by_name}` : ''}
        {req.emailed_at ? ' · Agency emailed' : (
          <>
            {' · '}<span className="tr-promo-warn">Agency not emailed yet</span>
            {canResend ? <>{' '}<button type="button" className="tr-link-btn tr-promo-resend" disabled={busy} onClick={e => { e.stopPropagation(); onResend(); }}>{busy ? 'Sending…' : 'Send again'}</button></> : null}
          </>
        )}
      </div>
    );
  }
  if (req.status === 'sent_back') {
    return (
      <div className="tr-promo-status">
        <span className="tr-promo-warn">Sent back</span> {fmtWhen(req.decided_at)}{req.decided_by_name ? ` by ${req.decided_by_name}` : ''}{req.decision_note ? `: “${req.decision_note}”` : ''}
      </div>
    );
  }
  return null;
}

export function TeamPromotionSubView({ user, members, loadingMembers, memberLabel, emptyMessage }) {
  const [loading, setLoading] = useState(true);
  const [progressList, setProgressList] = useState([]);
  const [requests, setRequests] = useState(() => new Map());
  // True until migration-promotion-requests.sql has been run: promoting
  // then works the old way (one step, no submission or email).
  const [noSubmissions, setNoSubmissions] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const isAdmin = user.role === 'super_admin';

  const refresh = useCallback(async () => {
    if (members.length === 0) { setProgressList([]); setLoading(false); return; }
    setLoading(true);
    const ids = members.map(m => m.id);
    const [{ list }, reqs] = await Promise.all([loadPromotionReadiness(user, ids), fetchPromotionRequests(ids)]);
    // Ready first, then closest to ready.
    list.sort((a, b) => (b.progress.allMet - a.progress.allMet)
      || (b.progress.results.filter(r => r.met).length / b.progress.results.length) - (a.progress.results.filter(r => r.met).length / a.progress.results.length)
      || (a.member.display_name || '').localeCompare(b.member.display_name || ''));
    setProgressList(list);
    setRequests(reqs.byUser);
    setNoSubmissions(!!reqs.missingTable);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);

  useEffect(() => { refresh(); }, [refresh]);

  // Their latest submission for the level they're working toward.
  const latestFor = (member, progress) => {
    const r = requests.get(member.id);
    return r && r.to_tier === progress.nextTier.key ? r : null;
  };
  const waitingFor = (member, progress) => {
    const r = latestFor(member, progress);
    return r && r.status === 'submitted' ? r : null;
  };

  async function submit(member, progress) {
    const t = progress.nextTier;
    if (!window.confirm(`Submit ${member.display_name}'s promotion to ${t.name} (${t.key}) for approval?\n\nPaceLedger will email the agency (${AGENCY_EMAIL}) with their results.`)) return;
    setBusyId(member.id); setNotice(null);
    const res = await submitPromotion(member, progress);
    setBusyId(null);
    if (!res.submitted) { setNotice({ kind: 'warn', text: `Couldn't submit ${member.display_name}: ${submitErrorText(res.error)}` }); return; }
    setNotice(res.emailed
      ? { kind: 'ok', text: `Submitted ${member.display_name} for ${t.name}. The agency has been emailed, and a super admin will approve it.` }
      : { kind: 'warn', text: `Submitted ${member.display_name} for ${t.name}, but the agency wasn't emailed. ${submitErrorText(res.error)} Use "Send again" on their row.` });
    refresh();
  }

  async function resend(req, member) {
    setBusyId(member.id); setNotice(null);
    const res = await resendPromotionEmail(req.id);
    setBusyId(null);
    setNotice(res.emailed
      ? { kind: 'ok', text: `The agency has been emailed about ${member.display_name}.` }
      : { kind: 'warn', text: `Still not sent. ${submitErrorText(res.error)}` });
    refresh();
  }

  async function approve(member, progress) {
    const t = progress.nextTier;
    if (noSubmissions) {
      if (!window.confirm(`Promote ${member.display_name} to ${t.name} (${t.key})?`)) return;
      setBusyId(member.id); setNotice(null);
      const err = await approvePromotion(user, member, t);
      setBusyId(null);
      if (err) { setNotice({ kind: 'warn', text: `Couldn't promote ${member.display_name}: ${err}` }); return; }
      setNotice({ kind: 'ok', text: `${member.display_name} is now ${t.name} (${t.key}).` });
      refresh();
      return;
    }
    let req = waitingFor(member, progress);
    const ask = req
      ? `Approve ${member.display_name}'s promotion to ${t.name} (${t.key})?`
      : `Promote ${member.display_name} to ${t.name} (${t.key})?\n\nNo one has submitted it yet, so PaceLedger will submit it now and email the agency (${AGENCY_EMAIL}) with their results.`;
    if (!window.confirm(ask)) return;
    setBusyId(member.id); setNotice(null);
    if (!req) {
      const res = await submitPromotion(member, progress);
      if (!res.submitted) { setBusyId(null); setNotice({ kind: 'warn', text: `Couldn't promote ${member.display_name}: ${submitErrorText(res.error)}` }); return; }
      if (!res.emailed) {
        // The agency hears about every promotion, so stop here; it's now
        // waiting, and can be sent again or approved from its row.
        setBusyId(null);
        setNotice({ kind: 'warn', text: `Submitted, but the agency wasn't emailed, so ${member.display_name} hasn't been promoted yet. ${submitErrorText(res.error)} Use "Send again", then Approve.` });
        refresh();
        return;
      }
      req = res.request;
    }
    const out = await approvePromotionRequest(req.id);
    setBusyId(null);
    if (!out.ok) { setNotice({ kind: 'warn', text: `Couldn't promote ${member.display_name}: ${out.error}` }); refresh(); return; }
    logAuditEvent(user.id, user.displayName, 'Promoted', member.display_name, `${member.hierarchy_tier || '—'} → ${t.key}`);
    setNotice({ kind: 'ok', text: `${member.display_name} is now ${t.name} (${t.key}).` });
    refresh();
  }

  async function sendBack(req, member) {
    const note = window.prompt(`Send ${member.display_name}'s promotion back?\n\nWhat needs fixing? ${req.submitted_by_name || 'Their manager'} will see this.`, '');
    if (note === null) return;
    setBusyId(member.id); setNotice(null);
    const out = await sendBackPromotion(req.id, note);
    setBusyId(null);
    setNotice(out.ok
      ? { kind: 'ok', text: `Sent back. ${req.submitted_by_name || 'Their manager'} can submit it again once it's fixed.` }
      : { kind: 'warn', text: `Couldn't send it back: ${out.error}` });
    refresh();
  }

  const readyCount = progressList.filter(({ member, progress }) => progress?.allMet && !waitingFor(member, progress)).length;
  const waitingCount = progressList.filter(({ member, progress }) => waitingFor(member, progress)).length;
  const isLoading = loadingMembers || loading;
  const stop = fn => e => { e.stopPropagation(); fn(); };

  return (
    <>
      <div className="tr-row-head">
        <h2 className="tr-h2">Promotion readiness</h2>
        <button className="tr-btn tr-btn-ghost tr-btn-sm" onClick={refresh}>Refresh</button>
      </div>
      <p className="tr-subtitle">
        Live progress toward each person's next tier — the same numbers their own Milestones page shows them.
        {noSubmissions
          ? (isAdmin ? ' Approve a promotion here when someone is ready.' : ' Super admins approve promotions.')
          : (isAdmin
            ? ' Approve submitted promotions here, or send them back.'
            : ' When someone is ready, their direct manager submits it for approval and the agency is emailed. A super admin approves it.')}
      </p>
      {notice && <div className={notice.kind === 'ok' ? 'tr-flash' : 'tr-error'} style={{ marginBottom: 12 }}>{notice.text}</div>}
      {isLoading ? <SkeletonTable rows={5} cols={4} /> : members.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">{emptyMessage}</p></div>
      ) : progressList.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">No one here has a hierarchy tier set yet, or everyone's already at the top of the ladder.</p></div>
      ) : (
        <>
          {(readyCount > 0 || waitingCount > 0) && (
            <div className="tr-health-line">
              {readyCount > 0 && <span className="tr-type-badge tr-type-badge-both">🎉 {readyCount} ready for promotion</span>}
              {waitingCount > 0 && <span className="tr-type-badge tr-promo-waiting">{waitingCount} waiting for approval</span>}
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
                    const latest = latestFor(member, progress);
                    const waiting = latest && latest.status === 'submitted' ? latest : null;
                    const busy = busyId === member.id;
                    const isDirect = member.manager_id === user.id;
                    const canSubmit = !noSubmissions && !isAdmin && isDirect && progress.allMet && !waiting;
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
                            <span className="tr-promo-ready-cell">
                              {waiting ? <span className="tr-type-badge tr-promo-waiting">Waiting for approval</span>
                                : progress.allMet ? <span className="tr-type-badge tr-type-badge-both">✓ Ready!</span> : null}
                              {!progress.allMet ? <span className="tr-mono">{metCount} / {totalCount} met{waiting ? ' now' : ''}</span> : null}
                              {isAdmin && waiting ? (
                                <>
                                  <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" disabled={busy} onClick={stop(() => approve(member, progress))}>{busy ? 'Saving…' : 'Approve'}</button>
                                  <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" disabled={busy} onClick={stop(() => sendBack(waiting, member))}>Send back</button>
                                </>
                              ) : null}
                              {isAdmin && !waiting && progress.allMet ? (
                                <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" disabled={busy} onClick={stop(() => approve(member, progress))}>
                                  {busy ? 'Saving…' : `Promote to ${progress.nextTier.key}`}
                                </button>
                              ) : null}
                              {canSubmit ? (
                                <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" disabled={busy} onClick={stop(() => submit(member, progress))}>
                                  {busy ? 'Submitting…' : 'Submit for approval'}
                                </button>
                              ) : null}
                              {!noSubmissions && !isAdmin && !isDirect && progress.allMet && !waiting ? <span className="tr-promo-note">Their direct manager submits it</span> : null}
                            </span>
                            {!noSubmissions ? (
                              <PromotionStatusLine req={latest && latest.status !== 'approved' ? latest : null}
                                canResend={isAdmin || (latest && latest.submitted_by === user.id)} busy={busy} onResend={() => resend(latest, member)} />
                            ) : null}
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
                    <td>{leaderStepText(r.st.next)}{r.pr && r.pr.resident_state ? <div className="tr-tenure">{r.pr.resident_state}</div> : null}</td>
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

// The views down the side of Team Pace, in the order someone moves through
// them: recruited, licensed, field trained, promoted.
const PACE_VIEWS = [
  { key: 'pace', label: 'Pace' },
  { key: 'recruits', label: 'Recruits' },
  { key: 'licensing', label: 'Licensing' },
  { key: 'training', label: 'Field training' },
  { key: 'promotion', label: 'Promotion' },
];

export function PeoplePaceBody({ user, fetchMembers, heading, Icon, emptyMessage, memberLabel, initialView }) {
  const [view, setView] = useState(PACE_VIEWS.some(v => v.key === initialView) ? initialView : 'pace');
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
        {PACE_VIEWS.map(v => (
          <button
            key={v.key} type="button" className={`tr-sidebar-item tr-sidebar-item-week ${view === v.key ? 'tr-sidebar-item-active' : ''}`}
            onClick={() => setView(v.key)}>
            <span>{v.label}</span>
          </button>
        ))}
      </nav>
      <div className="tr-appts-main">
        {view === 'pace' ? (
          <TeamPaceSubView
            user={user} members={members} loadingMembers={loadingMembers}
            heading={heading} Icon={Icon} emptyMessage={emptyMessage} memberLabel={memberLabel} />
        ) : view === 'recruits' ? (
          <RecruitsSubView user={user} members={members} loadingMembers={loadingMembers} emptyMessage={emptyMessage} />
        ) : view === 'training' ? (
          <FieldTrainingSubView user={user} members={members} loadingMembers={loadingMembers} emptyMessage={emptyMessage} />
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
