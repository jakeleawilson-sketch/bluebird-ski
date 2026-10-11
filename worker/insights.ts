// Live price-logging stats for the Insights page (HANDOFF section 9c).
import type { Env } from './env';
import { daysBetween } from './lib/time';

const THRESHOLDS = [0.2, 0.3, 0.5];
const WINDOWS = [3, 7, 14];

export async function insights(env: Env) {
  const totals = await env.DB.prepare(
    'SELECT COUNT(*) AS rows, COUNT(DISTINCT product_key) AS products, COUNT(DISTINCT captured_day) AS days, MIN(captured_day) AS since, MAX(captured_at) AS last FROM price_snapshots',
  ).first();

  // Cheapest-right-now heatmap: latest day's median and min per week x country.
  const { results: heat } = await env.DB.prepare(
    `WITH latest AS (SELECT MAX(captured_day) AS d FROM price_snapshots)
     SELECT departure_date, country, accommodation_type, COUNT(*) AS n, MIN(price_pp_gbp) AS min_pp, AVG(price_pp_gbp) AS avg_pp
     FROM price_snapshots, latest WHERE captured_day = latest.d GROUP BY departure_date, country, accommodation_type`,
  ).all<{ departure_date: string; country: string; accommodation_type: string; n: number; min_pp: number; avg_pp: number }>();

  // Price vs days to departure: per product, (days_to_departure, price / first-seen price).
  const { results: series } = await env.DB.prepare(
    `SELECT s.departure_date, s.captured_day, s.country, s.price_pp_gbp, f.first_price
     FROM price_snapshots s
     JOIN (SELECT product_key, price_pp_gbp AS first_price, MIN(captured_day) FROM price_snapshots GROUP BY product_key) f ON f.product_key = s.product_key`,
  ).all<{ departure_date: string; captured_day: string; country: string; price_pp_gbp: number; first_price: number }>();

  const curve = new Map<number, { n: number; ratios: number[]; prices: number[] }>();
  for (const r of series) {
    const d = daysBetween(r.captured_day, r.departure_date);
    if (d < 0) continue;
    const bucket = d <= 14 ? d : d <= 60 ? Math.floor(d / 7) * 7 : Math.floor(d / 14) * 14;
    if (!curve.has(bucket)) curve.set(bucket, { n: 0, ratios: [], prices: [] });
    const b = curve.get(bucket)!;
    b.n++;
    b.ratios.push(r.price_pp_gbp / r.first_price);
    b.prices.push(r.price_pp_gbp);
  }
  const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const discountCurve = [...curve.entries()].sort((a, b) => b[0] - a[0]).map(([days, b]) => ({
    days, n: b.n, median_ratio: q(b.ratios, 0.5), p10_ratio: q(b.ratios, 0.1), median_price: q(b.prices, 0.5), p10_price: q(b.prices, 0.1), p90_price: q(b.prices, 0.9),
  }));

  // Empirical probabilities: share of products (with a snapshot inside the window)
  // whose price fell at least X below first-seen within N days of departure.
  const byProduct = new Map<string, { first: number; minInWindow: Record<number, number | null> }>();
  const { results: prod } = await env.DB.prepare(
    `SELECT product_key, departure_date, captured_day, price_pp_gbp FROM price_snapshots ORDER BY product_key, captured_day`,
  ).all<{ product_key: string; departure_date: string; captured_day: string; price_pp_gbp: number }>();
  for (const r of prod) {
    let p = byProduct.get(r.product_key);
    if (!p) { p = { first: r.price_pp_gbp, minInWindow: Object.fromEntries(WINDOWS.map((w) => [w, null])) }; byProduct.set(r.product_key, p); }
    const d = daysBetween(r.captured_day, r.departure_date);
    for (const w of WINDOWS) if (d >= 0 && d <= w) p.minInWindow[w] = Math.min(p.minInWindow[w] ?? Infinity, r.price_pp_gbp);
  }
  const empirical = WINDOWS.map((w) => {
    const eligible = [...byProduct.values()].filter((p) => p.minInWindow[w] != null);
    return {
      within_days: w,
      sample: eligible.length,
      shares: THRESHOLDS.map((t) => ({ drop: t, share: eligible.length ? eligible.filter((p) => p.minInWindow[w]! <= p.first * (1 - t)).length / eligible.length : null })),
    };
  });

  const { results: historical } = await env.DB.prepare(
    `SELECT id, source_kind, source_title, archive_url AS url, captured_on, operator, resort_raw AS resort, resort_id, country, accommodation_raw AS accommodation,
       accommodation_type, board_basis, departure_airport, departure_date, nights, days_before_departure, price_pp_gbp, was_price_pp_gbp, price_basis, notes
     FROM historical_deals ORDER BY departure_date DESC`,
  ).all();

  const { results: weeks } = await env.DB.prepare('SELECT start_date, label, hidden, badge FROM weeks ORDER BY start_date').all();
  return { totals, heat, discountCurve, empirical, weekPremium: await weekPremium(env), historical, weeks };
}

/**
 * How much more each week costs than the cheapest week, comparing like with
 * like: the same property, from the same airport, on the same board, priced on
 * the latest logging day. Only holidays priced in at least 6 Saturday weeks
 * count, so one-off listings don't skew it. Reported as the median ratio.
 */
export async function weekPremium(env: Env) {
  const { results } = await env.DB.prepare(
    `WITH latest AS (SELECT MAX(captured_day) AS d FROM price_snapshots WHERE source_id = 'iglu'),
     s AS (
       SELECT substr(product_key, 1, instr(substr(product_key, 6), ':') + 4) AS prop, airport, board_basis, accommodation_type, departure_date, price_pp_gbp
       FROM price_snapshots, latest
       WHERE source_id = 'iglu' AND captured_day = latest.d AND strftime('%w', departure_date) = '6' AND departure_date >= '2027-01-01'
     ),
     g AS (SELECT prop, airport, board_basis, MIN(price_pp_gbp) AS mn FROM s GROUP BY 1, 2, 3 HAVING COUNT(DISTINCT departure_date) >= 6)
     SELECT s.departure_date, s.accommodation_type, s.price_pp_gbp / g.mn AS ratio, s.price_pp_gbp AS price
     FROM s JOIN g USING (prop, airport, board_basis)`,
  ).all<{ departure_date: string; accommodation_type: string; ratio: number; price: number }>();

  const groups = new Map<string, { ratios: number[]; prices: number[] }>();
  for (const r of results) {
    const k = `${r.accommodation_type}|${r.departure_date}`;
    if (!groups.has(k)) groups.set(k, { ratios: [], prices: [] });
    groups.get(k)!.ratios.push(r.ratio);
    groups.get(k)!.prices.push(r.price);
  }
  const med = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  return [...groups.entries()]
    .map(([k, g]) => {
      const [type, week] = k.split('|');
      return { type, week, n: g.ratios.length, median_ratio: med(g.ratios), median_price: med(g.prices) };
    })
    .sort((a, b) => a.type.localeCompare(b.type) || a.week.localeCompare(b.week));
}
