// Prospecting: the prospect list, scoring form, funnel and Memory Jogger.
import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { daysAgoLabel, fmtDisplayDate } from '../lib/dates.js';
import { isValidEmail } from '../lib/format.js';
import { fetchMyAppointments } from '../data/appointments.js';
import { ALL_CHARACTERISTICS, deleteProspect, fetchMyProspects, insertProspect, isStaleProspect, LEANING_LABELS, MEMORY_JOGGER_CATEGORIES, normName, PROSPECT_SOURCES, prospectLeaningKey, prospectNameKey, prospectTotalChecked, RECRUIT_CHARACTERISTICS, SALE_CHARACTERISTICS, STALE_PROSPECT_DAYS, updateProspect, updateProspectOutcome } from '../data/prospects.js';
import { ContactLinks, PageHead, SkeletonCards } from '../components/ui.jsx';

export function ProspectForm({ editing, onCancel, onSubmit, saving, onOpenJogger }) {
  const [firstName, setFirstName] = useState(editing?.firstName || '');
  const [lastName, setLastName] = useState(editing?.lastName || '');
  const [age, setAge] = useState(editing?.age != null ? String(editing.age) : '');
  const [relationshipStrength, setRelationshipStrength] = useState(editing?.relationshipStrength ?? 5);
  const [chars, setChars] = useState(() => {
    const initial = {};
    ALL_CHARACTERISTICS.forEach(c => { initial[c.key] = editing ? !!editing[c.key] : false; });
    return initial;
  });
  const [notes, setNotes] = useState(editing?.notes || '');
  const [source, setSource] = useState(editing?.source || '');
  const [email, setEmail] = useState(editing?.email || '');
  const [err, setErr] = useState('');

  function toggleChar(key) { setChars(prev => ({ ...prev, [key]: !prev[key] })); }

  function submit(another = false) {
    if (!firstName.trim() || !lastName.trim()) { setErr("Enter the prospect's first and last name."); return; }
    if (email.trim() && !isValidEmail(email)) { setErr("That email address doesn't look right."); return; }
    setErr('');
    onSubmit({ firstName, lastName, age, relationshipStrength, notes, source, email, ...chars }, { another });
  }
  const liveScore = prospectTotalChecked({ age, ...chars });
  const liveLeaning = prospectLeaningKey({ age, ...chars });

  return (
    <div className="tr-card tr-form">
      <div className="tr-row-head">
        <h3 className="tr-h3" style={{ margin: 0 }}>{editing ? 'Edit prospect' : 'New prospect'}</h3>
        <div className="tr-prospect-live-score">
          <span className="tr-mono">{liveScore}/9</span>
          <span className={`tr-type-badge ${liveLeaning === 'sale' ? 'tr-type-badge-sale' : liveLeaning === 'recruit' ? 'tr-type-badge-recruit' : liveLeaning === 'both' ? 'tr-type-badge-both' : ''}`}>{LEANING_LABELS[liveLeaning]}</span>
        </div>
      </div>
      {!editing && onOpenJogger && (
        <p className="tr-empty" style={{ margin: '4px 0 12px' }}>
          Stuck on who to add next? <button type="button" className="tr-ov-link" onClick={onOpenJogger}>Open the Memory Jogger</button>
        </p>
      )}
      <div className="tr-form-grid">
        <label className="tr-field">
          <span>First name</span>
          <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" />
        </label>
        <label className="tr-field">
          <span>Last name</span>
          <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" />
        </label>
        <label className="tr-field">
          <span>Email (optional)</span>
          <input type="email" inputMode="email" autoComplete="off" autoCapitalize="none" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" />
        </label>
        <label className="tr-field">
          <span>Age</span>
          <input type="number" min="0" max="120" value={age} onChange={e => setAge(e.target.value)} placeholder="Age" />
        </label>
        <label className="tr-field">
          <span>Source</span>
          <select value={source} onChange={e => setSource(e.target.value)}>
            <option value="">— not specified —</option>
            {PROSPECT_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="tr-field tr-field-wide">
          <span>Relationship strength: {relationshipStrength}/10</span>
          <input type="range" min="0" max="10" value={relationshipStrength} onChange={e => setRelationshipStrength(Number(e.target.value))} />
        </label>
      </div>
      <div className="tr-prospect-chars">
        <div className="tr-prospect-char-group">
          <h4 className="tr-h4">Sale indicators</h4>
          {SALE_CHARACTERISTICS.map(c => (
            <label key={c.key} className="tr-checkbox-field tr-prospect-char-row">
              <input type="checkbox" checked={chars[c.key]} onChange={() => toggleChar(c.key)} />
              <span>{c.label}{c.hint ? <span className="tr-note"> — {c.hint}</span> : null}</span>
            </label>
          ))}
        </div>
        <div className="tr-prospect-char-group">
          <h4 className="tr-h4">Recruit indicators</h4>
          {RECRUIT_CHARACTERISTICS.map(c => (
            <label key={c.key} className="tr-checkbox-field tr-prospect-char-row">
              <input type="checkbox" checked={chars[c.key]} onChange={() => toggleChar(c.key)} />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </div>
      <label className="tr-field tr-field-wide" style={{ marginTop: 14 }}>
        <span>Notes (optional)</span>
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything else worth noting about this prospect" />
      </label>
      {err && <div className="tr-error">{err}</div>}
      <div className="tr-form-actions">
        <button type="button" className="tr-btn tr-btn-ghost" onClick={onCancel}>Cancel</button>
        {!editing && <button type="button" className="tr-btn tr-btn-ghost" onClick={() => submit(true)} disabled={saving}>Save &amp; add another</button>}
        <button type="button" className="tr-btn tr-btn-brass" onClick={() => submit(false)} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save prospect'}</button>
      </div>
    </div>
  );
}

// Reused both personally (Systems > List) and aggregated (Team
// Prospecting) — takes whatever set of prospects is relevant and shows
// where the drop-off actually happens.
export function ProspectFunnel({ prospects, title }) {
  const total = prospects.length;
  if (total === 0) return null;
  const converted = prospects.filter(p => p.markedRecruited || p.markedSold).length;
  const recruited = prospects.filter(p => p.markedRecruited).length;
  const sold = prospects.filter(p => p.markedSold).length;
  const pct = n => Math.round((n / total) * 100);
  const stages = [
    { label: 'Logged', count: total, pct: 100, cls: '' },
    { label: 'Converted', count: converted, pct: pct(converted), cls: 'tr-funnel-bar-converted' },
    { label: 'Recruited', count: recruited, pct: pct(recruited), cls: 'tr-funnel-bar-recruit' },
    { label: 'Sold', count: sold, pct: pct(sold), cls: 'tr-funnel-bar-sale' },
  ];
  return (
    <div className="tr-card tr-funnel">
      {title ? <h4 className="tr-h4">{title}</h4> : null}
      <div className="tr-funnel-strip">
        {stages.map(s => (
          <div key={s.label} className="tr-funnel-cell">
            <span className="tr-funnel-num">{s.count}</span>
            <span className="tr-funnel-stage-label">{s.label}{s.label !== 'Logged' ? <span className="tr-funnel-pct"> · {s.pct}%</span> : null}</span>
            <div className="tr-funnel-track"><div className={`tr-funnel-bar ${s.cls}`} style={{ width: `${Math.max(s.pct, s.count > 0 ? 4 : 0)}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProspectCard({ prospect, rank, onDelete, onToggleOutcome, onLogAppointment, onEdit, readOnly, collapsible, apptNames, apptDate }) {
  const [open, setOpen] = useState(!collapsible);
  const total = prospectTotalChecked(prospect);
  const leaning = prospectLeaningKey(prospect);
  const checkedChars = ALL_CHARACTERISTICS.filter(c => prospect[c.key]);
  const stale = isStaleProspect(prospect, apptNames);
  return (
    <div className={`tr-card tr-prospect-card ${collapsible ? 'tr-prospect-card-compact' : ''} ${collapsible && open ? 'tr-prospect-card-open' : ''}`}>
      <div className="tr-policy-head">
        <div
          style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: '1 1 240px', minWidth: 0, cursor: collapsible ? 'pointer' : 'default' }}
          onClick={collapsible ? () => setOpen(o => !o) : undefined}>
          {rank && <span className="tr-prospect-rank" aria-label={`Rank ${rank}`}>{rank}</span>}
          <div style={{ minWidth: 0 }}>
            <strong>{prospect.firstName} {prospect.lastName}</strong>
            <div className="tr-note">
              {prospect.age ? `${prospect.age} yrs · ` : ''}Relationship {prospect.relationshipStrength}/10 · {daysAgoLabel(prospect.createdAt).replace('Logged ', 'added ')}{prospect.source ? ` · ${prospect.source}` : ''}
            </div>
          </div>
        </div>
        <div className="tr-prospect-card-side">
          {apptDate && <span className="tr-type-badge tr-type-badge-appt" title="An appointment is logged with this name">Appt {fmtDisplayDate(apptDate).replace(/^\w+, /, '')}</span>}
          {stale && <span className="tr-type-badge tr-type-badge-stale" title={`Added ${STALE_PROSPECT_DAYS}+ days ago and no appointment logged yet`}>No activity {STALE_PROSPECT_DAYS}d+</span>}
          <span className={`tr-type-badge ${leaning === 'sale' ? 'tr-type-badge-sale' : leaning === 'recruit' ? 'tr-type-badge-recruit' : leaning === 'both' ? 'tr-type-badge-both' : ''}`}>
            {LEANING_LABELS[leaning]}
          </span>
          <span className="tr-score" title={`${total} of 9 characteristics checked`}>
            <span className="tr-score-track"><span className="tr-score-fill" style={{ width: `${(total / 9) * 100}%` }} /></span>
            <span className="tr-mono">{total}/9</span>
          </span>
          {collapsible && !readOnly && onLogAppointment && !open && (
            <button type="button" className="tr-btn tr-btn-sm tr-btn-ghost" onClick={() => onLogAppointment(prospect)} title="Log an appointment for this prospect">
              <CalendarDays size={13} /><span className="tr-hide-mobile"> Log appt</span>
            </button>
          )}
          {collapsible && (
            <button type="button" className="tr-icon-btn tr-prospect-toggle" onClick={() => setOpen(o => !o)} title={open ? 'Collapse' : 'Show details'} aria-expanded={open}>
              {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          )}
          {(!collapsible || open) && onEdit && <button type="button" className="tr-icon-btn" onClick={() => onEdit(prospect)} title="Edit prospect"><Pencil size={14} /></button>}
          {(!collapsible || open) && onDelete && <button type="button" className="tr-icon-btn" onClick={() => onDelete(prospect.id)} title="Delete prospect"><Trash2 size={14} /></button>}
        </div>
      </div>
      {open && <>
      {checkedChars.length > 0 && (
        <div className="tr-prospect-char-pills">
          {checkedChars.map(c => <span key={c.key} className="tr-prospect-char-pill">{c.label}</span>)}
        </div>
      )}
      {prospect.notes && <p className="tr-note" style={{ marginTop: 8 }}>{prospect.notes}</p>}
      <ContactLinks email={prospect.email} />
      {!readOnly && (
      <div className="tr-prospect-outcome-row">
        {onLogAppointment && (
          <button type="button" className="tr-btn tr-btn-sm tr-btn-ghost" onClick={() => onLogAppointment(prospect)}>
            <CalendarDays size={13} /> Log appointment
          </button>
        )}
        <button
          type="button" className={`tr-btn tr-btn-sm ${prospect.markedRecruited ? 'tr-btn-brass' : 'tr-btn-ghost'}`}
          onClick={() => onToggleOutcome(prospect, 'markedRecruited')}>
          {prospect.markedRecruited ? '✓ Recruited' : 'Mark recruited'}
        </button>
        <button
          type="button" className={`tr-btn tr-btn-sm ${prospect.markedSold ? 'tr-btn-brass' : 'tr-btn-ghost'}`}
          onClick={() => onToggleOutcome(prospect, 'markedSold')}>
          {prospect.markedSold ? '✓ Sold' : 'Mark sold'}
        </button>
      </div>
      )}
      </>}
    </div>
  );
}

export function MemoryJoggerPanel() {
  const [openCats, setOpenCats] = useState(() => new Set([0]));
  function toggle(i) {
    setOpenCats(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }
  return (
    <div className="tr-card">
      <h3 className="tr-h3">Memory Jogger</h3>
      <p className="tr-empty" style={{ marginTop: -6 }}>Stuck on who to add next? Work down these — someone on the list almost always jogs a name loose.</p>
      {MEMORY_JOGGER_CATEGORIES.map((cat, i) => {
        const open = openCats.has(i);
        return (
          <div className="tr-bizplan-step" key={cat.title}>
            <button type="button" className="tr-jogger-cat-head" onClick={() => toggle(i)}>
              <h4 className="tr-h4" style={{ margin: 0 }}>{cat.title}</h4>
              {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            {open && (
              <div className="tr-pillrow" style={{ marginTop: 10 }}>
                {cat.items.map(item => <span className="tr-pill-btn" key={item}>{item}</span>)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function SystemsBody({ user, onLogAppointment, initialIntent, onIntentConsumed }) {
  const [prospects, setProspects] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [systemsView, setSystemsView] = useState(initialIntent === 'new' ? 'prospect' : initialIntent === 'jogger' ? 'jogger' : 'list'); // 'prospect' | 'list' | 'recruit' | 'sold' | 'jogger'
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [leaningFilter, setLeaningFilter] = useState('all'); // 'all' | 'sale' | 'recruit' | 'both'
  const [sortBy, setSortBy] = useState('score'); // 'score' | 'newest' | 'oldest'
  const [searchQuery, setSearchQuery] = useState(initialIntent && typeof initialIntent === 'object' && initialIntent.search ? initialIntent.search : '');
  const [editingProspect, setEditingProspect] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const [quickFirst, setQuickFirst] = useState('');
  // The Logged / Converted / Recruited / Sold card opens on a tap.
  const [showStats, setShowStats] = useState(false);
  const [quickLast, setQuickLast] = useState('');
  const [staleOnly, setStaleOnly] = useState(initialIntent === 'stale');

  useEffect(() => { if (initialIntent) onIntentConsumed?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Requests that arrive while this tab is already open (+ New, search).
  const firstIntent = useRef(true);
  useEffect(() => {
    if (firstIntent.current) { firstIntent.current = false; return; }
    if (!initialIntent) return;
    if (initialIntent === 'new') { setEditingProspect(null); setSystemsView('prospect'); }
    else if (initialIntent === 'jogger') setSystemsView('jogger');
    else if (initialIntent === 'stale') { setSystemsView('list'); setStaleOnly(true); }
    else if (typeof initialIntent === 'object' && initialIntent.search) { setSystemsView('list'); setStaleOnly(false); setSearchQuery(initialIntent.search); }
    onIntentConsumed?.();
  }, [initialIntent]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(async () => {
    setLoading(true);
    const [p, a] = await Promise.all([fetchMyProspects(user.id), fetchMyAppointments(user.id)]);
    setProspects(p);
    setAppointments(a);
    setLoading(false);
  }, [user.id]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(''), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  // Most recent appointment per client name, so prospect cards can show
  // "Appt Oct 5" once they've been booked.
  const apptNames = new Set();
  const latestApptByName = {};
  appointments.forEach(a => {
    const k = normName(a.client);
    apptNames.add(k);
    if (!latestApptByName[k] || a.appointmentDate > latestApptByName[k]) latestApptByName[k] = a.appointmentDate;
  });

  async function handleSubmit(form, { another } = {}) {
    setSaving(true);
    setError('');
    if (editingProspect) {
      const res = await updateProspect(editingProspect.id, form);
      setSaving(false);
      if (!res.ok) { setError(res.error || 'Could not save. Try again.'); return; }
      setProspects(prev => prev.map(p => p.id === editingProspect.id ? res.record : p));
      setEditingProspect(null);
      setSystemsView('list');
      return;
    }
    const res = await insertProspect(user.id, form);
    setSaving(false);
    if (!res.ok) { setError(res.error || 'Could not save. Try again.'); return; }
    setProspects(prev => [res.record, ...prev]);
    setFlash(`Saved ${res.record.firstName} ${res.record.lastName}.`);
    if (another) { setFormKey(k => k + 1); window.scrollTo(0, 0); } else setSystemsView('list');
  }
  async function handleQuickAdd(e) {
    e.preventDefault();
    if (!quickFirst.trim() || !quickLast.trim()) { setError('Enter a first and last name to quick-add.'); return; }
    setError('');
    setSaving(true);
    const blank = { firstName: quickFirst, lastName: quickLast, age: '', relationshipStrength: 5, notes: '', source: '' };
    ALL_CHARACTERISTICS.forEach(c => { blank[c.key] = false; });
    const res = await insertProspect(user.id, blank);
    setSaving(false);
    if (!res.ok) { setError(res.error || 'Could not save. Try again.'); return; }
    setProspects(prev => [res.record, ...prev]);
    setQuickFirst(''); setQuickLast('');
    setSortBy('newest');
    setFlash(`Added ${res.record.firstName} ${res.record.lastName} — open them and tap the pencil to score them.`);
  }
  function handleEdit(prospect) {
    setEditingProspect(prospect);
    setSystemsView('prospect');
  }
  async function handleDelete(id) {
    if (!window.confirm("Delete this prospect? This can't be undone.")) return;
    const prev = prospects;
    setProspects(prospects.filter(p => p.id !== id));
    const ok = await deleteProspect(id);
    if (!ok) setProspects(prev);
  }
  async function handleToggleOutcome(prospect, field) {
    const nextValue = !prospect[field];
    const prev = prospects;
    setProspects(prospects.map(p => p.id === prospect.id ? { ...p, [field]: nextValue } : p));
    const ok = await updateProspectOutcome(prospect.id, { [field]: nextValue });
    if (!ok) setProspects(prev);
  }

  const sorters = {
    score: (a, b) => prospectTotalChecked(b) - prospectTotalChecked(a),
    newest: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''),
    oldest: (a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''),
  };
  // List is purely for active prospecting — once marked recruited and/or
  // sold, a prospect moves out of List and lives in those tabs instead
  // (both, if marked as both).
  function bySearch(list) {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.trim().toLowerCase();
    return list.filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q));
  }
  const listAll = prospects.filter(p => !p.markedRecruited && !p.markedSold);
  const staleCount = listAll.filter(p => isStaleProspect(p, apptNames)).length;
  const recruitedAll = prospects.filter(p => p.markedRecruited);
  const soldAll = prospects.filter(p => p.markedSold);
  const listSorted = bySearch(listAll
    .filter(p => leaningFilter === 'all' || prospectLeaningKey(p) === leaningFilter)
    .filter(p => !staleOnly || isStaleProspect(p, apptNames))).sort(sorters[sortBy]);
  const recruitedProspects = bySearch(recruitedAll).sort(sorters[sortBy]);
  const soldProspects = bySearch(soldAll).sort(sorters[sortBy]);

  const activeList = systemsView === 'recruit' ? recruitedProspects : systemsView === 'sold' ? soldProspects : listSorted;
  const activeTitle = systemsView === 'recruit' ? 'Recruited' : systemsView === 'sold' ? 'Sold' : 'Prospects';
  const activeSub = systemsView === 'recruit' ? 'Prospects you marked as recruited.' : systemsView === 'sold' ? 'Prospects you marked as sold.'
    : `${listAll.length} active · ranked by how many of the 9 characteristics they meet`;
  const activeEmpty = systemsView === 'recruit' ? 'No prospects marked recruited yet.' : systemsView === 'sold' ? 'No prospects marked sold yet.'
    : searchQuery || leaningFilter !== 'all' || staleOnly ? 'No prospects match this search or filter.' : 'No prospects yet — quick-add a name above, or use New prospect to score them as you go.';

  const sideBtn = (v, label, color, count) => (
    <button
      type="button" className={`tr-sidebar-item tr-sidebar-item-${color} ${systemsView === v ? 'tr-sidebar-item-active' : ''}`}
      onClick={() => { if (v === 'prospect') setEditingProspect(null); setSystemsView(v); }}>
      <span>{label}</span>
      {count !== undefined && <span className="tr-mono">{count}</span>}
    </button>
  );

  return (
    <div className="tr-appts-shell">
      <nav className="tr-appts-sidebar">
        {sideBtn('list', 'Active', 'week', listAll.length)}
        {sideBtn('recruit', 'Recruit', 'recruit', recruitedAll.length)}
        {sideBtn('sold', 'Sold', 'sale', soldAll.length)}
        <div className="tr-sidebar-divider">Tools</div>
        {sideBtn('jogger', 'Memory Jogger', 'none')}
      </nav>
      <div className="tr-appts-main">
        {error && <div className="tr-error">{error}</div>}
        {flash && <div className="tr-flash">{flash}</div>}
        {systemsView === 'prospect' ? (
          <ProspectForm
            key={`${editingProspect ? editingProspect.id : 'new'}-${formKey}`}
            editing={editingProspect}
            onCancel={() => { setEditingProspect(null); setSystemsView('list'); }}
            onSubmit={handleSubmit} saving={saving}
            onOpenJogger={() => setSystemsView('jogger')} />
        ) : systemsView === 'jogger' ? (
          <>
            <MemoryJoggerPanel />
            <button type="button" className="tr-btn tr-btn-brass" style={{ alignSelf: 'flex-start' }} onClick={() => { setEditingProspect(null); setSystemsView('prospect'); }}>
              <Plus size={16} /> Thought of someone? Add them
            </button>
          </>
        ) : (
          <>
            <PageHead title={activeTitle} sub={activeSub}>
              {systemsView === 'list' && prospects.length > 0 ? (
                <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" aria-expanded={showStats} onClick={() => setShowStats(v => !v)}>{showStats ? 'Hide stats' : 'Stats'}</button>
              ) : null}
            </PageHead>
            {systemsView === 'list' && showStats && <ProspectFunnel prospects={prospects} />}
            {systemsView === 'list' && (
              <form className="tr-card tr-quickadd" onSubmit={handleQuickAdd}>
                <span className="tr-quickadd-label">Quick add</span>
                <input value={quickFirst} onChange={e => setQuickFirst(e.target.value)} placeholder="First name" aria-label="First name" />
                <input value={quickLast} onChange={e => setQuickLast(e.target.value)} placeholder="Last name" aria-label="Last name" />
                <button type="submit" className="tr-btn tr-btn-ghost tr-btn-sm" disabled={saving}><Plus size={14} /> Add</button>
                <button type="button" className="tr-link-btn tr-quickadd-more" onClick={() => { setEditingProspect(null); setSystemsView('prospect'); }}>Add with details</button>
              </form>
            )}
            <div className="tr-toolbar">
              <div className="tr-search-row">
                <Search size={15} className="tr-search-icon" />
                <input
                  className="tr-search-input" type="text" placeholder="Search by name…"
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                {searchQuery && (
                  <button type="button" className="tr-icon-btn" onClick={() => setSearchQuery('')} title="Clear search"><X size={15} /></button>
                )}
              </div>
              <select className="tr-toolbar-select" value={sortBy} onChange={e => setSortBy(e.target.value)} aria-label="Sort prospects">
                <option value="score">Best match first</option>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>
            {systemsView === 'list' && (
              <div className="tr-filterbar">
                <div className="tr-seg" role="group" aria-label="Show">
                  {[['all', 'All'], ['sale', 'Sale'], ['recruit', 'Recruit'], ['both', 'Both']].map(([v, label]) => (
                    <button key={v} type="button" className={leaningFilter === v ? 'tr-seg-on' : ''} aria-pressed={leaningFilter === v} onClick={() => setLeaningFilter(v)}>{label}</button>
                  ))}
                </div>
                {(staleCount > 0 || staleOnly) && (
                  <button type="button" className={`tr-chip-toggle ${staleOnly ? 'tr-chip-toggle-on' : ''}`} aria-pressed={staleOnly} onClick={() => setStaleOnly(v => !v)}
                    title={`Added ${STALE_PROSPECT_DAYS}+ days ago with no appointment logged yet`}>
                    <span className="tr-chip-dot" /> {staleCount} with no activity in {STALE_PROSPECT_DAYS}+ days
                    {staleOnly ? <X size={13} /> : null}
                  </button>
                )}
              </div>
            )}
            {loading ? <SkeletonCards count={3} /> : activeList.length === 0 ? (
              <div className="tr-card"><p className="tr-empty">{activeEmpty}</p></div>
            ) : (
              <div className="tr-prospect-list">
                {activeList.map((p, i) => (
                  <ProspectCard
                    key={p.id} prospect={p} rank={sortBy === 'score' ? i + 1 : null} collapsible
                    apptNames={apptNames} apptDate={latestApptByName[prospectNameKey(p)]}
                    onDelete={handleDelete} onToggleOutcome={handleToggleOutcome} onLogAppointment={onLogAppointment} onEdit={handleEdit} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
