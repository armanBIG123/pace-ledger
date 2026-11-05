// Team and hierarchy data: who's on whose team, promotion readiness, Manage Team actions, coaching notes and licensing numbers.
import { selectAll } from './paged.js';
import { supabase } from '../supabaseClient.js';
import { buildChildrenMap, computeDownline, computeReadiness, downlineIds } from '../hierarchy.js';
import { apptStartMs, fmtDate } from '../lib/dates.js';
import { rowToRecord } from './appointments.js';
import { isAdmin } from '../lib/roles.js';
import { systemScope } from '../lib/systemScope.js';
import { tidyName } from '../lib/names.js';

// Tier definitions, downline/upline traversal, and the tier-progress
// engine (HIERARCHY_TIERS, computeTierProgress, computeDownline,
// computeUpline, isLicensed, etc.) now live in ./hierarchy.js — see the
// import at the top of this file.

// Everyone's place in the hierarchy, with the fields tier progress needs.
// (org_directory has no tiers, so tier-count requirements need this.)
const PEOPLE_COLS = 'id, display_name, email, manager_id, role, hierarchy_tier, hierarchy_tier_changed_at, created_at, npn, fg_writing_number, licensed_at';
export async function fetchHierarchyPeople() {
  const load = cols => selectAll(o => supabase.from('profiles').select(cols, o).order('display_name').order('id'));
  let { data, error } = await load(`${PEOPLE_COLS}, solar_system_id`);
  // Before migration-solar-systems.sql there's no solar_system_id.
  if (error && error.code === '42703') ({ data, error } = await load(PEOPLE_COLS));
  if (error) { console.error(error); return []; }
  return data;
}

// One copy of everyone's profile, shared by every card on a screen for a
// minute, so opening Today doesn't ask for the same list several times.
// Anything that changes a level or role clears it.
const SHARED_TTL_MS = 60000;
// (Kept apart per solar system tab: see lib/systemScope.js.)
let sharedPeople = null;
const fresh = e => e && Date.now() - e.at < SHARED_TTL_MS && e.scope === systemScope();
export function fetchHierarchyPeopleShared() {
  if (fresh(sharedPeople)) return sharedPeople.promise;
  const promise = fetchHierarchyPeople();
  sharedPeople = { at: Date.now(), scope: systemScope(), promise };
  return promise;
}
// The agency-wide name list (org_directory), shared the same way.
let sharedDirectory = null;
export function fetchOrgDirectoryShared() {
  if (fresh(sharedDirectory)) return sharedDirectory.promise;
  const promise = fetchOrgDirectory();
  sharedDirectory = { at: Date.now(), scope: systemScope(), promise };
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
  const { data, error } = await selectAll(o => supabase.from('appointments').select('*', o).eq('officially_sold', true).gte('appointment_date', since).order('id'));
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
  if (isAdmin(user)) return people.map(p => p.id);
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
  const { data, error } = await selectAll(o => supabase.from('profiles').select('*', o).order('display_name').order('id'));
  if (error) { console.error(error); return []; }
  if (isAdmin(viewer)) return data.filter(p => ['advisor', 'manager', 'super_manager', 'super_admin'].includes(p.role));
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
  const { data, error } = await selectAll(o => supabase.from('org_directory').select('*', o).order('id'));
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
    p_display_name: tidyName(displayName), p_npn: npn, p_fg_writing_number: fgWritingNumber,
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
  const { data, error } = await selectAll(o => supabase.from('profiles').select('*', o).order('display_name').order('id'));
  if (error) { console.error(error); return []; }
  return data;
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
    if (json.error === 'not_allowed') return "You can't delete this account.";
    return "The account couldn't be deleted. Check your connection and try again.";
  } catch {
    return "The account couldn't be deleted. Check your connection and try again.";
  }
}

export async function changeUserTier(id, newTier) {
  clearSharedPeople();
  const { error } = await supabase.from('profiles').update({ hierarchy_tier: newTier || null }).eq('id', id);
  return !error ? null : error.message;
}

export async function logAuditEvent(actorId, actorName, action, targetName, details) {
  await supabase.from('audit_log').insert({ actor_id: actorId, actor_name: actorName, action, target_name: targetName, details });
}

// Newest first, a page at a time: { rows, more }.
export const AUDIT_PAGE = 50;
export async function fetchAuditLog({ offset = 0 } = {}) {
  const { data, error } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).order('id')
    .range(offset, offset + AUDIT_PAGE);
  if (error) { console.error(error); return { rows: [], more: false }; }
  return { rows: data.slice(0, AUDIT_PAGE), more: data.length > AUDIT_PAGE };
}

// One person's recent changes, for the Edit window. Entries from before
// migration-manage-team-edits.sql only have their name.
export async function fetchPersonHistory(id, name) {
  const byId = supabase.from('audit_log').select('*').eq('target_id', id).order('created_at', { ascending: false }).limit(10);
  const byName = name ? supabase.from('audit_log').select('*').eq('target_name', name).order('created_at', { ascending: false }).limit(10) : null;
  const [a, b] = await Promise.all([byId, byName || Promise.resolve({ data: [] })]);
  // No target_id column yet: just the name.
  const rows = [...(a.error ? [] : a.data || []), ...(b.error ? [] : (b.data || []).filter(r => !r.target_id || r.target_id === id))];
  const seen = new Set();
  return rows.filter(r => !seen.has(r.id) && seen.add(r.id))
    .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at))).slice(0, 10);
}

// ---------------------------------------------------------------------
// Phone numbers, and saving one person in Manage Team
// (migration-manage-team-edits.sql)
// ---------------------------------------------------------------------
const missingTable = e => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|could not find the table/i.test(e.message || ''));
const missingFunction = e => !!e && (e.code === 'PGRST202' || e.code === '42883' || /could not find the function|does not exist/i.test(e.message || ''));
export const NEEDS_UPDATE = "This needs the database update (migration-manage-team-edits.sql) to be run first.";

// The phone numbers this viewer may see (their own, their downline's, and
// for admins everyone's), as Map(id -> 10 digits). null before the
// database update: phones stay hidden.
export async function fetchPhones() {
  const { data, error } = await selectAll(o => supabase.from('person_contacts').select('user_id, phone', o).order('user_id'));
  if (error) { if (!missingTable(error)) console.error(error); return null; }
  return new Map(data.filter(r => r.phone).map(r => [r.user_id, r.phone]));
}

// Yours: '' when not added yet, null before the database update.
export async function fetchMyPhone(userId) {
  const { data, error } = await supabase.from('person_contacts').select('phone').eq('user_id', userId).maybeSingle();
  if (error) { if (!missingTable(error)) console.error(error); return null; }
  return (data && data.phone) || '';
}

export async function setMyPhone(phone) {
  const { data, error } = await supabase.rpc('set_my_phone', { p_phone: phone });
  if (!error) return { ok: true, phone: data || '' };
  if (/phone_digits/.test(error.message || '')) return { ok: false, error: 'Enter a 10-digit phone number, with the area code.' };
  if (missingFunction(error)) return { ok: false, error: NEEDS_UPDATE };
  console.error(error);
  return { ok: false, error: "Couldn't save your phone number. Check your connection and try again." };
}

const SAVE_ERRORS = [
  [/reason_required/, 'Add a reason for the change.'],
  [/reason_too_long/, 'Keep the reason under 500 characters.'],
  [/name_required/, 'Enter their first and last name.'],
  [/name_too_long/, 'That name is too long.'],
  [/phone_digits/, 'Enter a 10-digit phone number, with the area code.'],
  [/bad_level/, "That comp level isn't on the list."],
  [/bad_upline/, 'They can only report to someone else in their solar system.'],
  [/upline_loop/, "They can't report to someone on their own team."],
  [/last_admin/, "They're the only super admin. Make someone else a super admin first."],
  [/not_allowed_role/, 'Only super admins can make someone a Super Manager or super admin.'],
  [/not_allowed/, "You can't change this person's account."],
];
// changes: any of { display_name, phone, role, manager_id, hierarchy_tier }.
export async function adminSavePerson(id, changes, reason) {
  clearSharedPeople();
  const { data, error } = await supabase.rpc('pl_admin_save_person', { p_user: id, p_changes: changes, p_reason: reason || null });
  if (!error) return { ok: true, person: data || {} };
  const m = error.message || '';
  const hit = SAVE_ERRORS.find(([re]) => re.test(m));
  if (hit) return { ok: false, error: hit[1] };
  if (missingFunction(error)) return { ok: false, error: NEEDS_UPDATE };
  console.error(error);
  return { ok: false, error: "Couldn't save. Check your connection and try again." };
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
