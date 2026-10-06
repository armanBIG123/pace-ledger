import { publicBaseUrl } from './native.js';
import { supabase } from './supabaseClient.js';

// ---------------------------------------------------------------------
// Client Intake — a candidate is created when an advisor answers "Client
// intake?" with Yes on a follow-up. Each candidate gets a random,
// unguessable token; the advisor shares a link built from that token
// with their client, who fills in their own financial information with
// no PaceLedger login of their own. The public side of this (fetching
// and saving by token) goes through two security-definer database
// functions rather than direct table access, so an anonymous visitor
// can only ever read or write the one row their token points to.
// ---------------------------------------------------------------------

function generateToken() {
  // Two UUIDs concatenated (no dashes) — a 64-character random hex
  // string, unguessable and consistent with the token length on the
  // original tool this is modeled after.
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
}

export function buildIntakeLink(token) {
  // Always the public site, even when opened from the iPhone app.
  return `${publicBaseUrl()}?intake=${token}`;
}

// -- advisor-side (authenticated, RLS-scoped) --------------------------

export async function createClientIntakeCandidate({ advisorId, advisorName, appointmentId, clientName }) {
  const token = generateToken();
  const { data, error } = await supabase.from('client_intake_candidates').insert({
    advisor_id: advisorId, advisor_name: advisorName || null,
    source_appointment_id: appointmentId || null, client_name: clientName,
    token, status: 'pending',
  }).select().single();
  if (error) { console.error(error); return { ok: false, error: error.message }; }
  return { ok: true, record: data };
}
export async function fetchClientIntakeCandidates() {
  const { data, error } = await supabase
    .from('client_intake_candidates').select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return data;
}
export async function deleteClientIntakeCandidate(id) {
  const { error } = await supabase.from('client_intake_candidates').delete().eq('id', id);
  return !error;
}

// -- public side (no login — a security-definer RPC call per action,
// scoped entirely by the secret token, never a direct table read/write) -

export async function fetchClientIntakeByToken(token) {
  const { data, error } = await supabase.rpc('get_client_intake_by_token', { p_token: token });
  if (error) { console.error(error); return { found: false }; }
  return data;
}
export async function saveClientIntakeProgress(token, responses) {
  const { data, error } = await supabase.rpc('submit_client_intake_response', {
    p_token: token, p_responses: responses, p_final: false,
  });
  return !error && data;
}
export async function submitClientIntakeFinal(token, responses) {
  const { data, error } = await supabase.rpc('submit_client_intake_response', {
    p_token: token, p_responses: responses, p_final: true,
  });
  return !error && data;
}

// ---------------------------------------------------------------------
// Field options + quick-start templates
// ---------------------------------------------------------------------
export const US_STATE_OPTIONS = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM',
  'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
  'WV', 'WI', 'WY',
];
export const MARITAL_STATUS_OPTIONS = ['Single', 'Married', 'Divorced', 'Widowed', 'Domestic Partnership'];
export const TAX_FILING_OPTIONS = ['Single', 'Married Filing Jointly', 'Married Filing Separately', 'Head of Household', 'Qualifying Widow(er)'];
export const INCOME_TYPE_OPTIONS = ['Salary / Wages', 'Social Security', 'Pension', 'Rental Income', 'Self-Employment', 'Other'];
export const PAID_FREQUENCY_OPTIONS = ['Per Year', 'Per Month', 'Per Week', 'Per Hour'];
export const INCOME_QUICKSTART = [
  { label: 'Salary', type: 'Salary / Wages' },
  { label: 'Social Security', type: 'Social Security' },
  { label: 'Pension', type: 'Pension' },
  { label: 'Rental Income', type: 'Rental Income' },
];
export const ACCOUNT_TYPE_OPTIONS = ['401(k)', '403(b)', 'Traditional IRA', 'Roth IRA', 'Brokerage', 'Savings / CD', 'HSA', 'Other'];
export const INVESTED_IN_OPTIONS = ['Mutual Fund', 'Stocks', 'Bonds', 'ETF', 'Cash', 'Target Date Fund', 'Mixed', 'Other'];
export const RISK_CATEGORY_OPTIONS = ['Invested / At Risk', 'Conservative', 'Cash / Guaranteed'];
export const INVESTMENT_QUICKSTART = ['401(k)', 'Traditional IRA', 'Roth IRA', 'Brokerage', 'Savings / CD', 'HSA'];
export const LIFE_POLICY_TYPE_OPTIONS = ['Term Life', 'Whole Life', 'Universal Life', 'Other'];
export const ANNUITY_TYPE_OPTIONS = ['Fixed', 'Variable', 'Indexed', 'Immediate'];
export const EXPENSE_CATEGORY_OPTIONS = [
  'Housing', 'Utilities', 'Groceries', 'Transportation', 'Insurance', 'Dining', 'Subscriptions',
  'Phone / Internet', 'Childcare / Education', 'Gifts / Charity', 'Pets', 'Personal Care', 'Debt Payment', 'Other',
];
export const EXPENSE_QUICKSTART = [
  { label: 'Mortgage / Rent', category: 'Housing' },
  { label: 'Utilities', category: 'Utilities' },
  { label: 'Groceries', category: 'Groceries' },
  { label: 'Car Payment', category: 'Transportation' },
  { label: 'Health Insurance', category: 'Insurance' },
  { label: 'Home / Auto Insurance', category: 'Insurance' },
  { label: 'Dining Out', category: 'Dining' },
  { label: 'Gas / Fuel', category: 'Transportation' },
  { label: 'Subscriptions', category: 'Subscriptions' },
  { label: 'Phone / Internet', category: 'Phone / Internet' },
  { label: 'Childcare / Education', category: 'Childcare / Education' },
  { label: 'Gifts / Charity', category: 'Gifts / Charity' },
  { label: 'Pet Expenses', category: 'Pets' },
  { label: 'Personal Care', category: 'Personal Care' },
  { label: 'Debt Payment', category: 'Debt Payment' },
];
export const HOUSING_PLAN_OPTIONS = ['Stay in current home', 'Downsize', 'Relocate', 'Move closer to family', 'Not sure yet'];
export const RISK_TOLERANCE_OPTIONS = [
  { value: 'conservative', label: 'Conservative', desc: 'Preserve what I have — minimize losses' },
  { value: 'moderate', label: 'Moderate', desc: 'Balance growth with stability' },
  { value: 'aggressive', label: 'Aggressive', desc: 'Maximize growth — I can handle volatility' },
];
export const SS_CLAIM_AGE_OPTIONS = [
  { value: '62', label: 'Age 62', desc: 'Earliest possible — reduced benefit (~70%)' },
  { value: '64', label: 'Age 64', desc: 'Early — somewhat reduced benefit (~80%)' },
  { value: '67', label: 'Age 67', desc: 'Full retirement age — 100% benefit' },
  { value: '70', label: 'Age 70', desc: 'Maximum — 124% of full benefit' },
  { value: 'unsure', label: 'Not sure yet', desc: 'Your advisor can help optimize this' },
];
export const DESIRED_LIFESTYLE_OPTIONS = [
  { value: 'modest', label: 'Modest', desc: 'Cover essentials comfortably with some extras' },
  { value: 'comfortable', label: 'Comfortable', desc: 'Maintain current lifestyle with regular travel and hobbies' },
  { value: 'luxury', label: 'Luxury', desc: 'Upscale living, frequent travel and premium experiences' },
];
export const CONCERN_OPTIONS = [
  { value: 'long_term_care', label: 'Long-Term Care', desc: 'Worried about needing nursing home, assisted living, or in-home care' },
  { value: 'unexpected_cash', label: 'Unexpected Cash Needs', desc: 'Major home repairs, family emergencies, or surprise medical bills' },
  { value: 'market_crash', label: 'Market Crash', desc: 'Concerned a market downturn early in retirement could deplete savings' },
  { value: 'inflation', label: 'Rising Costs / Inflation', desc: 'Worried that inflation will erode purchasing power over time' },
  { value: 'outliving_savings', label: 'Outliving Savings', desc: 'Concerned about running out of money before end of life' },
  { value: 'healthcare_costs', label: 'Healthcare Costs', desc: 'Worried about medical expenses, especially before Medicare at 65' },
  { value: 'loss_of_spouse_income', label: 'Loss of Spouse Income', desc: 'Concerned about financial impact if a spouse passes away' },
];

export const EMPTY_INTAKE_RESPONSES = {
  personal: { dob: '', state: '', maritalStatus: '', taxFilingStatus: '', targetRetirementAge: '65', planThroughAge: '90', checking: '', savings: '', emergencyFundTarget: '' },
  income: [],
  investments: [],
  insurance: { lifePolicies: [], annuities: [] },
  expenses: [],
  goals: {
    riskTolerance: '', ssClaimAge: '', healthcareMonthlyCost: '', medicareSupplementCost: '',
    desiredLifestyle: '', desiredMonthlyIncome: '', annualTravelBudget: '', housingPlan: '',
    legacyGoals: '', charitableGivingGoal: '', majorPurchases: '', partTimeWork: false,
    concerns: [], anythingElse: '',
  },
};

// ---------------------------------------------------------------------
// Calculations
// ---------------------------------------------------------------------
export function computeAge(dob) {
  if (!dob) return null;
  const birth = new Date(`${dob}T00:00:00`);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear = (today.getMonth() > birth.getMonth()) || (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}
export function computeYearsToRetirement(dob, targetRetirementAge) {
  const age = computeAge(dob);
  if (age == null || !targetRetirementAge) return null;
  return Number(targetRetirementAge) - age;
}
export function computeRetirementYearsNeeded(targetRetirementAge, planThroughAge) {
  if (!targetRetirementAge || !planThroughAge) return null;
  return Number(planThroughAge) - Number(targetRetirementAge);
}
export function computeTotalCash(checking, savings) {
  return (Number(checking) || 0) + (Number(savings) || 0);
}
function toAnnual(amount, frequency) {
  const n = Number(amount) || 0;
  switch (frequency) {
    case 'Per Month': return n * 12;
    case 'Per Week': return n * 52;
    case 'Per Hour': return n * 2080; // full-time equivalent (40hr/wk x 52wk)
    default: return n; // Per Year
  }
}
export function computeTotalAnnualIncome(incomeEntries) {
  return (incomeEntries || []).reduce((sum, e) => sum + toAnnual(e.amount, e.paidFrequency), 0);
}
export function computeTotalMonthlyExpenses(expenseEntries) {
  return (expenseEntries || []).reduce((sum, e) => sum + (Number(e.monthlyAmount) || 0), 0);
}
