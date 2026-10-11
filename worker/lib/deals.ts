// Normalised deal shape, board filtering and Bluebird score (HANDOFF section 7).
import { budgetFit, type BudgetFit } from './budget';

export type AccommodationType = 'catered_chalet' | 'chalet_hotel' | 'hotel';
export const ACCOMMODATION_TYPES: AccommodationType[] = ['catered_chalet', 'chalet_hotel', 'hotel'];
export const ACCOMMODATION_LABELS: Record<AccommodationType, string> = {
  catered_chalet: 'Catered chalet',
  chalet_hotel: 'Chalet hotel',
  hotel: 'Hotel',
};

export type DealRow = {
  id: string;
  source_id: string;
  resort_id: string | null;
  country: string | null;
  accommodation_type: AccommodationType;
  departure_airport: string | null;
  departure_date: string;
  price_pp_gbp: number;
  was_price_pp_gbp: number | null;
  first_price_pp_gbp: number;
  rooms_available: number | null;
  hidden?: number;
};

export type MemberPrefs = {
  id: string;
  status: 'in' | 'interested';
  countries: string[]; // ranked, index 0 = favourite
  resorts: string[]; // ranked resort ids
  accommodation: AccommodationType[];
  airports: string[];
};

export type ResortFacts = { id: string; top_altitude_m: number | null; glacier: number | boolean; transfer_mins: Record<string, number> };

// ------------------------------------------------------------------ filtering

/** Saturday of the locked week, plus the Sunday after it if Sunday departures are allowed. */
export function allowedDepartureDates(lockedWeek: string, allowSunday: boolean): string[] {
  const dates = [lockedWeek];
  if (allowSunday) {
    const d = new Date(lockedWeek + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export type BoardContext = {
  lockedWeek: string;
  allowSunday: boolean;
  ceiling: number | null;
  members: MemberPrefs[];
};

export type FilterResult = { show: boolean; fit: BudgetFit; reason?: string };

export function filterDeal(deal: DealRow, ctx: BoardContext): FilterResult {
  const fit = budgetFit(deal.price_pp_gbp, ctx.ceiling);
  const no = (reason: string): FilterResult => ({ show: false, fit, reason });
  if (deal.hidden) return no('hidden');
  if (!allowedDepartureDates(ctx.lockedWeek, ctx.allowSunday).includes(deal.departure_date)) return no('date');
  const union = (f: (m: MemberPrefs) => string[]) => new Set(ctx.members.flatMap(f));
  if (!deal.country || !union((m) => m.countries).has(deal.country)) return no('country');
  if (!union((m) => m.accommodation).has(deal.accommodation_type)) return no('accommodation');
  if (!deal.departure_airport || !union((m) => m.airports).has(deal.departure_airport)) return no('airport');
  if (fit === 'over') return no('price');
  const inCount = ctx.members.filter((m) => m.status === 'in').length;
  if (deal.rooms_available != null && deal.rooms_available < inCount) return no('capacity');
  return { show: true, fit };
}

/** Does this deal suit this member on country, accommodation type and airport? */
export function suits(deal: DealRow, m: MemberPrefs): boolean {
  return (
    !!deal.country && m.countries.includes(deal.country) &&
    m.accommodation.includes(deal.accommodation_type) &&
    !!deal.departure_airport && m.airports.includes(deal.departure_airport)
  );
}

// ------------------------------------------------------------------ score

export type ScoreWeights = {
  value: number;
  budget: number;
  group: number;
  resort: number;
  snow: number;
  practicality: number;
};

export const DEFAULT_WEIGHTS: ScoreWeights = { value: 30, budget: 15, group: 20, resort: 15, snow: 10, practicality: 10 };

export type ScoreInput = {
  deal: DealRow;
  ceiling: number | null;
  members: MemberPrefs[];
  resort: ResortFacts | null;
  /** Median price pp for the same week, country and accommodation type in our data. */
  peerMedian: number | null;
};

export type ScorePart = { key: keyof ScoreWeights; label: string; score: number; weight: number; why: string };
export type Score = { total: number; parts: ScorePart[]; suitsCount: number; memberCount: number };

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const pct = (x: number) => Math.round(x * 100);

export function scoreDeal(input: ScoreInput, weights: ScoreWeights = DEFAULT_WEIGHTS): Score {
  const { deal, ceiling, members, resort, peerMedian } = input;
  const price = deal.price_pp_gbp;
  const parts: ScorePart[] = [];

  // Value: half vs peer median, half vs discount from was/first-seen price.
  {
    const vsMedian = peerMedian ? clamp01(0.5 + (peerMedian - price) / peerMedian) : 0.5; // 25% under median -> 0.75
    const ref = Math.max(deal.was_price_pp_gbp ?? 0, deal.first_price_pp_gbp ?? 0);
    const discount = ref > price ? (ref - price) / ref : 0;
    const vsRef = clamp01(discount / 0.4); // 40% off or more = full marks
    const score = (vsMedian + vsRef) / 2;
    const bits: string[] = [];
    if (peerMedian) {
      const d = Math.round(((peerMedian - price) / peerMedian) * 100);
      bits.push(d >= 0 ? `${d}% below the typical price for this week` : `${-d}% above the typical price for this week`);
    } else bits.push('not enough similar deals yet to compare');
    if (discount > 0) {
      const fromWas = (deal.was_price_pp_gbp ?? 0) >= (deal.first_price_pp_gbp ?? 0);
      bits.push(fromWas ? `${pct(discount)}% below the "was" price the seller shows` : `${pct(discount)}% below the first price we saw`);
    }
    parts.push({ key: 'value', label: 'Value', score, weight: weights.value, why: bits.join('; ') });
  }

  // Budget fit: 1 at 30%+ under the ceiling, 0.4 at the ceiling, 0 at the stretch limit.
  {
    let score = 0.7;
    let why = 'no group budget set yet';
    if (ceiling) {
      const under = (ceiling - price) / ceiling;
      score = under >= 0 ? clamp01(0.4 + under * 2) : clamp01(0.4 + under * 1.6);
      why = under >= 0 ? `£${Math.round(ceiling - price)} under the group budget` : `£${Math.round(price - ceiling)} over the group budget (stretch)`;
    }
    parts.push({ key: 'budget', label: 'Budget fit', score, weight: weights.budget, why });
  }

  // Group fit.
  const suitsCount = members.filter((m) => suits(deal, m)).length;
  {
    const score = members.length ? suitsCount / members.length : 0;
    parts.push({ key: 'group', label: 'Group fit', score, weight: weights.group, why: `suits ${suitsCount} of ${members.length} on country, accommodation and airport` });
  }

  // Resort preference: Borda on resort rankings (top 5) blended with country ranking.
  {
    let resortPts = 0;
    let countryPts = 0;
    let fans = 0;
    for (const m of members) {
      const ri = deal.resort_id ? m.resorts.indexOf(deal.resort_id) : -1;
      if (ri >= 0) { resortPts += (5 - Math.min(ri, 4)) / 5; fans++; }
      const ci = deal.country ? m.countries.indexOf(deal.country) : -1;
      if (ci >= 0) countryPts += (m.countries.length - ci) / m.countries.length;
    }
    const n = members.length || 1;
    const score = clamp01(0.6 * (countryPts / n) + 0.4 * Math.min(1, (resortPts / n) * 2.5));
    const why = fans ? `${fans} ${fans === 1 ? 'person has' : 'people have'} this resort on their shortlist` : 'nobody has shortlisted this resort, country ranking only';
    parts.push({ key: 'resort', label: 'Resort preference', score, weight: weights.resort, why });
  }

  // Snow sense: top altitude (1800m -> 0, 3300m -> 1), glacier bonus; matters more late season.
  {
    let score = 0.5;
    let why = 'resort not matched, altitude unknown';
    if (resort?.top_altitude_m) {
      const alt = clamp01((resort.top_altitude_m - 1800) / 1500);
      const late = deal.departure_date >= `${deal.departure_date.slice(0, 4)}-03-10`;
      score = clamp01(alt + (resort.glacier ? 0.15 : 0) + (late ? 0 : 0.15));
      why = `top lift ${resort.top_altitude_m}m${resort.glacier ? ' with glacier' : ''}${late ? ' (late season, altitude matters)' : ''}`;
    }
    parts.push({ key: 'snow', label: 'Snow sense', score, weight: weights.snow, why });
  }

  // Practicality: transfer time (60 min -> 1, 240 min -> 0).
  {
    let score = 0.5;
    let why = 'transfer time unknown';
    const mins = resort ? Object.values(resort.transfer_mins) : [];
    if (mins.length) {
      const best = Math.min(...mins);
      score = clamp01(1 - (best - 60) / 180);
      why = `about ${best < 90 ? `${best} minutes` : `${(best / 60).toFixed(1).replace('.0', '')} hours`} transfer`;
    }
    parts.push({ key: 'practicality', label: 'Practicality', score, weight: weights.practicality, why });
  }

  const wsum = parts.reduce((a, p) => a + p.weight, 0) || 1;
  const total = Math.round((parts.reduce((a, p) => a + p.score * p.weight, 0) / wsum) * 100);
  return { total, parts, suitsCount, memberCount: members.length };
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
