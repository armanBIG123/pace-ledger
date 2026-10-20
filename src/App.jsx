// The app's entry point: loads the session and profile, then shows the right layout.
import { Suspense, useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient.js';
import { hasDirectReports, seesTeam } from './data/team.js';
import { connectGoogleCalendar, connectZoom, finishGoogleConnect, isGoogleOAuthReturn } from './data/integrations.js';
import { Shell, Spinner } from './components/ui.jsx';
import { AndroidBackLeavesApp } from './components/navigation.jsx';
import { lazyScreen, ScreenBoundary } from './components/lazyScreen.jsx';
import { AuthScreen, ResetPasswordScreen } from './screens/Auth.jsx';
import { AdminView, AdvisorView, ManagerView } from './views/RoleViews.jsx';

// The client intake form (opened from a link sent to a client) loads only
// for that link.
const ClientIntakePublicForm = lazyScreen(() => import('./ClientIntake.jsx'), 'ClientIntakePublicForm');

// ---------------------------------------------------------------------
// root — handles the Supabase session/profile lifecycle
// ---------------------------------------------------------------------
export default function App() {
  // A client filling out their intake form has no account and no session —
  // this link works whether or not anyone is signed in on this browser, so
  // it's checked first and, if present, renders instead of the normal app.
  // Read once from the URL present at mount; nothing in this app changes
  // it via client-side navigation, so it's safe to branch before any hooks.
  // The old workers.dev address still serves the app; send everyone to the
  // real domain (keeping any ?intake=, ?zoom=… on the URL) so sign-ins,
  // Google's redirect and Zoom's all happen on big-pace-ledger.com.
  if (window.location.hostname.endsWith('.workers.dev')) {
    window.location.replace(`https://big-pace-ledger.com${window.location.pathname}${window.location.search}${window.location.hash}`);
    return null;
  }
  const intakeToken = new URLSearchParams(window.location.search).get('intake');
  if (intakeToken) {
    return (
      <ScreenBoundary wrap={Shell}>
        <Suspense fallback={<Shell><Spinner label="Loading…" /></Shell>}><ClientIntakePublicForm token={intakeToken} /></Suspense>
      </ScreenBoundary>
    );
  }

  const [session, setSession] = useState(undefined); // undefined = checking, null = logged out
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [connectionBanner, setConnectionBanner] = useState(null);
  // Tracks which user we've already loaded a profile for, so a background
  // token refresh (e.g. from switching browser tabs and back) doesn't
  // re-trigger the loading screen and unmount everything below it.
  const fetchedForUserId = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Google or Zoom redirects back here (via their respective Edge
  // Functions) after someone connects or cancels — surface a clear
  // message either way, then clean the URL so refreshing doesn't re-show it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // New flow: Google returns straight to this site with ?code=&state=.
    if (isGoogleOAuthReturn(params)) {
      // Clear the one-time code from the address bar right away.
      window.history.replaceState({}, '', window.location.pathname);
      setConnectionBanner({ type: 'success', message: 'Finishing your Google Calendar connection…' });
      finishGoogleConnect(params).then(result => {
        if (result.ok) {
          setConnectionBanner({ type: 'success', message: 'Google Calendar connected.' });
          window.dispatchEvent(new Event('paceledger:google-connected'));
        } else if (result.reason === 'cancelled') {
          setConnectionBanner({ type: 'error', message: 'Google Calendar was not connected — you cancelled on the Google screen.' });
        } else {
          setConnectionBanner({ type: 'error', message: `Could not connect Google Calendar (${result.reason}). Please try again.` });
        }
      });
      return;
    }
    const google = params.get('google');
    const zoom = params.get('zoom');
    if (google === 'connected') {
      setConnectionBanner({ type: 'success', message: 'Google Calendar connected.' });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (google === 'error') {
      setConnectionBanner({ type: 'error', message: `Could not connect Google Calendar (${params.get('reason') || 'unknown error'}). Please try again.` });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (zoom === 'connected') {
      setConnectionBanner({ type: 'success', message: 'Zoom connected.' });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (zoom === 'error') {
      setConnectionBanner({ type: 'error', message: `Could not connect Zoom (${params.get('reason') || 'unknown error'}). Please try again.` });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // ?connect=google|zoom — opened from the iPhone app in a Safari sheet,
  // because Google and Zoom sign-in can't run inside the app itself. Kept
  // until the person is signed in here, then started automatically.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const want = params.get('connect');
    if (want === 'google' || want === 'zoom') {
      try {
        sessionStorage.setItem('pl_pending_connect', want);
        sessionStorage.setItem('pl_pending_connect_for', params.get('for') || '');
      } catch { /* ignore */ }
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);
  useEffect(() => {
    if (!session || !profile) return;
    let want = null, forUser = '';
    try {
      want = sessionStorage.getItem('pl_pending_connect');
      forUser = sessionStorage.getItem('pl_pending_connect_for') || '';
      sessionStorage.removeItem('pl_pending_connect');
      sessionStorage.removeItem('pl_pending_connect_for');
    } catch { /* ignore */ }
    if (want && forUser && forUser !== session.user.id) {
      // Signed in here as someone else — don't attach their calendar to the wrong person.
      setConnectionBanner({ type: 'error', message: "You're signed in here with a different PaceLedger account than in the app. Log out, sign in with the same account, then connect again." });
      return;
    }
    if (want === 'google') connectGoogleCalendar();
    else if (want === 'zoom') connectZoom();
  }, [session, profile]);

  useEffect(() => {
    let cancelled = false;
    const userId = session && session.user ? session.user.id : null;

    if (!userId) {
      setProfile(null);
      fetchedForUserId.current = null;
      return;
    }
    if (fetchedForUserId.current === userId) return; // same person, already loaded — do nothing

    setProfileLoading(true);
    setProfileError('');
    Promise.all([supabase.from('profiles').select('*').eq('id', userId).single(), hasDirectReports(userId)])
      .then(([{ data, error }, leads]) => {
        if (cancelled) return;
        if (error) setProfileError('Could not load your profile. Try refreshing the page.');
        setProfile(data ? { ...data, _leads: leads } : null);
        setProfileLoading(false);
        fetchedForUserId.current = userId;
      });
    return () => { cancelled = true; };
  }, [session]);

  // Your account -> Save changes (or a new photo): show it right away.
  useEffect(() => {
    const changed = e => {
      const d = (e && e.detail) || {};
      setProfile(p => (p ? { ...p, ...(d.display_name ? { display_name: d.display_name } : {}), npn: d.npn ?? p.npn, fg_writing_number: d.fg_writing_number ?? p.fg_writing_number, licensed_at: d.licensed_at ?? p.licensed_at, avatar_path: d.avatar_path !== undefined ? d.avatar_path : p.avatar_path } : p));
    };
    window.addEventListener('paceledger:profile-changed', changed);
    return () => window.removeEventListener('paceledger:profile-changed', changed);
  }, []);

  if (session === undefined) return <Shell><AndroidBackLeavesApp /><Spinner label="Loading…" /></Shell>;
  if (recoveryMode) return <><AndroidBackLeavesApp /><ResetPasswordScreen onDone={() => setRecoveryMode(false)} /></>;
  if (!session) return <><AndroidBackLeavesApp /><ConnectionBanner banner={connectionBanner} onDismiss={() => setConnectionBanner(null)} /><AuthScreen /></>;
  if (profileError) {
    return (
      <Shell>
        <AndroidBackLeavesApp />
        <div className="tr-auth-wrap"><div className="tr-card"><p className="tr-error">{profileError}</p></div></div>
      </Shell>
    );
  }
  if (profileLoading || !profile) return <Shell><AndroidBackLeavesApp /><Spinner label="Loading your account…" /></Shell>;

  const user = { id: session.user.id, email: session.user.email || profile.email || '', displayName: profile.display_name, role: profile.role, hierarchyTier: profile.hierarchy_tier, managerId: profile.manager_id, createdAt: profile.created_at, isLeader: !!profile._leads, avatarPath: profile.avatar_path || '' };
  return (
    <>
      <ConnectionBanner banner={connectionBanner} onDismiss={() => setConnectionBanner(null)} />
      {user.role === 'super_admin' ? <AdminView user={user} /> : seesTeam(user) ? <ManagerView user={user} /> : <AdvisorView user={user} />}
    </>
  );
}

export function ConnectionBanner({ banner, onDismiss }) {
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(onDismiss, 6000);
    return () => clearTimeout(t);
  }, [banner, onDismiss]);
  if (!banner) return null;
  return (
    <div className={`tr-toast tr-toast-${banner.type}`}>
      {banner.message}
      <button type="button" className="tr-toast-close" onClick={onDismiss} aria-label="Dismiss">×</button>
    </div>
  );
}
