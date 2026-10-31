// Team Pace → Recruits: every new person's path from invite to first sale,
// with what they (or you) need to do next at the top.
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Award, ChevronRight, Mail } from 'lucide-react';
import { contractingInApp, fetchLicensingForUsers, markContractingStep } from '../../licensing.js';
import { buildRecruitBoard, RECRUIT_STAGES, salesLookupIds } from '../../lib/recruits.js';
import { todayStr } from '../../lib/dates.js';
import { fetchHierarchyPeople } from '../../data/team.js';
import { fetchSaleDates, fetchTeamOpenInvites, fetchUpcomingAppointments } from '../../data/recruits.js';
import { AGENCY_EMAIL } from '../../data/promotions.js';
import { ComposeEmail } from '../../components/email.jsx';
import { MoreMenu, RefreshButton, SkeletonTable, TitleInfo } from '../../components/ui.jsx';
import { NoMatches, PeopleToolbar, personMatches, usePeopleSearch } from '../../components/peopleList.jsx';

const first = name => (name || '').trim().split(/\s+/)[0] || 'there';
const fmtLong = d => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : '');
const STAGE_LABEL = Object.fromEntries(RECRUIT_STAGES.map(s => [s.key, s.label]));

export function RecruitsSubView({ user, members, loadingMembers, emptyMessage }) {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' | 'flagged' | a stage key
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [compose, setCompose] = useState(null);
  const [q] = usePeopleSearch();

  const refresh = useCallback(async () => {
    if (!members.length) { setData({ board: { rows: [], counts: {} }, byId: new Map() }); return; }
    setData(null);
    const ids = members.map(m => m.id);
    const today = todayStr();
    const [people, prog, inv, upcoming] = await Promise.all([fetchHierarchyPeople(), fetchLicensingForUsers(ids), fetchTeamOpenInvites(), fetchUpcomingAppointments(7)]);
    const byId = new Map(people.map(p => [p.id, p]));
    const team = members.map(m => ({ ...m, ...(byId.get(m.id) || {}) }));
    const sales = await fetchSaleDates(salesLookupIds(team, today));
    const board = buildRecruitBoard({ members: team, progress: prog, invites: inv.rows, sales, upcoming, today });
    setData({ board, byId, missingSetup: !!inv.missingSetup });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);
  useEffect(() => { refresh(); }, [refresh]);

  async function mark(row, step, done) {
    setBusyId(row.key); setNotice(null);
    const res = await markContractingStep(row.person.id, step);
    setBusyId(null);
    if (!res.ok) { setNotice({ kind: 'warn', text: /function|does not exist/i.test(res.error || '') ? 'This needs the database update first (migration-recruits-field-training.sql).' : `Couldn't save that: ${res.error}` }); return; }
    setNotice({ kind: 'ok', text: done });
    refresh();
  }

  if (loadingMembers || data === null) return <SkeletonTable rows={6} cols={4} />;
  if (members.length === 0) return <div className="tr-card"><p className="tr-empty">{emptyMessage}</p></div>;

  const { rows, counts } = data.board;
  const nameOf = id => (data.byId.get(id) || {}).display_name || '';
  const matches = r => personMatches({ display_name: r.name, email: r.person && r.person.email }, q);
  const shown = rows.filter(r => (filter === 'all' ? true : filter === 'flagged' ? !!r.flag : r.stage === filter) && matches(r));
  const me = user.displayName || '';

  // Each row gets at most one button, and only gold when the row needs
  // you; anything less common sits in the ⋯ menu.
  function plan(r) {
    const p = r.person;
    const busy = busyId === r.key;
    const email = (to, name, subject, body) => () => setCompose({ to, name, subject, body });
    const markBtn = (label, step, done, gold) => ({ label: busy ? 'Saving…' : label, gold, busy, onClick: () => mark(r, step, done) });
    if (r.stage === 'invited') {
      if (!r.invite.emailed_to) return { main: null, more: [] };
      const run = email(r.invite.emailed_to, r.name, 'Your PaceLedger invite',
        `Hi ${first(r.name)},\n\nJust checking you got your PaceLedger sign-up link. It works until ${fmtLong(r.invite.expires_at)}. Let me know if you have any questions.\n\n${me}`);
      return r.flag ? { main: { label: 'Email', Icon: Mail, onClick: run }, more: [] } : { main: null, more: [{ label: `Email ${first(r.name)}`, onClick: run }] };
    }
    if (r.stage === 'licensing') {
      if (!p.email) return { main: null, more: [] };
      const run = email(p.email, p.display_name, 'Checking in on your licensing',
        `Hi ${first(p.display_name)},\n\nHow's licensing going? ${r.detail} Is there anything I can help with to get you to the next step?\n\n${me}`);
      return r.flag ? { main: { label: 'Email', Icon: Mail, onClick: run }, more: [] } : { main: null, more: [{ label: `Email ${first(p.display_name)}`, onClick: run }] };
    }
    if (r.stage === 'contracting' && (r.step === 'agreement' || r.step === 'info')) {
      // Contracting in PaceLedger: the agent does these steps; nothing to mark.
      const agreement = r.step === 'agreement';
      return {
        main: null,
        more: p.email ? [{ label: 'Email a reminder', onClick: email(p.email, p.display_name, agreement ? 'Sign your producer agreement' : 'Send your contracting info',
          `Hi ${first(p.display_name)},\n\nQuick reminder to ${agreement ? 'sign your producer agreement' : 'send your contracting info'} in PaceLedger: Growth → Licensing. It only takes a few minutes, and it's the next step to getting appointed.\n\n${me}`) }] : [],
      };
    }
    if (r.stage === 'contracting' && r.step === 'send') {
      return { main: markBtn('Mark link sent', 'sent', `Marked the contracting link as sent to ${p.display_name}.`, true), more: [] };
    }
    if (r.stage === 'contracting' && r.step === 'profile') {
      return {
        main: markBtn('Mark profile submitted', 'submitted', `Marked ${p.display_name}'s contracting profile as submitted.`, !!r.flag),
        more: [
          p.email ? { label: 'Email a reminder', onClick: email(p.email, p.display_name, 'Your contracting profile',
            `Hi ${first(p.display_name)},\n\nQuick reminder to finish and submit your contracting profile from the link I sent. Your F&G writing number usually arrives within 2 business days after that, and then you're ready to write business.\n\n${me}`) } : null,
          { label: 'Undo "link sent"', disabled: busy, onClick: () => mark(r, 'unsent', 'Undone.') },
        ],
      };
    }
    if (r.stage === 'contracting' && r.step === 'number') {
      return {
        main: r.flag === 'late' ? { label: 'Email agency', gold: true, onClick: email(AGENCY_EMAIL, 'Agency', `F&G writing number for ${p.display_name}`,
          `Hi,\n\n${p.display_name} ${contractingInApp() ? 'sent their contracting info' : 'submitted their contracting profile'} on ${fmtLong(r.pr.profile_submitted_on)} and hasn't received their F&G writing number yet.\n\nNPN: ${p.npn || 'on file in PaceLedger'}\n\nCould you check on it?\n\nThanks,\n${me}`) } : null,
        more: contractingInApp() ? [] : [{ label: 'Undo "profile submitted"', disabled: busy, onClick: () => mark(r, 'unsubmitted', 'Undone.') }],
      };
    }
    if (r.stage === 'ready') {
      if (!p.email) return { main: null, more: [] };
      const run = email(p.email, p.display_name, "Let's book your first appointments",
        `Hi ${first(p.display_name)},\n\nYou're licensed and appointed. Let's get your first appointments on the calendar this week. When are you free to go through your list together?\n\n${me}`);
      return r.flag ? { main: { label: 'Email', Icon: Mail, onClick: run }, more: [] } : { main: null, more: [{ label: `Email ${first(p.display_name)}`, onClick: run }] };
    }
    if (r.stage === 'firstsale' && p.email) {
      return { main: { label: 'Recognize', Icon: Award, onClick: email(p.email, p.display_name, 'Congrats on your first sale!',
        `Hi ${first(p.display_name)},\n\nCongratulations on your first sale! That's a big milestone. Proud of you. On to the next one.\n\n${me}`) }, more: [] };
    }
    return { main: null, more: [] };
  }

  // "Contracting · Derrick Hale's team"
  function context(r) {
    const team = id => (!id ? '' : id === user.id ? 'Your team' : nameOf(id) ? `${nameOf(id)}'s team` : '');
    if (r.stage === 'invited') {
      const by = r.invite.created_by && r.invite.created_by !== user.id ? `invited by ${nameOf(r.invite.created_by) || 'someone on your team'}` : '';
      return [STAGE_LABEL[r.stage], team(r.invite.upline_id || r.invite.created_by), by].filter(Boolean).join(' · ');
    }
    return [STAGE_LABEL[r.stage], team(r.person && r.person.manager_id)].filter(Boolean).join(' · ');
  }

  return (
    <>
      <div className="tr-row-head tr-screen-head">
        <TitleInfo title="Recruits" info={<>Every new person's path from invite to first sale. Anyone who needs you is at the top. A writing number counts as late 2 business days after {contractingInApp() ? 'the contracting info is sent' : 'the contracting profile is submitted'}. "Email agency" writes to {AGENCY_EMAIL}.</>} />
        <RefreshButton onClick={refresh} />
      </div>
      {data.missingSetup && <div className="tr-error" style={{ marginBottom: 12 }}>Sign-up links and contracting steps show here once the database update (migration-recruits-field-training.sql) has been run.</div>}
      {notice && <div className={notice.kind === 'ok' ? 'tr-flash' : 'tr-error'} style={{ marginBottom: 12 }}>{notice.text}</div>}

      <div className="tr-rec-stages" role="group" aria-label="Show">
        <button type="button" className={`tr-rec-stage tr-rec-stage-flag ${filter === 'flagged' ? 'tr-rec-stage-on' : ''}`} aria-pressed={filter === 'flagged'} onClick={() => setFilter(filter === 'flagged' ? 'all' : 'flagged')}>
          <strong>{counts.flagged || 0}</strong><span>Need you</span>
        </button>
        {RECRUIT_STAGES.map((s, i) => (
          <React.Fragment key={s.key}>
            {i > 0 && <ChevronRight size={14} className="tr-rec-arrow" aria-hidden="true" />}
            <button type="button" className={`tr-rec-stage ${filter === s.key ? 'tr-rec-stage-on' : ''}`} aria-pressed={filter === s.key} title={s.hint} onClick={() => setFilter(filter === s.key ? 'all' : s.key)}>
              <strong>{counts[s.key] || 0}</strong><span>{s.label}</span>
            </button>
          </React.Fragment>
        ))}
      </div>

      <PeopleToolbar total={rows.length} matched={rows.filter(matches).length} />
      {shown.length === 0 && q.trim() && rows.length > 0 ? (
        <div className="tr-card"><NoMatches /></div>
      ) : shown.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">
          {rows.length === 0 ? 'No new recruits right now. People show up here from the moment you make their sign-up link until their first sale.'
            : filter === 'flagged' ? 'Nobody needs you right now. 🎉' : 'Nobody at this step right now.'}
        </p></div>
      ) : (
        <ul className="tr-card tr-rec-list">
          {shown.map(r => {
            const { main, more } = plan(r);
            return (
              <li key={r.key} className="tr-rec-row">
                <span className={`tr-rec-dot ${r.flag ? `tr-rec-dot-${r.flag}` : ''}`} aria-hidden="true" />
                <div className="tr-rec-main">
                  <div className="tr-rec-name"><strong>{r.name}</strong> <span className="tr-rec-context">{context(r)}</span></div>
                  <div className="tr-rec-detail">
                    {r.flag && r.flagText ? <><span className={`tr-rec-flagtext tr-rec-flagtext-${r.flag}`}>{r.flagText}</span> · </> : null}
                    {r.detail}
                  </div>
                </div>
                <div className="tr-rec-actions">
                  {main ? (
                    <button type="button" className={`tr-btn tr-btn-sm ${main.gold ? 'tr-btn-brass' : 'tr-btn-ghost'}`} disabled={main.busy} onClick={main.onClick}>
                      {main.Icon ? <main.Icon size={14} aria-hidden="true" /> : null} {main.label}
                    </button>
                  ) : null}
                  <MoreMenu items={more} label={`More for ${r.name}`} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {compose && createPortal(<ComposeEmail {...compose} onClose={() => setCompose(null)} />, document.querySelector('.tr-root') || document.body)}
    </>
  );
}
