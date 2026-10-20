// Track Production: sales, sold premium and recruits for the week, counted
// in the week the appointment took place (whenever it was booked).
import { useCallback, useEffect, useState } from 'react';
import { Download, TrendingUp } from 'lucide-react';
import { shiftWeekStr, todayStr, weekStartOf } from '../../lib/dates.js';
import { downloadCSV, fmtCurrency } from '../../lib/format.js';
import { fetchAppointmentsHeldInWeek } from '../../data/appointments.js';
import { fetchTeamMembers } from '../../data/team.js';
import { RefreshButton, SkeletonTable, TitleInfo, WeekNav } from '../../components/ui.jsx';

export function TrackProductionBody({ user }) {
  const [members, setMembers] = useState([]);
  const [weekAppts, setWeekAppts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weekMonday, setWeekMonday] = useState(weekStartOf(todayStr()));

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
    const rows = [['Team member', 'Role', 'Sales', 'Sold premium', 'Sales with no premium entered', 'Recruits']];
    members.forEach(m => {
      const t = tally(m);
      rows.push([m.display_name, m.role, t.sold.length, t.premium, t.noPremium, t.recruited.map(a => a.client).join('; ')]);
    });
    downloadCSV(`track-production-week-of-${weekMonday}.csv`, rows);
  }

  return (
    <>
      <WeekNav weekMonday={weekMonday} onShift={d => setWeekMonday(shiftWeekStr(weekMonday, d))} onToday={() => setWeekMonday(weekStartOf(todayStr()))} />
      <div className="tr-row-head">
        <TitleInfo title={<><TrendingUp size={18} aria-hidden="true" /> Track production</>} info="Sales and recruits marked in each person's follow-up, counted in the week the appointment took place (Saturday to Friday), whenever it was booked." />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="tr-btn tr-btn-ghost tr-btn-sm" onClick={handleExport} disabled={loading || members.length === 0}><Download size={14} /> Export CSV</button>
          <RefreshButton onClick={refresh} />
        </div>
      </div>
      {loading ? <SkeletonTable rows={5} cols={4} /> : members.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">No team members yet.</p></div>
      ) : (
        <div className="tr-card tr-summary-card">
          <div className="tr-table-wrap">
            <table className="tr-table tr-table-summary">
              <thead><tr><th>Team member</th><th>Sales</th><th>Sold premium</th><th>Recruits</th></tr></thead>
              <tbody>
                {members.map(m => {
                  const { sold, recruited, premium, noPremium } = tally(m);
                  return (
                    <tr key={m.id}>
                      <td>
                        {m.display_name}
                        {m.role === 'manager' ? <span className="tr-note"> — manager</span> : null}
                        {m.role === 'super_admin' ? <span className="tr-note"> — admin</span> : null}
                        {m.reports_to_name ? <div className="tr-tenure">Reports to {m.reports_to_name}</div> : null}
                      </td>
                      <td className="tr-mono">{sold.length || '—'}</td>
                      <td className="tr-mono">
                        {sold.length ? fmtCurrency(premium) : '—'}
                        {noPremium ? <div className="tr-tenure">{noPremium} with no premium entered</div> : null}
                      </td>
                      <td>{recruited.length === 0 ? '—' : recruited.map(a => a.client).join(', ')}</td>
                    </tr>
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
