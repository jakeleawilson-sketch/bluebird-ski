import { api, type Me } from '../api';
import { useLocation } from '../router';

export function MemberNav({ me }: { me: Me }) {
  const loc = useLocation().split('?')[0];
  const cur = (p: string) => (loc === p || (p === '/' && loc.startsWith('/deal/')) ? 'page' : undefined);
  return (
    <>
      <a href="/" aria-current={cur('/')}>Trip</a>
      <a href="/insights" aria-current={cur('/insights')}>Insights</a>
      <a href="/prefs" aria-current={cur('/prefs')}>My preferences</a>
      {!!me.is_admin && <a href="/admin" aria-current={cur('/admin')}>Admin</a>}
      <button onClick={async () => { await api('/auth/logout', { body: {} }); location.href = '/signin'; }}>Sign out</button>
    </>
  );
}
