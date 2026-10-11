import { describe, expect, it } from 'vitest';
import { allowedDepartureDates, filterDeal, scoreDeal, median, type DealRow, type MemberPrefs } from '../worker/lib/deals';
import { buildResortMatcher } from '../worker/lib/resorts';

const members: MemberPrefs[] = [
  { id: 'a', status: 'in', countries: ['FR', 'AT'], resorts: ['val-thorens'], accommodation: ['catered_chalet'], airports: ['LGW', 'LHR'] },
  { id: 'b', status: 'in', countries: ['AT'], resorts: [], accommodation: ['hotel', 'catered_chalet'], airports: ['MAN'] },
  { id: 'c', status: 'interested', countries: ['FR'], resorts: ['val-thorens', 'tignes'], accommodation: ['chalet_hotel'], airports: ['LGW'] },
];

const deal = (o: Partial<DealRow> = {}): DealRow => ({
  id: 'd1', source_id: 's', resort_id: 'val-thorens', country: 'FR', accommodation_type: 'catered_chalet',
  departure_airport: 'LGW', departure_date: '2027-01-16', price_pp_gbp: 900, was_price_pp_gbp: null,
  first_price_pp_gbp: 900, rooms_available: null, ...o,
});

const ctx = { lockedWeek: '2027-01-16', allowSunday: true, ceiling: 950, members };

describe('allowedDepartureDates', () => {
  it('adds the Sunday when allowed', () => {
    expect(allowedDepartureDates('2027-01-16', true)).toEqual(['2027-01-16', '2027-01-17']);
    expect(allowedDepartureDates('2027-01-16', false)).toEqual(['2027-01-16']);
  });
});

describe('filterDeal', () => {
  it('shows a matching deal', () => expect(filterDeal(deal(), ctx)).toEqual({ show: true, fit: 'within' }));
  it('shows Sunday departures only when allowed', () => {
    expect(filterDeal(deal({ departure_date: '2027-01-17' }), ctx).show).toBe(true);
    expect(filterDeal(deal({ departure_date: '2027-01-17' }), { ...ctx, allowSunday: false }).reason).toBe('date');
  });
  it('rejects other weeks', () => expect(filterDeal(deal({ departure_date: '2027-01-23' }), ctx).reason).toBe('date'));
  it('rejects countries nobody picked', () => expect(filterDeal(deal({ country: 'US' }), ctx).reason).toBe('country'));
  it('rejects airports nobody picked', () => expect(filterDeal(deal({ departure_airport: 'BHX' }), ctx).reason).toBe('airport'));
  it('flags stretch and rejects over-budget', () => {
    expect(filterDeal(deal({ price_pp_gbp: 1200 }), ctx)).toEqual({ show: true, fit: 'stretch' });
    expect(filterDeal(deal({ price_pp_gbp: 1300 }), ctx).reason).toBe('price');
  });
  it('rejects deals without room for everyone who is in', () => {
    expect(filterDeal(deal({ rooms_available: 1 }), ctx).reason).toBe('capacity');
    expect(filterDeal(deal({ rooms_available: 2 }), ctx).show).toBe(true);
  });
});

describe('scoreDeal', () => {
  const resort = { id: 'val-thorens', top_altitude_m: 3230, glacier: 0, transfer_mins: { GVA: 180, CMF: 125 } };
  it('produces a 0-100 score with a plain-words breakdown', () => {
    const s = scoreDeal({ deal: deal(), ceiling: 950, members, resort, peerMedian: 1000 });
    expect(s.total).toBeGreaterThan(0);
    expect(s.total).toBeLessThanOrEqual(100);
    expect(s.suitsCount).toBe(1);
    expect(s.parts.map((p) => p.key)).toEqual(['value', 'budget', 'group', 'resort', 'snow', 'practicality']);
    expect(s.parts.find((p) => p.key === 'value')!.why).toContain('10% below');
  });
  it('scores a cheaper, discounted deal higher', () => {
    const base = scoreDeal({ deal: deal(), ceiling: 950, members, resort, peerMedian: 1000 }).total;
    const cheap = scoreDeal({ deal: deal({ price_pp_gbp: 700, first_price_pp_gbp: 1000 }), ceiling: 950, members, resort, peerMedian: 1000 }).total;
    expect(cheap).toBeGreaterThan(base);
  });
});

describe('median', () => {
  it('handles odd, even and empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('resort matcher', () => {
  const match = buildResortMatcher([
    { id: 'courchevel', name: 'Courchevel', aliases: ['Courchevel 1850'], country_code: 'FR' },
    { id: 'val-disere', name: "Val d'Isère", aliases: [], country_code: 'FR' },
    { id: 'les-arcs', name: 'Les Arcs', aliases: ['Arc 1800'], country_code: 'FR' },
  ]);
  it('matches names, aliases and accents', () => {
    expect(match('Val d’Isere')?.id).toBe('val-disere');
    expect(match('COURCHEVEL 1850')?.id).toBe('courchevel');
    expect(match('Chalet Edelweiss, Arc 1800, France')?.id).toBe('les-arcs');
    expect(match('Zermatt')).toBeNull();
    expect(match('Courchevel', 'AT')).toBeNull();
  });
});
