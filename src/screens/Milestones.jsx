// Pieces of Growth (My work → Growth): your level and path, progress to the next level, the promotion ladder, licensing tracker and incentives.
import { useCallback, useEffect, useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import { addBusinessDays, contractingInApp, daysBetween, examWhen, fetchLicensingProgress, LICENSING_STEPS, licensingStatus, saveLicensingProgress, US_STATES, WRITING_NUMBER_BUSINESS_DAYS } from '../licensing.js';
import { computeDownline, computeReadiness, computeTierProgress, HIERARCHY_TIER_WINDOW_LABELS, HIERARCHY_TIERS, isLicensed, nextTierAfter } from '../hierarchy.js';
import { fmtShortDate, todayStr, weekStartOf } from '../lib/dates.js';
import { DATE_SET_OPTIONS, getStatus, WEEKLY_TOTAL_TARGET } from '../lib/pace.js';
import { closestDirect, milestoneSummary, progressPct, tierInfo } from '../lib/milestones.js';
import { bodyName, bodyScale, CelestialBody, CelestialDefs, JourneyStrip, makeStars, PaceRing, ringRadius } from '../components/CelestialBody.jsx';
import { GapCallout, NextLevel } from '../components/milestones.jsx';
import { lowerFirst } from '../lib/format.js';
import { fetchAppointmentsAsTrainee, fetchAppointmentsForUserIds, fetchAppointmentsImPresenting, fetchMyAppointments } from '../data/appointments.js';
import { fetchHierarchyPeople, fetchMyLicensing, saveLicensing } from '../data/team.js';
import { PageHead, RefreshButton, SkeletonCards } from '../components/ui.jsx';
import { AgreementHistory, AgreementSheet, ContractingFormSheet, contractingChanged, useMyContracting } from '../components/contracting.jsx';
import { askConfirm } from '../components/confirm.jsx';
import { contractingWords, withdrawContractingInfo } from '../data/contracting.js';
import { agentStage, fmtDay, fmtWhen } from '../lib/contracting.js';

// The career ladder: one rung per tier, top of the ladder first. Rungs
// already reached are marked done, your current one is highlighted, and the
// rest show what it takes to get there.
export function TierLadder({ currentTierKey }) {
  const currentIdx = HIERARCHY_TIERS.findIndex(t => t.key === currentTierKey);
  const rungs = HIERARCHY_TIERS.map((tier, i) => ({ tier, i })).reverse();
  return (
    <ol className="tr-card tr-ladder" aria-label="Promotion ladder">
      {rungs.map(({ tier, i }) => {
        const state = currentIdx === -1 ? 'ahead' : i < currentIdx ? 'done' : i === currentIdx ? 'current' : i === currentIdx + 1 ? 'next' : 'ahead';
        return (
          <li key={tier.key} className={`tr-rung tr-rung-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="tr-rung-node" aria-hidden="true">{state === 'done' ? <Check size={13} strokeWidth={3} /> : null}</span>
            <div className="tr-rung-body">
              <div className="tr-rung-head">
                <span className="tr-rung-name">{tier.name} <span className="tr-rung-abbr">{tier.key}</span></span>
                {state === 'current' ? <span className="tr-status tr-status-amber">You are here</span> : state === 'next' ? <span className="tr-status tr-status-none">Next</span> : null}
                <span className="tr-rung-pct">{tier.commission}%</span>
              </div>
              {tier.criteria.length === 0 ? (
                <div className="tr-rung-meta">Automatically assigned at sign-up.</div>
              ) : state !== 'done' ? (
                <>
                  <div className="tr-rung-meta">{HIERARCHY_TIER_WINDOW_LABELS[tier.window]}</div>
                  <ul className="tr-rung-criteria">{tier.criteria.map((c, k) => <li key={k}>{c}</li>)}</ul>
                </>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function RequirementRow({ req }) {
  if (req.kind === 'status') {
    return (
      <div className="tr-req-row">
        <span className="tr-req-label">{req.label}</span>
        <span className={`tr-type-badge ${req.met ? 'tr-type-badge-both' : ''}`}>{req.met ? '✓ Done' : 'Not yet'}</span>
      </div>
    );
  }
  if (req.kind === 'count' || req.kind === 'money') {
    const isMoney = req.kind === 'money';
    const pct = Math.min(100, (req.current / req.target) * 100);
    return (
      <div className="tr-req-row tr-req-row-bar">
        <div className="tr-req-head">
          <span className="tr-req-label">{req.label}</span>
          <span className="tr-req-nums">{isMoney ? `$${req.current.toLocaleString()} / $${req.target.toLocaleString()}` : `${req.current} / ${req.target}`}</span>
        </div>
        <div className="tr-req-track"><div className={`tr-req-bar ${req.met ? 'tr-req-bar-met' : ''}`} style={{ width: `${Math.max(pct, req.current > 0 ? 4 : 0)}%` }} /></div>
      </div>
    );
  }
  if (req.kind === 'money-consecutive') {
    return (
      <div className="tr-req-row tr-req-row-bar">
        <div className="tr-req-head">
          <span className="tr-req-label">{req.label} — 2 consecutive months at ${req.target.toLocaleString()}+</span>
        </div>
        <div className="tr-req-months">
          {req.months.map(m => (
            <div key={`${m.year}-${m.month}`} className={`tr-req-month ${m.met ? 'tr-req-month-met' : ''} ${m.applicable === false ? 'tr-req-month-na' : ''}`}>
              <span className="tr-req-month-label">{m.label}{m.isCurrent ? ' (so far)' : ''}</span>
              <span className="tr-req-month-sum">{m.applicable === false ? 'Before promotion' : `$${m.sum.toLocaleString()}`}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
}

// My path: your own level drawn as its body, this week's pace ring, the
// people in your orbit, and the whole journey from comet to galaxy.
const HERO_STARS = makeStars(46, 400, 170, 3);
const LEVEL_KEYS = HIERARCHY_TIERS.map(t => t.key);
export function MyPathHero({ tierKey, pace, moons }) {
  const tier = tierInfo(tierKey);
  if (!tier) return null;
  const r = 30 * bodyScale(tier.key);
  const ringR = ringRadius(tier.key, r);
  const article = /^[AEIOU]/.test(tier.name) ? 'an' : 'a';
  return (
    <div className="tr-path-hero">
      <CelestialDefs />
      <svg className="tr-path-hero-stars" viewBox="0 0 400 170" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {HERO_STARS.map((st, i) => <circle key={i} cx={st.x} cy={st.y} r={st.r * 0.8} fill="#fff" opacity={st.o * 0.8} />)}
      </svg>
      <div className="tr-path-hero-top">
        <svg className="tr-path-hero-body" viewBox="-62 -62 124 124" aria-hidden="true">
          <CelestialBody tier={tier.key} r={r} />
          <PaceRing r={ringR} done={pace.total} target={WEEKLY_TOTAL_TARGET} status={pace.status} width={3.4} />
          {Array.from({ length: Math.min(6, moons) }, (_, m) => {
            const a = (m / Math.min(6, moons)) * Math.PI * 2 - Math.PI / 4;
            return <circle key={m} cx={Math.cos(a) * (ringR + 9)} cy={Math.sin(a) * (ringR + 9)} r="3.4" fill="#C9D6E3" />;
          })}
        </svg>
        <div>
          <div className="tr-path-hero-k">You're {article}</div>
          <div className="tr-path-hero-h">{tier.name}</div>
          <div className="tr-path-hero-s">{bodyName(tier.key)} · {tier.commission}% commission</div>
          <div className={`tr-path-hero-p tr-path-hero-p-${pace.status}`}>{pace.total}/{WEEKLY_TOTAL_TARGET} this week{moons ? ` · ${moons} in your orbit` : ''}</div>
        </div>
      </div>
      <JourneyStrip tiers={LEVEL_KEYS} current={tier.key} />
    </div>
  );
}

export function MyProgressCard({ user }) {
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(null);
  const [summary, setSummary] = useState(null);
  const [hero, setHero] = useState(null); // { pace, moons }
  const [notSet, setNotSet] = useState(false);
  const [atTop, setAtTop] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [orgDirectory, licensing, myAppts, traineeAppts, licProgress, presenting] = await Promise.all([
      fetchHierarchyPeople(),
      fetchMyLicensing(user.id),
      fetchMyAppointments(user.id),
      fetchAppointmentsAsTrainee(user.id),
      fetchLicensingProgress(user.id),
      fetchAppointmentsImPresenting(user.id).catch(() => []),
    ]);
    const person = { ...(orgDirectory.find(p => p.id === user.id) || { id: user.id, manager_id: null }), hierarchy_tier: user.hierarchyTier, ...licensing };
    // This week's pace and the people who report to you, for My path.
    const week = weekStartOf(todayStr());
    // Pace counts the ones you set plus the ones you're presenting for your team.
    const thisWeek = [...myAppts, ...presenting].filter(a => a.weekOf === week && !a.isFollowUp);
    const counts = DATE_SET_OPTIONS.map(opt => thisWeek.filter(a => a.dateSetOption === opt.value).length);
    const directs = orgDirectory.filter(p => p.manager_id === user.id);
    setHero({ pace: { total: counts.reduce((x, y) => x + y, 0), status: getStatus(counts, week) }, moons: directs.length });
    if (!person.hierarchy_tier) { setNotSet(true); setAtTop(false); setProgress(null); setSummary(null); setLoading(false); return; }
    if (!nextTierAfter(person.hierarchy_tier)) { setAtTop(true); setNotSet(false); setProgress(null); setSummary(null); setLoading(false); return; }
    const downline = computeDownline(user.id, orgDirectory).filter(p => p.id !== user.id);
    const downlineAppts = await fetchAppointmentsForUserIds(downline.map(p => p.id));
    setNotSet(false); setAtTop(false);
    const mine = computeTierProgress(person, orgDirectory, myAppts, downlineAppts, traineeAppts);
    // How close each person who reports to you is, for "Closest: …".
    const sold = [...myAppts, ...downlineAppts].filter(a => a.officiallySold);
    const directPct = new Map(computeReadiness(orgDirectory, sold, directs.map(d => d.id)).map(x => [x.member.id, progressPct(x.progress)]));
    setProgress(mine);
    setSummary(milestoneSummary(person, mine, {
      licensing: licProgress && licProgress.error ? null : licensingStatus(licProgress, person),
      closestFor: tierKey => closestDirect(directs, tierKey, id => directPct.get(id) ?? null),
    }));
    setLoading(false);
  }, [user.id, user.hierarchyTier]);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading) return <SkeletonCards count={2} />;
  const heroEl = hero && user.hierarchyTier ? <MyPathHero tierKey={user.hierarchyTier} pace={hero.pace} moons={hero.moons} /> : null;
  if (notSet) {
    return <div className="tr-card"><p className="tr-empty">Your hierarchy tier hasn't been set yet — ask a super admin to set it in Manage Team.</p></div>;
  }
  if (atTop) {
    return <>{heroEl}<div className="tr-card"><p className="tr-empty">You've reached the top of the ladder — Executive Vice Chairman.</p></div></>;
  }
  if (!progress) return heroEl;

  return (
    <>
      {heroEl}
      <div className="tr-card tr-progress-card">
        <div className="tr-row-head" style={{ marginBottom: 2 }}>
          <h3 className="tr-h3" style={{ margin: 0 }}>Your progress toward {progress.nextTier.name} ({progress.nextTier.key})</h3>
          <RefreshButton onClick={refresh} />
        </div>
        <p className="tr-subtitle" style={{ margin: '2px 0 12px' }}>{HIERARCHY_TIER_WINDOW_LABELS[progress.nextTier.window]}</p>
        {summary ? <div className="tr-progress-summary"><NextLevel summary={summary} /></div> : null}
        {progress.results.map((req, i) => <RequirementRow key={i} req={req} />)}
        <GapCallout summary={summary} />
      </div>
    </>
  );
}

export function IncentivesBody() {
  return (
    <>
      <PageHead title="Incentives" />
      <div className="tr-card"><p className="tr-empty">Coming soon.</p></div>
    </>
  );
}

export function LicensingTracker({ user, profile }) {
  const inApp = contractingInApp();
  const [ct, reloadCt] = useMyContracting(user, inApp);
  const [sheet, setSheet] = useState(null); // 'agreement' | 'form'
  const [progress, setProgress] = useState(undefined);
  const [provider, setProvider] = useState('');
  const [examDate, setExamDate] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const loadProgress = useCallback(() => fetchLicensingProgress(user.id).then(r => {
    const row = r && !r.error ? r : null;
    setProgress(row);
    setProvider((row && row.course_provider) || '');
    setExamDate((row && row.exam_on) || '');
  }), [user.id]);
  useEffect(() => {
    loadProgress();
    window.addEventListener('paceledger:contracting-changed', loadProgress);
    return () => window.removeEventListener('paceledger:contracting-changed', loadProgress);
  }, [loadProgress]);
  if (progress === undefined || (inApp && !ct)) return <SkeletonCards count={1} />;
  const stage = inApp ? agentStage({ agreements: ct.agreements, kase: ct.kase, settings: ct.settings, writingNumber: profile.fg_writing_number }) : '';
  const raw = progress || {};
  // Got an InsuraCloud link but never submitted there: the agreement step
  // starts over here, so it isn't shown as done.
  const movedHere = inApp && stage === 'sign' && !!raw.contracting_sent_on && !raw.profile_submitted_on;
  const p = movedHere ? { ...raw, contracting_sent_on: null } : raw;
  const st = licensingStatus(p, profile);
  const today = todayStr();
  const joinedDays = user.createdAt ? daysBetween(user.createdAt, new Date()) + 1 : null;

  async function save(key, patch) {
    setBusy(key); setError('');
    const res = await saveLicensingProgress(user.id, patch);
    setBusy('');
    if (!res.ok) { setError("That didn't save. Check your connection and try again."); return; }
    setProgress(prev => ({ ...(prev || {}), ...res.row }));
    window.dispatchEvent(new Event('paceledger:onboarding-changed'));
  }
  function scrollToNumbers() {
    const el = document.getElementById('tr-license-numbers');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const derived = k => ((k === 'course' || k === 'courseDone' || k === 'examBooked' || k === 'examPassed') && (st.done.npn || st.licensed))
    || ((k === 'insuracloud' || k === 'profileSubmitted') && (st.licensed || inApp));
  // Contracting in PaceLedger: where they are, from what they've actually done.
  const kase = (ct && ct.kase) || {};
  const signedAgreement = inApp ? (ct.agreements || []).find(a => a.status === 'completed') : null;
  async function withdraw() {
    if (!(await askConfirm({ title: 'Withdraw your contracting info?', body: "It's deleted from PaceLedger right away. You can send it again any time.", confirmLabel: 'Withdraw and delete', danger: true }))) return;
    setBusy('withdraw'); setError('');
    const res = await withdrawContractingInfo();
    setBusy('');
    if (!res.ok) { setError(contractingWords(res.error)); return; }
    contractingChanged();
  }
  // Started contracting in InsuraCloud before it moved here.
  const viaInsuraCloud = inApp && !signedAgreement && !!p.profile_submitted_on && !kase.info_sent_at;
  function contractingDetail(key) {
    if (key === 'insuracloud') {
      if (signedAgreement) return <span>Signed {fmtDay(signedAgreement.agent_signed_at)} · countersigned {fmtDay(signedAgreement.countersigned_at)}</span>;
      if (stage === 'countersign') return <span><strong>Signed.</strong> Waiting for BIG to countersign; your contracting form opens right after.</span>;
      if (viaInsuraCloud) return <span>Done in InsuraCloud{p.contracting_sent_on ? ` ${fmtShortDate(p.contracting_sent_on)}` : ''}.</span>;
      if (movedHere) return <span>Contracting moved from InsuraCloud into PaceLedger. Sign your producer agreement here: about 3 minutes. Then you'll send your info here too.</span>;
      return <span>Sign it right here: about 3 minutes. Your name, email and today's date are filled in for you.</span>;
    }
    if (key === 'profileSubmitted') {
      if (viaInsuraCloud) return <span>Submitted in InsuraCloud {fmtShortDate(p.profile_submitted_on)}.</span>;
      if (stage === 'waiting') return <span>Sent {fmtWhen(kase.info_sent_at)}. BIG is entering it in SureLC; it's deleted from PaceLedger by <strong>{fmtWhen(kase.expires_at)}</strong> at the latest.</span>;
      if (kase.entered_at && kase.delete_reason === 'entered') return <span>Sent {fmtDay(kase.info_sent_at)} · entered in SureLC and deleted from PaceLedger {fmtDay(kase.entered_at)}.</span>;
      if (kase.delete_reason === 'expired') return <span>Your info was deleted 72 hours after you sent it, before BIG got to it. Please send it again.</span>;
      if (!signedAgreement) return <span>Opens once BIG countersigns your producer agreement.</span>;
      if (ct.settings && ct.settings.paused) return <span>BIG paused the form for a moment. Check back soon.</span>;
      return <span>Social Security number, banking, driver's license, E&amp;O, AML and background questions. Encrypted on your device; deleted from PaceLedger once BIG enters it in SureLC, and after 72 hours at most.</span>;
    }
    if (key === 'appointed') {
      if (st.done.appointed) return <span>On file</span>;
      if (viaInsuraCloud && numberDue) return <span>Usually arrives within {WRITING_NUMBER_BUSINESS_DAYS} business days of your profile, so by <strong>{fmtShortDate(numberDue)}</strong>. Add it below when it comes.</span>;
      if (stage === 'entered') return <span>BIG entered your info in SureLC. Watch your email for a link from SureLC to review and sign.</span>;
      if (stage === 'review') return <span><strong>Check your email:</strong> SureLC sent you a link to review and sign. Nothing goes to a carrier until you do.</span>;
      if (stage === 'carrier') return <span>You signed in SureLC. BIG is sending it to the carrier.</span>;
      if (stage === 'number') return <span>Sent to the carrier {fmtDay(kase.sent_to_carrier_at)}. Add your writing number below when it arrives.</span>;
      return <span>Comes after you review and sign in SureLC and BIG sends it to the carrier. Add it below.</span>;
    }
    return null;
  }
  function contractingAction(key, isNext) {
    if (key === 'insuracloud' && stage === 'sign' && isNext) {
      return <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={() => setSheet('agreement')}>Sign your agreement</button>;
    }
    if (key === 'profileSubmitted' && stage === 'send' && isNext && !(ct.settings && ct.settings.paused)) {
      return <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={() => setSheet('form')}>Fill out the form</button>;
    }
    if (key === 'profileSubmitted' && stage === 'waiting') {
      return <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm tr-ct-withdraw" disabled={busy === 'withdraw'} onClick={withdraw}>Withdraw my info</button>;
    }
    return null;
  }
  const numberDue = p.profile_submitted_on ? addBusinessDays(p.profile_submitted_on, WRITING_NUMBER_BUSINESS_DAYS) : null;

  function detail(step) {
    if (inApp && (step.key === 'insuracloud' || step.key === 'profileSubmitted' || step.key === 'appointed')) return contractingDetail(step.key);
    switch (step.key) {
      case 'course':
        return st.done.course
          ? <span>{p.course_started_on ? `Started ${fmtShortDate(p.course_started_on)}` : 'Done'}{p.course_provider ? ` · ${p.course_provider}` : ''}</span>
          : <span>Your state requires a pre-licensing course before the exam. Your upline can tell you which one the team uses.</span>;
      case 'courseDone':
        return st.done.courseDone
          ? <span>{p.course_completed_on ? `Finished ${fmtShortDate(p.course_completed_on)}` : 'Done'}</span>
          : <span>Keep your course certificate: you'll need it to book the exam.</span>;
      case 'examBooked':
        return p.exam_on && !st.done.examPassed
          ? <span><strong>Exam {fmtShortDate(p.exam_on)}</strong> · {examWhen(p.exam_on)}</span>
          : st.done.examBooked ? <span>{p.exam_on ? `Booked for ${fmtShortDate(p.exam_on)}` : 'Done'}</span>
          : <span>Book it with your state's testing provider, then add the date here.</span>;
      case 'examPassed':
        return st.done.examPassed
          ? <span>{p.exam_passed_on ? `Passed ${fmtShortDate(p.exam_passed_on)} 🎉` : 'Done'}{p.exam_attempts ? ` · after ${p.exam_attempts + 1} attempts` : ''}</span>
          : p.exam_attempts > 0 ? <span>Attempt {p.exam_attempts + 1}. Lots of people pass on a retake: book your next date above.</span>
          : <span>Mark it here as soon as you get your result.</span>;
      case 'npn':
        return st.done.npn ? <span>On file</span> : <span>Your state sends this once your license is issued. Add it in the form below.</span>;
      case 'insuracloud':
        return st.done.insuracloud
          ? <span>{p.contracting_sent_on ? `Sent ${fmtShortDate(p.contracting_sent_on)}` : 'Done'}</span>
          : <span>Once you have your NPN, your manager sends you a link to InsuraCloud, our contracting hub. Tell them when your NPN is in.</span>;
      case 'profileSubmitted':
        return st.done.profileSubmitted
          ? <span>{p.profile_submitted_on ? `Submitted ${fmtShortDate(p.profile_submitted_on)}` : 'Done'}</span>
          : <span>Open the InsuraCloud link, fill in your profile and submit it.</span>;
      case 'appointed':
        return st.done.appointed ? <span>On file</span>
          : numberDue ? <span>Usually arrives within {WRITING_NUMBER_BUSINESS_DAYS} business days of your profile, so by <strong>{fmtShortDate(numberDue)}</strong>. Add it below when it comes.</span>
          : <span>Arrives within {WRITING_NUMBER_BUSINESS_DAYS} business days of submitting your InsuraCloud profile. Add it below.</span>;
      default: return null;
    }
  }
  function action(step, isNext) {
    const k = step.key;
    if (inApp && (k === 'insuracloud' || k === 'profileSubmitted')) return contractingAction(k, isNext);
    if (st.done[k]) {
      // Only the latest finished step can be undone (to fix a mis-tap).
      if (derived(k) || k === 'npn' || k === 'appointed' || LICENSING_STEPS.indexOf(step) !== st.nextIndex - 1) return null;
      const undo = {
        course: { course_started_on: null },
        courseDone: { course_completed_on: null },
        examBooked: { exam_on: null },
        examPassed: { exam_passed_on: null },
        insuracloud: { contracting_sent_on: null },
        profileSubmitted: { profile_submitted_on: null },
      }[k];
      return <button type="button" className="tr-link-btn" disabled={busy === k} onClick={() => { if (k === 'examBooked') setExamDate(''); save(k, undo); }}>Undo</button>;
    }
    if (!isNext && k !== 'examBooked') return null;
    switch (k) {
      case 'course':
        return (
          <div className="tr-lic-inline">
            <input value={provider} onChange={e => setProvider(e.target.value)} placeholder="Course provider (optional)" aria-label="Course provider" maxLength={80} />
            <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" disabled={busy === k} onClick={() => save(k, { course_provider: provider.trim() || null, course_started_on: today })}>I've started</button>
          </div>
        );
      case 'courseDone':
        return <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" disabled={busy === k} onClick={() => save(k, { course_completed_on: today, course_started_on: p.course_started_on || today })}>Mark finished</button>;
      case 'examBooked':
        if (!isNext && !(p.exam_attempts > 0 && !p.exam_on)) return null;
        return (
          <div className="tr-lic-inline">
            <input type="date" value={examDate} min={today} onChange={e => setExamDate(e.target.value)} aria-label="Exam date" />
            <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" disabled={!examDate || busy === k} onClick={() => save(k, { exam_on: examDate })}>Save date</button>
          </div>
        );
      case 'examPassed':
        return (
          <div className="tr-lic-inline">
            <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" disabled={busy === k} onClick={() => save(k, { exam_passed_on: today })}>I passed!</button>
            <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" disabled={busy === k} onClick={() => { setExamDate(''); save(k, { exam_attempts: (p.exam_attempts || 0) + 1, exam_on: null }); }}>Didn't pass this time</button>
          </div>
        );
      case 'insuracloud':
        return <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" disabled={busy === k} onClick={() => save(k, { contracting_sent_on: today })}>I got the link</button>;
      case 'profileSubmitted':
        return <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" disabled={busy === k} onClick={() => save(k, { profile_submitted_on: today, contracting_sent_on: p.contracting_sent_on || today })}>I submitted it</button>;
      case 'npn':
      case 'appointed':
        return <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={scrollToNumbers}>Add it below</button>;
      default: return null;
    }
  }

  return (
    <>
    <div className="tr-card tr-lic-card">
      <div className="tr-row-head" style={{ marginBottom: 4 }}>
        <h3 className="tr-h3" style={{ margin: 0 }}>Your path to licensed</h3>
        <span className={`tr-lic-count ${st.licensed ? 'tr-lic-count-done' : ''}`}>{st.doneCount} of {st.total}</span>
      </div>
      <div className="tr-lic-bar" aria-hidden="true"><div style={{ width: `${(st.doneCount / st.total) * 100}%` }} /></div>
      <p className="tr-subtitle" style={{ margin: '8px 0 12px' }}>
        {st.licensed
          ? <>You're licensed and appointed.{profile.licensed_at && user.createdAt ? ` It took ${daysBetween(user.createdAt, profile.licensed_at)} days from joining.` : ''} Promotion's next: see Promotion Guidelines.</>
          : <>{joinedDays ? `Day ${joinedDays} since you joined. ` : ''}Next: <strong>{lowerFirst(st.next.title)}</strong>. Your upline can see this, so they know when to help.</>}
      </p>
      <label className="tr-field tr-lic-state">
        <span>Your resident state</span>
        <select value={p.resident_state || ''} disabled={busy === 'state'} onChange={e => save('state', { resident_state: e.target.value || null })}>
          <option value="">Choose your state</option>
          {US_STATES.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
      </label>
      <ol className="tr-lic-steps">
        {LICENSING_STEPS.map((step, i) => {
          const done = st.done[step.key];
          const isNext = !done && i === st.nextIndex;
          return (
            <li key={step.key} className={`tr-lic-step ${done ? 'tr-lic-done' : isNext ? 'tr-lic-next' : 'tr-lic-later'}`}>
              <span className="tr-lic-dot" aria-hidden="true">{done ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
              <div className="tr-lic-main">
                <div className="tr-lic-title">{step.title}{done ? <span className="tr-sr-only"> (done)</span> : null}</div>
                <div className="tr-lic-detail">{detail(step)}</div>
                {action(step, isNext)}
              </div>
            </li>
          );
        })}
      </ol>
      {error && <div className="tr-error" style={{ marginTop: 8 }}>{error}</div>}
    </div>
    {inApp ? <AgreementHistory agreements={ct.agreements} /> : null}
    {sheet === 'agreement' ? <AgreementSheet onClose={() => { setSheet(null); reloadCt(); loadProgress(); }} /> : null}
    {sheet === 'form' ? <ContractingFormSheet user={user} settings={ct.settings} onClose={() => setSheet(null)} onSent={() => { setSheet(null); reloadCt(); loadProgress(); }} /> : null}
    </>
  );
}

export function LicensingBody({ user }) {
  const [savedNpn, setSavedNpn] = useState('');
  const [savedFgNumber, setSavedFgNumber] = useState('');
  const [savedLicensedAt, setSavedLicensedAt] = useState(null);
  const [npn, setNpn] = useState('');
  const [fgNumber, setFgNumber] = useState('');
  const [editing, setEditing] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = () => fetchMyLicensing(user.id).then(data => {
      const n = data.npn || '', f = data.fg_writing_number || '';
      setSavedNpn(n); setSavedFgNumber(f); setSavedLicensedAt(data.licensed_at || null);
      setNpn(n); setFgNumber(f);
      setEditing(!(n && f)); // only start locked if already fully licensed
      setLoaded(true);
    });
    load();
    // Numbers can also be changed from Your account (tap your name).
    window.addEventListener('paceledger:profile-changed', load);
    return () => window.removeEventListener('paceledger:profile-changed', load);
  }, [user.id]);

  async function save() {
    setSaving(true); setError('');
    const res = await saveLicensing(user.id, npn, fgNumber);
    setSaving(false);
    if (!res.ok) { setError(res.error || 'Could not save. Try again.'); return; }
    setSavedNpn(npn.trim()); setSavedFgNumber(fgNumber.trim());
    if (npn.trim() && fgNumber.trim() && !savedLicensedAt) setSavedLicensedAt(new Date().toISOString());
    setEditing(false); // lock once saved — matches what's now actually on file
    window.dispatchEvent(new Event('paceledger:onboarding-changed'));
  }
  function cancelEdit() {
    setNpn(savedNpn); setFgNumber(savedFgNumber);
    setError('');
    setEditing(!(savedNpn && savedFgNumber));
  }
  function startEdit() {
    setError('');
    setEditing(true);
  }

  // Based on what's actually saved, not whatever's currently typed —
  // the badge shouldn't flip on before Save locks it in.
  const licensed = isLicensed({ npn: savedNpn, fg_writing_number: savedFgNumber });

  return (
    <>
      <PageHead title="Licensing" sub="You can start right away, even before you're licensed. Track each step here, and add your numbers once you have them." />
      {loaded && <LicensingTracker user={user} profile={{ npn: savedNpn, fg_writing_number: savedFgNumber, licensed_at: savedLicensedAt }} />}
      {!loaded ? <SkeletonCards count={1} /> : (
        <div className="tr-card" id="tr-license-numbers" style={{ marginTop: 14 }}>
          <div className="tr-row-head" style={{ marginBottom: 14 }}>
            <h3 className="tr-h3" style={{ margin: 0 }}>Your license and writing numbers</h3>
            {licensed && <span className="tr-type-badge tr-type-badge-both">✓ Licensed</span>}
          </div>
          {editing ? (
            <>
              <div className="tr-form-grid">
                <label className="tr-field">
                  <span>National Producer Number (NPN)</span>
                  <input value={npn} onChange={e => setNpn(e.target.value)} placeholder="e.g. 1234567" />
                </label>
                <label className="tr-field">
                  <span>Fidelity &amp; Guaranty (F&amp;G) Writing Number</span>
                  <input value={fgNumber} onChange={e => setFgNumber(e.target.value)} placeholder="Your F&G writing number" />
                </label>
              </div>
              {!isLicensed({ npn, fg_writing_number: fgNumber }) && (
                <p className="tr-note" style={{ marginTop: 4 }}>Both fields need to be filled in to count as licensed.</p>
              )}
              {error && <div className="tr-error">{error}</div>}
              <div className="tr-form-actions">
                {savedNpn && savedFgNumber && (
                  <button type="button" className="tr-btn tr-btn-ghost" onClick={cancelEdit}>Cancel</button>
                )}
                <button type="button" className="tr-btn tr-btn-brass" onClick={save} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="tr-form-grid">
                <div className="tr-field">
                  <span>National Producer Number (NPN)</span>
                  <div className="tr-locked-value">{savedNpn}</div>
                </div>
                <div className="tr-field">
                  <span>Fidelity &amp; Guaranty (F&amp;G) Writing Number</span>
                  <div className="tr-locked-value">{savedFgNumber}</div>
                </div>
              </div>
              <div className="tr-form-actions">
                <button type="button" className="tr-btn tr-btn-ghost" onClick={startEdit}><Pencil size={14} /> Edit</button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
