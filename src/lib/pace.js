// Weekly appointment-pace targets (the batches and 33-a-week goal) and pace/streak calculations.
import { addDays, fmtDate, parseDate, shiftWeekStr, todayStr, weekStartOf } from './dates.js';

export const WEEKEND_TARGET = 8;

export const WEEKDAY_TARGET = 5;

export const WEEKLY_TOTAL_TARGET = WEEKEND_TARGET + WEEKDAY_TARGET * 5; // 33

// What counts toward someone's pace: appointments they set, plus ones
// someone else set with them as the presenter (a leader running a call for
// their team gets credit too, and so does the person who set it). The
// appointment counts in the week and batch it was set in. Follow-ups never
// count.
export const isPresentingFor = (a, personId) => !!personId && a.presenterId === personId && a.userId !== personId;
export const countsTowardPace = (a, personId) => !a.isFollowUp && (a.userId === personId || isPresentingFor(a, personId));

// Date-set options: which day the advisor set the appointment on.
// Saturday/Sunday -> that week's weekend batch (target 8)
// Monday-Friday -> that week's weekday additions (target 5)
export const DATE_SET_OPTIONS = [
  { value: 'weekend', label: 'Saturday/Sunday', batchLabel: 'Weekend Batch', shortLabel: 'Wknd', category: 'weekend', target: WEEKEND_TARGET },
  { value: 'monday', label: 'Monday', batchLabel: 'Monday Batch', shortLabel: 'Mon', category: 'weekday', target: WEEKDAY_TARGET },
  { value: 'tuesday', label: 'Tuesday', batchLabel: 'Tuesday Batch', shortLabel: 'Tue', category: 'weekday', target: WEEKDAY_TARGET },
  { value: 'wednesday', label: 'Wednesday', batchLabel: 'Wednesday Batch', shortLabel: 'Wed', category: 'weekday', target: WEEKDAY_TARGET },
  { value: 'thursday', label: 'Thursday', batchLabel: 'Thursday Batch', shortLabel: 'Thu', category: 'weekday', target: WEEKDAY_TARGET },
  { value: 'friday', label: 'Friday', batchLabel: 'Friday Batch', shortLabel: 'Fri', category: 'weekday', target: WEEKDAY_TARGET },
];

export function dateSetMeta(value) {
  return DATE_SET_OPTIONS.find(o => o.value === value) || DATE_SET_OPTIONS[0];
}

export function defaultDateSetOption() {
  const map = { 0: 'weekend', 6: 'weekend', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday' };
  return map[new Date().getDay()];
}

export function getStatus(counts, weekMonday) {
  const allMet = DATE_SET_OPTIONS.every((opt, i) => (counts[i] || 0) >= opt.target);
  if (allMet) return 'met';
  const weekSunday = fmtDate(addDays(parseDate(weekMonday), 6));
  if (weekSunday < todayStr()) return 'missed';
  return 'progress';
}

// Best week ever, current streak, and longest-ever streak of weeks
// hitting the 33/week target — computed from whatever's already loaded,
// no extra fetch. Walks real calendar weeks via shiftWeekStr rather than
// just array positions, so a gap in the data correctly breaks a streak.
export function computeStreaksAndBests(appointments) {
  const weekTotals = {};
  appointments.filter(a => !a.isFollowUp).forEach(a => {
    weekTotals[a.weekOf] = (weekTotals[a.weekOf] || 0) + 1;
  });
  const currentActualWeek = weekStartOf(todayStr());

  let bestWeekCount = 0;
  Object.values(weekTotals).forEach(c => { if (c > bestWeekCount) bestWeekCount = c; });

  // Current streak: walk backward from the most recently completed week.
  let currentStreak = 0;
  let cursor = shiftWeekStr(currentActualWeek, -1);
  while ((weekTotals[cursor] || 0) >= WEEKLY_TOTAL_TARGET) {
    currentStreak++;
    cursor = shiftWeekStr(cursor, -1);
  }

  // Longest streak ever: walk forward across real weeks from the earliest
  // one with any data, through the last completed week.
  let longestStreak = 0;
  const allWeeks = Object.keys(weekTotals).sort();
  if (allWeeks.length > 0) {
    let runLength = 0;
    let w = allWeeks[0];
    const lastCompletedWeek = shiftWeekStr(currentActualWeek, -1);
    while (w <= lastCompletedWeek) {
      if ((weekTotals[w] || 0) >= WEEKLY_TOTAL_TARGET) {
        runLength++;
        longestStreak = Math.max(longestStreak, runLength);
      } else {
        runLength = 0;
      }
      w = shiftWeekStr(w, 1);
    }
  }

  return { bestWeekCount, currentStreak, longestStreak };
}
