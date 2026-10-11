import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import './styles.css';
import { api, type Me } from './api';
import { installLinkInterceptor, navigate, useLocation } from './router';
import { AdminPage } from './components/Admin';
import { Dashboard } from './components/Dashboard';
import { InsightsPage } from './components/Insights';
import { AuthPage, JoinPage, PrefsPage, SignInPage } from './components/Pages';
import { Loading, SkyHeader } from './components/Sky';

function App() {
  const loc = useLocation();
  const path = loc.split('?')[0];
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  const loadMe = () => api<Me>('/me').then(setMe).catch(() => setMe(null));
  const isPublic = path.startsWith('/join/') || path === '/auth' || path === '/signin';
  // Public pages don't need the member; load it when we first land on a private one.
  useEffect(() => { if (!isPublic && !me) loadMe(); }, [isPublic]);

  if (path.startsWith('/join/')) return <JoinPage token={decodeURIComponent(path.slice(6))} />;
  if (path === '/auth') return <AuthPage onSignedIn={loadMe} />;
  if (path === '/signin') return <SignInPage />;

  if (me === undefined) return <><SkyHeader /><Loading /></>;
  if (me === null) { navigate('/signin', true); return null; }

  // Members created by signing in (e.g. the admin) answer the questions first.
  if (path === '/prefs' || !me.budget_ceiling_gbp) return <PrefsPage me={me} onSaved={loadMe} />;
  if (path === '/insights') return <InsightsPage me={me} />;
  if (path === '/admin') return me.is_admin ? <AdminPage me={me} /> : <Dashboard me={me} />;
  const deal = path.match(/^\/deal\/([\w-]+)$/);
  return <Dashboard me={me} dealId={deal?.[1]} />;
}

installLinkInterceptor();
render(<App />, document.getElementById('app')!);
