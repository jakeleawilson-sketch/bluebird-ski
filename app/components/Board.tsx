import { useEffect, useMemo, useState } from 'preact/hooks';
import { ACC_LABELS, ago, api, COUNTRY_FLAGS, fmtDate, gbp, type Deal, type Me, type Trip } from '../api';
import { ScoreRing, Sparkline } from './bits';

type Sort = 'score' | 'cheapest' | 'upvotes' | 'newest';

export function suitsMe(d: Deal, me: Me) {
  return !!d.country && me.countries.includes(d.country) && me.accommodation.includes(d.accommodation_type) && !!d.departure_airport && me.airports.includes(d.departure_airport);
}

export function DealBoard({ deals, me, trip, onOpen, onUpvote, onShare }: {
  deals: Deal[]; me: Me; trip: Trip; onOpen: (id: string) => void; onUpvote: (d: Deal) => void; onShare: (d: Deal) => void;
}) {
  const [sort, setSort] = useState<Sort>('score');
  const [country, setCountry] = useState('');
  const [acc, setAcc] = useState('');
  const [airport, setAirport] = useState('');
  const [mine, setMine] = useState(false);
  const [limit, setLimit] = useState(30);

  const opts = useMemo(() => ({
    countries: [...new Set(deals.map((d) => d.country).filter(Boolean))] as string[],
    airports: [...new Set(deals.map((d) => d.departure_airport).filter(Boolean))].sort() as string[],
  }), [deals]);

  const shown = useMemo(() => {
    const xs = deals.filter((d) => (!country || d.country === country) && (!acc || d.accommodation_type === acc) && (!airport || d.departure_airport === airport) && (!mine || suitsMe(d, me)));
    const by: Record<Sort, (a: Deal, b: Deal) => number> = {
      score: (a, b) => b.score.total - a.score.total,
      cheapest: (a, b) => a.price_pp_gbp - b.price_pp_gbp,
      upvotes: (a, b) => b.upvotes - a.upvotes || b.score.total - a.score.total,
      newest: (a, b) => b.first_seen_at.localeCompare(a.first_seen_at),
    };
    return xs.sort((a, b) => Number(b.pinned) - Number(a.pinned) || by[sort](a, b));
  }, [deals, sort, country, acc, airport, mine, me]);

  if (!trip.locked_week)
    return (
      <div class="card empty">
        <div class="big">Deals arrive once the week is locked</div>
        <p class="muted">Rank the weeks you can do. When voting closes, Bluebird locks the most popular week and starts hunting deals for it.</p>
        <p class="small muted">Meanwhile it's already logging prices for every candidate week (see Insights).</p>
      </div>
    );

  return (
    <section aria-label="Deal board">
      <div class="card" style={{ padding: '14px 16px 2px', marginBottom: 14 }}>
      <div class="toolbar">
        <h2 style={{ marginRight: 'auto' }}>Deal board</h2>
        <label class="sr-only" for="sort">Sort</label>
        <select id="sort" value={sort} onChange={(e) => setSort(e.currentTarget.value as Sort)}>
          <option value="score">Best Bluebird score</option>
          <option value="cheapest">Cheapest</option>
          <option value="upvotes">Most upvoted</option>
          <option value="newest">Newest</option>
        </select>
      </div>
      <div class="toolbar">
        <select aria-label="Country" value={country} onChange={(e) => setCountry(e.currentTarget.value)}>
          <option value="">All countries</option>
          {opts.countries.map((c) => <option value={c}>{COUNTRY_FLAGS[c]} {c}</option>)}
        </select>
        <select aria-label="Accommodation type" value={acc} onChange={(e) => setAcc(e.currentTarget.value)}>
          <option value="">All types</option>
          {Object.entries(ACC_LABELS).map(([k, v]) => <option value={k}>{v}</option>)}
        </select>
        <select aria-label="Departure airport" value={airport} onChange={(e) => setAirport(e.currentTarget.value)}>
          <option value="">All airports</option>
          {opts.airports.map((a) => <option value={a}>{a}</option>)}
        </select>
        <label class="check small" style={{ alignItems: 'center' }}>
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.currentTarget.checked)} /> Suits me
        </label>
        <span class="tiny muted" style={{ marginLeft: 'auto' }}>{shown.length} deals{trip.group_ceiling ? ` · budget ${gbp(trip.group_ceiling)}pp` : ''}</span>
      </div>
      </div>
      {!shown.length ? (
        <div class="card empty">
          <div class="big">{deals.length ? 'Nothing matches those filters' : 'Scouting the slopes…'}</div>
          <p class="muted">{deals.length ? 'Try loosening a filter.' : 'No deals found for the locked week yet. The next scan will post them here.'}</p>
        </div>
      ) : (
        <>
          <div class="deals">
            {shown.slice(0, limit).map((d) => <DealCard d={d} trip={trip} onOpen={onOpen} onUpvote={onUpvote} onShare={onShare} />)}
          </div>
          {shown.length > limit && (
            <p style={{ textAlign: 'center', marginTop: 16 }}><button class="btn" onClick={() => setLimit(limit + 30)}>Show more ({shown.length - limit} left)</button></p>
          )}
        </>
      )}
    </section>
  );
}

function DealCard({ d, trip, onOpen, onUpvote, onShare }: { d: Deal; trip: Trip; onOpen: (id: string) => void; onUpvote: (d: Deal) => void; onShare: (d: Deal) => void }) {
  const sunday = new Date(d.departure_date + 'T12:00:00Z').getUTCDay() === 0;
  return (
    <article class={'card deal' + (d.pinned ? ' pinned' : '')}>
      <div class="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div class="where">{COUNTRY_FLAGS[d.country ?? ''] ?? ''} {d.resort}</div>
          <h3><a href={`/deal/${d.id}`} style={{ color: 'inherit', textDecoration: 'none' }} onClick={(e) => { e.preventDefault(); onOpen(d.id); }}>{d.accommodation_name}</a></h3>
        </div>
        <ScoreRing value={d.score.total} />
      </div>
      <div class="meta">
        <span>{ACC_LABELS[d.accommodation_type]}{d.board_basis ? ` · ${d.board_basis}` : ''}</span>
        <span>✈ {d.departure_airport} · {fmtDate(d.departure_date)} · {d.nights}n</span>
      </div>
      <div>
        <span class="price">{gbp(d.price_pp_gbp)}<small> pp</small></span>
        {d.was_price_pp_gbp && <span class="was">{gbp(d.was_price_pp_gbp)}</span>}
      </div>
      <div class="row" style={{ gap: 6 }}>
        <span class="badge badge-good">Suits {d.score.suitsCount} of {d.score.memberCount}</span>
        {d.fit === 'stretch' && <span class="badge badge-warn">Stretch</span>}
        {sunday && <span class="badge">Sunday departure</span>}
        {d.pinned && <span class="badge badge-sun">📌 Pinned</span>}
        {d.includes_lift_pass && <span class="badge badge-sun">Lift pass incl.</span>}
        {d.extras.slice(0, 1).map((x) => <span class="badge" title={x}>{x.length > 38 ? x.slice(0, 36) + '…' : x}</span>)}
      </div>
      <div class="tiny muted">{d.source_name} · checked {ago(d.last_seen_at)}{trip.group_ceiling ? '' : ''}</div>
      <div class="deal-actions">
        <button class="btn btn-sm upvote" aria-pressed={d.upvoted} onClick={() => onUpvote(d)} aria-label={`Upvote, ${d.upvotes} so far`}>▲ {d.upvotes}</button>
        <button class="btn btn-sm" onClick={() => onShare(d)}>Share to chat</button>
        <span class="spacer" />
        <a class="btn btn-sm btn-sun" href={d.url} target="_blank" rel="noopener noreferrer">View deal ↗</a>
      </div>
    </article>
  );
}

export function DealDetail({ id, onClose, onUpvote, onShare, isAdmin, onAdminChange }: {
  id: string; onClose: () => void; onUpvote: (d: Deal) => void; onShare: (d: Deal) => void; isAdmin: boolean; onAdminChange: () => void;
}) {
  const [data, setData] = useState<{ deal: Deal; history: { price_pp_gbp: number; captured_at: string }[]; voters: string[] } | null>(null);
  const [error, setError] = useState('');

  const load = () => api<typeof data>(`/deals/${id}`).then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, []);

  const adminSet = async (patch: Record<string, unknown>) => {
    await api(`/admin/deals/${id}`, { body: patch });
    await load();
    onAdminChange();
  };

  const d = data?.deal;
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="card modal" role="dialog" aria-modal="true" aria-labelledby="deal-title">
        <div class="row" style={{ marginBottom: 8 }}>
          <span class="spacer" />
          <button class="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close">✕ Close</button>
        </div>
        {error && <p class="error">{error}</p>}
        {!d ? !error && <div class="loading">Waxing the skis…</div> : (
          <div class="stack">
            <div class="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <div style={{ flex: 1 }}>
                <div class="deal"><div class="where">{COUNTRY_FLAGS[d.country ?? '']} {d.resort}</div></div>
                <h2 id="deal-title" style={{ fontFamily: 'var(--body)', fontWeight: 800 }}>{d.accommodation_name}</h2>
                <p class="muted" style={{ margin: '4px 0 0' }}>{ACC_LABELS[d.accommodation_type]}{d.board_basis ? ` · ${d.board_basis}` : ''} · ✈ {d.departure_airport} · {fmtDate(d.departure_date, { weekday: 'long', day: 'numeric', month: 'long' })} · {d.nights} nights</p>
              </div>
              <ScoreRing value={d.score.total} />
            </div>
            <div>
              <span class="price">{gbp(d.price_pp_gbp)}<small> per person</small></span>
              {d.was_price_pp_gbp && <span class="was">{gbp(d.was_price_pp_gbp)}</span>}
              <p class="small muted" style={{ marginTop: 6 }}>Flights, transfers and accommodation, 2 sharing. Lift pass and hire not included unless noted.</p>
            </div>
            {d.blurb && <p>{d.blurb}</p>}
            {(d.extras.length > 0 || d.includes_lift_pass) && (
              <div class="row" style={{ gap: 6 }}>
                {d.includes_lift_pass && <span class="badge badge-sun">Lift pass included</span>}
                {d.extras.map((x) => <span class="badge">{x}</span>)}
              </div>
            )}
            <div class="row">
              <button class="btn upvote" aria-pressed={d.upvoted} onClick={async () => { await onUpvote(d); load(); }}>▲ Upvote · {d.upvotes}</button>
              <button class="btn" onClick={() => onShare(d)}>Share to chat</button>
              <span class="spacer" />
              <a class="btn btn-sun" href={d.url} target="_blank" rel="noopener noreferrer">View &amp; book on {d.source_name} ↗</a>
            </div>
            {data!.voters.length > 0 && <p class="small muted">Upvoted by {data!.voters.join(', ')}</p>}

            <div>
              <h3 style={{ marginBottom: 8 }}>Why this score</h3>
              <div class="breakdown">
                {d.score.parts.map((p) => (
                  <div class="part">
                    <strong>{p.label}</strong>
                    <span class="small muted">{Math.round(p.score * 100)}/100</span>
                    <div class="bar"><span style={{ width: `${Math.round(p.score * 100)}%` }} /></div>
                    <span class="small muted" style={{ gridColumn: '1 / -1' }}>{p.why}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 style={{ marginBottom: 8 }}>Price history</h3>
              <Sparkline points={data!.history} />
              <p class="tiny muted">First seen {ago(d.first_seen_at)} at {gbp(d.first_price_pp_gbp)}pp · last checked {ago(d.last_seen_at)} · via {d.source_name}</p>
            </div>

            {isAdmin && (
              <div class="notice">
                <strong>Admin</strong>
                <div class="row" style={{ marginTop: 8 }}>
                  <button class="btn btn-sm" onClick={() => adminSet({ pinned: !d.pinned })}>{d.pinned ? 'Unpin' : 'Pin'}</button>
                  <button class="btn btn-sm" onClick={() => adminSet({ hidden: !d.hidden })}>{d.hidden ? 'Unhide' : 'Hide'}</button>
                  <button class="btn btn-sm btn-sun" onClick={() => confirm(d.booked ? 'Unmark as booked?' : 'Mark this as BOOKED? Everyone will see the celebration.') && adminSet({ booked: !d.booked })}>{d.booked ? 'Unmark booked' : 'Mark as Booked!'}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
