// Connect / disconnect cards for Zoom and Google Calendar.
import { useState } from 'react';
import { X } from 'lucide-react';

// A one-line reminder on Pipeline → Appointments until Zoom is connected.
// "Not now" hides it for 30 days; Zoom is also under Your account.
const NUDGE_KEY = 'pl_zoom_nudge_until';
export function ZoomNudge({ connecting, onConnect }) {
  const [hidden, setHidden] = useState(() => { try { return Number(localStorage.getItem(NUDGE_KEY) || 0) > Date.now(); } catch { return false; } });
  if (hidden) return null;
  function later() {
    try { localStorage.setItem(NUDGE_KEY, String(Date.now() + 30 * 864e5)); } catch { /* fine: hidden until reload */ }
    setHidden(true);
  }
  return (
    <div className="tr-connect-slim tr-connect-nudge">
      <span className="tr-connect-dot" />
      <span className="tr-connect-text"><strong>Zoom isn't connected.</strong><span className="tr-hide-mobile"> Connect it and each appointment gets its own meeting link.</span></span>
      <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={onConnect} disabled={connecting}>{connecting ? 'Opening…' : 'Connect'}</button>
      <button type="button" className="tr-icon-btn" onClick={later} aria-label="Not now" title="Not now"><X size={15} /></button>
    </div>
  );
}

export function GoogleCalendarConnect({ status, connecting, onConnect, onDisconnect }) {
  return (
    <div className={`tr-connect-slim ${status.connected ? 'tr-connect-slim-on' : ''}`}>
      <span className="tr-connect-dot" />
      <span className="tr-connect-text">
        {status.connected
          ? <><strong>Google Calendar connected</strong> as {status.googleEmail || 'your Google account'}.</>
          : <><strong>Google Calendar not connected.</strong> Connect it to see your Google events here and to put appointments (and their invites) on your Google Calendar.</>}
      </span>
      {status.connected ? (
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onDisconnect}>Disconnect</button>
      ) : (
        <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={onConnect} disabled={connecting}>
          {connecting ? 'Redirecting…' : 'Connect Google Calendar'}
        </button>
      )}
    </div>
  );
}
