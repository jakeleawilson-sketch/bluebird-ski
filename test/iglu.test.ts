import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classify, iglu, igluDate, parseIglu, searchUrl } from '../worker/sources/iglu';

const fixture = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

describe('iglu adapter', () => {
  it('builds search URLs the way their search script does', () => {
    expect(igluDate('2027-01-16')).toBe('16012027');
    expect(searchUrl({ date: '2027-01-16', boards: ['ca'], airport: 'LGW', maxPages: 1, label: '' }, 2))
      .toBe('https://www.igluski.com/ski-holidays?date=16012027&flex=no&nts=7&ad=2&board=ca&fr=LGW&page=2');
  });

  it('parses offers from the data layer and joins card URLs', () => {
    const [job] = iglu.loggingJobs({ weeks: ['2027-01-16'], airports: ['LGW'] });
    const { offers, next } = parseIglu(fixture('iglu-catered-lgw-p1.html'), job);
    expect(offers).toHaveLength(10);
    const o = offers[0];
    expect(o).toMatchObject({
      accommodationName: 'Chalet La Bergerie',
      resortRaw: 'Tignes les Brévières',
      countryCode: 'FR',
      accommodationType: 'catered_chalet',
      departureAirport: 'LGW',
      departureDate: '2027-01-16',
      nights: 7,
      pricePp: 1369,
      wasPricePp: 1529,
      includesFlights: true,
      includesTransfers: true,
      supplier: 'ING',
    });
    expect(o.url).toMatch(/^https:\/\/www\.igluski\.com\/ski-resorts\/france\/.*holidayId=/);
    expect(o.productKey).toBe('iglu:44684:2027-01-16:7:LGW:catered');
    // page 1 fans out to the remaining pages (81 results => 9 pages, capped at maxPages 10)
    expect(next.map((j) => j.meta?.page)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('does not paginate again from later pages', () => {
    const [job] = iglu.loggingJobs({ weeks: ['2027-01-16'], airports: ['LGW'] });
    const { offers, next } = parseIglu(fixture('iglu-catered-lgw-p2.html'), { ...job, meta: { ...job.meta, page: 2 } });
    expect(offers.length).toBe(10);
    expect(next).toEqual([]);
  });

  it('classifies accommodation and drops self-catering', () => {
    expect(classify('Chalet', 'Catered')).toBe('catered_chalet');
    expect(classify('Hotel', 'Catered')).toBe('chalet_hotel');
    expect(classify('Hotel', 'Half board')).toBe('hotel');
    expect(classify('Apartment/Condo', 'Self catered')).toBeNull();
    expect(classify('Hotel', 'Self catered')).toBeNull();
  });

  it('throws loudly if the layout changes', () => {
    expect(() => parseIglu('<html></html>', { sourceId: 'iglu', kind: 'logging', url: '' })).toThrow(/data layer/);
  });
});
