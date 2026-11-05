// Manage Team → Edit: what changed between a person as saved and the form,
// in words, and whether a reason is needed (a role, reports-to or comp
// level change). The database checks the same (pl_admin_save_person in
// migration-manage-team-edits.sql).
import { roleLabel } from './roles.js';
import { fmtPhone } from './phone.js';

// 10 digits ("" when blank), or null when it isn't a US number.
export function phoneDigits(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  return d.length === 10 ? d : null;
}

const squish = s => String(s || '').trim().replace(/\s+/g, ' ');

// before / draft: { display_name, phone, role, manager_id, hierarchy_tier }.
// nameOf(id) names a reports-to. Returns [{ key, label, from, to, reason }].
export function personChanges(before, draft, nameOf = () => '') {
  const out = [];
  const name0 = squish(before.display_name), name1 = squish(draft.display_name);
  if (name1 !== name0) out.push({ key: 'display_name', label: 'Name', from: name0, to: name1, reason: false });
  const ph0 = phoneDigits(before.phone) || '', ph1 = phoneDigits(draft.phone);
  if (ph1 !== null && ph1 !== ph0) {
    out.push({ key: 'phone', label: 'Phone', from: ph0 ? fmtPhone(ph0) : 'none', to: ph1 ? fmtPhone(ph1) : 'none', reason: false });
  }
  if ((draft.role || '') !== (before.role || '')) {
    out.push({ key: 'role', label: 'Role', from: roleLabel(before.role), to: roleLabel(draft.role), reason: true });
  }
  if ((draft.manager_id || '') !== (before.manager_id || '')) {
    out.push({ key: 'manager_id', label: 'Reports to', from: nameOf(before.manager_id) || 'nobody', to: nameOf(draft.manager_id) || 'nobody', reason: true });
  }
  if ((draft.hierarchy_tier || '') !== (before.hierarchy_tier || '')) {
    out.push({ key: 'hierarchy_tier', label: 'Comp level', from: before.hierarchy_tier || 'none', to: draft.hierarchy_tier || 'none', reason: true });
  }
  return out;
}

export const needsReason = changes => changes.some(c => c.reason);

// What to send to pl_admin_save_person: only the fields that changed.
export function changesPayload(changes, draft) {
  const p = {};
  changes.forEach(c => {
    if (c.key === 'display_name') p.display_name = squish(draft.display_name);
    else if (c.key === 'phone') p.phone = phoneDigits(draft.phone) || '';
    else p[c.key] = draft[c.key] || '';
  });
  return p;
}

// Activity log wording: older entries said "hierarchy tier".
export const auditAction = action => String(action || '').replace(/hierarchy tier/i, 'comp level');
