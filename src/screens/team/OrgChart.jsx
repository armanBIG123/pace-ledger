// Org Chart: the tree and solar system views.
import React, { useCallback, useEffect, useState } from 'react';
import { Award, ChevronDown, ChevronLeft, ChevronRight, Network, Search, X } from 'lucide-react';
import { fetchLicensingForUsers, licensingStatus } from '../../licensing.js';
import { buildChildrenMap, computeReadiness, downlineIds, hierarchyTierLabel } from '../../hierarchy.js';
import { DATE_SET_OPTIONS, getStatus, WEEKLY_TOTAL_TARGET } from '../../lib/pace.js';
import { joinedDate, shiftWeekStr, todayStr, weekStartOf } from '../../lib/dates.js';
import { personInitials, shortName } from '../../lib/format.js';
import { fetchAppointmentsForWeek } from '../../data/appointments.js';
import { fetchHierarchyPeople, fetchRecentSoldAppointments, promotionSubjects } from '../../data/team.js';
import { SkeletonTable, StatusBadge, WeekNav } from '../../components/ui.jsx';

// Solar system view of the org chart: the person in focus is the sun, the
// people who report to them orbit as planets (bigger planet = bigger team,
// colour = this week's pace, moons = their own direct reports). Click a
// planet to fly into their system; the trail at the top goes back up.
export const SOLAR_STATUS_COLORS = { met: '#4FB286', progress: '#E0A84A', missed: '#D8644E' };

export const SOLAR_STARS = (() => {
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  return Array.from({ length: 70 }, () => ({ x: rnd() * 600, y: rnd() * 600, r: rnd() * 1.1 + 0.3, o: rnd() * 0.5 + 0.25, d: rnd() * 4 }));
})();

export function SolarSystemView({ user, isAdmin, roots, byId, children, stats, readyIds, licensing, teamOf, focusId, onFocus, onOpenPromotion }) {
  const [selected, setSelected] = useState(null);
  useEffect(() => { setSelected(null); }, [focusId]);
  // Phones draw the same picture smaller, so planets get bigger to stay tappable.
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
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

  // Trail from the top of what you can see down to the sun.
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
  const rings = planets.length <= 8 ? [{ r: 172, list: planets }] : [{ r: 138, list: planets.slice(0, 8) }, { r: 232, list: planets.slice(8) }];
  const placed = rings.flatMap((ring, ri) => ring.list.map((p, i) => {
    const angle = (i / ring.list.length) * Math.PI * 2 - Math.PI / 2 + (ri ? Math.PI / ring.list.length : 0);
    const team = teamOf(p.id).length;
    return { p, x: C + Math.cos(angle) * ring.r, y: C + Math.sin(angle) * ring.r, size: (compact ? 19 : 13) + Math.min(15, Math.sqrt(team) * 4.5), team, moons: Math.min(6, (children.get(p.id) || []).length), delay: (ri * 8 + i) * 45 };
  }));
  const sel = selected ? byId.get(selected) : null;

  function open(p) {
    if ((children.get(p.id) || []).length > 0) onFocus(p.id);
    else setSelected(p.id === selected ? null : p.id);
  }
  function info(p) {
    const st = stats.get(p.id) || { total: 0, status: 'progress' };
    const team = teamOf(p.id).length;
    return `${p.display_name}${p.hierarchy_tier ? ` · ${p.hierarchy_tier}` : ''} · ${st.total}/${WEEKLY_TOTAL_TARGET} this week${team ? ` · team of ${team}` : ''}`;
  }

  return (
    <div className="tr-solar">
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
        <svg key={focus} viewBox="0 0 600 600" className="tr-solar-svg" role="img" aria-label={`${isOrg ? 'The organization' : `${sun ? sun.display_name : ''}'s team`}: ${planets.length} people in orbit`}>
          <defs>
            <radialGradient id="trSunGrad" cx="40%" cy="35%" r="70%">
              <stop offset="0%" stopColor="#FFE7A3" /><stop offset="55%" stopColor="#E6B54E" /><stop offset="100%" stopColor="#B8862E" />
            </radialGradient>
            <radialGradient id="trSunGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#F2C866" stopOpacity="0.55" /><stop offset="100%" stopColor="#F2C866" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="trPlanetShade" cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.45" /><stop offset="60%" stopColor="#fff" stopOpacity="0" /><stop offset="100%" stopColor="#000" stopOpacity="0.25" />
            </radialGradient>
          </defs>
          {SOLAR_STARS.map((st, i) => <circle key={i} cx={st.x} cy={st.y} r={st.r} fill="#fff" opacity={st.o} className="tr-solar-star" style={{ animationDelay: `${st.d}s` }} />)}
          {rings.map(ring => <circle key={ring.r} cx={C} cy={C} r={ring.r} className="tr-solar-orbit" />)}

          <g className="tr-solar-sun">
            <circle cx={C} cy={C} r="92" fill="url(#trSunGlow)" />
            <circle cx={C} cy={C} r="48" fill="url(#trSunGrad)" />
            {isOrg ? (
              <text x={C} y={C + 6} textAnchor="middle" className="tr-solar-sun-text" style={{ fontSize: 15 }}>Org</text>
            ) : (
              <>
                <text x={C} y={C + 7} textAnchor="middle" className="tr-solar-sun-text">{personInitials(sun ? sun.display_name : '')}</text>
                {sun && readyIds.has(sun.id) && <circle cx={C} cy={C} r="55" className="tr-solar-ready" />}
              </>
            )}
          </g>

          {placed.map(({ p, x, y, size, team, moons, delay }) => {
            const st = stats.get(p.id) || { status: 'progress', total: 0 };
            const ready = readyIds.get(p.id);
            const hasTeam = (children.get(p.id) || []).length > 0;
            return (
              <g key={p.id} className={`tr-solar-planet ${selected === p.id ? 'tr-solar-planet-on' : ''} ${hasTeam ? 'tr-solar-planet-team' : ''}`}
                style={{ transform: `translate(${x}px, ${y}px)`, animationDelay: `${delay}ms` }}
                role="button" tabIndex={0} aria-label={`${info(p)}${hasTeam ? '. Open their system' : ''}`}
                onClick={() => open(p)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(p); } }}>
                <title>{info(p)}</title>
                <circle r={size + 18} fill="transparent" />
                {moons > 0 && <circle r={size + 9} className="tr-solar-moonpath" />}
                {Array.from({ length: moons }, (_, m) => {
                  const a = (m / moons) * Math.PI * 2 - Math.PI / 4;
                  return <circle key={m} cx={Math.cos(a) * (size + 9)} cy={Math.sin(a) * (size + 9)} r="3" className="tr-solar-moon" />;
                })}
                {ready && <circle r={size + 5} className="tr-solar-ready" />}
                <circle r={size} fill={SOLAR_STATUS_COLORS[st.status] || SOLAR_STATUS_COLORS.progress} />
                <circle r={size} fill="url(#trPlanetShade)" />
                <text y="4" textAnchor="middle" className="tr-solar-planet-initials" style={{ fontSize: Math.max(10, size * 0.62) }}>{personInitials(p.display_name)}</text>
                <text y={size + (moons ? 24 : 16) + gap} textAnchor="middle" className="tr-solar-label">{shortName(p.display_name)}</text>
                <text y={size + (moons ? 37 : 29) + gap * 2} textAnchor="middle" className="tr-solar-sublabel">{st.total}/{WEEKLY_TOTAL_TARGET}{team ? ` · ${team}` : ''}</text>
              </g>
            );
          })}
          {planets.length === 0 && (
            <text x={C} y={C + 110} textAnchor="middle" className="tr-solar-sublabel" style={{ fontSize: 14 }}>No one in orbit yet</text>
          )}
        </svg>

        <div className="tr-solar-legend" aria-hidden="true">
          <span><i style={{ background: SOLAR_STATUS_COLORS.met }} /> On pace</span>
          <span><i style={{ background: SOLAR_STATUS_COLORS.progress }} /> In progress</span>
          <span><i style={{ background: SOLAR_STATUS_COLORS.missed }} /> Behind</span>
          <span><i className="tr-solar-legend-ring" /> Ready for promotion</span>
          <span><i className="tr-solar-legend-moon" /> Moons = their direct reports</span>
          <span>Bigger planet = bigger team</span>
        </div>
      </div>

      <div className="tr-card tr-solar-panel">
        <div className="tr-solar-panel-head">
          <div>
            <div className="tr-solar-panel-title">{isOrg ? 'The whole organization' : sel ? sel.display_name : sun ? `${sun.display_name}'s system` : ''}</div>
            <div className="tr-solar-panel-sub">
              {sel ? <>{info(sel)} · no one reports to them yet</>
                : <>{teamIds.length} {teamIds.length === 1 ? 'person' : 'people'} in this system · {teamOnPace} on pace this week{planetsAll.length > MAX ? ` · showing the ${MAX} biggest teams in orbit` : ''}</>}
            </div>
          </div>
          {!isOrg && sun && sun.id !== top && !sel && (
            <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => onFocus(sun.manager_id && (isAdmin || teamOf(top).includes(sun.manager_id) || sun.manager_id === top) ? sun.manager_id : top)}>
              <ChevronLeft size={14} /> Up a level
            </button>
          )}
        </div>
        {planetsAll.length > 0 && (
          <ul className="tr-solar-list">
            {planetsAll.map(p => {
              const st = stats.get(p.id) || { total: 0, status: 'progress' };
              const team = teamOf(p.id).length;
              const ready = readyIds.get(p.id);
              return (
                <li key={p.id}>
                  <span className="tr-solar-dot" style={{ background: SOLAR_STATUS_COLORS[st.status] }} />
                  <span className="tr-solar-list-name">
                    <strong>{p.display_name}</strong>
                    {p.hierarchy_tier ? <span className="tr-org-tier">{p.hierarchy_tier}</span> : null}
                    {ready ? <button type="button" className="tr-org-ready" onClick={onOpenPromotion}><Award size={12} /> Ready for {ready.key}</button> : null}
                    <span className="tr-solar-list-sub">{st.total}/{WEEKLY_TOTAL_TARGET} this week{team ? ` · team of ${team}` : ''}{licensing && licensing.get(p.id) && !licensing.get(p.id).licensed && p.role !== 'super_admin' ? ` · licensing ${licensing.get(p.id).doneCount}/${licensing.get(p.id).total}` : ''}</span>
                  </span>
                  {(children.get(p.id) || []).length > 0
                    ? <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => onFocus(p.id)}>Open system</button>
                    : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function OrgChartBody({ user, onOpenPromotion }) {
  const [people, setPeople] = useState([]);
  const [weekAppts, setWeekAppts] = useState([]);
  const [readyIds, setReadyIds] = useState(new Map());
  const [licensing, setLicensing] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [weekMonday, setWeekMonday] = useState(weekStartOf(todayStr()));
  const [open, setOpen] = useState(null); // Set of expanded ids; null = default
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState(() => { try { return localStorage.getItem('pl_org_view') === 'solar' ? 'solar' : 'tree'; } catch { return 'tree'; } });
  const [solarFocus, setSolarFocus] = useState(null);
  const isAdmin = user.role === 'super_admin';
  function pickMode(m) { setMode(m); try { localStorage.setItem('pl_org_view', m); } catch { /* ignore */ } }

  const load = useCallback(async () => {
    setLoading(true);
    const [list, appts, sold] = await Promise.all([fetchHierarchyPeople(), fetchAppointmentsForWeek(weekMonday), fetchRecentSoldAppointments()]);
    setPeople(list);
    setWeekAppts(appts);
    const ready = computeReadiness(list, sold, promotionSubjects(user, list)).filter(x => x.progress && x.progress.allMet);
    setReadyIds(new Map(ready.map(x => [x.member.id, x.progress.nextTier])));
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
      const list = weekAppts.filter(a => a.userId === p.id && !a.isFollowUp);
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
          <span className="tr-org-avatar" aria-hidden="true">{personInitials(person.display_name)}</span>
          <div className="tr-org-main">
            <div className="tr-org-name">
              <strong>{person.display_name}</strong>{person.id === user.id ? <span className="tr-org-you">you</span> : null}
              {person.hierarchy_tier ? <span className="tr-org-tier" title={hierarchyTierLabel(person.hierarchy_tier)}>{person.hierarchy_tier}</span> : null}
              {person.role === 'manager' ? <span className="tr-org-role">Manager</span> : person.role === 'super_admin' ? <span className="tr-org-role">Admin</span> : null}
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
      <WeekNav weekMonday={weekMonday} onShift={d => setWeekMonday(shiftWeekStr(weekMonday, d))} onToday={() => setWeekMonday(weekStartOf(todayStr()))} />
      <div className="tr-row-head">
        <h2 className="tr-h2"><Network size={18} /> Org chart</h2>
        <button className="tr-btn tr-btn-ghost tr-btn-sm" onClick={load}>Refresh</button>
      </div>
      <p className="tr-subtitle">Who reports to whom, with each person's appointment pace for the week. Open a name to see their team.</p>
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
                teamOf={teamOf} focusId={solarFocus} onFocus={setSolarFocus} onOpenPromotion={onOpenPromotion} />
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
