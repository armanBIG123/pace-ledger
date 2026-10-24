// Data for Team Pace → Recruits and Field training. See
// migration-recruits-field-training.sql.
import { invalidateAppointments } from './apptCache.js';
import { selectAll } from './paged.js';
import { supabase } from '../supabaseClient.js';
import { rowToRecord } from './appointments.js';

const missing = error => !!error && (error.code === '42883' || error.code === 'PGRST202' || /could not find the function|does not exist/i.test(error.message || ''));

// When recruits started counting from sign-ups (an ISO time), or null if
// the database update (migration-recruits-from-signups.sql) hasn't been run,
// in which case recruits still count the old way. Asked once per session.
let since; // undefined until asked
let sinceAsking = null;
export function recruitsFromSignupsSince() {
  if (since !== undefined) return Promise.resolve(since);
  if (sinceAsking) return sinceAsking;
  sinceAsking = supabase.rpc('recruits_from_signups_since').then(({ data, error }) => {
    sinceAsking = null;
    if (error) {
      if (missing(error)) since = null; // not switched on yet
      else console.error(error); // offline etc.: ask again next time
      return null;
    }
    since = data || null;
    return since;
  });
  return sinceAsking;
}
// The same, if it's already known this session (undefined if not asked yet).
export function knownRecruitsSince() { return since; }

// People who signed up through a recruit link between two dates
// (YYYY-MM-DD, Central time, inclusive) that you can see: yours, your
// team's, and everyone's for super admins. { since, rows } — rows are
// empty before the switch.
export async function fetchRecruitSignups(start, end) {
  const from = await recruitsFromSignupsSince();
  if (!from) return { since: null, rows: [] };
  const { data, error } = await supabase.rpc('recruit_signups', { p_start: start, p_end: end });
  if (error) { console.error(error); return { since: from, rows: [] }; }
  return {
    since: from,
    rows: (data || []).map(r => ({
      id: r.invite_id, uplineId: r.upline_id, createdBy: r.created_by, recruitId: r.recruit_id,
      recruitName: r.recruit_name || 'New teammate', signedUpAt: r.signed_up_at, appointmentId: r.appointment_id,
    })),
  };
}

// Sign-up links on your team that haven't been used yet (never the link).
export async function fetchTeamOpenInvites() {
  const { data, error } = await supabase.rpc('team_open_invites');
  if (error) { if (!missing(error)) console.error(error); return { rows: [], missingSetup: missing(error) }; }
  return { rows: data || [] };
}

// Each person's sold appointment dates (YYYY-MM-DD), oldest first.
export async function fetchSaleDates(userIds) {
  const out = new Map();
  if (!userIds.length) return out;
  const { data, error } = await selectAll(o => supabase.from('appointments')
    .select('user_id, appointment_date', o).eq('officially_sold', true).in('user_id', userIds)
    .order('appointment_date', { ascending: true }).order('id'));
  if (error) { console.error(error); return out; }
  (data || []).forEach(r => { if (!out.has(r.user_id)) out.set(r.user_id, []); out.get(r.user_id).push(r.appointment_date); });
  return out;
}

// Appointments in the next `days` days that you can see (yours, ones
// you're on, and your team's), soonest first.
export async function fetchUpcomingAppointments(days = 7) {
  const now = new Date();
  const end = new Date(now.getTime() + days * 864e5);
  const { data, error } = await selectAll(o => supabase.from('appointments').select('*', o)
    .gte('appointment_at', now.toISOString()).lt('appointment_at', end.toISOString())
    .order('appointment_at', { ascending: true }).order('id'));
  if (error) { console.error(error); return []; }
  return (data || []).map(rowToRecord);
}

// Add someone as the trainee on an upcoming appointment (or null to take
// them off).
export async function setAppointmentTrainee(appointmentId, traineeId) {
  invalidateAppointments();
  const { data, error } = await supabase.rpc('set_appointment_trainee', { p_appointment: appointmentId, p_trainee: traineeId || null });
  invalidateAppointments();
  if (error) return { ok: false, error: missing(error) ? 'Field training isn\'t switched on yet (the database update hasn\'t been run).' : error.message };
  return { ok: true, ...(data || {}) };
}
