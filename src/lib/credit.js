// Split sales (migration-split-premium.sql): a sale logged on an appointment
// someone else presented can be split between the advisor and the presenter,
// the same as on the carrier application. The sale counts as a sale for both
// of them; the target premium is shared. Pure functions.

// The presenter's share of a split sale (1-99), or 0 when it isn't split.
export function splitPercentOf(a) {
  const p = Number(a && a.splitPercent);
  return a && a.officiallySold && a.splitUserId && a.splitUserId !== a.userId && p > 0 && p < 100 ? p : 0;
}

// The rows to count sales and premium from. Every split sale becomes two,
// one for each person (userId), each with their share of the premium
// (targetPremium) and the sale itself. Everything else passes through as
// it is. Each row of a split keeps the real appointment as `source` (open
// that one, not the row), the whole premium as `fullPremium`, its share as
// `myPercent` and the other person as `splitWithId`. An appointment that
// shows up twice (say, in "mine" and "my team's") counts once. Safe to call
// on rows it already made.
export function creditRows(list) {
  const out = [];
  const seen = new Set();
  for (const a of list || []) {
    if (!a) continue;
    if (a.credited) { out.push(a); continue; }
    if (a.id != null) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
    }
    const p = splitPercentOf(a);
    if (!p) { out.push(a); continue; }
    const full = a.targetPremium;
    const has = Number(full) > 0;
    const share = pct => (has ? Math.round(Number(full) * pct) / 100 : full);
    out.push({ ...a, credited: true, source: a, fullPremium: full, myPercent: 100 - p, targetPremium: share(100 - p), splitWithId: a.splitUserId });
    // The presenter's row: not anyone's trainee appointment (observation
    // sales are counted from the real one).
    out.push({ ...a, credited: true, source: a, fullPremium: full, myPercent: p, targetPremium: share(p), userId: a.splitUserId, traineeId: '', splitWithId: a.userId, splitCopy: true });
  }
  return out;
}

// One person's sales and premium: their own sales plus the ones split with them.
export const creditedTo = (list, userId) => creditRows(list).filter(a => a.userId === userId);

// "Split 50/50 with Dana" for a row from creditRows, or ''.
export function splitLabel(a, nameOf) {
  if (!a || !a.credited || !a.myPercent) return '';
  const other = (nameOf && nameOf(a.splitWithId)) || 'their partner';
  return `Split ${a.myPercent}/${100 - a.myPercent} with ${other}`;
}

// The split choices in the outcome window: your share, in steps of 10.
export const SPLIT_STEPS = [10, 20, 30, 40, 50, 60, 70, 80, 90];
export const hasWritingNumber = p => !!(p && String(p.fg_writing_number || '').trim());
