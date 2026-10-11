// Iglu Ski (igluski.com), UK ski agent with stock from many operators.
//
// Their /ski-holidays listing is server rendered and filterable by URL params.
// Each page embeds a JSON data layer (<input id="SearchResultDataLayer">) with
// one record per holiday (property, resort, prices pp for 2 sharing, flights),
// plus a "favourite-holiday" widget per card carrying the holiday URL. No AI
// extraction needed. 10 results per page; `perpage` is ignored.
//
// robots.txt (checked 2026-10-08): /ski-holidays allowed for User-agent *.
import type { AccommodationType } from '../lib/deals';
import type { BasketContext, CrawlJob, DealSearchContext, ParsedOffer, ParseResult, SourceAdapter } from './types';

const ORIGIN = 'https://www.igluski.com';
const PAGE_SIZE = 10;

export const COUNTRY_CODES: Record<string, string> = {
  France: 'FR', Austria: 'AT', Italy: 'IT', Switzerland: 'CH', Andorra: 'AD', Bulgaria: 'BG',
  Canada: 'CA', USA: 'US', 'United States': 'US', 'United States of America': 'US',
};

/** dd MM yyyy, no separators, as Iglu's search script builds it. */
export function igluDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}${m}${y}`;
}

type Search = { date: string; boards: string[]; airport?: string; country?: string; maxPages: number; label: string };

export function searchUrl(s: Search, page = 1): string {
  const p = new URLSearchParams({ date: igluDate(s.date), flex: 'no', nts: '7', ad: '2' });
  for (const b of s.boards) p.append('board', b);
  if (s.airport) p.set('fr', s.airport);
  if (s.country) p.set('country', s.country);
  if (page > 1) p.set('page', String(page));
  return `${ORIGIN}/ski-holidays?${p}`;
}

function job(kind: CrawlJob['kind'], s: Search, page = 1): CrawlJob {
  return { sourceId: 'iglu', kind, url: searchUrl(s, page), meta: { page, maxPages: s.maxPages, label: s.label, search: JSON.stringify(s) } };
}

// Board codes from Iglu's facet form: ca catered, hb half board, al/ap all inclusive, bb bed & breakfast.
const CATERED = ['ca'];
const HOTEL_BOARDS = ['hb', 'al', 'ap'];

export function classify(propertyType: string, board: string): AccommodationType | null {
  const t = propertyType.toLowerCase();
  const b = board.toLowerCase();
  if (b.includes('self') || b.includes('room only') || b.includes('accommodation only')) return null;
  if (t.includes('chalet hotel') || (t.includes('hotel') && b.includes('catered'))) return 'chalet_hotel';
  if (t.includes('chalet') && (b.includes('catered') || b.includes('half board') || b.includes('full board'))) return 'catered_chalet';
  if (t.includes('hotel') || t.includes('guesthouse') || t.includes('pension')) return 'hotel';
  return null; // apartments etc.
}

type DataLayerRow = {
  property_id: number;
  property_name: string;
  resort_name: string;
  resort_country: string;
  current_price_per_person: number;
  original_price_per_person: number | null;
  flights_included: boolean;
  flights: { outbound?: { dept_airport_code?: string } } | null;
  board_basis: string;
  departure_date: string;
  num_nights: number;
  property_type: string;
  offer_group: string | null;
  package_type: string | null;
  availability_flag: string | null;
};

const decode = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? decode(m[1]) : null;
}

export function parseIglu(body: string, job: CrawlJob): ParseResult {
  const dl = body.match(/<input[^>]*id="SearchResultDataLayer"[^>]*value="([^"]*)"/);
  if (!dl) throw new Error('Iglu: data layer not found (page layout changed?)');
  const rows: DataLayerRow[] = JSON.parse(decode(dl[1])).results_list ?? [];
  const total = Number(body.match(/id="TotalItems"[^>]*value="(\d+)"/)?.[1] ?? 0);

  // Card widgets carry the holiday URL, keyed by property id.
  const cards = new Map<string, { url: string; supplier: string | null; holidayId: string | null }>();
  for (const tag of body.match(/<div class="value"[^>]*data-holidayid[^>]*>/g) ?? []) {
    const id = attr(tag, 'data-id');
    const url = attr(tag, 'data-url');
    if (id && url) cards.set(id, { url: ORIGIN + url, supplier: attr(tag, 'data-supplier'), holidayId: attr(tag, 'data-holidayid') });
  }

  const offers: ParsedOffer[] = [];
  for (const r of rows) {
    const type = classify(r.property_type ?? '', r.board_basis ?? '');
    const date = (r.departure_date ?? '').slice(0, 10);
    const airport = r.flights?.outbound?.dept_airport_code ?? null;
    if (!date || !r.current_price_per_person) continue;
    const card = cards.get(String(r.property_id));
    const pkg = (r.package_type ?? '').toLowerCase();
    const extras = r.offer_group && r.offer_group !== 'None' ? [r.offer_group] : [];
    const board = r.board_basis || null;
    offers.push({
      productKey: `iglu:${r.property_id}:${date}:${r.num_nights}:${airport ?? 'none'}:${(board ?? '').toLowerCase()}`,
      externalRef: `${r.property_id}:${date}:${r.num_nights}:${airport ?? 'none'}`,
      url: card?.url ?? `${ORIGIN}/ski-holidays?propertyid=${r.property_id}`,
      resortRaw: r.resort_name,
      countryCode: COUNTRY_CODES[r.resort_country] ?? null,
      accommodationName: r.property_name.trim(),
      accommodationType: type,
      boardBasis: board,
      departureAirport: airport,
      departureDate: date,
      nights: r.num_nights,
      pricePp: r.current_price_per_person,
      wasPricePp: r.original_price_per_person && r.original_price_per_person > r.current_price_per_person ? r.original_price_per_person : null,
      includesFlights: !!r.flights_included || pkg.includes('flight'),
      includesTransfers: pkg.includes('transfer'),
      includesLiftPass: pkg.includes('lift pass'),
      extras,
      availability: r.availability_flag || null,
      supplier: card?.supplier ?? null,
      priceBasisNotes: 'Per person, 2 adults sharing, Iglu Ski package price',
    });
  }

  const next: CrawlJob[] = [];
  const page = Number(job.meta?.page ?? 1);
  const maxPages = Number(job.meta?.maxPages ?? 1);
  if (page === 1 && job.meta?.search) {
    const s: Search = JSON.parse(String(job.meta.search));
    const pages = Math.min(maxPages, Math.ceil(total / PAGE_SIZE));
    for (let p = 2; p <= pages; p++) next.push({ ...job, url: searchUrl(s, p), meta: { ...job.meta, page: p } });
  }
  return { offers, next };
}

export const iglu: SourceAdapter = {
  id: 'iglu',
  origin: ORIGIN,
  minDelayMs: 6000,

  // Daily basket: for each candidate week, catered (chalets + chalet hotels)
  // from each logging airport, plus the cheapest half-board/all-inclusive
  // hotels from the first airport. Roughly 15-25 requests per week.
  loggingJobs(ctx: BasketContext) {
    const jobs: CrawlJob[] = [];
    for (const date of ctx.weeks) {
      for (const airport of ctx.airports) jobs.push(job('logging', { date, boards: CATERED, airport, maxPages: 10, label: `catered ${airport}` }));
      jobs.push(job('logging', { date, boards: HOTEL_BOARDS, airport: ctx.airports[0], maxPages: 4, label: `hotels ${ctx.airports[0]}` }));
    }
    return jobs;
  },

  dealJobs(ctx: DealSearchContext) {
    const dates = [ctx.week];
    const jobs: CrawlJob[] = [];
    for (const date of dates)
      for (const airport of ctx.airports) {
        jobs.push(job('deals', { date, boards: CATERED, airport, maxPages: 15, label: `catered ${airport}` }));
        jobs.push(job('deals', { date, boards: HOTEL_BOARDS, airport, maxPages: 8, label: `hotels ${airport}` }));
      }
    return jobs;
  },

  parse: parseIglu,
};
