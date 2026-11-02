// Splitting a sale's premium with whoever else was on the appointment (the
// presenter, or the advisor who set it when you presented). Used by the
// "How did it go?" window and "Log them all". See lib/credit.js and
// migration-split-premium.sql.
import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { fetchHierarchyPeopleShared } from '../data/team.js';
import { hasWritingNumber, SPLIT_STEPS } from '../lib/credit.js';
import { fmtCurrency } from '../lib/format.js';
import { PillChoice } from './ui.jsx';

const first = n => (n || '').trim().split(/\s+/)[0] || n;
const YES_NO = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];

// Who you'd split this sale with, and whether you can. presenter: you
// presented it (someone else set it). Returns:
//   { applies: false }                 no one else presented it
//   { applies: true, loading: true }   still checking
//   { applies: true, eligible, otherName, otherFirst, missing: ['you', 'Dana'] }
export function useSplitPartner(appointment, presenter) {
  const [people, setPeople] = useState(null);
  const applies = !!(appointment && appointment.splitReady && appointment.presenterId && appointment.presenterId !== appointment.userId);
  useEffect(() => {
    if (!applies) return undefined;
    let alive = true;
    fetchHierarchyPeopleShared().then(list => { if (alive) setPeople(list || []); }).catch(() => { if (alive) setPeople([]); });
    return () => { alive = false; };
  }, [applies]);
  if (!applies) return { applies: false };
  if (!people) return { applies: true, loading: true };
  const owner = people.find(p => p.id === appointment.userId);
  const pres = people.find(p => p.id === appointment.presenterId);
  const me = presenter ? pres : owner;
  const other = presenter ? owner : pres;
  const otherName = (other && other.display_name) || (presenter ? appointment.setByName : appointment.presenter) || 'them';
  const missing = [!hasWritingNumber(me) && 'you', !hasWritingNumber(other) && first(otherName)].filter(Boolean);
  return { applies: true, eligible: missing.length === 0, otherName, otherFirst: first(otherName), missing };
}

// The starting choice: the split already saved, or 50/50 for a new sale.
// Returns { on, mine } where mine is your share.
export function initialSplit(appointment, presenter) {
  const saved = appointment && appointment.splitUserId && Number(appointment.splitPercent) > 0;
  if (saved) {
    const theirs = Number(appointment.splitPercent); // the presenter's share
    return { on: true, mine: presenter ? theirs : 100 - theirs };
  }
  // Only sales logged from now on start split; an old one stays as it was.
  return { on: !appointment || !appointment.officiallySold ? null : false, mine: 50 };
}

// What to save: undefined leaves the split as it is, null means none, or
// { userId, percent } where percent is the presenter's share.
export function splitToSave(appointment, presenter, info, on, mine, sold) {
  if (!appointment || !appointment.splitReady) return undefined;
  if (!sold) return null;
  if (!info.applies) return null;
  if (info.loading) return undefined;
  if (!info.eligible) return appointment.splitUserId ? undefined : null;
  const yes = on === null ? true : on;
  if (!yes) return null;
  return { userId: appointment.presenterId, percent: presenter ? mine : 100 - mine };
}

// The question and the share picker. premium: what's typed, for the dollars.
export function SplitControl({ info, on, onChange, mine, onMine, premium }) {
  if (!info.applies || info.loading) return null;
  if (!info.eligible) {
    const what = info.missing.length === 2 ? 'you both need an F&G writing number in PaceLedger'
      : info.missing[0] === 'you' ? 'add your F&G writing number in PaceLedger (Your account)'
      : `${info.missing[0]} needs to add their F&G writing number in PaceLedger`;
    return (
      <p className="tr-split-note">
        To split the premium with {info.otherFirst}, {what}. Only licensed, appointed agents can share a commission.
      </p>
    );
  }
  const yes = on === null ? true : on;
  const amount = Number(premium) > 0 ? Number(premium) : 0;
  const money = pct => (amount ? fmtCurrency(Math.round(amount * pct) / 100) : '');
  const step = d => {
    const i = SPLIT_STEPS.indexOf(mine);
    const next = SPLIT_STEPS[Math.min(SPLIT_STEPS.length - 1, Math.max(0, (i < 0 ? 4 : i) + d))];
    onMine(next);
  };
  return (
    <div className="tr-split">
      <div className="tr-field"><span>Split the premium with {info.otherName}?</span>
        <PillChoice options={YES_NO} value={yes ? 'yes' : 'no'} onChange={v => onChange(v === 'yes')} />
      </div>
      {yes ? (
        <>
          <div className="tr-split-row" role="group" aria-label="How it's split">
            <button type="button" className="tr-icon-btn" onClick={() => step(-1)} disabled={mine <= SPLIT_STEPS[0]} aria-label="Less for you"><Minus size={15} /></button>
            <div className="tr-split-side"><span>You</span><strong>{mine}%</strong>{amount ? <em>{money(mine)}</em> : null}</div>
            <div className="tr-split-side"><span>{info.otherFirst}</span><strong>{100 - mine}%</strong>{amount ? <em>{money(100 - mine)}</em> : null}</div>
            <button type="button" className="tr-icon-btn" onClick={() => step(1)} disabled={mine >= SPLIT_STEPS[SPLIT_STEPS.length - 1]} aria-label="More for you"><Plus size={15} /></button>
          </div>
          <p className="tr-split-hint">Use the same split as the F&amp;G application. The sale counts for both of you; the premium is shared.</p>
        </>
      ) : null}
    </div>
  );
}
