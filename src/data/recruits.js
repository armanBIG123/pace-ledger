// Data for Team Pace → Recruits and Field training. See
// migration-recruits-field-training.sql.
import { supabase } from '../supabaseClient.js';
import { rowToRecord } from './appointments.js';

const missing = error => !!error && (error.code === '42883' || error.code === 'PGRST202' || /could not find the function|does not exist/i.test(error.message || ''));

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
  const { data, error } = await supabase.from('appointments')
    .select('user_id, appointment_date').eq('officially_sold', true).in('user_id', userIds)
    .order('appointment_date', { ascending: true }).limit(5000);
  if (error) { console.error(error); return out; }
  (data || []).forEach(r => { if (!out.has(r.user_id)) out.set(r.user_id, []); out.get(r.user_id).push(r.appointment_date); });
  return out;
}

// Appointments in the next `days` days that you can see (yours, ones
// you're on, and your team's), soonest first.
export async function fetchUpcomingAppointments(days = 7) {
  const now = new Date();
  const end = new Date(now.getTime() + days * 864e5);
  const { data, error } = await supabase.from('appointments').select('*')
    .gte('appointment_at', now.toISOString()).lt('appointment_at', end.toISOString())
    .order('appointment_at', { ascending: true }).limit(2000);
  if (error) { console.error(error); return []; }
  return (data || []).map(rowToRecord);
}

// Add someone as the trainee on an upcoming appointment (or null to take
// them off).
export async function setAppointmentTrainee(appointmentId, traineeId) {
  const { data, error } = await supabase.rpc('set_appointment_trainee', { p_appointment: appointmentId, p_trainee: traineeId || null });
  if (error) return { ok: false, error: missing(error) ? 'Field training isn\'t switched on yet (the database update hasn\'t been run).' : error.message };
  return { ok: true, ...(data || {}) };
}
