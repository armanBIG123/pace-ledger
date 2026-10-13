// Milestones: how far someone is toward their next level, the requirement
// furthest behind ("biggest gap") in plain words, and the commission jump.
// Built on computeTierProgress results; nothing here is stored.
import { HIERARCHY_TIERS, HIERARCHY_TIER_WINDOW_LABELS, nextTierAfter, tierIndex } from '../hierarchy.js';

export const tierInfo = key => HIERARCHY_TIERS.find(t => t.key === key) || null;

// $850, $6.2k, $21k, $1.3M
export function shortMoney(n) {
  const v = Math.max(0, Math.round(Number(n) || 0));
  if (v >= 1e6) return `$${(v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(v >= 100000 || v % 1000 === 0 ? 0 : 1).replace(/\.0$/, '')}k`;
  return `$${v}`;
}
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 0..1 for one requirement. Two-months-in-a-row requirements count the best
// pair of neighbouring months so far.
export function requirementFraction(req) {
  if (req.met) return 1;
  if (req.kind === 'status') return 0;
  if (req.kind === 'count' || req.kind === 'money') return req.target > 0 ? Math.max(0, Math.min(1, (req.current || 0) / req.target)) : 1;
  if (req.kind === 'money-consecutive') {
    const part = m => (m && m.applicable !== false && req.target > 0 ? Math.min(1, m.sum / req.target) : 0);
    let best = 0;
    for (let i = 0; i < req.months.length - 1; i++) best = Math.max(best, (part(req.months[i]) + part(req.months[i + 1])) / 2);
    return best;
  }
  return 0;
}

// Short label and value for one requirement, for compact cards.
export function requirementView(req) {
  const frac = requirementFraction(req);
  const base = { met: !!req.met, frac, pct: Math.round(frac * 100) };
  switch (req.type) {
    case 'licensed': return { ...base, label: 'Licensed', value: req.met ? 'Done' : 'Not yet' };
    case 'observationSales': return { ...base, label: 'Observation sales (30 days)', value: `${req.current} of ${req.target}` };
    case 'directRecruits': return { ...base, label: 'Direct recruits', value: `${req.current} of ${req.target}` };
    case 'directTierCount': {
      const t = tierInfo(req.tier);
      return { ...base, label: `Direct ${t ? t.name : req.tier}s`, value: `${req.current} of ${req.target}` };
    }
    case 'personalPremium':
    case 'baseShopPremium': {
      const label = req.type === 'personalPremium' ? 'Personal premium' : 'Base shop premium';
      if (req.kind === 'money') return { ...base, label: `${label} (30 days)`, value: `${shortMoney(req.current)} of ${shortMoney(req.target)}` };
      const recent = req.months.slice(-2).map(m => ({ label: MONTHS[m.month], value: m.applicable === false ? '—' : shortMoney(m.sum), met: m.met, current: m.isCurrent }));
      return { ...base, label: `${label}, 2 months in a row`, value: `${shortMoney(req.target)} each`, months: recent };
    }
    default: return { ...base, label: req.label || 'Requirement', value: req.met ? 'Done' : 'Not yet' };
  }
}

// The biggest gap, in plain words. `ctx` can add detail:
//   licensing: licensingStatus() for this person (for "Get licensed")
//   closestFor(tierKey): { person, pct, sameNext } for "build N direct X"
function gapWords(req, ctx) {
  const missing = Math.max(0, (req.target || 0) - (req.current || 0));
  switch (req.type) {
    case 'licensed': {
      const lic = ctx.licensing;
      return { text: 'Get licensed.', detail: lic && lic.next ? `Next step: ${lic.next.title.charAt(0).toLowerCase()}${lic.next.title.slice(1)}.` : '' };
    }
    case 'observationSales':
      return { text: `${plural(missing, 'more observation sale')}.`, detail: 'Sales closed while watching as a trainee, in the last 30 days.' };
    case 'directRecruits':
      return { text: `${plural(missing, 'more direct recruit')}.`, detail: '' };
    case 'directTierCount': {
      const close = ctx.closestFor ? ctx.closestFor(req.tier) : null;
      let detail = `Help people who report directly reach ${req.tier}.`;
      if (close && close.person) {
        detail = close.sameNext && close.pct > 0
          ? `Closest: ${close.person.display_name} (${close.person.hierarchy_tier}), ${close.pct}% of the way to ${req.tier}.`
          : `Closest: ${close.person.display_name}${close.person.hierarchy_tier ? ` (${close.person.hierarchy_tier})` : ''}.`;
      } else if (close) {
        detail = `No one who reports directly is close to ${req.tier} yet, so recruiting comes first.`;
      }
      return { text: `${missing} more direct ${req.tier}${missing === 1 ? '' : 's'}.`, detail };
    }
    case 'personalPremium':
    case 'baseShopPremium': {
      const what = req.type === 'personalPremium' ? 'personal premium' : 'base shop premium';
      const scope = req.type === 'personalPremium' ? 'Personal sales' : 'Personal sales plus the whole team\'s';
      if (req.kind === 'money') return { text: `${shortMoney(missing)} more ${what}.`, detail: `${scope}, last 30 days.` };
      const months = req.months || [];
      const cur = months[months.length - 1], prev = months[months.length - 2];
      if (cur && cur.met) return { text: `Hit ${shortMoney(req.target)} ${what} again next month.`, detail: 'This month is already there.' };
      const left = cur ? Math.max(0, req.target - cur.sum) : req.target;
      return {
        text: `${shortMoney(left)} more ${what} this month.`,
        detail: prev && prev.met ? 'Last month hit it, so this month makes 2 in a row.' : 'Then hold it next month too: it needs 2 months in a row.',
      };
    }
    default: return { text: req.label || 'One requirement left.', detail: '' };
  }
}

// Overall % toward the next level: the average of each requirement's progress.
export function progressPct(progress) {
  if (!progress || !progress.results.length) return null;
  if (progress.allMet) return 100;
  const avg = progress.results.reduce((s, r) => s + requirementFraction(r), 0) / progress.results.length;
  return Math.min(99, Math.round(avg * 100));
}

// Everything a milestone card needs for one person.
//   state: 'unset' (no level), 'top' (nothing above), 'unknown' (no
//   progress available), 'ready' or 'working'
export function milestoneSummary(person, progress, ctx = {}) {
  const tier = tierInfo(person && person.hierarchy_tier);
  if (!tier) return { state: 'unset' };
  if (!progress) return { state: nextTierAfter(tier.key) ? 'unknown' : 'top', tier };
  const items = progress.results.map(req => ({ ...requirementView(req), req }));
  const behind = items.filter(i => !i.met).sort((a, b) => a.frac - b.frac)[0] || null;
  if (behind) behind.gap = true;
  return {
    state: progress.allMet ? 'ready' : 'working',
    tier,
    next: progress.nextTier,
    pct: progressPct(progress),
    items,
    gap: behind ? gapWords(behind.req, ctx) : null,
    window: HIERARCHY_TIER_WINDOW_LABELS[progress.nextTier.window] || '',
  };
}

// For "build N direct X": of the people who report directly to someone and
// are below X, who is closest? Highest level first, then furthest along.
// pctOf(id) gives that person's % toward their own next level.
export function closestDirect(directs, targetTier, pctOf) {
  const ti = tierIndex(targetTier);
  const below = directs.filter(p => { const i = tierIndex(p.hierarchy_tier); return i < ti; });
  if (!below.length) return { person: null };
  const ranked = below.map(p => ({ p, i: tierIndex(p.hierarchy_tier), pct: pctOf ? pctOf(p.id) : null }))
    .sort((a, b) => b.i - a.i || (b.pct ?? -1) - (a.pct ?? -1) || (a.p.display_name || '').localeCompare(b.p.display_name || ''));
  const top = ranked[0];
  return { person: top.p, pct: top.pct, sameNext: top.i === ti - 1 };
}

// "Ready", "52%", or "" for lists.
export function shortProgress(summary) {
  if (!summary) return '';
  if (summary.state === 'ready') return 'Ready';
  if (summary.state === 'working') return `${summary.pct}%`;
  return '';
}
