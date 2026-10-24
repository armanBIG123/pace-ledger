// Tab lists, the tab bar / phone bottom bar, and the Android back button.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BookUser, Calendar, ChevronDown, ChevronRight, ClipboardCheck, DollarSign, FolderOpen, Kanban, LayoutDashboard, Menu, Network, Plus, Sun, TrendingUp, UserCog, Users } from 'lucide-react';
import { minimizeAndroidApp, onAndroidBack } from '../native.js';

// ---------------------------------------------------------------------
// Tab navigation — a tab strip on desktop/tablet, and an app-style bar
// fixed to the bottom of the screen on phones (up to five tabs, or four plus
// a "More" sheet, and a + in the middle for adding or logging anything), so
// nothing hides off the edge of the screen.
// ---------------------------------------------------------------------
// Pipeline = Prospecting + My Appointments + Follow Up; Growth = Milestones
// + Business Plan + paycheck; Resources = Documents (PDFs, PowerPoints and
// important links), on the phone's bottom bar too.
export const MY_WORK_TABS = [
  { id: 'overview', label: 'Today', short: 'Today', Icon: Sun },
  { id: 'pipeline', label: 'Pipeline', short: 'Pipeline', Icon: Kanban },
  { id: 'calendar', label: 'Calendar', short: 'Calendar', Icon: Calendar },
  { id: 'growth', label: 'Growth', short: 'Growth', Icon: TrendingUp },
  { id: 'resources', label: 'Resources', short: 'Resources', Icon: FolderOpen },
];

export const TEAM_TABS = [
  { id: 'teamhome', label: 'Overview', short: 'Overview', Icon: LayoutDashboard },
  { id: 'teamsystems', label: 'Team Prospecting', short: 'Prospects', Icon: Users },
  { id: 'pace', label: 'Team Pace', short: 'Pace', Icon: TrendingUp },
  { id: 'production', label: 'Track Production', short: 'Production', Icon: DollarSign },
  { id: 'org', label: 'Org Chart', short: 'Org', Icon: Network },
];

export const ADMIN_TEAM_TABS = [...TEAM_TABS, { id: 'profiles', label: 'Profiles', short: 'Profiles', Icon: BookUser }, { id: 'clientforms', label: 'Client Forms', short: 'Forms', Icon: ClipboardCheck }, { id: 'users', label: 'Manage Team', short: 'Manage', Icon: UserCog }];
// Super Managers: the same, minus Profiles (the Galaxy's partner records).
export const SUPER_MANAGER_TEAM_TABS = ADMIN_TEAM_TABS.filter(t => t.id !== 'profiles');

// Which tabs fit in the top strip: the first ones in order, always
// including the one you're on, leaving room for "More" if any don't fit.
// widths: each tab's width; avail: the strip's width.
export function fitTabs(widths, activeIndex, avail, moreWidth, gap = 2) {
  const n = widths.length;
  const sum = list => list.reduce((s, i) => s + widths[i], 0) + Math.max(0, list.length - 1) * gap;
  const all = [...Array(n).keys()];
  if (sum(all) <= avail) return all;
  let best = activeIndex >= 0 ? [activeIndex] : [];
  for (let k = 1; k <= n; k++) {
    const pick = all.slice(0, k);
    if (activeIndex >= 0 && !pick.includes(activeIndex)) pick[pick.length - 1] = activeIndex;
    if (sum(pick) + gap + moreWidth > avail) break;
    best = pick;
  }
  return best;
}

// The top tab strip (tablet and desktop): every tab when there's room;
// otherwise the ones that fit and a "More" menu with the rest, so no tab is
// ever hidden off the edge.
function TabStrip({ tabs, tab, onSelect }) {
  const stripRef = useRef(null);
  const measureRef = useRef(null);
  const moreRef = useRef(null);
  const [shown, setShown] = useState(null); // indexes of tabs in the strip; null = all
  const [menu, setMenu] = useState(null); // { top, left } while the More menu is open
  const activeIndex = tabs.findIndex(t => t.id === tab);
  const ids = tabs.map(t => t.id).join(',');
  useLayoutEffect(() => {
    const strip = stripRef.current, measure = measureRef.current;
    if (!strip || !measure) return undefined;
    const calc = () => {
      const avail = strip.clientWidth;
      if (!avail) return; // hidden: phones use the bottom bar
      const items = [...measure.children].map(el => el.getBoundingClientRect().width);
      const moreWidth = items.pop();
      const pick = fitTabs(items, activeIndex, avail, moreWidth);
      const next = pick.length === tabs.length ? null : pick;
      // (only re-render when the set of tabs that fit actually changes)
      setShown(prev => (String(prev) === String(next) ? prev : next));
    };
    calc();
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(calc); ro.observe(strip); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(calc).catch(() => {});
    return () => { if (ro) ro.disconnect(); };
  }, [ids, activeIndex]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!menu) return undefined;
    const close = e => { if (e.type === 'keydown' && e.key !== 'Escape') return; if (e.type === 'mousedown' && e.target.closest && e.target.closest('.tr-navmore-menu, .tr-navtab-more')) return; setMenu(null); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); };
  }, [menu]);
  const go = id => { setMenu(null); onSelect(id); window.scrollTo(0, 0); };
  const visible = shown ? shown.map(i => tabs[i]) : tabs;
  const rest = shown ? tabs.filter((_, i) => !shown.includes(i)) : [];
  const tabButton = t => (
    <button key={t.id} type="button" className={`tr-navtab ${tab === t.id ? 'tr-navtab-on' : ''}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>{t.label}</button>
  );
  return (
    <>
      <div className="tr-navtabs" ref={stripRef}>
        {visible.map(tabButton)}
        {rest.length ? (
          <button
            type="button" ref={moreRef} className="tr-navtab tr-navtab-more" aria-expanded={!!menu} aria-controls="tr-navmore-menu"
            onClick={() => { if (menu) { setMenu(null); return; } const r = moreRef.current.getBoundingClientRect(); setMenu({ top: Math.round(r.bottom + 4), left: Math.round(Math.min(r.left, window.innerWidth - 228)) }); }}>
            More <ChevronDown size={14} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {/* Every tab's width, measured out of sight. */}
      <div className="tr-navtabs-measure" ref={measureRef} aria-hidden="true">
        {tabs.map(t => <span key={t.id}>{t.label}</span>)}
        <span>More <ChevronDown size={14} /></span>
      </div>
      {menu ? (
        <div className="tr-navmore-menu" id="tr-navmore-menu" style={{ top: menu.top, left: menu.left }}>
          {rest.map(t => (
            <button key={t.id} type="button" className={tab === t.id ? 'tr-navmore-on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
              <t.Icon size={16} aria-hidden="true" /><span>{t.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function TabNav({ tabs, tab, onSelect, onNew }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = tabs.length > 5 ? tabs.slice(0, 4) : tabs;
  const overflow = tabs.length > 5 ? tabs.slice(4) : [];
  const inOverflow = overflow.some(t => t.id === tab);
  function pick(id) {
    setMoreOpen(false);
    onSelect(id);
    window.scrollTo(0, 0);
  }
  return (
    <>
      <TabStrip tabs={tabs} tab={tab} onSelect={onSelect} />
      <nav className="tr-bottomnav" aria-label="Main">
        {(() => {
          const items = primary.map(({ id, short, Icon }) => (
            <button key={id} type="button" className={tab === id ? 'tr-bottomnav-on' : ''} onClick={() => pick(id)} aria-current={tab === id ? 'page' : undefined}>
              <Icon size={21} /><span>{short}</span>
            </button>
          ));
          if (overflow.length > 0) items.push(
            <button key="more" type="button" className={inOverflow || moreOpen ? 'tr-bottomnav-on' : ''} onClick={() => setMoreOpen(o => !o)} aria-expanded={moreOpen}>
              <Menu size={21} /><span>{inOverflow ? overflow.find(t => t.id === tab).short : 'More'}</span>
            </button>
          );
          // + sits in the middle of the bar.
          if (onNew) items.splice(Math.floor(items.length / 2), 0,
            <button key="new" type="button" className="tr-bottomnav-new" onClick={() => { setMoreOpen(false); onNew(null); }} aria-label="Add or log something" aria-haspopup="menu">
              <span className="tr-bottomnav-plus"><Plus size={24} strokeWidth={2.4} /></span>
            </button>
          );
          return items;
        })()}
      </nav>
      {moreOpen && (
        <div className="tr-sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="tr-sheet" onClick={e => e.stopPropagation()}>
            <div className="tr-sheet-grip" />
            {overflow.map(({ id, label, Icon }) => (
              <button key={id} type="button" className={`tr-sheet-item ${tab === id ? 'tr-sheet-item-on' : ''}`} onClick={() => pick(id)}>
                <Icon size={19} /><span>{label}</span><ChevronRight size={16} />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// Android Back button on screens with nowhere to go back to (sign-in,
// loading): leaves the app, like other apps.
export function AndroidBackLeavesApp() {
  useEffect(() => onAndroidBack(minimizeAndroidApp), []);
  return null;
}

// Android Back button: closes an open window or sheet first, then returns
// to Today, then (on Today) puts the app in the background like other apps.
export function useAndroidBackButton(tab, goHome) {
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const homeRef = useRef(goHome);
  homeRef.current = goHome;
  useEffect(() => onAndroidBack(() => {
    // An announcement that has to be confirmed stays until it is.
    if (document.querySelector('.tr-ann-gate')) return;
    const searchCancel = document.querySelector('.tr-search-cancel');
    if (searchCancel) { searchCancel.click(); return; }
    const overlays = document.querySelectorAll('.tr-modal-backdrop, .tr-sheet-backdrop, .tr-new-backdrop');
    if (overlays.length) { overlays[overlays.length - 1].click(); return; }
    const formSheet = document.querySelector('.tr-fsheet-close');
    if (formSheet) { formSheet.click(); return; }
    // A screen showing one item (a profile) goes back to its list first.
    const inner = document.querySelector('[data-android-back]');
    if (inner) { inner.click(); return; }
    if (tabRef.current !== 'overview') { homeRef.current(); window.scrollTo(0, 0); return; }
    minimizeAndroidApp();
  }), []);
}
