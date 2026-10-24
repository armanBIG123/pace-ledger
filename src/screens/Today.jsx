// Today: four number tiles, one "Do next" list (appointments coming up, then what needs you), folds for the rest of the week, and team wins.
import { Children, useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Award, CalendarDays, Check, CheckCheck, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, ClipboardCheck, FileText, GraduationCap, List as ListIcon, Pencil, Plus, Presentation, Sparkles, Target, UserPlus, Users, Video, Wallet, X } from 'lucide-react';
import { examWhen, fetchLicensingProgress, licensingStatus } from '../licensing.js';
import { computeOnboarding, fetchMyOnboarding, ONBOARDING_DAYS, ONBOARDING_WEEKS, onboardingDay, saveOnboardingSnapshot, setOnboardingVisibility, shouldShowOnboarding, weekForDay } from '../onboarding.js';
import { isNativeApp, onAppResume, reminderPermission, requestReminderPermission } from '../native.js';
import { isLicensed } from '../hierarchy.js';
import { computeAnnualGrossIncomeNeeded, computeCommissionPerTransaction, computeDailyProspects, computeExpensesSubtotal, computeMonthlyGrossIncomeNeeded, computeMonthlyProspects, computeProspectsNeededPerYear, computeTransactionsNeededPerYear, fetchBusinessPlan, rowToBusinessPlanFields } from '../businessPlan.js';
import { DATE_SET_OPTIONS, dateSetMeta, defaultDateSetOption, WEEKLY_TOTAL_TARGET } from '../lib/pace.js';
import { addDays, apptClock, apptEndClock, apptEndMs, apptLocalDate, apptStartMs, fmtApptDateTime, fmtDate, fmtDisplayDate, fmtShortDate, greetingFor, parseDate, startsInLabel, todayStr, weekStartOf } from '../lib/dates.js';
import { lowerFirst } from '../lib/format.js';
import { PaycheckCard } from '../components/paycheck.jsx';
import { computePaycheck } from '../lib/paycheck.js';
import { TeamWinsSection } from '../components/wins.jsx';
import { applyFollowUpToList, fetchAppointmentsImOn, fetchMyAppointments, isPastAppointment, loggedSummary, logPresentedAppointment, OUTCOME_OPTIONS, persistFollowUp, typeLabel } from '../data/appointments.js';
import { ALL_CHARACTERISTICS, bookedProspectKeys, fetchMyProspects, insertProspect, isStaleProspect, LEANING_LABELS, prospectLeaningKey, prospectToAppointmentPrefill, prospectTotalChecked, STALE_PROSPECT_DAYS, topProspectsToCall, updateProspectPhone } from '../data/prospects.js';
import { fetchHierarchyPeopleShared, fetchMyLicensing, loadPromotionReadiness, seesTeam } from '../data/team.js';
import { fetchGoogleConnectionStatus } from '../data/integrations.js';
import { ProgressRing, SkelBlock } from '../components/ui.jsx';
import { RemindersPrompt } from '../components/reminders.jsx';
import { FollowUpModal } from '../components/followUpModal.jsx';
import { appointmentTexts, CallButton, prospectTexts, TextButton } from '../components/contact.jsx';
import { isValidPhone } from '../lib/phone.js';
import { AnnouncementToday } from '../components/announcements.jsx';
import { applyAppointmentEdit, openAppointment, useAppointmentEdits } from '../components/appointmentPanel.jsx';
import { fetchMyIntakeStatus } from '../clientIntake.js';
import { openIntakeSend } from '../lib/intakeEvents.js';
import { dayWord, intakeStatusText } from '../lib/intakeStatus.js';

// The checklist card. `result` comes from computeOnboarding().
export function FirstThirtyDays({ result, day, onGo, onHide }) {
  const currentWeek = weekForDay(day || 1);
  const [showAll, setShowAll] = useState(() => !(window.matchMedia && window.matchMedia('(max-width: 640px)').matches));
  const next = result.next;
  const nextWeek = next ? ONBOARDING_WEEKS.find(w => w.key === next.week) : null;
  const behind = next && day && nextWeek && day > nextWeek.days[1];

  if (result.allDone) {
    return (
      <section className="tr-card tr-f30 tr-f30-complete" aria-label="First 30 days">
        <div className="tr-f30-head">
          <ProgressRing done={result.total} total={result.total}><Award size={22} /></ProgressRing>
          <div className="tr-f30-head-main">
            <div className="tr-f30-kicker">Your first 30 days</div>
            <h3 className="tr-f30-title">Checklist complete. Well done.</h3>
            <p className="tr-f30-why">You've set up your plan, built your list, booked and held appointments, and got your first result. From here, Today keeps you on pace every day.</p>
          </div>
          <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onHide}>Hide this</button>
        </div>
      </section>
    );
  }

  return (
    <section className="tr-card tr-f30" aria-label="First 30 days">
      <div className="tr-f30-head">
        <ProgressRing done={result.doneCount} total={result.total}>
          <strong>{result.doneCount}</strong><span>of {result.total}</span>
        </ProgressRing>
        <div className="tr-f30-head-main">
          <div className="tr-f30-kicker">
            First 30 days{day ? <> · <span className="tr-f30-day">Day {Math.min(day, 99)}{day <= ONBOARDING_DAYS ? ` of ${ONBOARDING_DAYS}` : ''}</span></> : null}
            {behind ? <span className="tr-status tr-status-amber tr-f30-flag">Catch up</span> : null}
          </div>
          <h3 className="tr-f30-title">Next: {next.title}{next.target ? <span className="tr-f30-count"> · {next.n} of {next.target}</span> : null}</h3>
          <p className="tr-f30-why">{next.why}</p>
          {next.target ? (
            <div className="tr-ov-bar tr-f30-stepbar"><div className="tr-ov-bar-fill" style={{ width: `${Math.round((next.n / next.target) * 100)}%` }} /></div>
          ) : null}
          <div className="tr-f30-actions">
            <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={() => onGo(next)}>{next.cta} <ChevronRight size={14} /></button>
            <button type="button" className="tr-f30-toggle" onClick={() => setShowAll(s => !s)} aria-expanded={showAll}>
              {showAll ? 'Hide all steps' : 'See all steps'} {showAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>
        <button type="button" className="tr-icon-btn tr-f30-close" onClick={onHide} aria-label="Hide the First 30 days checklist" title="Hide (you can turn it back on in Your account)"><X size={16} /></button>
      </div>

      {showAll && (
        <div className="tr-f30-weeks">
          {ONBOARDING_WEEKS.map(w => {
            const steps = result.steps.filter(s => s.week === w.key);
            const doneHere = steps.filter(s => s.done).length;
            const isNow = w.key === currentWeek.key;
            return (
              <div key={w.key} className={`tr-f30-week ${isNow ? 'tr-f30-week-now' : ''}`}>
                <div className="tr-f30-week-head">
                  <span className="tr-f30-week-label">{w.label}{isNow ? <span className="tr-f30-here">You're here</span> : null}</span>
                  <span className="tr-f30-week-title">{w.title}</span>
                  <span className="tr-f30-week-meta">Days {w.days[0]}–{w.days[1]} · {doneHere}/{steps.length} done</span>
                </div>
                <ul className="tr-f30-steps">
                  {steps.map(s => {
                    const isNext = next && s.key === next.key;
                    return (
                      <li key={s.key}>
                        <button type="button" className={`tr-f30-step ${s.done ? 'tr-f30-step-done' : ''} ${isNext ? 'tr-f30-step-next' : ''}`} onClick={() => onGo(s)}>
                          <span className="tr-f30-node" aria-hidden="true">{s.done ? <Check size={12} strokeWidth={3} /> : null}</span>
                          <span className="tr-f30-step-title">{s.title}<span className="tr-sr-only">{s.done ? ' (done)' : ''}</span></span>
                          {s.target && !s.done ? <span className="tr-f30-step-count">{s.n}/{s.target}</span> : null}
                          <ChevronRight size={14} className="tr-f30-step-go" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
      <p className="tr-f30-foot">Every step checks itself off as you use PaceLedger. Your manager can see your progress, so they know when to help.</p>
    </section>
  );
}

export function TodayTask({ task, children }) {
  const extra = Children.toArray(children).length > 0;
  return (
    <li className={`tr-task ${task.done ? 'tr-task-done' : ''} tr-task-${task.tone || 'brass'}`}>
      <span className="tr-task-node" aria-hidden="true">{task.done ? <Check size={13} strokeWidth={3} /> : <task.Icon size={15} />}</span>
      <div className="tr-task-body">
        <div className="tr-task-title">{task.title}{task.done ? <span className="tr-sr-only"> (done)</span> : null}</div>
        {task.meta ? <div className="tr-task-meta">{task.meta}</div> : null}
      </div>
      {(task.action && !task.done) || task.onHide ? (
        <div className="tr-task-actions">
          {task.action && !task.done ? (
            <button type="button" className={`tr-btn tr-btn-sm ${task.primary ? 'tr-btn-brass' : 'tr-btn-ghost'} tr-task-btn`} onClick={task.action.run}>{task.action.label}</button>
          ) : null}
          {task.more && !task.done ? <button type="button" className="tr-link-btn tr-task-hide" onClick={task.more.run}>{task.more.label}</button> : null}
          {task.onHide ? <button type="button" className="tr-link-btn tr-task-hide" onClick={task.onHide}>Hide</button> : null}
        </div>
      ) : null}
      {extra ? <div className="tr-task-extra">{children}</div> : null}
    </li>
  );
}

// "Needs you" on Today: one short list instead of a stack of banners.
// Your own promotion news first, then anyone you can see (your downline;
// everyone for super admins) who has met every requirement for their next
// tier, then where you are on the path to licensed. Leaders can hide a
// name once they've passed it on.
export function readHiddenPromos() {
  try { return new Set(JSON.parse(localStorage.getItem('pl_promo_hidden') || '[]')); } catch { return new Set(); }
}

// Promotion and licensing items for the "Do next" list: your own
// promotion news, anyone you can see (your downline; everyone for super
// admins) who has met every requirement for their next tier, and where you
// are on the path to licensed. Leaders can hide a name once they've passed
// it on. `licProfile` is your NPN and writing number, already loaded by
// Today.
export function useNeedsYou({ user, licProfile, showLicensing, onMilestones, onReview, onLicensing }) {
  const [ready, setReady] = useState(null);
  const [prog, setProg] = useState(undefined);
  const [hidden, setHidden] = useState(readHiddenPromos);
  useEffect(() => {
    let alive = true;
    loadPromotionReadiness(user, undefined, { shared: true }).then(({ list }) => {
      if (alive) setReady(list.filter(x => x.progress && x.progress.allMet));
    }).catch(() => { if (alive) setReady([]); });
    return () => { alive = false; };
  }, [user.id, user.role]);
  useEffect(() => {
    let alive = true;
    const load = () => fetchLicensingProgress(user.id).then(p => { if (alive) setProg(p && p.error ? null : (p || {})); });
    load();
    window.addEventListener('paceledger:onboarding-changed', load);
    return () => { alive = false; window.removeEventListener('paceledger:onboarding-changed', load); };
  }, [user.id]);

  const isAdmin = user.role === 'super_admin';
  const keyOf = x => `${x.member.id}:${x.progress.nextTier.key}`;
  function hide(x) {
    const next = new Set(hidden); next.add(keyOf(x)); setHidden(next);
    try { localStorage.setItem('pl_promo_hidden', JSON.stringify([...next].slice(-200))); } catch { /* ignore */ }
  }
  const promos = [];
  const mine = ready ? ready.find(x => x.member.id === user.id) : null;
  if (mine) promos.push({
    key: 'me', Icon: Award, tone: 'brass',
    title: <>You've met every requirement for <strong>{mine.progress.nextTier.name}</strong></>,
    meta: isAdmin ? 'Approve it from Team Pace → Promotion.' : 'Your direct manager submits it for approval.',
    action: { label: 'See my progress', run: onMilestones },
  });
  const others = ready ? ready.filter(x => x.member.id !== user.id && !hidden.has(keyOf(x))) : [];
  others.slice(0, 3).forEach(x => {
    const submits = !isAdmin && x.member.manager_id === user.id;
    promos.push({
      key: keyOf(x), Icon: Users, tone: 'brass', primary: true,
      title: isAdmin ? <>Approve <strong>{x.member.display_name}</strong> for {x.progress.nextTier.name}</>
        : submits ? <>Submit <strong>{x.member.display_name}</strong> for {x.progress.nextTier.name}</>
          : <><strong>{x.member.display_name}</strong> is ready for {x.progress.nextTier.name}</>,
      meta: submits || isAdmin ? 'Every requirement met' : 'Every requirement met. Their direct manager submits it.',
      action: onReview ? { label: isAdmin ? 'Review' : submits ? 'Submit' : 'Review', run: onReview } : null,
      onHide: isAdmin ? null : () => hide(x),
    });
  });
  if (others.length > 3) promos.push({
    key: 'more-promos', Icon: Users, tone: 'brass',
    title: <>{others.length - 3} more ready for promotion</>, meta: '',
    action: onReview ? { label: 'See all', run: onReview } : null,
  });
  let licensing = null;
  if (showLicensing && !isAdmin && prog && licProfile) {
    const st = licensingStatus(prog, licProfile);
    if (!st.licensed && st.next) {
      const examSoon = prog.exam_on && !st.done.examPassed && prog.exam_on >= todayStr();
      licensing = {
        key: 'lic', Icon: GraduationCap, tone: 'blue',
        title: examSoon ? <>Your licensing exam is <strong>{examWhen(prog.exam_on)}</strong></> : <>Licensing: {lowerFirst(st.next.title)}</>,
        meta: examSoon ? `${fmtShortDate(prog.exam_on)} · step ${st.nextIndex + 1} of ${st.total}` : `Step ${st.nextIndex + 1} of ${st.total}`,
        action: { label: 'Licensing', run: onLicensing },
      };
    }
  }
  return { promos, licensing };
}

export function TodayBody({ user, onNavigate, initialIntent = null, onIntentConsumed }) {
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState([]);
  // Ones you're presenting or training on, today and tomorrow.
  const [involvedToday, setInvolvedToday] = useState([]);
  // Your clients' intake forms (who, sent how, filled in yet).
  const [intakes, setIntakes] = useState([]);
  // Intake rows you've hidden (this device): { [formId]: until-ms }.
  const [intakeHidden, setIntakeHidden] = useState(() => { try { return JSON.parse(localStorage.getItem('pl_intake_hidden') || '{}'); } catch { return {}; } });
  const [presenting, setPresenting] = useState([]);
  const [prospects, setProspects] = useState([]);
  const [plan, setPlan] = useState(null);
  const [facts, setFacts] = useState({ google: false, licensed: false, reminders: 'unsupported' });
  const [onboardingRow, setOnboardingRow] = useState(null);
  const [modalTarget, setModalTarget] = useState(null);
  // An appointment you presented for someone else, open to log.
  const [presentedTarget, setPresentedTarget] = useState(null);
  // A "How did it go?" phone reminder was tapped: open that appointment's
  // log window once Today has loaded.
  const [pendingLog, setPendingLog] = useState(null);
  useEffect(() => {
    if (initialIntent && typeof initialIntent === 'object' && initialIntent.log) { setPendingLog(initialIntent.log); onIntentConsumed?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIntent]);
  const [modalSaving, setModalSaving] = useState(false);
  const [flash, setFlash] = useState('');
  const [quickFirst, setQuickFirst] = useState('');
  const [quickLast, setQuickLast] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickErr, setQuickErr] = useState('');
  const [licProfile, setLicProfile] = useState(null);
  const [openTile, setOpenTile] = useState(null); // 'pace' | 'paycheck' | 'goals' | 'week'
  const [showMoreWeek, setShowMoreWeek] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [showCallList, setShowCallList] = useState(false);
  // Call list: typing a number for someone who doesn't have one yet.
  const [numberFor, setNumberFor] = useState(null);
  const [numberDraft, setNumberDraft] = useState('');
  const [numberErr, setNumberErr] = useState('');
  const [numberBusy, setNumberBusy] = useState(false);
  // Names, for "Dynamite Jones logged how it went".
  const [people, setPeople] = useState(new Map());
  // Someone joined your team (signed up under you): your first recruit.
  const [hasRecruit, setHasRecruit] = useState(false);
  // "Logged for you" rows you've hidden (this device).
  const [seenLogged, setSeenLogged] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('pl_logged_seen') || '[]')); } catch { return new Set(); } });
  const savedSnapshotFor = useRef('');

  const load = useCallback(async () => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 2); // today and tomorrow
    const [a, p, row, g, lic, ob, perm, on, forms] = await Promise.all([
      fetchMyAppointments(user.id), fetchMyProspects(user.id), fetchBusinessPlan(user.id),
      fetchGoogleConnectionStatus().catch(() => ({ connected: false })),
      // Your NPN and writing number come from the people list the other
      // cards already load (one request instead of two).
      fetchHierarchyPeopleShared().then(list => list.find(x => x.id === user.id) || fetchMyLicensing(user.id)).catch(() => fetchMyLicensing(user.id)),
      fetchMyOnboarding(user.id), reminderPermission(),
      // Appointments someone else set that you're presenting (they count
      // toward your pace) or training on.
      fetchAppointmentsImOn(user.id).catch(() => []),
      fetchMyIntakeStatus(user.id).catch(() => []),
    ]);
    fetchHierarchyPeopleShared().then(list => {
      setPeople(new Map((list || []).map(x => [x.id, x.display_name])));
      setHasRecruit((list || []).some(x => x.manager_id === user.id));
    }).catch(() => {});
    const inv = on.filter(x => x.appointmentAt && new Date(x.appointmentAt) >= start && new Date(x.appointmentAt) < end);
    const pres = on.filter(x => x.presentingFor);
    setAppointments(a);
    setProspects(p);
    setPlan(row && !row.loadError ? rowToBusinessPlanFields(row) : null);
    setFacts({ google: !!(g && g.connected), licensed: isLicensed(lic), reminders: perm });
    setLicProfile(lic || null);
    setOnboardingRow(ob && !ob.error ? ob : null);
    setInvolvedToday(inv);
    setPresenting(pres);
    setIntakes(forms || []);
    setLoading(false);
  }, [user.id]);
  useEffect(() => { load(); }, [load]);
  // One of your appointments was changed from the window it opens in.
  useAppointmentEdits(change => {
    if (change.reload) { load(); return; }
    setAppointments(prev => applyAppointmentEdit(prev, change));
    // A leader can change ones they're presenting or training on too.
    setInvolvedToday(prev => applyAppointmentEdit(prev, change));
    setPresenting(prev => applyAppointmentEdit(prev, change));
  });
  // An intake form was made, sent or removed from the send window.
  useEffect(() => {
    const on = e => {
      const d = e && e.detail;
      if (!d) return;
      if (d.candidate && d.candidate.advisor_id === user.id) setIntakes(prev => [{ ...d.candidate }, ...prev.filter(c => c.id !== d.candidate.id)]);
      if (d.removedId) setIntakes(prev => prev.filter(c => c.id !== d.removedId));
    };
    window.addEventListener('paceledger:intake-changed', on);
    return () => window.removeEventListener('paceledger:intake-changed', on);
  }, [user.id]);
  useEffect(() => {
    const again = () => { load(); };
    window.addEventListener('paceledger:onboarding-changed', again);
    const offResume = onAppResume(again);
    return () => { window.removeEventListener('paceledger:onboarding-changed', again); offResume(); };
  }, [load]);
  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(''), 4000);
    return () => clearTimeout(t);
  }, [flash]);
  useEffect(() => {
    if (!pendingLog || loading) return;
    const x = appointments.find(a => a.id === pendingLog);
    if (x) setModalTarget(x);
    else setFlash("That appointment isn't on your list anymore.");
    setPendingLog(null);
  }, [pendingLog, loading, appointments]);

  // ---- First 30 days ------------------------------------------------
  const day = onboardingDay(user.createdAt);
  const hasPlan = !!plan && computeExpensesSubtotal(plan) > 0;
  const onboarding = computeOnboarding({
    native: isNativeApp(),
    remindersOn: facts.reminders === 'granted',
    hasPlan,
    prospectCount: prospects.length,
    scoredCount: prospects.filter(x => prospectTotalChecked(x) > 0).length,
    calendarConnected: facts.google,
    bookedCount: appointments.filter(x => !x.isFollowUp).length,
    outcomeLogged: appointments.some(x => x.followUpCompletedAt),
    hasWin: hasRecruit || appointments.some(x => x.officiallySold || x.officiallyRecruited) || prospects.some(x => x.markedSold || x.markedRecruited),
    licensed: facts.licensed,
  });
  const visibility = (onboardingRow && onboardingRow.visibility) || 'auto';
  const showOnboarding = !loading && shouldShowOnboarding(day, visibility, onboarding.allDone);
  const needs = useNeedsYou({
    user, licProfile, showLicensing: !showOnboarding,
    onMilestones: () => onNavigate('milestones'),
    onReview: seesTeam(user) ? () => onNavigate('teampromo') : null,
    onLicensing: () => onNavigate('milestones', 'licensing'),
  });
  // Keep the manager's view current (only for people still in their first
  // couple of months, or who turned the checklist on themselves).
  useEffect(() => {
    if (loading) return;
    if (!(visibility === 'shown' || (day != null && day <= 60))) return;
    const sig = `${onboarding.doneCount}/${onboarding.total}/${onboarding.next ? onboarding.next.key : ''}`;
    if (savedSnapshotFor.current === sig) return;
    savedSnapshotFor.current = sig;
    saveOnboardingSnapshot(user.id, onboardingRow, onboarding).then(r => { if (r) setOnboardingRow(r); }).catch(() => {});
  }, [loading, onboarding.doneCount, onboarding.total, onboarding.next && onboarding.next.key]); // eslint-disable-line react-hooks/exhaustive-deps

  async function goStep(step) {
    const [tab, intent] = step.go;
    if (tab === 'reminders') {
      const res = await requestReminderPermission();
      setFacts(f => ({ ...f, reminders: res }));
      if (res === 'granted') window.dispatchEvent(new Event('paceledger:reminders-enabled'));
      else setFlash("Notifications are off for PaceLedger. Turn them on in your phone's Settings → PaceLedger → Notifications.");
      return;
    }
    onNavigate(tab, intent || null);
  }
  async function hideOnboarding() {
    const before = onboardingRow;
    setOnboardingRow(r => ({ ...(r || { user_id: user.id }), visibility: 'hidden' }));
    const ok = await setOnboardingVisibility(user.id, 'hidden');
    if (!ok) setOnboardingRow(before);
    setFlash(ok ? 'Checklist hidden. Turn it back on any time in Your account (tap your name).' : "Couldn't hide it. Check your connection and try again.");
  }

  // ---- outcome logging, right from Today ----------------------------
  async function handleSaveOutcome(id, data) {
    setModalSaving(true);
    const original = appointments.find(x => x.id === id);
    const res = await persistFollowUp(user, id, original, data);
    setModalSaving(false);
    if (!res.ok) { setFlash("Couldn't save. Check your connection and try again."); return; }
    setAppointments(prev => applyFollowUpToList(prev, id, data, res.followUpTimezone, res.newAppt));
    window.dispatchEvent(new Event('paceledger:appointments-changed'));
    setModalTarget(null);
    setFlash(`Saved — ${original ? original.client : 'appointment'}${res.newAppt ? '. The follow-up appointment is on your list.' : '.'}`);
  }
  // "Pick a new time" in the log window moved the appointment.
  function handleRescheduled(rec, info) {
    setAppointments(prev => prev.map(x => (x.id === rec.id ? rec : x)));
    window.dispatchEvent(new Event('paceledger:appointments-changed'));
    setModalTarget(null);
    setFlash(`Moved ${rec.client} to ${fmtApptDateTime(rec)}.${info && info.emailed === true ? ' Updated invite emailed.' : info && info.emailed === false ? " The updated invite didn't send; you can resend it by editing the appointment." : ''}`);
  }
  // Logging one you presented: it saves on the advisor's appointment, so
  // the sale or recruit counts for them.
  async function handlePresentedSave(id, data) {
    setModalSaving(true);
    const original = presenting.find(x => x.id === id);
    const res = await logPresentedAppointment(id, data);
    setModalSaving(false);
    if (!res.ok) {
      setPresentedTarget(null);
      if (/already_logged/.test(res.error || '')) { setFlash(`${original && original.setByName ? original.setByName.split(' ')[0] : 'The advisor'} already logged this one, so it's theirs to change.`); load(); }
      else setFlash("Couldn't save. Check your connection and try again.");
      return;
    }
    setPresenting(prev => prev.map(x => (x.id === id ? { ...x, ...res.record } : x)));
    window.dispatchEvent(new Event('paceledger:appointments-changed'));
    setPresentedTarget(null);
    const who = original && original.setByName ? original.setByName.split(' ')[0] : '';
    const said = [`Saved — ${res.record.client}.`];
    if (who) said.push(`${who} will see it on their Today.`);
    if (res.followUp) said.push(`The follow-up is on ${who ? `${who}'s` : 'their'} list.`);
    setFlash(said.join(' '));
  }
  // Call list: save a number typed for someone who didn't have one.
  function openNumber(p) { setNumberFor(p.id); setNumberDraft(''); setNumberErr(''); }
  async function saveNumber(e, p) {
    e.preventDefault();
    if (!isValidPhone(numberDraft)) { setNumberErr('Enter a phone number with the area code.'); return; }
    setNumberBusy(true);
    const res = await updateProspectPhone(p.id, numberDraft);
    setNumberBusy(false);
    if (!res.ok) { setNumberErr("Couldn't save. Check your connection and try again."); return; }
    setProspects(prev => prev.map(x => (x.id === p.id ? { ...x, phone: res.record.phone } : x)));
    setNumberFor(null); setNumberDraft('');
  }
  async function handleQuickAdd(e) {
    e.preventDefault();
    if (!quickFirst.trim() || !quickLast.trim()) { setQuickErr('Enter a first and last name.'); return; }
    setQuickErr(''); setQuickBusy(true);
    const blank = { firstName: quickFirst, lastName: quickLast, age: '', relationshipStrength: 5, notes: '', source: '' };
    ALL_CHARACTERISTICS.forEach(c => { blank[c.key] = false; });
    const res = await insertProspect(user.id, blank);
    setQuickBusy(false);
    if (!res.ok) { setQuickErr(res.error || "Couldn't save. Try again."); return; }
    setProspects(prev => [res.record, ...prev]);
    setQuickFirst(''); setQuickLast('');
    setFlash(`Added ${res.record.firstName} ${res.record.lastName}. Score them in Pipeline → Prospects when you have a minute.`);
  }

  if (loading) {
    return (
      <div className="tr-today">
        <SkelBlock w="45%" h="34px" />
        <div className="tr-today-grid" style={{ marginTop: 16 }}>
          <div className="tr-today-plan"><SkelBlock w="100%" h="340px" /></div>
          <div className="tr-today-side"><SkelBlock w="100%" h="160px" /><SkelBlock w="100%" h="160px" style={{ marginTop: 16 }} /></div>
        </div>
      </div>
    );
  }

  const now = new Date();
  const nowMs = now.getTime();
  const today = todayStr();
  const isToday = iso => !!iso && fmtDate(new Date(iso)) === today;
  const weekStart = weekStartOf(today);
  const weekEnd = fmtDate(addDays(parseDate(weekStart), 6));
  const monthPrefix = today.slice(0, 7);
  const firstName = (user.displayName || '').split(' ')[0];
  const booked = bookedProspectKeys(appointments);

  // Today's schedule: yours plus any you're presenting/training on, until
  // each one ends (so a meeting in progress still shows its Zoom link).
  const todaysById = new Map();
  [...appointments.filter(x => apptLocalDate(x) === today), ...involvedToday.filter(x => apptLocalDate(x) === today)]
    .forEach(x => todaysById.set(x.id, x));
  const todaysAppts = [...todaysById.values()].sort((x, y) => apptStartMs(x) - apptStartMs(y));
  const comingUp = todaysAppts.filter(x => apptEndMs(x) > nowMs);
  // Once today's are over (or there were none), tomorrow's show instead.
  const tomorrow = fmtDate(addDays(parseDate(today), 1));
  const tomorrowById = new Map();
  [...appointments.filter(x => apptLocalDate(x) === tomorrow), ...involvedToday.filter(x => apptLocalDate(x) === tomorrow)]
    .forEach(x => tomorrowById.set(x.id, x));
  const tomorrowAppts = comingUp.length ? [] : [...tomorrowById.values()].sort((x, y) => apptStartMs(x) - apptStartMs(y));
  const inProgress = x => apptStartMs(x) <= nowMs && apptEndMs(x) > nowMs;

  // Pace for today's batch (Sat/Sun count as one weekend batch).
  const todayOpt = defaultDateSetOption();
  const todayMeta = dateSetMeta(todayOpt);
  const isWeekend = todayOpt === 'weekend';
  // Pace counts the ones you set plus the ones you're presenting for your team.
  const presentingCounted = presenting.filter(x => !x.isFollowUp);
  const counted = [...appointments.filter(x => !x.isFollowUp), ...presentingCounted];
  const presentingThisWeek = presentingCounted.filter(x => x.weekOf === weekStart).length;
  const batchSet = counted.filter(x => x.weekOf === weekStart && x.dateSetOption === todayOpt).length;
  const batchLeft = Math.max(0, todayMeta.target - batchSet);
  const setThisWeek = counted.filter(x => x.weekOf === weekStart).length;
  const todayIdx = DATE_SET_OPTIONS.findIndex(o => o.value === todayOpt);
  const expectedByNow = DATE_SET_OPTIONS.slice(0, todayIdx + 1).reduce((s, o) => s + o.target, 0);
  const weekShort = Math.max(0, expectedByNow - setThisWeek);

  // Names: the daily number from the Business Plan, or 3 until there is one.
  let goals = null;
  let dailyNames = 3;
  if (plan) {
    const monthlyGross = computeMonthlyGrossIncomeNeeded(computeExpensesSubtotal(plan));
    const incomeGoal = plan.incomeGoalOverride === '' ? computeAnnualGrossIncomeNeeded(monthlyGross) : (Number(plan.incomeGoalOverride) || 0);
    const tny = computeTransactionsNeededPerYear(incomeGoal, computeCommissionPerTransaction(plan.targetPremium, plan.commissionRate));
    if (tny > 0) {
      const monthly = computeMonthlyProspects(computeProspectsNeededPerYear(tny));
      goals = { prospects: Math.ceil(monthly), sales: Math.max(1, Math.ceil(tny / 12)) };
      dailyNames = Math.max(1, Math.ceil(computeDailyProspects(monthly)));
    }
  }
  const namesToday = prospects.filter(x => isToday(x.createdAt)).length;
  const namesLeft = Math.max(0, dailyNames - namesToday);

  // Outcomes: past appointments with nothing logged (except one still in
  // progress), most recent first; and the ones you logged today.
  const toLog = appointments
    .filter(x => isPastAppointment(x) && !x.followUpCompletedAt && !inProgress(x))
    .sort((x, y) => apptStartMs(y) - apptStartMs(x));
  const loggedToday = [
    ...appointments.filter(x => isToday(x.followUpCompletedAt) && !(x.outcomeLoggedBy && x.outcomeLoggedBy !== user.id)),
    ...presenting.filter(x => isToday(x.followUpCompletedAt) && x.outcomeLoggedBy === user.id),
  ];
  const setToday = appointments.filter(x => !x.isFollowUp && isToday(x.createdAt)).length;
  const callList = topProspectsToCall(prospects, booked);

  // ---- the plan ------------------------------------------------------
  const mustDo = [];
  // One row for outcomes, however many are waiting: Log opens the newest,
  // See all opens the whole list (Pipeline → Log outcome).
  if (toLog.length === 1) {
    const x = toLog[0];
    mustDo.push({
      key: `log-${x.id}`, Icon: ClipboardCheck, tone: 'rust', primary: true,
      title: <>Log how it went with <strong>{x.client}</strong></>,
      meta: `${fmtApptDateTime(x)}${typeLabel(x) ? ` · ${typeLabel(x)}` : ''}`,
      action: { label: 'Log', run: () => setModalTarget(x) },
    });
  } else if (toLog.length > 1) {
    const names = toLog.slice(0, 2).map(x => x.client);
    mustDo.push({
      key: 'log-all', Icon: ClipboardCheck, tone: 'rust', primary: true,
      title: <>Log how <strong>{toLog.length} appointments</strong> went</>,
      meta: `${names.join(', ')}${toLog.length > 2 ? ` and ${toLog.length - 2} more` : ''}`,
      action: { label: 'Log next', run: () => setModalTarget(toLog[0]) },
      more: { label: 'See all', run: () => onNavigate('followup', 'nolog') },
    });
  }
  // Appointments your team booked that you presented in the last few days:
  // you can log them too (the sale or recruit still counts for whoever
  // booked it). Older ones stay in Pipeline → Log outcome → You presented.
  const presentedFrom = fmtDate(addDays(parseDate(today), -3));
  const presentedToLog = presenting
    .filter(x => isPastAppointment(x) && !x.followUpCompletedAt && (x.appointmentDate || '') >= presentedFrom)
    .sort((x, y) => apptStartMs(y) - apptStartMs(x));
  if (presentedToLog.length) {
    const x = presentedToLog[0];
    mustDo.push({
      key: 'presented', Icon: Presentation, tone: 'blue', primary: true,
      title: presentedToLog.length === 1
        ? <>Log how it went with <strong>{x.client}</strong>, which you presented</>
        : <>Log how <strong>{presentedToLog.length} appointments you presented</strong> went</>,
      meta: presentedToLog.length === 1
        ? `${fmtApptDateTime(x)}${x.setByName ? ` · booked by ${x.setByName}` : ''}`
        : `${presentedToLog.slice(0, 2).map(y => y.client).join(', ')}${presentedToLog.length > 2 ? ` and ${presentedToLog.length - 2} more` : ''}`,
      action: { label: presentedToLog.length === 1 ? 'Log' : 'Log next', run: () => setPresentedTarget(x) },
      more: { label: 'See all', run: () => onNavigate('followup', 'presented') },
    });
  }
  // Your appointments a presenter logged for you in the last three days.
  appointments
    .filter(x => x.userId === user.id && x.outcomeLoggedBy && x.outcomeLoggedBy !== user.id && x.followUpCompletedAt
      && Date.now() - new Date(x.followUpCompletedAt).getTime() < 3 * 864e5 && !seenLogged.has(x.id))
    .forEach(x => {
      const result = loggedSummary(x);
      const counts = x.officiallySold && x.officiallyRecruited ? 'The sale and recruit count for you.'
        : x.officiallySold ? 'The sale counts for you.' : x.officiallyRecruited ? 'The recruit counts for you.' : '';
      mustDo.push({
        key: `lfm-${x.id}`, Icon: CheckCheck, tone: 'green',
        title: <><strong>{people.get(x.outcomeLoggedBy) || (x.outcomeLoggedBy === x.presenterId && x.presenter) || 'Your presenter'}</strong> logged how it went with <strong>{x.client}</strong></>,
        meta: `${result || 'Logged'}.${counts ? ` ${counts}` : ''}`,
        action: { label: 'Review', run: () => setModalTarget(x) },
        onHide: () => setSeenLogged(prev => {
          const next = new Set(prev); next.add(x.id);
          try { localStorage.setItem('pl_logged_seen', JSON.stringify([...next])); } catch { /* fine */ }
          return next;
        }),
      });
    });
  // Intake forms that came back in the last week: review them (before
  // the meeting, if it's still ahead).
  const hideIntake = id => setIntakeHidden(prev => {
    const next = { ...prev, [id]: Date.now() + 3 * 864e5 };
    try { localStorage.setItem('pl_intake_hidden', JSON.stringify(next)); } catch { /* fine */ }
    return next;
  });
  const intakeShown = c => !(intakeHidden[c.id] > nowMs);
  const apptOf = c => appointments.find(x => x.id === c.source_appointment_id) || null;
  const backForms = intakes
    .filter(c => c.status === 'submitted' && c.submitted_at && nowMs - new Date(c.submitted_at).getTime() < 7 * 864e5 && intakeShown(c))
    .sort((x, y) => new Date(y.submitted_at) - new Date(x.submitted_at));
  if (backForms.length) {
    const c = backForms[0];
    const ap = apptOf(c);
    const ahead = ap && !isPastAppointment(ap);
    mustDo.push({
      key: 'intake-back', Icon: FileText, tone: 'green',
      title: backForms.length === 1
        ? <><strong>{c.client_name}</strong> filled in the intake form</>
        : <><strong>{backForms.length} intake forms</strong> came back</>,
      meta: backForms.length === 1
        ? `${intakeStatusText(c)}${ahead ? ` · read it before you meet ${fmtDisplayDate(ap.appointmentDate)}` : ''}`
        : `${backForms.slice(0, 2).map(x => x.client_name).join(', ')}${backForms.length > 2 ? ` and ${backForms.length - 2} more` : ''}`,
      action: { label: 'Review', run: () => onNavigate('followup', ap && backForms.length === 1 ? { view: 'received', open: ap.id } : 'received') },
      onHide: () => backForms.forEach(x => hideIntake(x.id)),
    });
  }
  // Sales saved with "I'll add it later": the premium they still need,
  // so the sale counts on Track Production and the paycheck.
  const premiumFrom = fmtDate(addDays(parseDate(today), -30));
  const noPremium = appointments
    .filter(x => x.userId === user.id && x.officiallySold && !(Number(x.targetPremium) > 0) && (x.appointmentDate || '') >= premiumFrom)
    .sort((x, y) => apptStartMs(y) - apptStartMs(x));
  if (noPremium.length) {
    const x = noPremium[0];
    mustDo.push({
      key: 'premium', Icon: Wallet, tone: 'amber',
      title: noPremium.length === 1
        ? <>Add the premium for <strong>{x.client}</strong>'s sale</>
        : <>Add the premium for <strong>{noPremium.length} sales</strong></>,
      meta: noPremium.length === 1 ? `Sold ${fmtApptDateTime(x)}` : `${noPremium.slice(0, 2).map(y => y.client).join(', ')}${noPremium.length > 2 ? ` and ${noPremium.length - 2} more` : ''}`,
      action: { label: noPremium.length === 1 ? 'Add' : 'Add next', run: () => setModalTarget(x) },
    });
  }
  mustDo.push({
    key: 'pace', Icon: CalendarDays, done: batchLeft === 0, primary: toLog.length === 0,
    title: batchLeft === 0
      ? <>{isWeekend ? 'Weekend' : todayMeta.label} batch complete: {batchSet} set</>
      : <>Set {batchLeft} more appointment{batchLeft === 1 ? '' : 's'} {isWeekend ? 'this weekend' : 'today'}</>,
    // In someone's first two weeks, "23 behind" is just discouraging.
    meta: `${todayMeta.batchLabel}: ${batchSet} of ${todayMeta.target}${day != null && day <= 14 && weekShort > 0 ? '' : ` · ${weekShort > 0 ? `${weekShort} behind for the week` : 'on pace for the week'}`}`,
    // With people to call, the button opens the call list (Log appointment
    // is already up top); otherwise it goes straight to logging one.
    action: batchLeft > 0 && callList.length > 0
      ? { label: showCallList ? 'Hide list' : 'Call list', run: () => setShowCallList(v => !v) }
      : { label: 'Log appointment', run: () => onNavigate('mine', 'new') },
    callList: batchLeft > 0,
  });
  mustDo.push({
    key: 'names', Icon: UserPlus, done: namesLeft === 0,
    title: namesLeft === 0
      ? <>Added {namesToday} new name{namesToday === 1 ? '' : 's'} today</>
      : <>Add {namesLeft} new name{namesLeft === 1 ? '' : 's'} to your list</>,
    meta: goals
      ? `Daily goal from your Business Plan: ${dailyNames} · ${namesToday} added today`
      : `${namesToday} added today · your Business Plan sets your own daily number`,
    quickAdd: namesLeft > 0,
  });
  loggedToday.forEach(x => mustDo.push({
    key: `logged-${x.id}`, Icon: ClipboardCheck, done: true,
    title: <>Logged how it went with {x.client}{x.userId !== user.id ? ' (you presented)' : ''}</>,
    meta: (OUTCOME_OPTIONS.find(o => o.value === x.outcome) || {}).label || 'Outcome saved',
  }));
  const open = mustDo.filter(t => !t.done);
  const doneTasks = mustDo.filter(t => t.done);
  const doneCount = doneTasks.length;

  const later = [];
  appointments.filter(x => x.status === 'needs_reschedule').forEach(x => later.push({
    key: `rs-${x.id}`, Icon: CalendarDays, tone: 'violet',
    title: <>Reschedule <strong>{x.client}</strong></>, meta: `Was ${fmtApptDateTime(x)}`,
    // Opens it ready to pick the new time.
    action: { label: 'Reschedule', run: () => openAppointment(x) },
  }));
  appointments.filter(x => x.status === 'needs_follow_up' && isPastAppointment(x)).forEach(x => later.push({
    key: `fu-${x.id}`, Icon: ClipboardCheck, tone: 'amber',
    title: <>Follow up with <strong>{x.client}</strong></>,
    meta: x.followUpAppointmentDate ? `Next meeting ${fmtDisplayDate(x.followUpAppointmentDate)}` : `Met ${fmtDisplayDate(x.appointmentDate)}`,
    // Opens its card on Follow-up (notes, next meeting, intake).
    action: { label: 'Open', run: () => onNavigate('followup', { view: 'needs', open: x.id }) },
  }));
  // Intake forms that need a nudge: sent 3+ days ago and not filled in, or
  // made and never sent (over an hour ago). One row; Send again opens the
  // oldest, See all opens Follow-up.
  const nudge = intakes
    .filter(c => c.status !== 'submitted' && intakeShown(c) && apptOf(c) && (c.sent_at
      ? nowMs - new Date(c.sent_at).getTime() >= 3 * 864e5 && nowMs - new Date(c.sent_at).getTime() < 30 * 864e5
      : c.created_at && nowMs - new Date(c.created_at).getTime() >= 36e5 && nowMs - new Date(c.created_at).getTime() < 30 * 864e5))
    .sort((x, y) => new Date(x.sent_at || x.created_at) - new Date(y.sent_at || y.created_at));
  if (nudge.length) {
    const c = nudge[0];
    later.push({
      key: 'intake-nudge', Icon: FileText, tone: 'amber',
      title: nudge.length === 1
        ? (c.sent_at ? <>Nudge <strong>{c.client_name}</strong> about the intake form</> : <>Send <strong>{c.client_name}</strong> the intake form</>)
        : <>Nudge <strong>{nudge.length} clients</strong> about their intake forms</>,
      meta: nudge.length === 1
        ? (c.sent_at ? `${intakeStatusText(c)} · not filled in yet` : `Link made ${dayWord(c.created_at)}, not sent yet`)
        : `${nudge.slice(0, 2).map(x => x.client_name).join(', ')}${nudge.length > 2 ? ` and ${nudge.length - 2} more` : ''}`,
      action: { label: c.sent_at ? 'Send again' : 'Send it', run: () => openIntakeSend({ appointment: apptOf(c), candidate: c }) },
      more: nudge.length > 1 ? { label: 'See all', run: () => onNavigate('followup', 'sent') } : null,
      onHide: () => nudge.forEach(x => hideIntake(x.id)),
    });
  }
  const staleCount = prospects.filter(x => isStaleProspect(x, booked)).length;
  if (staleCount) later.push({
    key: 'stale', Icon: Users, tone: 'amber',
    title: <>Reconnect with {staleCount} quiet prospect{staleCount === 1 ? '' : 's'}</>,
    meta: `No appointment in ${STALE_PROSPECT_DAYS}+ days since you added them`,
    action: { label: 'See them', run: () => onNavigate('systems', 'stale') },
  });

  // ---- month goals + productivity (unchanged math) ------------------
  const ratingPct = expectedByNow > 0 ? Math.round((setThisWeek / expectedByNow) * 100) : 0;
  const newcomer = day != null && day <= 14;
  const rating = ratingPct >= 100 ? { label: 'On pace', cls: 'green' }
    : newcomer ? { label: 'Getting started', cls: 'none' }
    : ratingPct >= 70 ? { label: 'Close to pace', cls: 'amber' }
    : { label: 'Behind pace', cls: 'rust' };
  const weekBarPct = Math.min(100, Math.round((setThisWeek / WEEKLY_TOTAL_TARGET) * 100));
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate();
  const prospectsThisMonth = prospects.filter(x => x.createdAt && fmtDate(new Date(x.createdAt)).slice(0, 7) === monthPrefix).length;
  const salesThisMonth = appointments.filter(x => x.officiallySold && (x.appointmentDate || '').slice(0, 7) === monthPrefix).length;
  const pct = (d, g) => (g > 0 ? Math.min(100, Math.round((d / g) * 100)) : 0);
  const goalNote = (d, g) => (d >= g ? 'Goal reached for the month' : `${g - d} more in the ${daysLeft === 0 ? 'last day' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}`);

  const weekAppts = appointments
    .filter(x => apptLocalDate(x) >= weekStart && apptLocalDate(x) <= weekEnd && apptLocalDate(x) > today)
    .sort((x, y) => apptStartMs(x) - apptStartMs(y));
  const byDay = [];
  weekAppts.forEach(x => {
    const d = apptLocalDate(x);
    const last = byDay[byDay.length - 1];
    if (last && last.date === d) last.items.push(x); else byDay.push({ date: d, items: [x] });
  });

  // ---- Do next: needs you, then today's to-dos, then licensing ------
  // Signed up with just a first name: ask once for the last name too.
  const nameTask = (user.displayName || '').trim().split(/\s+/).filter(Boolean).length < 2 ? {
    key: 'lastname', Icon: Pencil, tone: 'brass',
    title: <>Add your last name</>,
    meta: 'So your team can tell you apart. You can also tap your name at the top.',
    action: { label: 'Add', run: () => window.dispatchEvent(new CustomEvent('paceledger:open-account', { detail: { focus: 'name' } })) },
  } : null;
  const doNext = [...needs.promos, ...open, ...(needs.licensing ? [needs.licensing] : []), ...(nameTask ? [nameTask] : [])];
  // Only the first thing gets the gold button; the rest are plain.
  const firstPrimaryKey = (doNext.find(t => t.primary && t.action) || {}).key;
  const leftCount = doNext.length;
  const allClear = leftCount === 0;
  const summary = allClear ? 'All done for today. Nice work.'
    : `${leftCount} thing${leftCount === 1 ? '' : 's'}${doneCount ? ` · ${doneCount} done today` : ''}`;

  // ---- the four tiles ------------------------------------------------
  const pay = computePaycheck({ appointments: appointments.filter(x => x.userId === user.id), tierKey: user.hierarchyTier, plan, today });
  const money = n => `$${Math.round(Math.max(0, n || 0)).toLocaleString('en-US')}`;
  const nextUp = comingUp.find(x => apptStartMs(x) >= nowMs) || comingUp[0];
  const tiles = [
    { key: 'pace', Icon: Activity, label: 'Pace this week', value: `${ratingPct}%`, tone: rating.cls,
      sub: newcomer && ratingPct < 100 ? `${setThisWeek} set · building up` : `${setThisWeek} of ${WEEKLY_TOTAL_TARGET}${weekShort > 0 ? ` · ${weekShort} to catch up` : ' · on pace'}` },
    pay.rate > 0
      ? { key: 'paycheck', Icon: Wallet, label: `Paycheck · ${now.toLocaleDateString('en-US', { month: 'long' })}`, value: money(pay.est), tone: pay.goal && pay.est >= pay.goal ? 'green' : '',
        sub: pay.goal ? (pay.est >= pay.goal ? 'Goal hit · estimate' : `${pay.goalPct}% of goal · estimate`) : 'estimate' }
      : { key: 'paycheck', Icon: Wallet, label: 'Premium this month', value: money(pay.premium), tone: '',
        sub: pay.next ? `${money(pay.nextEst)} at ${pay.next.name}` : 'target premium' },
    goals
      ? { key: 'goals', Icon: Target, label: `${now.toLocaleDateString('en-US', { month: 'long' })} goals`, value: `${salesThisMonth} / ${goals.sales}`, tone: salesThisMonth >= goals.sales ? 'green' : '',
        sub: `sales · ${prospectsThisMonth} of ${goals.prospects} prospects` }
      : { key: 'goals', Icon: Target, label: 'Monthly goals', value: '—', tone: '', sub: 'Set them in Business Plan' },
    { key: 'week', Icon: CalendarDays, label: 'Today', value: String(todaysAppts.length), tone: '',
      sub: nextUp ? `appointment${todaysAppts.length === 1 ? '' : 's'} · next ${apptClock(nextUp)}` : `appointment${todaysAppts.length === 1 ? '' : 's'} · ${weekAppts.length} more this week` },
  ];

  // ---- More this week -----------------------------------------------
  const reschedCount = later.filter(t => t.key.startsWith('rs-')).length;
  const followCount = later.filter(t => t.key.startsWith('fu-')).length;
  const weekBits = [
    reschedCount ? `${reschedCount} to reschedule` : '',
    followCount ? `${followCount} follow-up${followCount === 1 ? '' : 's'}` : '',
    staleCount ? `${staleCount} quiet prospect${staleCount === 1 ? '' : 's'}` : '',
    weekAppts.length ? `${weekAppts.length} appointment${weekAppts.length === 1 ? '' : 's'} later this week` : '',
  ].filter(Boolean);

  function tileDetail(key) {
    if (key === 'pace') {
      return (
        <div className="tr-card">
          <div className="tr-row-head">
            <h3 className="tr-h3" style={{ margin: 0 }}>This week's pace</h3>
            <span className={`tr-status tr-status-${rating.cls}`}>{rating.label}</span>
          </div>
          <p className="tr-empty" style={{ margin: '8px 0 10px' }}>
            {newcomer && ratingPct < 100
              ? `${setThisWeek} set this week. The team standard is ${WEEKLY_TOTAL_TARGET} a week; build up to it.`
              : `${setThisWeek} set vs. ${expectedByNow} expected by today${weekShort > 0 ? ` — ${weekShort} to catch up` : ''}.`}
          </p>
          <div className="tr-ov-bar"><div className="tr-ov-bar-fill" style={{ width: `${weekBarPct}%` }} /></div>
          <p className="tr-empty" style={{ margin: '6px 0 0' }}>{setThisWeek} of {WEEKLY_TOTAL_TARGET} for the week{presentingThisWeek ? ` · includes ${presentingThisWeek} you're presenting for your team` : ''}</p>
        </div>
      );
    }
    if (key === 'paycheck') return <PaycheckCard user={user} appointments={appointments} plan={plan} onNavigate={onNavigate} />;
    if (key === 'goals') {
      return (
        <div className="tr-card">
          <h3 className="tr-h3">This month's goals</h3>
          {goals ? (
            <>
              <div className="tr-ov-goal">
                <div className="tr-ov-goal-head"><span>Prospects added</span><span className="tr-mono">{prospectsThisMonth} / {goals.prospects}</span></div>
                <div className="tr-ov-bar"><div className="tr-ov-bar-fill" style={{ width: `${pct(prospectsThisMonth, goals.prospects)}%` }} /></div>
                <div className="tr-ov-goal-note">{goalNote(prospectsThisMonth, goals.prospects)}</div>
              </div>
              <div className="tr-ov-goal">
                <div className="tr-ov-goal-head"><span>Sales closed</span><span className="tr-mono">{salesThisMonth} / {goals.sales}</span></div>
                <div className="tr-ov-bar"><div className="tr-ov-bar-fill tr-ov-bar-fill-alt" style={{ width: `${pct(salesThisMonth, goals.sales)}%` }} /></div>
                <div className="tr-ov-goal-note">{goalNote(salesThisMonth, goals.sales)}</div>
              </div>
              <button type="button" className="tr-ov-link" onClick={() => onNavigate('bizplan')}>Targets come from your Business Plan →</button>
            </>
          ) : (
            <>
              <p className="tr-empty">Fill in your Business Plan expenses to get monthly prospecting and sales targets here.</p>
              <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => onNavigate('bizplan')}>Open Business Plan</button>
            </>
          )}
        </div>
      );
    }
    return (
      <div className="tr-card">
        <div className="tr-row-head">
          <h3 className="tr-h3" style={{ margin: 0 }}>Later this week</h3>
          <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => onNavigate('mine')}>View all</button>
        </div>
        {byDay.length === 0 ? (
          <p className="tr-empty" style={{ marginTop: 10 }}>Nothing else booked this week yet.</p>
        ) : byDay.map(group => (
          <div key={group.date} className="tr-ov-day">
            <div className="tr-ov-day-label">{fmtDisplayDate(group.date)}</div>
            {group.items.map(x => (
              <button type="button" className="tr-ov-row tr-ov-row-open" key={x.id} onClick={() => openAppointment(x)}>
                <span className="tr-ov-time">{apptClock(x)}<span className="tr-time-end">to {apptEndClock(x)}</span></span>
                <span className="tr-ov-row-main">
                  <strong>{x.client}</strong>
                  {typeLabel(x) ? <span className="tr-empty"> · {typeLabel(x)}</span> : null}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="tr-today">
      <div className="tr-ov-hello">
        <div>
          <h2 className="tr-h2" style={{ margin: 0 }}>{greetingFor(now)}{firstName ? `, ${firstName}` : ''}</h2>
          <p className="tr-empty" style={{ margin: '2px 0 0' }}>{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>
      <AnnouncementToday user={user} />

      {flash && <div className="tr-flash" role="status">{flash}</div>}
      <RemindersPrompt />
      {showOnboarding && <FirstThirtyDays result={onboarding} day={day} onGo={goStep} onHide={hideOnboarding} />}

      <div className="tr-tiles" role="group" aria-label="Your numbers">
        {tiles.map(t => (
          <button key={t.key} type="button" className={`tr-tile ${openTile === t.key ? 'tr-tile-on' : ''}`} aria-expanded={openTile === t.key}
            onClick={() => setOpenTile(openTile === t.key ? null : t.key)}>
            <span className="tr-tile-label"><t.Icon size={14} aria-hidden="true" /> {t.label}<span className="tr-tile-chev" aria-hidden="true">{openTile === t.key ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span></span>
            <span className={`tr-tile-value ${t.tone ? `tr-tile-${t.tone}` : ''}`}>{t.value}</span>
            <span className="tr-tile-sub">{t.sub}</span>
          </button>
        ))}
      </div>
      {openTile && (
        <div className="tr-tile-detail">
          {tileDetail(openTile)}
          <button type="button" className="tr-icon-btn tr-tile-close" onClick={() => setOpenTile(null)} aria-label="Close"><X size={15} /></button>
        </div>
      )}

      <div className="tr-today-grid">
        <section className="tr-card tr-today-plan" aria-labelledby="tr-plan-title">
          <div className="tr-plan-head">
            <h3 className="tr-plan-title" id="tr-plan-title">Do next</h3>
            <span className="tr-plan-sub">{summary}</span>
          </div>

          {[{ label: 'Coming up today', list: comingUp, now: true }, { label: `Tomorrow · ${new Date(`${tomorrow}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })}`, list: tomorrowAppts, now: false }]
            .filter(sec => sec.list.length > 0).map(sec => (
            <div className="tr-plan-section" key={sec.label}>
              <h4 className="tr-plan-label">{sec.label}</h4>
              <ul className="tr-dayagenda">
                {sec.list.map(x => {
                  const soon = sec.now ? startsInLabel(apptStartMs(x)) : null;
                  const mine = x.userId === user.id;
                  return (
                    <li key={x.id} className={`tr-dayagenda-row ${soon ? 'tr-dayagenda-soon' : ''}`}>
                      {/* Tap it to open it: edit yours, see the details of the ones you're on. */}
                      <button type="button" className="tr-dayagenda-open" onClick={() => openAppointment(x)}>
                        <span className="tr-dayagenda-time">{apptClock(x)}<span className="tr-time-end">to {apptEndClock(x)}</span></span>
                        <span className="tr-dayagenda-main">
                          <strong>{x.client}</strong>{typeLabel(x) ? <span className="tr-empty"> · {typeLabel(x)}</span> : null}
                          <span className="tr-dayagenda-meta">
                            {mine ? (x.presenter ? `with ${x.presenter}` : 'Your appointment') : x.presenterId === user.id ? "You're presenting" : "You're training on this one"}
                            {soon ? <span className="tr-dayagenda-badge">{soon}</span> : null}
                          </span>
                        </span>
                      </button>
                      {(x.zoomUrl && sec.now) || x.clientPhone ? (
                        <span className="tr-dayagenda-acts">
                          {x.clientPhone ? (
                            <>
                              <CallButton phone={x.clientPhone} compact />
                              <TextButton phone={x.clientPhone} name={x.client} texts={appointmentTexts(x, user.displayName)} compact />
                            </>
                          ) : null}
                          {x.zoomUrl && sec.now ? <a className={`tr-btn tr-btn-sm ${soon ? 'tr-btn-brass' : 'tr-btn-ghost'}`} href={x.zoomUrl} target="_blank" rel="noreferrer"><Video size={14} /> Join</a> : null}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div className="tr-plan-section">
            <h4 className="tr-plan-label">To do</h4>
            {allClear ? (
              <div className="tr-plan-clear">
                <Sparkles size={18} />
                <div>
                  <strong>You're caught up.</strong>
                  <p>Want to get ahead? Book tomorrow's appointments or add a few more names.</p>
                </div>
              </div>
            ) : (
              <ul className="tr-tasks">
                {doNext.map(t => (
                  <TodayTask key={t.key} task={t.primary && t.key !== firstPrimaryKey ? { ...t, primary: false } : t}>
                    {t.callList ? (
                      callList.length > 0 ? (showCallList && (
                        <div className="tr-calllist">
                          <div className="tr-calllist-head">Best people to call</div>
                          {callList.map(p => (
                            <div className="tr-calllist-row" key={p.id}>
                              <div className="tr-calllist-who">
                                <span className="tr-calllist-name">{p.firstName} {p.lastName}</span>
                                <span className={`tr-calllist-lean tr-calllist-${prospectLeaningKey(p)}`}>{prospectTotalChecked(p) > 0 ? `${LEANING_LABELS[prospectLeaningKey(p)]} · ${prospectTotalChecked(p)}/9` : 'Not scored'}</span>
                              </div>
                              <div className="tr-calllist-acts">
                                {p.phone ? (
                                  <>
                                    <CallButton phone={p.phone} compact />
                                    <TextButton phone={p.phone} name={`${p.firstName} ${p.lastName}`} texts={prospectTexts(p.firstName, user.displayName)} compact />
                                  </>
                                ) : numberFor !== p.id ? (
                                  <button type="button" className="tr-link-btn tr-calllist-addnum" onClick={() => openNumber(p)}><Plus size={13} aria-hidden="true" /> Add number</button>
                                ) : null}
                                <button type="button" className="tr-btn tr-btn-ghost tr-btn-xs" onClick={() => onNavigate('mine', { prefill: prospectToAppointmentPrefill(p) })}>Book</button>
                              </div>
                              {numberFor === p.id ? (
                                <form className="tr-calllist-number" onSubmit={e => saveNumber(e, p)}>
                                  <input type="tel" inputMode="tel" autoComplete="off" autoFocus aria-label={`Phone number for ${p.firstName} ${p.lastName}`} placeholder="Phone number"
                                    className={numberErr ? 'tr-input-bad' : ''} value={numberDraft} onChange={e => { setNumberDraft(e.target.value); setNumberErr(''); }} />
                                  <button type="submit" className="tr-btn tr-btn-ghost tr-btn-xs" disabled={numberBusy}>{numberBusy ? 'Saving…' : 'Save'}</button>
                                  <button type="button" className="tr-link-btn" onClick={() => setNumberFor(null)}>Cancel</button>
                                  {numberErr ? <div className="tr-error">{numberErr}</div> : null}
                                </form>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )) : (
                        <p className="tr-task-hint">{prospects.length === 0 ? 'Add names to your list first. You need people to call.' : "Everyone on your list is booked. Add more names below."}</p>
                      )
                    ) : null}
                    {t.quickAdd ? (
                      <form className="tr-task-quick" onSubmit={handleQuickAdd}>
                        <input aria-label="First name" placeholder="First name" value={quickFirst} onChange={e => setQuickFirst(e.target.value)} autoComplete="off" />
                        <input aria-label="Last name" placeholder="Last name" value={quickLast} onChange={e => setQuickLast(e.target.value)} autoComplete="off" />
                        <button type="submit" className="tr-btn tr-btn-ghost tr-btn-sm" disabled={quickBusy}>{quickBusy ? 'Adding…' : 'Add'}</button>
                        <button type="button" className="tr-task-link" onClick={() => onNavigate('systems', 'jogger')}>Need ideas?</button>
                        {quickErr ? <div className="tr-error tr-task-quick-err">{quickErr}</div> : null}
                      </form>
                    ) : null}
                  </TodayTask>
                ))}
              </ul>
            )}
          </div>

          {(weekBits.length > 0 || doneTasks.length > 0) && (
            <div className="tr-plan-section tr-folds">
              {weekBits.length > 0 && (
                <div className={`tr-fold ${showMoreWeek ? 'tr-fold-open' : ''}`}>
                  <button type="button" className="tr-fold-head" aria-expanded={showMoreWeek} onClick={() => setShowMoreWeek(v => !v)}>
                    <ListIcon size={16} aria-hidden="true" />
                    <span className="tr-fold-text"><strong>More this week</strong><span>{weekBits.join(' · ')}</span></span>
                    {showMoreWeek ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {showMoreWeek && (
                    <div className="tr-fold-body">
                      {later.length > 0 && <ul className="tr-tasks tr-tasks-later">{later.map(t => <TodayTask key={t.key} task={t} />)}</ul>}
                      {byDay.length > 0 && (
                        <div className="tr-fold-week">
                          <div className="tr-plan-label">Later this week</div>
                          {byDay.map(group => (
                            <div key={group.date} className="tr-ov-day">
                              <div className="tr-ov-day-label">{fmtDisplayDate(group.date)}</div>
                              {group.items.map(x => (
                                <button type="button" className="tr-ov-row tr-ov-row-open" key={x.id} onClick={() => openAppointment(x)}>
                                  <span className="tr-ov-time">{apptClock(x)}<span className="tr-time-end">to {apptEndClock(x)}</span></span>
                                  <span className="tr-ov-row-main"><strong>{x.client}</strong>{typeLabel(x) ? <span className="tr-empty"> · {typeLabel(x)}</span> : null}</span>
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {doneTasks.length > 0 && (
                <div className={`tr-fold ${showDone ? 'tr-fold-open' : ''}`}>
                  <button type="button" className="tr-fold-head" aria-expanded={showDone} onClick={() => setShowDone(v => !v)}>
                    <CheckCircle2 size={16} aria-hidden="true" />
                    <span className="tr-fold-text"><strong>{doneCount} done today</strong><span>{setToday} set · {namesToday} name{namesToday === 1 ? '' : 's'} added · {loggedToday.length} outcome{loggedToday.length === 1 ? '' : 's'} logged</span></span>
                    {showDone ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {showDone && <div className="tr-fold-body"><ul className="tr-tasks tr-tasks-done">{doneTasks.map(t => <TodayTask key={t.key} task={t} />)}</ul></div>}
                </div>
              )}
            </div>
          )}
        </section>

        <div className="tr-today-side">
          <TeamWinsSection user={user} compact />
        </div>
      </div>

      {modalTarget && (
        <FollowUpModal appointment={modalTarget} saving={modalSaving} onClose={() => setModalTarget(null)} onSave={handleSaveOutcome} onRescheduled={handleRescheduled}
          onEdit={() => { const x = modalTarget; setModalTarget(null); openAppointment(x); }} />
      )}
      {presentedTarget && (
        <FollowUpModal appointment={presentedTarget} presenter setByName={presentedTarget.setByName} saving={modalSaving} onClose={() => setPresentedTarget(null)} onSave={handlePresentedSave} />
      )}
    </div>
  );
}
