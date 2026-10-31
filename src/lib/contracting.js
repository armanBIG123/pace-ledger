// Contracting: the fields agents send, the background questions, checks on
// what they type, and where an agent is in the process. Pure functions.
// Field names must stay in step with migration-contracting.sql and the
// "contracting" edge function.

export const BACKGROUND_QUESTIONS = [
  'Have you ever been charged with, convicted of, or pled guilty or no contest to any felony or misdemeanor, or to any violation of federal/state insurance, securities, or investment laws or regulations? Have you ever been placed on probation?',
  'Are you currently, or have you ever been, under investigation, subject to any pending indictments, or involved in lawsuits or legal proceedings, especially involving an insurance company?',
  'Have you ever been accused or alleged to have engaged in fraud?',
  'Have you ever been found, determined, or adjudicated to have engaged in fraud?',
  'Has any insurance/financial services company or broker-dealer ever terminated your contract/appointment, or permitted you to resign, for reasons other than lack of production?',
  'Have you ever had an insurance company appointment terminated for cause, or been denied an appointment?',
  'Does any insurer, insured, or other party claim any commission chargeback or other indebtedness from you arising from insurance business?',
  'Has any lawsuit or claim ever been made against your surety/bond company or Errors & Omissions (E&O) carrier arising from your sales/business practices, or have you ever been denied surety bonding or E&O coverage?',
  'Have you ever had an insurance or securities license denied, suspended, canceled, or revoked?',
  'Has any state or federal regulator ever determined that you were a cause of an insurance- or investment-related business having its authorization denied, suspended, revoked, restricted, or otherwise limited?',
  'Has any state or federal agency ever revoked or suspended a license you held as an attorney, accountant, or federal contractor?',
  'Has any state or federal agency ever found that you made a false statement/omission, or acted dishonestly, unfairly, or unethically?',
  'Have you had any gaps or interruptions in required licensing (for any reason)?',
  'Has any state, federal, or self-regulatory authority ever filed a complaint against you, or fined/sanctioned/censured/penalized/disciplined you for violating laws or regulations? Have you ever been the subject of a consumer-initiated complaint?',
  'Have you personally, or has any insurance/securities brokerage firm with which you were associated, ever filed for or been declared bankrupt?',
  'Have you ever had any judgments, garnishments, or liens filed against you?',
  'Are you connected in any way (owner, employee, contractor, officer, etc.) with a bank, savings & loan, lending company, or other financial institution?',
  'Have you ever used any other name, alias, or legal name variation (including maiden name or former legal name)?',
  'Do you have any unresolved or pending matters with the IRS or any other tax authority?',
];

export const FIELD_LABELS = {
  first_name: 'First name', middle_name: 'Middle name', last_name: 'Last name', ssn: 'Social Security number',
  dob: 'Date of birth', gender: 'Gender', email: 'Email', phone: 'Phone',
  street: 'Street address', city: 'City', state: 'State', zip: 'ZIP code',
  dl_number: "Driver's license number", dl_state: "Driver's license state", dl_expires: "Driver's license expiration",
  bank_name: 'Bank name', account_type: 'Account type', routing: 'Routing number', account: 'Account number',
  eo_has: 'Has E&O', eo_carrier: 'E&O carrier', eo_policy: 'E&O policy number', eo_amount: 'E&O coverage per claim', eo_expires: 'E&O expiration',
  aml_done: 'AML training done', aml_provider: 'AML provider', aml_date: 'AML completion date', background: 'Background answers',
};
export const FILE_LABELS = {
  dl_front: "Driver's license photo", eo_certificate: 'E&O certificate', aml_certificate: 'AML certificate', background_doc: 'Background document',
};

// How the contracting team sees them, in the order they're typed into SureLC.
export const SECTIONS = [
  { title: 'Name and identity', keys: ['first_name', 'middle_name', 'last_name', 'ssn', 'dob', 'gender'] },
  { title: 'Contact', keys: ['email', 'phone'] },
  { title: 'Home address', keys: ['street', 'city', 'state', 'zip'] },
  { title: "Driver's license", keys: ['dl_number', 'dl_state', 'dl_expires'], files: ['dl_front'] },
  { title: 'Commission deposits', keys: ['bank_name', 'account_type', 'routing', 'account'] },
  { title: 'E&O', keys: ['eo_has', 'eo_carrier', 'eo_policy', 'eo_amount', 'eo_expires'], files: ['eo_certificate'] },
  { title: 'AML', keys: ['aml_done', 'aml_provider', 'aml_date'], files: ['aml_certificate'] },
  { title: 'Background questions', keys: ['background'], files: ['background_doc'] },
];
const MASKS = { ssn: '•••-••-••••', dob: '••/••/••••', routing: '•••••••••', account: '••••••••••', dl_expires: '••/••/••••', eo_expires: '••/••/••••', aml_date: '••/••/••••', background: '19 answers' };
export const maskFor = key => MASKS[key] || '••••••••';

export const digits = s => String(s || '').replace(/\D/g, '');
export const formatSsn = s => { const d = digits(s); return d.length === 9 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : d; };
export const formatPhone = s => { const d = digits(s).replace(/^1(?=\d{10}$)/, ''); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d; };
// "2026-04-12" -> "04/12/2026" (how carriers' forms ask for dates)
export const usDate = iso => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : iso || '');

export function ssnProblem(s) {
  const d = digits(s);
  if (d.length !== 9) return 'Enter all 9 digits.';
  if (/^(\d)\1{8}$/.test(d) || d === '123456789' || d.startsWith('000') || d.startsWith('666') || d.startsWith('9') || d.slice(3, 5) === '00' || d.slice(5) === '0000') {
    return "That isn't a valid Social Security number.";
  }
  return '';
}
// ABA routing number checksum.
export function routingProblem(s) {
  const d = digits(s);
  if (d.length !== 9) return 'Routing numbers are 9 digits.';
  const n = d.split('').map(Number);
  const sum = 3 * (n[0] + n[3] + n[6]) + 7 * (n[1] + n[4] + n[7]) + (n[2] + n[5] + n[8]);
  return sum % 10 === 0 ? '' : "That routing number isn't right. Check it on a check or in your bank's app.";
}
export function accountProblem(s) {
  const d = digits(s);
  return d.length >= 4 && d.length <= 17 ? '' : 'Account numbers are 4 to 17 digits.';
}
const ageOn = (iso, today) => {
  const [y, m, d] = iso.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
};
export function dobProblem(iso, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return 'Enter your date of birth.';
  const age = ageOn(iso, today);
  return age < 18 || age > 100 ? 'Check the year.' : '';
}
export function futureDateProblem(iso, today, what = 'date') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return `Enter the ${what}.`;
  return iso <= today ? `That ${what} has passed.` : '';
}
export const zipProblem = s => (/^\d{5}(\d{4})?$/.test(digits(s)) ? '' : 'Enter a 5-digit ZIP code.');
export const phoneProblem = s => (digits(s).replace(/^1(?=\d{10}$)/, '').length === 10 ? '' : 'Enter a 10-digit phone number.');
export const emailProblem = s => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim()) ? '' : 'Enter an email address.');

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

// Every problem with a filled-in form, keyed by field (or 'bg_3', 'files').
export function formProblems(f, today) {
  const p = {};
  const need = (k, msg) => { if (!String(f[k] || '').trim()) p[k] = msg; };
  need('first_name', 'Enter your legal first name.');
  need('last_name', 'Enter your legal last name.');
  const ssn = ssnProblem(f.ssn); if (ssn) p.ssn = ssn;
  const dob = dobProblem(f.dob, today); if (dob) p.dob = dob;
  need('gender', 'Choose one.');
  const em = emailProblem(f.email); if (em) p.email = em;
  const ph = phoneProblem(f.phone); if (ph) p.phone = ph;
  need('street', 'Enter your street address.');
  need('city', 'Enter your city.');
  need('state', 'Choose your state.');
  const zip = zipProblem(f.zip); if (zip) p.zip = zip;
  need('dl_number', "Enter your driver's license number.");
  need('dl_state', 'Choose the state.');
  const dle = futureDateProblem(f.dl_expires, today, 'expiration date'); if (dle) p.dl_expires = dle;
  need('bank_name', 'Enter your bank.');
  need('account_type', 'Choose one.');
  const rt = routingProblem(f.routing); if (rt) p.routing = rt;
  const ac = accountProblem(f.account); if (ac) p.account = ac;
  if (!p.account && digits(f.account) !== digits(f.account2)) p.account2 = "The account numbers don't match.";
  if (f.eo_has !== 'yes' && f.eo_has !== 'no') p.eo_has = 'Choose one.';
  if (f.eo_has === 'yes') {
    need('eo_carrier', 'Enter your E&O carrier.');
    need('eo_policy', 'Enter the policy number.');
    const ee = futureDateProblem(f.eo_expires, today, 'expiration date'); if (ee) p.eo_expires = ee;
    if (!f.eo_file) p.eo_file = 'Add your E&O certificate.';
  }
  if (f.aml_done !== 'yes' && f.aml_done !== 'no') p.aml_done = 'Choose one.';
  if (f.aml_done === 'yes' && !f.aml_file) p.aml_file = 'Add your AML certificate.';
  BACKGROUND_QUESTIONS.forEach((_, i) => {
    const a = (f.bg || [])[i];
    if (a !== 'yes' && a !== 'no') p[`bg_${i}`] = 'Answer this one.';
    else if (a === 'yes' && String((f.bgNotes || {})[i] || '').trim().length < 10) p[`bg_${i}`] = 'Explain what happened (a sentence or two).';
  });
  if (!f.confirm) p.confirm = 'Check the box to confirm.';
  return p;
}

// What gets encrypted and sent, from the form.
export function fieldsFromForm(f) {
  const bg = { answers: BACKGROUND_QUESTIONS.map((_, i) => (f.bg || [])[i] || ''), notes: {} };
  BACKGROUND_QUESTIONS.forEach((_, i) => { if ((f.bg || [])[i] === 'yes') bg.notes[i + 1] = String((f.bgNotes || {})[i] || '').trim(); });
  const t = s => String(s || '').trim();
  return {
    first_name: t(f.first_name), middle_name: t(f.middle_name), last_name: t(f.last_name),
    ssn: formatSsn(f.ssn), dob: usDate(f.dob), gender: t(f.gender), email: t(f.email), phone: formatPhone(f.phone),
    street: t(f.street), city: t(f.city), state: t(f.state), zip: digits(f.zip),
    dl_number: t(f.dl_number).toUpperCase(), dl_state: t(f.dl_state), dl_expires: usDate(f.dl_expires),
    bank_name: t(f.bank_name), account_type: t(f.account_type), routing: digits(f.routing), account: digits(f.account),
    eo_has: f.eo_has === 'yes' ? 'Yes' : 'No',
    eo_carrier: f.eo_has === 'yes' ? t(f.eo_carrier) : '', eo_policy: f.eo_has === 'yes' ? t(f.eo_policy) : '',
    eo_amount: f.eo_has === 'yes' ? t(f.eo_amount) : '', eo_expires: f.eo_has === 'yes' ? usDate(f.eo_expires) : '',
    aml_done: f.aml_done === 'yes' ? 'Yes' : 'No',
    aml_provider: f.aml_done === 'yes' ? t(f.aml_provider) : '', aml_date: f.aml_done === 'yes' ? usDate(f.aml_date) : '',
    background: JSON.stringify(bg),
  };
}
// The background answers as the contracting team reads them.
export function readBackground(value) {
  try {
    const bg = JSON.parse(value);
    return BACKGROUND_QUESTIONS.map((q, i) => ({ n: i + 1, q, a: bg.answers[i] === 'yes' ? 'Yes' : bg.answers[i] === 'no' ? 'No' : '—', note: (bg.notes || {})[i + 1] || '' }));
  } catch {
    return [];
  }
}

// ---- Where an agent is -------------------------------------------------------
export const latestAgreement = (agreements, version) => {
  const list = (agreements || []).filter(a => !version || a.version === version);
  return list.length ? list.reduce((a, b) => (String(a.created_at) > String(b.created_at) ? a : b)) : null;
};
export const hasSignedAgreement = agreements => (agreements || []).some(a => a.status === 'completed');

// 'sign' | 'countersign' | 'send' | 'waiting' | 'entered' | 'review' | 'carrier' | 'number' | 'done'
export function agentStage({ agreements, kase, settings, writingNumber }) {
  const current = latestAgreement(agreements, settings && settings.agreement_version);
  const signed = hasSignedAgreement(agreements);
  if (!signed) return current && current.status === 'agent_signed' ? 'countersign' : 'sign';
  const c = kase || {};
  const pending = c.info_sent_at && !c.info_deleted_at;
  if (pending) return 'waiting';
  if (c.entered_at && (!c.info_deleted_at || c.delete_reason === 'entered')) {
    if (c.sent_to_carrier_at) return writingNumber ? 'done' : 'number';
    if (c.agent_signed_at) return 'carrier';
    if (c.review_sent_at) return 'review';
    return 'entered';
  }
  return 'send';
}

export function timeLeft(expiresAt, now = Date.now()) {
  const ms = new Date(expiresAt).getTime() - now;
  if (!(ms > 0)) return '0m';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h ? `${h}h ${m}m` : `${m}m`;
}
export const hoursLeft = (expiresAt, now = Date.now()) => (new Date(expiresAt).getTime() - now) / 3600000;

export const fmtWhen = iso => (iso
  ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '');
export const fmtDay = iso => (iso ? new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' }) : '');

// Words for the log.
export const LOG_WORDS = {
  sent: 'Sent contracting info', opened: 'Opened the info', revealed: 'Revealed', copied: 'Copied', viewed_file: 'Viewed file',
  entered: 'Marked entered in SureLC (info deleted)', withdrawn: 'Withdrew the info (deleted)', expired: 'Deleted automatically after 72 hours',
  kill_switch: 'Kill switch', review_sent: 'SureLC review request sent', agent_signed: 'Agent signed in SureLC', sent_to_carrier: 'Sent to the carrier',
  undo_review_sent: 'Undid: SureLC review sent', undo_agent_signed: 'Undid: agent signed in SureLC', undo_sent_to_carrier: 'Undid: sent to the carrier',
  agreement_started: 'Opened the agreement to sign', agreement_signed: 'Signed the producer agreement', agreement_completed: 'Agreement countersigned and saved',
  agreement_declined: 'Declined the agreement', new_key: 'New encryption key', key_verified: 'Checked the encryption key', agreement: 'Agreement set',
  turned_on: 'Turned contracting on', turned_off: 'Turned contracting off', paused: 'Paused the form', unpaused: 'Unpaused the form',
  staff_added: 'Added to the contracting team', staff_removed: 'Removed from the contracting team', access_review: 'Access review done',
};
