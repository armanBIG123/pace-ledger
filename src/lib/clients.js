// My work → Clients: everyone you've put on your list, booked, presented,
// sold or recruited, with one profile per person. Each person's stage comes
// from what PaceLedger already records (appointments, outcomes, policies,
// intake forms, sign-ups), so there's no status to set by hand. So does
// when to follow up: logging an outcome with nothing booked sets the next
// contact date (a no-show tomorrow, went well in 2 days, not interested in
// 90), and a touch (Called, Left voicemail…) moves it on. Pure functions;
// the screen is screens/Clients.jsx.
import { isPastAppointment, isPolicyIssued, OUTCOME_OPTIONS } from '../data/appointments.js';
import { normName, possibleMatches, prospectNameKey, prospectTotalChecked } from '../data/prospects.js';
import { addDays, apptClock, apptLocalDate, apptStartMs, fmtDate, parseDate } from './dates.js';
import { splitPercentOf } from './credit.js';

// Checked top to bottom; the first that fits is the person's stage.
//   outcome    their latest appointment is over and has no outcome logged
//   recruited  signed up through your link (or marked recruited)
//   client     a policy is issued (effective date here, requirements done)
//   pending    sold, not issued yet
//   booked     an appointment (or a follow-up) is coming up
//   followup   nothing booked, and the last one needs a next step; also
//              "not interested" once it's time to check back in
//   closed     the last outcome was "not interested"
//   prospect   on your list, nothing booked yet
export const CLIENT_STAGES = {
  outcome: { label: 'Needs outcome', plural: 'Log outcome' },
  recruited: { label: 'Recruited', plural: 'Recruited' },
  client: { label: 'Client', plural: 'Clients' },
  pending: { label: 'Sold · pending issue', short: 'Sold · pending', plural: 'Waiting on carrier' },
  followup: { label: 'Follow up', plural: 'Follow up' },
  booked: { label: 'Booked', plural: 'Appointments' },
  closed: { label: 'Not interested', plural: 'Not interested' },
  prospect: { label: 'Prospect', plural: 'Prospects' },
};
// The pipeline bar on Clients, left to right: the order people move through.
// Logging an appointment moves someone into Appointments; logging the
// outcome comes after it.
export const PIPELINE = ['prospect', 'booked', 'outcome', 'followup', 'pending', 'client'];
// The filters, in order. Everyone leaves out "Not interested"; "You
// presented" is the people your team booked that you presented (see
// inFilter). The last three live under More.
export const CLIENT_FILTERS = ['all', ...PIPELINE, 'recruited', 'closed', 'presented'];
export const filterLabel = f => (f === 'all' ? 'Everyone' : f === 'presented' ? 'You presented' : CLIENT_STAGES[f].plural);

// Follow-ups: when to reach out again, in days from when the outcome was
// logged (with nothing booked), and from a touch.
export const NEXT_CONTACT_DAYS = { no_show: 1, rescheduled: 1, went_well: 2, not_interested: 90 };
export const TOUCH_DAYS = { 'No answer': 2, 'Left voicemail': 2 };
export const touchDays = tag => TOUCH_DAYS[tag] || 3;
export const COLD_DAYS = 14;  // no contact this long, and due: going cold
export const QUIET_DAYS = 30; // this far past due: gone quiet (out of Do now)
export function nextContactDays(outcome, status) {
  if (NEXT_CONTACT_DAYS[outcome] != null) return NEXT_CONTACT_DAYS[outcome];
  return status === 'needs_reschedule' || status === 'not_completed' ? 1 : 2;
}
// 'YYYY-MM-DD' n days on.
export const plusDays = (dateStr, n) => fmtDate(addDays(parseDate(dateStr), n));

const DAY = 864e5;
const first = n => (n || '').trim().split(/\s+/)[0] || '';
const money = n => `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const ms = v => (v ? new Date(v).getTime() : NaN);
const dayStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

// "today", "tomorrow", "yesterday", "Thu, Nov 5", or "Oct 12" for an older day
// (with the year when it isn't this year).
export function dayWord(t, now = Date.now()) {
  if (!Number.isFinite(t)) return '';
  const days = Math.round((dayStart(t) - dayStart(now)) / DAY);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  const d = new Date(t);
  if (days > 1 && days < 60) return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}
const dateMs = s => (s ? new Date(`${String(s).slice(0, 10)}T12:00:00`).getTime() : NaN);
// Days from today to a 'YYYY-MM-DD' date: 0 today, 1 tomorrow, -2 two days ago.
export const daysUntil = (dateStr, now = Date.now()) => Math.round((dayStart(dateMs(dateStr)) - dayStart(now)) / DAY);
// "Thu, Nov 5 · 6:30 PM" (in the viewer's time), or "today · 6:30 PM".
export function whenOf(a, now = Date.now()) {
  const day = dayWord(dateMs(apptLocalDate(a)), now);
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${apptClock(a)}`;
}
export function initialsOf(name) {
  const w = (name || '').trim().split(/\s+/).filter(Boolean);
  return `${(w[0] || '?')[0]}${w.length > 1 ? w[w.length - 1][0] : ''}`.toUpperCase();
}
const outcomeWord = a => ((OUTCOME_OPTIONS.find(o => o.value === a.outcome) || {}).label || '').toLowerCase();

// The policy on a sold appointment: the whole premium, your share of it and
// who it's split with. presenter: you presented it (someone else set it).
function policyOf(a, userId, presenter) {
  const p = splitPercentOf(a);
  const mine = !p ? (presenter ? 0 : 100) : presenter ? (a.splitUserId === userId ? p : 0) : 100 - p;
  return {
    appt: a, premium: Number(a.targetPremium) > 0 ? Number(a.targetPremium) : 0,
    split: p > 0, myPercent: mine, partnerId: p ? (presenter ? a.userId : a.splitUserId) : '',
    issued: isPolicyIssued(a), effectiveDate: a.effectiveDate || '', requirementsCompleted: !!a.requirementsCompleted,
    soldOn: a.appointmentDate || '',
  };
}

// Everyone, one entry per person. prospects: your list. appointments: the
// ones you set. presenting: fetchAppointmentsImOn (the ones you presented
// for your team are theirs; they show here tagged "for Dana"). notes:
// follow-up notes; intakes: your intake forms; signups: rows from
// fetchRecruitSignups. nameOf(id): someone's name, for splits and notes.
export function buildClients({ prospects = [], appointments = [], presenting = [], notes = [], intakes = [], signups = [], userId, nameOf = () => '', now = Date.now() }) {
  const byId = new Map(prospects.map(p => [p.id, p]));
  // Appointments not linked to anyone go to the person on your list with
  // the same name (the newest, if two share one).
  const byName = new Map();
  prospects.forEach(p => { const k = prospectNameKey(p); if (k && !byName.has(k)) byName.set(k, p); });
  const groups = new Map();
  const group = (key, init) => { if (!groups.has(key)) groups.set(key, { key, appts: [], prospect: null, owner: null, ...init }); return groups.get(key); };
  prospects.forEach(p => group(`p:${p.id}`, { prospect: p }));
  const loose = [];
  appointments.filter(a => a.userId === userId).forEach(a => {
    const p = (a.prospectId && byId.get(a.prospectId)) || byName.get(normName(a.client)) || null;
    if (p) { group(`p:${p.id}`, { prospect: p }).appts.push(a); return; }
    const k = normName(a.client);
    group(k ? `n:${k}` : `a:${a.id}`).appts.push(a);
    loose.push(a);
  });
  // Ones you presented for someone on your team: theirs, so kept apart.
  presenting.filter(a => a.presentingFor && a.userId !== userId).forEach(a => {
    group(`o:${a.userId}:${a.prospectId || normName(a.client) || a.id}`, { owner: { id: a.userId, name: a.setByName || nameOf(a.userId) || '' } }).appts.push(a);
  });

  const notesBy = new Map();
  notes.forEach(n => { if (!notesBy.has(n.appointment_id)) notesBy.set(n.appointment_id, []); notesBy.get(n.appointment_id).push(n); });
  const intakeBy = new Map();
  intakes.forEach(c => { if (c.source_appointment_id && !intakeBy.has(c.source_appointment_id)) intakeBy.set(c.source_appointment_id, c); });
  const referred = new Map();
  prospects.forEach(p => { if (p.referredById) { if (!referred.has(p.referredById)) referred.set(p.referredById, []); referred.get(p.referredById).push(`p:${p.id}`); } });

  const out = [...groups.values()].map(g => describe(g, { userId, nameOf, now, notesBy, intakeBy, signups, byId, referred }));
  // "Rob Smith" booked but not on your list, and Robert Smith on it: maybe
  // the same person. Each side gets the other, to merge with one tap.
  const looseKey = new Map(loose.map(a => [a.id, normName(a.client) ? `n:${normName(a.client)}` : `a:${a.id}`]));
  const byKey = new Map(out.map(c => [c.key, c]));
  out.forEach(c => {
    if (!c.prospect || c.presented) return;
    possibleMatches(c.prospect, loose).forEach(a => {
      const other = byKey.get(looseKey.get(a.id));
      if (!other) return;
      if (!c.maybeSame.some(m => m.key === other.key)) c.maybeSame.push({ key: other.key, name: other.name, apptIds: [] });
      c.maybeSame.find(m => m.key === other.key).apptIds.push(a.id);
      if (!other.maybeSame.some(m => m.key === c.key)) other.maybeSame.push({ key: c.key, name: c.name, apptIds: other.appts.map(x => x.id) });
    });
  });
  return out;
}

function describe(g, { userId, nameOf, now, notesBy, intakeBy, signups, byId, referred }) {
  const p = g.prospect;
  const presented = !!g.owner;
  const appts = g.appts.slice().sort((x, y) => apptStartMs(x) - apptStartMs(y));
  const latest = appts[appts.length - 1];
  const name = p ? `${p.firstName || ''} ${p.lastName || ''}`.trim() : (latest && latest.client) || 'No name';
  const past = appts.filter(isPastAppointment);
  const upcoming = appts.filter(a => !isPastAppointment(a));
  const lastPast = past[past.length - 1] || null;
  const nextUp = upcoming[0] || null;
  const policies = appts.filter(a => a.officiallySold).map(a => policyOf(a, userId, presented));
  const issued = policies.filter(x => x.issued);
  const pending = policies.filter(x => !x.issued);
  const ids = new Set(appts.map(a => a.id));
  const key = normName(name);
  const signup = (signups || []).find(s => (s.appointmentId && ids.has(s.appointmentId))
    || (!presented && s.uplineId === userId && normName(s.recruitName) === key)) || null;
  const recruited = !!signup || appts.some(a => a.officiallyRecruited) || !!(p && p.markedRecruited);
  const markedSoldOnly = !!(p && p.markedSold && !policies.length);
  const withWho = a => (a.presenter && a.presenterId !== userId && normName(a.presenter) !== normName(nameOf(userId)) ? ` with ${first(a.presenter)}` : '');
  const apptWord = a => (a.isFollowUp ? 'Follow-up' : 'Appointment');

  // Follow-ups: when to reach out again. It comes from the latest logged
  // appointment when nothing is booked: the date saved with the outcome or a
  // touch, or else worked out from the outcome (NEXT_CONTACT_DAYS).
  const loggedOn = lastPast && lastPast.followUpCompletedAt ? fmtDate(new Date(lastPast.followUpCompletedAt)) : '';
  const dueOn = loggedOn && !nextUp ? (lastPast.nextContactOn || plusDays(loggedOn, nextContactDays(lastPast.outcome, lastPast.status))) : '';
  const dueIn = dueOn ? daysUntil(dueOn, now) : null;
  // The last time you were in touch: the appointment, its log, or a note.
  const allNotes = appts.flatMap(a => notesBy.get(a.id) || []).sort((x, y) => ms(x.created_at) - ms(y.created_at));
  const lastNote = allNotes[allNotes.length - 1] || null;
  const lastTouchAt = Math.max(0, ...[lastPast && apptStartMs(lastPast), lastPast && ms(lastPast.followUpCompletedAt), lastNote && ms(lastNote.created_at)].filter(Number.isFinite));
  const quietFor = lastTouchAt ? Math.floor((now - lastTouchAt) / DAY) : 0;
  const notInterested = !!lastPast && lastPast.outcome === 'not_interested';

  let stage;
  if (lastPast && !lastPast.followUpCompletedAt) stage = 'outcome';
  else if (recruited) stage = 'recruited';
  else if (issued.length || markedSoldOnly) stage = 'client';
  else if (pending.length) stage = 'pending';
  else if (nextUp) stage = 'booked';
  // Not interested: back on your follow-ups once it's time to check in.
  else if (notInterested) stage = dueIn != null && dueIn <= 0 ? 'followup' : 'closed';
  else if (lastPast) stage = 'followup';
  else stage = 'prospect';
  const following = stage === 'followup';
  const quiet = following && dueIn < -QUIET_DAYS;
  const dueNow = following && dueIn <= 0 && !quiet;
  const cold = dueNow && !notInterested && quietFor >= COLD_DAYS;
  const checkBack = following && notInterested;
  // The appointment a touch or a new date is saved on.
  const touchAppt = following && !presented ? lastPast : null;

  // What to do next: a line, a smaller line, the one-tap action, and where
  // it sorts in "Next step first" (lower first).
  let next = '', sub = '', action = null, rank = 9, order = 0, chip = '';
  const comingUp = () => { next = `${apptWord(nextUp)} ${whenOf(nextUp, now)}${withWho(nextUp)}`; sub = ''; action = presented ? null : { kind: 'change', label: 'Change', appt: nextUp }; rank = 3; order = apptStartMs(nextUp); };
  const score = p ? prospectTotalChecked(p) : 0;
  if (stage === 'outcome') {
    next = 'Log how it went'; sub = `${whenOf(lastPast, now)}${withWho(lastPast)}`;
    action = { kind: presented ? 'logPresented' : 'log', label: 'Log outcome', appt: lastPast }; rank = 0; order = apptStartMs(lastPast);
  } else if (stage === 'recruited') {
    const joined = signup ? `Joined your team ${dayWord(ms(signup.signedUpAt), now)}` : 'Recruited';
    if (nextUp) { comingUp(); sub = joined; } else { next = joined; rank = 6; order = -(ms(signup && signup.signedUpAt) || 0); }
  } else if (stage === 'client') {
    const last = issued[issued.length - 1];
    const issuedLine = last ? `Issued ${dayWord(dateMs(last.effectiveDate), now)}${last.premium ? ` · ${money(last.premium)}` : ''}` : 'Marked sold on your list';
    if (nextUp) { comingUp(); sub = issuedLine; } else {
      next = 'Ask for referrals'; sub = issuedLine; rank = 5; order = -(dateMs(last && last.effectiveDate) || 0);
      action = presented || !p ? null : { kind: 'referrals', label: 'Ask for referrals' };
    }
  } else if (stage === 'pending') {
    const x = pending[0];
    next = !x.requirementsCompleted ? 'Requirements open' : !x.effectiveDate ? 'Set the effective date' : `Effective ${dayWord(dateMs(x.effectiveDate), now)}`;
    sub = `${x.premium ? `${money(x.premium)} · ` : ''}sold ${dayWord(dateMs(x.soldOn), now)}`;
    action = presented ? null : { kind: 'policy', label: !x.requirementsCompleted ? 'Requirements' : 'Policy' };
    rank = 2; order = dateMs(x.soldOn) || 0;
    if (nextUp) { sub = `${sub} · next: ${whenOf(nextUp, now)}`; }
  } else if (stage === 'booked') {
    comingUp();
    if (nextUp.isFollowUp) chip = 'Follow-up booked';
  } else if (following) {
    const o = lastPast.outcome;
    const day = dayWord(apptStartMs(lastPast), now);
    if (checkBack) {
      next = 'Check back in'; sub = `Said not interested ${day}`; chip = 'Check back';
      action = presented ? null : { kind: 'book', label: 'Book again' };
    } else if (o === 'rescheduled' || lastPast.status === 'needs_reschedule') {
      next = 'Pick a new time'; sub = `Rescheduled ${day}`;
      action = presented ? null : { kind: 'change', label: 'Pick a new time', appt: lastPast };
    } else if (o === 'no_show') {
      next = 'Rebook: no show'; sub = `Missed ${day}`;
      action = presented ? null : { kind: 'book', label: 'Book again' };
    } else {
      next = o === 'went_well' ? 'Book the follow-up' : 'Book the next appointment';
      sub = o === 'went_well' ? `Went well ${day}` : `Last met ${day}`;
      action = presented ? null : { kind: 'book', label: 'Book follow-up' };
    }
    // The last thing you did, when it came after the outcome.
    if (lastNote && ms(lastNote.created_at) > ms(lastPast.followUpCompletedAt)) {
      const t = String(lastNote.note || '').trim();
      sub = `${sub} · last: ${t.length > 34 ? `${t.slice(0, 33)}…` : t}`;
    }
    // Due ones first (the longest overdue on top), then later ones; gone quiet last.
    rank = quiet ? 6.5 : dueNow ? 1 : 3.5; order = dateMs(dueOn);
  } else if (stage === 'closed') {
    next = 'Not interested'; sub = `${dayWord(apptStartMs(lastPast), now)} · check back ${dayWord(dateMs(dueOn), now)}`;
    action = presented ? null : { kind: 'book', label: 'Book again' }; rank = 7; order = -apptStartMs(lastPast);
  } else {
    next = 'Call to book'; sub = `${score ? `${score} of 9 scored` : 'Not scored yet'}${p && p.createdAt ? ` · added ${dayWord(ms(p.createdAt), now)}` : ''}`;
    action = { kind: 'book', label: 'Book' }; rank = 4; order = -(score * 1e13) - (ms(p && p.createdAt) || 0) / 1e3;
  }
  // A policy issued in the last 30 days: time to deliver it and ask for names.
  const lastIssued = issued[issued.length - 1];
  const recentIssue = stage === 'client' && !!lastIssued && daysUntil(lastIssued.effectiveDate, now) >= -30;

  // Everything so far, newest first.
  const timeline = [];
  const add = (at, tone, title, detail = '', extra = {}) => { if (Number.isFinite(at)) timeline.push({ at, tone, title, detail, ...extra }); };
  if (p) {
    const referrer = p.referredById && byId.get(p.referredById);
    const bits = [referrer ? `Referred by ${referrer.firstName} ${referrer.lastName}` : p.source, score ? `${score} of 9` : ''].filter(Boolean);
    add(ms(p.createdAt), 'prospect', 'Added to your list', bits.join(' · '));
  }
  appts.forEach(a => {
    const start = apptStartMs(a);
    const kind = apptWord(a);
    (notesBy.get(a.id) || []).forEach(n => add(ms(n.created_at), 'note', n.note, n.author_id && n.author_id !== userId ? `Note by ${n.author_name || nameOf(n.author_id) || 'your team'}` : 'Note', { noteId: n.id }));
    if (!isPastAppointment(a)) {
      // The day is already in front of it ("Mon, Nov 9 · 6:00 PM with Dana").
      add(start, a.isFollowUp ? 'followup' : 'booked', `${kind} coming up`, `${apptClock(a)}${withWho(a)}`, { appt: a, act: presented ? null : 'change' });
      return;
    }
    if (!a.isFollowUp) add(ms(a.createdAt), 'booked', 'Booked', `For ${whenOf(a, now)}${withWho(a)}`);
    const logged = !!a.followUpCompletedAt;
    const word = a.officiallySold ? 'sold' : outcomeWord(a) || (logged ? 'logged' : 'outcome not logged');
    const pol = a.officiallySold ? policyOf(a, userId, presented) : null;
    const bits = [
      withWho(a).trim(),
      pol && pol.premium ? money(pol.premium) : '',
      pol && pol.split ? `split ${pol.myPercent}/${100 - pol.myPercent} with ${nameOf(pol.partnerId) || 'your partner'}` : '',
      a.officiallyRecruited ? 'recruited' : '',
      a.followUpScheduled === true ? 'follow-up booked' : '',
      logged && a.outcomeLoggedBy && a.outcomeLoggedBy !== userId ? `logged by ${nameOf(a.outcomeLoggedBy) || first(a.presenter) || 'your presenter'}` : '',
    ].filter(Boolean);
    const tone = !logged ? 'outcome' : a.officiallySold ? (isPolicyIssued(a) ? 'client' : 'pending') : a.outcome === 'not_interested' ? 'closed' : a.outcome === 'went_well' ? 'followup' : 'booked';
    add(start, tone, `${kind}: ${word}`, bits.join(' · '), { appt: a, act: logged ? null : presented ? 'logPresented' : 'log' });
    if (pol && pol.issued) add(dateMs(pol.effectiveDate), 'client', 'Policy issued', `${pol.premium ? `${money(pol.premium)} target premium · ` : ''}requirements complete`);
    const c = intakeBy.get(a.id);
    if (c && !presented) {
      if (c.status === 'submitted') add(ms(c.submitted_at), 'client', 'Client intake form received');
      else if (c.sent_at) add(ms(c.sent_at), 'booked', `Intake form ${c.sent_via === 'text' ? 'texted' : c.sent_via === 'email' ? 'emailed' : 'link copied'}`, 'Not filled in yet');
      else add(ms(c.created_at), 'booked', 'Intake form made', 'Not sent yet');
    }
  });
  if (signup) add(ms(signup.signedUpAt), 'recruited', 'Joined your team', 'Signed up through your link');
  timeline.sort((x, y) => y.at - x.at);

  const lastAt = Math.max(0, ...timeline.filter(t => t.at <= now).map(t => t.at));
  const contactFrom = f => (p && p[f]) || ([...appts].reverse().find(a => a[f === 'phone' ? 'clientPhone' : 'clientEmail']) || {})[f === 'phone' ? 'clientPhone' : 'clientEmail'] || '';
  return {
    key: g.key, name, prospect: p, presented, owner: g.owner, virtual: !p && !presented,
    stage, chip, next, sub, action, rank, order, lastAt,
    dueOn, dueIn, dueNow, quiet, cold, checkBack, lastTouchAt, quietFor, touchAppt, recentIssue,
    appts, past, upcoming, lastPast, nextUp, policies, signup, recruited,
    phone: contactFrom('phone'), email: contactFrom('email'),
    timeline, referrals: p ? referred.get(p.id) || [] : [], maybeSame: [],
    score,
  };
}

// Search by name or phone (3+ digits).
export function clientMatches(c, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  return c.name.toLowerCase().includes(q) || (!!c.owner && (c.owner.name || '').toLowerCase().includes(q))
    || (digits.length >= 3 && (c.phone || '').replace(/\D/g, '').includes(digits));
}
// People you presented for someone else are under "You presented", and in
// the rest only while their outcome is yours to log, so a presenter's own
// clients aren't buried under the team's.
export function inFilter(c, f) {
  if (f === 'presented') return c.presented;
  if (c.presented && c.stage !== 'outcome') return false;
  if (f === 'all') return c.stage !== 'closed';
  return c.stage === f;
}
export function filterCounts(list) {
  const n = {};
  CLIENT_FILTERS.forEach(f => { n[f] = list.filter(c => inFilter(c, f)).length; });
  return n;
}
// 'next': what needs doing first. 'recent': last activity. 'name': A to Z.
export function sortClients(list, how = 'next') {
  const byName = (a, b) => a.name.localeCompare(b.name);
  const fn = how === 'name' ? byName
    : how === 'recent' ? (a, b) => b.lastAt - a.lastAt || byName(a, b)
    : (a, b) => a.rank - b.rank || a.order - b.order || byName(a, b);
  return list.slice().sort(fn);
}

// Everyone, in sections (the Clients list with no stage picked). Do now is
// always there; the others only when someone's in them. limit: how many
// show before "Show all"; fold: starts folded.
export function clientSections(list) {
  const mine = list.filter(c => inFilter(c, 'all'));
  const pick = f => sortClients(mine.filter(f), 'next');
  return [
    { key: 'now', title: 'Do now', hint: 'Outcomes to log first, then follow-ups that are due.', people: pick(c => c.stage === 'outcome' || c.dueNow) },
    { key: 'soon', title: 'Coming up', hint: 'Booked appointments and follow-ups.', people: pick(c => c.stage === 'booked'), book: true },
    { key: 'later', title: 'Follow up later', hint: "Nothing booked yet. Each one moves to Do now when it's due.", people: pick(c => c.stage === 'followup' && c.dueIn > 0) },
    { key: 'carrier', title: 'Waiting on the carrier', hint: 'Sold, not issued yet. Oldest first.', people: pick(c => c.stage === 'pending') },
    { key: 'issued', title: 'Recently issued', hint: 'Deliver the policy, then ask for referrals.', people: pick(c => c.recentIssue) },
    { key: 'prospects', title: 'Prospects', hint: 'Highest score first. Book from any row.', people: pick(c => c.stage === 'prospect'), limit: 5, book: true },
    { key: 'quiet', title: 'Gone quiet', hint: 'Over a month past due. Worth one more try.', people: pick(c => c.quiet), fold: true },
  ].filter(s => s.key === 'now' || s.people.length);
}

// "today 6 PM", "Thu 6:30 PM", "Nov 30 6 PM": short enough for the bar.
function shortWhen(a, now = Date.now()) {
  const d = daysUntil(apptLocalDate(a), now);
  const day = d === 0 ? 'today' : d === 1 ? 'tomorrow' : d > 1 && d <= 6
    ? new Date(dateMs(apptLocalDate(a))).toLocaleDateString('en-US', { weekday: 'short' })
    : new Date(dateMs(apptLocalDate(a))).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${day} ${apptClock(a).replace(':00 ', ' ')}`;
}

// The numbers on the pipeline bar, one per stage: { n, sub, warn }.
export function pipelineCounts(list, now = Date.now()) {
  const mine = list.filter(c => inFilter(c, 'all'));
  const of = st => mine.filter(c => c.stage === st);
  const plural = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`;
  const prospects = of('prospect');
  const booked = sortClients(of('booked'), 'next');
  const outcome = of('outcome');
  const follow = of('followup');
  const pending = of('pending');
  const clients = of('client');
  const oldest = outcome.reduce((m, c) => Math.max(m, -daysUntil(apptLocalDate(c.lastPast), now)), 0);
  const due = follow.filter(c => c.dueNow).length, cold = follow.filter(c => c.cold).length;
  const late = pending.filter(c => c.policies.some(x => !x.issued && -daysUntil(x.soldOn, now) >= 14)).length;
  const waiting = pending.reduce((t, c) => t + c.policies.filter(x => !x.issued).reduce((s, x) => s + x.premium * (x.myPercent / 100), 0), 0);
  const month = new Date(now).toLocaleDateString('en-US', { month: 'short' });
  const issuedThisMonth = clients.filter(c => c.policies.some(x => x.issued && x.effectiveDate.slice(0, 7) === fmtDate(new Date(now)).slice(0, 7))).length;
  return {
    prospect: { n: prospects.length, sub: `${prospects.filter(c => c.score > 0).length} scored` },
    booked: { n: booked.length, sub: booked.length ? `Next: ${shortWhen(booked[0].nextUp, now)}` : 'Nothing booked' },
    outcome: { n: outcome.length, sub: outcome.length ? `Oldest: ${oldest === 0 ? 'today' : plural(oldest, 'day')}` : 'All logged', warn: outcome.length > 0 },
    followup: { n: follow.length, sub: due ? `${due} due${cold ? ` · ${cold} going cold` : ''}` : follow.length ? 'Nothing due today' : 'None right now', warn: due > 0 },
    pending: { n: pending.length, sub: pending.length ? `${money(Math.round(waiting))}${late ? ` · ${late} late` : ''}` : 'None waiting', warn: late > 0 },
    client: { n: clients.length, sub: `${issuedThisMonth} issued in ${month}` },
  };
}

// The little tag on the right of a row: how long, or when. { text, tone }
// with tone rust (late), amber (today), blue (soon), green, or plain.
export function dueBadge(c, now = Date.now()) {
  if (c.stage === 'outcome') {
    const d = -daysUntil(apptLocalDate(c.lastPast), now);
    return { text: d <= 0 ? 'Today' : d === 1 ? '1 day ago' : `${d} days ago`, tone: d <= 0 ? 'amber' : 'rust' };
  }
  if (c.stage === 'followup') {
    if (c.quiet) return { text: 'Gone quiet', tone: 'plain' };
    if (c.cold) return { text: `Going cold · ${c.quietFor} days`, tone: 'rust', cold: true };
    if (c.dueIn < 0) return { text: `${-c.dueIn} day${c.dueIn === -1 ? '' : 's'} overdue`, tone: 'rust' };
    if (c.dueIn === 0) return { text: 'Due today', tone: 'amber' };
    const when = dayWord(dateMs(c.dueOn), now);
    return { text: `Due ${c.dueIn <= 6 ? when.replace(/,.*$/, '') : when}`, tone: 'plain' };
  }
  if (c.stage === 'pending') {
    const x = c.policies.find(y => !y.issued);
    if (x && x.requirementsCompleted && x.effectiveDate) return { text: `Issues ${dayWord(dateMs(x.effectiveDate), now).replace(/^[A-Z][a-z]{2}, /, '')}`, tone: 'green' };
    const d = x ? -daysUntil(x.soldOn, now) : 0;
    return { text: d === 1 ? '1 day' : `${d} days`, tone: d >= 14 ? 'rust' : d >= 7 ? 'amber' : 'plain' };
  }
  if (c.stage === 'booked' && c.nextUp) {
    const d = daysUntil(apptLocalDate(c.nextUp), now);
    if (d === 0) return { text: 'Today', tone: 'blue' };
    if (d === 1) return { text: 'Tomorrow', tone: 'blue' };
    return null;
  }
  return null;
}

// Follow-ups due now (Today's Do next): going cold first, then the longest
// overdue.
export function followUpsDue(list) {
  return list.filter(c => !c.presented && c.dueNow)
    .sort((a, b) => (b.cold - a.cold) || (a.dueIn - b.dueIn) || a.name.localeCompare(b.name));
}
