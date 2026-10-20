// Team Prospecting: everyone's prospect pipeline.
import React, { useCallback, useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { fetchAllVisibleProspects, prospectLeaningKey, prospectTotalChecked } from '../../data/prospects.js';
import { fetchTeamMembers } from '../../data/team.js';
import { MemberSubline, RefreshButton, SkeletonTable, TitleInfo } from '../../components/ui.jsx';
import { ProspectCard, ProspectFunnel } from '../Prospecting.jsx';

// ---------------------------------------------------------------------
// track production — submitted premium + recruits for the week, manager/admin only
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// team prospecting — manager/admin visibility into their team's pipeline,
// aggregate counts only; individual prospect notes stay private
// ---------------------------------------------------------------------
export function TeamProspectingBody({ user }) {
  const [members, setMembers] = useState([]);
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [memberList, prospectList] = await Promise.all([
      fetchTeamMembers(user),
      fetchAllVisibleProspects(),
    ]);
    setMembers(memberList);
    setProspects(prospectList);
    setLoading(false);
  }, [user.id, user.role]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <>
      <div className="tr-row-head tr-screen-head">
        <TitleInfo title={<><Users size={18} aria-hidden="true" /> Team prospecting</>} info="Tap a row to see that person's actual prospect list, the same detail you'd see reviewing it with them directly." />
        <RefreshButton onClick={refresh} />
      </div>
      {loading ? <SkeletonTable rows={5} cols={6} /> : members.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">No team members yet.</p></div>
      ) : (
        <>
          <ProspectFunnel prospects={prospects} title="Team conversion funnel" />
          <div className="tr-card tr-summary-card">
          <div className="tr-table-wrap">
            <table className="tr-table tr-table-summary">
              <thead>
                <tr>
                  <th>Team member</th>
                  <th>Active prospects</th>
                  <th>Sale potential</th>
                  <th>Recruit potential</th>
                  <th>Recruited</th>
                  <th>Sold</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => {
                  const list = prospects.filter(p => p.userId === m.id);
                  const active = list.filter(p => !p.markedRecruited && !p.markedSold);
                  const sale = active.filter(p => prospectLeaningKey(p) === 'sale').length;
                  const recruit = active.filter(p => prospectLeaningKey(p) === 'recruit').length;
                  const recruited = list.filter(p => p.markedRecruited).length;
                  const sold = list.filter(p => p.markedSold).length;
                  const isOpen = expanded === m.id;
                  const sortedList = list.slice().sort((a, b) => prospectTotalChecked(b) - prospectTotalChecked(a));
                  return (
                    <React.Fragment key={m.id}>
                      <tr className="tr-clickable-row" onClick={() => setExpanded(isOpen ? null : m.id)}>
                        <td>
                          {m.display_name}
                          {m.role === 'manager' ? <span className="tr-note"> — manager</span> : null}
                          <MemberSubline member={m} />
                        </td>
                        <td className="tr-mono">{active.length}</td>
                        <td className="tr-mono">{sale}</td>
                        <td className="tr-mono">{recruit}</td>
                        <td className="tr-mono">{recruited}</td>
                        <td className="tr-mono">{sold}</td>
                      </tr>
                      {isOpen && (
                        <tr className="tr-expand-row"><td colSpan={6}>
                          {sortedList.length === 0 ? (
                            <p className="tr-empty">No prospects logged yet.</p>
                          ) : (
                            sortedList.map((p, i) => <ProspectCard key={p.id} prospect={p} rank={i + 1} readOnly me={user.displayName} />)
                          )}
                        </td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}
    </>
  );
}
