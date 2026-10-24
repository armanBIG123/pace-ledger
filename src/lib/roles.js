// Roles and solar systems (see migration-solar-systems.sql).
//
// super_admin    The whole Galaxy (every solar system). Can look at one
//                solar system at a time from the header.
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

const LABELS = { super_admin: 'Admin', super_manager: 'Super Manager', manager: 'Manager', advisor: 'Advisor' };
export function roleLabel(role) {
  return LABELS[role] || role || '';
}
