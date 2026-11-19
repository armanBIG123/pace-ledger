import {
  centralDay, centralMidnight, countdown, countdownShort, formOf, formProblem, groupBoard, lastDayOf, ordinal, phaseOf,
  pickChallenge, rowOf, shortName, standingLine, winnersDayOf,
} from '../../src/lib/challenges.js';
let failures = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { failures++; console.log('FAIL', m); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Central Time days, across the daylight-saving change (Nov 1, 2026)
ok(centralMidnight('2026-11-19') === '2026-11-19T06:00:00.000Z', '12:00 AM Central in November (CST) is 6:00 UTC');
ok(centralMidnight('2026-10-31') === '2026-10-31T05:00:00.000Z', 'and in October (CDT) 5:00 UTC');
ok(centralDay('2026-11-19T05:59:00Z') === '2026-11-18' && centralDay('2026-11-19T06:00:00Z') === '2026-11-19', 'which Central day an instant is');
const blitz = { starts_at: '2026-11-19T06:00:00Z', ends_at: '2026-12-01T06:00:00Z', show_until: '2026-12-08T06:00:00Z', title: 'BIG Bird Blitz', metrics: ['appointments', 'recruits'], theme: 'thanksgiving', tagline: 'Go' };
ok(lastDayOf(blitz) === '2026-11-30' && winnersDayOf(blitz) === '2026-12-01', 'the BIG Bird Blitz: last day Nov 30, winners Dec 1');

// The editor's form round-trips
const f = formOf(blitz, '2026-11-19');
ok(eq([f.startDay, f.lastDay, f.winnersUntil], ['2026-11-19', '2026-11-30', '2026-12-07']), 'form: Nov 19 – Nov 30, winners until Dec 7');
const row = rowOf(f);
ok(row.starts_at === new Date(blitz.starts_at).toISOString() && row.ends_at === new Date(blitz.ends_at).toISOString() && row.show_until === new Date(blitz.show_until).toISOString(), 'and back to the same instants');
const dst = rowOf({ ...f, startDay: '2026-10-25', lastDay: '2026-11-01', winnersUntil: '2026-11-03' });
ok(dst.starts_at === '2026-10-25T05:00:00.000Z' && dst.ends_at === '2026-11-02T06:00:00.000Z', 'across the clock change, still midnight Central');
const blank = formOf(null, '2026-11-19');
ok(blank.title === '' && eq(blank.metrics, ['appointments', 'recruits']) && blank.lastDay === '2026-12-02' && blank.winnersUntil === '2026-12-09', 'a new one: two weeks, winners for a week after');
ok(eq(rowOf({ ...f, metrics: ['recruits', 'appointments'], tagline: '  ' }).metrics, ['appointments', 'recruits']) && rowOf({ ...f, tagline: '  ' }).tagline === null, 'categories in order; an empty line is none');
ok(formProblem(f) === '', 'a good form');
ok(formProblem({ ...f, title: ' ' }) === 'Give it a name.', 'needs a name');
ok(formProblem({ ...f, metrics: [] }) === 'Pick at least one thing to count.', 'needs something to count');
ok(formProblem({ ...f, lastDay: '2026-11-18' }) === 'The last day is before the first day.', 'last day after the first');
ok(formProblem({ ...f, winnersUntil: '2026-11-30' }) === 'Show the winners until a day after the last day.', 'winners after the last day');
ok(/Pick all three dates/.test(formProblem({ ...f, startDay: '' })), 'all three dates');

// Phases and which one shows
const t = Date.parse('2026-11-25T18:00:00Z');
ok(phaseOf(blitz, Date.parse('2026-11-19T05:00:00Z')) === 'upcoming' && phaseOf(blitz, t) === 'live'
  && phaseOf(blitz, Date.parse('2026-12-01T06:00:00Z')) === 'winners' && phaseOf(blitz, Date.parse('2026-12-08T06:00:00Z')) === 'over', 'upcoming, live, winners, over');
const mk = (id, s, e, u) => ({ id, starts_at: new Date(t + s * 864e5).toISOString(), ends_at: new Date(t + e * 864e5).toISOString(), show_until: new Date(t + u * 864e5).toISOString() });
ok(pickChallenge([mk('a', -5, 5, 9), mk('b', -2, 2, 9), mk('w', -9, -1, 6)], t).id === 'b', 'live first, the one ending soonest');
ok(pickChallenge([mk('w1', -9, -3, 4), mk('w2', -9, -1, 6), mk('s', 3, 9, 12)], t).id === 'w2', 'then the latest winners');
ok(pickChallenge([mk('s', 3, 9, 12)], t).id === 's' && pickChallenge([mk('far', 8, 15, 20)], t) === null, 'then one starting within a week');
ok(pickChallenge([], t) === null && pickChallenge(undefined, t) === null, 'none');

// Countdown
ok(eq(countdown('2026-12-01T06:00:00Z', t), { days: 5, hours: 12, minutes: 0 }), '5 days, 12 hours left');
ok(countdownShort('2026-12-01T06:00:00Z', t) === '5d 12h' && countdownShort(new Date(t + 3 * 36e5 + 20 * 6e4).toISOString(), t) === '3h 20m'
  && countdownShort(new Date(t + 30e3).toISOString(), t) === '1m', 'the short form');
ok(eq(countdown('2026-11-01T00:00:00Z', t), { days: 0, hours: 0, minutes: 0 }), 'never below zero');
ok(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st'].join() === [1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal).join(), '1st, 2nd, 3rd, 11th…');
ok(shortName('Taylor Reed') === 'Taylor R.' && shortName('Riley "Dynamite" Park') === 'Riley P.' && shortName('Cher') === 'Cher' && shortName('') === '', 'Taylor R.');

// Where you stand
const R = (metric, place, user_id, n) => ({ metric, place, user_id, display_name: user_id, n, people: 6 });
const rows = [R('appointments', 1, 'a', 14), R('appointments', 2, 'b', 11), R('appointments', 3, 'me', 9), R('recruits', 1, 'c', 3), R('recruits', 2, 'd', 3), R('recruits', 3, 'e', 1), R('recruits', 5, 'me', 1)];
const g = groupBoard(rows, ['appointments', 'recruits'], 'me');
ok(g.appointments.top.length === 3 && g.appointments.me.place === 3 && g.recruits.me.place === 5 && g.recruits.top.length === 3 && g.recruits.people === 6, 'the board, grouped, with your row');
ok(standingLine(g.appointments, 'appointments') === "You're 3rd. 3 more to take 2nd.", '3rd: what it takes to pass 2nd');
ok(standingLine(g.recruits, 'recruits') === "You're 5th with 1. 1 more for the top 3.", '5th: what it takes to reach the top 3');
const lead = groupBoard([R('appointments', 1, 'me', 14), R('appointments', 2, 'b', 11)], ['appointments'], 'me').appointments;
ok(standingLine(lead, 'appointments') === "You're in 1st, ahead by 3.", '1st, ahead');
const tie = groupBoard([R('recruits', 1, 'me', 3), R('recruits', 2, 'd', 3)], ['recruits'], 'me').recruits;
ok(standingLine(tie, 'recruits') === "You're in 1st. Tied, but you got there first.", '1st on a tie');
ok(standingLine(groupBoard([R('recruits', 1, 'me', 2)], ['recruits'], 'me').recruits, 'recruits') === "You're in 1st with 2.", 'alone in 1st');
const out = groupBoard(rows, ['appointments'], 'zed').appointments;
ok(standingLine(out, 'appointments') === 'Set 10 to reach the top 3.', 'not on it, top 3 full');
ok(standingLine(groupBoard([], ['recruits'], 'zed').recruits, 'recruits') === 'Your first recruit puts you in the top 3.', 'nobody yet');
ok(standingLine(g.appointments, 'appointments', 'winners') === 'You finished 3rd with 9.' && standingLine(lead, 'appointments', 'winners') === 'You won with 14 appointments!'
  && standingLine(out, 'appointments', 'winners') === '', 'winners: how you finished');

console.log(failures ? `${failures} FAILED` : 'ALL CHALLENGE UNIT TESTS PASSED');
process.exit(failures ? 1 : 0);
