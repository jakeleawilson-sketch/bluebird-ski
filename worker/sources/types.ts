// Source adapter contract (HANDOFF section 7). Each adapter turns fetched pages
// into normalised offers. Fetching, politeness, robots.txt, snapshots and
// storage are handled centrally by the crawler, never by adapters.
import type { AccommodationType } from '../lib/deals';

export type JobKind = 'logging' | 'deals' | 'manual';

export type CrawlJob = {
  sourceId: string;
  kind: JobKind;
  url: string;
  /** Free-form context the adapter needs to parse or paginate (e.g. page number). */
  meta?: Record<string, string | number>;
};

export type ParsedOffer = {
  /** Stable key for this product over time, prefixed with the source id. */
  productKey: string;
  externalRef: string;
  url: string;
  resortRaw: string;
  countryCode: string | null;
  accommodationName: string;
  /** null = not a type Bluebird shows (e.g. self-catering); logged nowhere. */
  accommodationType: AccommodationType | null;
  boardBasis: string | null;
  departureAirport: string | null;
  departureDate: string; // YYYY-MM-DD
  nights: number;
  pricePp: number;
  wasPricePp: number | null;
  includesFlights: boolean;
  includesTransfers: boolean;
  includesLiftPass: boolean;
  extras: string[];
  availability: string | null;
  supplier: string | null;
  priceBasisNotes: string | null;
};

export type ParseResult = {
  offers: ParsedOffer[];
  /** Further pages to fetch for the same search. */
  next: CrawlJob[];
};

export type BasketContext = {
  /** Visible candidate weeks (Saturdays). */
  weeks: string[];
  /** UK departure airports to log from. */
  airports: string[];
};

export type DealSearchContext = {
  week: string;
  allowSunday: boolean;
  airports: string[];
  countries: string[];
};

export interface SourceAdapter {
  id: string;
  /** Origin used for robots.txt and per-domain throttling. */
  origin: string;
  /** Minimum gap between requests to this origin. */
  minDelayMs: number;
  /** Requests for the daily price-logging basket (section 9c). */
  loggingJobs(ctx: BasketContext): CrawlJob[];
  /** Requests for a focused deal scan on the locked week. */
  dealJobs(ctx: DealSearchContext): CrawlJob[];
  parse(body: string, job: CrawlJob): ParseResult;
}

// Honest, descriptive UA. Add a contact address here only if you are happy for
// every crawled site to see it.
export const USER_AGENT = 'BluebirdSkiPlanner/0.1 (private non-commercial trip planner for one group of friends; polite, low-rate)';

/** Shortest token we match in robots.txt User-agent lines. */
export const ROBOTS_TOKEN = 'bluebirdskiplanner';
