// Team Pace → Recruits: every new person's path from invite to first sale,
// with what they (or you) need to do next at the top.
import React, { useCallback, useEffect, useState } from 'react';
import { Award, ChevronRight, Mail } from 'lucide-react';
import { fetchLicensingForUsers, markContractingStep } from '../../licensing.js';
import { buildRecruitBoard, RECRUIT_STAGES, salesLookupIds } from '../../lib/recruits.js';
import { todayStr } from '../../lib/dates.js';
import { fetchHierarchyPeople } from '../../data/team.js';
import { fetchSaleDates, fetchTeamOpenInvites, fetchUpcomingAppointments } from '../../data/recruits.js';
import { AGENCY_EMAIL } from '../../data/promotions.js';
import { EmailButton } from '../../components/email.jsx';
import { SkeletonTable } from '../../components/ui.jsx';

const first = name => (name || '').trim().split(/\s+/)[0] || 'there';
const fmtLong = d => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : '');
const STAGE_LABEL = Object.fromEntries(RECRUIT_STAGES.map(s => [s.key, s.label]));

export function RecruitsSubView({ user, members, loadingMembers, emptyMessage }) {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' | 'flagged' | a stage key
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);

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
  const shown = rows.filter(r => (filter === 'all' ? true : filter === 'flagged' ? !!r.flag : r.stage === filter));
  const me = user.displayName || '';

  function actions(r) {
    const p = r.person;
    const busy = busyId === r.key;
    if (r.stage === 'invited') {
      return r.invite.emailed_to ? (
        <EmailButton to={r.invite.emailed_to} name={r.name} subject="Your PaceLedger invite"
          body={`Hi ${first(r.name)},\n\nJust checking you got your PaceLedger sign-up link. It works until ${fmtLong(r.invite.expires_at)}. Let me know if you have any questions.\n\n${me}`} />
      ) : null;
    }
    if (r.stage === 'licensing') {
      return p.email ? <EmailButton to={p.email} name={p.display_name} subject="Checking in on your licensing"
        body={`Hi ${first(p.display_name)},\n\nHow's licensing going? ${r.detail} Is there anything I can help with to get you to the next step?\n\n${me}`} /> : null;
    }
    if (r.stage === 'contracting' && r.step === 'send') {
      return <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" disabled={busy} onClick={() => mark(r, 'sent', `Marked the InsuraCloud link as sent to ${p.display_name}.`)}>{busy ? 'Saving…' : 'Mark link sent'}</button>;
    }
    if (r.stage === 'contracting' && r.step === 'profile') {
      return (
        <>
          <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" disabled={busy} onClick={() => mark(r, 'submitted', `Marked ${p.display_name}'s InsuraCloud profile as submitted.`)}>{busy ? 'Saving…' : 'Mark profile submitted'}</button>
          {p.email ? <EmailButton to={p.email} name={p.display_name} subject="Your InsuraCloud profile"
            body={`Hi ${first(p.display_name)},\n\nQuick reminder to finish and submit your InsuraCloud profile from the link I sent. Your F&G writing number usually arrives within 2 business days after that, and then you're ready to write business.\n\n${me}`} /> : null}
          <button type="button" className="tr-link-btn tr-rec-undo" disabled={busy} onClick={() => mark(r, 'unsent', 'Undone.')}>Undo sent</button>
        </>
      );
    }
    if (r.stage === 'contracting' && r.step === 'number') {
      return (
        <>
          {r.flag === 'late' ? (
            <EmailButton to={AGENCY_EMAIL} name="Agency" label="Email agency" subject={`F&G writing number for ${p.display_name}`}
              body={`Hi,\n\n${p.display_name} submitted their InsuraCloud profile on ${fmtLong(r.pr.profile_submitted_on)} and hasn't received their F&G writing number yet.\n\nNPN: ${p.npn || 'on file in PaceLedger'}\n\nCould you check on it?\n\nThanks,\n${me}`}
              className="tr-btn tr-btn-brass tr-btn-sm" />
          ) : null}
          <button type="button" className="tr-link-btn tr-rec-undo" disabled={busy} onClick={() => mark(r, 'unsubmitted', 'Undone.')}>Undo submitted</button>
        </>
      );
    }
    if (r.stage === 'ready' && r.flag) {
      return p.email ? <EmailButton to={p.email} name={p.display_name} subject="Let's book your first appointments"
        body={`Hi ${first(p.display_name)},\n\nYou're licensed and appointed. Let's get your first appointments on the calendar this week. When are you free to go through your list together?\n\n${me}`} /> : null;
    }
    if (r.stage === 'firstsale') {
      return p.email ? <EmailButton to={p.email} name={p.display_name} label="Recognize" Icon={Award} subject="Congrats on your first sale!"
        body={`Hi ${first(p.display_name)},\n\nCongratulations on your first sale! That's a big milestone. Proud of you. On to the next one.\n\n${me}`} /> : null;
    }
    return null;
  }

  return (
    <>
      <div className="tr-row-head">
        <h2 className="tr-h2">Recruits</h2>
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={refresh}>Refresh</button>
      </div>
      <p className="tr-subtitle">Every new person's path from invite to first sale. Anyone who needs you is at the top.</p>
      {data.missingSetup && <div className="tr-error" style={{ marginBottom: 12 }}>Sign-up links and InsuraCloud steps show here once the database update (migration-recruits-field-training.sql) has been run.</div>}
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

      {shown.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">
          {rows.length === 0 ? 'No new recruits right now. People show up here from the moment you make their sign-up link until their first sale.'
            : filter === 'flagged' ? 'Nobody needs you right now. 🎉' : 'Nobody at this step right now.'}
        </p></div>
      ) : (
        <ul className="tr-card tr-rec-list">
          {shown.map(r => {
            const p = r.person;
            const boss = p ? nameOf(p.manager_id) : '';
            const sub = r.stage === 'invited'
              ? `Invited by ${nameOf(r.invite.created_by) || 'someone on your team'}${r.invite.upline_id && r.invite.upline_id !== r.invite.created_by ? ` · joins ${nameOf(r.invite.upline_id)}'s team` : ''}`
              : [boss ? `reports to ${boss}` : '', p && p.created_at ? `joined ${fmtLong(p.created_at)}` : ''].filter(Boolean).join(' · ');
            return (
              <li key={r.key} className={`tr-rec-row ${r.flag ? `tr-rec-flag-${r.flag}` : ''}`}>
                <div className="tr-rec-main">
                  <div className="tr-rec-name">
                    <strong>{r.name}</strong>
                    <span className={`tr-rec-chip tr-rec-chip-${r.stage}`}>{STAGE_LABEL[r.stage]}</span>
                    {r.flag ? <span className={`tr-rec-flagchip tr-rec-flagchip-${r.flag}`}>{r.flagText}</span> : null}
                  </div>
                  {sub ? <div className="tr-rec-sub">{sub}</div> : null}
                  <div className="tr-rec-detail">{r.detail}</div>
                </div>
                <div className="tr-rec-actions">{actions(r)}</div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="tr-rec-foot"><Mail size={13} aria-hidden="true" /> A writing number counts as late 2 business days after the InsuraCloud profile is submitted. "Email agency" writes to {AGENCY_EMAIL}.</p>
    </>
  );
}
