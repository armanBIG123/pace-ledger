// Challenges (the banner on Today): which one to show, its countdown, and
// where you stand. Pure, so it's easy to check. Dates are Central Time, like
// pace weeks: a challenge runs from 12:00 AM on its first day through the
// end of its last day, and its winners show through the end of another day.
import { zonedInstant, zonedParts } from './zoned.js';

export const CT = 'America/Chicago';
export const TITLE_MAX = 40;
export const TAGLINE_MAX = 100;

export const METRICS = {
  appointments: { label: 'Appointments set', short: 'Appointments', one: 'appointment', many: 'appointments', verb: 'Set' },
  recruits: { label: 'Recruits', short: 'Recruits', one: 'recruit', many: 'recruits', verb: 'Recruit' },
};
export const METRIC_KEYS = Object.keys(METRICS);
export const THEMES = [
  { value: 'thanksgiving', label: 'Thanksgiving' },
  { value: 'classic', label: 'Classic' },
];

const DAY = 864e5;
const plusDays = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
// The Central day an instant falls on.
export const centralDay = iso => zonedParts(new Date(iso), CT).day;
// 12:00 AM Central on a day, as an ISO instant.
export const centralMidnight = day => zonedInstant(day, '00:00', CT).toISOString();

// 'upcoming' | 'live' | 'winners' | 'over'
export function phaseOf(ch, now = Date.now()) {
  if (!ch) return 'over';
  if (now < Date.parse(ch.starts_at)) return 'upcoming';
  if (now < Date.parse(ch.ends_at)) return 'live';
  if (now < Date.parse(ch.show_until)) return 'winners';
  return 'over';
}

// The one to show: one that's on (ending soonest), else the latest winners,
// else one starting within a week.
export function pickChallenge(list, now = Date.now()) {
  const by = (phase, key, dir) => (list || []).filter(c => phaseOf(c, now) === phase)
    .sort((a, b) => dir * (Date.parse(a[key]) - Date.parse(b[key])))[0];
  const soon = by('upcoming', 'starts_at', 1);
  return by('live', 'ends_at', 1) || by('winners', 'ends_at', -1)
    || (soon && Date.parse(soon.starts_at) - now <= 7 * DAY ? soon : null);
}

// { days, hours, minutes } until an instant (never below zero).
export function countdown(untilIso, now = Date.now()) {
  const ms = Math.max(0, Date.parse(untilIso) - now);
  const mins = Math.floor(ms / 60000);
  return { days: Math.floor(mins / 1440), hours: Math.floor((mins % 1440) / 60), minutes: mins % 60 };
}

// "11d 14h", "3h 20m", "12m": the short form for the slim bar.
export function countdownShort(untilIso, now = Date.now()) {
  const { days, hours, minutes } = countdown(untilIso, now);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

export function ordinal(n) {
  const v = n % 100;
  const s = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  return `${n}${s}`;
}

// "Mon, Nov 30" for a Central day.
export function dayLabel(day) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
export const lastDayOf = ch => centralDay(new Date(Date.parse(ch.ends_at) - 1).toISOString());
export const winnersDayOf = ch => centralDay(ch.ends_at);

// The board from challenge_board's rows: { appointments: { top, me, people }, ... }.
export function groupBoard(rows, metrics, meId) {
  const out = {};
  (metrics || METRIC_KEYS).forEach(m => {
    const mine = (rows || []).filter(r => r.metric === m).sort((a, b) => a.place - b.place);
    out[m] = {
      top: mine.filter(r => r.place <= 3),
      me: mine.find(r => r.user_id === meId) || null,
      people: mine.reduce((n, r) => Math.max(n, r.people || 0), 0),
    };
  });
  return out;
}

const count = (n, m) => `${n} ${n === 1 ? METRICS[m].one : METRICS[m].many}`;

// One line on where you stand, and what it takes to move up. A tie goes to
// whoever got there first, so passing someone takes one more than they have.
export function standingLine(board, metric, phase = 'live') {
  const { top, me } = board;
  if (phase === 'winners') {
    if (!me) return '';
    return me.place === 1 ? `You won with ${count(me.n, metric)}!` : `You finished ${ordinal(me.place)} with ${me.n}.`;
  }
  if (!me) {
    if (top.length < 3) return `Your first ${METRICS[metric].one} puts you in the top 3.`;
    return `${METRICS[metric].verb} ${top[2].n + 1} to reach the top 3.`;
  }
  if (me.place === 1) {
    const next = top[1];
    if (!next) return `You're in 1st with ${me.n}.`;
    return me.n > next.n ? `You're in 1st, ahead by ${me.n - next.n}.` : "You're in 1st. Tied, but you got there first.";
  }
  if (me.place <= 3) {
    const ahead = top[me.place - 2];
    return `You're ${ordinal(me.place)}. ${ahead.n - me.n + 1} more to take ${ordinal(me.place - 1)}.`;
  }
  return `You're ${ordinal(me.place)} with ${me.n}. ${top[2].n - me.n + 1} more for the top 3.`;
}

// "Chris D." (phones).
export function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0] || '';
}

// The editor's form <-> a challenge row.
export function formOf(ch, today) {
  if (!ch) {
    return { title: '', tagline: '', metrics: [...METRIC_KEYS], theme: 'classic', startDay: today, lastDay: plusDays(today, 13), winnersUntil: plusDays(today, 20) };
  }
  return {
    title: ch.title, tagline: ch.tagline || '', metrics: [...(ch.metrics || METRIC_KEYS)], theme: ch.theme || 'classic',
    startDay: centralDay(ch.starts_at), lastDay: lastDayOf(ch), winnersUntil: centralDay(new Date(Date.parse(ch.show_until) - 1).toISOString()),
  };
}

export function rowOf(f) {
  return {
    title: f.title.trim(), tagline: f.tagline.trim() || null, metrics: METRIC_KEYS.filter(m => f.metrics.includes(m)), theme: f.theme,
    starts_at: centralMidnight(f.startDay), ends_at: centralMidnight(plusDays(f.lastDay, 1)), show_until: centralMidnight(plusDays(f.winnersUntil, 1)),
  };
}

// What's wrong with the form, or ''.
export function formProblem(f) {
  if (!f.title.trim()) return 'Give it a name.';
  if (f.title.trim().length > TITLE_MAX) return `Keep the name to ${TITLE_MAX} characters.`;
  if (f.tagline.trim().length > TAGLINE_MAX) return `Keep the line under the name to ${TAGLINE_MAX} characters.`;
  if (!f.metrics.length) return 'Pick at least one thing to count.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.startDay || '') || !/^\d{4}-\d{2}-\d{2}$/.test(f.lastDay || '') || !/^\d{4}-\d{2}-\d{2}$/.test(f.winnersUntil || '')) return 'Pick all three dates.';
  if (f.lastDay < f.startDay) return 'The last day is before the first day.';
  if (f.winnersUntil <= f.lastDay) return 'Show the winners until a day after the last day.';
  return '';
}
