// Roles and solar systems (see migration-solar-systems.sql).
//
// super_admin    The whole Galaxy. Everywhere they see their own solar
//                system; Org Chart and Manage Team have a tab for each
//                one (lib/systemScope.js).
// super_manager  Super-admin powers inside their own solar system only:
//                not the Profiles tab, and can't make Super Managers or
//                super admins.
// manager, advisor  As always, inside their own solar system.

// Super-admin powers (in their own solar system, for a Super Manager).
export function isAdmin(user) {
  return !!user && (user.role === 'super_admin' || user.role === 'super_manager');
}
// The whole Galaxy.
export function isGalaxyAdmin(user) {
  return !!user && user.role === 'super_admin';
}
export function isSuperManager(user) {
  return !!user && user.role === 'super_manager';
}

// Activity tools (Today's pace, Clients, Calendar, Growth, Team views),
// turned on or off per person in Manage Team. person.activity_tools is
// true / false, or null (or missing, before the database update) for their
// solar system's default: on for Big Insurance Network, off for Big Huge
// Business and Elite Financial Services. Super admins always have them. See
// supabase/migrations/20261118200000_activity_tools.sql.
export function activityToolsOn(person, system) {
  if (!person) return true;
  if (person.role === 'super_admin') return true;
  if (person.activity_tools === true || person.activity_tools === false) return person.activity_tools;
  return !system || system.activity_tools_default !== false;
}
// The signed-in user (App.jsx works it out once).
export const hasActivityTools = user => !user || user.activityTools !== false;

const LABELS = { super_admin: 'Admin', super_manager: 'Super Manager', manager: 'Manager', advisor: 'Advisor' };
export function roleLabel(role) {
  return LABELS[role] || role || '';
}
