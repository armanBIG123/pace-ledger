// Prospects: scoring, loading and saving, plus the Memory Jogger list.
import { selectAll } from './paged.js';
import { supabase } from '../supabaseClient.js';
import { tidyName } from '../lib/names.js';

// ---------------------------------------------------------------------
// systems — prospecting ability
// ---------------------------------------------------------------------
// Characteristics 1-5 skew toward sale potential; 6-9 skew toward recruit
// potential. A prospect strong in both is good for either.
export const SALE_CHARACTERISTICS = [
  { key: 'charAge25Plus', dbCol: 'char_age_25_plus', label: 'Is 25 years or older', hint: 'Key age for financial planning' },
  { key: 'charMarried', dbCol: 'char_married_or_relationship', label: 'Married, or in a relationship', hint: 'Someone big they care about' },
  { key: 'charDependents', dbCol: 'char_has_dependents', label: 'Has children or dependents', hint: 'People relying on them' },
  { key: 'charHomeowner', dbCol: 'char_homeowner', label: 'Is a homeowner', hint: 'Needs to protect their assets' },
  { key: 'charWorking', dbCol: 'char_currently_working', label: 'Is currently working', hint: 'Needs to protect their income' },
];

export const RECRUIT_CHARACTERISTICS = [
  { key: 'charAmbitious', dbCol: 'char_ambitious', label: 'Ambitious' },
  { key: 'charDissatisfied', dbCol: 'char_dissatisfied', label: 'Dissatisfied with where they are' },
  { key: 'charCoachable', dbCol: 'char_coachable', label: 'Coachable / positive mindset and attitude' },
  { key: 'charEntrepreneur', dbCol: 'char_entrepreneur', label: 'Entrepreneur' },
];

export const ALL_CHARACTERISTICS = [...SALE_CHARACTERISTICS, ...RECRUIT_CHARACTERISTICS];

export const LEANING_LABELS = { none: 'Not yet scored', sale: 'Sale potential', recruit: 'Recruit potential', both: 'Both' };

export const PROSPECT_SOURCES = ['Referral', 'Cold outreach', 'Event', 'Social media', 'Other'];

export function prospectSaleScore(p) { return SALE_CHARACTERISTICS.filter(c => p[c.key]).length; }

export function prospectRecruitScore(p) { return RECRUIT_CHARACTERISTICS.filter(c => p[c.key]).length; }

export function prospectTotalChecked(p) { return prospectSaleScore(p) + prospectRecruitScore(p); }

export function prospectLeaningKey(p) {
  const s = prospectSaleScore(p), r = prospectRecruitScore(p);
  if (s === 0 && r === 0) return 'none';
  if (s > r) return 'sale';
  if (r > s) return 'recruit';
  return 'both';
}

// Carries a prospect's leaning and notes straight into the appointment
// form, not just their name, so logging the resulting appointment doesn't
// mean re-entering what was already captured while prospecting.
export function prospectToAppointmentPrefill(p) {
  const leaning = prospectLeaningKey(p);
  return {
    client: `${p.firstName} ${p.lastName}`,
    notes: p.notes || '',
    clientEmail: p.email || '',
    clientPhone: p.phone || '',
    prospectId: p.id,
    typeRecruit: leaning === 'recruit' || leaning === 'both',
    typeSale: leaning === 'sale' || leaning === 'both',
  };
}

// Which prospects have an appointment: linked to them directly, or, for an
// appointment that isn't linked to anyone, booked under the same name. A Set
// of prospect ids and names; check it with hasAppointment().
export function bookedProspectKeys(appointments) {
  const keys = new Set();
  (appointments || []).forEach(a => { keys.add(a.prospectId ? a.prospectId : normName(a.client)); });
  return keys;
}
export function hasAppointment(p, keys) {
  return !!keys && (keys.has(p.id) || keys.has(prospectNameKey(p)));
}
// A prospect's appointments, oldest first: the ones linked to them, plus
// unlinked ones under the same name.
export function appointmentsForProspect(p, appointments) {
  const key = prospectNameKey(p);
  return (appointments || [])
    .filter(a => (a.prospectId ? a.prospectId === p.id : normName(a.client) === key))
    .sort((x, y) => `${x.appointmentDate} ${x.appointmentTime}`.localeCompare(`${y.appointmentDate} ${y.appointmentTime}`));
}
// Unlinked appointments that might be this prospect under another spelling
// ("Rob Smith" for Robert Smith): same last name, and one first name starts
// with the other (or they share the first three letters). Exact names are
// already counted, so they're left out.
export function possibleMatches(p, appointments) {
  const first = normName(p.firstName), last = normName(p.lastName), key = prospectNameKey(p);
  if (!first || !last) return [];
  return (appointments || []).filter(a => {
    if (a.prospectId) return false;
    const n = normName(a.client);
    if (!n || n === key) return false;
    const parts = n.split(' ');
    if (parts.length < 2 || parts[parts.length - 1] !== last) return false;
    const f = parts[0];
    return f.startsWith(first) || first.startsWith(f) || (f.length >= 3 && first.length >= 3 && f.slice(0, 3) === first.slice(0, 3));
  });
}

// No "last contacted" field exists yet, so createdAt is the best available
// proxy — a prospect still sitting active (unconverted) two-plus weeks
// after being logged is a fair signal it needs a follow-up nudge.
export const STALE_PROSPECT_DAYS = 14;

export function normName(s) { return (s || '').trim().replace(/\s+/g, ' ').toLowerCase(); }

export function prospectNameKey(p) { return normName(`${p.firstName || ''} ${p.lastName || ''}`); }

// A prospect only counts as stale if nothing has happened with them —
// pass bookedProspectKeys(appointments) and anyone with an appointment on
// the books is no longer considered stale.
export function isStaleProspect(p, booked) {
  if (p.markedRecruited || p.markedSold) return false;
  if (hasAppointment(p, booked)) return false;
  const days = Math.floor((Date.now() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24));
  return days >= STALE_PROSPECT_DAYS;
}

export function rowToProspect(row) {
  const rec = {
    id: row.id, userId: row.user_id,
    firstName: row.first_name, lastName: row.last_name,
    age: row.age, relationshipStrength: row.relationship_strength,
    notes: row.notes || '', createdAt: row.created_at, source: row.source || '',
    email: row.email || '',
    phone: row.phone || '',
    markedSold: row.marked_sold || false, markedRecruited: row.marked_recruited || false,
  };
  ALL_CHARACTERISTICS.forEach(c => { rec[c.key] = !!row[c.dbCol]; });
  return rec;
}

export async function fetchMyProspects(userId) {
  const { data, error } = await selectAll(o => supabase.from('prospects').select('*', o).eq('user_id', userId).order('created_at', { ascending: false }).order('id'));
  if (error) { console.error(error); return []; }
  return data.map(rowToProspect);
}

// For managers/admins — RLS automatically scopes this to their own
// prospects plus their team's (or everyone's, for super_admin), same
// pattern as fetchSoldPolicies.
export async function fetchAllVisibleProspects() {
  const { data, error } = await selectAll(o => supabase.from('prospects').select('*', o).order('created_at', { ascending: false }).order('id'));
  if (error) { console.error(error); return []; }
  return data.map(rowToProspect);
}

export async function insertProspect(userId, form) {
  const payload = {
    user_id: userId,
    first_name: tidyName(form.firstName),
    last_name: tidyName(form.lastName),
    age: form.age ? Number(form.age) : null,
    relationship_strength: form.relationshipStrength,
    notes: form.notes.trim() || null,
    source: form.source || null,
    email: (form.email || '').trim() || null,
    phone: (form.phone || '').trim() || null,
  };
  ALL_CHARACTERISTICS.forEach(c => { payload[c.dbCol] = !!form[c.key]; });
  const { data, error } = await supabase.from('prospects').insert(payload).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, record: rowToProspect(data) };
}

export async function updateProspect(id, form) {
  const payload = {
    first_name: tidyName(form.firstName),
    last_name: tidyName(form.lastName),
    age: form.age ? Number(form.age) : null,
    relationship_strength: form.relationshipStrength,
    notes: form.notes.trim() || null,
    source: form.source || null,
    email: (form.email || '').trim() || null,
    phone: (form.phone || '').trim() || null,
  };
  ALL_CHARACTERISTICS.forEach(c => { payload[c.dbCol] = !!form[c.key]; });
  const { data, error } = await supabase.from('prospects').update(payload).eq('id', id).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, record: rowToProspect(data) };
}

// Just the phone number (Today's call list: "Add number").
export async function updateProspectPhone(id, phone) {
  const { data, error } = await supabase.from('prospects').update({ phone: (phone || '').trim() || null }).eq('id', id).select().single();
  if (error) return { ok: false };
  return { ok: true, record: rowToProspect(data) };
}

export async function updateProspectOutcome(id, { markedSold, markedRecruited }) {
  const payload = {};
  if (markedSold !== undefined) payload.marked_sold = markedSold;
  if (markedRecruited !== undefined) payload.marked_recruited = markedRecruited;
  const { error } = await supabase.from('prospects').update(payload).eq('id', id);
  return !error;
}

export async function deleteProspect(id) {
  const { error } = await supabase.from('prospects').delete().eq('id', id);
  return !error;
}

// A curated subset of BIG's "Prospect List Worksheet - Memory Jogger"
// handout — every category from the original, trimmed down to the
// entries most likely to actually jog a name loose, so it reads as a
// quick nudge rather than a wall of text to scroll through.
export const MEMORY_JOGGER_CATEGORIES = [
  {
    title: 'Family & Friends',
    items: ['Best Friend', "Best Friend's Parents", 'Brother / Sister', 'Brother-in-law / Sister-in-law', 'Cousin', "Spouse's Best Friend", 'Aunt / Uncle', 'Parents'],
  },
  {
    title: 'Who...',
    items: [
      'Is very ambitious', 'Is a consultant or trainer', 'Is in a high-profile job', 'Is a prominent business owner',
      'Recently had children', 'Has influence with others', 'Wants more out of life', 'Missed last promotion',
      'Will be / has been laid off', 'Needs a part-time job', 'Is looking for a new profession', 'Is known by everyone in town',
    ],
  },
  {
    title: 'Who do you know at...',
    items: ['Church', 'Golf Club', 'Health Club', 'Hospital', 'Library', 'Past Jobs', 'Supermarket', 'Volunteer Group', 'Night School'],
  },
  {
    title: 'Who owns or runs a...',
    items: ['Convenience Store', 'Department Store', 'Restaurant', 'Hotel Business', 'Service Station', 'Hardware Store', 'Machine Shop', 'Eye Center'],
  },
  {
    title: 'Who sold you your...',
    items: ['Car / Truck', 'House', 'Car Insurance', 'Furniture', 'Computer', 'Business Machines', 'Office Supplies', 'Telephone System', 'Cable / Satellite TV', 'Jewelry'],
  },
  {
    title: 'Do you know a...',
    items: [
      'Accountant', 'Business Owner', 'Company Executive', 'Contractor', 'Dentist', 'Doctor', 'Engineer', 'Nurse',
      'Pharmacist', 'Real Estate Agent', 'Restaurant Owner', 'Teacher', 'Veterinarian', 'Chiropractor', 'Architect',
    ],
  },
];

// "Who to call": the best-scored people on your list you haven't booked yet.
export function topProspectsToCall(prospects, booked, n = 3) {
  return prospects
    .filter(p => !p.markedSold && !p.markedRecruited && !hasAppointment(p, booked))
    .sort((a, b) => (prospectTotalChecked(b) - prospectTotalChecked(a))
      || ((b.relationshipStrength || 0) - (a.relationshipStrength || 0))
      || String(a.createdAt).localeCompare(String(b.createdAt)))
    .slice(0, n);
}
