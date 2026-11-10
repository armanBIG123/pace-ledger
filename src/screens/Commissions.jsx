// Growth → Commissions: real pay from the commission system (Minkoo's),
// replacing InsuraCloud's. Everyone sees only the lines that pay them:
// their payouts, the client, policy, level and rate behind each dollar, and
// what's approved but not paid yet. Anyone with a team gets "My team"
// (each person's totals, tap for their lines). Super admins get "Setup":
// the address and key for the commission system, the log of what came in,
// and codes that match no one.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Copy, KeyRound, Link2, RefreshCw, Wallet } from 'lucide-react';
import { fetchCommissionLog, fetchCommissionStatus, fetchPayFor, fetchPayTotals, fetchUnmatchedCodes, linkCommissionCode, makeCommissionKey, makeCommissionTestKey, testWebhookUrl, webhookUrl } from '../data/commissions.js';
import { fetchOrgDirectory, seesTeam } from '../data/team.js';
import { computeDownline } from '../hierarchy.js';
import { byPolicy, fromWhom, levelName, money, monthRange, ratePct, summarize } from '../lib/commissions.js';
import { SkelBlock } from '../components/ui.jsx';
import { askConfirm } from '../components/confirm.jsx';
import { shareOrCopy } from '../native.js';

const dayText = s => (s ? new Date(`${String(s).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '');
const stamp = s => (s ? new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

function MonthPicker({ month, onChange }) {
  const { label } = monthRange(month);
  const step = k => onChange(new Date(month.getFullYear(), month.getMonth() + k, 1));
  const now = new Date();
  const atNow = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();
  return (
    <div className="tr-pay-month" role="group" aria-label="Month">
      <button type="button" className="tr-icon-btn" onClick={() => step(-1)} aria-label="Previous month"><ChevronLeft size={16} /></button>
      <strong>{label}</strong>
      <button type="button" className="tr-icon-btn" onClick={() => step(1)} disabled={atNow} aria-label="Next month"><ChevronRight size={16} /></button>
    </div>
  );
}

// One client's lines: level, rate, amount, and whose sale it came from.
function PolicyGroup({ g, viewerId, nameOf }) {
  return (
    <div className="tr-pay-policy">
      <div className="tr-pay-policy-head">
        <span><strong>{g.client}</strong><span className="tr-cl-muted"> · {[g.policy && `Policy ${g.policy}`, g.carrier && g.carrier.charAt(0) + g.carrier.slice(1).toLowerCase()].filter(Boolean).join(' · ')}</span></span>
        <strong className={g.total < 0 ? 'tr-pay-neg' : ''}>{money(g.total)}</strong>
      </div>
      <ul className="tr-pay-lines">
        {g.lines.map(l => (
          <li key={l.record_ids.join(',')}>
            <span className="tr-pay-level">{levelName(l.level)}{l.count > 1 ? <span className="tr-cl-muted"> · {l.count} premiums</span> : null}</span>
            <span className="tr-pay-rate">{ratePct(l.rate)}</span>
            <span className="tr-pay-from">{fromWhom(l, viewerId, nameOf)}</span>
            <span className={`tr-pay-amt ${Number(l.amount) < 0 ? 'tr-pay-neg' : ''}`}>{money(l.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Payout({ p, viewerId, nameOf }) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => byPolicy(p.lines), [p.lines]);
  return (
    <li className={`tr-pay-payout ${open ? 'tr-pay-payout-open' : ''}`}>
      <button type="button" className="tr-pay-payout-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span><strong>{dayText(p.disbursed_date)}</strong><span className="tr-cl-muted"> · {p.lines.length} line{p.lines.length === 1 ? '' : 's'} from {groups.length} client{groups.length === 1 ? '' : 's'}</span></span>
        <span className="tr-pay-payout-amt"><strong className={p.amount < 0 ? 'tr-pay-neg' : ''}>{money(p.amount)}</strong><ChevronDown size={16} aria-hidden="true" /></span>
      </button>
      {open ? <div className="tr-pay-payout-body">{groups.map(g => <PolicyGroup key={g.key} g={g} viewerId={viewerId} nameOf={nameOf} />)}</div> : null}
    </li>
  );
}

// One person's pay for the month (you, or someone on your team).
function PersonPay({ userId, viewerId, nameOf, range, who }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    setData(null);
    fetchPayFor(userId).then(d => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [userId]);
  if (!data) return <SkelBlock w="100%" h="220px" />;
  if (data.unavailable) return <div className="tr-card"><p className="tr-empty">Commissions aren't switched on yet.</p></div>;
  if (data.error) return <div className="tr-card"><p className="tr-empty">Couldn't load commissions. Check your connection and try again.</p></div>;
  const s = summarize(data, range);
  const you = userId === viewerId;
  if (!s.hasAny) {
    return (
      <div className="tr-card tr-pay-empty">
        <Wallet size={20} aria-hidden="true" />
        <p>{you ? 'Nothing here yet.' : `Nothing for ${who} yet.`} When the commission system sends PaceLedger {you ? 'your' : 'their'} pay, it shows here: every payout, the client, policy and level behind each dollar, and what's approved but not paid yet.</p>
      </div>
    );
  }
  const waiting = byPolicy(s.comingLines);
  return (
    <>
      <div className="tr-pay-tiles">
        <div className="tr-card tr-pay-tile"><span className="tr-cl-muted">Paid in {range.label.split(' ')[0]}</span><strong>{money(s.paid)}</strong></div>
        <div className="tr-card tr-pay-tile"><span className="tr-cl-muted">Coming (approved, not paid yet)</span><strong>{money(s.coming)}</strong></div>
        <div className="tr-card tr-pay-tile"><span className="tr-cl-muted">Chargebacks</span><strong className={s.chargebacks < 0 ? 'tr-pay-neg' : ''}>{s.chargebacks ? money(s.chargebacks) : 'None'}</strong></div>
      </div>
      <section className="tr-card tr-cl-card" aria-labelledby="pay-payouts-h">
        <h3 className="tr-cl-h" id="pay-payouts-h">Payouts in {range.label}</h3>
        {s.payouts.length ? <ul className="tr-pay-payouts">{s.payouts.map(p => <Payout key={p.record_id} p={p} viewerId={viewerId} nameOf={nameOf} />)}</ul>
          : <p className="tr-empty">No payouts this month.</p>}
      </section>
      <section className="tr-card tr-cl-card" aria-labelledby="pay-coming-h">
        <h3 className="tr-cl-h" id="pay-coming-h">Approved, not paid yet</h3>
        {waiting.length ? (
          <>
            <p className="tr-cl-muted">Earned and approved; {you ? 'you get it' : 'they get it'} in an upcoming payout.</p>
            {waiting.map(g => <PolicyGroup key={g.key} g={g} viewerId={viewerId} nameOf={nameOf} />)}
          </>
        ) : <p className="tr-empty">Nothing waiting.</p>}
      </section>
    </>
  );
}

// Everyone under you: their month, tap one for their lines.
function TeamPay({ user, org, nameOf, range, onOpen, everyone }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let alive = true;
    setRows(null);
    fetchPayTotals(range.from, range.to).then(r => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, [range.from, range.to]);
  const team = useMemo(() => new Set(computeDownline(user.id, org).map(p => p.id).filter(id => id !== user.id)), [user.id, org]);
  if (!rows) return <SkelBlock w="100%" h="220px" />;
  if (rows.unavailable) return <div className="tr-card"><p className="tr-empty">Commissions aren't switched on yet.</p></div>;
  if (rows.error) return <div className="tr-card"><p className="tr-empty">Couldn't load commissions. Check your connection and try again.</p></div>;
  const people = rows.rows.filter(r => r.user_id && r.user_id !== user.id && (everyone || team.has(r.user_id)))
    .map(r => ({ ...r, name: nameOf(r.user_id) || 'Someone' })).sort((a, b) => b.paid - a.paid || b.coming - a.coming || a.name.localeCompare(b.name));
  const sum = k => people.reduce((s, r) => s + r[k], 0);
  return (
    <section className="tr-card tr-cl-card" aria-labelledby="pay-team-h">
      <div className="tr-row-head">
        <h3 className="tr-cl-h" id="pay-team-h">{everyone ? 'Everyone' : 'Your team'} · {range.label}</h3>
        <span className="tr-cl-muted">{people.length} {people.length === 1 ? 'person' : 'people'} with commissions</span>
      </div>
      {people.length ? (
        <table className="tr-table tr-pay-team">
          <thead><tr><th>Person</th><th>Paid in {range.label.split(' ')[0]}</th><th>Coming</th><th>Chargebacks</th></tr></thead>
          <tbody>
            {people.map(r => (
              <tr key={r.user_id}>
                <td><button type="button" className="tr-mt-name-btn" onClick={() => onOpen(r.user_id)}>{r.name}</button></td>
                <td data-label="Paid">{money(r.paid)}</td>
                <td data-label="Coming">{money(r.coming)}</td>
                <td data-label="Chargebacks" className={r.chargebacks < 0 ? 'tr-pay-neg' : ''}>{r.chargebacks ? money(r.chargebacks) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><th>Total</th><th>{money(sum('paid'))}</th><th>{money(sum('coming'))}</th><th>{sum('chargebacks') ? money(sum('chargebacks')) : '—'}</th></tr></tfoot>
        </table>
      ) : <p className="tr-empty">No one {everyone ? '' : 'on your team '}has commissions yet.</p>}
      <p className="tr-cl-muted">Your own overrides from their sales are under Mine, marked with whose sale they came from.</p>
    </section>
  );
}

// Super admins: connecting the commission system, and what came in.
function Setup({ org }) {
  const [status, setStatus] = useState(null);
  const [log, setLog] = useState([]);
  const [unmatched, setUnmatched] = useState(null);
  const [newKey, setNewKey] = useState('');
  const [newTestKey, setNewTestKey] = useState('');
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pick, setPick] = useState({});
  const [agency, setAgency] = useState(null);
  const load = useCallback(async () => {
    const [s, l, u, t] = await Promise.all([fetchCommissionStatus(), fetchCommissionLog(), fetchUnmatchedCodes(), fetchPayTotals('2000-01-01', '2100-01-01')]);
    setStatus(s); setLog(l); setUnmatched(u);
    const company = t.rows ? t.rows.find(r => r.agent_code && r.agent_code.toUpperCase() === 'COMPANY') : null;
    setAgency(company ? company.paid + company.coming : 0);
  }, []);
  useEffect(() => { load(); }, [load]);
  const copy = async (kind, text) => { const r = await shareOrCopy({ text }); if (r === 'copied') { setCopied(kind); setTimeout(() => setCopied(''), 2000); } };
  async function makeKey() {
    if (status && status.hasKey && !(await askConfirm({ title: 'Make a new key?', body: 'The current key stops working right away, so the commission system needs the new one before its next send.', confirmLabel: 'Make a new key', danger: true }))) return;
    setBusy(true); setErr('');
    const r = await makeCommissionKey();
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setNewKey(r.key);
    load();
  }
  async function makeTestKey() {
    if (status && status.hasTestKey && !(await askConfirm({ title: 'Make a new test key?', body: 'The current test key stops working. The live key isn’t affected.', confirmLabel: 'Make a new test key' }))) return;
    setBusy(true); setErr('');
    const r = await makeCommissionTestKey();
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setNewTestKey(r.key);
    load();
  }
  async function link(code) {
    const id = pick[code];
    if (!id) return;
    const r = await linkCommissionCode(code, id);
    if (!r.ok) { setErr(r.error); return; }
    load();
  }
  if (!status) return <SkelBlock w="100%" h="260px" />;
  if (status.unavailable) return <div className="tr-card"><p className="tr-empty">Commissions need the database update first: run migration-commissions.sql in the Supabase SQL Editor.</p></div>;
  const people = org.slice().sort((a, b) => String(a.display_name).localeCompare(String(b.display_name)));
  return (
    <>
      <section className="tr-card tr-cl-card" aria-labelledby="pay-conn-h">
        <h3 className="tr-cl-h" id="pay-conn-h">Connect the commission system</h3>
        <p className="tr-cl-muted">Give Minkoo this address and the key. His system sends the same JSON it sent InsuraCloud, with the key in an <code>x-api-key</code> header.</p>
        <div className="tr-intake-link-row">
          <span className="tr-intake-link-box">{webhookUrl()}</span>
          <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => copy('url', webhookUrl())}><Copy size={13} /> {copied === 'url' ? 'Copied!' : 'Copy'}</button>
        </div>
        {newKey ? (
          <div className="tr-pay-key">
            <p><strong>Here's the new key. It's shown this once.</strong> Send it to Minkoo privately, not in a group chat. PaceLedger keeps only a fingerprint of it.</p>
            <div className="tr-intake-link-row">
              <span className="tr-intake-link-box">{newKey}</span>
              <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={() => copy('key', newKey)}><Copy size={13} /> {copied === 'key' ? 'Copied!' : 'Copy key'}</button>
            </div>
            <button type="button" className="tr-link-btn" onClick={() => setNewKey('')}>I've sent it, hide it</button>
          </div>
        ) : (
          <div className="tr-row-head" style={{ alignItems: 'center' }}>
            <span className="tr-cl-muted">{status.hasKey ? <>Key ending <strong>…{status.keyHint}</strong>, made {stamp(status.keyMadeAt)}{status.keyMadeBy ? ` by ${status.keyMadeBy}` : ''}.</> : 'No key yet. Make one, then send it to Minkoo.'}</span>
            <button type="button" className={`tr-btn tr-btn-sm ${status.hasKey ? 'tr-btn-ghost' : 'tr-btn-brass'}`} onClick={makeKey} disabled={busy}><KeyRound size={13} /> {busy ? 'Making…' : status.hasKey ? 'Make a new key' : 'Make the key'}</button>
          </div>
        )}
        {err ? <div className="tr-error" role="alert">{err}</div> : null}
      </section>

      <section className="tr-card tr-cl-card" aria-labelledby="pay-test-h">
        <h3 className="tr-cl-h" id="pay-test-h">Test address</h3>
        <p className="tr-cl-muted">For trying fake data. It takes the same JSON and answers the same way as the live address, plus <code>"test": true</code>, but saves nothing, so test data never reaches anyone's pay. It has its own key: the live key doesn't work here, and the test key doesn't work on the live address.</p>
        <div className="tr-intake-link-row">
          <span className="tr-intake-link-box">{testWebhookUrl()}</span>
          <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => copy('turl', testWebhookUrl())}><Copy size={13} /> {copied === 'turl' ? 'Copied!' : 'Copy'}</button>
        </div>
        {newTestKey ? (
          <div className="tr-pay-key">
            <p><strong>Here's the test key. It's shown this once.</strong> It only works on the test address. PaceLedger keeps only a fingerprint of it.</p>
            <div className="tr-intake-link-row">
              <span className="tr-intake-link-box">{newTestKey}</span>
              <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={() => copy('tkey', newTestKey)}><Copy size={13} /> {copied === 'tkey' ? 'Copied!' : 'Copy key'}</button>
            </div>
            <button type="button" className="tr-link-btn" onClick={() => setNewTestKey('')}>I've sent it, hide it</button>
          </div>
        ) : (
          <div className="tr-row-head" style={{ alignItems: 'center' }}>
            <span className="tr-cl-muted">{status.hasTestKey ? <>Test key ending <strong>…{status.testKeyHint}</strong>, made {stamp(status.testKeyMadeAt)}.</> : 'No test key yet.'}</span>
            <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={makeTestKey} disabled={busy}><KeyRound size={13} /> {status.hasTestKey ? 'Make a new test key' : 'Make a test key'}</button>
          </div>
        )}
        <p className="tr-cl-muted">{status.testLastAt && status.testLastResult ? (() => {
          const t = status.testLastResult;
          const n = (k, one, many) => `${t[k] ?? 0} ${(t[k] ?? 0) === 1 ? one : many}`;
          return <>Last test send {stamp(status.testLastAt)}: {n('disbImported', 'payout', 'payouts')} and {n('ledgerImported', 'line', 'lines')}. On the live address that would be {t.new ?? 0} new, {t.updated ?? 0} changed, {t.unchanged ?? 0} the same and {t.rejected ?? 0} rejected. Nothing was saved.</>;
        })() : 'No test sends yet.'}</p>
      </section>

      <section className="tr-card tr-cl-card" aria-labelledby="pay-unmatched-h">
        <div className="tr-row-head">
          <h3 className="tr-cl-h" id="pay-unmatched-h">Codes that match no one</h3>
          <button type="button" className="tr-link-btn" onClick={load}><RefreshCw size={12} aria-hidden="true" /> Check again</button>
        </div>
        <p className="tr-cl-muted">Each line names who it pays with an agent code. PaceLedger matches it to the agent with that NPN, then that F&amp;G writing number. Link the rest once, and they stay linked.</p>
        {unmatched === null ? <p className="tr-empty">Checking…</p> : unmatched.length === 0 ? <p className="tr-empty">Everyone's matched.</p> : (
          <ul className="tr-pay-unmatched">
            {unmatched.map(u => (
              <li key={u.agent_code}>
                <span><AlertTriangle size={14} aria-hidden="true" /> <strong>{u.agent_code}</strong><span className="tr-cl-muted"> · {u.lines} line{u.lines === 1 ? '' : 's'}, {money(u.total)}{u.sample_client ? ` · latest client: ${u.sample_client}` : ''}</span></span>
                <span className="tr-pay-link">
                  <select aria-label={`Who is ${u.agent_code}?`} value={pick[u.agent_code] || ''} onChange={e => setPick(p => ({ ...p, [u.agent_code]: e.target.value }))}>
                    <option value="">Who is this?</option>
                    {people.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                  </select>
                  <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" disabled={!pick[u.agent_code]} onClick={() => link(u.agent_code)}><Link2 size={13} /> Link</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tr-card tr-cl-card" aria-labelledby="pay-log-h">
        <h3 className="tr-cl-h" id="pay-log-h">What came in</h3>
        <p className="tr-cl-muted">
          {status.lastAt ? <>Last received {stamp(status.lastAt)}. {status.lines.toLocaleString()} lines stored from {status.calls.toLocaleString()} sends.</> : 'Nothing yet. Once the commission system sends, every send shows here.'}
          {agency ? <> The agency's own share (COMPANY lines) so far: <strong>{money(agency)}</strong>.</> : null}
        </p>
        {log.length ? (
          <table className="tr-table tr-pay-log">
            <thead><tr><th>When</th><th>Payouts</th><th>Lines</th><th>New</th><th>Changed</th><th>Same</th><th>Rejected</th></tr></thead>
            <tbody>
              {log.map(r => (
                <tr key={r.id}>
                  <td>{stamp(r.received_at)}</td><td>{r.disbursements}</td><td>{r.lines}</td><td>{r.new_rows}</td><td>{r.updated_rows}</td><td>{r.unchanged_rows}</td>
                  <td className={r.rejected ? 'tr-pay-neg' : ''} title={r.problems ? r.problems.map(p => `${p.kind} ${p.recordId || ''}: ${p.problem}`).join('\n') : ''}>{r.rejected || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
    </>
  );
}

export function CommissionsBody({ user }) {
  const admin = user.role === 'super_admin';
  const team = seesTeam(user) || admin;
  const [mode, setMode] = useState('mine');
  const [month, setMonth] = useState(() => new Date());
  const [person, setPerson] = useState(null);
  const [org, setOrg] = useState([]);
  useEffect(() => { let alive = true; fetchOrgDirectory().then(o => { if (alive) setOrg(o || []); }); return () => { alive = false; }; }, []);
  const nameOfLine = useCallback(id => (org.find(p => p.id === id) || {}).display_name || '', [org]);
  const range = monthRange(month);
  const modes = [['mine', 'Mine'], ...(team ? [['team', admin ? 'Everyone' : 'My team']] : []), ...(admin ? [['setup', 'Setup']] : [])];
  const showing = person ? 'person' : mode;
  return (
    <div className="tr-pay">
      <div className="tr-row-head tr-pay-head">
        <div>
          <h2 className="tr-h2" style={{ margin: 0 }}>Commissions</h2>
          <p className="tr-cl-muted">From the commission system. Only the lines that pay {showing === 'person' ? 'them' : 'you'}, with the client, policy and level behind each dollar.</p>
        </div>
        {showing !== 'setup' ? <MonthPicker month={month} onChange={setMonth} /> : null}
      </div>
      {modes.length > 1 ? (
        <div className="tr-cl-filters" role="group" aria-label="Show">
          {modes.map(([k, label]) => (
            <button key={k} type="button" className={`tr-cl-filter ${mode === k && !person ? 'tr-cl-filter-on' : ''}`} aria-pressed={mode === k && !person} onClick={() => { setMode(k); setPerson(null); }}>{label}</button>
          ))}
        </div>
      ) : null}
      {person ? (
        <>
          <button type="button" className="tr-cl-back" onClick={() => setPerson(null)}><ChevronLeft size={16} aria-hidden="true" /> {admin ? 'Everyone' : 'Your team'}</button>
          <h3 className="tr-h3">{nameOfLine(person) || 'Someone'}</h3>
          <PersonPay key={person} userId={person} viewerId={user.id} nameOf={nameOfLine} range={range} who={nameOfLine(person) || 'them'} />
        </>
      ) : mode === 'mine' ? <PersonPay userId={user.id} viewerId={user.id} nameOf={nameOfLine} range={range} who="you" />
        : mode === 'team' ? <TeamPay user={user} org={org} nameOf={nameOfLine} range={range} onOpen={setPerson} everyone={admin} />
          : <Setup org={org} />}
    </div>
  );
}
