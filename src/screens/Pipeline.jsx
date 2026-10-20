// Pipeline: Prospecting, My Appointments and Follow Up as one flow. Five
// stages a name moves through, left to right: Names → Booked → Log outcome
// → Follow-up → Won. Each stage opens the screen that does that job; the
// counts on top come from the same rules those screens use.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Award, CalendarDays, ChevronRight, ListChecks, MessageCircle, Users } from 'lucide-react';
import { fetchAppointmentsImOn, fetchMyAppointments } from '../data/appointments.js';
import { fetchMyProspects, prospectToAppointmentPrefill } from '../data/prospects.js';
import { pipelineSummary } from '../lib/pipeline.js';
import { fmtCurrency } from '../lib/format.js';
import { TitleInfo } from '../components/ui.jsx';
import { SystemsBody } from './Prospecting.jsx';
import { MyAppointmentsBody, OpenRequirementsBody } from './Appointments.jsx';
import { FollowUpBody } from './FollowUp.jsx';

export const PIPELINE_STAGES = [
  { key: 'names', label: 'Names', Icon: Users },
  { key: 'booked', label: 'Booked', Icon: CalendarDays },
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

// stage + onStage: which stage is open (kept by the app, so other screens can
// open a stage directly). intentFor / clearIntent: requests from elsewhere
// (search, + New, Today) for the screen behind a stage.
export function PipelineBody({ user, stage, onStage, intentFor, clearIntent, prefillData, onPrefillConsumed, cameFrom, onReturn, onLogAppointment }) {
  const [summary, setSummary] = useState(null);
  const load = useCallback(async () => {
    const [prospects, appointments, presenting] = await Promise.all([
      fetchMyProspects(user.id), fetchMyAppointments(user.id), fetchAppointmentsImOn(user.id).catch(() => []),
    ]);
    setSummary(pipelineSummary({ prospects, appointments, presenting, userId: user.id }));
  }, [user.id]);
  // Fresh numbers whenever the stage changes or appointments are saved.
  useEffect(() => { load(); }, [load, stage]);
  useEffect(() => {
    const again = () => load();
    window.addEventListener('paceledger:appointments-changed', again);
    return () => window.removeEventListener('paceledger:appointments-changed', again);
  }, [load]);

  // Phones: keep the open stage in view on the sideways strip.
  const strip = useRef(null);
  useEffect(() => {
    const el = strip.current;
    const on = el && el.querySelector('.tr-stage-on');
    if (!on || el.scrollWidth <= el.clientWidth) return;
    const a = el.getBoundingClientRect(), b = on.getBoundingClientRect();
    if (b.left < a.left || b.right > a.right) el.scrollLeft += b.left - a.left - 48;
  }, [stage]);

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
      <div className="tr-row-head tr-screen-head">
        <TitleInfo title="Pipeline" info="Every name from first contact to a won sale or recruit, in one place. Tap a stage to see who is in it: your list, booked appointments, outcomes to log, follow-ups, and sales and recruits won." />
      </div>
      <div className="tr-stages" ref={strip} role="tablist" aria-label="Pipeline stages">
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
      <div className="tr-flat" key={stage}>{body}</div>
    </div>
  );
}
