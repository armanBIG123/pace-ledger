// Track Production: sold premium and recruits for the week.
import { useCallback, useEffect, useState } from 'react';
import { Download, TrendingUp } from 'lucide-react';
import { shiftWeekStr, todayStr, weekStartOf } from '../../lib/dates.js';
import { downloadCSV, fmtCurrency } from '../../lib/format.js';
import { fetchAppointmentsForWeek } from '../../data/appointments.js';
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
      fetchAppointmentsForWeek(weekMonday),
    ]);
    setMembers(memberList);
    setWeekAppts(appts);
    setLoading(false);
  }, [weekMonday, user.id, user.role]);

  useEffect(() => { refresh(); }, [refresh]);

  function handleExport() {
    const rows = [['Team member', 'Role', 'Sold premium', 'Sales count', 'Recruits']];
    members.forEach(m => {
      const list = weekAppts.filter(a => a.userId === m.id);
      const sold = list.filter(a => a.officiallySold);
      const recruited = list.filter(a => a.officiallyRecruited);
      const totalPremium = sold.reduce((s, a) => s + (Number(a.targetPremium) || 0), 0);
      rows.push([m.display_name, m.role, totalPremium, sold.length, recruited.map(a => a.client).join('; ')]);
    });
    downloadCSV(`track-production-week-of-${weekMonday}.csv`, rows);
  }

  return (
    <>
      <WeekNav weekMonday={weekMonday} onShift={d => setWeekMonday(shiftWeekStr(weekMonday, d))} onToday={() => setWeekMonday(weekStartOf(todayStr()))} />
      <div className="tr-row-head">
        <TitleInfo title={<><TrendingUp size={18} aria-hidden="true" /> Track production</>} info="Based on what's been marked Sold or Recruited in each person's follow-up for this week." />
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
              <thead><tr><th>Team member</th><th>Sold premium</th><th>Recruits</th></tr></thead>
              <tbody>
                {members.map(m => {
                  const list = weekAppts.filter(a => a.userId === m.id);
                  const sold = list.filter(a => a.officiallySold);
                  const recruited = list.filter(a => a.officiallyRecruited);
                  const totalPremium = sold.reduce((s, a) => s + (Number(a.targetPremium) || 0), 0);
                  return (
                    <tr key={m.id}>
                      <td>
                        {m.display_name}
                        {m.role === 'manager' ? <span className="tr-note"> — manager</span> : null}
                        {m.role === 'super_admin' ? <span className="tr-note"> — admin</span> : null}
                        {m.reports_to_name ? <div className="tr-tenure">Reports to {m.reports_to_name}</div> : null}
                      </td>
                      <td className="tr-mono">{fmtCurrency(totalPremium)}{sold.length ? <span className="tr-note"> ({sold.length})</span> : null}</td>
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
