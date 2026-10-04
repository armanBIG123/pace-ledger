import { supabase } from './supabaseClient.js';

// ---------------------------------------------------------------------
// Business Plan — a personal living-expenses worksheet, and the
// transactions/prospecting-goal calculator built on top of it. One row
// per user, kept private to them (RLS restricts read/write to
// auth.uid() = user_id — see migration-business-plan.sql) since this is
// personal financial information, not something a manager or admin
// needs visibility into.
// ---------------------------------------------------------------------
export const DEFAULT_BUSINESS_PLAN_FIELDS = {
  mortgageRent: '', household: '', food: '', car: '', entertainment: '',
  childCare: '', education: '', investmentsSavings: '', otherExpenses: '',
  targetPremium: '3600', commissionRate: '50', incomeGoalOverride: '',
  marketingGoals: '', marketingStrategies: '', marketingTactics: '',
};

export function rowToBusinessPlanFields(row) {
  const s = v => (v === null || v === undefined ? '' : String(v));
  return {
    mortgageRent: s(row.mortgage_rent), household: s(row.household), food: s(row.food), car: s(row.car),
    entertainment: s(row.entertainment), childCare: s(row.child_care), education: s(row.education),
    investmentsSavings: s(row.investments_savings), otherExpenses: s(row.other_expenses),
    targetPremium: row.target_premium != null ? String(row.target_premium) : '3600',
    commissionRate: row.commission_rate != null ? String(row.commission_rate) : '50',
    incomeGoalOverride: s(row.income_goal_override),
    marketingGoals: s(row.marketing_goals), marketingStrategies: s(row.marketing_strategies),
    marketingTactics: s(row.marketing_tactics),
  };
}
function businessPlanFieldsToRow(f) {
  const num = v => (v === '' || v === null || v === undefined ? null : Number(v));
  const txt = v => (v === '' || v === null || v === undefined ? null : String(v));
  return {
    mortgage_rent: num(f.mortgageRent), household: num(f.household), food: num(f.food), car: num(f.car),
    entertainment: num(f.entertainment), child_care: num(f.childCare), education: num(f.education),
    investments_savings: num(f.investmentsSavings), other_expenses: num(f.otherExpenses),
    target_premium: num(f.targetPremium) ?? 3600, commission_rate: num(f.commissionRate) ?? 50,
    income_goal_override: num(f.incomeGoalOverride),
    marketing_goals: txt(f.marketingGoals), marketing_strategies: txt(f.marketingStrategies),
    marketing_tactics: txt(f.marketingTactics),
  };
}

export async function fetchBusinessPlan(userId) {
  const { data, error } = await supabase.from('business_plans').select('*').eq('user_id', userId).maybeSingle();
  // null = no plan saved yet; { loadError: true } = the request failed, so
  // callers can tell "empty" apart from "couldn't load" (and not autosave
  // blanks over a real plan).
  if (error) { console.error(error); return { loadError: true }; }
  return data;
}
// Upserts the whole row in one call — the form saves everything
// together (both tabs share one underlying row) rather than tracking
// per-field dirty state.
export async function saveBusinessPlan(userId, fields) {
  const { data, error } = await supabase
    .from('business_plans')
    .upsert({ user_id: userId, ...businessPlanFieldsToRow(fields) }, { onConflict: 'user_id' })
    .select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, record: data };
}

// ---------------------------------------------------------------------
// Pure calculations — no Supabase involved, kept alongside the fields
// they operate on so the worksheet's math lives in exactly one place.
// ---------------------------------------------------------------------
const EXPENSE_KEYS = ['mortgageRent', 'household', 'food', 'car', 'entertainment', 'childCare', 'education', 'investmentsSavings', 'otherExpenses'];

export function computeExpensesSubtotal(fields) {
  return EXPENSE_KEYS.reduce((sum, k) => sum + (Number(fields[k]) || 0), 0);
}
export function computeMonthlyGrossIncomeNeeded(subtotal) { return subtotal / 0.7; }
export function computeAnnualGrossIncomeNeeded(monthlyGrossIncomeNeeded) { return monthlyGrossIncomeNeeded * 12; }
export function computeCommissionPerTransaction(targetPremium, commissionRatePercent) {
  return (Number(targetPremium) || 0) * ((Number(commissionRatePercent) || 0) / 100);
}
export function computeTransactionsNeededPerYear(incomeGoal, commissionPerTransaction) {
  return commissionPerTransaction > 0 ? (Number(incomeGoal) || 0) / commissionPerTransaction : 0;
}
export function computeProspectsNeededPerYear(transactionsNeededPerYear) { return transactionsNeededPerYear * 5; }
export function computeMonthlyProspects(prospectsNeededPerYear) { return prospectsNeededPerYear / 12; }
export function computeDailyProspects(monthlyProspects) { return monthlyProspects / 30; }
