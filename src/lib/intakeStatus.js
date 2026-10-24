// Where a client's intake form stands, in a few words ("Texted Oct 22",
// "Filled in today"). Shared by Follow-up, the send window and Today.

// "today", "yesterday" or "Oct 22".
export function dayWord(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const days = Math.round((t - that) / 864e5);
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function intakeStatusText(c) {
  if (!c) return 'Not sent';
  if (c.status === 'submitted') return `Filled in ${dayWord(c.submitted_at)}`;
  if (c.sent_via === 'text') return `Texted ${dayWord(c.sent_at)}`;
  if (c.sent_via === 'email') return `Emailed ${dayWord(c.sent_at)}`;
  if (c.sent_via === 'copy') return `Link copied ${dayWord(c.sent_at)}`;
  return 'Link made, not sent yet';
}

// green: filled in; amber: sent, waiting; none: not sent.
export function intakeStatusTone(c) {
  return !c ? 'none' : c.status === 'submitted' ? 'green' : c.sent_via ? 'amber' : 'none';
}
