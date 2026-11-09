import { money, ratePct, levelName, clientName, summarize, byPolicy, fromWhom, monthRange } from '../../src/lib/commissions.js';
let fails = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fails++; console.log('FAIL', m); } };
ok(money(134.672) === '$134.67' && money(-28.8) === '−$28.80' && money(0) === '$0.00', 'money, negatives with a minus');
ok(ratePct(4000) === '40%' && ratePct(250) === '2.5%' && ratePct(0) === '0%' && ratePct(null) === '', 'rate: hundredths of a percent');
ok(levelName('A') === 'A · Unlicensed Associate' && levelName('sfd') === 'SFD · Senior Field Director' && levelName('GEN3') === 'Generation 3 override', 'level names');
ok(clientName('VENTURA, GERARDO') === 'Gerardo Ventura' && clientName("O'NEIL, MARY-ANN") === "Mary-Ann O'Neil" && clientName('') === 'Client not given', 'client names');
const L = (id, o) => ({ record_id: id, event_id: id.replace(/~[^~]*$/, ''), level: id.split('~').pop(), agent_code: 'me', user_id: 'u1', writer_code: 'me', writer_user_id: 'u1', amount: 10, rate: 1000, policy_number: 'P1', insured_name: 'DOE, JANE', status: 'APPROVED', ...o });
const lines = [
  L('e1~A', { amount: 40, rate: 4000, status: 'PROCESSED', paid_on: '2026-10-13', disbursement_record_id: 'd1' }),
  L('e1~SA', { amount: 10, status: 'PROCESSED', paid_on: '2026-10-13', disbursement_record_id: 'd1' }),
  L('e2~A', { amount: 40, rate: 4000 }),
  L('e3~A', { amount: 40, rate: 4000 }),
  L('e4~FD', { amount: 15, rate: 1500, writer_code: 'kid', writer_user_id: 'u2', policy_number: 'P2', insured_name: 'ROE, RAY' }),
  L('e5~A', { amount: -40, rate: 4000, policy_number: 'P3', insured_name: 'POE, AL' }),
  L('e6~A', { amount: 5, paid_on: '2026-10-20', disbursement_record_id: 'd9', status: 'PROCESSED' }),
];
const s = summarize({ lines, payouts: [{ record_id: 'd1', disbursed_date: '2026-10-13', amount: '50' }] }, monthRange(new Date(2026, 9, 5)));
ok(s.paid === 55 && s.coming === 55 && s.chargebacks === -40, `October: paid 55, coming 55, chargebacks -40 (${s.paid}, ${s.coming}, ${s.chargebacks})`);
ok(s.payouts.length === 2 && s.payouts[0].record_id === 'd9' && s.payouts[0].amount === 5 && s.payouts[1].amount === 50, 'a line paid before its payout arrived still shows, newest first');
const g = byPolicy(s.comingLines);
const p1 = g.find(x => x.policy === 'P1');
ok(p1 && p1.lines.length === 1 && p1.lines[0].count === 2 && p1.lines[0].amount === 80, 'two monthly premiums at the same level: one row, ×2');
ok(g.find(x => x.policy === 'P3').total === -40, 'a chargeback group is negative');
ok(g[0].policy === 'P1', 'biggest first');
const names = { u2: 'Jordan Ellis' };
ok(fromWhom(lines[0], 'u1', id => names[id]) === 'Your sale' && fromWhom(lines[0], 'boss', id => names[id]) === 'Their sale', 'your sale / their sale');
ok(fromWhom(lines[4], 'u1', id => names[id]) === "From Jordan Ellis's sale", "an override names whose sale");
ok(fromWhom({ ...lines[4], writer_user_id: null }, 'u1', () => '') === 'From a team sale', 'unknown writer');
const nov = summarize({ lines, payouts: [] }, monthRange(new Date(2026, 10, 2)));
ok(nov.paid === 0 && nov.coming === 55 && nov.payouts.length === 0, 'November: nothing paid, the same still coming');
console.log(fails ? `${fails} FAILED` : 'ALL COMMISSION UNIT TESTS PASSED');
process.exit(fails ? 1 : 0);
