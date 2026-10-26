// Track Production: sales and submitted premium for the week, counted in the
// week the appointment took place (whenever it was booked), and recruits:
// people who signed up through a recruit link that week, for the person they
// joined under (see lib/recruitCounts.js).
import { Fragment, useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Download, TrendingUp } from 'lucide-react';
import { addDays, apptStartMs, fmtApptDateTime, fmtDate, parseDate, shiftWeekStr, todayStr, weekStartOf } from '../../lib/dates.js';
import { signupsFor, tickboxRecruitCounts } from '../../lib/recruitCounts.js';
import { fetchRecruitSignups } from '../../data/recruits.js';
import { downloadCSV, fmtCurrency } from '../../lib/format.js';
import { fetchAppointmentsHeldInWeek, isPolicyIssued } from '../../data/appointments.js';
import { fetchTeamMembers } from '../../data/team.js';
import { RefreshButton, SkeletonTable, TitleInfo, WeekNav } from '../../components/ui.jsx';
import { PendingIssueView } from './PendingIssue.jsx';
import { FoldedPeople, NoMatches, PeopleToolbar, SortHeader, useHideEmpty, usePeopleRows, useSort } from '../../components/peopleList.jsx';
import { applyAppointmentEdit, openAppointment, useAppointmentEdits } from '../../components/appointmentPanel.jsx';

const byTime = list => list.slice().sort((a, b) => apptStartMs(a) - apptStartMs(b));
const withWhom = a => (a.presenter && a.presenterId !== a.userId ? ` · with ${a.presenter}` : '');

// Sorting Track Production's list.
const PRODUCTION_SORTS = {
  name: { label: 'Name', value: r => r.m.display_name, dir: 'asc' },
  sales: { label: 'Sales', value: r => r.t.sold.length, dir: 'desc' },
  premium: { label: 'Premium', value: r => r.t.premium, dir: 'desc' },
  recruits: { label: 'Recruits', value: r => r.t.recruits, dir: 'desc' },
};
const noProduction = r => !r.t.sold.length && !r.t.recruits;

const signedUpWhen = iso => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// Tap a name: who they sold to and recruited this week. Sales show the
// appointment; recruits show when they signed up (or, before the switch,
// the appointment marked recruited).
function ProductionDetail({ sold, recruited, joined, premium }) {
  return (
    <div className="tr-prod-detail">
      <section>
        <h4 className="tr-prod-h">Sales <span>{sold.length}{sold.length ? ` · ${fmtCurrency(premium)}` : ''}</span></h4>
        {sold.length === 0 ? <p className="tr-empty">No sales this week.</p> : (
          <ul className="tr-prod-list">
            {byTime(sold).map(a => (
              <li key={a.id}>
                <div className="tr-prod-line"><button type="button" className="tr-appt-client-btn" onClick={() => openAppointment(a)}><strong>{a.client}</strong></button><span className="tr-mono">{Number(a.targetPremium) > 0 ? fmtCurrency(Number(a.targetPremium)) : 'No premium entered'}</span></div>
                <div className="tr-prod-sub">{fmtApptDateTime(a)}{withWhom(a)} · {isPolicyIssued(a) ? 'issued' : 'not issued yet'}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h4 className="tr-prod-h">Recruits <span>{recruited.length + joined.length}</span></h4>
        {recruited.length + joined.length === 0 ? <p className="tr-empty">No one signed up this week.</p> : (
          <ul className="tr-prod-list">
            {joined.map(j => (
              <li key={j.id}>
                <div className="tr-prod-line"><strong>{j.recruitName}</strong></div>
                <div className="tr-prod-sub">Signed up {signedUpWhen(j.signedUpAt)}</div>
              </li>
            ))}
            {byTime(recruited).map(a => (
              <li key={a.id}>
                <div className="tr-prod-line"><button type="button" className="tr-appt-client-btn" onClick={() => openAppointment(a)}><strong>{a.client}</strong></button></div>
                <div className="tr-prod-sub">{fmtApptDateTime(a)}{withWhom(a)} · marked recruited</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function TrackProductionBody({ user }) {
  const [members, setMembers] = useState([]);
  const [weekAppts, setWeekAppts] = useState([]);
  const [signups, setSignups] = useState({ since: null, rows: [] });
  const [loading, setLoading] = useState(true);
  const [weekMonday, setWeekMonday] = useState(weekStartOf(todayStr()));
  const [expanded, setExpanded] = useState(null);
  const [view, setView] = useState('week'); // 'week' | 'pending'
  const [pendingKey, setPendingKey] = useState(0);
  const sorter = useSort('production', PRODUCTION_SORTS);
  const [hideEmpty, setHideEmpty] = useHideEmpty('production');

  const refresh = useCallback(async () => {
    setLoading(true);
    const [memberList, appts, joined] = await Promise.all([
      fetchTeamMembers(user),
      fetchAppointmentsHeldInWeek(weekMonday),
      fetchRecruitSignups(weekMonday, fmtDate(addDays(parseDate(weekMonday), 6))),
    ]);
    setMembers(memberList);
    setWeekAppts(appts);
    setSignups(joined);
    setLoading(false);
  }, [weekMonday, user.id, user.role]);

  useEffect(() => { refresh(); }, [refresh]);
  // An appointment opened from here was changed.
  useAppointmentEdits(change => {
    if (change.reload) refresh();
    else setWeekAppts(prev => applyAppointmentEdit(prev, change));
  });

  function tally(m) {
    const list = weekAppts.filter(a => a.userId === m.id);
    const sold = list.filter(a => a.officiallySold);
    const recruited = list.filter(a => tickboxRecruitCounts(a, signups.since));
    const joined = signupsFor(signups.rows, m.id);
    const premium = sold.reduce((t, a) => t + (Number(a.targetPremium) || 0), 0);
    const noPremium = sold.filter(a => !(Number(a.targetPremium) > 0)).length;
    return { sold, recruited, joined, recruits: recruited.length + joined.length, premium, noPremium };
  }

  function handleExport() {
    const rows = [['Team member', 'Role', 'Sales', 'Submitted premium', 'Sales with no premium entered', 'Recruits']];
    members.forEach(m => {
      const t = tally(m);
      rows.push([m.display_name, m.role, t.sold.length, t.premium, t.noPremium, [...t.joined.map(j => j.recruitName), ...t.recruited.map(a => a.client)].join('; ')]);
    });
    downloadCSV(`track-production-week-of-${weekMonday}.csv`, rows);
  }

  const rows = members.map(m => ({ id: m.id, m, t: tally(m) }));
  const view_ = usePeopleRows(rows, { personOf: r => r.m, isEmpty: noProduction, hideEmpty, sorter });

  const switcher = (
    <div className="tr-seg tr-seg-view" role="group" aria-label="Show">
      <button type="button" className={view === 'week' ? 'tr-seg-on' : ''} aria-pressed={view === 'week'} onClick={() => setView('week')}>This week</button>
      <button type="button" className={view === 'pending' ? 'tr-seg-on' : ''} aria-pressed={view === 'pending'} onClick={() => setView('pending')}>Submitted, not issued</button>
    </div>
  );

  if (view === 'pending') {
    return (
      <>
        <div className="tr-row-head tr-screen-head">
          <TitleInfo title={<><TrendingUp size={18} aria-hidden="true" /> Track production</>} info="Every policy someone on your team has submitted that isn't issued yet, oldest first. Open one to see its notes and add your own, or email the advisor to help get it issued." />
          <RefreshButton onClick={() => { refresh(); setPendingKey(k => k + 1); }} />
        </div>
        {switcher}
        {loading ? <SkeletonTable rows={5} cols={3} /> : members.length === 0 ? (
          <div className="tr-card"><p className="tr-empty">No team members yet.</p></div>
        ) : <PendingIssueView key={pendingKey} user={user} members={members} />}
      </>
    );
  }

  return (
    <>
      <div className="tr-row-head">
        <TitleInfo title={<><TrendingUp size={18} aria-hidden="true" /> Track production</>} info="Sales marked in each person's follow-up, counted in the week the appointment took place (Saturday to Friday). Recruits are people who signed up through a recruit link that week, counted for the person they joined under. Tap a name to see who they sold to and who joined." />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="tr-btn tr-btn-ghost tr-btn-sm" onClick={handleExport} disabled={loading || members.length === 0}><Download size={14} /> Export CSV</button>
          <RefreshButton onClick={refresh} />
        </div>
      </div>
      <WeekNav weekMonday={weekMonday} onShift={d => setWeekMonday(shiftWeekStr(weekMonday, d))} onToday={() => setWeekMonday(weekStartOf(todayStr()))} />
      {switcher}
      {loading ? <SkeletonTable rows={5} cols={4} /> : members.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">No team members yet.</p></div>
      ) : (
        <>
        <PeopleToolbar total={view_.total} matched={view_.matched} sorter={sorter}
          hideEmpty={hideEmpty} onHideEmpty={setHideEmpty} emptyLabel="Hide people with nothing this week" foldedCount={view_.folded.length} />
        <div className="tr-card tr-summary-card">
          {view_.matched === 0 ? <NoMatches /> : (
          <div className="tr-table-wrap">
            <table className="tr-table tr-table-summary tr-table-stack">
              <thead><tr>
                <SortHeader label="Team member" sortKey="name" sorter={sorter} />
                <SortHeader label="Sales" sortKey="sales" sorter={sorter} />
                <SortHeader label="Submitted premium" sortKey="premium" sorter={sorter} />
                <SortHeader label="Recruits" sortKey="recruits" sorter={sorter} />
              </tr></thead>
              <tbody>
                {view_.shown.map(({ m, t }) => {
                  const { sold, recruited, joined, recruits, premium, noPremium } = t;
                  const isOpen = expanded === m.id;
                  const toggle = () => setExpanded(isOpen ? null : m.id);
                  return (
                    <Fragment key={m.id}>
                      <tr className={`tr-clickable-row ${isOpen ? 'tr-row-open' : ''}`} onClick={toggle}>
                        <td>
                          <button type="button" className="tr-rowname-btn" aria-expanded={isOpen} onClick={e => { e.stopPropagation(); toggle(); }}>
                            <span className="tr-row-toggle" aria-hidden="true">{isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
                            {m.display_name}
                          </button>
                          {m.role === 'manager' ? <span className="tr-note"> — manager</span> : null}
                          {m.role === 'super_admin' ? <span className="tr-note"> — admin</span> : null}
                          {m.reports_to_name ? <div className="tr-tenure">Reports to {m.reports_to_name}</div> : null}
                        </td>
                        <td className={`tr-mono ${sold.length ? '' : 'tr-zero'}`} data-label="Sales">{sold.length || '—'}</td>
                        <td className={`tr-mono ${sold.length ? '' : 'tr-zero'}`} data-label="Premium">
                          {sold.length ? fmtCurrency(premium) : '—'}
                          {noPremium ? <div className="tr-tenure">{noPremium} with no premium entered</div> : null}
                        </td>
                        <td className={`tr-mono ${recruits ? '' : 'tr-zero'}`} data-label="Recruits">{recruits || '—'}</td>
                      </tr>
                      {isOpen && (
                        <tr className="tr-expand-row">
                          <td colSpan={4}>
                            <div className="tr-expand-inner"><ProductionDetail sold={sold} recruited={recruited} joined={joined} premium={premium} /></div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
          <FoldedPeople people={view_.folded.map(r => r.m)} label="No sales or recruits this week" onShow={() => setHideEmpty(false)} />
        </div>
        </>
      )}
    </>
  );
}
