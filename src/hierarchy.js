// ---------------------------------------------------------------------
// hierarchy & promotion engine
// ---------------------------------------------------------------------
// Tier definitions, downline/upline traversal, and the live
// "progress toward next tier" computation used across Milestones,
// Team Pace, and Manage Team's CSV export.
//
// Everything here is a pure function: given hierarchy/appointment data
// that's already been fetched elsewhere, none of this touches Supabase
// itself, and nothing here is stored — it's recomputed from live data
// every time it's called, so it can never go stale the way a cached
// progress value could.
// ---------------------------------------------------------------------

// Career-ladder reference data for Milestones > Promotion Guidelines.
// Lowest to highest tier. FA/SA/AD are tracked on a rolling 30 days;
// everything above that is tracked over 2 consecutive months.
export const HIERARCHY_TIERS = [
  {
    key: 'UA', name: 'Unlicensed Associate', commission: 0, window: null,
    criteria: [], requirements: [],
  },
  {
    key: 'FA', name: 'Field Associate', commission: 40, window: 'rolling30',
    criteria: ['Get licensed', '3 observation sales', '1 direct recruit'],
    requirements: [
      { type: 'licensed' },
      { type: 'observationSales', count: 3 },
      { type: 'directRecruits', count: 1 },
    ],
  },
  {
    key: 'SA', name: 'Senior Associate', commission: 50, window: 'rolling30',
    criteria: ['Build 1 direct Senior Associate', '$10k personal target premium', '$20k target premium base shop'],
    requirements: [
      { type: 'directTierCount', tier: 'SA', count: 1 },
      { type: 'personalPremium', amount: 10000 },
      { type: 'baseShopPremium', amount: 20000 },
    ],
  },
  {
    key: 'AD', name: 'Associate Director', commission: 60, window: 'rolling30',
    criteria: ['Build 3 direct Senior Associates', 'Another $10k personal target premium', '$35k target premium base shop'],
    requirements: [
      { type: 'directTierCount', tier: 'SA', count: 3 },
      { type: 'personalPremium', amount: 10000 },
      { type: 'baseShopPremium', amount: 35000 },
    ],
  },
  {
    key: 'FD', name: 'Field Director', commission: 75, window: 'consecutive2',
    criteria: ['Build 6 direct Senior Associates', '$50k target premium base shop'],
    requirements: [
      { type: 'directTierCount', tier: 'SA', count: 6 },
      { type: 'baseShopPremium', amount: 50000 },
    ],
  },
  {
    key: 'SFD', name: 'Senior Field Director', commission: 80, window: 'consecutive2',
    criteria: ['Build 3 direct Field Directors', '$200k target premium base shop'],
    requirements: [
      { type: 'directTierCount', tier: 'FD', count: 3 },
      { type: 'baseShopPremium', amount: 200000 },
    ],
  },
  {
    key: 'DFD', name: 'Direct Field Director', commission: 83, window: 'consecutive2',
    criteria: ['Build 4 direct Field Directors', '$250k target premium base shop'],
    requirements: [
      { type: 'directTierCount', tier: 'FD', count: 4 },
      { type: 'baseShopPremium', amount: 250000 },
    ],
  },
  {
    key: 'EFD', name: 'Executive Field Director', commission: 86, window: 'consecutive2',
    criteria: ['Build 5 direct Field Directors', '$300k target premium base shop'],
    requirements: [
      { type: 'directTierCount', tier: 'FD', count: 5 },
      { type: 'baseShopPremium', amount: 300000 },
    ],
  },
  {
    key: 'FVC', name: 'Field Vice Chairman', commission: 89, window: 'consecutive2',
    criteria: ['Build 6 direct Field Directors', '$500k target premium base shop'],
    requirements: [
      { type: 'directTierCount', tier: 'FD', count: 6 },
      { type: 'baseShopPremium', amount: 500000 },
    ],
  },
  {
    key: 'EVC', name: 'Executive Vice Chairman', commission: 90, window: 'consecutive2',
    criteria: ['Build 7 direct Field Directors', '$750k target premium base shop'],
    requirements: [
      { type: 'directTierCount', tier: 'FD', count: 7 },
      { type: 'baseShopPremium', amount: 750000 },
    ],
  },
];
export const HIERARCHY_TIER_WINDOW_LABELS = { rolling30: 'Tracked on a rolling 30 days', consecutive2: 'Must hit requirements for 2 consecutive months' };
export function hierarchyTierLabel(key) {
  const tier = HIERARCHY_TIERS.find(t => t.key === key);
  return tier ? `${tier.name} (${tier.key})` : '';
}

export function tierIndex(tierKey) { return HIERARCHY_TIERS.findIndex(t => t.key === tierKey); }
export function nextTierAfter(tierKey) {
  const idx = tierIndex(tierKey);
  if (idx === -1 || idx === HIERARCHY_TIERS.length - 1) return null;
  return HIERARCHY_TIERS[idx + 1];
}
// "At least" — someone who's since been promoted past a tier still
// counts toward "Build N direct X", they don't stop counting just
// because they moved on.
export function tierAtLeast(personTierKey, targetTierKey) {
  const pi = tierIndex(personTierKey), ti = tierIndex(targetTierKey);
  return pi !== -1 && ti !== -1 && pi >= ti;
}
export function inLastDays(dateStr, days) {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() >= Date.now() - days * 24 * 60 * 60 * 1000;
}
// Same rolling-days check, but the window can never reach back further
// than someone's most recent promotion — premium starts fresh at each
// promotion, even if the plain rolling window would otherwise extend
// into activity from their previous tier. Count-based requirements
// (direct recruits, direct tier counts) deliberately don't use this —
// those are cumulative and never reset.
export function inLastDaysSincePromotion(dateStr, days, tierChangedAt) {
  if (!dateStr) return false;
  const rollingStart = Date.now() - days * 24 * 60 * 60 * 1000;
  const effectiveStart = tierChangedAt ? Math.max(rollingStart, new Date(tierChangedAt).getTime()) : rollingStart;
  return new Date(dateStr).getTime() >= effectiveStart;
}
function sumPremiumWhere(appointments, datePredicate) {
  return appointments
    .filter(a => a.officiallySold && datePredicate(a.appointmentDate))
    .reduce((sum, a) => sum + (Number(a.targetPremium) || 0), 0);
}
// Real calendar months, not rolling 60-day windows — the current
// (in-progress) month plus the 2 before it, each independently checked
// against the target. A month that falls entirely before the person's
// most recent promotion is marked not "applicable" rather than shown as
// a misleading $0 — that month's activity belonged to their previous
// tier, not a failure to hit this one.
export function computeConsecutiveMonthsProgress(appointments, amountTarget, tierChangedAt) {
  const now = new Date();
  const months = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear(), month = d.getMonth();
    const monthEnd = new Date(year, month + 1, 1);
    const applicable = !tierChangedAt || new Date(tierChangedAt).getTime() < monthEnd.getTime();
    const sum = applicable ? sumPremiumWhere(appointments, dateStr => {
      const ad = new Date(dateStr);
      const inMonth = ad.getFullYear() === year && ad.getMonth() === month;
      const sincePromotion = !tierChangedAt || ad.getTime() >= new Date(tierChangedAt).getTime();
      return inMonth && sincePromotion;
    }) : 0;
    months.push({ year, month, label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }), sum, met: applicable && sum >= amountTarget, isCurrent: i === 0, applicable });
  }
  return months;
}
export function hasConsecutivePair(months) {
  for (let i = 0; i < months.length - 1; i++) {
    if (months[i].met && months[i + 1].met) return true;
  }
  return false;
}
export function isLicensed(profile) {
  return !!(profile?.npn?.trim() && profile?.fg_writing_number?.trim());
}
// Evaluates every requirement for someone's NEXT tier and returns a
// structured result the UI can render directly — nothing here is
// stored; it's recomputed from live data every time it's called.
export function computeTierProgress(person, allPeople, myAppointments, downlineAppointments, traineeAppointments) {
  const next = nextTierAfter(person.hierarchy_tier);
  if (!next) return null;
  const directReports = allPeople.filter(p => p.manager_id === person.id);
  const tierChangedAt = person.hierarchy_tier_changed_at;

  const results = next.requirements.map(req => {
    if (req.type === 'licensed') {
      const met = isLicensed(person);
      return { ...req, kind: 'status', met, label: 'Licensed' };
    }
    if (req.type === 'observationSales') {
      const count = traineeAppointments.filter(a => a.officiallySold && inLastDays(a.appointmentDate, 30)).length;
      return { ...req, kind: 'count', met: count >= req.count, current: count, target: req.count, label: `${req.count} observation sale${req.count === 1 ? '' : 's'}` };
    }
    if (req.type === 'directRecruits') {
      const count = directReports.length;
      return { ...req, kind: 'count', met: count >= req.count, current: count, target: req.count, label: `${req.count} direct recruit${req.count === 1 ? '' : 's'}` };
    }
    if (req.type === 'directTierCount') {
      const count = directReports.filter(p => tierAtLeast(p.hierarchy_tier, req.tier)).length;
      const tierName = HIERARCHY_TIERS.find(t => t.key === req.tier)?.name;
      return { ...req, kind: 'count', met: count >= req.count, current: count, target: req.count, label: `${req.count} direct ${tierName}${req.count === 1 ? '' : 's'}` };
    }
    if (req.type === 'personalPremium' || req.type === 'baseShopPremium') {
      // Base Shop includes the person's own premium on top of their
      // downline's — it's not downline-only.
      const source = req.type === 'personalPremium' ? myAppointments : [...myAppointments, ...downlineAppointments];
      const baseLabel = req.type === 'personalPremium' ? 'Personal target premium' : 'Target premium base shop';
      if (next.window === 'rolling30') {
        const sum = sumPremiumWhere(source, d => inLastDaysSincePromotion(d, 30, tierChangedAt));
        return { ...req, kind: 'money', met: sum >= req.amount, current: sum, target: req.amount, label: `${baseLabel} (last 30 days)` };
      }
      const months = computeConsecutiveMonthsProgress(source, req.amount, tierChangedAt);
      return { ...req, kind: 'money-consecutive', met: hasConsecutivePair(months), months, target: req.amount, label: baseLabel };
    }
    return { ...req, kind: 'status', met: false, label: 'Unknown requirement' };
  });

  return { nextTier: next, results, allMet: results.every(r => r.met) };
}

// Walks the manager_id chain to find everyone under a given person, at
// any depth — includes the root person themselves, since a new recruit's
// direct upline might be that top-level manager, not someone further
// down. Used at sign-up to scope the "who is your direct upline" picker
// to just the selected manager's own team.
export function computeDownline(rootId, allPeople) {
  const result = [];
  const queue = [rootId];
  const visited = new Set();
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    const person = allPeople.find(p => p.id === currentId);
    if (person) result.push(person);
    allPeople.filter(p => p.manager_id === currentId).forEach(r => queue.push(r.id));
  }
  return result;
}
// The reverse walk — from a person up through their manager, their
// manager's manager, and so on. Includes the person themselves first, so
// this alone gives the full "who could this person select as presenter"
// list: themselves, plus everyone above them in the reporting chain.
export function computeUpline(userId, allPeople) {
  const result = [];
  const visited = new Set();
  let current = allPeople.find(p => p.id === userId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    result.push(current);
    current = current.manager_id ? allPeople.find(p => p.id === current.manager_id) : null;
  }
  return result;
}
