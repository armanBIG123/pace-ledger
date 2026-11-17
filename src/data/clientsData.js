// Everything My work → Clients is built from: your list, your appointments
// and the ones you present, notes, intake forms, sign-ups and names. Today
// reads the same copy (its follow-ups due), so both share one load.
import { fetchAppointmentsImOn, fetchMyAppointments } from './appointments.js';
import { fetchMyProspects } from './prospects.js';
import { fetchRecruitSignups } from './recruits.js';
import { fetchOrgDirectory } from './team.js';
import { fetchMyIntakeStatus } from '../clientIntake.js';
import { fetchMyFollowUpNotes } from '../followUpNotes.js';
import { todayStr } from '../lib/dates.js';

export const CLIENT_TOPICS = ['appointments', 'intake', 'prospects'];
export const clientsKey = userId => ['clients', userId];

export async function loadClientsData(userId) {
  const [prospects, appointments, presenting, notes, intakes, signups, org] = await Promise.all([
    fetchMyProspects(userId), fetchMyAppointments(userId), fetchAppointmentsImOn(userId).catch(() => []),
    fetchMyFollowUpNotes(userId).catch(() => []), fetchMyIntakeStatus(userId).catch(() => []),
    fetchRecruitSignups('2000-01-01', todayStr()).catch(() => ({ rows: [] })), fetchOrgDirectory().catch(() => []),
  ]);
  return { prospects, appointments, presenting, notes, intakes, signups: (signups && signups.rows) || [], org };
}
