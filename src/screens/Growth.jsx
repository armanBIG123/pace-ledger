// Growth: everything about moving up, in one tab. My path (where you are and
// the next level), Paycheck & plan (this month's paycheck and the Business
// Plan behind the goal), Licensing, Incentives and the full promotion guide.
// On phones, Resources sits here too (it has its own tab on a computer).
import { useEffect, useState } from 'react';
import { fetchMyAppointments } from '../data/appointments.js';
import { fetchBusinessPlan, rowToBusinessPlanFields } from '../businessPlan.js';
import { PageHead, SkelBlock, useIsPhone } from '../components/ui.jsx';
import { PaycheckCard } from '../components/paycheck.jsx';
import { IncentivesBody, LicensingBody, MyProgressCard, TierLadder } from './Milestones.jsx';
import { BusinessPlanBody } from './BusinessPlan.jsx';
import { DocumentsBody } from './Documents.jsx';
import { hierarchyTierLabel, HIERARCHY_TIERS } from '../hierarchy.js';

export const GROWTH_VIEWS = [
  { key: 'path', label: 'My path' },
  { key: 'plan', label: 'Paycheck & plan' },
  { key: 'licensing', label: 'Licensing' },
  { key: 'incentives', label: 'Incentives' },
  { key: 'guide', label: 'Promotion guide' },
  { key: 'resources', label: 'Resources', phoneOnly: true },
];

// This month's paycheck, from your own sales and your Business Plan goal.
function Paycheck({ user, onPlan }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    Promise.all([fetchMyAppointments(user.id), fetchBusinessPlan(user.id)]).then(([appointments, row]) => {
      if (alive) setData({ appointments, plan: row && !row.loadError ? rowToBusinessPlanFields(row) : null });
    });
    return () => { alive = false; };
  }, [user.id]);
  if (!data) return <SkelBlock w="100%" h="180px" />;
  return <PaycheckCard user={user} appointments={data.appointments} plan={data.plan} onNavigate={onPlan} />;
}

export function GrowthBody({ user, view, onView }) {
  const isPhone = useIsPhone();
  const views = GROWTH_VIEWS.filter(v => !v.phoneOnly || isPhone);
  const current = views.some(v => v.key === view) ? view : 'path';
  const tier = HIERARCHY_TIERS.find(t => t.key === user.hierarchyTier);
  return (
    <div className="tr-growth">
      <PageHead title="Growth" sub="Where you are, where you're going, what it pays, and the plan to get there." />
      <div className="tr-flat">
        <div className="tr-appts-shell">
          <nav className="tr-appts-sidebar" aria-label="Growth">
            {views.map(v => (
              <button key={v.key} type="button" className={`tr-sidebar-item tr-sidebar-item-week ${current === v.key ? 'tr-sidebar-item-active' : ''}`}
                aria-current={current === v.key ? 'page' : undefined} onClick={() => onView(v.key)}>
                <span>{v.label}</span>
              </button>
            ))}
          </nav>
          <div className="tr-appts-main">
            {current === 'path' && (
              <>
                <MyProgressCard user={user} />
                <Paycheck user={user} onPlan={() => onView('plan')} />
              </>
            )}
            {current === 'plan' && (
              <>
                <Paycheck user={user} onPlan={() => onView('plan')} />
                <BusinessPlanBody user={user} />
              </>
            )}
            {current === 'licensing' && <LicensingBody user={user} />}
            {current === 'incentives' && <IncentivesBody />}
            {current === 'guide' && (
              <>
                <PageHead title="Promotion guide" sub={tier ? `Your level: ${hierarchyTierLabel(user.hierarchyTier)} · ${tier.commission}% commission` : "Your level hasn't been set yet. Ask a super admin to set it in Manage Team."} />
                <TierLadder currentTierKey={user.hierarchyTier} />
              </>
            )}
            {current === 'resources' && <DocumentsBody user={user} />}
          </div>
        </div>
      </div>
    </div>
  );
}
