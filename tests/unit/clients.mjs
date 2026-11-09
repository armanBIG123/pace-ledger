import { buildClients, clientMatches, filterCounts, inFilter, sortClients, whenOf } from '../../src/lib/clients.js';
let f = 0; const ok = (c, m) => { if (c) console.log('ok', m); else { f++; console.log('FAIL', m); } };
const ME = 'me', DANA = 'dana';
const day = n => { const d = new Date(Date.now() + n * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const iso = n => new Date(Date.now() + n * 864e5).toISOString();
let seq = 0;
const appt = (client, n, extra = {}) => ({ id: `a${++seq}`, userId: ME, client, appointmentDate: day(n), appointmentTime: '18:00', durationMinutes: 60, presenter: 'Dana Brooks', presenterId: DANA, createdAt: iso(n - 4), prospectId: '', followUpCompletedAt: null, outcome: '', status: '', officiallySold: false, officiallyRecruited: false, isFollowUp: false, ...extra });
const logged = (o, extra = {}) => ({ followUpCompletedAt: iso(-1), outcome: o, status: o === 'went_well' ? 'completed' : o === 'rescheduled' ? 'needs_reschedule' : o === 'no_show' ? 'not_completed' : 'completed', ...extra });
const pros = (id, first, last, extra = {}) => ({ id, userId: ME, firstName: first, lastName: last, createdAt: iso(-20), notes: '', source: '', phone: '', email: '', markedSold: false, markedRecruited: false, referredById: '', ...extra });

const prospects = [
  pros('p1', 'Priya', 'Shah', { phone: '(512) 555-0100', likesPeople: true }),
  pros('p2', 'Aisha', 'Brown'),
  pros('p3', 'Maria', 'Lopez'),
  pros('p4', 'Kevin', 'Tran'),
  pros('p5', 'Sam', 'Carter', { referredById: 'p6' }),
  pros('p6', 'Lee', 'Grant'),
  pros('p7', 'Marcus', 'Reed'),
  pros('p8', 'Tom', 'Becker'),
  pros('p9', 'Robert', 'Smith'),
  pros('p10', 'Nina', 'Hall'),
];
const appointments = [
  appt('Aisha Brown', -1, { prospectId: 'p2' }), // over, nothing logged
  appt('Maria Lopez', -6, { prospectId: 'p3', ...logged('went_well', { followUpScheduled: true }) }),
  appt('Maria Lopez', 3, { prospectId: 'p3', isFollowUp: true }),
  appt('Kevin Tran', 2), // not linked: matched by name
  appt('Sam Carter', -8, { prospectId: 'p5', ...logged('went_well', { followUpScheduled: true }) }),
  appt('Sam Carter', -2, { prospectId: 'p5', isFollowUp: true, ...logged('went_well'), officiallySold: true, targetPremium: 2400, splitUserId: DANA, splitPercent: 50 }),
  appt('Lee Grant', -40, { prospectId: 'p6', ...logged('went_well'), officiallySold: true, targetPremium: 1800, effectiveDate: day(-20), requirementsCompleted: true }),
  appt('Marcus Reed', -15, { prospectId: 'p7', ...logged('went_well') }),
  appt('Tom Becker', -10, { prospectId: 'p8', ...logged('not_interested') }),
  appt('Rob Smith', -12, logged('went_well')), // not on the list; maybe Robert Smith
  appt('Nina Hall', -5, { prospectId: 'p10', ...logged('rescheduled') }),
  appt('Walk In', -3, logged('no_show')),
];
const presenting = [
  { ...appt('Grace Kim', -1, { userId: 'riley', presenterId: ME, presenter: 'Me Advisor' }), presentingFor: true, setByName: 'Riley Stone' },
];
const notes = [{ id: 'n1', appointment_id: appointments[1].id, author_id: ME, note: 'Called, wants tax info', created_at: iso(-5) }];
const intakes = [{ id: 'c1', source_appointment_id: appointments[5].id, status: 'submitted', submitted_at: iso(-2), created_at: iso(-2) }];
const signups = [{ uplineId: ME, recruitName: 'Marcus Reed', signedUpAt: iso(-11), appointmentId: null }];
const names = { dana: 'Dana Brooks', me: 'Me Advisor', riley: 'Riley Stone' };
const list = buildClients({ prospects, appointments, presenting, notes, intakes, signups, userId: ME, nameOf: id => names[id] || '' });
const by = n => list.find(c => c.name === n);

ok(list.length === 13, `one profile per person (${list.length}: 10 on the list, Rob Smith, Walk In, Grace Kim)`);
ok(by('Priya Shah').stage === 'prospect' && by('Priya Shah').action.kind === 'book', 'Priya: prospect, Book');
ok(by('Aisha Brown').stage === 'outcome' && by('Aisha Brown').action.kind === 'log', 'Aisha: needs outcome, Log outcome');
ok(by('Maria Lopez').stage === 'followup' && /^Follow-up .* with Dana$/.test(by('Maria Lopez').next) && by('Maria Lopez').action.kind === 'change', `Maria: follow-up booked (${by('Maria Lopez').next} / ${by('Maria Lopez').sub})`);
ok(by('Kevin Tran').stage === 'booked' && by('Kevin Tran').appts.length === 1, 'Kevin: unlinked appointment matched by name, booked');
ok(by('Sam Carter').stage === 'pending' && by('Sam Carter').next === 'Requirements open', `Sam: sold, pending (${by('Sam Carter').sub})`);
const sam = by('Sam Carter');
ok(sam.policies[0].myPercent === 50 && sam.policies[0].partnerId === DANA && sam.policies[0].premium === 2400, 'Sam: split 50/50 with Dana on $2,400');
ok(sam.timeline.some(t => t.title === 'Follow-up: sold' && /split 50\/50 with Dana Brooks/.test(t.detail)), 'Sam timeline: sold with the split');
ok(sam.timeline.some(t => t.title === 'Client intake form received'), 'Sam timeline: intake received');
ok(sam.timeline[0].at >= sam.timeline[sam.timeline.length - 1].at, 'timeline is newest first');
ok(by('Lee Grant').stage === 'client' && by('Lee Grant').action.kind === 'referrals', 'Lee: issued policy, Ask for referrals');
ok(by('Lee Grant').referrals.includes('p:p5'), 'Lee referred Sam');
ok(sam.timeline.some(t => t.title === 'Added to your list' && /Referred by Lee Grant/.test(t.detail)), 'Sam: referred by Lee Grant');
ok(by('Marcus Reed').stage === 'recruited' && /^Joined your team/.test(by('Marcus Reed').next), 'Marcus: signed up, recruited');
ok(by('Tom Becker').stage === 'closed' && by('Tom Becker').action.label === 'Book again', 'Tom: not interested, Book again');
ok(by('Nina Hall').stage === 'followup' && by('Nina Hall').action.kind === 'change' && by('Nina Hall').next === 'Pick a new time', 'Nina: rescheduled, pick a new time');
ok(by('Walk In').stage === 'followup' && by('Walk In').next === 'Rebook: no show' && by('Walk In').virtual, 'Walk In: no show, not on the list');
const rob = by('Rob Smith'), robert = by('Robert Smith');
ok(rob.virtual && rob.maybeSame.some(m => m.key === 'p:p9') && robert.maybeSame.some(m => m.key === rob.key), 'Rob Smith and Robert Smith offered as maybe the same');
const grace = by('Grace Kim');
ok(grace.presented && grace.owner.name === 'Riley Stone' && grace.stage === 'outcome' && grace.action.kind === 'logPresented', 'Grace: presented for Riley, log as presenter');
ok(by('Maria Lopez').timeline.some(t => t.title === 'Called, wants tax info'), 'notes show on the timeline');
ok(/ with Dana$/.test(by('Kevin Tran').next), `with whoever presents (${by('Kevin Tran').next})`);
const counts = filterCounts(list);
ok(counts.all === 12 && counts.closed === 1 && counts.presented === 1, `Everyone leaves out Not interested (${JSON.stringify(counts)})`);
const graceDone = buildClients({ presenting: [{ ...presenting[0], followUpCompletedAt: iso(-1), outcome: 'went_well', status: 'completed' }], userId: ME, nameOf: id => names[id] || '' });
const gc = filterCounts(graceDone);
ok(gc.all === 0 && gc.presented === 1, 'once logged, someone you presented is only under You presented');
const sorted = sortClients(list, 'next').map(c => c.stage);
ok(sorted[0] === 'outcome' && sorted[1] === 'outcome' && sorted.indexOf('closed') === sorted.length - 1, `next step first: ${sorted.join(',')}`);
ok(clientMatches(by('Priya Shah'), '555-0100') && clientMatches(by('Priya Shah'), 'priya') && !clientMatches(by('Priya Shah'), 'kevin'), 'search by name or phone');
ok(clientMatches(grace, 'riley'), 'search finds the advisor you presented for');
// The same people, the other way round: a later appointment logged supersedes an old unlogged one.
const two = buildClients({ prospects: [pros('q1', 'Old', 'Case')], appointments: [appt('Old Case', -30), appt('Old Case', -3, logged('went_well'))], userId: ME });
ok(two[0].stage === 'followup', 'an old unlogged appointment followed by a logged one is not "needs outcome"');
ok(whenOf(appt('X', 0)).startsWith('Today · '), 'today reads "Today · 6:00 PM"');
const sold = buildClients({ prospects: [pros('q2', 'Marked', 'Sold', { markedSold: true })], userId: ME });
ok(sold[0].stage === 'client', 'marked sold on the list with no appointment: client');
console.log(f ? `${f} FAILED` : 'ALL CLIENT TESTS PASSED'); process.exit(f ? 1 : 0);
