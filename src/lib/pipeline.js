// The numbers on the pipeline bar at the top of My work → Clients
// (Prospects → Appointments → Log outcomes → Follow-up meetings → Results),
// worked out from the same rules the screens behind each stage use.
import { isPastAppointment, isPolicyIssued } from '../data/appointments.js';
import { prospectTotalChecked } from '../data/prospects.js';
import { WEEKLY_TOTAL_TARGET } from './pace.js';
import { fmtDate, todayStr, weekStartOf } from './dates.js';
import { centralDate, tickboxRecruitCounts } from './recruitCounts.js';
import { creditedTo } from './credit.js';

// signups: { since, rows } from fetchRecruitSignups for this month. Recruits
// are the people who signed up under you this month; before the switch,
// appointments marked "Officially recruited" count instead.
export function pipelineSummary({ prospects, appointments, presenting, signups = { since: null, rows: [] }, userId, now = new Date() }) {
  const today = todayStr();
  const month = today.slice(0, 7);
  const week = weekStartOf(today);
  const mine = appointments.filter(a => a.userId === userId);
  const active = prospects.filter(p => !p.markedRecruited && !p.markedSold);
  const upcoming = [...mine, ...presenting.filter(a => a.presentingFor)].filter(a => !isPastAppointment(a));
  const setThisWeek = [...mine.filter(a => !a.isFollowUp), ...presenting.filter(a => a.presentingFor && !a.isFollowUp)].filter(a => a.weekOf === week).length;
  const past = mine.filter(isPastAppointment);
  const toLog = past.filter(a => !a.followUpCompletedAt);
  // Ones your team booked that you presented, from the last 30 days (Log
  // outcome → You presented).
  const presentedToLog = presenting.filter(a => a.presentingFor && isPastAppointment(a) && !a.followUpCompletedAt
    && (a.appointmentDate || '') >= fmtDate(new Date(now.getTime() - 30 * 864e5)));
  const oldest = toLog.reduce((m, a) => (!m || (a.appointmentDate || '') < m ? a.appointmentDate : m), '');
  const oldestDays = oldest ? Math.max(0, Math.round((now - new Date(`${oldest}T12:00:00`)) / 864e5)) : 0;
  const needs = past.filter(a => a.status === 'needs_follow_up').length;
  const followUpsBooked = mine.filter(a => a.isFollowUp && !isPastAppointment(a)).length;
  // Your sales: your own, plus ones split with you (your share of the premium).
  const credit = creditedTo([...mine, ...(presenting || []).filter(a => a.splitUserId === userId)], userId);
  const sold = credit.filter(a => a.officiallySold && (a.appointmentDate || '').slice(0, 7) === month);
  const recruits = mine.filter(a => tickboxRecruitCounts(a, signups.since) && (a.appointmentDate || '').slice(0, 7) === month).length
    + (signups.rows || []).filter(s => s.uplineId === userId && centralDate(s.signedUpAt).slice(0, 7) === month).length;
  const waiting = mine.filter(a => a.officiallySold && !isPolicyIssued(a));
  // Results: submitted (waiting to be issued) vs. issued this month.
  const issued = mine.filter(a => a.officiallySold && isPolicyIssued(a) && (a.effectiveDate || '').slice(0, 7) === month).length;
  return {
    names: { n: active.length, sub: `${active.filter(p => prospectTotalChecked(p) > 0).length} scored` },
    booked: { n: upcoming.length, sub: `This week: ${setThisWeek} of ${WEEKLY_TOTAL_TARGET}` },
    outcome: {
      n: toLog.length + presentedToLog.length,
      sub: toLog.length ? `Oldest: ${oldestDays === 0 ? 'today' : `${oldestDays} day${oldestDays === 1 ? '' : 's'}`}${presentedToLog.length ? ` · ${presentedToLog.length} you presented` : ''}`
        : presentedToLog.length ? `${presentedToLog.length} you presented` : 'All logged',
    },
    followup: { n: needs, sub: followUpsBooked ? `${followUpsBooked} follow-up${followUpsBooked === 1 ? '' : 's'} booked` : 'Needs a next step' },
    won: {
      n: waiting.length,
      sub: `submitted · ${issued} issued in ${now.toLocaleDateString('en-US', { month: 'short' })}`,
      sales: sold.length, recruits,
      waiting: waiting.length, waitingPremium: waiting.reduce((t, a) => t + (Number(a.targetPremium) || 0), 0),
    },
  };
}
