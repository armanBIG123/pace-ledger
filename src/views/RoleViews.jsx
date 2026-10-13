// The three app layouts: advisor, manager/leader and super admin.
import { useState } from 'react';
import { prospectToAppointmentPrefill } from '../data/prospects.js';
import { GroupSwitch, Shell } from '../components/ui.jsx';
import { Header } from '../components/Header.jsx';
import { ADMIN_TEAM_TABS, MY_WORK_TABS, TabNav, TEAM_TABS, useAndroidBackButton } from '../components/navigation.jsx';
import { useAppointmentReminders } from '../components/reminders.jsx';
import { MyAppointmentsBody } from '../screens/Appointments.jsx';
import { CalendarBody } from '../screens/Calendar.jsx';
import { BusinessPlanBody } from '../screens/BusinessPlan.jsx';
import { SystemsBody } from '../screens/Prospecting.jsx';
import { MilestonesBody } from '../screens/Milestones.jsx';
import { DocumentsBody } from '../screens/Documents.jsx';
import { FollowUpBody } from '../screens/FollowUp.jsx';
import { TodayBody } from '../screens/Today.jsx';
import { TeamPaceBody } from '../screens/team/TeamPace.jsx';
import { TeamProspectingBody } from '../screens/team/TeamProspecting.jsx';
import { TrackProductionBody } from '../screens/team/TrackProduction.jsx';
import { OrgChartBody } from '../screens/team/OrgChart.jsx';
import { ManageUsersView } from '../screens/team/ManageTeam.jsx';

export function AdvisorView({ user }) {
  useAppointmentReminders(user);
  const [tab, setTab] = useState('overview');
  useAndroidBackButton(tab, () => setTab('overview'));
  const [prefillData, setPrefillData] = useState(null);
  // Lets one tab send you to a specific spot in another (e.g. Overview's
  // "3 appointments with no outcome logged" opens Follow Up on that filter).
  const [navIntent, setNavIntent] = useState(null);
  function go(t, intent = null) {
    if (t === 'mine' && intent === 'new') setPrefillData({});
    // Today's "Book" button hands over a prospect to prefill the form.
    if (t === 'mine' && intent && typeof intent === 'object') { setPrefillData(intent.prefill || {}); intent = null; }
    setNavIntent(intent ? { tab: t, intent } : null);
    setTab(t);
    window.scrollTo(0, 0);
  }
  const intentFor = t => (navIntent && navIntent.tab === t ? navIntent.intent : null);
  return (
    <Shell>
      <Header user={user} nav={<TabNav tabs={MY_WORK_TABS} tab={tab} onSelect={setTab} />} />
      <main className="tr-main">
        {tab === 'overview' && <TodayBody user={user} onNavigate={go} />}
        {tab === 'mine' && <MyAppointmentsBody user={user} prefillData={prefillData} onPrefillConsumed={() => setPrefillData(null)} />}
        {tab === 'bizplan' && <BusinessPlanBody user={user} />}
        {tab === 'followup' && <FollowUpBody user={user} initialIntent={intentFor('followup')} onIntentConsumed={() => setNavIntent(null)} onScheduleNext={p => { setPrefillData(p); setTab('mine'); }} />}
        {tab === 'calendar' && <CalendarBody user={user} onLogAppointment={p => { setPrefillData(p); setTab('mine'); }} />}
        {tab === 'systems' && (
          <SystemsBody user={user} initialIntent={intentFor('systems')} onIntentConsumed={() => setNavIntent(null)} onLogAppointment={p => { setPrefillData(prospectToAppointmentPrefill(p)); setTab('mine'); }} />
        )}
        {tab === 'milestones' && <MilestonesBody user={user} initialIntent={intentFor('milestones')} onIntentConsumed={() => setNavIntent(null)} />}
        {tab === 'documents' && <DocumentsBody user={user} />}
      </main>
    </Shell>
  );
}

export function ManagerView({ user }) {
  useAppointmentReminders(user);
  const [group, setGroup] = useState('mine'); // 'mine' | 'team'
  const [tab, setTab] = useState('overview');
  const [prefillData, setPrefillData] = useState(null);
  // Lets one tab send you to a specific spot in another (e.g. Overview's
  // "3 appointments with no outcome logged" opens Follow Up on that filter).
  const [navIntent, setNavIntent] = useState(null);
  function go(t, intent = null) {
    if (t === 'teampromo') {
      setGroup('team'); setNavIntent({ tab: 'pace', intent: 'promotion' }); setTab('pace'); window.scrollTo(0, 0); return;
    }
    if (t === 'mine' && intent === 'new') setPrefillData({});
    // Today's "Book" button hands over a prospect to prefill the form.
    if (t === 'mine' && intent && typeof intent === 'object') { setPrefillData(intent.prefill || {}); intent = null; }
    setNavIntent(intent ? { tab: t, intent } : null);
    setTab(t);
    window.scrollTo(0, 0);
  }
  const intentFor = t => (navIntent && navIntent.tab === t ? navIntent.intent : null);

  function selectGroup(g) {
    setGroup(g);
    setTab(g === 'mine' ? 'overview' : 'teamsystems');
  }
  useAndroidBackButton(group === 'mine' ? tab : `team:${tab}`, () => selectGroup('mine'));

  return (
    <Shell>
      <Header user={user} nav={<>
        <GroupSwitch group={group} onSelect={selectGroup} teamLabel="Team" />
        <TabNav tabs={group === 'mine' ? MY_WORK_TABS : TEAM_TABS} tab={tab} onSelect={setTab} />
      </>} />
      <main className="tr-main">
        {tab === 'overview' && <TodayBody user={user} onNavigate={go} />}
        {tab === 'mine' && <MyAppointmentsBody user={user} prefillData={prefillData} onPrefillConsumed={() => setPrefillData(null)} />}
        {tab === 'bizplan' && <BusinessPlanBody user={user} />}
        {tab === 'followup' && <FollowUpBody user={user} initialIntent={intentFor('followup')} onIntentConsumed={() => setNavIntent(null)} onScheduleNext={p => { setPrefillData(p); setTab('mine'); }} />}
        {tab === 'calendar' && <CalendarBody user={user} onLogAppointment={p => { setPrefillData(p); setTab('mine'); }} />}
        {tab === 'systems' && (
          <SystemsBody user={user} initialIntent={intentFor('systems')} onIntentConsumed={() => setNavIntent(null)} onLogAppointment={p => { setPrefillData(prospectToAppointmentPrefill(p)); setTab('mine'); }} />
        )}
        {tab === 'milestones' && <MilestonesBody user={user} initialIntent={intentFor('milestones')} onIntentConsumed={() => setNavIntent(null)} />}
        {tab === 'documents' && <DocumentsBody user={user} />}
        {tab === 'teamsystems' && <TeamProspectingBody user={user} />}
        {tab === 'pace' && <TeamPaceBody user={user} initialView={intentFor('pace')} onIntentConsumed={() => setNavIntent(null)} />}
        {tab === 'production' && <TrackProductionBody user={user} />}
        {tab === 'org' && <OrgChartBody user={user} onOpenPromotion={() => go('teampromo')} />}
      </main>
    </Shell>
  );
}

export function AdminView({ user }) {
  useAppointmentReminders(user);
  const [group, setGroup] = useState('mine'); // 'mine' | 'team'
  const [tab, setTab] = useState('overview');
  const [prefillData, setPrefillData] = useState(null);
  // Lets one tab send you to a specific spot in another (e.g. Overview's
  // "3 appointments with no outcome logged" opens Follow Up on that filter).
  const [navIntent, setNavIntent] = useState(null);
  function go(t, intent = null) {
    if (t === 'teampromo') {
      setGroup('team'); setNavIntent({ tab: 'pace', intent: 'promotion' }); setTab('pace'); window.scrollTo(0, 0); return;
    }
    if (t === 'mine' && intent === 'new') setPrefillData({});
    // Today's "Book" button hands over a prospect to prefill the form.
    if (t === 'mine' && intent && typeof intent === 'object') { setPrefillData(intent.prefill || {}); intent = null; }
    setNavIntent(intent ? { tab: t, intent } : null);
    setTab(t);
    window.scrollTo(0, 0);
  }
  const intentFor = t => (navIntent && navIntent.tab === t ? navIntent.intent : null);

  function selectGroup(g) {
    setGroup(g);
    setTab(g === 'mine' ? 'overview' : 'teamsystems');
  }
  useAndroidBackButton(group === 'mine' ? tab : `team:${tab}`, () => selectGroup('mine'));

  return (
    <Shell>
      <Header user={user} nav={<>
        <GroupSwitch group={group} onSelect={selectGroup} teamLabel="Team & admin" />
        <TabNav tabs={group === 'mine' ? MY_WORK_TABS : ADMIN_TEAM_TABS} tab={tab} onSelect={setTab} />
      </>} />
      <main className="tr-main">
        {tab === 'overview' && <TodayBody user={user} onNavigate={go} />}
        {tab === 'mine' && <MyAppointmentsBody user={user} prefillData={prefillData} onPrefillConsumed={() => setPrefillData(null)} />}
        {tab === 'bizplan' && <BusinessPlanBody user={user} />}
        {tab === 'followup' && <FollowUpBody user={user} initialIntent={intentFor('followup')} onIntentConsumed={() => setNavIntent(null)} onScheduleNext={p => { setPrefillData(p); setTab('mine'); }} />}
        {tab === 'calendar' && <CalendarBody user={user} onLogAppointment={p => { setPrefillData(p); setTab('mine'); }} />}
        {tab === 'systems' && (
          <SystemsBody user={user} initialIntent={intentFor('systems')} onIntentConsumed={() => setNavIntent(null)} onLogAppointment={p => { setPrefillData(prospectToAppointmentPrefill(p)); setTab('mine'); }} />
        )}
        {tab === 'milestones' && <MilestonesBody user={user} initialIntent={intentFor('milestones')} onIntentConsumed={() => setNavIntent(null)} />}
        {tab === 'documents' && <DocumentsBody user={user} />}
        {tab === 'teamsystems' && <TeamProspectingBody user={user} />}
        {tab === 'pace' && <TeamPaceBody user={user} initialView={intentFor('pace')} onIntentConsumed={() => setNavIntent(null)} />}
        {tab === 'production' && <TrackProductionBody user={user} />}
        {tab === 'org' && <OrgChartBody user={user} onOpenPromotion={() => go('teampromo')} />}
        {tab === 'users' && <ManageUsersView currentUserId={user.id} currentUserName={user.displayName} />}
      </main>
    </Shell>
  );
}
