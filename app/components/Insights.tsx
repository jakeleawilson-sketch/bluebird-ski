import { useEffect, useMemo, useState } from 'preact/hooks';
import { ACC_LABELS, api, COUNTRY_FLAGS, fmtDate, gbp, type AccType, type Me, type Trip } from '../api';
import { ESTIMATES, Guide, Sources } from './Guide';
import { MemberNav } from './Nav';
import { Loading, SkyHeader } from './Sky';

type Historical = {
  id: string; source_kind: 'press' | 'wayback'; source_title: string; url: string; captured_on: string; operator: string | null;
  resort: string; country: string | null; accommodation: string; accommodation_type: AccType; board_basis: string | null;
  departure_airport: string | null; departure_date: string; nights: number | null; days_before_departure: number | null;
  price_pp_gbp: number; was_price_pp_gbp: number | null; price_basis: string | null; notes: string | null;
};

type Data = {
  totals: { rows: number; products: number; days: number; since: string | null; last: string | null };
  heat: { departure_date: string; country: string; accommodation_type: AccType; n: number; min_pp: number; avg_pp: number }[];
  discountCurve: { days: number; n: number; median_ratio: number; p10_ratio: number; median_price: number; p10_price: number; p90_price: number }[];
  empirical: { within_days: number; sample: number; shares: { drop: number; share: number | null }[] }[];
  weekPremium: { type: AccType; week: string; n: number; median_ratio: number; median_price: number }[];
  historical: Historical[];
  weeks: Trip['weeks'];
};

export function InsightsPage({ me }: { me: Me }) {
  const [d, setD] = useState<Data | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  useEffect(() => { api<Data>('/insights').then(setD); api<Trip>('/trip').then(setTrip); }, []);

  // "Our week": the locked week, or the current leader while voting.
  const ourWeek = trip?.locked_week ?? (trip?.leaderboard[0]?.available ? trip.leaderboard[0].start : null);

  return (
    <>
      <SkyHeader nav={<MemberNav me={me} />}>
        <div style={{ paddingBottom: 46 }}>
          <h1>Last-minute insights</h1>
          <p style={{ fontWeight: 600, maxWidth: 680, marginTop: 8 }}>
            Should we book now or hold out for a late deal? What the research says, real late deals from past seasons, and prices Bluebird logs every day.
          </p>
        </div>
      </SkyHeader>
      <main class="page stack insights" style={{ marginTop: -30, position: 'relative' }}>
        {!d ? <Loading /> : (
          <>
            <nav class="card toc small" aria-label="On this page">
              <a href="#week-premium">Which week costs most</a>
              <a href="#guide">The guide</a>
              <a href="#odds">The odds</a>
              <a href="#past">Past late deals</a>
              <a href="#live">Live price log</a>
            </nav>
            <WeekPremium data={d.weekPremium} ourWeek={ourWeek} weeks={d.weeks} />
            <div id="guide"><Guide /></div>
            <Odds d={d} />
            <PastDeals rows={d.historical} ourWeek={ourWeek} />
            <LiveLog d={d} />
            <Sources />
          </>
        )}
      </main>
    </>
  );
}

// ------------------------------------------------------------------ week premium chart

function WeekPremium({ data, ourWeek, weeks }: { data: Data['weekPremium']; ourWeek: string | null; weeks: Trip['weeks'] }) {
  const [type, setType] = useState<AccType>('catered_chalet');
  const [table, setTable] = useState(false);
  const rows = data.filter((r) => r.type === type && r.n >= 5);
  const types = (Object.keys(ACC_LABELS) as AccType[]).filter((t) => data.some((r) => r.type === t && r.n >= 5));
  const max = Math.max(1.5, ...rows.map((r) => r.median_ratio));
  const badge = new Map(weeks.map((w) => [w.start_date, w.badge]));
  const cheapest = rows.length ? rows.reduce((a, b) => (b.median_ratio < a.median_ratio ? b : a)) : null;

  return (
    <section class="card" id="week-premium" aria-labelledby="wp-title">
      <div class="row" style={{ marginBottom: 4 }}>
        <h2 id="wp-title">Which week costs most</h2>
        <span class="spacer" />
        <div class="seg" role="group" aria-label="Accommodation type">
          {types.map((t) => <button type="button" aria-pressed={type === t} onClick={() => setType(t)}>{ACC_LABELS[t]}</button>)}
        </div>
      </div>
      <p class="small muted">
        The same holiday (same property, same airport, same board) priced across the 2027 weeks, shown as how much more each week costs than that holiday's cheapest week. Median across holidays, from today's prices. Measured by Bluebird, not taken from marketing.
      </p>
      {!rows.length ? <p class="muted">Not enough data yet.</p> : table ? (
        <div class="table-wrap">
          <table>
            <thead><tr><th>Week</th><th>vs cheapest week</th><th>Typical price pp</th><th>Holidays compared</th></tr></thead>
            <tbody>{rows.map((r) => <tr><td>{fmtDate(r.week, { day: 'numeric', month: 'short' })}</td><td>{pctMore(r.median_ratio)}</td><td>{gbp(r.median_price)}</td><td>{r.n}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <ol class="wp" aria-label={`Price premium by week, ${ACC_LABELS[type]}`}>
          {rows.map((r) => {
            const ours = r.week === ourWeek;
            const b = badge.get(r.week);
            return (
              <li class={ours ? 'ours' : ''} tabIndex={0}>
                <span class="wp-week">{fmtDate(r.week, { day: 'numeric', month: 'short' })}{ours ? <span class="wp-ours">our week</span> : b && <span class="wp-badge">{b}</span>}</span>
                <span class="wp-track" aria-hidden="true">
                  <span class="wp-bar" style={{ width: `${Math.max(2, ((r.median_ratio - 1) / (max - 1)) * 100)}%` }} />
                </span>
                <span class="wp-val">{pctMore(r.median_ratio)}</span>
                <span class="wp-tip" role="tooltip">
                  <strong>{fmtDate(r.week, { weekday: 'short', day: 'numeric', month: 'long' })}</strong>{b ? ` · ${b}` : ''}<br />
                  Typically {pctMore(r.median_ratio)} vs each holiday's cheapest week<br />
                  Median {gbp(r.median_price)}pp · {r.n} holidays compared
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <div class="row small" style={{ marginTop: 10 }}>
        {cheapest && <span class="muted">Cheapest: <strong>{fmtDate(cheapest.week, { day: 'numeric', month: 'short' })}</strong>.</span>}
        <span class="spacer" />
        <button class="btn btn-sm btn-ghost" type="button" onClick={() => setTable(!table)}>{table ? 'Show chart' : 'Show as table'}</button>
      </div>
    </section>
  );
}

const pctMore = (ratio: number) => (ratio < 1.005 ? 'cheapest' : `+${Math.round((ratio - 1) * 100)}%`);

// ------------------------------------------------------------------ odds

function Odds({ d }: { d: Data }) {
  return (
    <section class="card" id="odds">
      <h2>The odds</h2>
      <p class="small muted">
        Our best estimates from the research above. They're judgement calls, not measurements. As the season approaches, the measured table underneath fills in from Bluebird's own price log and takes over.
      </p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Chance that…</th><th>Week type</th><th>Estimate</th><th>Confidence</th></tr></thead>
          <tbody>
            {ESTIMATES.map((e) => (
              <tr>
                <td>{e.claim}<div class="tiny muted">{e.why}</div></td>
                <td class="small">{e.week}</td>
                <td><strong>{e.chance}</strong></td>
                <td><span class={'badge ' + (e.confidence === 'Low' ? 'badge-warn' : '')}>{e.confidence}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 style={{ margin: '18px 0 6px' }}>Measured by Bluebird</h3>
      <p class="small muted">Share of tracked holidays whose price fell at least this far below the first price we saw, within N days of departure. Empty until departures get that close; Bluebird won't guess.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Within</th><th>Holidays</th><th>≥20% off</th><th>≥30% off</th><th>≥50% off</th></tr></thead>
          <tbody>
            {d.empirical.map((e) => (
              <tr>
                <td>{e.within_days} days</td>
                <td>{e.sample}</td>
                {e.shares.map((s) => <td>{s.share == null ? <span class="muted">no data yet</span> : `${Math.round(s.share * 100)}%`}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ past late deals

const dayOfSeason = (iso: string) => {
  // Days from 1 Dec of the season, so dates from different years line up.
  const d = new Date(iso + 'T12:00:00Z');
  const startYear = d.getUTCMonth() >= 7 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return Math.round((d.getTime() - Date.UTC(startYear, 11, 1, 12)) / 86400000);
};

function PastDeals({ rows, ourWeek }: { rows: Historical[]; ourWeek: string | null }) {
  const [month, setMonth] = useState('');
  const [country, setCountry] = useState('');
  const near = (r: Historical) => !!ourWeek && Math.abs(dayOfSeason(r.departure_date) - dayOfSeason(ourWeek)) <= 10;
  const shown = useMemo(
    () => rows
      .filter((r) => (!month || r.departure_date.slice(5, 7) === month) && (!country || r.country === country))
      .sort((a, b) => Number(near(b)) - Number(near(a)) || b.departure_date.localeCompare(a.departure_date)),
    [rows, month, country, ourWeek],
  );
  const countries = [...new Set(rows.map((r) => r.country).filter(Boolean))] as string[];

  return (
    <section class="card" id="past">
      <div class="row" style={{ marginBottom: 4 }}>
        <h2>Past late deals</h2>
        <span class="spacer" />
        <select class="input" style={{ width: 'auto', minHeight: 38 }} aria-label="Month" value={month} onChange={(e) => setMonth(e.currentTarget.value)}>
          <option value="">Any month</option>
          {[['12', 'December'], ['01', 'January'], ['02', 'February'], ['03', 'March'], ['04', 'April']].map(([v, l]) => <option value={v}>{l}</option>)}
        </select>
        <select class="input" style={{ width: 'auto', minHeight: 38 }} aria-label="Country" value={country} onChange={(e) => setCountry(e.currentTarget.value)}>
          <option value="">Any country</option>
          {countries.map((c) => <option value={c}>{COUNTRY_FLAGS[c]} {c}</option>)}
        </select>
      </div>
      <p class="small muted">
        Real late deals from earlier seasons, each checked against the linked article. "Advertised" is how many days before departure the price was published. Wayback Machine snapshots of operators' late-deal pages will be added here too.
        {ourWeek && ' Deals within 10 days of our week in the season are shown first.'}
      </p>
      <div class="past">
        {shown.map((r) => {
          const saving = r.was_price_pp_gbp ? r.was_price_pp_gbp - r.price_pp_gbp : null;
          return (
            <article class={'past-item' + (near(r) ? ' near' : '')}>
              <div class="row" style={{ gap: 6 }}>
                <span class="where small">{COUNTRY_FLAGS[r.country ?? ''] ?? ''} {r.resort}</span>
                {near(r) && <span class="badge badge-sun">Near our week</span>}
                <span class="spacer" />
                <span class="tiny muted">{fmtDate(r.departure_date, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              <strong>{r.accommodation}</strong>
              <div class="tiny muted">{r.operator} · {ACC_LABELS[r.accommodation_type]}{r.board_basis ? ` · ${r.board_basis}` : ''}{r.departure_airport ? ` · ✈ ${r.departure_airport}` : ''}</div>
              <div class="row" style={{ gap: 8, alignItems: 'baseline' }}>
                <span class="price" style={{ fontSize: '1.5rem' }}>{gbp(r.price_pp_gbp)}<small> pp</small></span>
                {saving && <span class="badge badge-good">save {gbp(saving)} ({Math.round((saving / r.was_price_pp_gbp!) * 100)}%)</span>}
              </div>
              <div class="tiny muted">
                {r.days_before_departure != null && `Advertised ${r.days_before_departure} days before departure. `}
                {r.price_basis}{r.notes ? `. ${r.notes}` : ''}
              </div>
              <a class="tiny" href={r.url} target="_blank" rel="noopener noreferrer">{r.source_title} ↗</a>
            </article>
          );
        })}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ live log

function LiveLog({ d }: { d: Data }) {
  const [acc, setAcc] = useState<AccType>('catered_chalet');
  const heat = useMemo(() => {
    const rows = d.heat.filter((h) => h.accommodation_type === acc && h.departure_date >= '2027-01-01');
    const weeks = [...new Set(rows.map((r) => r.departure_date))].sort();
    const countries = [...new Set(rows.map((r) => r.country))].filter(Boolean).sort();
    const cell = new Map(rows.map((r) => [`${r.departure_date}|${r.country}`, r]));
    const mins = rows.map((r) => r.min_pp);
    return { weeks, countries, cell, lo: Math.min(...mins), hi: Math.max(...mins) };
  }, [d, acc]);

  return (
    <section class="card" id="live">
      <h2>Live price log</h2>
      <p class="small muted">
        {d.totals.rows
          ? <>Tracking <strong>{d.totals.products.toLocaleString()}</strong> holidays across every candidate week, {d.totals.days} {d.totals.days === 1 ? 'day' : 'days'} of data since {fmtDate(d.totals.since!, { day: 'numeric', month: 'short' })}. </>
          : 'No prices logged yet. '}
        Prices are per person for 2 sharing, with flights and transfers, from Iglu Ski (which resells most UK operators).
      </p>
      {heat.weeks.length > 0 && (
        <>
          <div class="row" style={{ margin: '12px 0 6px' }}>
            <h3>Cheapest right now</h3>
            <span class="spacer" />
            <select class="input" style={{ width: 'auto', minHeight: 38 }} value={acc} onChange={(e) => setAcc(e.currentTarget.value as AccType)} aria-label="Accommodation type">
              {Object.entries(ACC_LABELS).map(([k, v]) => <option value={k}>{v}</option>)}
            </select>
          </div>
          <p class="small muted">Lowest price per person seen today, by week and country. Darker is cheaper.</p>
          <div class="table-wrap">
            <table class="heat">
              <thead><tr><th>Week</th>{heat.countries.map((c) => <th>{COUNTRY_FLAGS[c]} {c}</th>)}</tr></thead>
              <tbody>
                {heat.weeks.map((w) => (
                  <tr>
                    <th style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{fmtDate(w, { day: 'numeric', month: 'short' })}</th>
                    {heat.countries.map((c) => {
                      const r = heat.cell.get(`${w}|${c}`);
                      if (!r) return <td class="muted">–</td>;
                      const t = heat.hi > heat.lo ? (r.min_pp - heat.lo) / (heat.hi - heat.lo) : 0.5;
                      return <td style={{ background: `color-mix(in srgb, var(--accent) ${Math.round((1 - t) * 34 + 4)}%, transparent)` }} title={`${r.n} holidays, average ${gbp(r.avg_pp)}`}>{gbp(r.min_pp)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {d.discountCurve.length > 0 && (
        <>
          <h3 style={{ margin: '18px 0 6px' }}>Price vs days to departure</h3>
          <p class="small muted">Median price relative to the first price we saw (1.00 = unchanged), grouped by days before departure. This becomes meaningful as departures get closer.</p>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Days out</th><th>Snapshots</th><th>Median vs first</th><th>Best 10%</th><th>Median £pp</th><th>Range (10–90%)</th></tr></thead>
              <tbody>
                {d.discountCurve.slice(0, 20).map((r) => (
                  <tr><td>{r.days}</td><td>{r.n}</td><td>{r.median_ratio.toFixed(2)}</td><td>{r.p10_ratio.toFixed(2)}</td><td>{gbp(r.median_price)}</td><td>{gbp(r.p10_price)} – {gbp(r.p90_price)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
