// Field training board: who still needs observation sales for Field
// Associate, the field training they have booked this week, and upcoming
// appointments with an open trainee seat they could sit in on.
import { buildChildrenMap, downlineIds } from '../hierarchy.js';

// readiness: [{ member, progress }] from loadPromotionReadiness; people:
// everyone (for who reports to whom); upcoming: next 7 days of
// appointments; teamIds: the people the viewer leads.
export function buildFieldTraining({ readiness, people, upcoming, teamIds }) {
  const needers = [];
  readiness.forEach(({ member, progress }) => {
    if (!teamIds.has(member.id) || !progress || progress.nextTier.key !== 'FA') return;
    const req = progress.results.find(r => r.type === 'observationSales');
    if (!req || req.met) return;
    needers.push({ person: member, current: req.current, target: req.target });
  });
  const needIds = new Set(needers.map(n => n.person.id));
  const upcomingFor = id => upcoming.filter(a => a.traineeId === id);
  needers.forEach(n => { n.booked = upcomingFor(n.person.id); });
  needers.sort((a, b) => (a.booked.length - b.booked.length) || (b.current - a.current) || (a.person.display_name || '').localeCompare(b.person.display_name || ''));

  const children = buildChildrenMap(people);
  const below = new Map();
  const belowOf = id => { if (!below.has(id)) below.set(id, new Set(downlineIds(id, children))); return below.get(id); };
  const byId = new Map(needers.map(n => [n.person.id, n.person]));

  // Open seats: no trainee yet, presented by someone with a needer below them.
  const seats = [];
  upcoming.forEach(a => {
    if (a.traineeId || !a.presenterId) return;
    const under = belowOf(a.presenterId);
    const eligible = [...needIds].filter(id => id !== a.presenterId && under.has(id)).map(id => byId.get(id));
    if (eligible.length) seats.push({ appt: a, eligible });
  });

  // Field training already booked for people who need it.
  const booked = upcoming.filter(a => a.traineeId && needIds.has(a.traineeId));
  return { needers, seats, booked };
}
