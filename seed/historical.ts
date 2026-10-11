// Verified past-season late deals from dated press / deal-news pages.
// Every row was checked against the linked page on 2026-10-09. `captured_on`
// is the page's publication date, so days_before_departure is how far out the
// price was advertised. Run: npx tsx seed/historical.ts > db/historical.sql
type H = {
  id: string; source_title: string; url: string; published: string; operator: string;
  resort: string; resort_id: string | null; country: string; accommodation: string; type: 'catered_chalet' | 'chalet_hotel' | 'hotel';
  board: string | null; departure: string; airport: string | null; nights: number; price: number; was: number | null; basis: string; notes?: string;
};

const TM15 = { source_title: 'TravelMole: Late ski deals (16 Dec 2015)', url: 'https://travelmole.com/news/late-ski-deals-4', published: '2015-12-16' };
const TM20 = { source_title: 'TravelMole: Last minute ski deals (17 Jan 2020)', url: 'https://travelmole.com/news/last-minute-ski-deals-2', published: '2020-01-17' };
const PS25 = { source_title: 'PlanetSKI: March and April ski deals (18 Feb 2025)', url: 'https://planetski.eu/2025/02/18/march-and-april-ski-deals-2/', published: '2025-02-18' };
const ITS26 = { source_title: 'InTheSnow: Last remaining ski chalet rooms, save up to £400pp (5 Mar 2026)', url: 'https://www.inthesnow.com/deals/ski-holiday-deals/last-remaining-ski-chalet-rooms-save-up-to-400pp/', published: '2026-03-05' };
const FLT = 'Flights, transfers and accommodation';

export const historical: H[] = [
  { ...TM15, id: 'tm15-skitotal-james', operator: 'Ski Total', resort: 'La Tania', resort_id: 'la-tania', country: 'FR', accommodation: 'Chalet James', type: 'catered_chalet', board: 'Catered', departure: '2016-01-03', airport: 'LHR', nights: 7, price: 419, was: 769, basis: `${FLT}, 2 adults sharing` },
  { ...TM15, id: 'tm15-vip-dubois', operator: 'VIP SKI', resort: 'Morzine', resort_id: 'morzine', country: 'FR', accommodation: 'Chalet du Bois', type: 'catered_chalet', board: 'Catered', departure: '2015-12-27', airport: 'LGW', nights: 7, price: 1500, was: 1969, basis: FLT, notes: 'New Year week' },
  { ...TM20, id: 'tm20-igoski-piccard', operator: 'iGoSki', resort: 'La Plagne', resort_id: 'la-plagne', country: 'FR', accommodation: 'Chalet Piccard', type: 'catered_chalet', board: 'Catered', departure: '2020-01-26', airport: null, nights: 7, price: 518, was: null, basis: 'Inclusions not stated in the article' },
  { ...TM20, id: 'tm20-igoski-graciosa', operator: 'iGoSki', resort: 'La Plagne', resort_id: 'la-plagne', country: 'FR', accommodation: 'Hotel Graciosa', type: 'hotel', board: null, departure: '2020-01-26', airport: null, nights: 7, price: 525, was: null, basis: 'Inclusions not stated in the article' },
  { ...TM20, id: 'tm20-skiworld-stoanerhof', operator: 'Skiworld', resort: 'Mayrhofen', resort_id: 'mayrhofen', country: 'AT', accommodation: 'Chalet Stoanerhof', type: 'catered_chalet', board: 'Chalet board', departure: '2020-04-04', airport: null, nights: 7, price: 693, was: null, basis: FLT, notes: 'Advertised as a half-price offer' },
  { ...PS25, id: 'ps25-inghams-kramerwirt', operator: 'Inghams', resort: 'Mayrhofen', resort_id: 'mayrhofen', country: 'AT', accommodation: 'Alpenhotel Kramerwirt', type: 'hotel', board: 'Half board', departure: '2025-03-22', airport: 'BHX', nights: 7, price: 1099, was: 1499, basis: `${FLT}, 2 adults sharing` },
  { ...PS25, id: 'ps25-inghams-arlberg', operator: 'Inghams', resort: 'St Anton', resort_id: 'st-anton', country: 'AT', accommodation: 'Hotel Arlberg', type: 'hotel', board: 'Half board', departure: '2025-03-15', airport: 'LGW', nights: 7, price: 1299, was: 1659, basis: `${FLT}, 2 adults sharing` },
  { ...PS25, id: 'ps25-inghams-deuxdomaines', operator: 'Inghams', resort: 'La Plagne', resort_id: 'la-plagne', country: 'FR', accommodation: 'Hotel des Deux Domaines', type: 'hotel', board: 'Half board', departure: '2025-03-22', airport: 'STN', nights: 7, price: 982, was: 1332, basis: `${FLT}, 3 adults sharing`, notes: 'Buy-one-get-one-half-price lift passes' },
  { ...PS25, id: 'ps25-inghams-savoy', operator: 'Inghams', resort: 'Sestriere', resort_id: 'sestriere', country: 'IT', accommodation: 'Hotel Savoy Edelweiss', type: 'hotel', board: 'Half board', departure: '2025-03-09', airport: 'LGW', nights: 7, price: 911, was: 1211, basis: `${FLT}, 2 adults sharing` },
  { ...PS25, id: 'ps25-inghams-soldanella', operator: 'Inghams', resort: 'Selva', resort_id: 'selva', country: 'IT', accommodation: 'Chalet Soldanella', type: 'catered_chalet', board: 'Half board', departure: '2025-03-22', airport: 'LGW', nights: 7, price: 1149, was: 1349, basis: `${FLT}, 2 adults sharing` },
  { ...ITS26, id: 'its26-skibeat-perdrix', operator: 'Ski Beat', resort: 'La Rosière', resort_id: 'la-rosiere', country: 'FR', accommodation: 'Chalet Perdrix', type: 'catered_chalet', board: 'Catered', departure: '2026-03-14', airport: 'LGW', nights: 7, price: 799, was: 1199, basis: `${FLT}, 2 sharing` },
  { ...ITS26, id: 'its26-skibeat-vallonblanc', operator: 'Ski Beat', resort: 'La Tania', resort_id: 'la-tania', country: 'FR', accommodation: 'Chalet Vallon Blanc', type: 'catered_chalet', board: 'Catered', departure: '2026-03-21', airport: 'LGW', nights: 7, price: 799, was: 1199, basis: `${FLT}, 2 sharing (also from Manchester)` },
  { ...ITS26, id: 'its26-skibeat-cristal', operator: 'Ski Beat', resort: "Val d'Isère", resort_id: 'val-disere', country: 'FR', accommodation: 'Chalet Cristal', type: 'catered_chalet', board: 'Catered', departure: '2026-03-29', airport: 'MAN', nights: 7, price: 1059, was: 1269, basis: `${FLT}, 2 sharing`, notes: 'Easter; £1,259 from Gatwick' },
];

// The PlanetSKI "was" prices are derived: published price + stated saving.
const q = (v: unknown) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const out = ['-- GENERATED by seed/historical.ts'];
for (const h of historical)
  out.push(`INSERT OR REPLACE INTO historical_deals (id, source_name, archive_url, captured_on, resort_raw, resort_id, country, accommodation_raw, departure_date, days_before_departure, price_pp_gbp, was_price_pp_gbp, notes, source_kind, source_title, operator, accommodation_type, board_basis, departure_airport, nights, price_basis) VALUES (${[
    h.id, h.source_title.split(':')[0], h.url, h.published, h.resort, h.resort_id, h.country, h.accommodation, h.departure, days(h.published, h.departure),
    h.price, h.was, h.notes ?? null, 'press', h.source_title, h.operator, h.type, h.board, h.airport, h.nights, h.basis,
  ].map(q).join(', ')});`);
console.log(out.join('\n'));
