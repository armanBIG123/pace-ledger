import { pathFor, routeFor } from '../../src/lib/routes.js';
let failures = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { failures++; console.log('FAIL', m); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
ok(pathFor({ group: 'mine', tab: 'overview' }) === '/today', 'Today is /today');
ok(pathFor({ group: 'mine', tab: 'pipeline', stage: 'clients' }) === '/clients', 'Clients is /clients');
ok(pathFor({ group: 'mine', tab: 'pipeline', stage: 'booked' }) === '/clients/booked', 'a Clients list has its own address');
ok(pathFor({ group: 'mine', tab: 'growth', growthView: 'pay' }) === '/growth/pay', 'Growth -> Commissions is /growth/pay');
ok(pathFor({ group: 'mine', tab: 'growth', growthView: 'path' }) === '/growth', 'Growth opens on My path at /growth');
ok(pathFor({ group: 'team', tab: 'teamhome' }) === '/team', 'Team Overview is /team');
ok(pathFor({ group: 'team', tab: 'users' }) === '/team/manage', 'Manage Team is /team/manage');
ok(pathFor({ group: 'team', tab: 'chat' }) === '/chat' && pathFor({ group: 'mine', tab: 'chat' }) === '/chat', 'Chat is /chat from either side');
ok(pathFor({ group: 'team', tab: 'nope' }) === null, 'an unknown screen has no address');
// And back
for (const p of ['/today', '/clients', '/clients/booked', '/clients/won', '/calendar', '/growth', '/growth/pay', '/resources', '/team', '/team/prospecting', '/team/pace', '/team/production', '/team/org', '/team/profiles', '/team/forms', '/team/manage']) {
  const r = routeFor(p);
  ok(r && pathFor(r) === p, `${p} round-trips`);
}
ok(eq(routeFor('/chat/urgent'), { group: null, tab: 'chat', room: 'urgent' }), '/chat/urgent opens Urgent help');
ok(eq(routeFor('/chat/nope'), { group: null, tab: 'chat', room: null }), 'an unknown chat room opens Chat');
ok(routeFor('/') === null && routeFor('') === null, 'the root is not a screen (Today by default)');
ok(routeFor('/clients/nope') === null && routeFor('/team/nope') === null && routeFor('/privacy-policy.html') === null && routeFor('/a/b/c') === null, 'anything else is not a screen');
ok(eq(routeFor('/Team/Pace'), { group: 'team', tab: 'pace' }), 'capital letters are fine');
console.log(failures ? `${failures} FAILED` : 'ALL ROUTE TESTS PASSED');
process.exit(failures ? 1 : 0);
