import { useEffect, useState } from 'preact/hooks';
import { api, ApiError, type Me, type Reference } from '../api';
import { navigate } from '../router';
import { Avatar } from './bits';
import { MemberNav } from './Nav';
import { Loading, SkyHeader } from './Sky';
import { PrivacyNote, Wizard } from './Wizard';

function useReference() {
  const [ref, setRef] = useState<Reference | null>(null);
  useEffect(() => { api<Reference>('/reference').then(setRef); }, []);
  return ref;
}

export function JoinPage({ token }: { token: string }) {
  const ref = useReference();
  const [invite, setInvite] = useState<{ valid: boolean; open?: boolean; joined?: { name: string; status: string }[] } | null>(null);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState<{ email?: string; existing?: boolean } | null>(null);
  useEffect(() => { api<typeof invite>(`/invite/${token}`).then(setInvite).catch(() => setInvite({ valid: false })); }, [token]);

  if (!invite || !ref) return <><SkyHeader /><Loading /></>;
  if (!invite.valid || !invite.open)
    return (
      <>
        <SkyHeader><h1>{invite.valid ? 'Registration has closed' : 'This invite link has expired'}</h1></SkyHeader>
        <main class="page narrow"><div class="card"><p>{invite.valid ? 'The group is sorted for this trip.' : `Ask ${ref.admin_name} for the latest link.`} Already joined? <a href="/signin">Sign in</a>.</p></div></main>
      </>
    );
  if (done) return <CheckEmail email={done.email} existing={done.existing} />;

  return (
    <>
      <SkyHeader nav={<a href="/signin">Sign in</a>}>
        {!started && (
          <div style={{ padding: '12px 0 54px', color: '#fff' }}>
            <p style={{ fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: '0.8rem', margin: 0 }}>You're invited · Ski trip 2027</p>
            <h1 style={{ margin: '8px 0 12px', maxWidth: 720 }}>One week in the mountains, Jan to Mar 2027.</h1>
            <p style={{ fontSize: '1.15rem', maxWidth: 560, fontWeight: 500 }}>
              Tell us when you can go and what you're after. Bluebird picks the week most people can do, then hunts down the best-value catered chalets and hotels for it.
            </p>
            {!!invite.joined?.length && (
              <div class="row" style={{ margin: '18px 0 0', gap: 8 }}>
                <div class="avatars">{invite.joined.slice(0, 12).map((m) => <Avatar id={m.name} name={m.name} />)}</div>
                <span style={{ fontWeight: 700 }}>{listNames(invite.joined.map((m) => m.name))} {invite.joined.length === 1 ? 'is' : 'are'} in</span>
              </div>
            )}
            <p style={{ marginTop: 26 }}><button class="btn btn-sun btn-big" onClick={() => setStarted(true)}>I'm in ⛷️</button></p>
          </div>
        )}
      </SkyHeader>
      <main class="page">
        {started ? <Wizard reference={ref} mode={{ kind: 'join', token }} onDone={setDone} /> : (
          <div class="card narrow" style={{ margin: '-30px auto 0', position: 'relative' }}>
            <h3 style={{ marginBottom: 8 }}>How it works</h3>
            <ol class="small" style={{ paddingLeft: 18, margin: '0 0 12px' }}>
              <li>Answer a few quick questions (about 2 minutes).</li>
              <li>Rank the weeks you can do. The most popular week gets locked.</li>
              <li>Browse, upvote and chat about the deals Bluebird finds. It never books anything; you book direct.</li>
            </ol>
            <PrivacyNote />
          </div>
        )}
      </main>
    </>
  );
}

function listNames(n: string[]) {
  if (n.length <= 3) return n.join(n.length === 2 ? ' and ' : ', ');
  return `${n.slice(0, 3).join(', ')} and ${n.length - 3} more`;
}

export function CheckEmail({ email, existing }: { email?: string; existing?: boolean }) {
  return (
    <>
      <SkyHeader><h1 style={{ paddingBottom: 40 }}>Check your email ✉️</h1></SkyHeader>
      <main class="page narrow">
        <div class="card stack" style={{ marginTop: -30, position: 'relative' }}>
          <p>{existing ? "You're already signed up, so we've sent you a sign-in link instead (your answers weren't changed)." : 'Nearly there!'} We've sent a link to <strong>{email ?? 'your inbox'}</strong>. Tap it to {existing ? 'sign in' : 'confirm your email and see the trip'}.</p>
          <p class="small muted">It expires in 30 minutes. Not there? Check spam, or <a href="/signin">request another</a>.</p>
        </div>
      </main>
    </>
  );
}

export function SignInPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useReference();
  if (sent) return <CheckEmail email={email} />;
  return (
    <>
      <SkyHeader><h1 style={{ paddingBottom: 40 }}>Welcome back</h1></SkyHeader>
      <main class="page narrow">
        <form class="card stack" style={{ marginTop: -30, position: 'relative' }} onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try { await api('/auth/request', { body: { email } }); setSent(true); }
          catch (err) { setError(err instanceof ApiError ? err.message : 'Something went wrong.'); }
          finally { setBusy(false); }
        }}>
          <label class="field"><span>Your email</span><input class="input" type="email" required autocomplete="email" inputMode="email" value={email} onInput={(e) => setEmail(e.currentTarget.value)} /></label>
          {error && <p class="error" role="alert">{error}</p>}
          <button class="btn btn-sun" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</button>
          <p class="small muted">New here? You need the invite link from {ref?.admin_name ?? 'the organiser'}.</p>
        </form>
      </main>
    </>
  );
}

export function AuthPage({ onSignedIn }: { onSignedIn: () => Promise<unknown> }) {
  const [error, setError] = useState('');
  useEffect(() => {
    const token = new URLSearchParams(location.search).get('token');
    if (!token) { setError('This link is missing its token.'); return; }
    api('/auth/verify', { body: { token } })
      .then(() => onSignedIn())
      .then(() => navigate('/', true))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not sign you in.'));
  }, []);
  return (
    <>
      <SkyHeader />
      <main class="page narrow">
        {error ? (
          <div class="card stack"><p class="error">{error}</p><a class="btn btn-sun" href="/signin">Get a new link</a></div>
        ) : <Loading text="Signing you in…" />}
      </main>
    </>
  );
}

export function PrefsPage({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const ref = useReference();
  const [saved, setSaved] = useState(false);
  return (
    <>
      <SkyHeader nav={<MemberNav me={me} />}><h1 style={{ paddingBottom: 46 }}>My preferences</h1></SkyHeader>
      <main class="page">
        {!ref ? <Loading /> : saved ? (
          <div class="card narrow stack" style={{ margin: '-30px auto 0', position: 'relative' }}>
            <h2>Saved ✓</h2>
            <p>Your answers are updated, and the leaderboard and deal scores now use them.</p>
            <div class="row"><a class="btn btn-sun" href="/">Back to the trip</a><button class="btn" onClick={() => setSaved(false)}>Edit again</button></div>
          </div>
        ) : (
          <Wizard reference={ref} mode={{ kind: 'edit', initial: me }} onDone={() => { setSaved(true); onSaved(); }} />
        )}
      </main>
    </>
  );
}
