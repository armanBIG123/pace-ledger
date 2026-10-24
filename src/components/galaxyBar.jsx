// Super admins: which solar system to look at, under the header. "Every
// solar system" is the whole Galaxy; picking one shows only its people,
// pace, Chat, wins and Resources (plus your own work), and anything you
// post goes to it.
import { useState } from 'react';
import { Sun } from 'lucide-react';
import { isGalaxyAdmin } from '../lib/roles.js';
import { setViewingSystem } from '../data/solarSystems.js';

export function GalaxyBar({ user }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const systems = user.solarSystems || [];
  if (!isGalaxyAdmin(user) || systems.length < 2) return null;
  const current = systems.find(s => s.id === user.viewingSystemId) || null;
  async function pick(id) {
    setBusy(true); setErr('');
    if (await setViewingSystem(id || null)) { window.location.reload(); return; }
    setBusy(false); setErr("Couldn't switch. Try again.");
  }
  return (
    <div className={`tr-galaxy ${current ? 'tr-galaxy-one' : ''}`}>
      <div className="tr-galaxy-inner">
        <Sun size={15} aria-hidden="true" />
        <label htmlFor="tr-galaxy-pick">Solar system</label>
        <select id="tr-galaxy-pick" value={current ? current.id : ''} disabled={busy} onChange={e => pick(e.target.value)}>
          <option value="">Every solar system</option>
          {systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span className="tr-galaxy-note">
          {err || (busy ? 'Switching…' : current ? `Only ${current.short_name}, plus your own work. What you post goes to ${current.short_name}.` : 'Everyone in the Galaxy.')}
        </span>
      </div>
    </div>
  );
}
