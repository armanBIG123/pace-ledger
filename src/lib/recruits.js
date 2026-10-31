// Recruits board: where each new person is on the path from invite to
// first sale, and what they (or their leader) need to do next.
import { addBusinessDays, contractingInApp, daysBetween, licensingStatus, WRITING_NUMBER_BUSINESS_DAYS } from '../licensing.js';
import { tierAtLeast } from '../hierarchy.js';

export const RECRUIT_STAGES = [
  { key: 'invited', label: 'Invited', hint: 'Has a sign-up link, not joined yet' },
  { key: 'licensing', label: 'Getting licensed', hint: 'Course and state exam' },
  { key: 'contracting', label: 'Contracting', hint: 'Contracting and the F&G writing number' },
  { key: 'ready', label: 'Ready to sell', hint: 'Licensed and appointed, no sale yet' },
  { key: 'firstsale', label: 'First sale', hint: 'In the last 30 days' },
];
const STAGE_ORDER = Object.fromEntries(RECRUIT_STAGES.map((s, i) => [s.key, i]));

export const INVITE_FOLLOW_UP_DAYS = 7;
export const LICENSING_STUCK_DAYS = 10;
export const PROFILE_NUDGE_DAYS = 3;
export const RECENT_JOIN_DAYS = 180;
export const FIRST_SALE_SHOWN_DAYS = 30;

const fmt = d => new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// Who needs their sales looked up: licensed people who joined recently
// (everyone else is either still getting licensed or long past this).
export function salesLookupIds(members, today) {
  return members.filter(p => !pastRecruiting(p) && isLicensed(p) && (!p.created_at || daysBetween(p.created_at, `${today}T12:00:00`) <= RECENT_JOIN_DAYS)).map(p => p.id);
}

// Senior Associate and up are long past this.
const pastRecruiting = p => !!p.hierarchy_tier && tierAtLeast(p.hierarchy_tier, 'SA');
// Field Associate needs a license, so an FA counts as licensed even if
// they never typed their numbers into PaceLedger.
const isLicensed = p => licensingStatus(null, p).licensed || (!!p.hierarchy_tier && tierAtLeast(p.hierarchy_tier, 'FA'));

// members: team profiles (npn, fg_writing_number, licensed_at, created_at,
// manager_id); progress: Map user id -> licensing_progress row; invites:
// open sign-up links; sales: Map user id -> sold appointment dates, oldest
// first; upcoming: next 7 days of appointments; today: 'YYYY-MM-DD'.
// A "first sale" is their first sale once licensed (sales on their
// appointments before that are observation sales).
export function buildRecruitBoard({ members, progress, invites = [], sales = new Map(), upcoming = [], today }) {
  const rows = [];
  const bookedSoon = new Map();
  upcoming.forEach(a => { if (!a.isFollowUp) bookedSoon.set(a.userId, (bookedSoon.get(a.userId) || 0) + 1); });

  invites.forEach(inv => {
    const days = daysBetween(inv.created_at, `${today}T12:00:00`);
    rows.push({
      key: `inv-${inv.id}`, stage: 'invited', invite: inv, name: inv.invitee_name || 'Someone invited',
      detail: `Sign-up link made ${fmt(inv.created_at)}${inv.emailed_to ? ` and emailed to ${inv.emailed_to}` : ''}. Expires ${fmt(inv.expires_at)}.`,
      days, flag: days >= INVITE_FOLLOW_UP_DAYS ? 'stuck' : null, flagText: days >= INVITE_FOLLOW_UP_DAYS ? 'Follow up' : '',
    });
  });

  members.forEach(person => {
    if (pastRecruiting(person)) return;
    const pr = progress.get(person.id) || null;
    const st = licensingStatus(pr, person);
    const joined = person.created_at ? daysBetween(person.created_at, `${today}T12:00:00`) : 0;
    const base = { key: person.id, person, name: person.display_name, pr, st };

    if (isLicensed(person)) {
      if (joined > RECENT_JOIN_DAYS) return;
      const after = person.licensed_at ? String(person.licensed_at).slice(0, 10) : null;
      const firstSale = (sales.get(person.id) || []).find(d => !after || d >= after);
      if (firstSale) {
        const ago = daysBetween(`${firstSale}T12:00:00`, `${today}T12:00:00`);
        if (ago <= FIRST_SALE_SHOWN_DAYS) {
          rows.push({ ...base, stage: 'firstsale', detail: `First sale ${fmt(firstSale)}${person.created_at ? `, ${daysBetween(person.created_at, `${firstSale}T12:00:00`)} days after joining` : ''}.`, days: ago, flag: null });
        }
        return;
      }
      const since = person.licensed_at ? daysBetween(person.licensed_at, `${today}T12:00:00`) : null;
      const booked = bookedSoon.get(person.id) || 0;
      rows.push({
        ...base, stage: 'ready',
        detail: `${person.licensed_at ? `Appointed ${fmt(person.licensed_at)}. ` : 'Licensed and appointed. '}${booked ? `${booked} appointment${booked === 1 ? '' : 's'} in the next 7 days.` : 'Nothing booked in the next 7 days.'}`,
        days: since ?? joined, flag: booked ? null : 'action', flagText: booked ? '' : 'Book appointments',
      });
      return;
    }

    if (st.done.npn) {
      if (!st.done.insuracloud) {
        rows.push(contractingInApp()
          ? { ...base, stage: 'contracting', step: 'agreement', detail: 'Has their NPN. Next they sign their producer agreement in PaceLedger (Growth → Licensing).', days: pr && pr.updated_at ? daysBetween(pr.updated_at, `${today}T12:00:00`) : null, flag: 'action', flagText: 'Have them sign' }
          : { ...base, stage: 'contracting', step: 'send', detail: 'Has their NPN. Send them the contracting link, then mark it sent.', days: pr && pr.updated_at ? daysBetween(pr.updated_at, `${today}T12:00:00`) : null, flag: 'action', flagText: 'Send contracting link' });
      } else if (!st.done.profileSubmitted) {
        const days = pr && pr.contracting_sent_on ? daysBetween(`${pr.contracting_sent_on}T12:00:00`, `${today}T12:00:00`) : null;
        const late = days != null && days >= PROFILE_NUDGE_DAYS;
        rows.push({ ...base, stage: 'contracting', step: contractingInApp() ? 'info' : 'profile', detail: contractingInApp()
          ? `Agreement countersigned${pr && pr.contracting_sent_on ? ` ${fmt(pr.contracting_sent_on)}` : ''}. Waiting on them to send their contracting info.`
          : `Contracting link sent${pr && pr.contracting_sent_on ? ` ${fmt(pr.contracting_sent_on)}` : ''}. Waiting on them to submit their profile.`, days, flag: late ? 'stuck' : null, flagText: late ? 'Nudge them' : '' });
      } else {
        const sub = pr.profile_submitted_on;
        const due = addBusinessDays(sub, WRITING_NUMBER_BUSINESS_DAYS);
        const late = today > due;
        rows.push({ ...base, stage: 'contracting', step: 'number', due, detail: `${contractingInApp() ? 'Contracting info sent' : 'Profile submitted'} ${fmt(sub)}. F&G writing number ${late ? `was due ${fmt(due)}` : `due by ${fmt(due)}`}.`, days: daysBetween(`${sub}T12:00:00`, `${today}T12:00:00`), flag: late ? 'late' : null, flagText: late ? 'Writing number late' : '' });
      }
      return;
    }

    const lastMove = pr && pr.updated_at ? pr.updated_at : person.created_at;
    const idle = lastMove ? daysBetween(lastMove, `${today}T12:00:00`) : 0;
    const examSoon = pr && pr.exam_on && !st.done.examPassed && pr.exam_on >= today;
    const detail = examSoon ? `Exam booked for ${fmt(pr.exam_on)}.`
      : pr && pr.exam_attempts && !pr.exam_on ? 'Didn\'t pass last time. Needs a new exam date.'
      : st.done.courseDone ? 'Finished the course. Next: book the state exam.'
      : st.done.course ? `In the pre-licensing course${pr.course_started_on ? ` since ${fmt(pr.course_started_on)}` : ''}.`
      : 'Hasn\'t started the pre-licensing course.';
    const stuck = idle >= LICENSING_STUCK_DAYS;
    rows.push({ ...base, stage: 'licensing', detail, days: joined, idle, flag: stuck ? 'stuck' : null, flagText: stuck ? `No progress in ${idle} days` : '' });
  });

  const rank = r => (r.flag === 'late' ? 0 : r.flag === 'action' ? 1 : r.flag === 'stuck' ? 2 : 3);
  rows.sort((a, b) => (rank(a) - rank(b)) || (STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage]) || ((b.days || 0) - (a.days || 0)) || a.name.localeCompare(b.name));
  const counts = Object.fromEntries(RECRUIT_STAGES.map(s => [s.key, rows.filter(r => r.stage === s.key).length]));
  counts.flagged = rows.filter(r => r.flag).length;
  return { rows, counts };
}
