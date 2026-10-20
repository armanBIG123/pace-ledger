// Team Pace → Field training: who still needs observation sales for Field
// Associate, the field training booked this week, and upcoming
// appointments with an open trainee seat to put them on.
import React, { useCallback, useEffect, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { buildFieldTraining } from '../../lib/fieldTraining.js';
import { fmtApptDateTime } from '../../lib/dates.js';
import { loadPromotionReadiness } from '../../data/team.js';
import { fetchUpcomingAppointments, setAppointmentTrainee } from '../../data/recruits.js';
import { EmailButton } from '../../components/email.jsx';
import { MoreMenu, RefreshButton, SkeletonTable, TitleInfo, TypeBadge } from '../../components/ui.jsx';

const SEATS_SHOWN = 8;
const first = name => (name || '').trim().split(/\s+/)[0] || 'there';

function Dots({ current, target }) {
  return (
    <span className="tr-ft-dots" aria-label={`${current} of ${target} observation sales`}>
      {Array.from({ length: target }, (_, i) => <span key={i} className={i < current ? 'tr-ft-dot-on' : ''} />)}
      <span className="tr-ft-dots-n">{current} of {target}</span>
    </span>
  );
}

export function FieldTrainingSubView({ user, members, loadingMembers, emptyMessage }) {
  const [data, setData] = useState(null);
  const [picks, setPicks] = useState({}); // appointment id -> chosen trainee id
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [allSeats, setAllSeats] = useState(false);

  const refresh = useCallback(async () => {
    if (!members.length) { setData({ needers: [], seats: [], booked: [], byId: new Map() }); return; }
    setData(null);
    const ids = members.map(m => m.id);
    const [{ list, people }, upcoming] = await Promise.all([loadPromotionReadiness(user, ids), fetchUpcomingAppointments(7)]);
    const board = buildFieldTraining({ readiness: list, people, upcoming, teamIds: new Set(ids) });
    setData({ ...board, byId: new Map(people.map(p => [p.id, p])) });
    setPicks({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);
  useEffect(() => { refresh(); }, [refresh]);

  async function assign(appt, traineeId) {
    const trainee = data.byId.get(traineeId);
    setBusyId(appt.id); setNotice(null);
    const res = await setAppointmentTrainee(appt.id, traineeId);
    setBusyId(null);
    if (!res.ok) { setNotice({ kind: 'warn', text: `Couldn't add ${trainee ? trainee.display_name : 'them'}: ${res.error}` }); return; }
    const presenter = appt.presenter || (data.byId.get(appt.presenterId) || {}).display_name || 'the presenter';
    setNotice({ kind: 'ok', text: `${trainee ? trainee.display_name : 'They'} is now the trainee on ${presenter}'s appointment ${fmtApptDateTime(appt)}. Use Email under "Field training booked this week" to let them know.` });
    refresh();
  }
  async function remove(appt) {
    const name = (data.byId.get(appt.traineeId) || {}).display_name || appt.trainee || 'the trainee';
    if (!window.confirm(`Take ${name} off this appointment (${fmtApptDateTime(appt)})?`)) return;
    setBusyId(appt.id); setNotice(null);
    const res = await setAppointmentTrainee(appt.id, null);
    setBusyId(null);
    setNotice(res.ok ? { kind: 'ok', text: `Took ${name} off that appointment.` } : { kind: 'warn', text: `Couldn't change it: ${res.error}` });
    refresh();
  }

  if (loadingMembers || data === null) return <SkeletonTable rows={6} cols={4} />;
  if (members.length === 0) return <div className="tr-card"><p className="tr-empty">{emptyMessage}</p></div>;

  const { needers, seats, booked, byId } = data;
  const nameOf = id => (byId.get(id) || {}).display_name || '';
  const nothingBooked = needers.filter(n => !n.booked.length).length;
  const me = user.displayName || '';

  return (
    <>
      <div className="tr-row-head tr-screen-head">
        <TitleInfo title={<><GraduationCap size={18} aria-hidden="true" /> Field training</>}
          info="Field Associate takes 3 observation sales in 30 days: appointments someone sits in on as the trainee that end in a sale. Here's who still needs them, and upcoming appointments they can sit in on." />
        <RefreshButton onClick={refresh} />
      </div>
      {notice && <div className={notice.kind === 'ok' ? 'tr-flash' : 'tr-error'} style={{ marginBottom: 12 }}>{notice.text}</div>}
      <div className="tr-org-stats">
        <span><strong>{needers.length}</strong> need observation sales</span>
        {nothingBooked > 0 && <span className="tr-lic-stat-warn"><strong>{nothingBooked}</strong> with nothing booked this week</span>}
        <span><strong>{booked.length}</strong> field training{booked.length === 1 ? '' : 's'} booked</span>
        <span><strong>{seats.length}</strong> open seat{seats.length === 1 ? '' : 's'} this week</span>
      </div>

      <section className="tr-card tr-ft-card">
        <h3 className="tr-h3">Need observation sales</h3>
        {needers.length === 0 ? <p className="tr-empty">Nobody on your team is working toward Field Associate right now.</p> : (
          <ul className="tr-ft-list">
            {needers.map(n => (
              <li key={n.person.id} className="tr-ft-row">
                <span className={`tr-rec-dot ${n.booked.length ? '' : 'tr-rec-dot-stuck'}`} aria-hidden="true" />
                <div className="tr-ft-main">
                  <strong>{n.person.display_name}</strong>
                  {n.person.manager_id ? <span className="tr-rec-context">{n.person.manager_id === user.id ? 'Your team' : `${nameOf(n.person.manager_id)}'s team`}</span> : null}
                  <div className="tr-rec-detail">
                    {n.booked.length
                      ? n.booked.map(a => `${fmtApptDateTime(a)} with ${a.presenterId === n.person.id ? 'them presenting' : a.presenter || nameOf(a.presenterId)}`).join(' · ')
                      : <span className="tr-rec-flagtext">Nothing booked this week</span>}
                  </div>
                </div>
                <Dots current={n.current} target={n.target} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tr-card tr-ft-card">
        <TitleInfo as="h3" className="tr-h3" title="Open seats this week" info="Upcoming appointments with no trainee yet, presented by someone above a person who needs observation sales." />
        {seats.length === 0 ? <p className="tr-empty">No open seats in the next 7 days.</p> : (
          <ul className="tr-ft-list">
            {(allSeats ? seats : seats.slice(0, SEATS_SHOWN)).map(({ appt, eligible }) => {
              const pick = picks[appt.id] || (eligible.length === 1 ? eligible[0].id : '');
              const busy = busyId === appt.id;
              return (
                <li key={appt.id} className="tr-ft-row">
                  <div className="tr-ft-main">
                    <strong>{fmtApptDateTime(appt)}</strong> <TypeBadge appt={appt} />{appt.isFollowUp ? <span className="tr-presenting-chip">Follow-up</span> : null}
                    <div className="tr-rec-sub">{appt.presenter || nameOf(appt.presenterId)} presenting · {appt.client}{appt.userId !== appt.presenterId ? ` · set by ${nameOf(appt.userId)}` : ''}</div>
                  </div>
                  <div className="tr-ft-assign">
                    <select className="tr-toolbar-select" value={pick} onChange={e => setPicks(p => ({ ...p, [appt.id]: e.target.value }))} aria-label="Trainee">
                      {eligible.length > 1 && <option value="">Choose a trainee</option>}
                      {eligible.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                    </select>
                    <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" disabled={!pick || busy} onClick={() => assign(appt, pick)}>{busy ? 'Adding…' : 'Add trainee'}</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {seats.length > SEATS_SHOWN && (
          <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm tr-ft-more" onClick={() => setAllSeats(v => !v)}>
            {allSeats ? 'Show fewer' : `Show all ${seats.length}`}
          </button>
        )}
      </section>

      <section className="tr-card tr-ft-card">
        <h3 className="tr-h3">Field training booked this week</h3>
        {booked.length === 0 ? <p className="tr-empty">None booked yet.</p> : (
          <ul className="tr-ft-list">
            {booked.map(a => {
              const t = byId.get(a.traineeId) || { display_name: a.trainee };
              const presenter = a.presenter || nameOf(a.presenterId);
              return (
                <li key={a.id} className="tr-ft-row">
                  <div className="tr-ft-main">
                    <strong>{t.display_name}</strong> sits in with {presenter}
                    <div className="tr-rec-sub">{fmtApptDateTime(a)} · {a.client}</div>
                  </div>
                  <div className="tr-ft-assign">
                    {t.email ? <EmailButton to={t.email} name={t.display_name} subject={`Field training ${fmtApptDateTime(a)}`}
                      body={`Hi ${first(t.display_name)},\n\nYou're sitting in on ${presenter}'s appointment ${fmtApptDateTime(a)} as the trainee.${a.zoomUrl ? `\n\nZoom: ${a.zoomUrl}` : ''}\n\nIt's on your Today screen in PaceLedger too. Watch how the conversation flows and take notes; we'll go over it after.\n\n${me}`} /> : null}
                    <MoreMenu label={`More for ${t.display_name}`} items={[{ label: 'Take them off this appointment', disabled: busyId === a.id, onClick: () => remove(a) }]} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
