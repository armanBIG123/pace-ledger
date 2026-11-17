// My work → Clients (this tab was Pipeline). It opens on Clients: everyone,
// one profile each, with the pipeline bar on top that filters the list in
// place (screens/Clients.jsx). The older lists behind it (prospecting tools,
// appointments by week, outcomes, intake forms and recruit links, submitted
// and issued premium) open from Clients → More, and from Today, search and
// + New, each with a way back to Clients.
import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { prospectToAppointmentPrefill } from '../data/prospects.js';
import { SystemsBody } from './Prospecting.jsx';
import { MyAppointmentsBody } from './Appointments.jsx';
import { OpenRequirementsBody } from './appointments/SubmittedPremium.jsx';
import { FollowUpBody } from './FollowUp.jsx';
import { ClientsBody } from './Clients.jsx';

// Which Follow Up lists each older list offers (the first is where it opens).
export const OUTCOME_VIEWS = ['nolog', 'presented', 'reschedule', 'not_completed', 'completed', 'all'];
export const FOLLOWUP_VIEWS = ['needs', 'nointake', 'sent', 'received', 'recruit_open', 'recruit_joined'];
// The older lists (the address keeps their old names). Each has its own
// title, except submitted and issued premium.
const LIST_TITLES = {
  names: 'Prospecting tools', booked: 'Appointments', outcome: 'Outcomes and reschedules',
  followup: 'Intake forms and recruit links', won: 'Submitted and issued premium',
};

function WonStage({ user }) {
  const [view, setView] = useState('sold');
  return (
    <div className="tr-won">
      <div className="tr-seg tr-seg-view" role="group" aria-label="Show">
        <button type="button" className={view === 'sold' ? 'tr-seg-on' : ''} aria-pressed={view === 'sold'} onClick={() => setView('sold')}>Submitted premium</button>
        <button type="button" className={view === 'issued' ? 'tr-seg-on' : ''} aria-pressed={view === 'issued'} onClick={() => setView('issued')}>Issued premium</button>
      </div>
      <p className="tr-count-line">
        {view === 'issued'
          ? 'Your policies with an effective date that has arrived and every requirement complete.'
          : 'Your submitted policies waiting on an effective date or open requirements. Set the effective date and mark requirements complete as they come in; your leaders can add notes.'}
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
  if (stage === 'clients' || !LIST_TITLES[stage]) {
    return (
      <ClientsBody user={user} selected={client ? client.key : null} onSelect={(key, name) => { onClient(key ? { key, name } : null); window.scrollTo(0, 0); }}
        onLogAppointment={onLogAppointment} intent={intentFor('clients')} onIntentConsumed={clearIntent} onOpenList={onStage} />
    );
  }

  let body = null;
  if (stage === 'names') {
    body = <SystemsBody user={user} initialIntent={intentFor('systems')} onIntentConsumed={clearIntent} onLogAppointment={p => onLogAppointment(prospectToAppointmentPrefill(p))} />;
  } else if (stage === 'booked') {
    body = (
      <MyAppointmentsBody user={user} section="booked" prefillData={prefillData} onPrefillConsumed={onPrefillConsumed}
        initialIntent={intentFor('mine')} onIntentConsumed={clearIntent} cameFrom={cameFrom} onReturn={onReturn}
        onOpenClient={(key, name) => { onClient({ key, name }); onStage('clients'); }} />
    );
  } else if (stage === 'outcome') {
    body = <FollowUpBody user={user} views={OUTCOME_VIEWS} initialIntent={intentFor('followup')} onIntentConsumed={clearIntent} onScheduleNext={onLogAppointment} />;
  } else if (stage === 'followup') {
    body = <FollowUpBody user={user} views={FOLLOWUP_VIEWS} initialIntent={intentFor('followup')} onIntentConsumed={clearIntent} onScheduleNext={onLogAppointment} />;
  } else {
    body = <WonStage user={user} />;
  }
  return (
    <div className="tr-pipeline">
      <div className="tr-pipeline-head">
        <button type="button" className="tr-cl-back" data-android-back onClick={() => onStage('clients')}><ChevronLeft size={16} aria-hidden="true" /> {client && client.name ? client.name : 'Clients'}</button>
        {stage === 'won' ? <h1 className="tr-h2">{LIST_TITLES.won}</h1> : null}
      </div>
      <div className="tr-flat" key={stage}>{body}</div>
    </div>
  );
}
