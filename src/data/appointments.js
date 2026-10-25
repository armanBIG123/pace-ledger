// Appointments: loading, saving, outcomes/follow-ups, sold policies and invites.
import { supabase } from '../supabaseClient.js';
import { fetchHierarchyPeopleShared } from './team.js';
import { createClientIntakeCandidate } from '../clientIntake.js';
import { openIntakeSend } from '../lib/intakeEvents.js';
import { cachedLoad, invalidateAppointments } from './apptCache.js';
import { selectAll } from './paged.js';
import { tidyName } from '../lib/names.js';
import { dateSetMeta, defaultDateSetOption } from '../lib/pace.js';
import { addDays, apptEndMs, detectTimezone, fmtDate, fmtDisplayDate, LEGACY_APPT_MINUTES, parseDate, todayStr, weekStartOf } from '../lib/dates.js';

// ---------------------------------------------------------------------
// data layer (Supabase Postgres, guarded by Row Level Security)
// ---------------------------------------------------------------------
export function rowToRecord(row) {
  const meta = dateSetMeta(row.date_set_option);
  return {
    id: row.id,
    userId: row.user_id,
    dateSetOption: row.date_set_option,
    dateSetLabel: meta.label,
    category: row.category,
    weekOf: row.week_of,
    appointmentDate: row.appointment_date,
    appointmentTime: (row.appointment_time || '').slice(0, 5),
    // How long it is, in minutes (30 for rows saved before lengths were).
    durationMinutes: Number(row.duration_minutes) > 0 ? Number(row.duration_minutes) : LEGACY_APPT_MINUTES,
    presenter: row.presenter,
    presenterId: row.presenter_id || '',
    trainee: row.trainee || '',
    traineeId: row.trainee_id || '',
    client: row.client_name,
    notes: row.notes || '',
    createdAt: row.created_at,
    outcome: row.outcome || '',
    followUpScheduled: row.follow_up_scheduled,
    result: row.result || '',
    interestedTax: row.interested_tax,
    interestedInsurance: row.interested_insurance,
    followUpCompletedAt: row.follow_up_completed_at,
    status: row.status || '',
    presentationType: row.presentation_type || '',
    presentationTypeSecondary: row.presentation_type_secondary || '',
    officiallyRecruited: row.officially_recruited || false,
    officiallySold: row.officially_sold || false,
    targetPremium: row.target_premium,
    appointmentTimezone: row.appointment_timezone || '',
    appointmentAt: row.appointment_at || null,
    isFollowUp: row.is_follow_up || false,
    followUpAppointmentDate: row.follow_up_appointment_date || '',
    followUpAppointmentTime: (row.follow_up_appointment_time || '').slice(0, 5),
    followUpAppointmentTimezone: row.follow_up_appointment_timezone || '',
    followUpAppointmentAt: row.follow_up_appointment_at || null,
    zoomUrl: row.zoom_url || '',
    effectiveDate: row.effective_date || '',
    requirementsCompleted: row.requirements_completed || false,
    clientIntakeRequested: row.client_intake_requested || false,
    clientEmail: row.client_email || '',
    clientPhone: row.client_phone || '',
    // The prospect on your list this appointment is for (linked when you
    // pick them, or matched once by exact name).
    prospectId: row.prospect_id || '',
    // Set when someone other than you (the presenter) logged how it went.
    outcomeLoggedBy: row.outcome_logged_by || '',
    inviteeEmails: row.invitee_emails || [],
    inviteMethod: row.invite_method || '',
    inviteSentAt: row.invite_sent_at || null,
  };
}

// An appointment can now be logged as, and confirmed as, both a recruit
// AND a sale at once — these check both the primary and secondary type
// fields so "both" is never missed anywhere it's checked.
export function isRecruitType(a) {
  return a.presentationType === 'recruit' || a.presentationTypeSecondary === 'recruit';
}

export function isSaleType(a) {
  return a.presentationType === 'sale' || a.presentationTypeSecondary === 'sale';
}

export function typeLabel(a) {
  const r = isRecruitType(a), s = isSaleType(a);
  if (r && s) return 'Recruit & Sale';
  if (r) return 'Recruit';
  if (s) return 'Sale';
  return '';
}

// Over once it has ended (not when it starts), so one in progress still
// counts as booked and isn't waiting for an outcome yet.
export function isPastAppointment(a) {
  return apptEndMs(a) < Date.now();
}

// How long a new appointment is unless you change its end time.
export const DEFAULT_APPT_MINUTES = 60;

// Before migration-appointment-end-times.sql has run there's no
// duration_minutes column yet: save without the length instead of failing.
async function saveWithLength(payload, write) {
  invalidateAppointments();
  const res = await write(payload);
  invalidateAppointments();
  if (!res.error || !('duration_minutes' in payload) || !/duration_minutes/.test(res.error.message || '')) return res;
  const rest = { ...payload };
  delete rest.duration_minutes;
  return write(rest);
}

function lengthOf(form) {
  const n = Math.round(Number(form.durationMinutes));
  return n >= 5 && n <= 720 ? n : DEFAULT_APPT_MINUTES;
}

// A sold policy moves from "Submitted Premium" to "Issued Premium" once the
// effective date has arrived AND requirements are marked complete —
// computed live, nothing needs to manually "move" it.
export function isPolicyIssued(a) {
  return !!a.effectiveDate && a.effectiveDate <= todayStr() && a.requirementsCompleted === true;
}

// Every appointment marked "Sale" in its follow-up is a policy. Row Level
// Security automatically scopes this to whatever the current person is
// allowed to see: an advisor gets their own, a manager gets their own
// plus their assigned advisors', a super_admin gets everyone's.
export async function fetchSoldPolicies() {
  const { data, error } = await selectAll(o => supabase
    .from('appointments').select('*', o).eq('officially_sold', true)
    .order('appointment_date', { ascending: false }).order('id'));
  if (error) { console.error(error); return []; }
  return data.map(rowToRecord);
}

// Calendar view — same RLS-based scoping as everywhere else (own
// appointments, or own + team for managers/admins), just fetched by actual
// date range instead of pace week. Always reflects live appointment_date /
// appointment_time, so reschedules, follow-ups, and edits show up
// automatically with no extra sync logic needed.
export async function fetchAppointmentsInRange(startDate, endDate) {
  const { data, error } = await selectAll(o => supabase
    .from('appointments').select('*', o)
    .gte('appointment_date', startDate)
    .lte('appointment_date', endDate)
    .order('appointment_date', { ascending: true })
    .order('appointment_time', { ascending: true })
    .order('id'));
  if (error) { console.error(error); return []; }
  return data.map(rowToRecord);
}

export async function updatePolicyFields(id, fields) {
  const payload = {};
  if ('effectiveDate' in fields) payload.effective_date = fields.effectiveDate || null;
  if ('requirementsCompleted' in fields) payload.requirements_completed = !!fields.requirementsCompleted;
  const { error } = await supabase.from('appointments').update(payload).eq('id', id);
  invalidateAppointments();
  return !error;
}

export async function fetchPolicyNotes(appointmentId) {
  const { data, error } = await supabase
    .from('policy_notes').select('*').eq('appointment_id', appointmentId)
    .order('created_at', { ascending: true });
  if (error) { console.error(error); return []; }
  return data;
}

// Notes for several policies at once, newest first (for the leaders'
// "submitted, not issued" list).
export async function fetchPolicyNotesFor(appointmentIds) {
  if (!appointmentIds.length) return [];
  const { data, error } = await supabase
    .from('policy_notes').select('*').in('appointment_id', appointmentIds)
    .order('created_at', { ascending: false }).limit(1000);
  if (error) { console.error(error); return []; }
  return data;
}

export async function addPolicyNote(appointmentId, authorId, authorName, note) {
  const { data, error } = await supabase.from('policy_notes').insert({
    appointment_id: appointmentId, author_id: authorId, author_name: authorName, note: note.trim(),
  }).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, record: data };
}

// Status is derived entirely from the follow-up answers — there's no
// separate manual status control, so the two can never disagree.
export function deriveStatus(outcome, followUpScheduled) {
  if (followUpScheduled === true) return 'needs_follow_up';
  if (outcome === 'rescheduled') return 'needs_reschedule';
  if (outcome === 'no_show') return 'not_completed';
  if (outcome === 'went_well' || outcome === 'not_interested') return 'completed';
  return '';
}

export async function saveFollowUp(id, data, followUpTimezone) {
  const status = deriveStatus(data.outcome, data.followUpScheduled);
  const scheduled = data.followUpScheduled === true;
  const updatePayload = {
    outcome: data.outcome || null,
    follow_up_scheduled: data.followUpScheduled,
    officially_recruited: !!data.officiallyRecruited,
    officially_sold: !!data.officiallySold,
    interested_tax: data.interestedTax,
    interested_insurance: data.interestedInsurance,
    target_premium: data.officiallySold && data.targetPremium ? Number(data.targetPremium) : null,
    follow_up_completed_at: new Date().toISOString(),
    status: status || null,
    follow_up_appointment_date: scheduled ? (data.followUpDate || null) : null,
    follow_up_appointment_time: scheduled ? (data.followUpTime || null) : null,
    follow_up_appointment_timezone: scheduled ? (followUpTimezone || null) : null,
    // You logged it yourself (a presenter's "Logged by" note goes away).
    outcome_logged_by: null,
  };
  // Only ever flips this on — never overwrites an existing "yes" back to
  // "no" if a follow-up is edited/re-saved later without touching this
  // question, so the candidate record it created is never orphaned.
  if (data.clientIntake === true) updatePayload.client_intake_requested = true;
  const { error } = await supabase.from('appointments').update(updatePayload).eq('id', id);
  invalidateAppointments();
  return !error;
}

// Creates the actual next appointment when someone says a follow-up was
// scheduled — carries over presenter/client/type from the original so
// nothing needs re-entering, "set" as of today (right now).
export async function insertFollowUpAppointment(userId, original, followUpDate, followUpTime, timezone) {
  const dateSetOption = defaultDateSetOption();
  const meta = dateSetMeta(dateSetOption);
  const { data, error } = await saveWithLength({
    user_id: userId,
    date_set_option: dateSetOption,
    category: meta.category,
    week_of: weekStartOf(todayStr()),
    appointment_date: followUpDate,
    appointment_time: followUpTime,
    appointment_timezone: timezone || original.appointmentTimezone || detectTimezone(),
    // The same length as the one it follows.
    duration_minutes: lengthOf(original),
    presenter: original.presenter,
    trainee: original.trainee || null,
    client_name: original.client,
    client_email: original.clientEmail || null,
    client_phone: original.clientPhone || null,
    prospect_id: original.prospectId || null,
    notes: `Follow-up to appointment on ${fmtDisplayDate(original.appointmentDate)}`,
    presentation_type: original.presentationType || null,
    presentation_type_secondary: original.presentationTypeSecondary || null,
    zoom_url: original.zoomUrl || null,
    is_follow_up: true,
  }, p => supabase.from('appointments').insert(p).select().single());
  if (error) return { ok: false, error: error.message };
  return { ok: true, record: rowToRecord(data) };
}

// Appointments someone else set with you as the presenter (they count
// toward your pace too). Each gets setByName: who set it.
// Appointments someone else set that you're on: presenting (these count
// toward your pace) or sitting in as the trainee. One request for both.
// Each comes back with presentingFor and the name of who set it.
// Shared between screens (see apptCache.js); fresh: true skips the copy.
export function fetchAppointmentsImOn(userId, opts) {
  return cachedLoad(`on:${userId}`, () => loadAppointmentsImOn(userId), opts);
}
async function loadAppointmentsImOn(userId) {
  const [{ data, error }, people] = await Promise.all([
    selectAll(o => supabase.from('appointments').select('*', o)
      .or(`presenter_id.eq.${userId},trainee_id.eq.${userId}`).neq('user_id', userId)
      .order('appointment_date', { ascending: true }).order('id')),
    fetchHierarchyPeopleShared().catch(() => []),
  ]);
  if (error) { console.error(error); return []; }
  const names = new Map((people || []).map(p => [p.id, p.display_name]));
  return (data || [])
    .filter(r => r.user_id !== userId && (r.presenter_id === userId || r.trainee_id === userId))
    .map(r => ({ ...rowToRecord(r), presentingFor: r.presenter_id === userId, setByName: names.get(r.user_id) || '' }));
}

export async function fetchAppointmentsImPresenting(userId) {
  return (await fetchAppointmentsImOn(userId)).filter(a => a.presentingFor);
}

// Every appointment you set, oldest first. Shared between screens (see
// apptCache.js); fresh: true skips the shared copy.
export function fetchMyAppointments(userId, opts) {
  return cachedLoad(`mine:${userId}`, () => loadMyAppointments(userId), opts);
}
async function loadMyAppointments(userId) {
  const { data, error } = await selectAll(o => supabase
    .from('appointments').select('*', o).eq('user_id', userId)
    .order('appointment_date', { ascending: true }).order('id'));
  if (error) { console.error(error); return []; }
  return data.map(rowToRecord);
}

// For Base Shop premium — relies on the recursive-downline RLS policy to
// correctly include everyone under someone, at any depth, not just
// direct reports.
export async function fetchAppointmentsForUserIds(userIds) {
  if (userIds.length === 0) return [];
  const { data, error } = await selectAll(o => supabase.from('appointments').select('*', o).in('user_id', userIds).order('id'));
  if (error) { console.error(error); return []; }
  return data.map(rowToRecord);
}

// For observation-sales tracking — appointments where this person was
// the trainee, regardless of who logged it (relies on the
// trainee-visibility RLS policy).
export async function fetchAppointmentsAsTrainee(userId) {
  const { data, error } = await selectAll(o => supabase.from('appointments').select('*', o).eq('trainee_id', userId).order('id'));
  if (error) { console.error(error); return []; }
  return data.map(rowToRecord);
}

export async function fetchAppointmentsForWeek(weekMonday) {
  const { data, error } = await selectAll(o => supabase
    .from('appointments').select('*', o).eq('week_of', weekMonday).order('id'));
  if (error) { console.error(error); return []; }
  return data.map(rowToRecord);
}

// Appointments that took place in a PaceLedger week (Saturday to Friday),
// whenever they were booked. Production counts a sale or recruit in the
// week it happened, the same as the weekly top 3 and the paycheck.
export async function fetchAppointmentsHeldInWeek(weekStart) {
  const weekEnd = fmtDate(addDays(parseDate(weekStart), 6));
  const { data, error } = await selectAll(o => supabase
    .from('appointments').select('*', o).gte('appointment_date', weekStart).lte('appointment_date', weekEnd).order('id'));
  if (error) { console.error(error); return []; }
  return data.map(rowToRecord);
}

export async function insertAppointment(userId, form) {
  const meta = dateSetMeta(form.dateSetOption);
  const { data, error } = await saveWithLength({
    user_id: userId,
    date_set_option: form.dateSetOption,
    category: meta.category,
    week_of: form.weekOf,
    appointment_date: form.appointmentDate,
    appointment_time: form.appointmentTime,
    appointment_timezone: form.timezone || null,
    duration_minutes: lengthOf(form),
    presenter: tidyName(form.presenter),
    presenter_id: form.presenterId || null,
    trainee: tidyName(form.trainee) || null,
    trainee_id: form.traineeId || null,
    client_name: tidyName(form.client),
    client_email: (form.clientEmail || '').trim() || null,
    client_phone: (form.clientPhone || '').trim() || null,
    prospect_id: form.prospectId || null,
    notes: form.notes.trim() || null,
    presentation_type: form.presentationType || null,
    presentation_type_secondary: form.presentationTypeSecondary || null,
  }, p => supabase.from('appointments').insert(p).select().single());
  if (error) return { ok: false, error: error.message };
  return { ok: true, record: rowToRecord(data) };
}

// Editing normally never touches week_of — a typo fix shouldn't move pace
// counts. The one deliberate exception is rescheduling: if the appointment
// currently needs to be rescheduled, saving new details for it is genuinely
// new scheduling work, so it counts toward whichever batch it lands in now,
// and its stale follow-up state (status, outcome, etc.) is cleared since
// none of that applies to the newly-set time.
// The columns an edit saves, from the appointment form.
function appointmentFields(form) {
  const meta = dateSetMeta(form.dateSetOption);
  return {
    date_set_option: form.dateSetOption,
    category: meta.category,
    appointment_date: form.appointmentDate,
    appointment_time: form.appointmentTime,
    appointment_timezone: form.timezone || null,
    duration_minutes: lengthOf(form),
    presenter: tidyName(form.presenter),
    presenter_id: form.presenterId || null,
    trainee: tidyName(form.trainee) || null,
    trainee_id: form.traineeId || null,
    client_name: tidyName(form.client),
    client_email: (form.clientEmail || '').trim() || null,
    client_phone: (form.clientPhone || '').trim() || null,
    prospect_id: form.prospectId || null,
    notes: form.notes.trim() || null,
    presentation_type: form.presentationType || null,
    presentation_type_secondary: form.presentationTypeSecondary || null,
  };
}

export async function updateAppointment(id, form, isReschedule) {
  const payload = appointmentFields(form);
  if (isReschedule) {
    payload.week_of = weekStartOf(todayStr());
    payload.status = null;
    payload.outcome = null;
    payload.follow_up_scheduled = null;
    payload.officially_recruited = false;
    payload.officially_sold = false;
    payload.target_premium = null;
    payload.follow_up_completed_at = null;
    payload.follow_up_appointment_date = null;
    payload.follow_up_appointment_time = null;
    payload.follow_up_appointment_timezone = null;
  }
  const { data, error } = await saveWithLength(payload, p => supabase.from('appointments').update(p).eq('id', id).select().single());
  if (error) return { ok: false, error: error.message };
  return { ok: true, record: rowToRecord(data) };
}

// A leader changing someone else's appointment: the person they report to,
// or a super admin. Only the time and the details change (never how it
// went, or whose it is), through the database's checked function
// (migration-team-edits-lengths.sql).
export async function updateTeamAppointment(id, form, isReschedule) {
  const fields = appointmentFields(form);
  delete fields.prospect_id;
  if (isReschedule) fields.week_of = weekStartOf(todayStr());
  const { data, error } = await supabase.rpc('leader_update_appointment', { p_appointment: id, p_fields: fields, p_reschedule: !!isReschedule });
  invalidateAppointments();
  if (error || !data) {
    const msg = (error && error.message) || '';
    return { ok: false, error: /not_allowed/.test(msg) ? 'Only the person they report to, or a super admin, can change this appointment.' : "Couldn't save. Check your connection and try again." };
  }
  return { ok: true, record: rowToRecord(data) };
}

// Moves an appointment that didn't happen (rescheduled, or a no-show) to a
// new date and time from the "How did it go?" window. It's the same as
// editing it from the Reschedule list: it counts as set this week, its
// outcome starts fresh, and everything else (client, presenter, notes,
// Zoom link, how long it is) stays as it was.
export async function rescheduleAppointment(appt, { date, time, timezone }) {
  return updateAppointment(appt.id, {
    dateSetOption: appt.dateSetOption,
    appointmentDate: date,
    appointmentTime: time,
    timezone: timezone || appt.appointmentTimezone || detectTimezone(),
    durationMinutes: appt.durationMinutes,
    presenter: appt.presenter || '',
    presenterId: appt.presenterId || '',
    trainee: appt.trainee || '',
    traineeId: appt.traineeId || '',
    client: appt.client || '',
    clientEmail: appt.clientEmail || '',
    clientPhone: appt.clientPhone || '',
    prospectId: appt.prospectId || '',
    notes: appt.notes || '',
    presentationType: appt.presentationType || '',
    presentationTypeSecondary: appt.presentationTypeSecondary || '',
  }, true);
}

// A presenter logs how an appointment they ran went (someone else booked
// it). The database checks it's really theirs to log, saves it on that one
// appointment, and puts any follow-up they booked on the advisor's list.
// The sale or recruit still counts for the advisor.
export async function logPresentedAppointment(id, data) {
  invalidateAppointments();
  const { data: out, error } = await supabase.rpc('log_presented_appointment', {
    p_appointment: id,
    p_data: {
      outcome: data.outcome || '',
      officiallySold: !!data.officiallySold,
      targetPremium: data.officiallySold && Number(data.targetPremium) > 0 ? String(data.targetPremium) : '',
      officiallyRecruited: !!data.officiallyRecruited,
      followUpScheduled: data.followUpScheduled,
      followUpDate: data.followUpScheduled === true ? data.followUpDate : '',
      followUpTime: data.followUpScheduled === true ? data.followUpTime : '',
      interestedTax: data.interestedTax,
      interestedInsurance: data.interestedInsurance,
      followUpDateSetOption: defaultDateSetOption(),
      followUpWeekOf: weekStartOf(todayStr()),
    },
  });
  invalidateAppointments();
  if (error || !out) return { ok: false, error: error ? error.message : 'failed' };
  return { ok: true, record: rowToRecord(out.appointment), followUp: out.followUp ? rowToRecord(out.followUp) : null };
}

// Links an appointment to a prospect on your list (or unlinks it, with null).
export async function linkAppointmentToProspect(appointmentId, prospectId) {
  invalidateAppointments();
  const { data, error } = await supabase.from('appointments').update({ prospect_id: prospectId || null }).eq('id', appointmentId).select().single();
  invalidateAppointments();
  if (error) return { ok: false };
  return { ok: true, record: rowToRecord(data) };
}

export function inviteFailureMessage(code, isUpdate = false) {
  if (code === 'too_soon') return "Saved. An invite for this appointment was just sent, so another wasn't sent — wait a minute and try again.";
  if (code === 'daily_limit') return "Saved, but you've hit today's limit for emailed invites. Try again tomorrow.";
  if (code === 'email_not_configured') return isUpdate
    ? "Saved, but the updated invite wasn't emailed — PaceLedger's email sending isn't set up yet."
    : "Saved, but the invite wasn't emailed — connect Google Calendar (Calendar tab), or ask your admin to finish PaceLedger's email setup.";
  return "Saved, but the invite couldn't be emailed. You can try again by editing the appointment and checking \"Email an updated invite\".";
}

// Records who the Zoom link was sent to, and how ('google' or 'email').
export async function markInviteSent(id, emails, method) {
  invalidateAppointments();
  const { error } = await supabase.from('appointments')
    .update({ invitee_emails: emails, invite_method: method, invite_sent_at: new Date().toISOString() }).eq('id', id);
  invalidateAppointments();
  return !error;
}

// Notes on the appointment that it has an intake form (on: false when the
// form is removed).
export async function setAppointmentIntakeRequested(id, on) {
  invalidateAppointments();
  const { error } = await supabase.from('appointments').update({ client_intake_requested: !!on }).eq('id', id);
  invalidateAppointments();
  return !error;
}

// Saves a client's email or phone typed in while sending them something.
export async function saveAppointmentContact(id, { clientEmail, clientPhone }) {
  const payload = {};
  if (clientEmail !== undefined) payload.client_email = clientEmail || null;
  if (clientPhone !== undefined) payload.client_phone = clientPhone || null;
  if (!Object.keys(payload).length) return true;
  invalidateAppointments();
  const { error } = await supabase.from('appointments').update(payload).eq('id', id);
  invalidateAppointments();
  return !error;
}

export async function deleteAppointmentRow(id) {
  invalidateAppointments();
  const { error } = await supabase.from('appointments').delete().eq('id', id);
  invalidateAppointments();
  return !error;
}

// What a logged appointment came to, in a few words: "Went well · Sold · $3,200".
export function loggedSummary(a) {
  return [
    (OUTCOME_OPTIONS.find(o => o.value === a.outcome) || {}).label,
    a.officiallySold ? `Sold${Number(a.targetPremium) > 0 ? ` · $${Number(a.targetPremium).toLocaleString('en-US')}` : ''}` : null,
    a.officiallyRecruited ? 'Recruited' : null,
  ].filter(Boolean).join(' · ');
}

export const STATUS_OPTIONS = [
  { value: '', label: 'No status', color: 'none' },
  { value: 'completed', label: 'Completed', color: 'green' },
  { value: 'needs_follow_up', label: 'Needs follow-up', color: 'amber' },
  { value: 'not_completed', label: "Didn't happen", color: 'rust' },
  { value: 'needs_reschedule', label: 'Needs reschedule', color: 'violet' },
];

// Sentinel values for the sidebar's Open Requirements section — distinct
// from any real status value (including '') so they can share the same
// statusView state cleanly.
export const SOLD_PREMIUM_VIEW = '__sold_premium__';

export const ISSUED_PREMIUM_VIEW = '__issued_premium__';

export async function fetchZoomConnectedManagers() {
  const { data, error } = await supabase
    .from('zoom_connected_managers').select('id, display_name').order('display_name');
  if (error) { console.error(error); return []; }
  return data;
}

export const OUTCOME_OPTIONS = [
  { value: 'went_well', label: 'Went well' },
  { value: 'no_show', label: 'No show' },
  { value: 'rescheduled', label: 'Rescheduled' },
  { value: 'not_interested', label: 'Not interested' },
];

export const YES_NO_OPTIONS = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];

export function boolToYesNo(v) { return v === true ? 'yes' : v === false ? 'no' : ''; }

export function yesNoToBool(v) { return v === 'yes' ? true : v === 'no' ? false : null; }

// Shared by My Appointments and the Follow Up tab: saves the follow-up
// answers, auto-creates the next appointment if one was scheduled, and
// spins up an intake candidate once (idempotent against the ORIGINAL
// appointment's flag, so re-saving never creates a second link).
export async function persistFollowUp(user, id, original, data) {
  const followUpTimezone = (original && original.appointmentTimezone) || detectTimezone();
  const ok = await saveFollowUp(id, data, followUpTimezone);
  if (!ok) return { ok: false };
  let newAppt = null;
  // Saving again (say, to add the premium later) doesn't book the same
  // follow-up a second time.
  const sameFollowUp = !!original && original.followUpScheduled === true
    && original.followUpAppointmentDate === data.followUpDate
    && String(original.followUpAppointmentTime || '').slice(0, 5) === String(data.followUpTime || '').slice(0, 5);
  if (data.followUpScheduled === true && data.followUpDate && data.followUpTime && original && !sameFollowUp) {
    const res = await insertFollowUpAppointment(user.id, original, data.followUpDate, data.followUpTime, followUpTimezone);
    if (res.ok) newAppt = res.record;
  }
  if (data.clientIntake === true && original && !original.clientIntakeRequested) {
    const made = await createClientIntakeCandidate({
      advisorId: user.id, advisorName: user.displayName,
      appointmentId: id, clientName: original.client,
    });
    // Straight on to sending it: text, email or copy the link.
    if (made.ok) openIntakeSend({ appointment: { ...original, clientIntakeRequested: true }, candidate: made.record });
  }
  return { ok: true, newAppt, followUpTimezone };
}

export function applyFollowUpToList(prev, id, data, followUpTimezone, newAppt) {
  const status = deriveStatus(data.outcome, data.followUpScheduled);
  const scheduled = data.followUpScheduled === true;
  const updated = prev.map(a => a.id === id ? {
    ...a, ...data, status, followUpCompletedAt: new Date().toISOString(),
    followUpAppointmentDate: scheduled ? data.followUpDate : '',
    followUpAppointmentTime: scheduled ? data.followUpTime : '',
    followUpAppointmentTimezone: scheduled ? followUpTimezone : '',
    followUpAppointmentAt: newAppt ? newAppt.appointmentAt : a.followUpAppointmentAt,
    clientIntakeRequested: a.clientIntakeRequested || data.clientIntake === true,
  } : a);
  return newAppt ? [...updated, newAppt] : updated;
}
