// Manage Team (super admins, and Super Managers for their own solar
// system): roles, reporting lines, tiers, deleting accounts and the
// activity log. Super admins also move people between solar systems and
// make sign-up links for a solar system's Super Manager.
import { useCallback, useEffect, useState } from 'react';
import { Download, Trash2, UserPlus } from 'lucide-react';
import { computeDownline, computeUpline, HIERARCHY_TIERS, hierarchyTierLabel, isLicensed } from '../../hierarchy.js';
import { joinedDate, todayStr } from '../../lib/dates.js';
import { downloadCSV } from '../../lib/format.js';
import { changeUserManager, changeUserRole, changeUserTier, deleteUserProfile, fetchAllUsers, fetchAuditLog, logAuditEvent } from '../../data/team.js';
import { SkeletonRows, SkeletonTable } from '../../components/ui.jsx';
import { InviteShare } from '../../components/invites.jsx';
import { createLeaderInvite, moveToSystem } from '../../data/solarSystems.js';
import { isGalaxyAdmin, roleLabel } from '../../lib/roles.js';

export function ManageUsersView({ user = null, currentUserId, currentUserName }) {
  const galaxy = isGalaxyAdmin(user);
  const systems = (user && user.solarSystems) || [];
  const showSystems = galaxy && systems.length > 1;
  const systemName = id => (systems.find(x => x.id === id) || {}).short_name || '';
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setUsers(await fetchAllUsers());
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Anyone can lead people now, so anyone can be picked — except the person
  // themselves and anyone already under them (that would make a loop; the
  // database refuses it too).
  function uplineChoices(u) {
    const below = new Set(computeDownline(u.id, users).map(p => p.id));
    // Only people in the same solar system.
    const ok = users.filter(p => !below.has(p.id) && (!u.solar_system_id || p.solar_system_id === u.solar_system_id));
    const label = p => `${p.display_name}${p.role === 'super_admin' || p.role === 'super_manager' ? ` (${roleLabel(p.role)})` : ''}`;
    const leaders = ok.filter(p => p.role !== 'advisor');
    const advisors = ok.filter(p => p.role === 'advisor');
    return (
      <>
        <option value="">— none —</option>
        {leaders.length > 0 && <optgroup label="Managers and admins">{leaders.map(p => <option key={p.id} value={p.id}>{label(p)}</option>)}</optgroup>}
        {advisors.length > 0 && <optgroup label="Advisors">{advisors.map(p => <option key={p.id} value={p.id}>{label(p)}</option>)}</optgroup>}
      </>
    );
  }

  function handleExportRoster() {
    const rows = [['Name', 'Email', 'Role', 'Hierarchy Tier', 'Reports To', 'Top-Level Team', 'Licensed', 'Member Since', ...(showSystems ? ['Solar System'] : [])]];
    users.forEach(u => {
      const reportsTo = u.manager_id ? (users.find(m => m.id === u.manager_id)?.display_name || '') : '';
      // The root of the upline chain — whichever top-level manager or
      // super admin this person's org ultimately rolls up to, regardless
      // of how many management layers sit in between. Lets a filter on
      // this one column show everyone under a given leader at any depth.
      const upline = computeUpline(u.id, users);
      const topLevelTeam = upline.length > 0 ? upline[upline.length - 1].display_name : u.display_name;
      rows.push([
        u.display_name,
        u.email || '',
        roleLabel(u.role),
        u.hierarchy_tier ? hierarchyTierLabel(u.hierarchy_tier) : '',
        reportsTo,
        topLevelTeam,
        isLicensed(u) ? 'Yes' : 'No',
        u.created_at ? new Date(u.created_at).toLocaleDateString('en-US') : '',
        ...(showSystems ? [systemName(u.solar_system_id)] : []),
      ]);
    });
    downloadCSV(`team-roster-${todayStr()}.csv`, rows);
  }

  async function handleChange(id, newRole) {
    const target = users.find(u => u.id === id);
    setSavingId(id);
    setError('');
    const err = await changeUserRole(id, newRole);
    setSavingId(null);
    if (err) { setError(err); return; }
    setUsers(prev => prev.map(u => u.id === id ? { ...u, role: newRole } : u));
    logAuditEvent(currentUserId, currentUserName, 'Changed role', target?.display_name, `${target?.role || '?'} → ${newRole}`);
  }

  async function handleManagerChange(id, newManagerId) {
    const target = users.find(u => u.id === id);
    const newManagerName = newManagerId ? users.find(u => u.id === newManagerId)?.display_name : 'nobody';
    setSavingId(id);
    setError('');
    const err = await changeUserManager(id, newManagerId);
    setSavingId(null);
    if (err) { setError(err); return; }
    setUsers(prev => prev.map(u => u.id === id ? { ...u, manager_id: newManagerId || null } : u));
    logAuditEvent(currentUserId, currentUserName, 'Changed reports-to', target?.display_name, `now reports to ${newManagerName || 'nobody'}`);
  }

  async function handleTierChange(id, newTier) {
    const target = users.find(u => u.id === id);
    setSavingId(id);
    setError('');
    const err = await changeUserTier(id, newTier);
    setSavingId(null);
    if (err) { setError(err); return; }
    setUsers(prev => prev.map(u => u.id === id ? { ...u, hierarchy_tier: newTier || null } : u));
    logAuditEvent(currentUserId, currentUserName, 'Changed hierarchy tier', target?.display_name, `${target?.hierarchy_tier || 'none'} → ${newTier || 'none'}`);
  }

  async function handleSystemChange(id, systemId) {
    const target = users.find(u => u.id === id);
    const team = computeDownline(id, users).filter(p => p.id !== id).length;
    const to = systems.find(x => x.id === systemId);
    if (!target || !to) return;
    const ok = window.confirm(
      `Move ${target.display_name}${team ? ` and the ${team} ${team === 1 ? 'person' : 'people'} under them` : ''} to ${to.name}?\n\n` +
      `They'll only see ${to.name} from now on, and ${target.display_name} will report to nobody until you pick someone in ${to.name}.`
    );
    if (!ok) return;
    setSavingId(id);
    setError('');
    const err = await moveToSystem(id, systemId);
    setSavingId(null);
    if (err) { setError(err); return; }
    logAuditEvent(currentUserId, currentUserName, 'Moved to solar system', target.display_name, `${systemName(target.solar_system_id)} → ${to.short_name}${team ? ` (with ${team} on their team)` : ''}`);
    refresh();
  }

  // What this viewer may change for a row. Super Managers: not their own
  // role, level or upline, and not another Super Manager's role.
  const canEditRow = u => galaxy || u.id !== currentUserId;
  const canEditRole = u => galaxy || (u.id !== currentUserId && (u.role === 'advisor' || u.role === 'manager'));

  async function handleDelete(id, name) {
    const target = users.find(u => u.id === id);
    const upline = target && target.manager_id ? users.find(u => u.id === target.manager_id) : null;
    const reports = users.filter(u => u.manager_id === id).length;
    const ok = window.confirm(
      `Permanently delete ${name}'s account?\n\n` +
      `Their login, appointments, prospects, notes and Business Plan are deleted, and this can't be undone.` +
      (reports ? `\n\nThe ${reports} ${reports === 1 ? 'person' : 'people'} who report to them will move up to report to ${upline ? upline.display_name : 'nobody (top level)'}.` : '')
    );
    if (!ok) return;
    setSavingId(id);
    setError('');
    const err = await deleteUserProfile(id);
    setSavingId(null);
    if (err) { setError(err); return; }
    logAuditEvent(currentUserId, currentUserName, 'Deleted account', name, reports ? `${reports} direct report(s) moved to ${upline ? upline.display_name : 'top level'}` : null);
    refresh();
  }

  return (
    <>
    <div className="tr-row-head">
      <h2 className="tr-h2">Manage Team</h2>
      <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={handleExportRoster} disabled={users.length === 0}>
        <Download size={14} /> Export CSV
      </button>
    </div>
    {showSystems ? <LeaderInviteCard user={user} systems={systems} /> : null}
    <div className="tr-card tr-summary-card">
      {error && <div className="tr-error" style={{ margin: 16 }}>{error}</div>}
      {loading ? <SkeletonTable rows={6} cols={5} /> : (
        <div className="tr-table-wrap">
          <table className="tr-table tr-table-summary tr-table-stack tr-manage-table">
            <thead><tr><th>Name</th><th>Email</th>{showSystems ? <th>Solar system</th> : null}<th>Role</th><th>Reports To</th><th>Tier</th><th></th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td className="tr-mt-name">
                    {u.display_name}{u.id === currentUserId ? ' (you)' : ''}
                    <div className="tr-tenure">Joined {joinedDate(u.created_at)}</div>
                  </td>
                  <td className="tr-mt-email">{u.email || '—'}</td>
                  {showSystems ? (
                    <td className="tr-mt-system" data-label="Solar system">
                      <select value={u.solar_system_id || ''} disabled={savingId === u.id || u.id === currentUserId} onChange={e => handleSystemChange(u.id, e.target.value)} aria-label={`Solar system for ${u.display_name}`}>
                        {systems.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </td>
                  ) : null}
                  <td className="tr-mt-role" data-label="Role">
                    <select value={u.role} disabled={savingId === u.id || !canEditRole(u)} onChange={e => handleChange(u.id, e.target.value)} aria-label={`Role for ${u.display_name}`}>
                      <option value="advisor">Advisor</option>
                      <option value="manager">Manager</option>
                      {(galaxy && systems.length > 0) || u.role === 'super_manager' ? <option value="super_manager">Super Manager</option> : null}
                      {galaxy || u.role === 'super_admin' ? <option value="super_admin">Super Admin</option> : null}
                    </select>
                  </td>
                  <td className="tr-mt-mgr" data-label="Reports to">
                    {u.role === 'advisor' || u.role === 'manager' || u.role === 'super_manager' ? (
                      <select value={u.manager_id || ''} disabled={savingId === u.id || !canEditRow(u)} onChange={e => handleManagerChange(u.id, e.target.value)} aria-label={`Who ${u.display_name} reports to`}>
                        {uplineChoices(u)}
                      </select>
                    ) : '—'}
                  </td>
                  <td className="tr-mt-tier" data-label="Tier">
                    <select value={u.hierarchy_tier || ''} disabled={savingId === u.id || !canEditRow(u)} onChange={e => handleTierChange(u.id, e.target.value)} aria-label={`Tier for ${u.display_name}`}>
                      <option value="">— none —</option>
                      {HIERARCHY_TIERS.map(t => <option key={t.key} value={t.key}>{t.key} — {t.name}</option>)}
                    </select>
                  </td>
                  <td className="tr-mt-del">
                    {u.id !== currentUserId && (galaxy || u.role === 'advisor' || u.role === 'manager') && (
                      <button className="tr-icon-btn" onClick={() => handleDelete(u.id, u.display_name)} disabled={savingId === u.id} title="Delete account" aria-label={`Delete ${u.display_name}'s account`}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
    <AuditLogView />
    </>
  );
}

// Read-only history of role changes, reports-to changes, and removals —
// lives right under the user table above since it's really an extension
// of Manage Team, not a separate feature.
export function AuditLogView() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchAuditLog().then(rows => { setEntries(rows); setLoading(false); });
  }, [open]);

  return (
    <div className="tr-card" style={{ marginTop: 16 }}>
      <button type="button" className="tr-more-toggle" style={{ padding: 0 }} onClick={() => setOpen(v => !v)}>
        {open ? '▲ Hide activity log' : '▾ Show activity log'}
      </button>
      {open && (
        loading ? <SkeletonRows count={4} /> : entries.length === 0 ? (
          <p className="tr-empty">No activity recorded yet.</p>
        ) : (
          <div className="tr-audit-list">
            {entries.map(e => (
              <div key={e.id} className="tr-audit-row">
                <span className="tr-audit-time">{new Date(e.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                <span><strong>{e.actor_name}</strong> {e.action.toLowerCase()}{e.target_name ? ` — ${e.target_name}` : ''}{e.details ? <span className="tr-note"> ({e.details})</span> : ''}</span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// Super admins: a sign-up link for someone to lead a solar system. They
// join it as its Super Manager, reporting to no one, and everyone they
// invite after that joins it too.
function LeaderInviteCard({ user, systems }) {
  const choices = systems.filter(x => x.short_name !== 'BIG');
  const [open, setOpen] = useState(false);
  const [systemId, setSystemId] = useState((choices[0] || systems[0] || {}).id || '');
  const [name, setName] = useState('');
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const sys = systems.find(x => x.id === systemId);
  async function make(e) {
    e.preventDefault();
    if (!name.trim()) { setErr('Enter their name.'); return; }
    setBusy(true); setErr('');
    const res = await createLeaderInvite({ creatorId: user.id, systemId, name });
    setBusy(false);
    if (!res.ok) { setErr("Couldn't make the link. Try again."); return; }
    setInvite(res.invite);
  }
  if (!open) {
    return (
      <div className="tr-card tr-leader-invite tr-leader-invite-closed">
        <div>
          <strong>Starting a new solar system?</strong>
          <p className="tr-empty" style={{ margin: '2px 0 0' }}>Send its leader a link. They join as its Super Manager, and everyone they invite joins it too.</p>
        </div>
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => setOpen(true)}><UserPlus size={14} /> Invite a Super Manager</button>
      </div>
    );
  }
  return (
    <div className="tr-card tr-leader-invite">
      <h3 className="tr-h3" style={{ margin: 0 }}>Invite a Super Manager</h3>
      {invite ? (
        <>
          <p className="tr-empty" style={{ margin: '6px 0 10px' }}>{name.trim().split(' ')[0]}'s link to lead {sys ? sys.name : 'the solar system'}. It works once and expires in 30 days.</p>
          <InviteShare invite={invite} recruitName={name} leads={sys ? sys.name : ''} />
          <button type="button" className="tr-link-btn" style={{ marginTop: 10 }} onClick={() => { setInvite(null); setName(''); }}>Invite another</button>
        </>
      ) : (
        <form onSubmit={make} className="tr-leader-invite-form">
          <label className="tr-field"><span>Their name</span><input value={name} onChange={e => setName(e.target.value)} placeholder="First and last name" /></label>
          <label className="tr-field"><span>To lead</span>
            <select value={systemId} onChange={e => setSystemId(e.target.value)}>
              {systems.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          {err ? <div className="tr-error">{err}</div> : null}
          <div className="tr-form-actions">
            <button type="button" className="tr-btn tr-btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="tr-btn tr-btn-brass" disabled={busy}>{busy ? 'Making…' : 'Make their link'}</button>
          </div>
        </form>
      )}
    </div>
  );
}
