// Team Prospecting: everyone's prospect pipeline.
import React, { useCallback, useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { fetchAllVisibleProspects, prospectLeaningKey, prospectTotalChecked } from '../../data/prospects.js';
import { fetchTeamMembers } from '../../data/team.js';
import { MemberSubline, RefreshButton, SkeletonTable, TitleInfo } from '../../components/ui.jsx';
import { ProspectCard, ProspectFunnel } from '../Prospecting.jsx';
import { FoldedPeople, NoMatches, PeopleToolbar, SortHeader, useHideEmpty, usePeopleRows, useSort } from '../../components/peopleList.jsx';

const PROSPECTING_SORTS = {
  name: { label: 'Name', value: r => r.m.display_name, dir: 'asc' },
  active: { label: 'Active prospects', value: r => r.active.length, dir: 'desc' },
  sale: { label: 'Sale potential', value: r => r.sale, dir: 'desc' },
  recruit: { label: 'Recruit potential', value: r => r.recruit, dir: 'desc' },
  recruited: { label: 'Recruited', value: r => r.recruited, dir: 'desc' },
  sold: { label: 'Sold', value: r => r.sold, dir: 'desc' },
};
const noProspects = r => r.list.length === 0;

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
  const sorter = useSort('prospecting', PROSPECTING_SORTS);
  const [hideEmpty, setHideEmpty] = useHideEmpty('prospecting');

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

  const rows = members.map(m => {
    const list = prospects.filter(p => p.userId === m.id);
    const active = list.filter(p => !p.markedRecruited && !p.markedSold);
    return {
      id: m.id, m, list, active,
      sale: active.filter(p => prospectLeaningKey(p) === 'sale').length,
      recruit: active.filter(p => prospectLeaningKey(p) === 'recruit').length,
      recruited: list.filter(p => p.markedRecruited).length,
      sold: list.filter(p => p.markedSold).length,
    };
  });
  const view = usePeopleRows(rows, { personOf: r => r.m, isEmpty: noProspects, hideEmpty, sorter });
  const num = n => <span className={n ? '' : 'tr-zero'}>{n}</span>;

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
          <PeopleToolbar total={view.total} matched={view.matched} sorter={sorter}
            hideEmpty={hideEmpty} onHideEmpty={setHideEmpty} emptyLabel="Hide people with no prospects" foldedCount={view.folded.length} />
          <div className="tr-card tr-summary-card">
          {view.matched === 0 ? <NoMatches /> : (
          <div className="tr-table-wrap">
            <table className="tr-table tr-table-summary tr-table-stack">
              <thead>
                <tr>
                  <SortHeader label="Team member" sortKey="name" sorter={sorter} />
                  <SortHeader label="Active prospects" sortKey="active" sorter={sorter} />
                  <SortHeader label="Sale potential" sortKey="sale" sorter={sorter} />
                  <SortHeader label="Recruit potential" sortKey="recruit" sorter={sorter} />
                  <SortHeader label="Recruited" sortKey="recruited" sorter={sorter} />
                  <SortHeader label="Sold" sortKey="sold" sorter={sorter} />
                </tr>
              </thead>
              <tbody>
                {view.shown.map(({ m, list, active, sale, recruit, recruited, sold }) => {
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
                        <td className="tr-mono" data-label="Active">{num(active.length)}</td>
                        <td className="tr-mono" data-label="Sale potential">{num(sale)}</td>
                        <td className="tr-mono" data-label="Recruit potential">{num(recruit)}</td>
                        <td className="tr-mono" data-label="Recruited">{num(recruited)}</td>
                        <td className="tr-mono" data-label="Sold">{num(sold)}</td>
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
          )}
          <FoldedPeople people={view.folded.map(r => r.m)} label="No prospects on their list" onShow={() => setHideEmpty(false)} />
        </div>
        </>
      )}
    </>
  );
}
