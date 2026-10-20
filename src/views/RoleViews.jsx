// The three app layouts: advisor, manager/leader and super admin.
import { Suspense, useEffect, useState } from 'react';
import { GroupSwitch, Shell } from '../components/ui.jsx';
import { Header } from '../components/Header.jsx';
import { ADMIN_TEAM_TABS, MY_WORK_TABS, TabNav, TEAM_TABS, useAndroidBackButton } from '../components/navigation.jsx';
import { GlobalSearch, useNewMenu } from '../components/quickActions.jsx';
import { useAppointmentReminders } from '../components/reminders.jsx';
import { ChatButton, useChatUnread } from '../components/chatButton.jsx';
import { lazyScreen, prefetchScreens, ScreenBoundary, ScreenLoading } from '../components/lazyScreen.jsx';
import { TodayBody } from '../screens/Today.jsx';

// Today is part of the app itself; every other screen loads when it's
// first opened (and in the background a moment after Today shows).
const PipelineBody = lazyScreen(() => import('../screens/Pipeline.jsx'), 'PipelineBody');
const CalendarBody = lazyScreen(() => import('../screens/Calendar.jsx'), 'CalendarBody');
const GrowthBody = lazyScreen(() => import('../screens/Growth.jsx'), 'GrowthBody');
const DocumentsBody = lazyScreen(() => import('../screens/Documents.jsx'), 'DocumentsBody');
const ChatBody = lazyScreen(() => import('../screens/Chat.jsx'), 'ChatBody');
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

// The old screen names still work everywhere (Today, search, + New, the
// First 30 days checklist): each opens the part of Pipeline or Growth that
// replaced it.
const ROUTES = {
  systems: { tab: 'pipeline', stage: 'names' },
  mine: { tab: 'pipeline', stage: 'booked' },
  followup: { tab: 'pipeline', stage: 'followup' },
  bizplan: { tab: 'growth', growth: 'plan' },
  milestones: { tab: 'growth', growth: 'path' },
  documents: { tab: 'resources' },
};
const OUTCOME_INTENTS = new Set(['nolog', 'reschedule']);

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
  // Which Pipeline stage and Growth section are open.
  const [stage, setStage] = useState('names');
  const [growthView, setGrowthView] = useState('path');
  const here = { group, tab, stage, growthView };
  const onBooked = () => tab === 'pipeline' && stage === 'booked';
  const opensForm = (t, intent) => t === 'mine' && (intent === 'new' || (intent && typeof intent === 'object' && 'prefill' in intent));
  function go(t, intent = null) {
    // Chat opens over whichever side (My work or Team) you're on.
    if (t === 'chat') {
      setCameFrom(null); setNavIntent(intent ? { tab: 'chat', intent } : null); setTab('chat'); window.scrollTo(0, 0); return;
    }
    setCameFrom(opensForm(t, intent) && !onBooked() ? here : null);
    if (t === 'teampromo') {
      setGroup('team'); setNavIntent({ tab: 'pace', intent: 'promotion' }); setTab('pace'); window.scrollTo(0, 0); return;
    }
    const route = ROUTES[t];
    setGroup(route || MY_WORK_IDS.has(t) ? 'mine' : 'team');
    if (t === 'mine' && intent === 'new') setPrefillData({});
    // Today's "Book" button hands over a prospect to prefill the form.
    if (t === 'mine' && intent && typeof intent === 'object' && 'prefill' in intent) { setPrefillData(intent.prefill || {}); intent = null; }
    if (route && route.stage) setStage(t === 'followup' && OUTCOME_INTENTS.has(intent) ? 'outcome' : route.stage);
    if (route && route.growth) setGrowthView(t === 'milestones' && intent === 'licensing' ? 'licensing' : route.growth);
    // Kept under the old name, so the screen behind the stage finds it.
    // (Growth's sections are picked above; nothing there reads an intent.)
    setNavIntent(intent && !(route && route.growth) ? { tab: t, intent } : null);
    setTab(route ? route.tab : t);
    window.scrollTo(0, 0);
  }
  const intentFor = t => (navIntent && navIntent.tab === t ? navIntent.intent : null);
  const clearIntent = () => setNavIntent(null);
  function selectGroup(g) {
    setCameFrom(null);
    setGroup(g);
    setTab(g === 'mine' ? 'overview' : 'teamhome');
  }
  function logAppointment(p) { setCameFrom(!onBooked() ? here : null); setPrefillData(p); setGroup('mine'); setStage('booked'); setTab('pipeline'); }
  function goBack() {
    if (!cameFrom) return;
    setGroup(cameFrom.group); setTab(cameFrom.tab); setStage(cameFrom.stage); setGrowthView(cameFrom.growthView); setCameFrom(null); window.scrollTo(0, 0);
  }
  function pickTab(t) { setCameFrom(null); setTab(t); }
  // A tapped "How did it go?" phone reminder opens that appointment's log
  // window on Today; the 9 AM catch-up opens Pipeline → Log outcome.
  useEffect(() => {
    const open = e => {
      const d = (e && e.detail) || {};
      if (d.list) go('followup', 'nolog');
      else if (d.appointmentId) go('overview', { log: d.appointmentId });
    };
    window.addEventListener('paceledger:open-log', open);
    return () => window.removeEventListener('paceledger:open-log', open);
  });
  // A link from an email (…/?chat=urgent) opens that chat.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const chat = params.get('chat');
    if (!chat) return;
    params.delete('chat');
    const rest = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
    go('chat', ['general', 'work', 'urgent', 'reports'].includes(chat) ? chat : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function pickStage(k) { setCameFrom(null); setNavIntent(null); setStage(k); window.scrollTo(0, 0); }
  return { group, tab, setTab: pickTab, stage, setStage: pickStage, growthView, setGrowthView, prefillData, setPrefillData, go, intentFor, clearIntent, selectGroup, logAppointment, cameFrom, goBack };
}

// The My work tabs, the same for everyone.
function MyWorkScreens({ user, nav }) {
  const { tab, go, stage, setStage, growthView, setGrowthView, intentFor, clearIntent, prefillData, setPrefillData, logAppointment, cameFrom, goBack } = nav;
  return (
    <>
      {tab === 'overview' && <TodayBody user={user} onNavigate={go} initialIntent={intentFor('overview')} onIntentConsumed={clearIntent} />}
      {tab === 'pipeline' && (
        <PipelineBody user={user} stage={stage} onStage={setStage} intentFor={intentFor} clearIntent={clearIntent}
          prefillData={prefillData} onPrefillConsumed={() => setPrefillData(null)} cameFrom={cameFrom} onReturn={goBack}
          onLogAppointment={logAppointment} />
      )}
      {tab === 'calendar' && <CalendarBody user={user} onLogAppointment={logAppointment} />}
      {tab === 'growth' && <GrowthBody user={user} view={growthView} onView={setGrowthView} />}
      {tab === 'resources' && <DocumentsBody user={user} />}
      {tab === 'chat' && <ChatBody user={user} initialChannel={intentFor('chat')} onIntentConsumed={clearIntent} />}
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
  const chatCounts = useChatUnread(user);
  return (
    <Shell>
      <Header user={user} search={<GlobalSearch user={user} go={go} withPeople={false} />} onNew={openNew}
        chat={<ChatButton counts={chatCounts} onOpen={() => go('chat')} active={tab === 'chat'} />}
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
  const chatCounts = useChatUnread(user);
  return (
    <Shell>
      <Header user={user} search={<GlobalSearch user={user} go={go} withPeople />} onNew={openNew}
        chat={<ChatButton counts={chatCounts} onOpen={() => go('chat')} active={tab === 'chat'} />} nav={<>
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
  const chatCounts = useChatUnread(user);
  return (
    <Shell>
      <Header user={user} search={<GlobalSearch user={user} go={go} withPeople />} onNew={openNew}
        chat={<ChatButton counts={chatCounts} onOpen={() => go('chat')} active={tab === 'chat'} />} nav={<>
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
