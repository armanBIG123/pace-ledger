import React, { useState, useEffect } from 'react';
import { ShieldCheck, CheckCircle2, Copy, Trash2, ChevronDown, ChevronUp, ArrowRight, Plus, X } from 'lucide-react';
import { shareOrCopy, isNativeApp } from './native.js';
import { CSS } from './styles.js';
import {
  buildIntakeLink,
  fetchClientIntakeByToken, saveClientIntakeProgress, submitClientIntakeFinal,
  US_STATE_OPTIONS, MARITAL_STATUS_OPTIONS, TAX_FILING_OPTIONS, INCOME_TYPE_OPTIONS, PAID_FREQUENCY_OPTIONS, INCOME_QUICKSTART,
  ACCOUNT_TYPE_OPTIONS, INVESTED_IN_OPTIONS, RISK_CATEGORY_OPTIONS, INVESTMENT_QUICKSTART,
  LIFE_POLICY_TYPE_OPTIONS, ANNUITY_TYPE_OPTIONS, EXPENSE_CATEGORY_OPTIONS, EXPENSE_QUICKSTART,
  HOUSING_PLAN_OPTIONS, RISK_TOLERANCE_OPTIONS, SS_CLAIM_AGE_OPTIONS, DESIRED_LIFESTYLE_OPTIONS, CONCERN_OPTIONS,
  EMPTY_INTAKE_RESPONSES, computeAge, computeYearsToRetirement, computeRetirementYearsNeeded, computeTotalCash,
  computeTotalAnnualIncome, computeTotalMonthlyExpenses,
} from './clientIntake.js';

// This file is self-contained on purpose (its own small copies of a
// currency formatter and a page shell, rather than importing them from
// App.jsx) — the public form in here renders with no login and no
// relation to the rest of the app's component tree, so it can't safely
// depend on anything defined inside App.jsx.
function fmtMoney(n) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function hasAny(obj) {
  return Object.values(obj || {}).some(v => (Array.isArray(v) ? v.length > 0 : (v !== '' && v !== false && v != null)));
}
function field(label, value) {
  if (value === '' || value == null || value === false) return null;
  return <span key={label}><strong>{label}:</strong> {String(value)}</span>;
}

// ---------------------------------------------------------------------
// small shared field components — same visual language as the rest of
// PaceLedger (.tr-field / .tr-form-grid), reused across every step
// ---------------------------------------------------------------------
function TextField({ label, value, onChange, placeholder, type = 'text', hint }) {
  return (
    <label className="tr-field">
      <span>{label}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      {hint ? <span className="tr-empty">{hint}</span> : null}
    </label>
  );
}
function MoneyField({ label, value, onChange, hint }) {
  return (
    <label className="tr-field">
      <span>{label}</span>
      <input type="number" min="0" step="1" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} placeholder="0" />
      {hint ? <span className="tr-empty">{hint}</span> : null}
    </label>
  );
}
function SelectField({ label, value, onChange, options, placeholder = 'Select', hint }) {
  return (
    <label className="tr-field">
      <span>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      {hint ? <span className="tr-empty">{hint}</span> : null}
    </label>
  );
}
function CardSelect({ options, value, isSelected, onSelect }) {
  return options.map(o => (
    <button
      key={o.value} type="button"
      className={`tr-intake-card-select ${isSelected(o.value) ? 'tr-intake-card-select-active' : ''}`}
      onClick={() => onSelect(o.value)}>
      <strong>{o.label}</strong><span>{o.desc}</span>
    </button>
  ));
}

// ---------------------------------------------------------------------
// Step 1 — Personal & Family
// ---------------------------------------------------------------------
function IntakeStepPersonal({ data, setData }) {
  const age = computeAge(data.dob);
  const yearsToRetirement = computeYearsToRetirement(data.dob, data.targetRetirementAge);
  const yearsNeeded = computeRetirementYearsNeeded(data.targetRetirementAge, data.planThroughAge);
  const totalCash = computeTotalCash(data.checking, data.savings);
  function set(key, value) { setData(prev => ({ ...prev, [key]: value })); }
  return (
    <>
      <h3 className="tr-h3">Personal &amp; Family</h3>
      <p className="tr-empty" style={{ marginTop: -6 }}>Help your advisor understand your personal situation, retirement goals, and cash reserves.</p>
      <div className="tr-form-section" style={{ marginTop: 14 }}>
        <h4 className="tr-h4">About You</h4>
        <div className="tr-form-grid">
          <TextField label="Date of Birth" type="date" value={data.dob} onChange={v => set('dob', v)} hint={age != null ? `Currently ${age} years old` : ''} />
          <SelectField label="State of Residence" value={data.state} onChange={v => set('state', v)} options={US_STATE_OPTIONS} placeholder="Select state" />
          <SelectField label="Marital Status" value={data.maritalStatus} onChange={v => set('maritalStatus', v)} options={MARITAL_STATUS_OPTIONS} />
          <SelectField label="Tax Filing Status" value={data.taxFilingStatus} onChange={v => set('taxFilingStatus', v)} options={TAX_FILING_OPTIONS} />
        </div>
      </div>
      <div className="tr-form-section">
        <h4 className="tr-h4">Retirement Planning</h4>
        <div className="tr-form-grid">
          <TextField label="Target Retirement Age" type="number" value={data.targetRetirementAge} onChange={v => set('targetRetirementAge', v)} hint={yearsToRetirement != null ? `${yearsToRetirement} years to retirement` : ''} />
          <TextField label="Plan Through Age" type="number" value={data.planThroughAge} onChange={v => set('planThroughAge', v)} hint={yearsNeeded != null ? `${yearsNeeded} years of retirement income needed` : ''} />
        </div>
      </div>
      <div className="tr-form-section">
        <h4 className="tr-h4">Cash &amp; Savings</h4>
        <div className="tr-form-grid">
          <MoneyField label="Checking Account Balance" value={data.checking} onChange={v => set('checking', v)} />
          <MoneyField label="Savings Account Balance" value={data.savings} onChange={v => set('savings', v)} />
        </div>
        <p className="tr-empty">Total Cash: {fmtMoney(totalCash)}</p>
        <div className="tr-form-grid">
          <MoneyField label="Emergency Fund Target" value={data.emergencyFundTarget} onChange={v => set('emergencyFundTarget', v)} />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------
// Step 2 — Income Sources
// ---------------------------------------------------------------------
function IntakeStepIncome({ items, setItems }) {
  function addItem(overrides = {}) {
    setItems(prev => [...prev, { id: crypto.randomUUID(), description: '', type: 'Salary / Wages', amount: '', paidFrequency: 'Per Year', startDate: '', endDate: '', colaPercent: '', ...overrides }]);
  }
  function updateItem(id, key, value) { setItems(prev => prev.map(it => it.id === id ? { ...it, [key]: value } : it)); }
  function removeItem(id) { setItems(prev => prev.filter(it => it.id !== id)); }
  const totalAnnual = computeTotalAnnualIncome(items);
  return (
    <>
      <h3 className="tr-h3">Your Income</h3>
      <p className="tr-empty" style={{ marginTop: -6 }}>Include all income: salary, Social Security, pensions, rental income, and any other regular payments you receive.</p>
      {items.length > 0 && (
        <div className="tr-bizplan-summary" style={{ marginTop: 14 }}>
          <div className="tr-bizplan-summary-row"><span>Total Annual Income</span><span className="tr-mono">{fmtMoney(totalAnnual)} ({fmtMoney(totalAnnual / 12)}/mo)</span></div>
        </div>
      )}
      <div className="tr-intake-quickstart" style={{ marginTop: 14 }}>
        {INCOME_QUICKSTART.map(q => (
          <button key={q.label} type="button" className="tr-intake-quickstart-chip" onClick={() => addItem({ description: q.label, type: q.type })}>
            <span>{q.label}</span><Plus size={14} />
          </button>
        ))}
      </div>
      {items.map((it, idx) => (
        <div className="tr-intake-entry" key={it.id}>
          <button type="button" className="tr-intake-entry-remove" onClick={() => removeItem(it.id)} title="Remove"><X size={15} /></button>
          <h4 className="tr-h4">Income Source {idx + 1}</h4>
          <div className="tr-form-grid">
            <TextField label="What is this income from?" value={it.description} onChange={v => updateItem(it.id, 'description', v)} placeholder="e.g. My salary at Acme Corp" />
            <SelectField label="Type" value={it.type} onChange={v => updateItem(it.id, 'type', v)} options={INCOME_TYPE_OPTIONS} />
            <MoneyField label="Amount" value={it.amount} onChange={v => updateItem(it.id, 'amount', v)} />
            <SelectField label="Paid" value={it.paidFrequency} onChange={v => updateItem(it.id, 'paidFrequency', v)} options={PAID_FREQUENCY_OPTIONS} />
            <TextField label="Start Date (optional)" type="date" value={it.startDate} onChange={v => updateItem(it.id, 'startDate', v)} />
            <TextField label="End Date (optional)" type="date" value={it.endDate} onChange={v => updateItem(it.id, 'endDate', v)} />
            <TextField label="Annual raise / COLA (%)" type="number" value={it.colaPercent} onChange={v => updateItem(it.id, 'colaPercent', v)} />
          </div>
        </div>
      ))}
      <button type="button" className="tr-btn tr-btn-ghost" onClick={() => addItem()} style={{ width: '100%', justifyContent: 'center' }}>+ Add income source</button>
    </>
  );
}

// ---------------------------------------------------------------------
// Step 3 — Investment Accounts
// ---------------------------------------------------------------------
function IntakeStepInvestments({ items, setItems }) {
  function addItem(overrides = {}) {
    setItems(prev => [...prev, { id: crypto.randomUUID(), name: '', accountType: '401(k)', investedIn: '', riskCategory: '', currentBalance: '', expectedReturn: '', monthlyContribution: '', employerMatch: '', institution: '', ...overrides }]);
  }
  function updateItem(id, key, value) { setItems(prev => prev.map(it => it.id === id ? { ...it, [key]: value } : it)); }
  function removeItem(id) { setItems(prev => prev.filter(it => it.id !== id)); }
  return (
    <>
      <h3 className="tr-h3">Your Accounts</h3>
      <p className="tr-empty" style={{ marginTop: -6 }}>Include retirement accounts (401k, IRA), brokerage accounts, and any other investment accounts.</p>
      <div className="tr-intake-quickstart" style={{ marginTop: 14 }}>
        {INVESTMENT_QUICKSTART.map(label => (
          <button key={label} type="button" className="tr-intake-quickstart-chip" onClick={() => addItem({ accountType: label })}>
            <span>{label}</span><Plus size={14} />
          </button>
        ))}
      </div>
      {items.map((it, idx) => (
        <div className="tr-intake-entry" key={it.id}>
          <button type="button" className="tr-intake-entry-remove" onClick={() => removeItem(it.id)} title="Remove"><X size={15} /></button>
          <h4 className="tr-h4">Account {idx + 1}</h4>
          <div className="tr-form-grid">
            <TextField label="Account name" value={it.name} onChange={v => updateItem(it.id, 'name', v)} placeholder="e.g. My Fidelity 401(k)" />
            <SelectField label="Account type" value={it.accountType} onChange={v => updateItem(it.id, 'accountType', v)} options={ACCOUNT_TYPE_OPTIONS} />
            <SelectField label="What's invested in?" value={it.investedIn} onChange={v => updateItem(it.id, 'investedIn', v)} options={INVESTED_IN_OPTIONS} />
            <SelectField label="Risk category" value={it.riskCategory} onChange={v => updateItem(it.id, 'riskCategory', v)} options={RISK_CATEGORY_OPTIONS} />
            <MoneyField label="Current balance" value={it.currentBalance} onChange={v => updateItem(it.id, 'currentBalance', v)} />
            <TextField label="Expected return (%/yr)" type="number" value={it.expectedReturn} onChange={v => updateItem(it.id, 'expectedReturn', v)} />
            <MoneyField label="Your monthly contribution" value={it.monthlyContribution} onChange={v => updateItem(it.id, 'monthlyContribution', v)} />
            <MoneyField label="Employer match (if any)" value={it.employerMatch} onChange={v => updateItem(it.id, 'employerMatch', v)} />
            <TextField label="Institution (optional)" value={it.institution} onChange={v => updateItem(it.id, 'institution', v)} placeholder="e.g. Fidelity, Vanguard, Schwab" />
          </div>
        </div>
      ))}
      <button type="button" className="tr-btn tr-btn-ghost" onClick={() => addItem()} style={{ width: '100%', justifyContent: 'center' }}>+ Add account</button>
    </>
  );
}

// ---------------------------------------------------------------------
// Step 4 — Insurance & Annuities
// ---------------------------------------------------------------------
function IntakeStepInsurance({ insurance, setInsurance }) {
  const { lifePolicies, annuities } = insurance;
  function addLifePolicy(overrides = {}) {
    setInsurance(prev => ({ ...prev, lifePolicies: [...prev.lifePolicies, { id: crypto.randomUUID(), policyType: 'Term Life', carrier: '', deathBenefit: '', premiumAmount: '', premiumFrequency: 'Per Year', termLength: '', cashValue: '', ...overrides }] }));
  }
  function updateLifePolicy(id, key, value) { setInsurance(prev => ({ ...prev, lifePolicies: prev.lifePolicies.map(p => p.id === id ? { ...p, [key]: value } : p) })); }
  function removeLifePolicy(id) { setInsurance(prev => ({ ...prev, lifePolicies: prev.lifePolicies.filter(p => p.id !== id) })); }
  function addAnnuity(overrides = {}) {
    setInsurance(prev => ({ ...prev, annuities: [...prev.annuities, { id: crypto.randomUUID(), carrier: '', annuityType: 'Fixed', currentValue: '', guaranteedIncome: '', payoutStartAge: '', ...overrides }] }));
  }
  function updateAnnuity(id, key, value) { setInsurance(prev => ({ ...prev, annuities: prev.annuities.map(a => a.id === id ? { ...a, [key]: value } : a) })); }
  function removeAnnuity(id) { setInsurance(prev => ({ ...prev, annuities: prev.annuities.filter(a => a.id !== id) })); }

  return (
    <>
      <h3 className="tr-h3">Insurance &amp; Annuities</h3>
      <p className="tr-empty" style={{ marginTop: -6 }}>Include life insurance policies and any annuity contracts you own. These help protect your family and guarantee income.</p>

      <div className="tr-form-section" style={{ marginTop: 14 }}>
        <h4 className="tr-h4">Life Insurance Policies</h4>
        {lifePolicies.length === 0 && <p className="tr-empty">No life insurance policies added yet.</p>}
        {lifePolicies.map((p, idx) => (
          <div className="tr-intake-entry" key={p.id}>
            <button type="button" className="tr-intake-entry-remove" onClick={() => removeLifePolicy(p.id)} title="Remove"><X size={15} /></button>
            <h4 className="tr-h4">Policy {idx + 1}</h4>
            <div className="tr-form-grid">
              <SelectField label="Policy type" value={p.policyType} onChange={v => updateLifePolicy(p.id, 'policyType', v)} options={LIFE_POLICY_TYPE_OPTIONS} />
              <TextField label="Carrier / Company" value={p.carrier} onChange={v => updateLifePolicy(p.id, 'carrier', v)} />
              <MoneyField label="Death benefit" value={p.deathBenefit} onChange={v => updateLifePolicy(p.id, 'deathBenefit', v)} />
              <MoneyField label="Premium" value={p.premiumAmount} onChange={v => updateLifePolicy(p.id, 'premiumAmount', v)} />
              <SelectField label="Premium paid" value={p.premiumFrequency} onChange={v => updateLifePolicy(p.id, 'premiumFrequency', v)} options={PAID_FREQUENCY_OPTIONS} />
              <TextField label="Term length, years (if term)" type="number" value={p.termLength} onChange={v => updateLifePolicy(p.id, 'termLength', v)} />
              <MoneyField label="Cash value (if whole/universal)" value={p.cashValue} onChange={v => updateLifePolicy(p.id, 'cashValue', v)} />
            </div>
          </div>
        ))}
        <div className="tr-intake-quickstart">
          <button type="button" className="tr-intake-quickstart-chip" onClick={() => addLifePolicy({ policyType: 'Term Life' })}><span>Term Life Policy</span><Plus size={14} /></button>
          <button type="button" className="tr-intake-quickstart-chip" onClick={() => addLifePolicy({ policyType: 'Whole Life' })}><span>Whole Life Policy</span><Plus size={14} /></button>
        </div>
        <button type="button" className="tr-btn tr-btn-ghost" onClick={() => addLifePolicy()} style={{ width: '100%', justifyContent: 'center' }}>+ Add a life insurance policy</button>
      </div>

      <div className="tr-form-section">
        <h4 className="tr-h4">Annuity Contracts</h4>
        {annuities.length === 0 && <p className="tr-empty">No annuity contracts added yet.</p>}
        {annuities.map((a, idx) => (
          <div className="tr-intake-entry" key={a.id}>
            <button type="button" className="tr-intake-entry-remove" onClick={() => removeAnnuity(a.id)} title="Remove"><X size={15} /></button>
            <h4 className="tr-h4">Annuity {idx + 1}</h4>
            <div className="tr-form-grid">
              <TextField label="Carrier / Company" value={a.carrier} onChange={v => updateAnnuity(a.id, 'carrier', v)} />
              <SelectField label="Type" value={a.annuityType} onChange={v => updateAnnuity(a.id, 'annuityType', v)} options={ANNUITY_TYPE_OPTIONS} />
              <MoneyField label="Current value" value={a.currentValue} onChange={v => updateAnnuity(a.id, 'currentValue', v)} />
              <MoneyField label="Guaranteed income amount (optional)" value={a.guaranteedIncome} onChange={v => updateAnnuity(a.id, 'guaranteedIncome', v)} />
              <TextField label="Payout start age (optional)" type="number" value={a.payoutStartAge} onChange={v => updateAnnuity(a.id, 'payoutStartAge', v)} />
            </div>
          </div>
        ))}
        <button type="button" className="tr-btn tr-btn-ghost" onClick={() => addAnnuity()} style={{ width: '100%', justifyContent: 'center' }}>+ Add an annuity contract</button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------
// Step 5 — Monthly Expenses
// ---------------------------------------------------------------------
function IntakeStepExpenses({ items, setItems }) {
  function addItem(overrides = {}) {
    setItems(prev => [...prev, { id: crypto.randomUUID(), description: '', category: 'Housing', monthlyAmount: '', notes: '', ...overrides }]);
  }
  function updateItem(id, key, value) { setItems(prev => prev.map(it => it.id === id ? { ...it, [key]: value } : it)); }
  function removeItem(id) { setItems(prev => prev.filter(it => it.id !== id)); }
  const totalMonthly = computeTotalMonthlyExpenses(items);
  return (
    <>
      <h3 className="tr-h3">Your Expenses</h3>
      <p className="tr-empty" style={{ marginTop: -6 }}>List your typical monthly expenses. Don't worry about being exact — your best estimate is fine.</p>
      {items.length > 0 && (
        <div className="tr-bizplan-summary" style={{ marginTop: 14 }}>
          <div className="tr-bizplan-summary-row"><span>Total Monthly Expenses</span><span className="tr-mono">{fmtMoney(totalMonthly)}</span></div>
        </div>
      )}
      <div className="tr-intake-quickstart" style={{ marginTop: 14 }}>
        {EXPENSE_QUICKSTART.map(q => (
          <button key={q.label} type="button" className="tr-intake-quickstart-chip" onClick={() => addItem({ description: q.label, category: q.category })}>
            <span>{q.label}</span><Plus size={14} />
          </button>
        ))}
      </div>
      {items.map((it, idx) => (
        <div className="tr-intake-entry" key={it.id}>
          <button type="button" className="tr-intake-entry-remove" onClick={() => removeItem(it.id)} title="Remove"><X size={15} /></button>
          <h4 className="tr-h4">Expense {idx + 1}</h4>
          <div className="tr-form-grid">
            <TextField label="What is this expense?" value={it.description} onChange={v => updateItem(it.id, 'description', v)} placeholder="e.g. Mortgage, Groceries, Car Payment" />
            <SelectField label="Category" value={it.category} onChange={v => updateItem(it.id, 'category', v)} options={EXPENSE_CATEGORY_OPTIONS} />
            <MoneyField label="Monthly Amount" value={it.monthlyAmount} onChange={v => updateItem(it.id, 'monthlyAmount', v)} />
            <TextField label="Notes (optional)" value={it.notes} onChange={v => updateItem(it.id, 'notes', v)} placeholder="e.g. Pays off in 2030, shared with spouse" />
          </div>
        </div>
      ))}
      <button type="button" className="tr-btn tr-btn-ghost" onClick={() => addItem()} style={{ width: '100%', justifyContent: 'center' }}>+ Add expense</button>
    </>
  );
}

// ---------------------------------------------------------------------
// Step 6 — Goals & Concerns
// ---------------------------------------------------------------------
function IntakeStepGoals({ data, setData }) {
  function set(key, value) { setData(prev => ({ ...prev, [key]: value })); }
  function toggleConcern(value) {
    setData(prev => ({ ...prev, concerns: prev.concerns.includes(value) ? prev.concerns.filter(c => c !== value) : [...prev.concerns, value] }));
  }
  return (
    <>
      <h3 className="tr-h3">Goals &amp; Concerns</h3>
      <p className="tr-empty" style={{ marginTop: -6 }}>Share your ideal retirement lifestyle and any financial risks that concern you. This helps your advisor build the right plan.</p>

      <div className="tr-form-section" style={{ marginTop: 14 }}>
        <h4 className="tr-h4">Risk Tolerance</h4>
        <p className="tr-empty" style={{ marginTop: -4, marginBottom: 10 }}>How do you feel about investment risk?</p>
        <CardSelect options={RISK_TOLERANCE_OPTIONS} isSelected={v => data.riskTolerance === v} onSelect={v => set('riskTolerance', v)} />
      </div>

      <div className="tr-form-section">
        <h4 className="tr-h4">Social Security Preferences</h4>
        <p className="tr-empty" style={{ marginTop: -4, marginBottom: 10 }}>When do you plan to start claiming Social Security?</p>
        <CardSelect options={SS_CLAIM_AGE_OPTIONS} isSelected={v => data.ssClaimAge === v} onSelect={v => set('ssClaimAge', v)} />
      </div>

      <div className="tr-form-section">
        <h4 className="tr-h4">Healthcare in Retirement</h4>
        <p className="tr-empty" style={{ marginTop: -4, marginBottom: 10 }}>Healthcare coverage planning before Medicare eligibility at 65.</p>
        <div className="tr-form-grid">
          <MoneyField label="Expected Monthly Healthcare Cost (before Medicare)" value={data.healthcareMonthlyCost} onChange={v => set('healthcareMonthlyCost', v)} />
          <MoneyField label="Expected Medicare Supplement Cost" value={data.medicareSupplementCost} onChange={v => set('medicareSupplementCost', v)} />
        </div>
      </div>

      <div className="tr-form-section">
        <h4 className="tr-h4">Your Ideal Retirement</h4>
        <p className="tr-empty" style={{ marginTop: -4, marginBottom: 10 }}>Help your advisor understand the retirement lifestyle you envision.</p>
        <CardSelect options={DESIRED_LIFESTYLE_OPTIONS} isSelected={v => data.desiredLifestyle === v} onSelect={v => set('desiredLifestyle', v)} />
        <div className="tr-form-grid" style={{ marginTop: 12 }}>
          <MoneyField label="Desired Monthly Retirement Income" value={data.desiredMonthlyIncome} onChange={v => set('desiredMonthlyIncome', v)} />
          <MoneyField label="Annual Travel Budget" value={data.annualTravelBudget} onChange={v => set('annualTravelBudget', v)} />
          <SelectField label="Housing Plans in Retirement" value={data.housingPlan} onChange={v => set('housingPlan', v)} options={HOUSING_PLAN_OPTIONS} placeholder="Select a plan…" />
        </div>
        <div className="tr-form-grid">
          <TextField label="Legacy / Inheritance Goals (optional)" value={data.legacyGoals} onChange={v => set('legacyGoals', v)} placeholder="e.g. Leave $500k to children, fund grandchildren's education" />
          <MoneyField label="Annual Charitable Giving Goal (optional)" value={data.charitableGivingGoal} onChange={v => set('charitableGivingGoal', v)} />
          <TextField label="Major Purchases Planned (optional)" value={data.majorPurchases} onChange={v => set('majorPurchases', v)} placeholder="e.g. New car in 5 years ($40k), vacation home ($300k)" />
        </div>
      </div>

      <div className="tr-form-section">
        <h4 className="tr-h4">Part-Time Work Plans</h4>
        <label className="tr-field-wide tr-checkbox-field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={data.partTimeWork} onChange={e => set('partTimeWork', e.target.checked)} />
          <span>I plan to work part-time in early retirement — consulting, freelancing, or reduced hours work</span>
        </label>
      </div>

      <div className="tr-form-section">
        <h4 className="tr-h4">What Keeps You Up at Night?</h4>
        <p className="tr-empty" style={{ marginTop: -4, marginBottom: 10 }}>Select any financial risks that concern you. This helps your advisor build scenarios to protect against these risks.</p>
        <CardSelect options={CONCERN_OPTIONS} isSelected={v => data.concerns.includes(v)} onSelect={toggleConcern} />
        <div className="tr-form-grid" style={{ marginTop: 10 }}>
          <TextField label="Anything Else Your Advisor Should Know? (optional)" value={data.anythingElse} onChange={v => set('anythingElse', v)} placeholder="Any other goals, concerns, or important information…" />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------
// public wizard shell + top-level flow
// ---------------------------------------------------------------------
function PublicShell({ children }) {
  return (
    <div className="tr-root">
      <style>{CSS}</style>
      <div className="tr-intake-page"><div className="tr-intake-narrow">{children}</div></div>
    </div>
  );
}
const STEP_TITLES = ['Personal & Family', 'Income Sources', 'Investment Accounts', 'Insurance & Annuities', 'Monthly Expenses', 'Goals & Concerns'];

export function ClientIntakePublicForm({ token }) {
  const [phase, setPhase] = useState('loading'); // loading | not_found | landing | form | submitted | already_submitted
  const [clientName, setClientName] = useState('');
  const [advisorName, setAdvisorName] = useState('');
  const [responses, setResponses] = useState(EMPTY_INTAKE_RESPONSES);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchClientIntakeByToken(token).then(res => {
      if (!alive) return;
      if (!res.found) { setPhase('not_found'); return; }
      const incoming = res.responses || {};
      // The lookup RPC returns camelCase keys (see get_client_intake_by_token
      // in migration-client-intake.sql) — clientName was previously read as
      // the snake_case client_name here, which the RPC never actually sends,
      // so the landing page always fell back to "You" instead of the real name.
      setClientName(res.clientName || '');
      setAdvisorName(res.advisorName || '');
      setResponses({
        ...EMPTY_INTAKE_RESPONSES,
        ...incoming,
        personal: { ...EMPTY_INTAKE_RESPONSES.personal, ...(incoming.personal || {}) },
        insurance: { ...EMPTY_INTAKE_RESPONSES.insurance, ...(incoming.insurance || {}) },
        goals: { ...EMPTY_INTAKE_RESPONSES.goals, ...(incoming.goals || {}) },
      });
      setPhase(res.status === 'submitted' ? 'already_submitted' : 'landing');
    });
    return () => { alive = false; };
  }, [token]);

  async function persist() { setSaving(true); await saveClientIntakeProgress(token, responses); setSaving(false); }
  async function goNext() { await persist(); setStep(s => Math.min(5, s + 1)); window.scrollTo(0, 0); }
  function goBack() { setStep(s => Math.max(0, s - 1)); window.scrollTo(0, 0); }
  async function handleFinalSubmit() {
    setSubmitting(true);
    await submitClientIntakeFinal(token, responses);
    setSubmitting(false);
    setPhase('submitted');
    window.scrollTo(0, 0);
  }

  const setPersonal = updater => setResponses(prev => ({ ...prev, personal: typeof updater === 'function' ? updater(prev.personal) : updater }));
  const setIncome = updater => setResponses(prev => ({ ...prev, income: typeof updater === 'function' ? updater(prev.income) : updater }));
  const setInvestments = updater => setResponses(prev => ({ ...prev, investments: typeof updater === 'function' ? updater(prev.investments) : updater }));
  const setInsurance = updater => setResponses(prev => ({ ...prev, insurance: typeof updater === 'function' ? updater(prev.insurance) : updater }));
  const setExpenses = updater => setResponses(prev => ({ ...prev, expenses: typeof updater === 'function' ? updater(prev.expenses) : updater }));
  const setGoals = updater => setResponses(prev => ({ ...prev, goals: typeof updater === 'function' ? updater(prev.goals) : updater }));

  if (phase === 'loading') return <PublicShell><div className="tr-intake-center"><p className="tr-empty">Loading…</p></div></PublicShell>;

  if (phase === 'not_found') {
    return (
      <PublicShell>
        <div className="tr-intake-center">
          <h2 className="tr-h2">Link not found</h2>
          <p className="tr-empty">This intake link isn't valid or may have expired. Please check with your advisor for a new link.</p>
        </div>
      </PublicShell>
    );
  }
  if (phase === 'already_submitted') {
    return (
      <PublicShell>
        <div className="tr-intake-center">
          <div className="tr-intake-icon-badge"><CheckCircle2 size={28} /></div>
          <h2 className="tr-h2">Already submitted</h2>
          <p className="tr-empty">This information has already been submitted to your advisor. You can safely close this page.</p>
        </div>
      </PublicShell>
    );
  }
  if (phase === 'landing') {
    return (
      <PublicShell>
        <div className="tr-intake-center">
          <div className="tr-intake-icon-badge"><ShieldCheck size={28} /></div>
          <h2 className="tr-h2">Financial Information</h2>
          <p className="tr-empty">
            {advisorName ? `${advisorName} has requested` : 'Your advisor has requested'} some information to help plan your financial future.
          </p>
        </div>
        <div className="tr-card">
          <div className="tr-empty" style={{ margin: 0 }}>PREPARED FOR</div>
          <div className="tr-h3" style={{ margin: '2px 0 12px' }}>{clientName || 'You'}</div>
          <div className="tr-intake-steps-list">
            {STEP_TITLES.map((t, i) => (
              <div key={t} className="tr-intake-summary-row"><span><span className="tr-intake-step-num">{i + 1}</span>{t}</span></div>
            ))}
          </div>
        </div>
        <div className="tr-form-actions" style={{ marginTop: 16, justifyContent: 'center' }}>
          <button type="button" className="tr-btn tr-btn-brass" onClick={() => setPhase('form')}>Get Started <ArrowRight size={15} /></button>
        </div>
        <p className="tr-empty" style={{ textAlign: 'center', marginTop: 10 }}>
          Takes about 8–10 minutes. Answer what you can — anything else can be skipped, and your progress saves automatically as you go.
        </p>
        <p className="tr-empty" style={{ textAlign: 'center', marginTop: 6 }}>
          <ShieldCheck size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Secure and encrypted
        </p>
      </PublicShell>
    );
  }
  if (phase === 'submitted') {
    const sections = [
      ['Personal & Family', hasAny(responses.personal) ? true : 0],
      ['Income Sources', responses.income.length],
      ['Investment Accounts', responses.investments.length],
      ['Insurance & Annuities', responses.insurance.lifePolicies.length + responses.insurance.annuities.length],
      ['Monthly Expenses', responses.expenses.length],
      ['Goals & Concerns', hasAny(responses.goals) ? true : 0],
    ];
    return (
      <PublicShell>
        <div className="tr-intake-center">
          <div className="tr-intake-icon-badge"><CheckCircle2 size={28} /></div>
          <h2 className="tr-h2">All Done!</h2>
          <p className="tr-empty">Your information has been submitted successfully. Your financial advisor will review everything shortly.</p>
        </div>
        <div className="tr-card">
          <h4 className="tr-h4">What was submitted</h4>
          <div className="tr-intake-summary-list">
            {sections.map(([label, val]) => (
              <div className="tr-intake-summary-row" key={label}>
                <span>{label}</span>
                {val === true ? <span className="tr-status tr-status-green">Done</span>
                  : val > 0 ? <span className="tr-status tr-status-green">{val} {val === 1 ? 'entry' : 'entries'}</span>
                  : <span className="tr-empty" style={{ margin: 0 }}>Skipped</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="tr-card" style={{ marginTop: 14 }}>
          <h4 className="tr-h4">What happens next?</h4>
          <div className="tr-intake-steps-list">
            <div className="tr-intake-summary-row"><span><span className="tr-intake-step-num">1</span>Your advisor reviews your information</span></div>
            <div className="tr-intake-summary-row"><span><span className="tr-intake-step-num">2</span>They build a personalized financial plan</span></div>
            <div className="tr-intake-summary-row"><span><span className="tr-intake-step-num">3</span>You'll meet to discuss your retirement strategy</span></div>
          </div>
        </div>
        <div className="tr-card" style={{ marginTop: 14 }}>
          <p className="tr-empty" style={{ margin: 0 }}>
            <ShieldCheck size={13} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Your data is encrypted and stored securely. You can safely close this page.
          </p>
        </div>
      </PublicShell>
    );
  }

  // phase === 'form'
  return (
    <PublicShell>
      <div className="tr-intake-topbar">
        <div className="tr-intake-brand">PaceLedger</div>
        <div>{saving ? 'Saving…' : 'Saved'}</div>
      </div>
      <div>
        <div className="tr-intake-progress-label">
          <span>Step {step + 1} of 6</span>
          <strong>{STEP_TITLES[step]}</strong>
        </div>
        <div className="tr-intake-progress-track">
          <div className="tr-intake-progress-fill" style={{ width: `${((step + 1) / 6) * 100}%` }} />
        </div>
      </div>
      <div className="tr-card" style={{ marginTop: 18 }}>
        {step === 0 && <IntakeStepPersonal data={responses.personal} setData={setPersonal} />}
        {step === 1 && <IntakeStepIncome items={responses.income} setItems={setIncome} />}
        {step === 2 && <IntakeStepInvestments items={responses.investments} setItems={setInvestments} />}
        {step === 3 && <IntakeStepInsurance insurance={responses.insurance} setInsurance={setInsurance} />}
        {step === 4 && <IntakeStepExpenses items={responses.expenses} setItems={setExpenses} />}
        {step === 5 && <IntakeStepGoals data={responses.goals} setData={setGoals} />}
        <div className="tr-form-actions" style={{ marginTop: 20 }}>
          {step > 0 && <button type="button" className="tr-btn tr-btn-ghost" onClick={goBack}>Back</button>}
          {step < 5 ? (
            <button type="button" className="tr-btn tr-btn-brass" onClick={goNext} disabled={saving}>Next: {STEP_TITLES[step + 1]} <ArrowRight size={15} /></button>
          ) : (
            <button type="button" className="tr-btn tr-btn-brass" onClick={handleFinalSubmit} disabled={submitting}>{submitting ? 'Submitting…' : 'Review & Submit'}</button>
          )}
        </div>
        {step < 5 && (
          <button type="button" className="tr-intake-skip-link" onClick={goNext}>Skip this step for now</button>
        )}
      </div>
    </PublicShell>
  );
}

// ---------------------------------------------------------------------
// authenticated Client Intake tab — the advisor/manager-facing list
// ---------------------------------------------------------------------
function IntakeResponsesView({ responses }) {
  const r = responses || {};
  const p = r.personal || {};
  const g = r.goals || {};
  const income = r.income || [];
  const investments = r.investments || [];
  const insurance = r.insurance || { lifePolicies: [], annuities: [] };
  const expenses = r.expenses || [];
  const concernLabels = (g.concerns || []).map(v => (CONCERN_OPTIONS.find(o => o.value === v) || {}).label || v);

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
      <h4 className="tr-h4">Personal &amp; Family</h4>
      <div className="tr-policy-fields">
        {[
          field('DOB', p.dob), field('State', p.state), field('Marital Status', p.maritalStatus), field('Tax Filing', p.taxFilingStatus),
          field('Target Retirement Age', p.targetRetirementAge), field('Plan Through Age', p.planThroughAge),
          field('Checking', p.checking !== '' ? fmtMoney(p.checking) : ''), field('Savings', p.savings !== '' ? fmtMoney(p.savings) : ''),
          field('Emergency Fund Target', p.emergencyFundTarget !== '' ? fmtMoney(p.emergencyFundTarget) : ''),
        ]}
      </div>

      <h4 className="tr-h4" style={{ marginTop: 14 }}>Income Sources</h4>
      {income.length === 0 ? <p className="tr-empty">Skipped</p> : income.map((it, i) => (
        <p className="tr-empty" key={it.id || i} style={{ margin: '2px 0' }}>{it.description || it.type} — {fmtMoney(it.amount)} ({it.paidFrequency})</p>
      ))}

      <h4 className="tr-h4" style={{ marginTop: 14 }}>Investment Accounts</h4>
      {investments.length === 0 ? <p className="tr-empty">Skipped</p> : investments.map((it, i) => (
        <p className="tr-empty" key={it.id || i} style={{ margin: '2px 0' }}>{it.name || it.accountType} ({it.accountType}) — {fmtMoney(it.currentBalance)}</p>
      ))}

      <h4 className="tr-h4" style={{ marginTop: 14 }}>Insurance &amp; Annuities</h4>
      {insurance.lifePolicies.length === 0 && insurance.annuities.length === 0 ? <p className="tr-empty">Skipped</p> : (
        <>
          {insurance.lifePolicies.map((p2, i) => <p className="tr-empty" key={p2.id || i} style={{ margin: '2px 0' }}>{p2.policyType} — {p2.carrier || 'no carrier given'} — death benefit {fmtMoney(p2.deathBenefit)}</p>)}
          {insurance.annuities.map((a, i) => <p className="tr-empty" key={a.id || i} style={{ margin: '2px 0' }}>{a.annuityType} annuity — {a.carrier || 'no carrier given'} — {fmtMoney(a.currentValue)}</p>)}
        </>
      )}

      <h4 className="tr-h4" style={{ marginTop: 14 }}>Monthly Expenses</h4>
      {expenses.length === 0 ? <p className="tr-empty">Skipped</p> : expenses.map((it, i) => (
        <p className="tr-empty" key={it.id || i} style={{ margin: '2px 0' }}>{it.description || it.category} — {fmtMoney(it.monthlyAmount)}/mo</p>
      ))}

      <h4 className="tr-h4" style={{ marginTop: 14 }}>Goals &amp; Concerns</h4>
      <div className="tr-policy-fields">
        {[
          field('Risk Tolerance', g.riskTolerance), field('SS Claim Age', g.ssClaimAge), field('Desired Lifestyle', g.desiredLifestyle),
          field('Desired Monthly Income', g.desiredMonthlyIncome !== '' ? fmtMoney(g.desiredMonthlyIncome) : ''),
          field('Annual Travel Budget', g.annualTravelBudget !== '' ? fmtMoney(g.annualTravelBudget) : ''),
          field('Housing Plan', g.housingPlan), field('Legacy Goals', g.legacyGoals),
          field('Charitable Giving Goal', g.charitableGivingGoal !== '' ? fmtMoney(g.charitableGivingGoal) : ''),
          field('Major Purchases', g.majorPurchases), field('Part-Time Work', g.partTimeWork ? 'Yes' : null),
          concernLabels.length > 0 ? field('Concerns', concernLabels.join(', ')) : null, field('Notes', g.anythingElse),
        ]}
      </div>
    </div>
  );
}

function fmtIntakeDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Per-client intake panel, shown inside a Follow Up card. Pending ->
// copyable link; submitted -> the client's answers, expandable.
export function ClientIntakeSection({ candidate, canManage, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = buildIntakeLink(candidate.token);
  async function handleCopy() {
    // Web: copy. iPhone app: share sheet (Messages, Mail, Copy, …).
    const res = await shareOrCopy({ url: link, title: 'Client intake form' });
    if (res === 'copied') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }
  const submitted = candidate.status === 'submitted';
  return (
    <div>
      <div className="tr-row-head">
        <h4 className="tr-h4" style={{ margin: 0 }}>Client intake</h4>
        <span className={`tr-status ${submitted ? 'tr-status-green' : 'tr-status-amber'}`}>
          {submitted ? `Received ${fmtIntakeDate(candidate.submitted_at)}` : 'Link sent — waiting on client'}
        </span>
      </div>
      {!submitted && (
        <div className="tr-intake-link-row" style={{ marginTop: 8 }}>
          <span className="tr-intake-link-box">{link}</span>
          <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={handleCopy}><Copy size={13} /> {copied ? 'Copied!' : isNativeApp() ? 'Share' : 'Copy'}</button>
        </div>
      )}
      <div className="tr-form-actions" style={{ marginTop: 8, justifyContent: 'flex-start' }}>
        {submitted && (
          <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => setExpanded(e => !e)}>
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {expanded ? 'Hide answers' : 'View submitted info'}
          </button>
        )}
        {canManage && (
          <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onRemove}><Trash2 size={13} /> Remove intake</button>
        )}
      </div>
      {submitted && expanded && <IntakeResponsesView responses={candidate.responses} />}
    </div>
  );
}
