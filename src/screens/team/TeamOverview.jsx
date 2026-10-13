// Team Overview: a leader's first screen. Four numbers, who needs you this
// week (ranked, one action each), wins to recognize, and a small view of
// your galaxy.
import { useCallback, useEffect, useState } from 'react';
import { Award, BadgeCheck, CalendarX, DollarSign, GraduationCap, Network, PartyPopper, Rocket, TrendingUp, UserPlus, Users } from 'lucide-react';
import { examWhen, fetchLicensingForUsers, licensingStatus } from '../../licensing.js';
import { buildChildrenMap, computeReadiness, downlineIds } from '../../hierarchy.js';
import { fetchTeamOnboarding, onboardingDay, onboardingStepTitle, onboardingStepWeek } from '../../onboarding.js';
import { DATE_SET_OPTIONS, defaultDateSetOption, getStatus, WEEKLY_TOTAL_TARGET } from '../../lib/pace.js';
import { addDays, fmtDate, fmtShortDate, parseDate, shiftWeekStr, todayStr, weekStartOf } from '../../lib/dates.js';
import { shortMoney, tierInfo } from '../../lib/milestones.js';
import { fetchAppointmentsForWeek } from '../../data/appointments.js';
import { fetchHierarchyPeople, fetchRecentSoldAppointments, promotionSubjects } from '../../data/team.js';
import { bodyScale, CelestialBody, CelestialDefs, makeStars, PaceRing, ringRadius } from '../../components/CelestialBody.jsx';
import { PageHead, SkelBlock } from '../../components/ui.jsx';

const DAY = 864e5;
const daysSince = iso => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : null);
const firstName = name => (name || '').trim().split(/\s+/)[0] || '';
const mailto = (email, subject, body) => `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
const GALAXY_STARS = makeStars(40, 300, 220, 11);

function paceFor(list, weekMonday) {
  const counts = DATE_SET_OPTIONS.map(opt => list.filter(a => a.dateSetOption === opt.value).length);
  return { total: counts.reduce((x, y) => x + y, 0), status: getStatus(counts, weekMonday) };
}

// Everything on the screen, worked out from one load. Pure, so it's easy
// to check: people, this and last week's appointments, recent sales,
// promotion progress, licensing and First 30 days rows.
export function buildTeamOverview({ user, people, thisWeek, lastWeek, sold, progress, licensingRows, onboardingRows, now = new Date() }) {
  const isAdmin = user.role === 'super_admin';
  const children = buildChildrenMap(people);
  const teamIds = new Set(isAdmin ? people.map(p => p.id) : downlineIds(user.id, children));
  teamIds.delete(user.id);
  const team = people.filter(p => teamIds.has(p.id));
  const weekMonday = weekStartOf(todayStr());
  const todayIdx = DATE_SET_OPTIONS.findIndex(o => o.value === defaultDateSetOption());
  const expectedByNow = DATE_SET_OPTIONS.slice(0, todayIdx + 1).reduce((s, o) => s + o.target, 0);
  const counted = list => list.filter(a => !a.isFollowUp);
  const pace = new Map(team.map(p => [p.id, paceFor(counted(thisWeek).filter(a => a.userId === p.id), weekMonday)]));
  const lastTotal = new Map(team.map(p => [p.id, counted(lastWeek).filter(a => a.userId === p.id).length]));
  const lic = new Map(team.map(p => [p.id, { st: licensingStatus(licensingRows.get(p.id), p), row: licensingRows.get(p.id) || null }]));
  const readyList = progress.filter(x => teamIds.has(x.member.id) && x.progress && x.progress.allMet);
  // Licensing alerts are for people still at UA (or with no level yet):
  // anyone at FA or above has already been licensed to get there.
  const needsLicense = p => p.role !== 'super_admin' && (!p.hierarchy_tier || p.hierarchy_tier === 'UA') && !lic.get(p.id).st.licensed;

  // ---- the four numbers --------------------------------------------
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const onPace = team.filter(p => pace.get(p.id).status === 'met').length;
  const quiet = team.filter(p => pace.get(p.id).total === 0 && lastTotal.get(p.id) === 0 && (daysSince(p.created_at) ?? 99) >= 7);
  const behind = team.filter(p => pace.get(p.id).status !== 'met' && pace.get(p.id).total > 0 && pace.get(p.id).total < expectedByNow * 0.7);
  const unlicensed = team.filter(needsLicense);
  const stuck = unlicensed.filter(p => {
    const row = lic.get(p.id).row;
    const last = row && row.updated_at ? row.updated_at : p.created_at;
    return (daysSince(p.created_at) ?? 0) >= 14 && (daysSince(last) ?? 0) >= 14;
  });
  const weekEndIso = shiftWeekStr(weekMonday, 1);
  const examsSoon = unlicensed.filter(p => {
    const r = lic.get(p.id).row;
    if (!r || !r.exam_on || r.exam_passed_on) return false;
    const d = Math.round((new Date(`${r.exam_on}T00:00:00`).getTime() - new Date(`${todayStr()}T00:00:00`).getTime()) / DAY);
    return d >= 0 && d <= 7;
  });
  const tiles = [
    { key: 'people', Icon: Users, label: 'People', value: String(team.length), sub: `${team.filter(p => new Date(p.created_at).getTime() >= monthStart).length} joined this month` },
    { key: 'pace', Icon: TrendingUp, label: 'On pace this week', value: `${onPace} of ${team.length}`, sub: [behind.length ? `${behind.length} behind` : '', quiet.length ? `${quiet.length} quiet` : ''].filter(Boolean).join(' · ') || 'No one far behind' },
    { key: 'ready', Icon: Award, label: 'Ready for promotion', value: String(readyList.length), sub: readyList.length ? readyList.slice(0, 2).map(x => `${firstName(x.member.display_name)} → ${x.progress.nextTier.key}`).join(', ') + (readyList.length > 2 ? '…' : '') : 'No one yet', brass: readyList.length > 0, go: 'teampromo' },
    { key: 'lic', Icon: GraduationCap, label: 'Not licensed yet', value: String(unlicensed.length), sub: [stuck.length ? `${stuck.length} stuck` : '', examsSoon.length ? `${examsSoon.length} exam${examsSoon.length === 1 ? '' : 's'} this week` : ''].filter(Boolean).join(' · ') || (unlicensed.length ? 'Everyone moving' : 'Everyone is licensed'), go: 'licensing' },
  ];

  // ---- who needs you, most important first --------------------------
  const needs = [];
  readyList.forEach(x => needs.push({
    key: `ready-${x.member.id}`, Icon: Award, tone: 'brass', person: x.member,
    text: <><strong>{x.member.display_name}</strong> met every requirement for <strong>{x.progress.nextTier.name}</strong></>,
    sub: x.progress.results.map(r => r.label.replace(/ \(last 30 days\)$/, '')).join(' · '),
    action: { label: isAdmin ? 'Review & approve' : 'Review', go: 'teampromo', primary: true },
  }));
  examsSoon.forEach(p => {
    const r = lic.get(p.id).row;
    needs.push({
      key: `exam-${p.id}`, Icon: GraduationCap, tone: 'blue', person: p,
      text: <><strong>{p.display_name}</strong>'s licensing exam is {examWhen(r.exam_on)}</>,
      sub: `${fmtShortDate(r.exam_on)} · a quick good-luck message goes a long way`,
      action: p.email ? { label: 'Email', href: mailto(p.email, 'Good luck on your exam', `Hi ${firstName(p.display_name)},\n\nGood luck on your licensing exam. You've got this!\n\n${user.displayName || ''}`) } : { label: 'Licensing', go: 'licensing' },
    });
  });
  stuck.forEach(p => {
    const { st, row } = lic.get(p.id);
    const idle = daysSince(row && row.updated_at ? row.updated_at : p.created_at);
    needs.push({
      key: `stuck-${p.id}`, Icon: GraduationCap, tone: 'rust', person: p,
      text: <><strong>{p.display_name}</strong> is stuck in licensing</>,
      sub: `No progress in ${idle} days · step ${st.nextIndex + 1} of ${st.total}: ${st.next ? st.next.title.toLowerCase() : ''}`,
      action: p.email ? { label: 'Email', href: mailto(p.email, 'Checking in on licensing', `Hi ${firstName(p.display_name)},\n\nHow's licensing going? Anything I can help with to get you to the next step?\n\n${user.displayName || ''}`) } : { label: 'Licensing', go: 'licensing' },
    });
  });
  quiet.forEach(p => needs.push({
    key: `quiet-${p.id}`, Icon: CalendarX, tone: 'rust', person: p,
    text: <><strong>{p.display_name}</strong> has gone quiet</>,
    sub: 'Nothing set this week or last',
    action: p.email ? { label: 'Email', href: mailto(p.email, 'Checking in', `Hi ${firstName(p.display_name)},\n\nHaven't seen any appointments from you in a couple of weeks. Everything OK? Let's get a plan together.\n\n${user.displayName || ''}`) } : { label: 'See pace', go: 'pace' },
  }));
  const obById = new Map((onboardingRows || []).map(r => [r.user_id, r]));
  team.filter(p => { const d = onboardingDay(p.created_at); return d != null && d <= 30; }).forEach(p => {
    const d = onboardingDay(p.created_at);
    const r = obById.get(p.id);
    const real = r && r.total_count > 0 ? r : null;
    if (real && real.done_count >= real.total_count) return;
    const wk = real && real.next_step ? onboardingStepWeek(real.next_step) : null;
    const isBehind = !real || (wk && d > wk.days[1]);
    if (!isBehind) return;
    needs.push({
      key: `f30-${p.id}`, Icon: Rocket, tone: 'blue', person: p,
      text: <><strong>{p.display_name}</strong> is on day {d} of First 30 days</>,
      sub: real ? `Behind · next: ${onboardingStepTitle(real.next_step)}` : "Hasn't started the checklist yet",
      action: { label: 'Coach', go: 'pace' },
    });
  });
  const quietIds = new Set(quiet.map(p => p.id));
  const behindOnly = behind.filter(p => !quietIds.has(p.id));
  if (behindOnly.length) needs.push({
    key: 'behind', Icon: TrendingUp, tone: 'amber',
    text: <><strong>{behindOnly.length} {behindOnly.length === 1 ? 'person is' : 'people are'}</strong> behind pace this week</>,
    sub: behindOnly.slice(0, 4).map(p => `${firstName(p.display_name)} ${pace.get(p.id).total}/${WEEKLY_TOTAL_TARGET}`).join(' · ') + (behindOnly.length > 4 ? ' …' : ''),
    action: { label: 'See pace', go: 'pace' },
  });

  // ---- wins this week ------------------------------------------------
  const weekStartMs = new Date(`${weekMonday}T00:00:00`).getTime();
  const inWeek = iso => !!iso && new Date(iso).getTime() >= weekStartMs;
  const wins = [];
  team.filter(p => inWeek(p.hierarchy_tier_changed_at) && p.hierarchy_tier).forEach(p => wins.push({
    key: `promo-${p.id}`, Icon: Award, person: p, text: <><strong>{p.display_name}</strong> was promoted to {(tierInfo(p.hierarchy_tier) || {}).name || p.hierarchy_tier}</>,
    congrats: `Congratulations on your promotion to ${(tierInfo(p.hierarchy_tier) || {}).name || p.hierarchy_tier}!`,
  }));
  team.filter(p => inWeek(p.licensed_at)).forEach(p => wins.push({
    key: `lic-${p.id}`, Icon: BadgeCheck, person: p, text: <><strong>{p.display_name}</strong> is now licensed</>, congrats: 'Congratulations on getting licensed!',
  }));
  const salesBy = new Map();
  sold.filter(a => teamIds.has(a.userId) && a.appointmentDate >= weekMonday && a.appointmentDate < weekEndIso).forEach(a => {
    const cur = salesBy.get(a.userId) || { n: 0, premium: 0 };
    cur.n += 1; cur.premium += Number(a.targetPremium) || 0;
    salesBy.set(a.userId, cur);
  });
  [...salesBy.entries()].sort((a, b) => b[1].premium - a[1].premium).forEach(([id, v]) => {
    const p = people.find(x => x.id === id);
    if (p) wins.push({ key: `sale-${id}`, Icon: DollarSign, person: p, text: <><strong>{p.display_name}</strong> closed {v.n === 1 ? 'a sale' : `${v.n} sales`}{v.premium ? ` · ${shortMoney(v.premium)}` : ''}</>, congrats: v.n === 1 ? 'Congrats on the sale this week!' : `Congrats on ${v.n} sales this week!` });
  });
  team.filter(p => pace.get(p.id).total >= WEEKLY_TOTAL_TARGET).forEach(p => wins.push({
    key: `pace-${p.id}`, Icon: TrendingUp, person: p, text: <><strong>{p.display_name}</strong> hit {pace.get(p.id).total} of {WEEKLY_TOTAL_TARGET} this week</>, congrats: `${pace.get(p.id).total} appointments set this week. That's the standard. Great work!`,
  }));
  team.filter(p => inWeek(p.created_at)).forEach(p => wins.push({
    key: `join-${p.id}`, Icon: UserPlus, person: p, text: <><strong>{p.display_name}</strong> joined the team</>, congrats: 'Welcome to the team!',
  }));

  // ---- galaxy: you at the centre, the people who report to you around you
  const centre = isAdmin ? null : people.find(p => p.id === user.id) || null;
  const orbit = (isAdmin ? people.filter(p => !p.manager_id || !people.some(x => x.id === p.manager_id)) : (children.get(user.id) || []))
    .filter(p => p.id !== user.id).slice(0, 12);
  return { team, tiles, needs, wins, centre, orbit, pace, children, expectedByNow };
}

function GalaxyPreview({ centre, orbit, pace, children, onOpen }) {
  const C = { x: 150, y: 110 };
  const rx = 112, ry = 78;
  return (
    <button type="button" className="tr-tov-galaxy" onClick={onOpen} aria-label="Open the org chart">
      <svg viewBox="0 0 300 220" role="img" aria-hidden="true">
        {GALAXY_STARS.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r * 0.8} fill="#fff" opacity={s.o * 0.8} />)}
        <ellipse cx={C.x} cy={C.y} rx={rx} ry={ry} fill="none" stroke="rgba(255,255,255,0.16)" strokeDasharray="3 6" />
        <circle cx={C.x} cy={C.y} r="46" fill="url(#tr-tov-glow)" />
        <defs><radialGradient id="tr-tov-glow" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#F2C866" stopOpacity="0.35" /><stop offset="100%" stopColor="#F2C866" stopOpacity="0" /></radialGradient></defs>
        {centre ? <CelestialBody tier={centre.hierarchy_tier} r={20 * bodyScale(centre.hierarchy_tier)} cx={C.x} cy={C.y} /> : <CelestialBody tier="SFD" r={18} cx={C.x} cy={C.y} />}
        {orbit.map((p, i) => {
          const a = (i / orbit.length) * Math.PI * 2 - Math.PI / 2;
          const x = C.x + Math.cos(a) * rx, y = C.y + Math.sin(a) * ry;
          const r = 8 * bodyScale(p.hierarchy_tier);
          const st = pace.get(p.id) || { total: 0, status: 'progress' };
          const moons = Math.min(4, (children.get(p.id) || []).length);
          const rr = ringRadius(p.hierarchy_tier, r);
          return (
            <g key={p.id}>
              <CelestialBody tier={p.hierarchy_tier} r={r} cx={x} cy={y} faded={st.total === 0} />
              {st.total > 0 && <PaceRing cx={x} cy={y} r={rr} done={st.total} target={WEEKLY_TOTAL_TARGET} status={st.status} width={2} />}
              {Array.from({ length: moons }, (_, m) => {
                const ma = (m / moons) * Math.PI * 2 - Math.PI / 4;
                return <circle key={m} cx={x + Math.cos(ma) * (rr + 6)} cy={y + Math.sin(ma) * (rr + 6)} r="1.8" fill="#C9D6E3" />;
              })}
            </g>
          );
        })}
      </svg>
    </button>
  );
}

export function TeamOverviewBody({ user, onNavigate }) {
  const [state, setState] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const load = useCallback(async () => {
    const week = weekStartOf(todayStr());
    const [people, thisWeek, lastWeek, sold] = await Promise.all([
      fetchHierarchyPeople(), fetchAppointmentsForWeek(week), fetchAppointmentsForWeek(shiftWeekStr(week, -1)), fetchRecentSoldAppointments(),
    ]);
    const subjects = promotionSubjects(user, people);
    const progress = computeReadiness(people, sold, subjects);
    const others = subjects.filter(id => id !== user.id);
    const recent = people.filter(p => others.includes(p.id) && (onboardingDay(p.created_at) ?? 99) <= 30).map(p => p.id);
    const [licensingRows, onboardingRows] = await Promise.all([fetchLicensingForUsers(others), fetchTeamOnboarding(recent)]);
    setState(buildTeamOverview({ user, people, thisWeek, lastWeek, sold, progress, licensingRows, onboardingRows: onboardingRows || [] }));
  }, [user.id, user.role]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  function act(a) {
    if (a.go === 'teampromo') onNavigate('teampromo');
    else if (a.go === 'licensing') onNavigate('pace', 'licensing');
    else if (a.go === 'pace') onNavigate('pace');
    else if (a.go === 'org') onNavigate('org');
  }
  const wk = weekStartOf(todayStr());
  const md = d => parseDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const head = <PageHead title="Team overview" sub={`Week of ${md(wk)} – ${md(fmtDate(addDays(parseDate(wk), 6)))}${state ? ` · ${state.team.length} ${state.team.length === 1 ? 'person' : 'people'} on your team` : ''}`}>
    <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => { setState(null); load(); }}>Refresh</button>
  </PageHead>;

  if (!state) {
    return <div className="tr-tov">{head}<div className="tr-tov-tiles">{[0, 1, 2, 3].map(i => <SkelBlock key={i} w="100%" h="92px" />)}</div><SkelBlock w="100%" h="320px" /></div>;
  }
  if (!state.team.length) {
    return <div className="tr-tov">{head}<div className="tr-card"><p className="tr-empty">No one on your team yet. Use <strong>+ New → Invite a recruit</strong> to send someone their sign-up link.</p></div></div>;
  }
  const NEEDS_LIMIT = 6, WINS_LIMIT = 6;
  const needsShown = showAll ? state.needs : state.needs.slice(0, NEEDS_LIMIT);
  return (
    <div className="tr-tov">
      <CelestialDefs />
      {head}
      <div className="tr-tov-tiles">
        {state.tiles.map(t => {
          const Tag = t.go ? 'button' : 'div';
          return (
            <Tag key={t.key} type={t.go ? 'button' : undefined} className={`tr-card tr-tov-tile ${t.brass ? 'tr-tov-tile-brass' : ''} ${t.go ? 'tr-tov-tile-link' : ''}`} onClick={t.go ? () => act({ go: t.go }) : undefined}>
              <span className="tr-tov-tile-label"><t.Icon size={14} /> {t.label}</span>
              <span className="tr-tov-tile-value">{t.value}</span>
              <span className="tr-tov-tile-sub">{t.sub}</span>
            </Tag>
          );
        })}
      </div>
      <div className="tr-tov-cols">
        <section className="tr-card tr-tov-box" aria-labelledby="tr-tov-needs">
          <div className="tr-tov-box-head"><h3 id="tr-tov-needs">Needs you this week</h3><span>{state.needs.length ? `${state.needs.length} · most important first` : ''}</span></div>
          {state.needs.length === 0 ? (
            <p className="tr-empty tr-tov-clear"><PartyPopper size={16} /> Nothing urgent. Your team is moving.</p>
          ) : (
            <ul className="tr-tov-list">
              {needsShown.map(n => (
                <li key={n.key}>
                  <span className={`tr-needs-icon tr-needs-icon-${n.tone}`} aria-hidden="true"><n.Icon size={16} /></span>
                  <div className="tr-tov-text"><div>{n.text}</div>{n.sub ? <div className="tr-tov-sub">{n.sub}</div> : null}</div>
                  {n.action.href
                    ? <a className="tr-btn tr-btn-ghost tr-btn-sm" href={n.action.href}>{n.action.label}</a>
                    : <button type="button" className={`tr-btn tr-btn-sm ${n.action.primary ? 'tr-btn-brass' : 'tr-btn-ghost'}`} onClick={() => act(n.action)}>{n.action.label}</button>}
                </li>
              ))}
            </ul>
          )}
          {state.needs.length > NEEDS_LIMIT && (
            <button type="button" className="tr-task-link tr-plan-more" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show fewer' : `Show all ${state.needs.length}`}</button>
          )}
        </section>
        <div className="tr-tov-side">
          <section className="tr-card tr-tov-box">
            <div className="tr-tov-box-head"><h3>Your galaxy</h3><button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => onNavigate('org')}><Network size={14} /> Open org chart</button></div>
            <GalaxyPreview centre={state.centre} orbit={state.orbit} pace={state.pace} children={state.children} onOpen={() => onNavigate('org')} />
          </section>
          <section className="tr-card tr-tov-box" aria-labelledby="tr-tov-wins">
            <div className="tr-tov-box-head"><h3 id="tr-tov-wins">Wins this week</h3></div>
            {state.wins.length === 0 ? <p className="tr-empty">No wins logged yet this week. They show up here as they happen.</p> : (
              <ul className="tr-tov-list tr-tov-wins">
                {state.wins.slice(0, WINS_LIMIT).map(w => (
                  <li key={w.key}>
                    <span className="tr-tov-win-icon" aria-hidden="true"><w.Icon size={15} /></span>
                    <div className="tr-tov-text"><div>{w.text}</div></div>
                    {w.person && w.person.email ? (
                      <a className="tr-btn tr-btn-ghost tr-btn-sm" href={mailto(w.person.email, 'Congrats!', `Hi ${firstName(w.person.display_name)},\n\n${w.congrats}\n\n${user.displayName || ''}`)}><PartyPopper size={14} /> Recognize</a>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

