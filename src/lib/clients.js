// My work → Clients: everyone you've put on your list, booked, presented,
// sold or recruited, with one profile per person. Each person's stage comes
// from what PaceLedger already records (appointments, outcomes, policies,
// intake forms, sign-ups), so there's no status to set by hand. Pure
// functions; the screen is screens/Clients.jsx.
import { isPastAppointment, isPolicyIssued, OUTCOME_OPTIONS } from '../data/appointments.js';
import { normName, possibleMatches, prospectNameKey, prospectTotalChecked } from '../data/prospects.js';
import { apptClock, apptLocalDate, apptStartMs } from './dates.js';
import { splitPercentOf } from './credit.js';

// Checked top to bottom; the first that fits is the person's stage.
//   outcome    their latest appointment is over and has no outcome logged
//   recruited  signed up through your link (or marked recruited)
//   client     a policy is issued (effective date here, requirements done)
//   pending    sold, not issued yet
//   followup   a follow-up is booked, or the last one needs a next step
//   booked     an appointment is coming up
//   closed     the last outcome was "not interested"
//   prospect   on your list, nothing booked yet
export const CLIENT_STAGES = {
  outcome: { label: 'Needs outcome', plural: 'Needs outcome' },
  recruited: { label: 'Recruited', plural: 'Recruited' },
  client: { label: 'Client', plural: 'Clients' },
  pending: { label: 'Sold · pending issue', short: 'Sold · pending', plural: 'Sold · pending' },
  followup: { label: 'Follow-up', plural: 'Follow-up' },
  booked: { label: 'Booked', plural: 'Booked' },
  closed: { label: 'Not interested', plural: 'Not interested' },
  prospect: { label: 'Prospect', plural: 'Prospects' },
};
// The filters on the list, in order. Everyone leaves out "Not interested";
// "You presented" is the people your team booked that you presented (see
// inFilter).
export const CLIENT_FILTERS = ['all', 'outcome', 'followup', 'booked', 'pending', 'client', 'recruited', 'prospect', 'closed', 'presented'];
export const filterLabel = f => (f === 'all' ? 'Everyone' : f === 'presented' ? 'You presented' : CLIENT_STAGES[f].plural);

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

  let stage;
  if (lastPast && !lastPast.followUpCompletedAt) stage = 'outcome';
  else if (recruited) stage = 'recruited';
  else if (issued.length || markedSoldOnly) stage = 'client';
  else if (pending.length) stage = 'pending';
  else if (nextUp) stage = nextUp.isFollowUp ? 'followup' : 'booked';
  else if (lastPast && lastPast.outcome === 'not_interested') stage = 'closed';
  else if (lastPast) stage = 'followup';
  else stage = 'prospect';

  // What to do next: a line, a smaller line, the one-tap action, and where
  // it sorts in "Next step first" (lower first).
  let next = '', sub = '', action = null, rank = 9, order = 0;
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
  } else if (stage === 'followup' || stage === 'booked') {
    if (nextUp) comingUp();
    else {
      const o = lastPast.outcome;
      const day = dayWord(apptStartMs(lastPast), now);
      if (o === 'rescheduled' || lastPast.status === 'needs_reschedule') {
        next = 'Pick a new time'; sub = `Rescheduled ${day}`;
        action = presented ? null : { kind: 'change', label: 'Pick a new time', appt: lastPast };
      } else if (o === 'no_show') {
        next = 'Rebook: no show'; sub = day;
        action = presented ? null : { kind: 'book', label: 'Book again' };
      } else {
        next = o === 'went_well' ? 'Book the follow-up' : 'Book the next appointment';
        sub = o === 'went_well' ? `Went well ${day}` : `Last met ${day}`;
        action = presented ? null : { kind: 'book', label: 'Book follow-up' };
      }
      rank = 1; order = apptStartMs(lastPast);
    }
  } else if (stage === 'closed') {
    next = 'Not interested'; sub = `${dayWord(apptStartMs(lastPast), now)} · book again any time`;
    action = presented ? null : { kind: 'book', label: 'Book again' }; rank = 7; order = -apptStartMs(lastPast);
  } else {
    next = 'Call to book'; sub = `${score ? `${score} of 9 scored` : 'Not scored yet'}${p && p.createdAt ? ` · added ${dayWord(ms(p.createdAt), now)}` : ''}`;
    action = { kind: 'book', label: 'Book' }; rank = 4; order = -(score * 1e13) - (ms(p && p.createdAt) || 0) / 1e3;
  }

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
    stage, next, sub, action, rank, order, lastAt,
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
