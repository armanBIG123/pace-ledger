// Business Plan: expenses, income goal and marketing plan.
import { useEffect, useRef, useState } from 'react';
import { computeAnnualGrossIncomeNeeded, computeCommissionPerTransaction, computeDailyProspects, computeExpensesSubtotal, computeMonthlyGrossIncomeNeeded, computeMonthlyProspects, computeProspectsNeededPerYear, computeTransactionsNeededPerYear, DEFAULT_BUSINESS_PLAN_FIELDS, fetchBusinessPlan, rowToBusinessPlanFields, saveBusinessPlan } from '../businessPlan.js';
import { fmtCurrency } from '../lib/format.js';
import { PageHead, SkelBlock } from '../components/ui.jsx';

// ---------------------------------------------------------------------
// Business Plan — a personal living-expenses worksheet (Expenses) and a
// prospecting-goal calculator built from it (Goals). Available to every
// role; each person only ever sees and edits their own.
// ---------------------------------------------------------------------
export const EXPENSE_FIELD_DEFS = [
  ['mortgageRent', 'Mortgage Payment (Rent)'],
  ['household', 'Household (heat, water, etc.)'],
  ['food', 'Food (groceries, dining in and out)'],
  ['car', 'Car expenses (payments, gas, etc.)'],
  ['entertainment', 'Entertainment'],
  ['childCare', 'Child Care'],
  ['education', 'Education'],
  ['investmentsSavings', 'Investments/Savings'],
  ['otherExpenses', 'Other Living Expenses'],
];

export function BusinessPlanBody({ user }) {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('expenses'); // 'expenses' | 'goals' | 'marketing'
  const [fields, setFields] = useState(DEFAULT_BUSINESS_PLAN_FIELDS);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [loadFailed, setLoadFailed] = useState(false);
  // Latest edits, for flushing a pending autosave if you leave the tab
  // before the debounce fires.
  const pendingRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetchBusinessPlan(user.id).then(row => {
      if (!alive) return;
      // Never autosave over a plan we failed to load — that would replace
      // the real numbers with blanks.
      if (row && row.loadError) setLoadFailed(true);
      else if (row) setFields(rowToBusinessPlanFields(row));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [user.id]);

  // Autosave: a moment after you stop typing, everything is saved — no
  // Save button to forget before switching tabs.
  useEffect(() => {
    if (!dirty) return undefined;
    pendingRef.current = fields;
    const t = setTimeout(async () => {
      setSaveState('saving');
      const res = await saveBusinessPlan(user.id, fields);
      if (res.ok) {
        if (pendingRef.current === fields) { pendingRef.current = null; setDirty(false); }
        setSaveState('saved');
      } else {
        setSaveState('error');
      }
    }, 900);
    return () => clearTimeout(t);
  }, [fields, dirty, user.id]);
  useEffect(() => () => {
    if (pendingRef.current) saveBusinessPlan(user.id, pendingRef.current);
  }, [user.id]);

  function setField(key, value) {
    setFields(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  }
  async function handleRetrySave() {
    setSaveState('saving');
    const res = await saveBusinessPlan(user.id, fields);
    if (res.ok) { pendingRef.current = null; setDirty(false); setSaveState('saved'); } else setSaveState('error');
  }

  const subtotal = computeExpensesSubtotal(fields);
  const monthlyGrossIncomeNeeded = computeMonthlyGrossIncomeNeeded(subtotal);
  const annualGrossIncomeNeeded = computeAnnualGrossIncomeNeeded(monthlyGrossIncomeNeeded);
  const cpt = computeCommissionPerTransaction(fields.targetPremium, fields.commissionRate);
  const usingCalculatedIncomeGoal = fields.incomeGoalOverride === '';
  const incomeGoal = usingCalculatedIncomeGoal ? annualGrossIncomeNeeded : (Number(fields.incomeGoalOverride) || 0);
  const tny = computeTransactionsNeededPerYear(incomeGoal, cpt);
  const tpn = computeProspectsNeededPerYear(tny);
  const monthlyProspects = computeMonthlyProspects(tpn);
  const dailyProspects = computeDailyProspects(monthlyProspects);

  if (loading) return <SkelBlock w="100%" h="220px" />;
  if (loadFailed) {
    return (
      <div className="tr-card">
        <p className="tr-error" style={{ margin: 0 }}>Couldn't load your Business Plan. Refresh the page to try again — nothing has been changed.</p>
      </div>
    );
  }

  return (
    <div className="tr-appts-shell">
      <nav className="tr-appts-sidebar">
        <button type="button" className={`tr-sidebar-item tr-sidebar-item-week ${view === 'expenses' ? 'tr-sidebar-item-active' : ''}`} onClick={() => setView('expenses')}>
          <span>Expenses</span>
        </button>
        <button type="button" className={`tr-sidebar-item tr-sidebar-item-week ${view === 'goals' ? 'tr-sidebar-item-active' : ''}`} onClick={() => setView('goals')}>
          <span>Goals</span>
        </button>
        <button type="button" className={`tr-sidebar-item tr-sidebar-item-week ${view === 'marketing' ? 'tr-sidebar-item-active' : ''}`} onClick={() => setView('marketing')}>
          <span>Marketing Plan</span>
        </button>
        {tny > 0 && (
          <div className="tr-bizplan-glance">
            <div className="tr-sidebar-divider" style={{ padding: '6px 0 4px' }}>Your numbers</div>
            <div><span>Income goal</span><strong>{fmtCurrency(incomeGoal)}</strong></div>
            <div><span>Sales / month</span><strong>{(tny / 12).toFixed(1)}</strong></div>
            <div><span>Prospects / week</span><strong>{(tpn / 52).toFixed(1)}</strong></div>
            <div><span>Prospects / day</span><strong>{dailyProspects.toFixed(1)}</strong></div>
          </div>
        )}
      </nav>
      <div className="tr-appts-main">
        <PageHead
          title={view === 'goals' ? 'Goals' : view === 'marketing' ? 'Marketing plan' : 'Business plan'}
          sub={view === 'goals' ? 'Turn your income goal into the sales and prospects you need.' : view === 'marketing' ? 'How you will reach your goals, and when.' : 'Start with what you need to live on; everything else is worked out from it.'} />
        <div className="tr-card">
          {view === 'expenses' && (
            <BusinessPlanExpensesPanel
              fields={fields} setField={setField}
              subtotal={subtotal} monthlyGrossIncomeNeeded={monthlyGrossIncomeNeeded} annualGrossIncomeNeeded={annualGrossIncomeNeeded} />
          )}
          {view === 'goals' && (
            <BusinessPlanGoalsPanel
              fields={fields} setField={setField}
              annualGrossIncomeNeeded={annualGrossIncomeNeeded} usingCalculatedIncomeGoal={usingCalculatedIncomeGoal}
              cpt={cpt} tny={tny} tpn={tpn} monthlyProspects={monthlyProspects} dailyProspects={dailyProspects} />
          )}
          {view === 'marketing' && (
            <BusinessPlanMarketingPanel fields={fields} setField={setField} />
          )}
          <div className="tr-autosave">
            {saveState === 'error' ? (
              <><span className="tr-autosave-error">Couldn't save your last change.</span> <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={handleRetrySave}>Try again</button></>
            ) : dirty || saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'All changes saved' : 'Changes save automatically'}
          </div>
        </div>
      </div>
    </div>
  );
}

export function BusinessPlanExpensesPanel({ fields, setField, subtotal, monthlyGrossIncomeNeeded, annualGrossIncomeNeeded }) {
  return (
    <>
      <h3 className="tr-h3">Living Expenses</h3>
      <p className="tr-empty" style={{ margin: '-6px 0 14px' }}>Fill in your typical monthly costs. Everything below recalculates as you type.</p>
      <div className="tr-form-grid">
        {EXPENSE_FIELD_DEFS.map(([key, label]) => (
          <label className="tr-field" key={key}>
            <span>{label}</span>
            <span className="tr-input-affix tr-input-affix-pre"><span>$</span><input type="number" min="0" step="1" inputMode="decimal" value={fields[key]} onChange={e => setField(key, e.target.value)} placeholder="0" /></span>
          </label>
        ))}
      </div>
      <div className="tr-bizplan-summary">
        <div className="tr-bizplan-summary-row">
          <span>Subtotal (income needed after taxes)</span>
          <span className="tr-mono">{fmtCurrency(subtotal)}</span>
        </div>
        <div className="tr-bizplan-summary-row">
          <span>÷ 0.7 = Monthly gross income needed</span>
          <span className="tr-mono">{fmtCurrency(monthlyGrossIncomeNeeded)}</span>
        </div>
        <div className="tr-bizplan-summary-row tr-bizplan-summary-highlight">
          <span>× 12 = Annual gross income needed</span>
          <span className="tr-mono">{fmtCurrency(annualGrossIncomeNeeded)}</span>
        </div>
      </div>
    </>
  );
}

export function BusinessPlanGoalsPanel({ fields, setField, annualGrossIncomeNeeded, usingCalculatedIncomeGoal, cpt, tny, tpn, monthlyProspects, dailyProspects }) {
  return (
    <>
      <h3 className="tr-h3">Transactions &amp; Prospecting Goals</h3>

      <div className="tr-bizplan-step">
        <h4 className="tr-h4">Step 1 · Average commission per transaction</h4>
        <div className="tr-form-grid">
          <label className="tr-field">
            <span>Average target premium (TP)</span>
            <span className="tr-input-affix tr-input-affix-pre"><span>$</span><input type="number" min="0" step="1" inputMode="decimal" value={fields.targetPremium} onChange={e => setField('targetPremium', e.target.value)} /></span>
          </label>
          <label className="tr-field">
            <span>Commission rate, % (CR)</span>
            <span className="tr-input-affix tr-input-affix-post"><input type="number" min="0" max="100" step="1" inputMode="decimal" value={fields.commissionRate} onChange={e => setField('commissionRate', e.target.value)} /><span>%</span></span>
          </label>
        </div>
        <div className="tr-bizplan-summary">
          <div className="tr-bizplan-summary-row">
            <span>TP × CR = Commission per transaction (CPT)</span>
            <span className="tr-mono">{fmtCurrency(cpt)}</span>
          </div>
        </div>
      </div>

      <div className="tr-bizplan-step">
        <h4 className="tr-h4">Step 2 · Income goal</h4>
        <label className="tr-field tr-field-wide">
          <span>Income goal (IG){usingCalculatedIncomeGoal ? ' — using your calculated annual gross income needed' : ''}</span>
          <span className="tr-input-affix tr-input-affix-pre"><span>$</span><input
            type="number" min="0" step="1" inputMode="decimal"
            value={usingCalculatedIncomeGoal ? String(Math.round(annualGrossIncomeNeeded)) : fields.incomeGoalOverride}
            onChange={e => setField('incomeGoalOverride', e.target.value)} /></span>
        </label>
        {!usingCalculatedIncomeGoal && (
          <button type="button" className="tr-bizplan-reset-link" onClick={() => setField('incomeGoalOverride', '')}>
            Use calculated value ({fmtCurrency(annualGrossIncomeNeeded)})
          </button>
        )}
        <div className="tr-bizplan-summary">
          <div className="tr-bizplan-summary-row">
            <span>IG ÷ CPT = Transactions needed per year (TNY)</span>
            <span className="tr-mono">{tny.toFixed(1)}</span>
          </div>
        </div>
      </div>

      <div className="tr-bizplan-step">
        <h4 className="tr-h4">Step 3 · Prospects needed</h4>
        <div className="tr-bizplan-summary">
          <div className="tr-bizplan-summary-row">
            <span>TNY × 5 (prospect-to-sale ratio) = Total prospects needed per year (TPN)</span>
            <span className="tr-mono">{Math.round(tpn)}</span>
          </div>
        </div>
      </div>

      <div className="tr-bizplan-step">
        <h4 className="tr-h4">Step 4 · Break it down daily</h4>
        <div className="tr-bizplan-summary">
          <div className="tr-bizplan-summary-row">
            <span>TPN ÷ 52 weeks = Weekly prospects needed</span>
            <span className="tr-mono">{(tpn / 52).toFixed(1)}</span>
          </div>
          <div className="tr-bizplan-summary-row">
            <span>TPN ÷ 12 months = Monthly prospects needed</span>
            <span className="tr-mono">{monthlyProspects.toFixed(1)}</span>
          </div>
          <div className="tr-bizplan-summary-row tr-bizplan-summary-highlight">
            <span>÷ 30 days = Prospects needed each day</span>
            <span className="tr-mono">{dailyProspects.toFixed(1)}</span>
          </div>
        </div>
      </div>
    </>
  );
}

export function BusinessPlanMarketingPanel({ fields, setField }) {
  return (
    <>
      <h3 className="tr-h3">Marketing Plan</h3>
      <p className="tr-empty" style={{ marginTop: -6 }}>Three questions worth revisiting as your business changes.</p>
      <div className="tr-form-grid">
        <label className="tr-field tr-field-wide">
          <span>Goals — what will be accomplished and when?</span>
          <textarea rows={4} value={fields.marketingGoals} onChange={e => setField('marketingGoals', e.target.value)} placeholder="What will be accomplished, and by when?" />
        </label>
        <label className="tr-field tr-field-wide">
          <span>Strategies — how will you reach your goals?</span>
          <textarea rows={4} value={fields.marketingStrategies} onChange={e => setField('marketingStrategies', e.target.value)} placeholder="How will you reach the goals above?" />
        </label>
        <label className="tr-field tr-field-wide">
          <span>Tactics — what will change and when?</span>
          <textarea rows={4} value={fields.marketingTactics} onChange={e => setField('marketingTactics', e.target.value)} placeholder="What will change, and when?" />
        </label>
      </div>
    </>
  );
}
