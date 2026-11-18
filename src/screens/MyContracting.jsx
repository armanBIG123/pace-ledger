// Contracting, for people without activity tools (Manage Team): the first
// screen they see. Any MegaPhone announcement, then their licensing steps,
// the producer agreement and the contracting form (the same as Growth →
// Licensing for everyone else).
import { PageHead } from '../components/ui.jsx';
import { AnnouncementToday } from '../components/announcements.jsx';
import { LicensingBody } from './Milestones.jsx';

export function MyContractingBody({ user }) {
  return (
    <div className="tr-my-contracting">
      <PageHead title="Contracting" sub="Your licensing, producer agreement and contracting, in one place." />
      <AnnouncementToday user={user} />
      <LicensingBody user={user} />
    </div>
  );
}
