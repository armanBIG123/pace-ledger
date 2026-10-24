// Super admins look at another solar system only inside Org Chart and
// Manage Team (Team & admin). While one of those tabs is on another solar
// system, the database is asked for that one (the x-pl-system header, see
// migration-solar-system-tabs.sql); everywhere else it's their own.
import { useEffect, useState } from 'react';
import { isGalaxyAdmin } from './roles.js';

let scope = null;

// The solar system to ask for, or null for your own.
export function systemScope() { return scope; }
export function setSystemScope(id) {
  const next = id || null;
  if (next === scope) return;
  scope = next;
  try { globalThis.__plSystemScope = scope; } catch { /* fine */ }
  // Profile photos follow (see useAvatars).
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('paceledger:system-scope'));
}

// Org Chart and Manage Team: which solar system tab is open. Starts on
// your own; leaving the screen goes back to your own.
// { systems: [] unless there's more than one to pick, current, pick(id) }
export function useSystemTabs(user) {
  const home = (user && user.solarSystemId) || null;
  const systems = isGalaxyAdmin(user) && user.solarSystems && user.solarSystems.length > 1 ? user.solarSystems : [];
  const [current, setCurrent] = useState(home);
  useEffect(() => () => setSystemScope(null), []);
  function pick(id) {
    setSystemScope(id && id !== home ? id : null);
    setCurrent(id || home);
  }
  return { systems, current, home, pick, other: !!current && current !== home };
}
