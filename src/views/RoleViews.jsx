// The three app layouts: advisor, manager/leader and super admin.
import { useState } from 'react';
import { prospectToAppointmentPrefill } from '../data/prospects.js';
import { GroupSwitch, Shell } from '../components/ui.jsx';
import { Header } from '../components/Header.jsx';
import { ADMIN_TEAM_TABS, MY_WORK_TABS, TabNav, TEAM_TABS, useAndroidBackButton } from '../components/navigation.jsx';
import { GlobalSearch, useNewMenu } from '../components/quickActions.jsx';
import { useAppointmentReminders } from '../components/reminders.jsx';
import { MyAppointmentsBody } from '../screens/Appointments.jsx';
import { CalendarBody } from '../screens/Calendar.jsx';
import { BusinessPlanBody } from '../screens/BusinessPlan.jsx';
import { SystemsBody } from '../screens/Prospecting.jsx';
import { MilestonesBody } from '../screens/Milestones.jsx';
import { DocumentsBody } from '../screens/Documents.jsx';
import { FollowUpBody } from '../screens/FollowUp.jsx';
import { TodayBody } from '../screens/Today.jsx';
import { TeamOverviewBody } from '../screens/team/TeamOverview.jsx';
import { TeamPaceBody } from '../screens/team/TeamPace.jsx';
import { TeamProspectingBody } from '../screens/team/TeamProspecting.jsx';
import { TrackProductionBody } from '../screens/team/TrackProduction.jsx';
import { OrgChartBody } from '../screens/team/OrgChart.jsx';
import { ManageUsersView } from '../screens/team/ManageTeam.jsx';
import { ClientFormsBody } from '../screens/team/ClientForms.jsx';

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
  function go(t, intent = null) {
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
    setGroup(g);
    setTab(g === 'mine' ? 'overview' : 'teamhome');
  }
  function logAppointment(p) { setPrefillData(p); setGroup('mine'); setTab('mine'); }
  return { group, tab, setTab, prefillData, setPrefillData, go, intentFor, clearIntent, selectGroup, logAppointment };
}

// The My work tabs, the same for everyone.
function MyWorkScreens({ user, nav }) {
  const { tab, go, intentFor, clearIntent, prefillData, setPrefillData, logAppointment } = nav;
  return (
    <>
      {tab === 'overview' && <TodayBody user={user} onNavigate={go} />}
      {tab === 'mine' && <MyAppointmentsBody user={user} prefillData={prefillData} onPrefillConsumed={() => setPrefillData(null)} initialIntent={intentFor('mine')} onIntentConsumed={clearIntent} />}
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
        <MyWorkScreens user={user} nav={nav} />
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
        <MyWorkScreens user={user} nav={nav} />
        <TeamScreens user={user} nav={nav} />
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
        <MyWorkScreens user={user} nav={nav} />
        <TeamScreens user={user} nav={nav} />
        {tab === 'clientforms' && <ClientFormsBody />}
        {tab === 'users' && <ManageUsersView currentUserId={user.id} currentUserName={user.displayName} />}
      </main>
      {newEl}
    </Shell>
  );
}
