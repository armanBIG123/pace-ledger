// My work → Clients (this tab was Pipeline). It opens on Clients: everyone,
// one profile each (screens/Clients.jsx), under the pipeline bar: Prospects
// → Appointments → Log outcomes → Follow-up meetings → Results, with the
// counts from lib/pipeline.js. Each stage opens the list that does that
// job (also opened from Today, search and + New), with a way back to Clients.
import { useEffect, useRef, useState } from 'react';
import { useLive } from '../data/live.js';
import { Award, CalendarDays, ChevronLeft, ChevronRight, ListChecks, MessageCircle, Users } from 'lucide-react';
import { fetchAppointmentsImOn, fetchMyAppointments } from '../data/appointments.js';
import { fetchMyProspects, prospectToAppointmentPrefill } from '../data/prospects.js';
import { fetchRecruitSignups } from '../data/recruits.js';
import { pipelineSummary } from '../lib/pipeline.js';
import { fmtDate, parseDate, todayStr } from '../lib/dates.js';
import { fmtCurrency } from '../lib/format.js';
import { SystemsBody } from './Prospecting.jsx';
import { MyAppointmentsBody } from './Appointments.jsx';
import { OpenRequirementsBody } from './appointments/SubmittedPremium.jsx';
import { FollowUpBody } from './FollowUp.jsx';
import { ClientsBody } from './Clients.jsx';

// The pipeline bar, left to right. Results is submitted vs. issued premium.
export const PIPELINE_STAGES = [
  { key: 'names', label: 'Prospects', Icon: Users },
  { key: 'booked', label: 'Appointments', Icon: CalendarDays },
  { key: 'outcome', label: 'Log outcomes', Icon: ListChecks },
  { key: 'followup', label: 'Follow-up meetings', Icon: MessageCircle },
  { key: 'won', label: 'Results', Icon: Award },
];

// The bar itself: each stage with its count. stage: the one open, if any.
function PipelineBar({ stage, summary, onStage }) {
  // Phones: keep the open stage in view on the sideways strip.
  const strip = useRef(null);
  useEffect(() => {
    const el = strip.current;
    const on = el && el.querySelector('.tr-stage-on');
    if (!on || el.scrollWidth <= el.clientWidth) return;
    const a = el.getBoundingClientRect(), b = on.getBoundingClientRect();
    if (b.left < a.left || b.right > a.right) el.scrollLeft += b.left - a.left - 48;
  }, [stage]);
  return (
    <div className="tr-stages" ref={strip} role="tablist" aria-label="Pipeline">
      {PIPELINE_STAGES.map(({ key, label, Icon }, i) => (
        <div key={key} className="tr-stage-wrap">
          {i > 0 ? <ChevronRight size={16} className="tr-stage-arrow" aria-hidden="true" /> : null}
          <button type="button" role="tab" aria-selected={stage === key} className={`tr-stage ${stage === key ? 'tr-stage-on' : ''}`} onClick={() => onStage(key)}>
            <span className="tr-stage-top"><Icon size={14} aria-hidden="true" /> {label}</span>
            <span className="tr-stage-n">{summary ? summary[key].n : '–'}</span>
            <span className="tr-stage-sub">{summary ? summary[key].sub : ' '}</span>
          </button>
        </div>
      ))}
    </div>
  );
}
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
  const month = todayStr().slice(0, 7);
  const live = useLive(['pipeline-summary', user.id, month], async () => {
    const first = parseDate(`${month}-01`);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const [prospects, appointments, presenting, signups] = await Promise.all([
      fetchMyProspects(user.id), fetchMyAppointments(user.id), fetchAppointmentsImOn(user.id).catch(() => []),
      fetchRecruitSignups(fmtDate(first), fmtDate(last)),
    ]);
    return pipelineSummary({ prospects, appointments, presenting, signups, userId: user.id });
  }, { topics: ['appointments', 'prospects', 'recruits'] });
  const summary = live.data || null;
  // Fresh numbers whenever the stage changes too (a prospect added on one
  // list shows in the counts on the next).
  const firstStage = useRef(true);
  useEffect(() => {
    if (firstStage.current) { firstStage.current = false; return; }
    live.reload();
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  if (stage === 'clients' || !PIPELINE_STAGES.some(s => s.key === stage)) {
    // The bar sits under the Clients heading (not on one person's profile).
    return (
      <ClientsBody user={user} selected={client ? client.key : null} onSelect={(key, name) => { onClient(key ? { key, name } : null); window.scrollTo(0, 0); }}
        onLogAppointment={onLogAppointment} intent={intentFor('clients')} onIntentConsumed={clearIntent}
        bar={<PipelineBar stage={null} summary={summary} onStage={onStage} />} />
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
  return (
    <div className="tr-pipeline">
      <div className="tr-pipeline-head">
        <button type="button" className="tr-cl-back" data-android-back onClick={() => onStage('clients')}><ChevronLeft size={16} aria-hidden="true" /> {client && client.name ? client.name : 'Clients'}</button>
        <PipelineBar stage={stage} summary={summary} onStage={onStage} />
      </div>
      <div className="tr-flat" key={stage}>{body}</div>
    </div>
  );
}
