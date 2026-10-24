// How recruits are counted (see migration-recruits-from-signups.sql).
//
// From the switch on, a recruit counts when someone signs up through a
// recruit link: for the person they join under, in the week they signed up.
// Before the switch, an appointment marked "Officially recruited" counted;
// those still count for those weeks, so past numbers don't move.
//
// since: when the switch happened (an ISO time), or null if the database
// update hasn't been run yet (then everything counts the old way).

// A moment as a Central-time date (YYYY-MM-DD), like the app's weeks.
export function centralDate(iso) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}

// Does this appointment's "Officially recruited" still count?
export function tickboxRecruitCounts(a, since) {
  if (!a || !a.officiallyRecruited) return false;
  return !since || (a.appointmentDate || '') < centralDate(since);
}

// Sign-ups (from fetchRecruitSignups) credited to this person between two
// dates (YYYY-MM-DD, inclusive).
export function signupsFor(signups, userId, start, end) {
  return (signups || []).filter(s => s.uplineId === userId && (!start || centralDate(s.signedUpAt) >= start) && (!end || centralDate(s.signedUpAt) <= end));
}
