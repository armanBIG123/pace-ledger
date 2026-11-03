// My work → Clients (this tab was Pipeline). It opens on Clients: everyone,
// one profile each (screens/Clients.jsx). The lists that were Pipeline's
// five stage tabs (Prospects, Appointments, Log outcome, Follow-up, Won)
// are still here, opened from Clients → Other lists, from Today, search and
// + New, each with a way back to Clients.
import { useCallback, useEffect, useState } from 'react';
import { Award, CalendarDays, ChevronLeft, ListChecks, MessageCircle, Users } from 'lucide-react';
import { fetchAppointmentsImOn, fetchMyAppointments } from '../data/appointments.js';
import { fetchMyProspects, prospectToAppointmentPrefill } from '../data/prospects.js';
import { fetchRecruitSignups } from '../data/recruits.js';
import { pipelineSummary } from '../lib/pipeline.js';
import { fmtDate, parseDate, todayStr } from '../lib/dates.js';
import { fmtCurrency } from '../lib/format.js';
import { SystemsBody } from './Prospecting.jsx';
import { MyAppointmentsBody, OpenRequirementsBody } from './Appointments.jsx';
import { FollowUpBody } from './FollowUp.jsx';
import { ClientsBody, OTHER_LISTS } from './Clients.jsx';

// The older lists (no longer tabs): what each is called on its back bar.
export const PIPELINE_STAGES = [
  { key: 'names', label: 'Prospects', Icon: Users },
  { key: 'booked', label: 'Appointments', Icon: CalendarDays },
  { key: 'outcome', label: 'Log outcome', Icon: ListChecks },
  { key: 'followup', label: 'Follow-up', Icon: MessageCircle },
  { key: 'won', label: 'Won', Icon: Award },
];
// Which Follow Up lists each stage offers (the first is where it opens).
export const OUTCOME_VIEWS = ['nolog', 'presented', 'reschedule', 'not_completed', 'completed', 'all'];
export const FOLLOWUP_VIEWS = ['needs', 'nointake', 'sent', 'received', 'recruit_open', 'recruit_joined'];

function WonStage({ user, summary }) {
  const [view, setView] = useState('sold');
  return (
    <div className="tr-won">
      <div className="tr-seg tr-seg-view" role="group" aria-label="Show">
        <button type="button" className={view === 'sold' ? 'tr-seg-on' : ''} aria-pressed={view === 'sold'} onClick={() => setView('sold')}>
          Submitted premium{summary && summary.won.waiting ? ` · ${summary.won.waiting}` : ''}
        </button>
        <button type="button" className={view === 'issued' ? 'tr-seg-on' : ''} aria-pressed={view === 'issued'} onClick={() => setView('issued')}>Issued premium</button>
      </div>
      <p className="tr-count-line">
        {view === 'issued'
          ? 'Your policies with an effective date that has arrived and every requirement complete.'
          : summary && summary.won.waiting
            ? <><strong>{summary.won.waiting}</strong> waiting to be issued · <strong>{fmtCurrency(summary.won.waitingPremium)}</strong>. Set the effective date and mark requirements complete as they come in; your leaders can add notes.</>
            : 'Your submitted policies waiting on an effective date or open requirements.'}
      </p>
      <OpenRequirementsBody key={view} view={view} user={user} mineOnly head={false} />
    </div>
  );
}

// stage + onStage: what's open ('clients', or one of the lists above; kept
// by the app, so other screens can open one directly). client / onClient:
// the open profile on Clients. intentFor / clearIntent: requests from
// elsewhere (search, + New, Today) for the screen behind a list. client is
// { key, name } or null.
export function PipelineBody({ user, stage, onStage, client, onClient, intentFor, clearIntent, prefillData, onPrefillConsumed, cameFrom, onReturn, onLogAppointment }) {
  const [summary, setSummary] = useState(null);
  const load = useCallback(async () => {
    const first = parseDate(`${todayStr().slice(0, 7)}-01`);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const [prospects, appointments, presenting, signups] = await Promise.all([
      fetchMyProspects(user.id), fetchMyAppointments(user.id), fetchAppointmentsImOn(user.id).catch(() => []),
      fetchRecruitSignups(fmtDate(first), fmtDate(last)),
    ]);
    setSummary(pipelineSummary({ prospects, appointments, presenting, signups, userId: user.id }));
  }, [user.id]);
  // Submitted / Issued premium shows how many are waiting.
  useEffect(() => { if (stage === 'won') load(); }, [load, stage]);

  if (stage === 'clients' || !PIPELINE_STAGES.some(s => s.key === stage)) {
    return (
      <ClientsBody user={user} selected={client ? client.key : null} onSelect={(key, name) => { onClient(key ? { key, name } : null); window.scrollTo(0, 0); }}
        onLogAppointment={onLogAppointment} onOpenList={onStage} intent={intentFor('clients')} onIntentConsumed={clearIntent} />
    );
  }

  let body = null;
  if (stage === 'names') {
    body = <SystemsBody user={user} initialIntent={intentFor('systems')} onIntentConsumed={clearIntent} onLogAppointment={p => onLogAppointment(prospectToAppointmentPrefill(p))} />;
  } else if (stage === 'booked') {
    body = (
      <MyAppointmentsBody user={user} section="booked" prefillData={prefillData} onPrefillConsumed={onPrefillConsumed}
        initialIntent={intentFor('mine')} onIntentConsumed={clearIntent} cameFrom={cameFrom} onReturn={onReturn} />
    );
  } else if (stage === 'outcome') {
    body = <FollowUpBody user={user} views={OUTCOME_VIEWS} initialIntent={intentFor('followup')} onIntentConsumed={clearIntent} onScheduleNext={onLogAppointment} />;
  } else if (stage === 'followup') {
    body = <FollowUpBody user={user} views={FOLLOWUP_VIEWS} initialIntent={intentFor('followup')} onIntentConsumed={clearIntent} onScheduleNext={onLogAppointment} />;
  } else {
    body = <WonStage user={user} summary={summary} />;
  }
  const here = PIPELINE_STAGES.find(s => s.key === stage);
  return (
    <div className="tr-pipeline">
      <nav className="tr-cl-backbar" aria-label="Back to Clients">
        <button type="button" className="tr-cl-back" data-android-back onClick={() => onStage('clients')}><ChevronLeft size={16} aria-hidden="true" /> {client && client.name ? client.name : 'Clients'}</button>
        <span className="tr-cl-backbar-here"><here.Icon size={14} aria-hidden="true" /> {(OTHER_LISTS.find(o => o.stage === stage) || here).label}</span>
      </nav>
      <div className="tr-flat" key={stage}>{body}</div>
    </div>
  );
}
