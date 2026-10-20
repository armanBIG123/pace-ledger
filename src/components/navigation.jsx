// Tab lists, the tab bar / phone bottom bar, and the Android back button.
import { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronRight, ClipboardCheck, DollarSign, FolderOpen, Kanban, LayoutDashboard, Menu, Network, Plus, Sun, TrendingUp, UserCog, Users } from 'lucide-react';
import { minimizeAndroidApp, onAndroidBack } from '../native.js';

// ---------------------------------------------------------------------
// Tab navigation — a tab strip on desktop/tablet, and an app-style bar
// fixed to the bottom of the screen on phones (up to five tabs, or four plus
// a "More" sheet, and a + in the middle for adding or logging anything), so
// nothing hides off the edge of the screen.
// ---------------------------------------------------------------------
// Pipeline = Prospecting + My Appointments + Follow Up; Growth = Milestones
// + Business Plan + paycheck; Resources = Documents. `phone: false` keeps a
// tab off the phone's bottom bar (Resources sits inside Growth there).
export const MY_WORK_TABS = [
  { id: 'overview', label: 'Today', short: 'Today', Icon: Sun },
  { id: 'pipeline', label: 'Pipeline', short: 'Pipeline', Icon: Kanban },
  { id: 'calendar', label: 'Calendar', short: 'Calendar', Icon: Calendar },
  { id: 'growth', label: 'Growth', short: 'Growth', Icon: TrendingUp },
  { id: 'resources', label: 'Resources', short: 'Resources', Icon: FolderOpen, phone: false },
];

export const TEAM_TABS = [
  { id: 'teamhome', label: 'Overview', short: 'Overview', Icon: LayoutDashboard },
  { id: 'teamsystems', label: 'Team Prospecting', short: 'Prospects', Icon: Users },
  { id: 'pace', label: 'Team Pace', short: 'Pace', Icon: TrendingUp },
  { id: 'production', label: 'Track Production', short: 'Production', Icon: DollarSign },
  { id: 'org', label: 'Org Chart', short: 'Org', Icon: Network },
];

export const ADMIN_TEAM_TABS = [...TEAM_TABS, { id: 'clientforms', label: 'Client Forms', short: 'Forms', Icon: ClipboardCheck }, { id: 'users', label: 'Manage Team', short: 'Manage', Icon: UserCog }];

export function TabNav({ tabs, tab, onSelect, onNew }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const barTabs = tabs.filter(t => t.phone !== false);
  const primary = barTabs.length > 5 ? barTabs.slice(0, 4) : barTabs;
  const overflow = barTabs.length > 5 ? barTabs.slice(4) : [];
  const inOverflow = overflow.some(t => t.id === tab);
  function pick(id) {
    setMoreOpen(false);
    onSelect(id);
    window.scrollTo(0, 0);
  }
  return (
    <>
      <div className="tr-navtabs">
        {tabs.map(t => (
          <button key={t.id} type="button" className={`tr-navtab ${tab === t.id ? 'tr-navtab-on' : ''}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => { onSelect(t.id); window.scrollTo(0, 0); }}>{t.label}</button>
        ))}
      </div>
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
    const searchCancel = document.querySelector('.tr-search-cancel');
    if (searchCancel) { searchCancel.click(); return; }
    const overlays = document.querySelectorAll('.tr-modal-backdrop, .tr-sheet-backdrop, .tr-new-backdrop');
    if (overlays.length) { overlays[overlays.length - 1].click(); return; }
    const formSheet = document.querySelector('.tr-fsheet-close');
    if (formSheet) { formSheet.click(); return; }
    if (tabRef.current !== 'overview') { homeRef.current(); window.scrollTo(0, 0); return; }
    minimizeAndroidApp();
  }), []);
}
