// Connect / disconnect cards for Zoom and Google Calendar.

export function ZoomConnect({ status, connecting, onConnect, onDisconnect }) {
  return (
    <div className={`tr-connect-slim ${status.connected ? 'tr-connect-slim-on' : ''}`}>
      <span className="tr-connect-dot" />
      <span className="tr-connect-text">
        {status.connected
          ? <><strong>Zoom connected</strong> as {status.zoomEmail || 'your Zoom account'} — every new appointment gets its own meeting link.</>
          : <><strong>Zoom not connected.</strong> Connect it and every appointment you log gets its own meeting link automatically.</>}
      </span>
      {status.connected ? (
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onDisconnect}>Disconnect</button>
      ) : (
        <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={onConnect} disabled={connecting}>
          {connecting ? 'Redirecting…' : 'Connect Zoom'}
        </button>
      )}
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
