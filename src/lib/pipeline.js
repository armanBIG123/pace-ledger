// The numbers on My work → Pipeline's five stages (Names → Booked → Log
// outcome → Follow-up → Won), worked out from the same rules the screens
// behind each stage use.
import { isPastAppointment, isPolicyIssued } from '../data/appointments.js';
import { prospectTotalChecked } from '../data/prospects.js';
import { WEEKLY_TOTAL_TARGET } from './pace.js';
import { fmtDate, todayStr, weekStartOf } from './dates.js';

export function pipelineSummary({ prospects, appointments, presenting, userId, now = new Date() }) {
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
  const sold = mine.filter(a => a.officiallySold && (a.appointmentDate || '').slice(0, 7) === month);
  const recruits = mine.filter(a => a.officiallyRecruited && (a.appointmentDate || '').slice(0, 7) === month).length;
  const waiting = mine.filter(a => a.officiallySold && !isPolicyIssued(a));
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
      n: sold.length + recruits,
      sub: `${sold.length} sale${sold.length === 1 ? '' : 's'} · ${recruits} recruit${recruits === 1 ? '' : 's'} this month`,
      waiting: waiting.length, waitingPremium: waiting.reduce((t, a) => t + (Number(a.targetPremium) || 0), 0),
    },
  };
}
