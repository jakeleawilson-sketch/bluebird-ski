// Writes parsed offers into D1: the deals catalogue (with price history) and
// the daily price_snapshots log used by Insights.
import type { Env } from './env';
import { buildResortMatcher, type ResortRef } from './lib/resorts';
import { nowIso } from './lib/time';
import type { ParsedOffer } from './sources/types';

let matcherCache: { at: number; match: ReturnType<typeof buildResortMatcher> } | null = null;

async function resortMatcher(env: Env) {
  if (matcherCache && Date.now() - matcherCache.at < 10 * 60_000) return matcherCache.match;
  const { results } = await env.DB.prepare('SELECT id, name, aliases, country_code FROM resorts').all<{ id: string; name: string; aliases: string; country_code: string }>();
  const refs: ResortRef[] = results.map((r) => ({ ...r, aliases: JSON.parse(r.aliases) }));
  matcherCache = { at: Date.now(), match: buildResortMatcher(refs) };
  return matcherCache.match;
}

export type IngestResult = { offers: number; newDeals: string[]; priceDrops: { dealId: string; from: number; to: number }[] };

export async function ingestOffers(env: Env, sourceId: string, sourceType: string, offers: ParsedOffer[], snapshotKey: string | null): Promise<IngestResult> {
  const usable = offers.filter((o) => o.accommodationType && o.pricePp > 0);
  const result: IngestResult = { offers: usable.length, newDeals: [], priceDrops: [] };
  if (!usable.length) return result;

  const match = await resortMatcher(env);
  const now = nowIso();
  const day = now.slice(0, 10);

  // Existing deals for these refs, to detect new deals and price changes.
  const refs = usable.map((o) => o.externalRef);
  const existing = new Map<string, { id: string; price_pp_gbp: number }>();
  for (let i = 0; i < refs.length; i += 50) {
    const chunk = refs.slice(i, i + 50);
    const { results } = await env.DB.prepare(
      `SELECT id, external_ref, price_pp_gbp FROM deals WHERE source_id = ? AND external_ref IN (${chunk.map(() => '?').join(',')})`,
    ).bind(sourceId, ...chunk).all<{ id: string; external_ref: string; price_pp_gbp: number }>();
    for (const r of results) existing.set(r.external_ref, r);
  }

  const stmts: D1PreparedStatement[] = [];
  for (const o of usable) {
    const resort = match(o.resortRaw, o.countryCode);
    const prev = existing.get(o.externalRef);
    const extras = JSON.stringify(o.extras);
    if (!prev) {
      const id = crypto.randomUUID();
      result.newDeals.push(id);
      stmts.push(env.DB.prepare(
        `INSERT INTO deals (id, source_id, source_type, external_ref, url, resort_id, resort_name_raw, country, accommodation_name, accommodation_type,
           board_basis, departure_airport, departure_date, nights, price_pp_gbp, was_price_pp_gbp, first_price_pp_gbp, price_basis_notes,
           includes_flights, includes_transfers, includes_lift_pass, extras, first_seen_at, last_seen_at, is_available, raw_snapshot_r2_key, extraction_confidence)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,1)`,
      ).bind(id, sourceId, sourceType, o.externalRef, o.url, resort?.id ?? null, o.resortRaw, o.countryCode, o.accommodationName, o.accommodationType,
        o.boardBasis, o.departureAirport, o.departureDate, o.nights, o.pricePp, o.wasPricePp, o.pricePp, o.priceBasisNotes,
        +o.includesFlights, +o.includesTransfers, +o.includesLiftPass, extras, now, now, snapshotKey));
      stmts.push(env.DB.prepare('INSERT INTO deal_price_history (deal_id, price_pp_gbp, captured_at) VALUES (?,?,?)').bind(id, o.pricePp, now));
    } else {
      const changed = prev.price_pp_gbp !== o.pricePp;
      stmts.push(env.DB.prepare(
        `UPDATE deals SET url = ?, price_pp_gbp = ?, was_price_pp_gbp = ?, extras = ?, last_seen_at = ?, is_available = 1, raw_snapshot_r2_key = ?,
           resort_id = COALESCE(resort_id, ?), last_price_change_at = CASE WHEN ? THEN ? ELSE last_price_change_at END WHERE id = ?`,
      ).bind(o.url, o.pricePp, o.wasPricePp, extras, now, snapshotKey, resort?.id ?? null, +changed, now, prev.id));
      if (changed) {
        stmts.push(env.DB.prepare('INSERT INTO deal_price_history (deal_id, price_pp_gbp, captured_at) VALUES (?,?,?)').bind(prev.id, o.pricePp, now));
        if (o.pricePp < prev.price_pp_gbp) result.priceDrops.push({ dealId: prev.id, from: prev.price_pp_gbp, to: o.pricePp });
      }
    }
    stmts.push(env.DB.prepare(
      `INSERT INTO price_snapshots (product_key, source_id, resort, resort_id, country, accommodation, accommodation_type, board_basis, departure_date, airport, nights,
         price_pp_gbp, was_price_pp_gbp, available, url, captured_at, captured_day)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)
       ON CONFLICT (product_key, captured_day) DO UPDATE SET price_pp_gbp = excluded.price_pp_gbp, was_price_pp_gbp = excluded.was_price_pp_gbp, captured_at = excluded.captured_at`,
    ).bind(o.productKey, sourceId, o.resortRaw, resort?.id ?? null, o.countryCode, o.accommodationName, o.accommodationType, o.boardBasis, o.departureDate,
      o.departureAirport, o.nights, o.pricePp, o.wasPricePp, o.url, now, day));
  }
  for (let i = 0; i < stmts.length; i += 90) await env.DB.batch(stmts.slice(i, i + 90));
  return result;
}
