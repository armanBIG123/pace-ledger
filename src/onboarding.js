// ---------------------------------------------------------------------
// First 30 days: a guided checklist for new advisors. Every step is
// detected from data the person already enters elsewhere (nothing to tick
// by hand), and a short summary is saved so their manager can see it.
// ---------------------------------------------------------------------
import { supabase } from './supabaseClient.js';

export const ONBOARDING_DAYS = 30;
// After day 30 an unfinished checklist stays up until this day, then
// steps aside (it can always be turned back on in Your account).
const ONBOARDING_GRACE_DAYS = 60;

export const ONBOARDING_WEEKS = [
  { key: 'w1', label: 'Week 1', title: 'Get set up', days: [1, 7] },
  { key: 'w2', label: 'Week 2', title: 'Get in front of people', days: [8, 14] },
  { key: 'w3', label: 'Weeks 3–4', title: 'First results', days: [15, 30] },
];

// `go` is [tab, intent] for the app's navigation.
export const ONBOARDING_STEPS = [
  {
    key: 'plan', week: 'w1', title: 'Fill in your Business Plan',
    why: 'Your monthly expenses turn into an income goal, and that tells you how many people to talk to each day. Your daily targets on Today come from here.',
    cta: 'Open Business Plan', go: ['bizplan'],
  },
  {
    key: 'names', week: 'w1', title: 'Write down 25 names', target: 25,
    why: 'Everyone you know could become a client or a teammate. Work down the Memory Jogger and add whoever comes to mind; don\'t judge yet.',
    cta: 'Open Memory Jogger', go: ['systems', 'jogger'],
  },
  {
    key: 'score', week: 'w1', title: 'Score 10 people on the 9 characteristics', target: 10,
    why: 'Scoring shows who is most likely to buy or to join, so you call the best people first.',
    cta: 'Score prospects', go: ['systems'],
  },
  {
    key: 'calendar', week: 'w1', title: 'Connect Google Calendar',
    why: 'Appointments you log go straight onto your calendar, and invitations go out to your clients for you.',
    cta: 'Connect calendar', go: ['calendar'],
  },
  {
    key: 'book', week: 'w2', title: 'Book your first 3 appointments', target: 3,
    why: 'Pick your top-scored people and set times with them. Your trainer or manager can present with you.',
    cta: 'Log an appointment', go: ['mine', 'new'],
  },
  {
    key: 'outcome', week: 'w2', title: 'Log how your first appointment went',
    why: 'Logging the outcome right after each meeting keeps your follow-ups from slipping and shows your manager where to help.',
    cta: 'Go to Follow Up', go: ['followup', 'nolog'],
  },
  {
    key: 'win', week: 'w3', title: 'Get your first sale or recruit',
    why: 'Keep booking from your list. Most first wins come from the people closest to you.',
    cta: 'See your prospects', go: ['systems'],
  },
  {
    key: 'license', week: 'w3', title: 'Add your licensing details',
    why: 'Once you pass your exam, add your NPN and writing number. Being licensed is the first requirement for promotion.',
    cta: 'Open Licensing', go: ['milestones', 'licensing'],
  },
];

// Day 1 is the day the account was created.
export function onboardingDay(createdAt, now = new Date()) {
  if (!createdAt) return null;
  const start = new Date(createdAt);
  const a = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(1, Math.floor((b - a) / 86400000) + 1);
}

export function weekForDay(day) {
  return ONBOARDING_WEEKS.find(w => day >= w.days[0] && day <= w.days[1]) || ONBOARDING_WEEKS[ONBOARDING_WEEKS.length - 1];
}

// facts: { native, remindersOn, hasPlan, prospectCount, scoredCount,
//          calendarConnected, bookedCount, outcomeLogged, hasWin, licensed }
export function computeOnboarding(facts) {
  const counts = { names: facts.prospectCount, score: facts.scoredCount, book: facts.bookedCount };
  const flags = {
    plan: facts.hasPlan, reminders: facts.remindersOn, calendar: facts.calendarConnected,
    outcome: facts.outcomeLogged, win: facts.hasWin, license: facts.licensed,
  };
  const steps = ONBOARDING_STEPS.filter(s => !s.nativeOnly || facts.native).map(s => {
    const n = s.target ? Math.min(s.target, counts[s.key] || 0) : null;
    const done = s.target ? n >= s.target : !!flags[s.key];
    return { ...s, done, n };
  });
  const doneCount = steps.filter(s => s.done).length;
  const next = steps.find(s => !s.done) || null;
  return { steps, doneCount, total: steps.length, next, allDone: !next };
}

export function shouldShowOnboarding(day, visibility, allDone) {
  if (visibility === 'hidden') return false;
  if (visibility === 'shown') return true;
  if (day == null) return false;
  return day <= ONBOARDING_DAYS || (day <= ONBOARDING_GRACE_DAYS && !allDone);
}

export async function fetchMyOnboarding(userId) {
  const { data, error } = await supabase.from('onboarding_progress').select('*').eq('user_id', userId).maybeSingle();
  if (error) return { error: true };
  return data || null;
}

// Saves the summary the manager sees. Skips the write when nothing changed
// and it was saved in the last few hours, so opening Today stays cheap.
export async function saveOnboardingSnapshot(userId, existing, full) {
  // iPhone-only steps are left out, so the manager's numbers stay the same
  // whether the person last opened the app or the website.
  const shared = full.steps.filter(s => !s.nativeOnly);
  const sharedNext = shared.find(s => !s.done) || null;
  const result = { steps: shared, doneCount: shared.filter(s => s.done).length, total: shared.length, next: sharedNext, allDone: !sharedNext };
  const steps = {};
  result.steps.forEach(s => { steps[s.key] = s.done; });
  const prev = (existing && existing.steps) || {};
  // Compared key by key: the database doesn't keep the keys in our order.
  const unchanged = existing
    && Object.keys(prev).length === Object.keys(steps).length
    && Object.keys(steps).every(k => prev[k] === steps[k])
    && existing.done_count === result.doneCount
    && existing.total_count === result.total;
  const recent = existing && existing.last_seen_at && Date.now() - new Date(existing.last_seen_at).getTime() < 4 * 3600 * 1000;
  if (unchanged && recent) return existing;
  const now = new Date().toISOString();
  const row = {
    user_id: userId,
    steps,
    done_count: result.doneCount,
    total_count: result.total,
    next_step: result.next ? result.next.key : null,
    completed_at: result.allDone ? (existing && existing.completed_at) || now : null,
    last_seen_at: now,
    updated_at: unchanged && existing ? existing.updated_at : now,
  };
  const { data, error } = await supabase.from('onboarding_progress').upsert(row, { onConflict: 'user_id' }).select().single();
  return error ? existing : data;
}

export async function setOnboardingVisibility(userId, visibility) {
  const { error } = await supabase.from('onboarding_progress').upsert({ user_id: userId, visibility }, { onConflict: 'user_id' });
  if (!error) window.dispatchEvent(new Event('paceledger:onboarding-changed'));
  return !error;
}

// null when it couldn't be read (e.g. the table isn't set up yet).
export async function fetchTeamOnboarding(userIds) {
  if (!userIds.length) return [];
  const { data, error } = await supabase.from('onboarding_progress').select('*').in('user_id', userIds);
  return error ? null : data || [];
}

export function onboardingStepTitle(key) {
  const s = ONBOARDING_STEPS.find(x => x.key === key);
  return s ? s.title : '';
}
export function onboardingStepWeek(key) {
  const s = ONBOARDING_STEPS.find(x => x.key === key);
  return s ? ONBOARDING_WEEKS.find(w => w.key === s.week) : null;
}
