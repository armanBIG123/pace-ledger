// Which agent spots the adopt step fills, with the real field names from
// both BIG templates (2026.1 and 2026.2).
import path from 'node:path';
import { bundleFunction } from '../tools/bundle.mjs';
import { REPO, TESTS, OUT } from '../tools/paths.mjs';
const here = path.dirname(new URL(import.meta.url).pathname);
const E = await bundleFunction('contracting');
let failures = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { failures++; console.log('FAIL', m); } };
const f = (name, type = 'text') => ({ uuid: name, name, type });
const v2 = [
  f('Agreement date', 'date'), f('Agent name'), f('Agent date', 'date'), f('Agent party'), f('Effective date', 'date'),
  f('Maintain licenses', 'checkbox'), f('Exclusive access', 'checkbox'), f('Confidential info', 'checkbox'), f('Channel use', 'checkbox'),
  f('No use of confidential info', 'checkbox'), f('No use of marketing materials', 'checkbox'),
  f('Exclusive initial'), f('Non-exclusive initial'), f('Agent signature', 'signature'), f('Print name'), f('Agent code'), f('Agent date', 'date'),
  f('Address'), f('Email'), f('Acknowledgement initial'),
  ...['Guidelines', 'Omissions', 'Coverage', 'Capacity', 'Compensation', 'Recruitment claim', 'Use of materials', 'Equipment use', 'Guidelines review',
    'Application procedure', 'Chargeback', 'Advance repayment', 'Product help', 'Market representation', 'Illustration use', 'Illustration guarantee',
    'Refinance recommendation', 'Policy funding', 'Tax advice prohibition', 'Tax advice prohibition', 'Commission prohibition', 'Disclosure requirement',
    'Misrepresentation prohibition', 'Low-cost claim', 'Replacement procedure', 'Full disclosure', 'Examiner ethics', 'Policy delivery',
    'Signature falsification', 'Loan prohibition', 'Calculator use', 'Data protection', 'Termination consequences'].map(n => f(`${n} acknowledgement`)),
  f('Agent signature', 'signature'), f('Print agent name'), f('Date', 'date'), f('Supplement title'), f('Agent identifier'), f('Agent code'),
  f('Print name'), f('Signature', 'signature'), f('Date', 'date'),
];
const c = E.classifyAgentFields(v2);
const names = xs => xs.map(x => x.name);
ok(c.initials.length === 34, `2026.2: 33 acknowledgements + the acknowledgement initial get initials (${c.initials.length})`);
ok(!names(c.initials).some(n => /exclusive/i.test(n)), 'the Exclusive / Non-exclusive election is left for the agent to pick');
ok(JSON.stringify(names(c.names)) === JSON.stringify(['Agent name', 'Agent party', 'Print name', 'Print agent name', 'Print name']), 'printed name: ' + names(c.names).join(', '));
ok(c.signature.length === 3, 'all 3 signature spots');
ok(c.dates.length === 6, 'all 6 date spots get today');
const left = v2.filter(x => ![...c.initials, ...c.names, ...c.signature, ...c.dates].includes(x)).map(x => x.name);
console.log('   left for the agent:', left.join(', '));
ok(left.every(n => /exclusive|Maintain|access|Confidential|Channel|No use|Agent code|Address|Email|Supplement title|Agent identifier/i.test(n)), 'only real choices are left to the agent');
// 2026.1 (the one in the screenshot)
const v1 = [f('Agent'), f('Date', 'date'), f('Agreement Parties'), f('Benefits Initial'), f('Guidelines Initial'), f('Exclusive Initial'), f('Agent Type', 'radio'), f('Agent Signature', 'signature')];
const c1 = E.classifyAgentFields(v1);
ok(names(c1.initials).join() === 'Benefits Initial,Guidelines Initial', '2026.1: Benefits Initial and the like');
ok(names(c1.names).includes('Agreement Parties'), '2026.1: Agreement Parties gets the printed name');
// never: a code, email or title
ok(!E.classifyAgentFields([f('Network agent code'), f('Name and title'), f('Agent email'), f('Initial premium amount', 'number')]).names.length, 'no name in code/title/email boxes');
// email box, and the election read back from which initials box was used
ok(names(c.emails).join() === 'Email', 'the Email box gets their email');
ok(E.electionFrom([{ field: 'Exclusive initial', value: '' }, { field: 'Non-exclusive initial', value: 'JAE' }]) === 'Non-Exclusive', 'election: Non-exclusive initialed');
ok(E.electionFrom([{ field: 'Exclusive initial', value: 'JAE' }, { field: 'Non-exclusive initial', value: '' }]) === 'Exclusive', 'election: Exclusive initialed');
ok(E.electionFrom([{ field: 'Exclusive initial', value: 'JAE' }, { field: 'Non-exclusive initial', value: 'JAE' }]) === null, 'both initialed: not guessed');
ok(E.electionFrom({ 'Agent Type': 'Non-Exclusive' }) === 'Non-Exclusive', 'the old picker still works');
console.log(failures ? `${failures} FAILED` : 'ALL FIELD TESTS PASSED');
process.exit(failures ? 1 : 0);
