// The three app layouts: advisor, manager/leader and super admin.
import { Suspense, useEffect, useState } from 'react';
import { prospectToAppointmentPrefill } from '../data/prospects.js';
import { GroupSwitch, Shell } from '../components/ui.jsx';
import { Header } from '../components/Header.jsx';
import { ADMIN_TEAM_TABS, MY_WORK_TABS, TabNav, TEAM_TABS, useAndroidBackButton } from '../components/navigation.jsx';
import { GlobalSearch, useNewMenu } from '../components/quickActions.jsx';
import { useAppointmentReminders } from '../components/reminders.jsx';
import { lazyScreen, prefetchScreens, ScreenBoundary, ScreenLoading } from '../components/lazyScreen.jsx';
import { TodayBody } from '../screens/Today.jsx';

// Today is part of the app itself; every other screen loads when it's
// first opened (and in the background a moment after Today shows).
const MyAppointmentsBody = lazyScreen(() => import('../screens/Appointments.jsx'), 'MyAppointmentsBody');
const CalendarBody = lazyScreen(() => import('../screens/Calendar.jsx'), 'CalendarBody');
const BusinessPlanBody = lazyScreen(() => import('../screens/BusinessPlan.jsx'), 'BusinessPlanBody');
const SystemsBody = lazyScreen(() => import('../screens/Prospecting.jsx'), 'SystemsBody');
const MilestonesBody = lazyScreen(() => import('../screens/Milestones.jsx'), 'MilestonesBody');
const DocumentsBody = lazyScreen(() => import('../screens/Documents.jsx'), 'DocumentsBody');
const FollowUpBody = lazyScreen(() => import('../screens/FollowUp.jsx'), 'FollowUpBody');
const TeamOverviewBody = lazyScreen(() => import('../screens/team/TeamOverview.jsx'), 'TeamOverviewBody');
const TeamPaceBody = lazyScreen(() => import('../screens/team/TeamPace.jsx'), 'TeamPaceBody');
const TeamProspectingBody = lazyScreen(() => import('../screens/team/TeamProspecting.jsx'), 'TeamProspectingBody');
const TrackProductionBody = lazyScreen(() => import('../screens/team/TrackProduction.jsx'), 'TrackProductionBody');
const OrgChartBody = lazyScreen(() => import('../screens/team/OrgChart.jsx'), 'OrgChartBody');
const ManageUsersView = lazyScreen(() => import('../screens/team/ManageTeam.jsx'), 'ManageUsersView');
const ClientFormsBody = lazyScreen(() => import('../screens/team/ClientForms.jsx'), 'ClientFormsBody');

// The screen area: a loading placeholder while a screen's file arrives, and
// a "didn't load" message (instead of a blank page) if it can't.
function Screens({ id, children }) {
  useEffect(() => { prefetchScreens(); }, []);
  return (
    <ScreenBoundary key={id}>
      <Suspense fallback={<ScreenLoading />}>{children}</Suspense>
    </ScreenBoundary>
  );
}

const MY_WORK_IDS = new Set(MY_WORK_TABS.map(t => t.id));

// Shared navigation for every layout: which group and tab is showing, and
// go(tab, intent), which lets one place send you to a specific spot in
// another (e.g. Today's "3 appointments with no outcome logged" opens
// Follow Up on that filter, or search opens a prospect in Prospecting).
function useViewNav() {
  const [group, setGroup] = useState('mine'); // 'mine' | 'team'
  const [tab, setTab] = useState('overview');
  const [prefillData, setPrefillData] = useState(null);
  const [navIntent, setNavIntent] = useState(null);
  // Where you were when you opened "Log appointment" from another screen,
  // so Cancel can take you back there.
  const [cameFrom, setCameFrom] = useState(null);
  const opensForm = (t, intent) => t === 'mine' && (intent === 'new' || (intent && typeof intent === 'object' && 'prefill' in intent));
  function go(t, intent = null) {
    setCameFrom(opensForm(t, intent) && tab !== 'mine' ? { group, tab } : null);
    if (t === 'teampromo') {
      setGroup('team'); setNavIntent({ tab: 'pace', intent: 'promotion' }); setTab('pace'); window.scrollTo(0, 0); return;
    }
    setGroup(MY_WORK_IDS.has(t) ? 'mine' : 'team');
    if (t === 'mine' && intent === 'new') setPrefillData({});
    // Today's "Book" button hands over a prospect to prefill the form.
    if (t === 'mine' && intent && typeof intent === 'object' && 'prefill' in intent) { setPrefillData(intent.prefill || {}); intent = null; }
    setNavIntent(intent ? { tab: t, intent } : null);
    setTab(t);
    window.scrollTo(0, 0);
  }
  const intentFor = t => (navIntent && navIntent.tab === t ? navIntent.intent : null);
  const clearIntent = () => setNavIntent(null);
  function selectGroup(g) {
    setCameFrom(null);
    setGroup(g);
    setTab(g === 'mine' ? 'overview' : 'teamhome');
  }
  function logAppointment(p) { setCameFrom(tab !== 'mine' ? { group, tab } : null); setPrefillData(p); setGroup('mine'); setTab('mine'); }
  function goBack() {
    if (!cameFrom) return;
    setGroup(cameFrom.group); setTab(cameFrom.tab); setCameFrom(null); window.scrollTo(0, 0);
  }
  function pickTab(t) { setCameFrom(null); setTab(t); }
  return { group, tab, setTab: pickTab, prefillData, setPrefillData, go, intentFor, clearIntent, selectGroup, logAppointment, cameFrom, goBack };
}

// The My work tabs, the same for everyone.
function MyWorkScreens({ user, nav }) {
  const { tab, go, intentFor, clearIntent, prefillData, setPrefillData, logAppointment, cameFrom, goBack } = nav;
  return (
    <>
      {tab === 'overview' && <TodayBody user={user} onNavigate={go} />}
      {tab === 'mine' && <MyAppointmentsBody user={user} prefillData={prefillData} onPrefillConsumed={() => setPrefillData(null)} initialIntent={intentFor('mine')} onIntentConsumed={clearIntent} cameFrom={cameFrom} onReturn={goBack} />}
      {tab === 'bizplan' && <BusinessPlanBody user={user} />}
      {tab === 'followup' && <FollowUpBody user={user} initialIntent={intentFor('followup')} onIntentConsumed={clearIntent} onScheduleNext={logAppointment} />}
      {tab === 'calendar' && <CalendarBody user={user} onLogAppointment={logAppointment} />}
      {tab === 'systems' && (
        <SystemsBody user={user} initialIntent={intentFor('systems')} onIntentConsumed={clearIntent} onLogAppointment={p => logAppointment(prospectToAppointmentPrefill(p))} />
      )}
      {tab === 'milestones' && <MilestonesBody user={user} initialIntent={intentFor('milestones')} onIntentConsumed={clearIntent} />}
      {tab === 'documents' && <DocumentsBody user={user} />}
    </>
  );
}

// The Team tabs for anyone who leads people (admins add Manage Team).
function TeamScreens({ user, nav }) {
  const { tab, go, intentFor, clearIntent } = nav;
  return (
    <>
      {tab === 'teamhome' && <TeamOverviewBody user={user} onNavigate={go} />}
      {tab === 'teamsystems' && <TeamProspectingBody user={user} />}
      {tab === 'pace' && <TeamPaceBody user={user} initialView={intentFor('pace')} onIntentConsumed={clearIntent} />}
      {tab === 'production' && <TrackProductionBody user={user} />}
      {tab === 'org' && <OrgChartBody user={user} onOpenPromotion={() => go('teampromo')} initialIntent={intentFor('org')} onIntentConsumed={clearIntent} />}
    </>
  );
}

export function AdvisorView({ user }) {
  useAppointmentReminders(user);
  const nav = useViewNav();
  const { tab, setTab, go } = nav;
  useAndroidBackButton(tab, () => setTab('overview'));
  const { openNew, newEl } = useNewMenu(user, go);
  return (
    <Shell>
      <Header user={user} search={<GlobalSearch user={user} go={go} withPeople={false} />} onNew={openNew}
        nav={<TabNav tabs={MY_WORK_TABS} tab={tab} onSelect={setTab} onNew={openNew} />} />
      <main className="tr-main">
        <Screens id={tab}>
          <MyWorkScreens user={user} nav={nav} />
        </Screens>
      </main>
      {newEl}
    </Shell>
  );
}

export function ManagerView({ user }) {
  useAppointmentReminders(user);
  const nav = useViewNav();
  const { group, tab, setTab, go, selectGroup } = nav;
  useAndroidBackButton(group === 'mine' ? tab : `team:${tab}`, () => selectGroup('mine'));
  const { openNew, newEl } = useNewMenu(user, go);
  return (
    <Shell>
      <Header user={user} search={<GlobalSearch user={user} go={go} withPeople />} onNew={openNew} nav={<>
        <GroupSwitch group={group} onSelect={selectGroup} teamLabel="Team" />
        <TabNav tabs={group === 'mine' ? MY_WORK_TABS : TEAM_TABS} tab={tab} onSelect={setTab} onNew={openNew} />
      </>} />
      <main className="tr-main">
        <Screens id={`${group}:${tab}`}>
          <MyWorkScreens user={user} nav={nav} />
          <TeamScreens user={user} nav={nav} />
        </Screens>
      </main>
      {newEl}
    </Shell>
  );
}

export function AdminView({ user }) {
  useAppointmentReminders(user);
  const nav = useViewNav();
  const { group, tab, setTab, go, selectGroup } = nav;
  useAndroidBackButton(group === 'mine' ? tab : `team:${tab}`, () => selectGroup('mine'));
  const { openNew, newEl } = useNewMenu(user, go);
  return (
    <Shell>
      <Header user={user} search={<GlobalSearch user={user} go={go} withPeople />} onNew={openNew} nav={<>
        <GroupSwitch group={group} onSelect={selectGroup} teamLabel="Team & admin" />
        <TabNav tabs={group === 'mine' ? MY_WORK_TABS : ADMIN_TEAM_TABS} tab={tab} onSelect={setTab} onNew={openNew} />
      </>} />
      <main className="tr-main">
        <Screens id={`${group}:${tab}`}>
          <MyWorkScreens user={user} nav={nav} />
          <TeamScreens user={user} nav={nav} />
          {tab === 'clientforms' && <ClientFormsBody />}
          {tab === 'users' && <ManageUsersView currentUserId={user.id} currentUserName={user.displayName} />}
        </Screens>
      </main>
      {newEl}
    </Shell>
  );
}
