// Screens other than Today load the first time they're opened, so the app
// starts faster. A moment after the first screen is up, the rest are fetched
// quietly in the background, so switching tabs still feels instant.
//
// If a new version went live while the app was open, the old version's
// screen files are gone. Then the app reloads once to pick up the new one.
import { Component, lazy } from 'react';

const RELOAD_KEY = 'pl_screen_reload';
const loaders = [];

const readFlag = () => { try { return sessionStorage.getItem(RELOAD_KEY) === '1'; } catch { return true; } };
const setFlag = on => { try { if (on) sessionStorage.setItem(RELOAD_KEY, '1'); else sessionStorage.removeItem(RELOAD_KEY); } catch { /* ignore */ } };

// load: () => import('...'); name: the export to show.
export function lazyScreen(load, name) {
  loaders.push(load);
  return lazy(() => load().then(m => { setFlag(false); return { default: m[name] }; }).catch(err => {
    if (!readFlag()) {
      setFlag(true);
      window.location.reload();
      return new Promise(() => {});
    }
    throw err;
  }));
}

let prefetched = false;
export function prefetchScreens() {
  if (prefetched) return;
  prefetched = true;
  const run = () => loaders.forEach(load => { load().catch(() => {}); });
  const later = () => (window.requestIdleCallback ? window.requestIdleCallback(run, { timeout: 4000 }) : setTimeout(run, 500));
  setTimeout(later, 1500);
}

// What shows for a split second while a screen loads.
export function ScreenLoading() {
  return (
    <div className="tr-screen-loading" role="status" aria-label="Loading">
      <div className="tr-skel" style={{ width: '40%', height: 28, marginBottom: 18 }} />
      <div className="tr-skel" style={{ width: '100%', height: 120, marginBottom: 12 }} />
      <div className="tr-skel" style={{ width: '100%', height: 120 }} />
    </div>
  );
}

// If a screen can't load at all (no connection), say so instead of a blank
// page. wrap: an optional component to put the message in (e.g. Shell).
export class ScreenBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(err) {
    console.error(err);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const Wrap = this.props.wrap || 'div';
    return (
      <Wrap>
        <div className="tr-card tr-screen-failed" role="alert">
          <strong>This screen didn't load.</strong>
          <p>Check your connection, then try again.</p>
          <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={() => { setFlag(false); window.location.reload(); }}>Try again</button>
        </div>
      </Wrap>
    );
  }
}
