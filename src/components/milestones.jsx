// Shared milestone pieces: the "next level" bar with the commission jump, the
// compact requirement list, and the biggest-gap callout.
import React from 'react';
import { ArrowRight, Award, Target } from 'lucide-react';
import { BodyIcon } from './CelestialBody.jsx';

export function NextLevel({ summary }) {
  if (!summary || (summary.state !== 'working' && summary.state !== 'ready')) return null;
  const { tier, next, pct, state } = summary;
  return (
    <div className="tr-ms-next">
      <div className="tr-label">Next level</div>
      <div className="tr-ms-nextrow">
        <BodyIcon tier={tier.key} size={24} />
        <ArrowRight size={14} aria-hidden="true" />
        <BodyIcon tier={next.key} size={26} />
        <strong>{next.name}</strong>
      </div>
      <div className="tr-ms-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${pct}% of the way to ${next.name}`}>
        <i className={state === 'ready' ? 'tr-ms-bar-done' : ''} style={{ width: `${Math.max(pct, pct > 0 ? 3 : 0)}%` }} />
      </div>
      <div className="tr-ms-meta">
        {state === 'ready' ? 'Every requirement met' : `${pct}% of the way`} · {tier.commission}% → {next.commission}% commission
      </div>
    </div>
  );
}

export function RequirementList({ summary }) {
  if (!summary || !summary.items) return null;
  return (
    <div className="tr-ms-reqs">
      {summary.items.map((it, i) => (
        <div key={i} className={`tr-ms-req ${it.gap ? 'tr-ms-req-gap' : ''} ${it.met ? 'tr-ms-req-met' : ''}`}>
          <div className="tr-ms-req-top"><span>{it.label}</span><strong>{it.met && it.req.kind === 'status' ? '✓ Done' : it.value}</strong></div>
          {it.months ? (
            <div className="tr-ms-months">
              {it.months.map((m, k) => <span key={k} className={m.met ? 'tr-ms-month-met' : ''}>{m.label}{m.current ? ' so far' : ''} {m.value}{m.met ? ' ✓' : ''}</span>)}
            </div>
          ) : (
            <div className="tr-ms-bar tr-ms-bar-sm"><i className={it.met ? 'tr-ms-bar-done' : ''} style={{ width: `${Math.max(it.pct, it.pct > 0 ? 3 : 0)}%` }} /></div>
          )}
        </div>
      ))}
      {summary.window ? <div className="tr-ms-window">{summary.window}</div> : null}
    </div>
  );
}

export function GapCallout({ summary }) {
  if (!summary) return null;
  if (summary.state === 'ready') {
    return <div className="tr-ms-gap tr-ms-gap-ready"><Award size={15} aria-hidden="true" /><div><strong>Ready for {summary.next.name}.</strong> Every requirement is met.</div></div>;
  }
  if (!summary.gap) return null;
  return (
    <div className="tr-ms-gap">
      <Target size={15} aria-hidden="true" />
      <div><strong>Biggest gap: {summary.gap.text}</strong>{summary.gap.detail ? ` ${summary.gap.detail}` : ''}</div>
    </div>
  );
}
