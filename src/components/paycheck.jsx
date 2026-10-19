// Today → Your paycheck: this month's estimated commission from your own
// sales, against the monthly income goal in your Business Plan.
import { Wallet } from 'lucide-react';
import { computePaycheck } from '../lib/paycheck.js';
import { todayStr } from '../lib/dates.js';

const money = n => `$${Math.round(Math.max(0, n || 0)).toLocaleString('en-US')}`;

export function PaycheckCard({ user, appointments, plan, onNavigate }) {
  const today = todayStr();
  const p = computePaycheck({ appointments: appointments.filter(a => a.userId === user.id), tierKey: user.hierarchyTier, plan, today });
  const monthName = new Date(`${today}T12:00:00`).toLocaleDateString('en-US', { month: 'long' });
  const earning = p.rate > 0;

  return (
    <div className="tr-card tr-pay">
      <div className="tr-row-head">
        <h3 className="tr-h3" style={{ margin: 0 }}><Wallet size={16} aria-hidden="true" /> Your paycheck</h3>
        <span className="tr-pay-month">{monthName} · estimate</span>
      </div>

      {earning ? (
        <>
          <div className="tr-ov-big">{money(p.est)}</div>
          <p className="tr-pay-line">
            {p.sales === 0 ? 'No sales logged this month yet.' : `${p.sales} sale${p.sales === 1 ? '' : 's'} · ${money(p.premium)} target premium × ${p.rate}% (${p.tier.name})`}
          </p>
          {p.goal ? (
            <>
              <div className="tr-ov-bar" aria-hidden="true"><div className="tr-ov-bar-fill tr-ov-bar-fill-alt" style={{ width: `${p.goalPct}%` }} /></div>
              <p className="tr-pay-line">
                {p.est >= p.goal
                  ? <><strong>Goal hit!</strong> {money(p.est - p.goal)} over your {money(p.goal)} monthly goal.</>
                  : <><strong>{p.goalPct}%</strong> of your {money(p.goal)} monthly goal · {money(p.goal - p.est)} to go{p.daysLeft > 0 ? ` in ${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'}` : ''}</>}
              </p>
            </>
          ) : (
            <button type="button" className="tr-ov-link" onClick={() => onNavigate('bizplan')}>Set your income goal in Business Plan →</button>
          )}
          <ul className="tr-pay-facts">
            {p.issuedEst > 0 && p.issuedEst < p.est ? <li>{money(p.issuedEst)} of it is from policies already issued</li> : null}
            {p.lastEst > 0 ? <li>Last month: {money(p.lastEst)}</li> : null}
            {p.next && p.premium > 0 ? <li className="tr-pay-next">At {p.next.name} ({p.next.commission}%), this month would be {money(p.nextEst)}</li> : null}
            {p.missingPremium > 0 ? <li className="tr-pay-warn">{p.missingPremium} sale{p.missingPremium === 1 ? ' has' : 's have'} no target premium yet. Add it under Sold Premium.</li> : null}
          </ul>
        </>
      ) : (
        <>
          <div className="tr-ov-big">{money(p.premium)}</div>
          <p className="tr-pay-line">target premium on your sales this month{p.sales ? ` (${p.sales})` : ''}.</p>
          <p className="tr-pay-line">
            {p.next && p.premium > 0
              ? <>At {p.next.name} ({p.next.commission}%), that would pay about <strong>{money(p.nextEst)}</strong>. Get licensed and promoted to start earning on your sales.</>
              : <>Once you're licensed and promoted to Field Associate, you earn {p.next ? `${p.next.commission}%` : 'commission'} of the target premium on every sale. This card shows it as you go.</>}
          </p>
          {p.goal ? <p className="tr-pay-line">Your monthly goal: {money(p.goal)}.</p> : null}
        </>
      )}
      <p className="tr-pay-foot">Target premium × your commission level. Splits, advances and chargebacks aren't included.</p>
    </div>
  );
}
