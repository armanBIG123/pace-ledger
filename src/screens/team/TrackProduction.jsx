// Track Production: sales, submitted premium and recruits for the week, counted
// in the week the appointment took place (whenever it was booked).
import { Fragment, useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Download, TrendingUp } from 'lucide-react';
import { apptStartMs, fmtApptDateTime, shiftWeekStr, todayStr, weekStartOf } from '../../lib/dates.js';
import { downloadCSV, fmtCurrency } from '../../lib/format.js';
import { fetchAppointmentsHeldInWeek, isPolicyIssued } from '../../data/appointments.js';
import { fetchTeamMembers } from '../../data/team.js';
import { RefreshButton, SkeletonTable, TitleInfo, WeekNav } from '../../components/ui.jsx';
import { PendingIssueView } from './PendingIssue.jsx';
import { openAppointment } from '../../components/appointmentPanel.jsx';

const byTime = list => list.slice().sort((a, b) => apptStartMs(a) - apptStartMs(b));
const withWhom = a => (a.presenter && a.presenterId !== a.userId ? ` · with ${a.presenter}` : '');

// Tap a name: who they sold to and recruited this week, with the date and
// time of each appointment.
function ProductionDetail({ sold, recruited, premium }) {
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
        <h4 className="tr-prod-h">Recruits <span>{recruited.length}</span></h4>
        {recruited.length === 0 ? <p className="tr-empty">No recruits this week.</p> : (
          <ul className="tr-prod-list">
            {byTime(recruited).map(a => (
              <li key={a.id}>
                <div className="tr-prod-line"><button type="button" className="tr-appt-client-btn" onClick={() => openAppointment(a)}><strong>{a.client}</strong></button></div>
                <div className="tr-prod-sub">{fmtApptDateTime(a)}{withWhom(a)}</div>
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
  const [loading, setLoading] = useState(true);
  const [weekMonday, setWeekMonday] = useState(weekStartOf(todayStr()));
  const [expanded, setExpanded] = useState(null);
  const [view, setView] = useState('week'); // 'week' | 'pending'
  const [pendingKey, setPendingKey] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [memberList, appts] = await Promise.all([
      fetchTeamMembers(user),
      fetchAppointmentsHeldInWeek(weekMonday),
    ]);
    setMembers(memberList);
    setWeekAppts(appts);
    setLoading(false);
  }, [weekMonday, user.id, user.role]);

  useEffect(() => { refresh(); }, [refresh]);

  function tally(m) {
    const list = weekAppts.filter(a => a.userId === m.id);
    const sold = list.filter(a => a.officiallySold);
    const recruited = list.filter(a => a.officiallyRecruited);
    const premium = sold.reduce((t, a) => t + (Number(a.targetPremium) || 0), 0);
    const noPremium = sold.filter(a => !(Number(a.targetPremium) > 0)).length;
    return { sold, recruited, premium, noPremium };
  }

  function handleExport() {
    const rows = [['Team member', 'Role', 'Sales', 'Submitted premium', 'Sales with no premium entered', 'Recruits']];
    members.forEach(m => {
      const t = tally(m);
      rows.push([m.display_name, m.role, t.sold.length, t.premium, t.noPremium, t.recruited.map(a => a.client).join('; ')]);
    });
    downloadCSV(`track-production-week-of-${weekMonday}.csv`, rows);
  }

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
      <WeekNav weekMonday={weekMonday} onShift={d => setWeekMonday(shiftWeekStr(weekMonday, d))} onToday={() => setWeekMonday(weekStartOf(todayStr()))} />
      <div className="tr-row-head">
        <TitleInfo title={<><TrendingUp size={18} aria-hidden="true" /> Track production</>} info="Sales and recruits marked in each person's follow-up, counted in the week the appointment took place (Saturday to Friday), whenever it was booked. Tap a name to see who they sold to and recruited." />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="tr-btn tr-btn-ghost tr-btn-sm" onClick={handleExport} disabled={loading || members.length === 0}><Download size={14} /> Export CSV</button>
          <RefreshButton onClick={refresh} />
        </div>
      </div>
      {switcher}
      {loading ? <SkeletonTable rows={5} cols={4} /> : members.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">No team members yet.</p></div>
      ) : (
        <div className="tr-card tr-summary-card">
          <div className="tr-table-wrap">
            <table className="tr-table tr-table-summary">
              <thead><tr><th>Team member</th><th>Sales</th><th>Submitted premium</th><th>Recruits</th></tr></thead>
              <tbody>
                {members.map(m => {
                  const { sold, recruited, premium, noPremium } = tally(m);
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
                        <td className="tr-mono">{sold.length || '—'}</td>
                        <td className="tr-mono">
                          {sold.length ? fmtCurrency(premium) : '—'}
                          {noPremium ? <div className="tr-tenure">{noPremium} with no premium entered</div> : null}
                        </td>
                        <td className="tr-mono">{recruited.length || '—'}</td>
                      </tr>
                      {isOpen && (
                        <tr className="tr-expand-row">
                          <td colSpan={4}>
                            <div className="tr-expand-inner"><ProductionDetail sold={sold} recruited={recruited} premium={premium} /></div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
