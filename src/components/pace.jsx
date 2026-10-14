// Pace widgets: this week's strip, the 6-week trend, personal bests and coaching notes.
import { useEffect, useState } from 'react';
import { computeStreaksAndBests, WEEKDAY_TARGET, WEEKEND_TARGET, WEEKLY_TOTAL_TARGET } from '../lib/pace.js';
import { fmtDisplayDate, shiftWeekStr } from '../lib/dates.js';
import { fetchCoachingNotes } from '../data/team.js';

// Read-only for the advisor — they can see what their manager left for the
// week they're currently viewing, but only a manager/admin can write one.
export function MyCoachingNotes({ userId, weekOf }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchCoachingNotes(userId, weekOf).then(rows => { setNotes(rows); setLoading(false); });
  }, [userId, weekOf]);

  if (loading || notes.length === 0) return null;

  return (
    <div className="tr-card tr-coaching-panel" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
      <h4 className="tr-h4">A note from your manager, for this week</h4>
      <div className="tr-notes-list">
        {notes.map(n => (
          <div key={n.id} className="tr-note-item">
            <div className="tr-note-meta">{n.author_name} · {new Date(n.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
            <div>{n.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PaceStrip({ groups, header }) {
  const total = groups.reduce((n, g) => n + g.count, 0);
  const target = groups.reduce((n, g) => n + g.option.target, 0);
  return (
    <div className="tr-card tr-pace">
      {header ? <div className="tr-pace-head">{header}<span className="tr-pace-total"><strong>{total}</strong> / {target} set</span></div> : null}
      <p className="tr-pace-hint">The {WEEKEND_TARGET} you schedule over the weekend for the week ahead, plus {WEEKDAY_TARGET} new ones each weekday.</p>
      <div className="tr-pace-grid">
        {groups.map(g => (
          <div className="tr-pace-group" key={g.option.value}>
            <div className="tr-pace-label">
              <span><span className="tr-hide-mobile">{g.option.batchLabel}</span><span className="tr-mobile-only">{g.option.category === 'weekend' ? 'Weekend' : g.option.label}</span></span>
              <span className="tr-mono tr-pace-count">{g.count}/{g.option.target}</span>
            </div>
            <div className="tr-pace-row">
              {Array.from({ length: Math.max(g.option.target, g.count) }).map((_, i) => (
                <span
                  key={i}
                  className={`tr-pill ${g.option.category === 'weekday' ? 'tr-pill-alt' : ''} ${i < g.count ? 'tr-pill-filled' : ''}`}
                  title={g.list[i] ? `${g.list[i].client} · ${fmtDisplayDate(g.list[i].appointmentDate)}` : 'Not yet logged'}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// A quick "was I better or worse than usual" view — computed entirely from
// already-loaded appointment data, no extra fetch needed.
export function PaceTrend({ appointments, currentWeekMonday, numWeeks = 6 }) {
  const weeks = [];
  for (let i = numWeeks - 1; i >= 0; i--) {
    const weekOf = shiftWeekStr(currentWeekMonday, -i);
    const count = appointments.filter(a => a.weekOf === weekOf && !a.isFollowUp).length;
    weeks.push({ weekOf, count });
  }
  const maxVal = Math.max(WEEKLY_TOTAL_TARGET, ...weeks.map(w => w.count), 1);
  return (
    <div className="tr-card tr-trend">
      <div className="tr-trend-head">
        <span className="tr-trend-title">Last {numWeeks} weeks</span>
        <span className="tr-trend-target-line">Target: {WEEKLY_TOTAL_TARGET}/week</span>
      </div>
      <div className="tr-trend-bars">
        {weeks.map((w, i) => {
          const pct = Math.max(4, Math.min(100, (w.count / maxVal) * 100));
          const isCurrent = i === weeks.length - 1;
          const onPace = w.count >= WEEKLY_TOTAL_TARGET;
          return (
            <div key={w.weekOf} className="tr-trend-col" title={`Week of ${fmtDisplayDate(w.weekOf)}: ${w.count}/${WEEKLY_TOTAL_TARGET}`}>
              <div className="tr-trend-bar-track">
                <div className={`tr-trend-bar ${onPace ? 'tr-trend-bar-good' : ''} ${isCurrent ? 'tr-trend-bar-current' : ''}`} style={{ height: `${pct}%` }} />
              </div>
              <span className="tr-trend-num">{w.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PersonalBests({ appointments }) {
  const { bestWeekCount, currentStreak, longestStreak } = computeStreaksAndBests(appointments);
  if (bestWeekCount === 0) return null;
  return (
    <div className="tr-card tr-bests">
      <div className="tr-bests-stat">
        <span className="tr-dash-num">{bestWeekCount}</span>
        <span className="tr-dash-label">best week ever</span>
      </div>
      <div className="tr-bests-stat">
        <span className="tr-dash-num">{currentStreak}</span>
        <span className="tr-dash-label">week streak{currentStreak !== 1 ? 's' : ''} on pace</span>
      </div>
      <div className="tr-bests-stat">
        <span className="tr-dash-num">{longestStreak}</span>
        <span className="tr-dash-label">longest streak ever</span>
      </div>
    </div>
  );
}
