// Client Forms (super admins only): every advisor's client intake forms in
// one place, newest first. Read only; the advisor who sent a form is the
// only one who can remove it. Answers load when a form is opened.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ClipboardCheck, Search, X } from 'lucide-react';
import { fetchAllIntakeForms, fetchIntakeAnswers } from '../../clientIntake.js';
import { IntakeResponsesView } from '../../ClientIntake.jsx';
import { fetchHierarchyPeople } from '../../data/team.js';
import { RefreshButton, SkelBlock, SkeletonTable, TitleInfo } from '../../components/ui.jsx';

const fmtDay = iso => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const isDone = r => r.status === 'submitted';

export function ClientFormsBody() {
  const [rows, setRows] = useState([]);
  const [people, setPeople] = useState(() => new Map());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState('submitted'); // 'submitted' | 'pending'
  const [advisor, setAdvisor] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null);
  const [answers, setAnswers] = useState({}); // form id -> answers | 'loading' | 'error'

  const refresh = useCallback(async () => {
    setLoading(true);
    const [forms, ppl] = await Promise.all([fetchAllIntakeForms(), fetchHierarchyPeople()]);
    setRows(forms.rows);
    setFailed(!!forms.error);
    setPeople(new Map(ppl.map(p => [p.id, p])));
    setAnswers({});
    setOpen(null);
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // Their name now (it may have changed since the form was sent), and who
  // they report to.
  const advisorName = r => (people.get(r.advisor_id) || {}).display_name || r.advisor_name || 'Unknown advisor';
  const reportsTo = r => {
    const p = people.get(r.advisor_id);
    const m = p && p.manager_id ? people.get(p.manager_id) : null;
    return m ? m.display_name : '';
  };

  const doneCount = rows.filter(isDone).length;
  const waitingCount = rows.length - doneCount;
  const advisors = useMemo(() => [...new Map(rows.map(r => [r.advisor_id, advisorName(r)])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1])), [rows, people]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = query.trim().toLowerCase();
  const shown = rows
    .filter(r => (status === 'submitted' ? isDone(r) : !isDone(r)))
    .filter(r => !advisor || r.advisor_id === advisor)
    .filter(r => !q || (r.client_name || '').toLowerCase().includes(q) || advisorName(r).toLowerCase().includes(q))
    .sort((a, b) => (status === 'submitted'
      ? (b.submitted_at || '').localeCompare(a.submitted_at || '')
      : (b.created_at || '').localeCompare(a.created_at || '')));

  async function toggle(r) {
    if (open === r.id) { setOpen(null); return; }
    setOpen(r.id);
    if (!isDone(r) || (answers[r.id] && answers[r.id] !== 'error')) return;
    setAnswers(a => ({ ...a, [r.id]: 'loading' }));
    const res = await fetchIntakeAnswers(r.id);
    setAnswers(a => ({ ...a, [r.id]: res || 'error' }));
  }
  function pickStatus(v) { setStatus(v); setOpen(null); }

  return (
    <>
      <div className="tr-row-head tr-screen-head">
        <TitleInfo title={<><ClipboardCheck size={18} aria-hidden="true" /> Client intake forms</>} info="Every advisor's client intake forms, newest first. Only super admins see this page. It's read only: the advisor who sent a form is the only one who can remove it." />
        <RefreshButton onClick={refresh} />
      </div>
      {failed && <div className="tr-error" style={{ marginBottom: 12 }}>Couldn't load the forms. Try Refresh.</div>}

      <div className="tr-toolbar tr-forms-toolbar">
        <div className="tr-seg" role="group" aria-label="Show">
          <button type="button" className={status === 'submitted' ? 'tr-seg-on' : ''} aria-pressed={status === 'submitted'} onClick={() => pickStatus('submitted')}>Completed ({doneCount})</button>
          <button type="button" className={status === 'pending' ? 'tr-seg-on' : ''} aria-pressed={status === 'pending'} onClick={() => pickStatus('pending')}>Waiting on client ({waitingCount})</button>
        </div>
        <select className="tr-toolbar-select" value={advisor} onChange={e => { setAdvisor(e.target.value); setOpen(null); }} aria-label="Advisor">
          <option value="">All advisors</option>
          {advisors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <div className="tr-search-row">
          <Search size={15} className="tr-search-icon" />
          <input className="tr-search-input" type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a client or advisor…" aria-label="Find a client or advisor" />
          {query && <button type="button" className="tr-icon-btn" onClick={() => setQuery('')} title="Clear search"><X size={15} /></button>}
        </div>
      </div>

      {loading ? <SkeletonTable rows={6} cols={4} /> : shown.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">
          {rows.length === 0 ? 'No client intake forms yet. They show up here once an advisor sends one from Pipeline → Follow-up.'
            : status === 'submitted' ? 'No completed forms match.' : 'No forms waiting on a client match.'}
        </p></div>
      ) : (
        <div className="tr-card tr-summary-card">
          <div className="tr-table-wrap">
            <table className="tr-table tr-table-summary tr-forms-table">
              <thead>
                <tr><th>Client</th><th>Advisor</th><th>{status === 'submitted' ? 'Completed' : 'Sent'}</th><th className="tr-forms-action-h"><span className="tr-sr-only">Answers</span></th></tr>
              </thead>
              <tbody>
                {shown.map(r => {
                  const isOpen = open === r.id;
                  const a = answers[r.id];
                  const boss = reportsTo(r);
                  return (
                    <React.Fragment key={r.id}>
                      <tr className={`tr-clickable-row ${isOpen ? 'tr-row-open' : ''}`} onClick={() => toggle(r)} aria-expanded={isOpen}>
                        <td>
                          <span className="tr-row-toggle">{isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
                          <strong>{r.client_name}</strong>
                        </td>
                        <td>
                          {advisorName(r)}
                          {boss ? <div className="tr-forms-sub">reports to {boss}</div> : null}
                        </td>
                        <td>{fmtDay(isDone(r) ? r.submitted_at : r.created_at)}</td>
                        <td className="tr-forms-action">{isDone(r) ? (isOpen ? 'Hide' : 'View answers') : 'Not finished'}</td>
                      </tr>
                      {isOpen && (
                        <tr className="tr-expand-row"><td colSpan={4}>
                          {!isDone(r) ? <p className="tr-empty">The client hasn't finished this form yet. {advisorName(r)} sent it on {fmtDay(r.created_at)}.</p>
                            : a === 'loading' || !a ? <SkelBlock w="100%" h="120px" />
                              : a === 'error' ? <p className="tr-error">Couldn't load the answers. Close it and open it again.</p>
                                : <IntakeResponsesView responses={a} />}
                        </td></tr>
                      )}
                    </React.Fragment>
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
