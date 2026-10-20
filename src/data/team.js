// Team and hierarchy data: who's on whose team, promotion readiness, Manage Team actions, coaching notes and licensing numbers.
import { supabase } from '../supabaseClient.js';
import { buildChildrenMap, computeDownline, computeReadiness, downlineIds } from '../hierarchy.js';
import { apptStartMs, fmtDate } from '../lib/dates.js';
import { rowToRecord } from './appointments.js';

// Tier definitions, downline/upline traversal, and the tier-progress
// engine (HIERARCHY_TIERS, computeTierProgress, computeDownline,
// computeUpline, isLicensed, etc.) now live in ./hierarchy.js — see the
// import at the top of this file.

// Everyone's place in the hierarchy, with the fields tier progress needs.
// (org_directory has no tiers, so tier-count requirements need this.)
export async function fetchHierarchyPeople() {
  const { data, error } = await supabase.from('profiles')
    .select('id, display_name, email, manager_id, role, hierarchy_tier, hierarchy_tier_changed_at, created_at, npn, fg_writing_number, licensed_at')
    .order('display_name');
  if (error) { console.error(error); return []; }
  return data;
}

// One copy of everyone's profile, shared by every card on a screen for a
// minute, so opening Today doesn't ask for the same list several times.
// Anything that changes a level or role clears it.
const SHARED_TTL_MS = 60000;
let sharedPeople = null;
export function fetchHierarchyPeopleShared() {
  if (sharedPeople && Date.now() - sharedPeople.at < SHARED_TTL_MS) return sharedPeople.promise;
  const promise = fetchHierarchyPeople();
  sharedPeople = { at: Date.now(), promise };
  return promise;
}
// The agency-wide name list (org_directory), shared the same way.
let sharedDirectory = null;
export function fetchOrgDirectoryShared() {
  if (sharedDirectory && Date.now() - sharedDirectory.at < SHARED_TTL_MS) return sharedDirectory.promise;
  const promise = fetchOrgDirectory();
  sharedDirectory = { at: Date.now(), promise };
  return promise;
}
export function clearSharedPeople() { sharedPeople = null; sharedDirectory = null; }

// Officially-sold appointments recent enough to count toward any tier:
// the rolling 30 days, or this month plus the two before it.
export async function fetchRecentSoldAppointments() {
  const now = new Date();
  const monthsBack = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const thirtyBack = new Date(now.getTime() - 31 * 864e5);
  const since = fmtDate(monthsBack < thirtyBack ? monthsBack : thirtyBack);
  const { data, error } = await supabase.from('appointments').select('*').eq('officially_sold', true).gte('appointment_date', since);
  if (error) { console.error(error); return []; }
  return data.map(rowToRecord);
}

// Today's appointments on your team that you're presenting or training on
// (someone else logged them), soonest first.
export async function fetchTeamAppointmentsImOnToday(userId) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const { data, error } = await supabase.from('appointments').select('*')
    .or(`presenter_id.eq.${userId},trainee_id.eq.${userId}`)
    .neq('user_id', userId)
    .gte('appointment_at', start.toISOString()).lt('appointment_at', end.toISOString());
  if (error) { console.error(error); return []; }
  return data.map(rowToRecord).filter(a => a.presenterId === userId || a.traineeId === userId)
    .sort((a, b) => apptStartMs(a) - apptStartMs(b));
}

// Who the viewer can see promotion progress for: admins see everyone;
// everyone else sees themselves and their downline.
export function promotionSubjects(user, people) {
  if (user.role === 'super_admin') return people.map(p => p.id);
  return [user.id, ...downlineIds(user.id, buildChildrenMap(people))];
}

// { shared: true } reuses the shared people list (fine for Today; Team Pace
// wants it fresh right after a promotion).
export async function loadPromotionReadiness(user, subjectIds, { shared = false } = {}) {
  const [people, sold] = await Promise.all([shared ? fetchHierarchyPeopleShared() : fetchHierarchyPeople(), fetchRecentSoldAppointments()]);
  const ids = subjectIds || promotionSubjects(user, people);
  return { people, sold, list: computeReadiness(people, sold, ids) };
}

// A super admin approves a promotion: sets the next tier and logs it.
export async function approvePromotion(admin, member, nextTier) {
  const err = await changeUserTier(member.id, nextTier.key);
  if (err) return err;
  await logAuditEvent(admin.id, admin.displayName, 'Promoted', member.display_name, `${member.hierarchy_tier || '—'} → ${nextTier.key}`);
  return null;
}

export async function fetchTeamMembers(viewer) {
  const { data, error } = await supabase.from('profiles').select('*').order('display_name');
  if (error) { console.error(error); return []; }
  if (viewer.role === 'super_admin') return data.filter(p => ['advisor', 'manager', 'super_admin'].includes(p.role));
  // Everyone else (managers and advisors who lead people) sees their whole
  // downline, at any depth. People who don't report to the viewer directly
  // carry the name of who they do report to, so the structure stays clear.
  const byId = new Map(data.map(p => [p.id, p]));
  return computeDownline(viewer.id, data)
    .filter(p => p.id !== viewer.id)
    .map(p => (p.manager_id && p.manager_id !== viewer.id ? { ...p, reports_to_name: (byId.get(p.manager_id) || {}).display_name || '' } : p))
    .sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));
}

// Does anyone report to this person? Advisors who lead people get the
// Team views without needing the manager role.
export async function hasDirectReports(userId) {
  const { count, error } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('manager_id', userId);
  if (error) { console.error(error); return false; }
  return (count || 0) > 0;
}

// Sees other people's work: managers, admins, and advisors with a downline.
export function seesTeam(user) {
  return user.role !== 'advisor' || !!user.isLeader;
}

// manager_id doubles as "reports to" for manager-role rows too — a manager
// assigned to a super_admin just has manager_id set to that admin's id.
export async function fetchDirectManagers(viewer) {
  const { data, error } = await supabase
    .from('profiles').select('*').eq('role', 'manager').eq('manager_id', viewer.id).order('display_name');
  if (error) { console.error(error); return []; }
  return data;
}

export async function fetchOrgDirectory() {
  const { data, error } = await supabase.from('org_directory').select('*');
  if (error) { console.error(error); return []; }
  return data;
}

// ---------------------------------------------------------------------
// milestones — career-ladder reference, licensing, and live promotion
// progress tracking; Incentives is still a placeholder
// ---------------------------------------------------------------------
export async function fetchMyLicensing(userId) {
  const { data, error } = await supabase.from('profiles').select('npn, fg_writing_number, hierarchy_tier_changed_at, licensed_at').eq('id', userId).single();
  if (error) { console.error(error); return { npn: '', fg_writing_number: '' }; }
  return data;
}

// Your own name, NPN and F&G writing number, from Your account
// (migration-edit-profile.sql). Renaming also updates the appointments that
// show you as presenter or trainee.
export async function updateMyProfile({ displayName, npn, fgWritingNumber }) {
  const { data, error } = await supabase.rpc('update_my_profile', {
    p_display_name: displayName, p_npn: npn, p_fg_writing_number: fgWritingNumber,
  });
  if (error) {
    const m = error.message || '';
    const text = /name_required/.test(m) ? 'Enter your first and last name.'
      : /name_too_long/.test(m) ? 'That name is too long.'
        : /npn_digits/.test(m) ? 'Your NPN is numbers only.'
          : /fg_too_long/.test(m) ? 'That writing number is too long.'
            : (error.code === 'PGRST202' || /could not find the function|does not exist/i.test(m))
              ? "Profile editing isn't switched on yet (the database update migration-edit-profile.sql hasn't been run)."
              : "Couldn't save. Check your connection and try again.";
    if (!/name_|npn_|fg_/.test(m)) console.error(error);
    return { ok: false, error: text };
  }
  clearSharedPeople();
  return { ok: true, profile: data || {} };
}

export async function saveLicensing(userId, npn, fgWritingNumber) {
  clearSharedPeople();
  const { error } = await supabase.from('profiles').update({ npn: npn.trim() || null, fg_writing_number: fgWritingNumber.trim() || null }).eq('id', userId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---------------------------------------------------------------------
// super admin — promote/demote people, plus the same team pace view
// ---------------------------------------------------------------------
export async function fetchAllUsers() {
  const { data, error } = await supabase.from('profiles').select('*').order('display_name');
  if (error) { console.error(error); return []; }
  return data;
}

export async function changeUserRole(id, newRole) {
  clearSharedPeople();
  const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', id);
  return !error ? null : error.message;
}

// Permanently deletes someone's account (login and everything they own)
// through the delete-account function, which only super admins may use on
// someone else. Their direct reports move up to their upline.
export async function deleteUserProfile(id) {
  clearSharedPeople();
  const { data } = await supabase.auth.getSession();
  if (!data.session) return 'You need to be signed in.';
  try {
    const res = await fetch(`${supabase.supabaseUrl}/functions/v1/delete-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}`, apikey: supabase.supabaseKey },
      body: JSON.stringify({ confirm: 'DELETE', userId: id }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.deleted) return null;
    if (json.error === 'last_admin') return "That's the only admin left. Make someone else an admin first.";
    if (json.error === 'not_allowed') return 'Only super admins can delete accounts.';
    return "The account couldn't be deleted. Check your connection and try again.";
  } catch {
    return "The account couldn't be deleted. Check your connection and try again.";
  }
}

export async function changeUserManager(id, newManagerId) {
  clearSharedPeople();
  const { error } = await supabase.from('profiles').update({ manager_id: newManagerId || null }).eq('id', id);
  return !error ? null : error.message;
}

export async function changeUserTier(id, newTier) {
  clearSharedPeople();
  const { error } = await supabase.from('profiles').update({ hierarchy_tier: newTier || null }).eq('id', id);
  return !error ? null : error.message;
}

export async function logAuditEvent(actorId, actorName, action, targetName, details) {
  await supabase.from('audit_log').insert({ actor_id: actorId, actor_name: actorName, action, target_name: targetName, details });
}

export async function fetchAuditLog() {
  const { data, error } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) { console.error(error); return []; }
  return data;
}

// Documents + Important Links data-layer functions now live in
// ./documents.js — see the import at the top of this file.

// Manager coaching notes — a general, week-scoped feedback channel,
// separate from Open Requirements' policy-specific notes.
export async function fetchCoachingNotes(advisorId, weekOf) {
  const { data, error } = await supabase
    .from('coaching_notes').select('*').eq('advisor_id', advisorId).eq('week_of', weekOf)
    .order('created_at', { ascending: true });
  if (error) { console.error(error); return []; }
  return data;
}

export async function addCoachingNote(advisorId, weekOf, authorId, authorName, note) {
  const { data, error } = await supabase.from('coaching_notes').insert({
    advisor_id: advisorId, week_of: weekOf, author_id: authorId, author_name: authorName, note: note.trim(),
  }).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, record: data };
}
