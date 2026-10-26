// Search, sort and "hide people with nothing" for the team lists (Team
// Pace and its views, Track Production, Team Prospecting, Manage Team).
//
// - One search for all of them: type "tasha" on Pace, switch to
//   Production, and it's still looking for Tasha (for this visit).
// - Sort by a column (tap its heading on a computer; "Sort" on a phone).
//   Each list remembers its sort on this device.
// - People with nothing to show (no sales or recruits this week, no
//   prospects...) fold into one line under the list, with their names, so
//   a manager still sees who they are. Searching always shows everyone who
//   matches.
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Search, X } from 'lucide-react';

// ---- The shared search --------------------------------------------------------------
const SEARCH_KEY = 'pl_team_search';
let query = (() => { try { return sessionStorage.getItem(SEARCH_KEY) || ''; } catch { return ''; } })();
const listeners = new Set();
function setQuery(v) {
  query = v;
  try { if (v) sessionStorage.setItem(SEARCH_KEY, v); else sessionStorage.removeItem(SEARCH_KEY); } catch { /* private window */ }
  listeners.forEach(fn => fn(v));
}
export function usePeopleSearch() {
  const [q, setQ] = useState(query);
  useEffect(() => {
    listeners.add(setQ);
    setQ(query);
    return () => { listeners.delete(setQ); };
  }, []);
  return [q, setQuery];
}

const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Does this person match what's typed? Each word typed has to start one of
// their names ("tas wil" finds Tasha Williams), or what's typed appears in
// their full name ("delgado-wash") or starts their email.
export function personMatches(person, q) {
  const typed = fold(q);
  if (!typed) return true;
  const name = fold(person.display_name || person.name || '');
  if (name.includes(typed)) return true;
  const words = name.split(/[\s\-'.]+/).filter(Boolean);
  if (typed.split(/\s+/).every(t => words.some(w => w.startsWith(t)))) return true;
  const email = fold(person.email || '');
  return !!email && email.startsWith(typed);
}

// ---- Sorting -----------------------------------------------------------------------
// sorts: { key: { label, value(row), dir: 'asc' | 'desc' (first tap) } }.
// The name sort is always there as 'name'. Ties go by name.
export function useSort(storageKey, sorts, initial = 'name') {
  const read = () => {
    try {
      const v = JSON.parse(localStorage.getItem(`pl_sort_${storageKey}`) || 'null');
      if (v && sorts[v.key] && (v.dir === 'asc' || v.dir === 'desc')) return v;
    } catch { /* ignore */ }
    return { key: initial, dir: (sorts[initial] || {}).dir || 'asc' };
  };
  const [sort, setSortState] = useState(read);
  function setSort(next) {
    setSortState(next);
    try { localStorage.setItem(`pl_sort_${storageKey}`, JSON.stringify(next)); } catch { /* ignore */ }
  }
  // A heading tapped: that column, or the other way round if it already is.
  function toggle(key) {
    if (sort.key === key) setSort({ key, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    else setSort({ key, dir: (sorts[key] || {}).dir || 'asc' });
  }
  function apply(rows, nameOf) {
    const s = sorts[sort.key] || sorts.name;
    const by = s.value;
    const dir = sort.dir === 'desc' ? -1 : 1;
    return rows.slice().sort((a, b) => {
      const x = by(a), y = by(b);
      const c = typeof x === 'string' || typeof y === 'string' ? String(x || '').localeCompare(String(y || '')) : (Number(x) || 0) - (Number(y) || 0);
      return (c * dir) || String(nameOf(a) || '').localeCompare(String(nameOf(b) || ''));
    });
  }
  return { sort, setSort, toggle, apply, sorts };
}

// A column heading you can tap to sort by.
export function SortHeader({ label, sortKey, sorter, className = '' }) {
  const on = sorter.sort.key === sortKey;
  const dir = on ? sorter.sort.dir : null;
  return (
    <th className={`tr-sortable ${on ? 'tr-sortable-on' : ''} ${className}`} aria-sort={on ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => sorter.toggle(sortKey)} title={`Sort by ${String(label).toLowerCase()}`}>
        {label}
        <span className="tr-sort-arrow" aria-hidden="true">{on ? (dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowDown size={12} />}</span>
      </button>
    </th>
  );
}

// ---- Hiding the empty rows ------------------------------------------------------------
export function useHideEmpty(storageKey, initial = true) {
  const [hide, setHideState] = useState(() => {
    try { const v = localStorage.getItem(`pl_hide_${storageKey}`); return v === null ? initial : v === '1'; } catch { return initial; }
  });
  function setHide(v) {
    setHideState(v);
    try { localStorage.setItem(`pl_hide_${storageKey}`, v ? '1' : '0'); } catch { /* ignore */ }
  }
  return [hide, setHide];
}

// The rows to show, the ones folded away, and how many matched.
// isEmpty(row): nothing to show for them. Searching shows every match,
// and if everyone would fold away, nobody does (an empty table helps no one).
export function usePeopleRows(rows, { personOf = r => r, isEmpty = null, hideEmpty = false, sorter = null }) {
  const [q] = usePeopleSearch();
  const matched = rows.filter(r => personMatches(personOf(r), q));
  const sorted = sorter ? sorter.apply(matched, r => personOf(r).display_name) : matched;
  let shown = sorted, folded = [];
  if (isEmpty && hideEmpty && !q.trim()) {
    const empty = sorted.filter(isEmpty);
    if (empty.length && empty.length < sorted.length) {
      shown = sorted.filter(r => !isEmpty(r));
      folded = empty.slice().sort((a, b) => String(personOf(a).display_name || '').localeCompare(String(personOf(b).display_name || '')));
    }
  }
  return { shown, folded, matched: matched.length, total: rows.length, query: q };
}

// The bar over a list: search, how many match, the fold toggle and (on a
// phone, where the headings are hidden) Sort.
export function PeopleToolbar({ total, matched, hideEmpty, onHideEmpty, emptyLabel, foldedCount = 0, sorter = null, placeholder = 'Find someone…' }) {
  const [q, setQ] = usePeopleSearch();
  const sortKeys = sorter ? Object.keys(sorter.sorts) : [];
  return (
    <div className="tr-plist-bar">
      <div className="tr-search-row tr-plist-search">
        <Search size={15} className="tr-search-icon" aria-hidden="true" />
        <input className="tr-search-input" type="search" value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape' && q) { e.preventDefault(); e.stopPropagation(); setQ(''); } }}
          placeholder={placeholder} aria-label="Find someone on your team" autoComplete="off" autoCapitalize="words" spellCheck={false} />
        {q ? <button type="button" className="tr-icon-btn" onClick={() => setQ('')} aria-label="Clear the search" title="Clear"><X size={15} /></button> : null}
      </div>
      {sorter ? (
        <label className="tr-plist-sort">
          <span>Sort</span>
          <select value={`${sorter.sort.key}:${sorter.sort.dir}`} onChange={e => { const [key, dir] = e.target.value.split(':'); sorter.setSort({ key, dir }); }} aria-label="Sort the list">
            {sortKeys.flatMap(k => {
              const s = sorter.sorts[k];
              const pair = s.options || (k === 'name' ? [['asc', 'Name A–Z'], ['desc', 'Name Z–A']] : [['desc', `${s.label}: most first`], ['asc', `${s.label}: fewest first`]]);
              return pair.map(([dir, label]) => <option key={`${k}:${dir}`} value={`${k}:${dir}`}>{label}</option>);
            })}
          </select>
        </label>
      ) : null}
      {onHideEmpty && !q ? (
        <button type="button" className={`tr-chip-toggle tr-plist-fold ${hideEmpty ? 'tr-chip-toggle-on' : ''}`} aria-pressed={hideEmpty} onClick={() => onHideEmpty(!hideEmpty)}>
          <span className="tr-chip-dot" aria-hidden="true" />{emptyLabel}{hideEmpty && foldedCount ? ` (${foldedCount})` : ''}
        </button>
      ) : null}
      <span className="tr-plist-count" role="status" aria-live="polite">
        {q ? (matched === 0 ? `No one matches "${q.trim()}"` : `${matched} of ${total} match`) : ''}
      </span>
    </div>
  );
}

// The folded-away people, in one line under the list.
export function FoldedPeople({ people, label, onShow, nameOf = p => p.display_name }) {
  const [open, setOpen] = useState(false);
  if (!people.length) return null;
  const names = people.map(nameOf);
  const SHOWN = 6;
  const list = open ? names : names.slice(0, SHOWN);
  return (
    <div className="tr-plist-folded">
      <div className="tr-plist-folded-text">
        <strong>{label} ({people.length})</strong>
        <span>{list.join(', ')}{!open && names.length > SHOWN ? <>, <button type="button" className="tr-link-btn" onClick={() => setOpen(true)}>and {names.length - SHOWN} more</button></> : null}</span>
      </div>
      <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onShow}>Show them in the list</button>
    </div>
  );
}

// "No one matches" inside a card.
export function NoMatches({ onClear }) {
  const [q, setQ] = usePeopleSearch();
  return (
    <div className="tr-plist-none">
      <p className="tr-empty">No one here matches "{q.trim()}".</p>
      <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => { setQ(''); if (onClear) onClear(); }}>Clear the search</button>
    </div>
  );
}

