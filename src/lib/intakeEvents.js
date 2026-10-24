// Opening the "Send intake form" window from anywhere, and telling screens
// when an intake form changed (made, sent, removed). The window itself is
// IntakePanel (components/intakePanel.jsx), mounted once per view.

// detail: { appointment, candidate? } to send one client's form, or
// { pick: true } to choose the client first (+ New).
export function openIntakeSend(detail) {
  window.dispatchEvent(new CustomEvent('paceledger:open-intake', { detail }));
}

// detail: { candidate } (made or changed) or { removedId }.
export function intakeChanged(detail) {
  window.dispatchEvent(new CustomEvent('paceledger:intake-changed', { detail }));
}
