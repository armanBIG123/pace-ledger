// Team & admin → Profiles (super admins): the subsidiary checklist for
// entities, and where each person is on the licensing and contracting
// path. Pure functions, so they're easy to check.
import { licensingStatus } from '../licensing.js';
import { fmtDate, todayStr } from './dates.js';

// No progress for this many days = "Stalled".
export const STALLED_DAYS = 7;

export const US_STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'],
  ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'],
  ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
  ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'],
  ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'],
  ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'],
  ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'],
  ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
  ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
];
export const stateName = code => (US_STATES.find(s => s[0] === code) || [code, code])[1];
export function stateCode(nameOrCode) {
  const v = String(nameOrCode || '').trim().toLowerCase();
  const hit = US_STATES.find(s => s[0].toLowerCase() === v || s[1].toLowerCase() === v);
  return hit ? hit[0] : '';
}

// The subsidiary checklist: 3 phases, 9 steps. Each step's items are the
// parts of it that get ticked off (with the date and who ticked them).
export const ENTITY_PHASES = [
  { key: 'p1', label: 'Phase 1', name: 'Application and agreement', steps: [
    { key: 'application', title: 'Subsidiary partner application', short: 'Partner application',
      about: 'Receive, review and approve the completed application.',
      items: [['app_received', 'Received'], ['app_reviewed', 'Reviewed'], ['app_approved', 'Approved']] },
    { key: 'agreement', title: 'Execute operating agreement', short: 'Operating agreement',
      about: 'Prepare it, get signatures from all required parties, and upload the fully executed agreement.',
      items: [['oa_prepared', 'Prepared'], ['oa_signed', 'Signed by all required parties'], ['oa_uploaded', 'Fully executed agreement uploaded']],
      uploadTicks: 'oa_uploaded' },
  ] },
  { key: 'p2', label: 'Phase 2', name: 'Nevada formation', steps: [
    { key: 'name', title: 'Nevada Division of Insurance name approval', short: 'NV DOI name approval',
      about: 'Submit the proposed business name for approval and keep the confirmation.',
      items: [['name_submitted', 'Proposed name submitted'], ['name_approved', 'Name approved, confirmation kept']] },
    { key: 'llc', title: 'Nevada Secretary of State LLC registration', short: 'NV SOS LLC registration',
      about: 'Register the new LLC and get the formation documents.',
      items: [['llc_registered', 'LLC registered'], ['llc_docs', 'Formation documents received']],
      uploadTicks: 'llc_docs', fields: ['nv_entity_number'], fieldsPrompt: 'Add the NV entity #' },
    { key: 'bank', title: 'Establish business bank account', short: 'Business bank account',
      about: 'Open a bank account under the new LLC.',
      items: [['bank_opened', 'Account opened under the new LLC']], fields: ['bank_name'], fieldsPrompt: 'Add the bank name' },
  ] },
  { key: 'p3', label: 'Phase 3', name: 'Licensing and insurance', steps: [
    { key: 'resident', title: 'Nevada resident insurance producer license', short: 'NV resident producer license',
      about: 'Apply for and get the appropriate resident business entity producer license.',
      items: [['res_applied', 'Applied'], ['res_obtained', 'License obtained']], fields: ['resident_license_number', 'entity_npn'],
      fieldsPrompt: 'Add the license # and entity NPN' },
    { key: 'eo', title: 'Errors and omissions', short: 'E&O coverage',
      about: 'Get E&O coverage for the new entity.',
      items: [['eo_obtained', 'Coverage obtained for the new entity']], fields: ['eo_carrier', 'eo_policy_number', 'eo_expires_on'],
      fieldsPrompt: 'Add the carrier, policy # and expiry' },
    { key: 'fg', title: 'F&G carrier appointment', short: 'F&G appointment',
      about: 'Submit the contract paperwork and confirm the carrier appointment is approved.',
      items: [['fg_submitted', 'Contract paperwork submitted'], ['fg_approved', 'Appointment approved']], fields: ['fg_writing_number'],
      fieldsPrompt: 'Add the F&G writing #' },
    { key: 'nonres', title: 'Non-resident insurance licenses', short: 'Non-resident licenses',
      about: 'Get the applicable mandatory override non-resident business entity licenses in the states where the subsidiary will operate.',
      perState: true },
  ] },
];
export const ENTITY_STEPS = ENTITY_PHASES.flatMap(p => p.steps.map(s => ({ ...s, phase: p })));

export const ENTITY_FIELD_LABELS = {
  nv_entity_number: 'NV entity #', bank_name: 'Bank', resident_license_number: 'NV license #', entity_npn: 'Entity NPN',
  eo_carrier: 'E&O carrier', eo_policy_number: 'E&O policy #', eo_expires_on: 'E&O expires', fg_writing_number: 'F&G writing #',
};

// The states that need a non-resident license: where it will operate,
// except the state it's formed in.
export function nonResidentStates(entity) {
  const home = stateCode(entity.formed_in);
  return [...new Set((entity.operating_states || []).filter(c => c && c !== home))];
}

// Every tickable item of a step for this entity (the non-resident step has
// an Applied and an Obtained for each state).
export function stepItems(step, entity) {
  if (!step.perState) return step.items.map(([key, label]) => ({ key, label }));
  return nonResidentStates(entity).flatMap(c => [
    { key: `nonres_${c}_applied`, label: 'Applied', state: c },
    { key: `nonres_${c}_obtained`, label: 'Obtained', state: c },
  ]);
}

// checks: Map item -> { done_on, done_by_name }.
export function stepDone(step, entity, checks) {
  if (step.perState) {
    if (checks.has('nonres_none')) return true;
    const obtained = stepItems(step, entity).filter(i => i.label === 'Obtained');
    return obtained.length > 0 && obtained.every(i => checks.has(i.key));
  }
  return step.items.every(([key]) => checks.has(key));
}

export function daysBetweenDates(a, b) {
  return Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 864e5);
}
const dayOf = iso => (iso ? fmtDate(new Date(iso)) : '');

// Where an entity is: steps done, the step it's on, and how long since
// anything was ticked (that's the lag).
export function entityProgress(entity, checks = new Map(), today = todayStr()) {
  const done = ENTITY_STEPS.map(s => stepDone(s, entity, checks));
  const doneCount = done.filter(Boolean).length;
  const currentIndex = done.indexOf(false);
  const current = currentIndex >= 0 ? ENTITY_STEPS[currentIndex] : null;
  let last = '';
  checks.forEach(c => { if (c.done_on && c.done_on > last) last = c.done_on; });
  const since = last || dayOf(entity.created_at) || today;
  const days = Math.max(0, daysBetweenDates(since, today));
  const completed = !current;
  return {
    done, doneCount, total: ENTITY_STEPS.length, currentIndex, current, since, days, completed,
    completedOn: completed ? since : null,
    stalled: !completed && !entity.archived_at && days >= STALLED_DAYS,
    phaseDone: ENTITY_PHASES.map(p => p.steps.filter(s => done[ENTITY_STEPS.findIndex(x => x.key === s.key)]).length),
  };
}

// The line under "Now on": what's next within the step.
export function entityNextText(entity, checks, step) {
  if (!step) return '';
  if (step.perState) {
    const states = nonResidentStates(entity);
    if (!states.length) return 'Add the states it will operate in';
    return states.map(c => `${stateName(c)} ${checks.has(`nonres_${c}_obtained`) ? 'done' : checks.has(`nonres_${c}_applied`) ? 'applied' : 'not started'}`).join(' · ');
  }
  const next = step.items.find(([key]) => !checks.has(key));
  return next ? `Next: ${next[1]}` : '';
}

// ---- Individuals --------------------------------------------------------
// The licensing and contracting path, as a super admin reads it.
export const PERSON_STEP_TEXT = {
  course: 'Start the pre-licensing course', courseDone: 'Finish the pre-licensing course', examBooked: 'Book the state exam',
  examPassed: 'Pass the state exam', npn: 'Get the license number (NPN)', insuracloud: 'Get the InsuraCloud invite',
  profileSubmitted: 'Submit the InsuraCloud profile', appointed: 'Get the F&G writing number',
};

// Where a person is, and how long since their last step. Super admins
// aren't tracked on this path (the same as the Org chart).
export function personProgress(person, progress, today = todayStr()) {
  const st = licensingStatus(progress, person);
  const p = progress || {};
  const dates = [p.course_started_on, p.course_completed_on, p.exam_passed_on, p.contracting_sent_on, p.profile_submitted_on, dayOf(person.licensed_at)]
    .filter(Boolean).map(d => String(d).slice(0, 10));
  if (p.exam_on && String(p.exam_on).slice(0, 10) <= today) dates.push(String(p.exam_on).slice(0, 10));
  const since = dates.length ? dates.sort()[dates.length - 1] : (dayOf(person.created_at) || today);
  const admin = person.role === 'super_admin';
  const examAhead = !!(st.next && st.next.key === 'examPassed' && p.exam_on && String(p.exam_on).slice(0, 10) > today);
  const days = Math.max(0, daysBetweenDates(since, today));
  const group = admin ? 'admin' : st.licensed ? 'appointed' : st.done.npn ? 'contracting' : 'licensing';
  return { ...st, since, days, examAhead, admin, group, stalled: !admin && !st.licensed && !examAhead && days >= STALLED_DAYS };
}

const short = d => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
// The line under "Now on" for a person.
export function personNowText(person, progress, pp) {
  const p = progress || {};
  if (pp.admin) return '';
  if (pp.licensed) return person.licensed_at ? `Appointed ${short(person.licensed_at)}` : 'Licensed and appointed';
  switch (pp.next && pp.next.key) {
    case 'courseDone': return [p.course_started_on ? `Started ${short(p.course_started_on)}` : '', p.course_provider || ''].filter(Boolean).join(' · ');
    case 'examBooked': return p.course_completed_on ? `Course finished ${short(p.course_completed_on)}` : '';
    case 'examPassed': return p.exam_on ? `Exam ${pp.examAhead ? '' : 'was '}${short(p.exam_on)}${p.exam_attempts ? ` · attempt ${p.exam_attempts + 1}` : ''}` : '';
    case 'npn': return p.exam_passed_on ? `Passed the exam ${short(p.exam_passed_on)}` : '';
    case 'insuracloud': return person.npn ? `Licensed · NPN ${person.npn}` : '';
    case 'profileSubmitted': return p.contracting_sent_on ? `InsuraCloud sent ${short(p.contracting_sent_on)}` : '';
    case 'appointed': return p.profile_submitted_on ? `Profile submitted ${short(p.profile_submitted_on)}` : '';
    default: return person.created_at ? `Joined ${short(person.created_at)}` : '';
  }
}

// Each step's date (or number) on a person's profile.
export function personStepDetail(key, person, progress) {
  const p = progress || {};
  return {
    course: short(p.course_started_on), courseDone: short(p.course_completed_on), examBooked: short(p.exam_on),
    examPassed: short(p.exam_passed_on), npn: person.npn || '', insuracloud: short(p.contracting_sent_on),
    profileSubmitted: short(p.profile_submitted_on), appointed: person.fg_writing_number || '',
  }[key] || '';
}
