import { useCallback, useEffect, useState } from 'preact/hooks';
import { api, daysUntil, fmtDate, gbp, type Deal, type Me, type Trip } from '../api';
import { navigate } from '../router';
import { useTripSocket, type BoardEvent } from '../socket';
import { Avatar, Confetti } from './bits';
import { DealBoard, DealDetail } from './Board';
import { Chat } from './Chat';
import { Loading, SkyHeader } from './Sky';
import { MemberNav } from './Nav';

export function Dashboard({ me, dealId }: { me: Me; dealId?: string }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const [celebrate, setCelebrate] = useState(false);
  const [wide, setWide] = useState(() => matchMedia('(min-width: 1024px)').matches);

  const loadTrip = useCallback(() => api<Trip>('/trip').then(setTrip), []);
  const loadDeals = useCallback(() => api<{ deals: Deal[] }>('/deals').then((r) => setDeals(r.deals)), []);

  const onEvent = useCallback((e: BoardEvent) => {
    if (e.event === 'trip') { loadTrip(); loadDeals(); }
    if (e.event === 'deals') loadDeals();
    if (e.event === 'upvote' && e.deal_id) setDeals((xs) => xs.map((d) => (d.id === e.deal_id ? { ...d, upvotes: e.upvotes ?? d.upvotes } : d)));
  }, []);
  const sock = useTripSocket(onEvent);

  useEffect(() => { loadTrip(); loadDeals(); }, []);
  useEffect(() => {
    const mq = matchMedia('(min-width: 1024px)');
    const f = () => setWide(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  // Unread count for the mobile drawer.
  useEffect(() => { if (chatOpen || wide) setSeen(sock.messages.length); }, [chatOpen, wide, sock.messages.length]);
  useEffect(() => {
    if (!trip?.booked) return;
    const key = 'bluebird:celebrated:' + trip.booked.id;
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch { /* ignore */ }
    setCelebrate(true);
    setTimeout(() => setCelebrate(false), 4000);
  }, [trip?.booked?.id]);

  const upvote = async (d: Deal) => {
    const r = await api<{ upvoted: boolean; upvotes: number }>(`/deals/${d.id}/upvote`, { body: {} });
    setDeals((xs) => xs.map((x) => (x.id === d.id ? { ...x, upvoted: r.upvoted, upvotes: r.upvotes } : x)));
  };
  const share = async (d: Deal) => {
    const note = prompt(`Share "${d.accommodation_name}" to the chat. Add a note? (optional)`, '');
    if (note === null) return;
    await api(`/deals/${d.id}/share`, { body: { note } });
    if (!wide) setChatOpen(true);
  };
  const openDeal = (id: string) => navigate(`/deal/${id}`);

  if (!trip) return <><SkyHeader nav={<MemberNav me={me} />} /><Loading /></>;

  const unread = Math.max(0, sock.messages.length - seen);
  const chat = <Chat sock={sock} me={me.id} isAdmin={!!me.is_admin} onOpenDeal={openDeal} />;

  return (
    <>
      {celebrate && <Confetti />}
      <SkyHeader nav={<MemberNav me={me} />}>
        <Banner trip={trip} />
      </SkyHeader>
      <main class="page">
        <div class="dash">
          <div class="stack">
            {trip.booked && (
              <div class="booked-banner">🎉 Booked! {trip.booked.accommodation_name}, {trip.booked.resort_name_raw}. <a href={trip.booked.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>Booking page ↗</a></div>
            )}
            {!trip.locked_week && <Leaderboard trip={trip} me={me} />}
            <DealBoard deals={deals} me={me} trip={trip} onOpen={openDeal} onUpvote={upvote} onShare={share} />
            <WhosIn trip={trip} />
          </div>
          {wide && <div class="chat-wrap">{chat}</div>}
        </div>
      </main>
      {!wide && !chatOpen && (
        <button class="chat-fab" onClick={() => setChatOpen(true)}>💬 Chat{unread > 0 && <span class="unread">{unread}</span>}</button>
      )}
      {!wide && chatOpen && (
        <>
          <div class="drawer-backdrop" onClick={() => setChatOpen(false)} />
          <div class="drawer">
            <div style={{ position: 'relative' }}>
              <button class="btn btn-sm" style={{ position: 'absolute', right: 12, top: 10, zIndex: 2 }} onClick={() => setChatOpen(false)}>Close</button>
              {chat}
            </div>
          </div>
        </>
      )}
      {dealId && <DealDetail id={dealId} isAdmin={!!me.is_admin} onClose={() => navigate('/')} onUpvote={upvote} onShare={share} onAdminChange={() => { loadDeals(); loadTrip(); }} />}
    </>
  );
}

function Banner({ trip }: { trip: Trip }) {
  if (trip.locked_week) {
    const days = daysUntil(trip.locked_week);
    return (
      <div class="banner">
        <div class="label">We're going</div>
        <h1>{fmtDate(trip.locked_week, { weekday: 'short', day: 'numeric', month: 'long' })}</h1>
        <div class="row" style={{ marginTop: 10, gap: 18 }}>
          <div><span class="countdown">{Math.max(0, days)}</span> <span style={{ fontWeight: 700 }}>{days === 1 ? 'day' : 'days'} to go</span></div>
          {trip.group_ceiling && <div><div class="label">Group budget</div><strong style={{ fontSize: '1.3rem' }}>{gbp(trip.group_ceiling)}pp</strong></div>}
        </div>
      </div>
    );
  }
  const top = trip.leaderboard[0];
  return (
    <div class="banner">
      <div class="label">Ski trip 2027 · picking the week</div>
      <h1>{top && top.available > 0 ? `${fmtDate(top.start, { day: 'numeric', month: 'short' })} is winning` : 'Which week?'}</h1>
      <p style={{ margin: '8px 0 0', fontWeight: 600 }}>
        {trip.vote_deadline ? `Voting closes ${fmtDate(trip.vote_deadline, { weekday: 'long', day: 'numeric', month: 'long' })}.` : 'Rank the weeks you can do in My preferences.'}
        {trip.group_ceiling ? ` Group budget ${gbp(trip.group_ceiling)}pp.` : ''}
      </p>
    </div>
  );
}

function Leaderboard({ trip, me }: { trip: Trip; me: Me }) {
  const max = Math.max(1, ...trip.leaderboard.map((s) => s.preference));
  const voters = trip.members.length;
  const badge = new Map(trip.weeks.map((w) => [w.start_date, w.badge]));
  return (
    <section class="card" aria-label="Week leaderboard">
      <div class="row" style={{ marginBottom: 6 }}>
        <h2>Week leaderboard</h2>
        <span class="spacer" />
        <a class="btn btn-sm" href="/prefs">{me.weeks.length ? 'Change my weeks' : 'Rank my weeks'}</a>
      </div>
      <p class="small muted">Ranked by how many can go ("I'm in" counts 1, "Interested" ½), then by how much people want it.</p>
      <ol class="leader">
        {trip.leaderboard.map((s, i) => (
          <li class={i === 0 && s.available > 0 ? 'top' : ''}>
            <span class="pos">{i + 1}</span>
            <div style={{ minWidth: 0 }}>
              <strong>{fmtDate(s.start, { weekday: 'short', day: 'numeric', month: 'short' })}</strong>
              {badge.get(s.start) && <span class="badge" style={{ marginLeft: 8 }}>{badge.get(s.start)}</span>}
              <div class="tiny muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.names.join(', ') || 'Nobody yet'}</div>
              <div class="prefbar" aria-hidden="true"><span style={{ width: `${(s.preference / max) * 100}%` }} /></div>
            </div>
            <span class="small" style={{ fontWeight: 800 }}>{s.inCount}{s.interestedCount ? ` +${s.interestedCount}` : ''}<span class="muted" style={{ fontWeight: 600 }}> / {voters}</span></span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function WhosIn({ trip }: { trip: Trip }) {
  const ins = trip.members.filter((m) => m.status === 'in');
  const maybes = trip.members.filter((m) => m.status === 'interested');
  return (
    <section class="card" aria-label="Who's in">
      <h2>Who's in</h2>
      <p class="small muted">{ins.length} in{maybes.length ? `, ${maybes.length} interested` : ''}.</p>
      <div class="avatars">
        {ins.map((m) => <span class="row" style={{ gap: 6, marginRight: 10 }}><Avatar id={m.id} name={m.name} online={m.online} /> <span class="small">{m.name}</span></span>)}
      </div>
      {maybes.length > 0 && (
        <div class="avatars" style={{ marginTop: 10, opacity: 0.75 }}>
          {maybes.map((m) => <span class="row" style={{ gap: 6, marginRight: 10 }}><Avatar id={m.id} name={m.name} online={m.online} /> <span class="small">{m.name} <span class="muted">(maybe)</span></span></span>)}
        </div>
      )}
    </section>
  );
}
