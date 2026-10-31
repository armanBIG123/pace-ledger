// Team & admin → Profiles (super admins only). Two lists: Individuals
// (everyone, on the licensing and contracting path) and Entities (the
// subsidiaries super admins add, on the 9-step checklist). Each row shows
// the step they're on and how long they've been there, so the lag is easy
// to spot; flagged ones go to the top in red. Click one for its profile.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, Building2, ChevronRight, Flag, Hourglass, Plus, Search, ShieldCheck, UserRound, X } from 'lucide-react';
import { addProfileNote, createEntity, fetchProfilesData, setEntityCheck } from '../../data/adminProfiles.js';
import { fetchHierarchyPeople } from '../../data/team.js';
import { fetchLicensingForUsers, LICENSING_STEPS } from '../../licensing.js';
import { hierarchyTierLabel } from '../../hierarchy.js';
import { personInitials } from '../../lib/format.js';
import { ENTITY_STEPS, entityNextText, entityProgress, PERSON_STEP_TEXT, personNowText, personProgress, STALLED_DAYS } from '../../lib/profiles.js';
import { Avatar, useAvatars } from '../../components/avatar.jsx';
import { SkeletonRows, TitleInfo } from '../../components/ui.jsx';
import { EntityForm, EntitySegs, LagBadge, PersonDots } from './profileParts.jsx';
import { EntityProfile } from './EntityProfile.jsx';
import { PersonProfile } from './PersonProfile.jsx';
import { lazyScreen } from '../../components/lazyScreen.jsx';
import { fetchContractingCounts } from '../../data/contracting.js';

// The contracting team's desk (behind two-step login), loaded only when opened.
const ContractingBody = lazyScreen(() => import('./Contracting.jsx'), 'ContractingBody');

const EMPTY_CHECKS = new Map();
const remember = (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* fine */ } };
const recall = (k, d) => { try { return sessionStorage.getItem(k) || d; } catch { return d; } };

export function ProfilesBody({ user }) {
  const [view, setView] = useState(() => recall('pl_profiles_view', 'people'));
  const [people, setPeople] = useState(null);
  const [progress, setProgress] = useState(new Map());
  const [data, setData] = useState(null); // { entities, checks, flags }
  const [loadError, setLoadError] = useState('');
  const [stack, setStack] = useState([]); // open profiles: [{ kind: 'person' | 'entity', id }]
  const [filters, setFilters] = useState({ people: 'all', entities: 'all' });
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('waiting');
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState('');
  const [ctCount, setCtCount] = useState(null); // waiting for the contracting team, or null if not on it
  const avatars = useAvatars();
  useEffect(() => {
    fetchContractingCounts().then(r => setCtCount(r.ok && r.data ? (r.data.countersign || 0) + (r.data.to_enter || 0) : null));
  }, [view]);

  const load = useCallback(async () => {
    const [list, d] = await Promise.all([fetchHierarchyPeople(), fetchProfilesData()]);
    const prog = await fetchLicensingForUsers((list || []).map(p => p.id));
    setPeople(list || []);
    setProgress(prog);
    setData(d.ok ? d : { entities: [], checks: new Map(), flags: new Map() });
    setLoadError(d.ok ? '' : "Couldn't load the entities and flags. Check your connection and try again.");
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!flash) return undefined; const t = setTimeout(() => setFlash(''), 6000); return () => clearTimeout(t); }, [flash]);

  function pickView(v) { setView(v); remember('pl_profiles_view', v); setStack([]); setQ(''); }
  const open = (kind, id) => { setStack(s => [...s, { kind, id }]); window.scrollTo(0, 0); };
  const back = () => { setStack(s => s.slice(0, -1)); window.scrollTo(0, 0); };
  const checksOf = id => (data && data.checks.get(id)) || EMPTY_CHECKS;

  // ---- rows -------------------------------------------------------------
  const personRows = useMemo(() => (people || []).map(p => {
    const pr = progress.get(p.id) || null;
    const pp = personProgress(p, pr);
    return { p, pr, pp, flag: data ? data.flags.get(p.id) : null };
  }), [people, progress, data]);
  const entityRows = useMemo(() => (data ? data.entities : []).map(e => ({ e, ep: entityProgress(e, checksOf(e.id)) })),
    [data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!people || !data) {
    return <div className="tr-pf"><h2 className="tr-h2">Profiles</h2><SkeletonRows count={6} /></div>;
  }

  // ---- an open profile -----------------------------------------------------------
  const top = stack[stack.length - 1];
  const below = stack[stack.length - 2];
  const backLabel = below
    ? (below.kind === 'entity' ? (data.entities.find(x => x.id === below.id) || {}).name : (people.find(x => x.id === below.id) || {}).display_name) || 'Back'
    : view === 'people' ? 'Individuals' : 'Entities';
  if (top && top.kind === 'entity') {
    const e = data.entities.find(x => x.id === top.id);
    if (e) {
      return (
        <EntityProfile key={e.id} entity={e} checks={checksOf(e.id)} people={people}
          backLabel={backLabel} onBack={back} onOpenPerson={id => open('person', id)}
          onChanged={(rec, checks) => setData(d => {
            const map = new Map(d.checks); map.set(rec.id, checks);
            return { ...d, entities: d.entities.map(x => (x.id === rec.id ? rec : x)), checks: map };
          })}
          onDeleted={() => { setData(d => ({ ...d, entities: d.entities.filter(x => x.id !== e.id) })); back(); setFlash(`Deleted ${e.name}.`); }} />
      );
    }
  }
  if (top && top.kind === 'person') {
    const p = people.find(x => x.id === top.id);
    if (p) {
      return (
        <PersonProfile key={p.id} person={p} progress={progress.get(p.id) || null} flag={data.flags.get(p.id) || null}
          people={people} entities={data.entities} checksOf={checksOf} photo={avatars.get(p.id)}
          backLabel={backLabel} onBack={back} onOpenEntity={id => open('entity', id)}
          onChanged={(patch, row) => {
            setPeople(list => list.map(x => (x.id === p.id ? { ...x, ...patch } : x)));
            if (row) setProgress(m => { const n = new Map(m); n.set(p.id, row); return n; });
          }}
          onFlagChanged={f => setData(d => { const flags = new Map(d.flags); if (f) flags.set(p.id, f); else flags.delete(p.id); return { ...d, flags }; })} />
      );
    }
  }

  // ---- lists ----------------------------------------------------------------
  const needle = q.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');

  const pf = filters.people;
  const personMatches = {
    all: () => true, flagged: r => !!r.flag, stalled: r => r.pp.stalled,
    licensing: r => r.pp.group === 'licensing', contracting: r => r.pp.group === 'contracting', appointed: r => r.pp.group === 'appointed',
  };
  const peopleCounts = Object.fromEntries(Object.entries(personMatches).map(([k, fn]) => [k, personRows.filter(fn).length]));
  const shownPeople = personRows
    .filter(personMatches[pf] || personMatches.all)
    .filter(r => !needle || (r.p.display_name || '').toLowerCase().includes(needle) || (r.p.email || '').toLowerCase().includes(needle) || (digits.length >= 3 && (r.p.npn || '').includes(digits)))
    .sort((a, b) => (sort === 'name' ? (a.p.display_name || '').localeCompare(b.p.display_name || '')
      : sort === 'newest' ? String(b.p.created_at || '').localeCompare(String(a.p.created_at || ''))
      : (!!b.flag - !!a.flag) || (b.pp.stalled - a.pp.stalled) || ((a.pp.group === 'appointed' || a.pp.admin) - (b.pp.group === 'appointed' || b.pp.admin)) || (b.pp.days - a.pp.days)
        || (a.p.display_name || '').localeCompare(b.p.display_name || '')));

  const live = r => !r.e.archived_at;
  const entityMatches = {
    all: r => live(r), flagged: r => live(r) && !!r.e.flag_reason, stalled: r => live(r) && r.ep.stalled,
    p1: r => live(r) && r.ep.current && r.ep.current.phase.key === 'p1', p2: r => live(r) && r.ep.current && r.ep.current.phase.key === 'p2',
    p3: r => live(r) && r.ep.current && r.ep.current.phase.key === 'p3', completed: r => live(r) && r.ep.completed, archived: r => !!r.e.archived_at,
  };
  const entityCounts = Object.fromEntries(Object.entries(entityMatches).map(([k, fn]) => [k, entityRows.filter(fn).length]));
  // The Archived chip goes away when nothing is archived; so does its filter.
  const ef = filters.entities === 'archived' && !entityCounts.archived ? 'all' : filters.entities;
  const active = { people: pf, entities: ef };
  const shownEntities = entityRows
    .filter(entityMatches[ef] || entityMatches.all)
    .filter(r => !needle || r.e.name.toLowerCase().includes(needle) || (r.e.partner_name || '').toLowerCase().includes(needle))
    .sort((a, b) => (sort === 'name' ? a.e.name.localeCompare(b.e.name)
      : sort === 'newest' ? String(b.e.created_at).localeCompare(String(a.e.created_at))
      : (!!b.e.flag_reason - !!a.e.flag_reason) || (a.ep.completed - b.ep.completed) || (b.ep.days - a.ep.days) || a.e.name.localeCompare(b.e.name)));

  async function addEntity(fields, extra) {
    const res = await createEntity(fields);
    if (!res.ok) return false;
    const checks = new Map();
    if (extra.receivedOn) {
      const t = await setEntityCheck(res.record.id, 'app_received', extra.receivedOn);
      if (t.ok) checks.set('app_received', t.record);
    }
    if (extra.note) await addProfileNote({ entityId: res.record.id }, extra.note);
    setData(d => { const map = new Map(d.checks); map.set(res.record.id, checks); return { ...d, entities: [res.record, ...d.entities], checks: map }; });
    setAdding(false);
    open('entity', res.record.id);
    return true;
  }

  const chip = (group, key, label, count, tone = '') => (
    <button key={key} type="button" className={`tr-pf-chip ${tone} ${active[group] === key ? 'tr-pf-chip-on' : ''}`} aria-pressed={active[group] === key}
      onClick={() => setFilters(f => ({ ...f, [group]: key }))}>{label} <i>{count}</i></button>
  );
  const peopleN = personRows.length, entitiesN = entityCounts.all;

  return (
    <div className="tr-pf">
      <div className="tr-row-head tr-screen-head">
        <TitleInfo title="Profiles" info="Super admins only. Track each person's licensing and contracting, and each subsidiary's 9-step checklist. Rows show the step they're on and how long they've been there; no progress in 7 days shows as Stalled. Flag anything that needs attention." />
      </div>
      {flash ? <div className="tr-flash" role="status">{flash}</div> : null}
      {loadError ? <div className="tr-error">{loadError}</div> : null}

      <div className="tr-pf-bar">
        <div className="tr-pf-tabs" role="tablist" aria-label="Profiles">
          <button type="button" role="tab" aria-selected={view === 'people'} className={view === 'people' ? 'tr-pf-tab-on' : ''} onClick={() => pickView('people')}><UserRound size={15} aria-hidden="true" /> Individuals <i>{peopleN}</i></button>
          <button type="button" role="tab" aria-selected={view === 'entities'} className={view === 'entities' ? 'tr-pf-tab-on' : ''} onClick={() => pickView('entities')}><Building2 size={15} aria-hidden="true" /> Entities <i>{entitiesN}</i></button>
          <button type="button" role="tab" aria-selected={view === 'contracting'} className={view === 'contracting' ? 'tr-pf-tab-on' : ''} onClick={() => pickView('contracting')}><ShieldCheck size={15} aria-hidden="true" /> Contracting {ctCount ? <i className="tr-pf-tab-alert">{ctCount}</i> : null}</button>
        </div>
        {view === 'contracting' ? null : <>
        <div className="tr-search-row tr-pf-search">
          <Search size={15} className="tr-search-icon" />
          <input className="tr-search-input" type="text" value={q} onChange={e => setQ(e.target.value)}
            placeholder={view === 'people' ? 'Search name, email, NPN' : 'Search entities, partners'} aria-label={view === 'people' ? 'Search people by name, email or NPN' : 'Search entities or partners'} />
          {q ? <button type="button" className="tr-icon-btn" onClick={() => setQ('')} aria-label="Clear search"><X size={15} /></button> : null}
        </div>
        <label className="tr-pf-sort"><ArrowUpDown size={14} aria-hidden="true" />
          <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort">
            <option value="waiting">Longest waiting first</option>
            <option value="name">Name</option>
            <option value="newest">{view === 'people' ? 'Newest to the team' : 'Newest added'}</option>
          </select>
        </label>
        {view === 'entities' ? <button type="button" className="tr-btn tr-btn-brass tr-pf-add" onClick={() => setAdding(true)}><Plus size={15} aria-hidden="true" /> Add entity</button> : null}
        </>}
      </div>

      {view === 'contracting' ? <ContractingBody user={user} /> : view === 'people' ? (
        <>
          <div className="tr-pf-chips" role="group" aria-label="Show">
            {chip('people', 'all', 'Everyone', peopleCounts.all)}
            {chip('people', 'flagged', <><Flag size={12} aria-hidden="true" /> Flagged</>, peopleCounts.flagged, 'tr-pf-chip-red')}
            {chip('people', 'stalled', <><Hourglass size={12} aria-hidden="true" /> Stalled {STALLED_DAYS}+ days</>, peopleCounts.stalled, 'tr-pf-chip-amber')}
            {chip('people', 'licensing', 'Getting licensed', peopleCounts.licensing)}
            {chip('people', 'contracting', 'Contracting', peopleCounts.contracting)}
            {chip('people', 'appointed', 'Appointed', peopleCounts.appointed)}
          </div>
          <div className="tr-card tr-pf-list">
            <div className="tr-pf-row tr-pf-row-head" aria-hidden="true"><span /><span>Person</span><span>Licensing · contracting</span><span>Now on</span><span>Waiting</span><span /></div>
            {shownPeople.length === 0 ? <p className="tr-empty tr-pf-none">{needle ? 'No one matches.' : 'No one here.'}</p> : shownPeople.map(({ p, pr, pp, flag }) => {
              const manager = p.manager_id ? people.find(x => x.id === p.manager_id) : null;
              const ents = data.entities.filter(e => e.partner_id === p.id && !e.archived_at);
              return (
                <button key={p.id} type="button" className={`tr-pf-row ${flag ? 'tr-pf-row-flag' : ''}`} onClick={() => open('person', p.id)}>
                  <span className="tr-pf-row-flagicon" aria-hidden="true">{flag ? <Flag size={15} /> : null}</span>
                  <span className="tr-pf-row-name tr-pf-row-person">
                    <Avatar url={avatars.get(p.id)} className="tr-pf-avatar">{personInitials(p.display_name)}</Avatar>
                    <span>
                      <span className="tr-pf-row-title"><strong>{p.display_name}</strong>{ents.length ? <span className="tr-pf-entity-tag"><Building2 size={11} aria-hidden="true" /> {ents[0].name}</span> : null}</span>
                      <span className="tr-pf-row-sub" title={hierarchyTierLabel(p.hierarchy_tier) || undefined}>{[p.hierarchy_tier || (p.role === 'super_admin' ? 'Admin' : ''), manager ? `reports to ${manager.display_name}` : ''].filter(Boolean).join(' · ')}</span>
                      {flag ? <span className="tr-pf-row-reason"><Flag size={11} aria-hidden="true" /> {flag.reason}</span> : null}
                    </span>
                  </span>
                  <span className="tr-pf-row-prog">{pp.admin ? null : <><PersonDots done={LICENSING_STEPS.map(s => !!pp.done[s.key])} currentIndex={pp.nextIndex} /><span className="tr-pf-row-count">{pp.doneCount} of 8</span></>}</span>
                  <span className="tr-pf-row-now">
                    {pp.admin ? <span className="tr-pf-light">Super admin · not tracked</span> : pp.licensed ? <span className="tr-pf-ok">Appointed</span> : PERSON_STEP_TEXT[pp.next.key]}
                    {personNowText(p, pr, pp) ? <span className="tr-pf-row-sub">{personNowText(p, pr, pp)}</span> : null}
                  </span>
                  <span className="tr-pf-row-lag">{pp.admin || pp.licensed ? null : <LagBadge days={pp.days} stalled={pp.stalled} note={pp.examAhead ? 'Exam coming up' : ''} />}</span>
                  <ChevronRight size={16} className="tr-pf-row-chev" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="tr-pf-chips" role="group" aria-label="Show">
            {chip('entities', 'all', 'All', entityCounts.all)}
            {chip('entities', 'flagged', <><Flag size={12} aria-hidden="true" /> Flagged</>, entityCounts.flagged, 'tr-pf-chip-red')}
            {chip('entities', 'stalled', <><Hourglass size={12} aria-hidden="true" /> Stalled {STALLED_DAYS}+ days</>, entityCounts.stalled, 'tr-pf-chip-amber')}
            {chip('entities', 'p1', 'Phase 1', entityCounts.p1)}
            {chip('entities', 'p2', 'Phase 2', entityCounts.p2)}
            {chip('entities', 'p3', 'Phase 3', entityCounts.p3)}
            {chip('entities', 'completed', 'Completed', entityCounts.completed)}
            {entityCounts.archived ? chip('entities', 'archived', 'Archived', entityCounts.archived) : null}
          </div>
          <div className="tr-card tr-pf-list">
            <div className="tr-pf-row tr-pf-row-head" aria-hidden="true"><span /><span>Entity · subsidiary partner</span><span>Progress</span><span>Now on</span><span>Waiting</span><span /></div>
            {shownEntities.length === 0 ? (
              <div className="tr-empty tr-pf-none">
                {data.entities.length === 0 ? <>No entities yet. <button type="button" className="tr-link-btn" onClick={() => setAdding(true)}>Add the first one</button>.</> : needle ? 'Nothing matches.' : 'Nothing here.'}
              </div>
            ) : shownEntities.map(({ e, ep }) => {
              const partner = e.partner_id ? people.find(x => x.id === e.partner_id) : null;
              const flagged = !!e.flag_reason;
              const next = ep.current ? entityNextText(e, checksOf(e.id), ep.current) : '';
              return (
                <button key={e.id} type="button" className={`tr-pf-row ${flagged ? 'tr-pf-row-flag' : ''}`} onClick={() => open('entity', e.id)}>
                  <span className="tr-pf-row-flagicon" aria-hidden="true">{flagged ? <Flag size={15} /> : null}</span>
                  <span className="tr-pf-row-name">
                    <strong>{e.name}</strong>
                    <span className="tr-pf-row-sub">{partner ? partner.display_name : e.partner_name ? `${e.partner_name} · not in PaceLedger` : 'No partner picked yet'}</span>
                    {flagged ? <span className="tr-pf-row-reason"><Flag size={11} aria-hidden="true" /> {e.flag_reason}</span> : null}
                  </span>
                  <span className="tr-pf-row-prog"><EntitySegs done={ep.done} currentIndex={ep.currentIndex} flagged={flagged} /><span className="tr-pf-row-count">{ep.doneCount} of 9</span></span>
                  <span className="tr-pf-row-now">
                    {ep.completed ? <span className="tr-pf-ok">All 9 steps done</span> : <><b className="tr-pf-phase-name">{ep.current.phase.label}</b> · {ep.current.title}</>}
                    {next ? <span className="tr-pf-row-sub">{next}</span> : null}
                  </span>
                  <span className="tr-pf-row-lag">{e.archived_at ? <span className="tr-pf-lag">Archived</span> : <LagBadge days={ep.days} stalled={ep.stalled} completedOn={ep.completed ? ep.completedOn : null} />}</span>
                  <ChevronRight size={16} className="tr-pf-row-chev" aria-hidden="true" />
                </button>
              );
            })}
          </div>
          <p className="tr-pf-foot">{ENTITY_STEPS.length} steps in 3 phases. Waiting counts the days since anything on its checklist was last ticked.</p>
        </>
      )}

      {adding ? <EntityForm people={people} onSave={addEntity} onClose={() => setAdding(false)} /> : null}
    </div>
  );
}
