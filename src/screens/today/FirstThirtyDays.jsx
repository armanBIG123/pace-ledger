// Today's First 30 days card for new advisors: the day's step and the checklist.
import { useState } from 'react';
import { Award, Check, ChevronDown, ChevronRight, ChevronUp, X } from 'lucide-react';
import { ONBOARDING_DAYS, ONBOARDING_WEEKS, weekForDay } from '../../onboarding.js';
import { ProgressRing } from '../../components/ui.jsx';

// The checklist card. `result` comes from computeOnboarding().
export function FirstThirtyDays({ result, day, onGo, onHide }) {
  const currentWeek = weekForDay(day || 1);
  const [showAll, setShowAll] = useState(() => !(window.matchMedia && window.matchMedia('(max-width: 640px)').matches));
  const next = result.next;
  const nextWeek = next ? ONBOARDING_WEEKS.find(w => w.key === next.week) : null;
  const behind = next && day && nextWeek && day > nextWeek.days[1];

  if (result.allDone) {
    return (
      <section className="tr-card tr-f30 tr-f30-complete" aria-label="First 30 days">
        <div className="tr-f30-head">
          <ProgressRing done={result.total} total={result.total}><Award size={22} /></ProgressRing>
          <div className="tr-f30-head-main">
            <div className="tr-f30-kicker">Your first 30 days</div>
            <h3 className="tr-f30-title">Checklist complete. Well done.</h3>
            <p className="tr-f30-why">You've set up your plan, built your list, booked and held appointments, and got your first result. From here, Today keeps you on pace every day.</p>
          </div>
          <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onHide}>Hide this</button>
        </div>
      </section>
    );
  }

  return (
    <section className="tr-card tr-f30" aria-label="First 30 days">
      <div className="tr-f30-head">
        <ProgressRing done={result.doneCount} total={result.total}>
          <strong>{result.doneCount}</strong><span>of {result.total}</span>
        </ProgressRing>
        <div className="tr-f30-head-main">
          <div className="tr-f30-kicker">
            First 30 days{day ? <> · <span className="tr-f30-day">Day {Math.min(day, 99)}{day <= ONBOARDING_DAYS ? ` of ${ONBOARDING_DAYS}` : ''}</span></> : null}
            {behind ? <span className="tr-status tr-status-amber tr-f30-flag">Catch up</span> : null}
          </div>
          <h3 className="tr-f30-title">Next: {next.title}{next.target ? <span className="tr-f30-count"> · {next.n} of {next.target}</span> : null}</h3>
          <p className="tr-f30-why">{next.why}</p>
          {next.target ? (
            <div className="tr-ov-bar tr-f30-stepbar"><div className="tr-ov-bar-fill" style={{ width: `${Math.round((next.n / next.target) * 100)}%` }} /></div>
          ) : null}
          <div className="tr-f30-actions">
            <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={() => onGo(next)}>{next.cta} <ChevronRight size={14} /></button>
            <button type="button" className="tr-f30-toggle" onClick={() => setShowAll(s => !s)} aria-expanded={showAll}>
              {showAll ? 'Hide all steps' : 'See all steps'} {showAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>
        <button type="button" className="tr-icon-btn tr-f30-close" onClick={onHide} aria-label="Hide the First 30 days checklist" title="Hide (you can turn it back on in Your account)"><X size={16} /></button>
      </div>

      {showAll && (
        <div className="tr-f30-weeks">
          {ONBOARDING_WEEKS.map(w => {
            const steps = result.steps.filter(s => s.week === w.key);
            const doneHere = steps.filter(s => s.done).length;
            const isNow = w.key === currentWeek.key;
            return (
              <div key={w.key} className={`tr-f30-week ${isNow ? 'tr-f30-week-now' : ''}`}>
                <div className="tr-f30-week-head">
                  <span className="tr-f30-week-label">{w.label}{isNow ? <span className="tr-f30-here">You're here</span> : null}</span>
                  <span className="tr-f30-week-title">{w.title}</span>
                  <span className="tr-f30-week-meta">Days {w.days[0]}–{w.days[1]} · {doneHere}/{steps.length} done</span>
                </div>
                <ul className="tr-f30-steps">
                  {steps.map(s => {
                    const isNext = next && s.key === next.key;
                    return (
                      <li key={s.key}>
                        <button type="button" className={`tr-f30-step ${s.done ? 'tr-f30-step-done' : ''} ${isNext ? 'tr-f30-step-next' : ''}`} onClick={() => onGo(s)}>
                          <span className="tr-f30-node" aria-hidden="true">{s.done ? <Check size={12} strokeWidth={3} /> : null}</span>
                          <span className="tr-f30-step-title">{s.title}<span className="tr-sr-only">{s.done ? ' (done)' : ''}</span></span>
                          {s.target && !s.done ? <span className="tr-f30-step-count">{s.n}/{s.target}</span> : null}
                          <ChevronRight size={14} className="tr-f30-step-go" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
      <p className="tr-f30-foot">Every step checks itself off as you use PaceLedger. Your manager can see your progress, so they know when to help.</p>
    </section>
  );
}
