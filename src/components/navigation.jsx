// Tab lists, the tab bar / phone bottom bar, and the Android back button.
import { useEffect, useRef, useState } from 'react';
import { Award, Calendar, CalendarDays, ChevronRight, ClipboardCheck, DollarSign, FileText, Menu, Network, Sun, TrendingUp, UserCog, UserPlus, Users } from 'lucide-react';
import { minimizeAndroidApp, onAndroidBack } from '../native.js';

// ---------------------------------------------------------------------
// Tab navigation — a tab strip on desktop/tablet, and an app-style bar
// fixed to the bottom of the screen on phones (first four tabs plus a
// "More" sheet for the rest), so nothing hides off the edge of the screen.
// ---------------------------------------------------------------------
export const MY_WORK_TABS = [
  { id: 'overview', label: 'Today', short: 'Today', Icon: Sun },
  { id: 'systems', label: 'Prospecting', short: 'Prospect', Icon: UserPlus },
  { id: 'mine', label: 'My Appointments', short: 'Appts', Icon: CalendarDays },
  { id: 'followup', label: 'Follow Up', short: 'Follow Up', Icon: ClipboardCheck },
  { id: 'bizplan', label: 'Business Plan', short: 'Biz Plan', Icon: DollarSign },
  { id: 'calendar', label: 'Calendar', short: 'Calendar', Icon: Calendar },
  { id: 'milestones', label: 'Milestones', short: 'Milestones', Icon: Award },
  { id: 'documents', label: 'Documents', short: 'Documents', Icon: FileText },
];

export const TEAM_TABS = [
  { id: 'teamsystems', label: 'Team Prospecting', short: 'Prospecting', Icon: Users },
  { id: 'pace', label: 'Team Pace', short: 'Pace', Icon: TrendingUp },
  { id: 'production', label: 'Track Production', short: 'Production', Icon: DollarSign },
  { id: 'org', label: 'Org Chart', short: 'Org', Icon: Network },
];

export const ADMIN_TEAM_TABS = [...TEAM_TABS, { id: 'users', label: 'Manage Team', short: 'Manage', Icon: UserCog }];

export function TabNav({ tabs, tab, onSelect }) {
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
      <div className="tr-navtabs">
        {tabs.map(t => (
          <button key={t.id} type="button" className={`tr-navtab ${tab === t.id ? 'tr-navtab-on' : ''}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => { onSelect(t.id); window.scrollTo(0, 0); }}>{t.label}</button>
        ))}
      </div>
      <nav className="tr-bottomnav" aria-label="Main">
        {primary.map(({ id, short, Icon }) => (
          <button key={id} type="button" className={tab === id ? 'tr-bottomnav-on' : ''} onClick={() => pick(id)} aria-current={tab === id ? 'page' : undefined}>
            <Icon size={21} /><span>{short}</span>
          </button>
        ))}
        {overflow.length > 0 && (
          <button type="button" className={inOverflow || moreOpen ? 'tr-bottomnav-on' : ''} onClick={() => setMoreOpen(o => !o)} aria-expanded={moreOpen}>
            <Menu size={21} /><span>{inOverflow ? overflow.find(t => t.id === tab).short : 'More'}</span>
          </button>
        )}
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
    const overlays = document.querySelectorAll('.tr-modal-backdrop, .tr-sheet-backdrop');
    if (overlays.length) { overlays[overlays.length - 1].click(); return; }
    if (tabRef.current !== 'overview') { homeRef.current(); window.scrollTo(0, 0); return; }
    minimizeAndroidApp();
  }), []);
}
