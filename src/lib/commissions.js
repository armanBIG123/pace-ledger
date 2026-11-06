// Commissions: words and sums for the screens (screens/Commissions.jsx).
// Lines come from the commission system as it sends them: rate is in
// hundredths of a percent (4000 = 40%), the level is A, FA ... EVC or
// GEN1 ... GEN6, and amounts can be negative (a chargeback).
import { HIERARCHY_TIERS } from '../hierarchy.js';

const n = v => Number(v) || 0;
export function money(v, { sign = false } = {}) {
  const x = Math.round(n(v) * 100) / 100;
  const s = Math.abs(x).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  return x < 0 ? `−${s}` : sign && x > 0 ? `+${s}` : s;
}
// 4000 -> "40%", 250 -> "2.5%".
export const ratePct = rate => (rate == null || rate === '' ? '' : `${Math.round(n(rate)) / 100}%`);

// "A" is the writing agent's own level (Unlicensed Associate in PaceLedger).
export function levelName(level) {
  const k = String(level || '').toUpperCase();
  const gen = k.match(/^GEN(\d+)$/);
  if (gen) return `Generation ${gen[1]} override`;
  const t = HIERARCHY_TIERS.find(x => x.key === (k === 'A' ? 'UA' : k));
  return t ? `${k} · ${t.name}` : k || 'Level not given';
}

// "VENTURA, GERARDO" -> "Gerardo Ventura".
export function clientName(s) {
  const raw = String(s || '').trim();
  if (!raw) return 'Client not given';
  const cap = w => w.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, m => m.toUpperCase());
  const [last, first] = raw.includes(',') ? raw.split(',').map(x => x.trim()) : [raw, ''];
  return cap(first ? `${first} ${last}` : last);
}

export const isPaid = l => !!l.paid_on || String(l.status || '').toUpperCase() === 'PROCESSED';
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function monthRange(d) {
  const a = new Date(d.getFullYear(), d.getMonth(), 1), b = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: iso(a), to: iso(b), label: a.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
}

// One person's month: paid (lines paid out in the month), coming (approved,
// not paid yet, any month), chargebacks (negative lines paid in the month
// or still to come), the month's payouts and the lines waiting.
export function summarize({ lines = [], payouts = [] }, { from, to }) {
  const inMonth = l => l.paid_on && l.paid_on >= from && l.paid_on <= to;
  const paidLines = lines.filter(inMonth);
  const coming = lines.filter(l => !isPaid(l));
  const months = payouts.filter(p => p.disbursed_date && p.disbursed_date >= from && p.disbursed_date <= to);
  // Lines paid in the month whose payout hasn't arrived yet still show,
  // under a payout made from their own id.
  const known = new Set(months.map(p => p.record_id));
  const orphanIds = [...new Set(paidLines.map(l => l.disbursement_record_id).filter(id => id && !known.has(id)))];
  orphanIds.forEach(id => months.push({ record_id: id, disbursed_date: (paidLines.find(l => l.disbursement_record_id === id) || {}).paid_on, amount: null }));
  months.sort((a, b) => String(b.disbursed_date).localeCompare(String(a.disbursed_date)));
  const byPayout = new Map(months.map(p => [p.record_id, paidLines.filter(l => l.disbursement_record_id === p.record_id)]));
  return {
    paid: paidLines.reduce((s, l) => s + n(l.amount), 0),
    coming: coming.reduce((s, l) => s + n(l.amount), 0),
    chargebacks: [...paidLines, ...coming].filter(l => n(l.amount) < 0).reduce((s, l) => s + n(l.amount), 0),
    payouts: months.map(p => ({ ...p, amount: p.amount == null ? byPayout.get(p.record_id).reduce((s, l) => s + n(l.amount), 0) : n(p.amount), lines: byPayout.get(p.record_id) })),
    comingLines: coming,
    hasAny: lines.length > 0,
  };
}

// Lines grouped by client and policy, biggest first, for a payout or the
// waiting list: [{ key, client, policy, carrier, total, lines }].
export function byPolicy(lines) {
  const m = new Map();
  lines.forEach(l => {
    const key = `${l.policy_number || ''}|${l.insured_name || ''}`;
    if (!m.has(key)) m.set(key, { key, client: clientName(l.insured_name), policy: l.policy_number || '', carrier: l.carrier || '', total: 0, lines: [] });
    const g = m.get(key);
    g.total += n(l.amount);
    g.lines.push(l);
  });
  const order = ['A', 'FA', 'SA', 'AD', 'FD', 'SFD', 'DFD', 'EFD', 'FVC', 'EVC'];
  const rank = lv => { const i = order.indexOf(String(lv || '').toUpperCase()); return i >= 0 ? i : 20 + (parseInt(String(lv).replace(/\D/g, ''), 10) || 0); };
  m.forEach(g => {
    // A policy paid every month repeats each level: one row per level, rate
    // and sale, with how many premiums it covers (chargebacks kept apart).
    const rows = new Map();
    g.lines.forEach(l => {
      const k = [String(l.level || '').toUpperCase(), l.writer_code || '', n(l.rate), n(l.amount) < 0 ? '-' : '+'].join('|');
      if (!rows.has(k)) rows.set(k, { ...l, amount: 0, count: 0, record_ids: [] });
      const r = rows.get(k);
      r.amount += n(l.amount); r.count += 1; r.record_ids.push(l.record_id);
    });
    // Their own sale first, then by level.
    g.lines = [...rows.values()].sort((a, b) => (a.writer_code === a.agent_code ? 0 : 1) - (b.writer_code === b.agent_code ? 0 : 1)
      || String(a.writer_code || '').localeCompare(String(b.writer_code || '')) || rank(a.level) - rank(b.level));
    g.count = g.lines.reduce((s, r) => s + r.count, 0);
  });
  return [...m.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

// Whose sale a line came from, in words, for the person it pays.
export function fromWhom(l, viewerId, nameOf) {
  if (!l.writer_code) return '';
  if (l.writer_user_id && l.writer_user_id === l.user_id) return l.user_id === viewerId ? 'Your sale' : 'Their sale';
  const who = l.writer_user_id ? nameOf(l.writer_user_id) : '';
  return who ? `From ${who}'s sale` : 'From a team sale';
}
