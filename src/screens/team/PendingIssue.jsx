// Team → Track Production → Submitted, not issued: every policy someone on
// your team has submitted that isn't issued yet, oldest first, so leaders
// can help get it over the line. Leaders can open a policy, read and add
// notes, and email the advisor; the advisor still sets the effective date
// and marks requirements complete.
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchPolicyNotesFor, fetchSoldPolicies, isPolicyIssued } from '../../data/appointments.js';
import { fmtDisplayDate, todayStr } from '../../lib/dates.js';
import { fmtCurrency } from '../../lib/format.js';
import { ComposeEmail } from '../../components/email.jsx';
import { MoreMenu, SkeletonTable } from '../../components/ui.jsx';
import { PolicyCard } from '../Appointments.jsx';

const STUCK_DAYS = 14;
const first = name => (name || '').trim().split(/\s+/)[0] || 'there';
const daysSince = d => (d ? Math.max(0, Math.round((new Date(`${todayStr()}T12:00:00`) - new Date(`${d}T12:00:00`)) / 864e5)) : 0);
const shortDate = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// What's still standing between this policy and issued, in plain words.
export function whatsLeft(p) {
  if (!p.requirementsCompleted && !p.effectiveDate) return 'Requirements open · no effective date yet';
  if (!p.requirementsCompleted) return `Requirements open · effective ${shortDate(p.effectiveDate)}`;
  if (!p.effectiveDate) return 'Requirements done · no effective date yet';
  return `Requirements done · issues ${fmtDisplayDate(p.effectiveDate)}`;
}

export function PendingIssueView({ user, members }) {
  const [rows, setRows] = useState(null);
  const [latest, setLatest] = useState(new Map());
  const [open, setOpen] = useState(null);
  const [compose, setCompose] = useState(null);

  const refresh = useCallback(async () => {
    const ids = new Set(members.map(m => m.id));
    const sold = await fetchSoldPolicies();
    const pending = sold
      .filter(p => ids.has(p.userId) && !isPolicyIssued(p))
      .sort((a, b) => (a.appointmentDate || '').localeCompare(b.appointmentDate || ''));
    const notes = await fetchPolicyNotesFor(pending.map(p => p.id));
    const byPolicy = new Map();
    notes.forEach(n => { if (!byPolicy.has(n.appointment_id)) byPolicy.set(n.appointment_id, n); });
    setLatest(byPolicy);
    setRows(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);
  useEffect(() => { refresh(); }, [refresh]);

  if (rows === null) return <SkeletonTable rows={5} cols={3} />;
  if (rows.length === 0) {
    return <div className="tr-card"><p className="tr-empty">Nothing waiting. Everything your team has submitted is issued.</p></div>;
  }

  const byId = new Map(members.map(m => [m.id, m]));
  const total = rows.reduce((t, p) => t + (Number(p.targetPremium) || 0), 0);
  const stuck = rows.filter(p => daysSince(p.appointmentDate) >= STUCK_DAYS).length;
  const me = user.displayName || '';

  return (
    <>
      <p className="tr-count-line">
        <strong>{rows.length}</strong> {rows.length === 1 ? 'policy' : 'policies'} · <strong>{fmtCurrency(total)}</strong> submitted, not issued
        {stuck ? <> · <strong className="tr-count-warn">{stuck}</strong> waiting 2+ weeks</> : null}
      </p>
      <ul className="tr-card tr-rec-list">
        {rows.map(p => {
          const advisor = byId.get(p.userId) || {};
          const days = daysSince(p.appointmentDate);
          const flag = days >= STUCK_DAYS ? 'late' : days >= 7 ? 'action' : null;
          const note = latest.get(p.id);
          const isOpen = open === p.id;
          const more = advisor.email ? [{
            label: `Email ${first(advisor.display_name)}`,
            onClick: () => setCompose({
              to: advisor.email, name: advisor.display_name, subject: `Getting ${p.client}'s policy issued`,
              body: `Hi ${first(advisor.display_name)},\n\nChecking on ${p.client}'s policy, submitted ${fmtDisplayDate(p.appointmentDate)}. ${whatsLeft(p)}. What's still needed, and how can I help get it issued?\n\n${me}`,
            }),
          }] : [];
          return (
            <li key={p.id} className="tr-pend-item">
              <div className="tr-rec-row">
                <span className={`tr-rec-dot ${flag ? `tr-rec-dot-${flag}` : ''}`} aria-hidden="true" />
                <div className="tr-rec-main">
                  <div className="tr-rec-name">
                    <strong>{p.client}</strong> <span className="tr-mono tr-pend-premium">{Number(p.targetPremium) > 0 ? fmtCurrency(Number(p.targetPremium)) : 'no premium entered'}</span>
                    <span className="tr-rec-context">{advisor.display_name || 'Someone on your team'} · submitted {shortDate(p.appointmentDate)} ({days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'}`})</span>
                  </div>
                  <div className="tr-rec-detail">
                    {flag ? <><span className={`tr-rec-flagtext tr-rec-flagtext-${flag}`}>{flag === 'late' ? 'Waiting 2+ weeks' : 'Waiting a week'}</span> · </> : null}
                    {whatsLeft(p)}
                  </div>
                  {note ? <div className="tr-pend-note">“{note.note}” <span>{note.author_name} · {new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></div> : null}
                </div>
                <div className="tr-rec-actions">
                  <button type="button" className="tr-btn tr-btn-sm tr-btn-ghost" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p.id)}>{isOpen ? 'Close' : 'Open'}</button>
                  <MoreMenu items={more} label={`More for ${p.client}`} />
                </div>
              </div>
              {isOpen && (
                <div className="tr-pend-open">
                  <PolicyCard policy={p} canEdit={p.userId === user.id} currentUser={user} onSaved={refresh} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="tr-pend-foot">Oldest first. Anyone on the team can add notes; the advisor sets the effective date and marks requirements complete.</p>
      {compose && createPortal(<ComposeEmail {...compose} onClose={() => setCompose(null)} />, document.querySelector('.tr-root') || document.body)}
    </>
  );
}
