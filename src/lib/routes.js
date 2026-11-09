// Every screen's web address, so a refresh keeps your place, Back and
// Forward work, and links (emails, notifications) can open one screen:
//   /today  /clients  /clients/<list>  /calendar  /growth  /growth/<part>
//   /resources  /chat  /chat/<room>
//   /team  /team/prospecting  /team/pace  /team/production  /team/org
//   /team/profiles  /team/forms  /team/manage
// The view state in views/RoleViews.jsx stays the source of truth; this only
// turns it into a path and back.

const MINE = { today: 'overview', clients: 'pipeline', calendar: 'calendar', growth: 'growth', resources: 'resources' };
const TEAM = { '': 'teamhome', prospecting: 'teamsystems', pace: 'pace', production: 'production', org: 'org', profiles: 'profiles', forms: 'clientforms', manage: 'users' };
export const CLIENT_LISTS = ['clients', 'names', 'booked', 'outcome', 'followup', 'won'];
export const GROWTH_PARTS = ['path', 'pay', 'plan', 'licensing', 'incentives', 'guide'];
export const CHAT_ROOMS = ['megaphone', 'general', 'work', 'urgent', 'reports'];
const slugOf = (map, id) => Object.keys(map).find(k => map[k] === id);

// { group, tab, stage, growthView } -> '/clients/booked'
export function pathFor({ group, tab, stage = 'clients', growthView = 'path' }) {
  if (tab === 'chat') return '/chat';
  if (group === 'team') {
    const slug = slugOf(TEAM, tab);
    if (slug === undefined) return null;
    return slug ? `/team/${slug}` : '/team';
  }
  const slug = slugOf(MINE, tab);
  if (!slug) return null;
  if (tab === 'pipeline' && stage && stage !== 'clients' && CLIENT_LISTS.includes(stage)) return `/clients/${stage}`;
  if (tab === 'growth' && growthView && growthView !== 'path' && GROWTH_PARTS.includes(growthView)) return `/growth/${growthView}`;
  return `/${slug}`;
}

// '/team/pace' -> { group: 'team', tab: 'pace' }; null when it isn't a screen.
export function routeFor(pathname) {
  const parts = String(pathname || '/').toLowerCase().split('/').filter(Boolean);
  if (!parts.length) return null;
  const [a, b] = parts;
  if (parts.length > 2) return null;
  if (a === 'chat') return { group: null, tab: 'chat', room: CHAT_ROOMS.includes(b) ? b : null };
  if (a === 'team') {
    const tab = TEAM[b || ''];
    return tab ? { group: 'team', tab } : null;
  }
  const tab = MINE[a];
  if (!tab) return null;
  if (b && tab === 'pipeline') return CLIENT_LISTS.includes(b) ? { group: 'mine', tab, stage: b } : null;
  if (b && tab === 'growth') return GROWTH_PARTS.includes(b) ? { group: 'mine', tab, growthView: b } : null;
  return b ? null : { group: 'mine', tab };
}
