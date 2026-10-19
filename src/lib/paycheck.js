// Paycheck tracker: an estimate of this month's commission from the
// advisor's own sales (target premium × their commission level), against
// the monthly income goal from their Business Plan.
import { computeAnnualGrossIncomeNeeded, computeExpensesSubtotal, computeMonthlyGrossIncomeNeeded } from '../businessPlan.js';
import { HIERARCHY_TIERS, nextTierAfter } from '../hierarchy.js';

const tierOf = key => HIERARCHY_TIERS.find(t => t.key === key) || null;
const premiumOf = a => Math.max(0, Number(a.targetPremium) || 0);
const issued = (a, today) => !!a.effectiveDate && a.effectiveDate <= today && a.requirementsCompleted === true;

// The monthly income goal from the Business Plan (their own number if they
// typed one, otherwise what their expenses work out to), or null.
export function monthlyIncomeGoal(plan) {
  if (!plan) return null;
  const typed = plan.incomeGoalOverride !== '' && plan.incomeGoalOverride != null ? Number(plan.incomeGoalOverride) : NaN;
  const annual = typed > 0 ? typed : computeAnnualGrossIncomeNeeded(computeMonthlyGrossIncomeNeeded(computeExpensesSubtotal(plan)));
  return annual > 0 ? annual / 12 : null;
}

function prevMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// appointments: the advisor's own (userId is them); tierKey: their level;
// plan: Business Plan fields or null; today: 'YYYY-MM-DD'.
export function computePaycheck({ appointments, tierKey, plan, today }) {
  const month = today.slice(0, 7);
  const tier = tierOf(tierKey || 'UA') || tierOf('UA');
  const rate = tier.commission || 0;
  const next = nextTierAfter(tier.key);
  const sold = appointments.filter(a => a.officiallySold && a.appointmentDate);
  const thisMonth = sold.filter(a => a.appointmentDate.slice(0, 7) === month);
  const lastMonthList = sold.filter(a => a.appointmentDate.slice(0, 7) === prevMonth(month));
  const premium = thisMonth.reduce((t, a) => t + premiumOf(a), 0);
  const issuedPremium = thisMonth.filter(a => issued(a, today)).reduce((t, a) => t + premiumOf(a), 0);
  const lastPremium = lastMonthList.reduce((t, a) => t + premiumOf(a), 0);
  const goal = monthlyIncomeGoal(plan);
  const est = premium * rate / 100;
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  return {
    tier, rate, next,
    sales: thisMonth.length,
    missingPremium: thisMonth.filter(a => !(premiumOf(a) > 0)).length,
    premium, est,
    issuedEst: issuedPremium * rate / 100,
    lastEst: lastPremium * rate / 100,
    nextEst: next ? premium * next.commission / 100 : null,
    goal, goalPct: goal ? Math.min(100, Math.round((est / goal) * 100)) : null,
    daysLeft: daysInMonth - Number(today.slice(8, 10)),
  };
}
