// Org Chart: the tree and solar system views, with milestone cards.
import React, { useCallback, useEffect, useState } from 'react';
import { Award, ChevronDown, ChevronLeft, ChevronRight, Network, Search, X } from 'lucide-react';
import { fetchLicensingForUsers, licensingStatus } from '../../licensing.js';
import { buildChildrenMap, computeReadiness, downlineIds, HIERARCHY_TIERS, hierarchyTierLabel } from '../../hierarchy.js';
import { closestDirect, milestoneSummary, progressPct } from '../../lib/milestones.js';
import { countsTowardPace, DATE_SET_OPTIONS, getStatus, WEEKLY_TOTAL_TARGET } from '../../lib/pace.js';
import { joinedDate, shiftWeekStr, todayStr, weekStartOf } from '../../lib/dates.js';
import { personInitials, shortName } from '../../lib/format.js';
import { BodyIcon, bodyName, bodyScale, CelestialBody, CelestialDefs, makeStars, PaceRing, ringRadius } from '../../components/CelestialBody.jsx';
import { fetchAppointmentsForWeek } from '../../data/appointments.js';
import { fetchHierarchyPeople, fetchRecentSoldAppointments, promotionSubjects } from '../../data/team.js';
import { RefreshButton, SkeletonTable, StatusBadge, TitleInfo, WeekNav } from '../../components/ui.jsx';
import { MilestoneCard } from './MilestoneCard.jsx';
import { Avatar, useAvatars } from '../../components/avatar.jsx';
import { isAdmin as isAdminRole, roleLabel } from '../../lib/roles.js';

// Solar system view of the org chart: the person in focus is the centre, the
// people who report to them orbit around them. Everyone is drawn as their
// level (comet up to galaxy), with a ring for this week's pace and moons for
// the people who report to them. Tap anyone for their milestone card; open a
// system to fly in, and the trail at the top goes back up.
export const SOLAR_STARS = makeStars(70, 600, 600);
const LEVEL_KEYS = HIERARCHY_TIERS.map(t => t.key);

export function SolarSystemView({ user, isAdmin, roots, byId, children, stats, readyIds, licensing, teamOf, focusId, onFocus, onOpenPromotion, summaries, weekMonday, selectRequest }) {
  const [selected, setSelected] = useState(null);
  useEffect(() => { setSelected(null); }, [focusId]);
  // Arriving from search: open that person's card (runs after the reset above).
  useEffect(() => { if (selectRequest) setSelected(selectRequest.id); }, [selectRequest]);
  // Phones draw the same picture smaller, so bodies get bigger to stay tappable.
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    if (!selected) return undefined;
    const onKey = e => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);
  const myTeam = React.useMemo(() => new Set(teamOf(user.id)), [teamOf, user.id]);
  const gap = compact ? 8 : 0;
  const top = isAdmin && roots.length !== 1 ? 'org' : (roots[0] ? roots[0].id : user.id);
  const focus = focusId || top;
  const isOrg = focus === 'org';
  const sun = isOrg ? null : byId.get(focus);
  const planetsAll = (isOrg ? roots : (children.get(focus) || [])).slice()
    .sort((a, b) => teamOf(b.id).length - teamOf(a.id).length || (a.display_name || '').localeCompare(b.display_name || ''));
  const MAX = 20;
  const planets = planetsAll.slice(0, MAX);
  const teamIds = isOrg ? [...roots.map(r => r.id), ...roots.flatMap(r => teamOf(r.id))] : teamOf(focus);
  const teamOnPace = teamIds.filter(id => (stats.get(id) || {}).status === 'met').length;
  const paceOf = id => stats.get(id) || { total: 0, status: 'progress' };
  const quietOf = id => paceOf(id).total === 0;

  // Trail from the top of what you can see down to the centre.
  const trail = [];
  if (!isOrg) {
    let cur = sun, guard = 0;
    while (cur && guard++ < 60) {
      trail.unshift(cur);
      if (cur.id === top) break;
      const up = cur.manager_id ? byId.get(cur.manager_id) : null;
      if (!up || (!isAdmin && !teamOf(top).includes(up.id) && up.id !== top)) break;
      cur = up;
    }
  }

  // Up to 8 on the inner orbit, the rest on the outer one.
  const C = 300;
  const unit = compact ? 17 : 14;
  const rings = planets.length <= 8 ? [{ r: 172, list: planets }] : [{ r: 138, list: planets.slice(0, 8) }, { r: 232, list: planets.slice(8) }];
  const placed = rings.flatMap((ring, ri) => ring.list.map((p, i) => {
    const angle = (i / ring.list.length) * Math.PI * 2 - Math.PI / 2 + (ri ? Math.PI / ring.list.length : 0);
    const size = unit * bodyScale(p.hierarchy_tier);
    return { p, x: C + Math.cos(angle) * ring.r, y: C + Math.sin(angle) * ring.r, size, ringR: ringRadius(p.hierarchy_tier, size), moons: Math.min(6, (children.get(p.id) || []).length), delay: (ri * 8 + i) * 45 };
  }));
  const sunR = (compact ? 36 : 31) * bodyScale(sun && sun.hierarchy_tier);
  const sunRing = ringRadius(sun && sun.hierarchy_tier, sunR);
  const sel = selected ? byId.get(selected) : null;
  const selPlaced = sel ? placed.find(pl => pl.p.id === sel.id) : null;
  const popSide = selPlaced && selPlaced.x > C + 20 ? 'left' : 'right';

  function progressLine(p) {
    const s = summaries.get(p.id);
    if (!s || s.state === 'unset') return 'No level set';
    if (s.state === 'top') return 'Top level';
    if (s.state === 'unknown') return s.tier.name;
    if (s.state === 'ready') return `Ready for ${s.next.key}`;
    return `${s.tier.key} → ${s.next.key} · ${s.pct}%`;
  }
  function info(p) {
    const st = paceOf(p.id);
    return `${p.display_name}${p.hierarchy_tier ? ` · ${p.hierarchy_tier}` : ''} · ${progressLine(p)} · ${st.total}/${WEEKLY_TOTAL_TARGET} this week`;
  }
  // Closest to their next level first, so you can see where a push pays off.
  const listed = planetsAll.slice().sort((a, b) => {
    const rank = p => { const s = summaries.get(p.id); return !s || s.state === 'unset' ? -3 : s.state === 'unknown' ? -2 : s.state === 'top' ? -1 : s.pct; };
    return rank(b) - rank(a) || (a.display_name || '').localeCompare(b.display_name || '');
  });

  const card = sel ? (
    <MilestoneCard
      person={sel} summary={summaries.get(sel.id) || { state: 'unset' }} pace={paceOf(sel.id)} licensing={licensing && licensing.get(sel.id)}
      quiet={quietOf(sel.id)} isYou={sel.id === user.id} canCoach={sel.id !== user.id && (isAdmin || myTeam.has(sel.id))}
      currentUser={user} weekOf={weekMonday} onClose={() => setSelected(null)}
      onReviewPromotion={onOpenPromotion}
      onOpenSystem={(children.get(sel.id) || []).length > 0 && sel.id !== focus ? () => onFocus(sel.id) : null} />
  ) : null;

  return (
    <div className="tr-solar">
      <CelestialDefs />
      <nav className="tr-solar-trail" aria-label="Where you are in the org">
        {isAdmin && roots.length !== 1 && (
          <button type="button" className={isOrg ? 'tr-solar-crumb-on' : ''} onClick={() => onFocus('org')}>Organization</button>
        )}
        {trail.map((p, i) => (
          <React.Fragment key={p.id}>
            {(i > 0 || (isAdmin && roots.length !== 1)) && <ChevronRight size={13} className="tr-solar-crumb-sep" />}
            <button type="button" className={p.id === focus ? 'tr-solar-crumb-on' : ''} onClick={() => onFocus(p.id)}>{p.display_name}</button>
          </React.Fragment>
        ))}
      </nav>

      <div className="tr-solar-space">
        <svg key={focus} viewBox="0 0 600 600" className="tr-solar-svg" role="group" aria-label={`${isOrg ? 'The organization' : `${sun ? sun.display_name : ''}'s team`}: ${planets.length} people in orbit`}
          onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}>
          <defs>
            <radialGradient id="trSunGrad" cx="40%" cy="35%" r="70%">
              <stop offset="0%" stopColor="#FFE7A3" /><stop offset="55%" stopColor="#E6B54E" /><stop offset="100%" stopColor="#B8862E" />
            </radialGradient>
            <radialGradient id="trSunGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#F2C866" stopOpacity="0.4" /><stop offset="100%" stopColor="#F2C866" stopOpacity="0" />
            </radialGradient>
          </defs>
          {SOLAR_STARS.map((st, i) => <circle key={i} cx={st.x} cy={st.y} r={st.r} fill="#fff" opacity={st.o} className="tr-solar-star" style={{ animationDelay: `${st.d}s` }} />)}
          {rings.map(ring => <circle key={ring.r} cx={C} cy={C} r={ring.r} className="tr-solar-orbit" />)}

          <g className={`tr-solar-sun ${sun ? 'tr-solar-sun-person' : ''} ${sun && selected === sun.id ? 'tr-solar-planet-on' : ''}`}
            {...(sun ? {
              role: 'button', tabIndex: 0, 'aria-label': `${info(sun)}. Show milestones`,
              onClick: () => setSelected(selected === sun.id ? null : sun.id),
              onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(selected === sun.id ? null : sun.id); } },
            } : {})}>
            <circle cx={C} cy={C} r="92" fill="url(#trSunGlow)" />
            {isOrg ? (
              <>
                <circle cx={C} cy={C} r="48" fill="url(#trSunGrad)" />
                <text x={C} y={C + 6} textAnchor="middle" className="tr-solar-sun-text" style={{ fontSize: 15 }}>Org</text>
              </>
            ) : sun ? (
              <>
                <title>{info(sun)}</title>
                <circle cx={C} cy={C} r={sunRing + 14} fill="transparent" />
                {selected === sun.id && <circle cx={C} cy={C} r={sunRing + 9} className="tr-solar-halo" />}
                <CelestialBody tier={sun.hierarchy_tier} r={sunR} cx={C} cy={C} />
                <PaceRing cx={C} cy={C} r={sunRing} done={paceOf(sun.id).total} target={WEEKLY_TOTAL_TARGET} status={paceOf(sun.id).status} width={3.5} />
                {readyIds.has(sun.id) && <circle cx={C} cy={C} r={sunRing + 6} className="tr-solar-ready" />}
                <text x={C} y={C + sunRing + 20 + gap} textAnchor="middle" className="tr-solar-label">{sun.display_name}</text>
                <text x={C} y={C + sunRing + 34 + gap * 2} textAnchor="middle" className="tr-solar-sublabel">{sun.hierarchy_tier ? `${sun.hierarchy_tier} · ` : ''}{paceOf(sun.id).total}/{WEEKLY_TOTAL_TARGET}</text>
              </>
            ) : null}
          </g>

          {placed.map(({ p, x, y, size, ringR, moons, delay }) => {
            const st = paceOf(p.id);
            const ready = readyIds.get(p.id);
            const quiet = quietOf(p.id);
            const lic = licensing && licensing.get(p.id);
            const sub = `${st.total}/${WEEKLY_TOTAL_TARGET}${ready ? ' · ready' : lic && !lic.licensed && p.role !== 'super_admin' && p.hierarchy_tier === 'UA' ? ` · lic ${lic.doneCount}/${lic.total}` : ''}`;
            return (
              <g key={p.id} className={`tr-solar-planet ${selected === p.id ? 'tr-solar-planet-on' : ''} ${quiet ? 'tr-solar-planet-quiet' : ''}`}
                style={{ transform: `translate(${x}px, ${y}px)`, animationDelay: `${delay}ms` }}
                role="button" tabIndex={0} aria-label={`${info(p)}. Show milestones`}
                onClick={() => setSelected(selected === p.id ? null : p.id)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(selected === p.id ? null : p.id); } }}>
                <title>{info(p)}</title>
                <circle r={Math.max(ringR + 12, 26)} fill="transparent" />
                {selected === p.id && <circle r={ringR + 9} className="tr-solar-halo" />}
                <CelestialBody tier={p.hierarchy_tier} r={size} faded={quiet} />
                {!quiet && <PaceRing r={ringR} done={st.total} target={WEEKLY_TOTAL_TARGET} status={st.status} width={compact ? 3.4 : 2.6} />}
                {ready && <circle r={ringR + 5} className="tr-solar-ready" />}
                {Array.from({ length: moons }, (_, m) => {
                  const a = (m / moons) * Math.PI * 2 - Math.PI / 4;
                  return <circle key={m} cx={Math.cos(a) * (ringR + 9)} cy={Math.sin(a) * (ringR + 9)} r={compact ? 3.4 : 2.6} className="tr-solar-moon" />;
                })}
                <text y={ringR + (moons ? 24 : 17) + gap} textAnchor="middle" className="tr-solar-label">{shortName(p.display_name)}</text>
                <text y={ringR + (moons ? 37 : 30) + gap * 2} textAnchor="middle" className={`tr-solar-sublabel ${ready ? 'tr-solar-sublabel-ready' : ''}`}>{sub}</text>
              </g>
            );
          })}
          {planets.length === 0 && (
            <text x={C} y={C + 120} textAnchor="middle" className="tr-solar-sublabel" style={{ fontSize: 14 }}>No one in orbit yet</text>
          )}
        </svg>

        <div className="tr-solar-legend" aria-hidden="true">
          <span><i className="tr-solar-legend-pace" /> Ring = this week's pace: green on pace, gold in progress, red behind</span>
          <span><i className="tr-solar-legend-ring" /> Ready for promotion</span>
          <span><i className="tr-solar-legend-moon" /> Moons = people who report to them</span>
          <span>Dim = nothing logged this week</span>
        </div>
        <div className="tr-solar-levels" aria-label="Levels">
          {LEVEL_KEYS.map(k => <span key={k} title={`${hierarchyTierLabel(k)}: ${bodyName(k)}`}><BodyIcon tier={k} size={22} />{k}</span>)}
        </div>

        {card && !compact && <div className={`tr-solar-pop tr-solar-pop-${popSide}`}>{card}</div>}
      </div>
      {card && compact && (
        <div className="tr-modal-backdrop tr-ms-sheet" onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div className="tr-modal-card">{card}</div>
        </div>
      )}

      <div className="tr-card tr-solar-panel">
        <div className="tr-solar-panel-head">
          <div>
            <div className="tr-solar-panel-title">{isOrg ? 'The whole organization' : sun ? `${sun.display_name}'s system` : ''}</div>
            <div className="tr-solar-panel-sub">
              {teamIds.length} {teamIds.length === 1 ? 'person' : 'people'} in this system · {teamOnPace} on pace this week{planetsAll.length > MAX ? ` · showing the ${MAX} biggest teams in orbit` : ''}
            </div>
          </div>
          {!isOrg && sun && sun.id !== top && (
            <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => onFocus(sun.manager_id && (isAdmin || teamOf(top).includes(sun.manager_id) || sun.manager_id === top) ? sun.manager_id : top)}>
              <ChevronLeft size={14} /> Up a level
            </button>
          )}
        </div>
        {listed.length > 0 && (
          <>
            <div className="tr-solar-sortnote">Closest to their next level first</div>
            <ul className="tr-solar-list">
              {listed.map(p => {
                const st = paceOf(p.id);
                const team = teamOf(p.id).length;
                const ready = readyIds.get(p.id);
                const s = summaries.get(p.id);
                const lic = licensing && licensing.get(p.id);
                return (
                  <li key={p.id} className={selected === p.id ? 'tr-solar-li-on' : ''}>
                    <BodyIcon tier={p.hierarchy_tier} size={32} faded={quietOf(p.id)} />
                    <span className="tr-solar-list-name">
                      <button type="button" className="tr-solar-name-btn" onClick={() => setSelected(p.id)} aria-label={`${p.display_name}: show milestones`}><strong>{p.display_name}</strong></button>
                      {p.hierarchy_tier ? <span className="tr-org-tier">{p.hierarchy_tier}</span> : null}
                      {ready ? <button type="button" className="tr-org-ready" onClick={onOpenPromotion}><Award size={12} /> Ready for {ready.key}</button> : null}
                      <span className="tr-solar-list-sub">{progressLine(p)} · {st.total}/{WEEKLY_TOTAL_TARGET} this week{team ? ` · team of ${team}` : ''}{lic && !lic.licensed && p.role !== 'super_admin' ? ` · licensing ${lic.doneCount}/${lic.total}` : ''}</span>
                      {s && (s.state === 'working' || s.state === 'ready') ? (
                        <span className="tr-solar-list-bar" aria-hidden="true"><i className={s.state === 'ready' ? 'tr-ms-bar-done' : ''} style={{ width: `${Math.max(s.pct, s.pct > 0 ? 3 : 0)}%` }} /></span>
                      ) : null}
                    </span>
                    {(children.get(p.id) || []).length > 0
                      ? <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => onFocus(p.id)}>Open system</button>
                      : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

export function OrgChartBody({ user, onOpenPromotion, initialIntent, onIntentConsumed }) {
  const [people, setPeople] = useState([]);
  const avatars = useAvatars();
  const [weekAppts, setWeekAppts] = useState([]);
  const [readyIds, setReadyIds] = useState(new Map());
  const [progressById, setProgressById] = useState(new Map());
  const [licensing, setLicensing] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [weekMonday, setWeekMonday] = useState(weekStartOf(todayStr()));
  const [open, setOpen] = useState(null); // Set of expanded ids; null = default
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState(() => { try { return localStorage.getItem('pl_org_view') === 'solar' ? 'solar' : 'tree'; } catch { return 'tree'; } });
  const [solarFocus, setSolarFocus] = useState(null);
  const [pendingPerson, setPendingPerson] = useState(null); // from search
  const [selectRequest, setSelectRequest] = useState(null);
  const isAdmin = isAdminRole(user);
  useEffect(() => {
    if (!initialIntent) return;
    if (typeof initialIntent === 'object' && initialIntent.person) setPendingPerson(initialIntent.person);
    if (onIntentConsumed) onIntentConsumed();
  }, [initialIntent]); // eslint-disable-line react-hooks/exhaustive-deps
  function pickMode(m) { setMode(m); try { localStorage.setItem('pl_org_view', m); } catch { /* ignore */ } }

  const load = useCallback(async () => {
    setLoading(true);
    const [list, appts, sold] = await Promise.all([fetchHierarchyPeople(), fetchAppointmentsForWeek(weekMonday), fetchRecentSoldAppointments()]);
    setPeople(list);
    setWeekAppts(appts);
    const progress = computeReadiness(list, sold, promotionSubjects(user, list));
    setProgressById(new Map(progress.map(x => [x.member.id, x.progress])));
    setReadyIds(new Map(progress.filter(x => x.progress && x.progress.allMet).map(x => [x.member.id, x.progress.nextTier])));
    const prog = await fetchLicensingForUsers(list.map(p => p.id));
    setLicensing(new Map(list.map(p => [p.id, licensingStatus(prog.get(p.id), p)])));
    setLoading(false);
  }, [weekMonday, user.id, user.role]);
  useEffect(() => { load(); }, [load]);

  const children = React.useMemo(() => {
    const m = buildChildrenMap(people);
    for (const list of m.values()) list.sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));
    return m;
  }, [people]);
  const byId = React.useMemo(() => new Map(people.map(p => [p.id, p])), [people]);
  // Admins see the whole organization from the top; everyone else sees
  // themselves at the top of their own tree.
  const roots = React.useMemo(() => {
    if (!isAdmin) return byId.has(user.id) ? [byId.get(user.id)] : [];
    return people.filter(p => !p.manager_id || !byId.has(p.manager_id));
  }, [people, byId, isAdmin, user.id]);

  // This week's pace per person, then rolled up per team.
  const stats = React.useMemo(() => {
    const out = new Map();
    for (const p of people) {
      const list = weekAppts.filter(a => countsTowardPace(a, p.id));
      const counts = DATE_SET_OPTIONS.map(opt => list.filter(a => a.dateSetOption === opt.value).length);
      out.set(p.id, { total: counts.reduce((x, y) => x + y, 0), status: getStatus(counts, weekMonday) });
    }
    return out;
  }, [people, weekAppts, weekMonday]);
  const teamOf = React.useCallback(id => downlineIds(id, children), [children]);

  const visibleIds = React.useMemo(() => {
    const ids = new Set();
    roots.forEach(r => { ids.add(r.id); teamOf(r.id).forEach(i => ids.add(i)); });
    return ids;
  }, [roots, teamOf]);
  const visiblePeople = people.filter(p => visibleIds.has(p.id));

  // Search picked someone: show them in the solar system with their card open.
  useEffect(() => {
    if (!pendingPerson || loading) return;
    const p = byId.get(pendingPerson);
    if (p && visibleIds.has(p.id)) {
      setMode('solar');
      setQuery('');
      const isRoot = roots.some(r => r.id === p.id);
      setSolarFocus(isRoot || !p.manager_id || !visibleIds.has(p.manager_id) ? p.id : p.manager_id);
      setSelectRequest({ id: p.id, at: Date.now() });
    }
    setPendingPerson(null);
  }, [pendingPerson, loading, byId, visibleIds, roots]);

  // Each person's milestone card: % to their next level and the biggest gap.
  const summaries = React.useMemo(() => {
    const pctOf = id => progressPct(progressById.get(id));
    const out = new Map();
    for (const p of people) {
      if (!visibleIds.has(p.id)) continue;
      out.set(p.id, milestoneSummary(p, progressById.get(p.id) || null, {
        licensing: licensing.get(p.id),
        closestFor: tierKey => closestDirect(children.get(p.id) || [], tierKey, pctOf),
      }));
    }
    return out;
  }, [people, visibleIds, progressById, licensing, children]);

  // Searching opens the path down to every match.
  const q = query.trim().toLowerCase();
  const matchPath = React.useMemo(() => {
    if (!q) return null;
    const keep = new Set();
    for (const p of visiblePeople) {
      if (!(p.display_name || '').toLowerCase().includes(q)) continue;
      let cur = p, guard = 0;
      while (cur && visibleIds.has(cur.id) && guard++ < 60) { keep.add(cur.id); cur = cur.manager_id ? byId.get(cur.manager_id) : null; }
    }
    return keep;
  }, [q, visiblePeople, visibleIds, byId]);

  // Opens on the top levels, plus the path down to anyone ready for promotion.
  const pathToReady = React.useMemo(() => {
    const keep = new Set();
    for (const id of readyIds.keys()) {
      let cur = byId.get(id), guard = 0;
      while (cur && cur.manager_id && guard++ < 60) { keep.add(cur.manager_id); cur = byId.get(cur.manager_id); }
    }
    return keep;
  }, [readyIds, byId]);
  function defaultOpen(id, depth) { return depth < (isAdmin ? 1 : 2) || pathToReady.has(id); }
  function isOpen(id, depth) {
    if (matchPath) return matchPath.has(id);
    return open ? open.has(id) : defaultOpen(id, depth);
  }
  function toggle(id, depth) {
    const base = open ? new Set(open) : new Set(visiblePeople.filter(p => defaultOpen(p.id, depthOf(p.id))).map(p => p.id));
    if (isOpen(id, depth)) base.delete(id); else base.add(id);
    setOpen(base);
  }
  function depthOf(id) {
    let d = 0, cur = byId.get(id), guard = 0;
    while (cur && !roots.some(r => r.id === cur.id) && cur.manager_id && guard++ < 60) { d++; cur = byId.get(cur.manager_id); }
    return d;
  }

  const onPace = visiblePeople.filter(p => (stats.get(p.id) || {}).status === 'met').length;
  const leaders = visiblePeople.filter(p => (children.get(p.id) || []).length > 0).length;
  const readyHere = visiblePeople.filter(p => readyIds.has(p.id)).length;

  function renderNode(person, depth) {
    const kids = (children.get(person.id) || []).filter(k => !matchPath || matchPath.has(k.id));
    const team = teamOf(person.id);
    const teamOnPace = team.filter(id => (stats.get(id) || {}).status === 'met').length;
    const st = stats.get(person.id) || { total: 0, status: 'progress' };
    const expanded = kids.length > 0 && isOpen(person.id, depth);
    const ready = readyIds.get(person.id);
    const hit = q && (person.display_name || '').toLowerCase().includes(q);
    return (
      <li className="tr-org-node" key={person.id}>
        <div className={`tr-org-row ${hit ? 'tr-org-hit' : ''} ${person.id === user.id ? 'tr-org-me' : ''}`}>
          {kids.length > 0 ? (
            <button type="button" className="tr-org-toggle" aria-expanded={expanded} aria-label={`${expanded ? 'Hide' : 'Show'} ${person.display_name}'s team`} onClick={() => toggle(person.id, depth)}>
              {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>
          ) : <span className="tr-org-toggle tr-org-toggle-none" aria-hidden="true" />}
          <Avatar url={avatars.get(person.id)} className="tr-org-avatar">{personInitials(person.display_name)}</Avatar>
          <div className="tr-org-main">
            <div className="tr-org-name">
              <strong>{person.display_name}</strong>{person.id === user.id ? <span className="tr-org-you">you</span> : null}
              {person.hierarchy_tier ? <span className="tr-org-tier" title={hierarchyTierLabel(person.hierarchy_tier)}>{person.hierarchy_tier}</span> : null}
              {person.role !== 'advisor' ? <span className="tr-org-role">{roleLabel(person.role)}</span> : null}
              {licensing.get(person.id) && !licensing.get(person.id).licensed && person.role !== 'super_admin' ? (
                <span className="tr-org-lic" title={`Next: ${licensing.get(person.id).next.title}`}>Licensing {licensing.get(person.id).doneCount}/{licensing.get(person.id).total}</span>
              ) : null}
              {ready ? (
                <button type="button" className="tr-org-ready" onClick={onOpenPromotion} title="Open promotion readiness">
                  <Award size={12} /> Ready for {ready.key}
                </button>
              ) : null}
            </div>
            <div className="tr-org-sub">
              Joined {joinedDate(person.created_at)}
              {team.length > 0 ? <> · Team of {team.length} · {teamOnPace} on pace</> : null}
            </div>
          </div>
          <div className="tr-org-pace">
            <span className="tr-mono">{st.total}/{WEEKLY_TOTAL_TARGET}</span>
            <StatusBadge status={st.status} />
          </div>
        </div>
        {expanded && (
          <ul className="tr-org-children">
            {kids.map(k => renderNode(k, depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <>
      <div className="tr-row-head tr-screen-head">
        <TitleInfo title={<><Network size={18} aria-hidden="true" /> Org chart</>} info="Who reports to whom, with each person's appointment pace for the week. Open a name to see their team." />
        <RefreshButton onClick={load} />
      </div>
      <WeekNav weekMonday={weekMonday} onShift={d => setWeekMonday(shiftWeekStr(weekMonday, d))} onToday={() => setWeekMonday(weekStartOf(todayStr()))} />
      {loading ? <SkeletonTable rows={6} cols={3} /> : visiblePeople.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">No one to show yet.</p></div>
      ) : (
        <>
          <div className="tr-org-stats">
            <span><strong>{visiblePeople.length}</strong> {visiblePeople.length === 1 ? 'person' : 'people'}</span>
            <span><strong>{leaders}</strong> leading others</span>
            <span><strong>{onPace}</strong> on pace this week</span>
            {readyHere > 0 && <button type="button" className="tr-org-stat-ready" onClick={onOpenPromotion}><Award size={13} /> <strong>{readyHere}</strong> ready for promotion</button>}
          </div>
          <div className="tr-org-tools">
            <div className="tr-seg" role="group" aria-label="Org chart view">
              <button type="button" className={mode === 'tree' ? 'tr-seg-on' : ''} onClick={() => pickMode('tree')}>Tree</button>
              <button type="button" className={mode === 'solar' ? 'tr-seg-on' : ''} onClick={() => pickMode('solar')}>Solar system</button>
            </div>
            <div className="tr-search-row tr-org-search">
              <Search size={15} className="tr-search-icon" />
              <input className="tr-search-input" type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find someone…" aria-label="Find someone in the org chart" />
              {query && <button type="button" className="tr-icon-btn" onClick={() => setQuery('')} title="Clear search"><X size={15} /></button>}
            </div>
            {mode === 'tree' && <>
              <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => setOpen(new Set(visiblePeople.map(p => p.id)))}>Expand all</button>
              <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => setOpen(new Set())}>Collapse all</button>
            </>}
          </div>
          {mode === 'solar' ? (
            <>
              {q && (
                <div className="tr-solar-results">
                  {visiblePeople.filter(p => (p.display_name || '').toLowerCase().includes(q)).slice(0, 8).map(p => (
                    <button key={p.id} type="button" className="tr-pill-btn" onClick={() => { setSolarFocus((children.get(p.id) || []).length ? p.id : (p.manager_id && visibleIds.has(p.manager_id) ? p.manager_id : p.id)); setQuery(''); }}>{p.display_name}</button>
                  ))}
                  {!visiblePeople.some(p => (p.display_name || '').toLowerCase().includes(q)) && <span className="tr-empty">No one matches “{query}”.</span>}
                </div>
              )}
              <SolarSystemView user={user} isAdmin={isAdmin} roots={roots} byId={byId} children={children} stats={stats} readyIds={readyIds} licensing={licensing}
                teamOf={teamOf} focusId={solarFocus} onFocus={setSolarFocus} onOpenPromotion={onOpenPromotion} summaries={summaries} weekMonday={weekMonday} selectRequest={selectRequest} />
            </>
          ) : (
          <div className="tr-card tr-org-card">
            {matchPath && matchPath.size === 0 ? <p className="tr-empty">No one matches “{query}”.</p> : (
              <ul className="tr-org-tree">
                {roots.filter(r => !matchPath || matchPath.has(r.id)).map(r => renderNode(r, 0))}
              </ul>
            )}
          </div>
          )}
        </>
      )}
    </>
  );
}
