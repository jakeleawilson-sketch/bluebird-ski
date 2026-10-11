// Reference data for Bluebird. Run `npm run seed:sql` to regenerate db/seed.sql.
//
// Resort altitudes and ski-area sizes are from resort/ski-area published figures
// as best known; transfer times are typical shared-coach times. Treat transfer
// costs as ESTIMATES (derived from time, see transferCost below) until checked.

export const countries = [
  ['FR', 'France'],
  ['AT', 'Austria'],
  ['IT', 'Italy'],
  ['CH', 'Switzerland'],
  ['AD', 'Andorra'],
  ['BG', 'Bulgaria'],
  ['CA', 'Canada'],
  ['US', 'USA'],
] as const;

export const airports: { iata: string; name: string; grp: 'london' | 'regional' }[] = [
  { iata: 'LHR', name: 'Heathrow', grp: 'london' },
  { iata: 'LGW', name: 'Gatwick', grp: 'london' },
  { iata: 'STN', name: 'Stansted', grp: 'london' },
  { iata: 'LTN', name: 'Luton', grp: 'london' },
  { iata: 'LCY', name: 'London City', grp: 'london' },
  { iata: 'SEN', name: 'Southend', grp: 'london' },
  { iata: 'MAN', name: 'Manchester', grp: 'regional' },
  { iata: 'BHX', name: 'Birmingham', grp: 'regional' },
  { iata: 'BRS', name: 'Bristol', grp: 'regional' },
  { iata: 'EDI', name: 'Edinburgh', grp: 'regional' },
  { iata: 'GLA', name: 'Glasgow', grp: 'regional' },
  { iata: 'NCL', name: 'Newcastle', grp: 'regional' },
  { iata: 'LBA', name: 'Leeds Bradford', grp: 'regional' },
  { iata: 'EMA', name: 'East Midlands', grp: 'regional' },
  { iata: 'LPL', name: 'Liverpool', grp: 'regional' },
  { iata: 'CWL', name: 'Cardiff', grp: 'regional' },
  { iata: 'BFS', name: 'Belfast International', grp: 'regional' },
  { iata: 'ABZ', name: 'Aberdeen', grp: 'regional' },
  { iata: 'SOU', name: 'Southampton', grp: 'regional' },
  { iata: 'EXT', name: 'Exeter', grp: 'regional' },
  { iata: 'NWI', name: 'Norwich', grp: 'regional' },
  { iata: 'BOH', name: 'Bournemouth', grp: 'regional' },
];

// Candidate weeks (section 5). Hidden weeks can be un-hidden by the admin.
export const weeks: { start: string; hidden?: boolean; badge?: string }[] = [
  { start: '2027-01-02' },
  { start: '2027-01-09' },
  { start: '2027-01-16' },
  { start: '2027-01-23' },
  { start: '2027-01-30' },
  { start: '2027-02-06', badge: 'Some regional half terms' },
  { start: '2027-02-13', hidden: true, badge: 'London half term' },
  { start: '2027-02-20', badge: 'Some regional half terms' },
  { start: '2027-02-27' },
  { start: '2027-03-06' },
  { start: '2027-03-13' },
  { start: '2027-03-20', badge: 'Start of Easter, may be pricier' },
  { start: '2027-03-27', hidden: true, badge: 'Easter holidays' },
];

type Resort = {
  name: string;
  cc: string;
  top: number;
  base: number;
  glacier?: boolean;
  km?: number;
  // destination airport -> typical shared transfer minutes
  tx: Record<string, number>;
  aliases?: string[];
};

const r = (name: string, cc: string, top: number, base: number, km: number | undefined, tx: Record<string, number>, extra: Partial<Resort> = {}): Resort =>
  ({ name, cc, top, base, km, tx, ...extra });

const THREE_V = { GVA: 165, LYS: 150, CMF: 110 };
const PARADISKI = { GVA: 165, LYS: 150, CMF: 120 };
const PDS = { GVA: 75 };

export const resorts: Resort[] = [
  // France
  r('Val Thorens', 'FR', 3230, 2300, 600, { GVA: 180, LYS: 160, CMF: 125 }),
  r('Les Menuires', 'FR', 2850, 1850, 600, { GVA: 170, LYS: 150, CMF: 115 }),
  r('Méribel', 'FR', 2952, 1450, 600, THREE_V, { aliases: ['Meribel Mottaret', 'Méribel-Mottaret', 'Mottaret', 'Meribel Village'] }),
  r('Courchevel', 'FR', 2738, 1300, 600, THREE_V, { aliases: ['Courchevel 1850', 'Courchevel 1650', 'Courchevel Moriond', 'Courchevel 1550', 'Courchevel Village', 'Le Praz', 'Courchevel 1300'] }),
  r('La Tania', 'FR', 2738, 1350, 600, THREE_V),
  r('Tignes', 'FR', 3456, 1550, 300, { GVA: 180, LYS: 165, CMF: 140 }, { glacier: true, aliases: ['Tignes le Lac', 'Tignes Val Claret', 'Tignes Le Lavachet', 'Tignes 1800', 'Tignes Les Brévières', 'Tignes 2100'] }),
  r("Val d'Isère", 'FR', 3456, 1785, 300, { GVA: 195, LYS: 180, CMF: 150 }, { glacier: true, aliases: ['Val Disere', 'Le Fornet', 'La Daille'] }),
  r('Les Arcs', 'FR', 3226, 1200, 425, PARADISKI, { aliases: ['Arc 1600', 'Arc 1800', 'Arc 1950', 'Arc 2000', 'Arc 1800 Charvet', 'Arc 1800 Villards', 'Arc 1800 Charmettoger'] }),
  r('Peisey-Vallandry', 'FR', 3226, 1600, 425, PARADISKI, { aliases: ['Peisey', 'Vallandry', 'Plan Peisey'] }),
  r('La Plagne', 'FR', 3250, 1250, 425, PARADISKI, { glacier: true, aliases: ['Plagne Centre', 'Belle Plagne', 'Plagne 1800', 'Plagne Villages', 'Plagne Soleil', 'Aime La Plagne', 'Plagne Bellecôte', 'Plagne Montalbert', 'Champagny en Vanoise', 'Montchavin', 'Les Coches'] }),
  r('La Rosière', 'FR', 2800, 1176, 160, { GVA: 180, LYS: 180, CMF: 150 }),
  r('Sainte-Foy', 'FR', 2620, 1550, 50, { GVA: 180, LYS: 180, CMF: 150 }, { aliases: ['Sainte Foy Tarentaise', 'Ste Foy'] }),
  r("Alpe d'Huez", 'FR', 3330, 1100, 250, { GNB: 90, LYS: 120, GVA: 180 }, { glacier: true, aliases: ['Alpe dHuez', 'Huez', 'Oz en Oisans', 'Vaujany', 'Auris'] }),
  r('Les Deux Alpes', 'FR', 3600, 1300, 200, { GNB: 90, LYS: 120, GVA: 180 }, { glacier: true, aliases: ['Deux Alpes', '2 Alpes'] }),
  r('Serre Chevalier', 'FR', 2800, 1200, 250, { GNB: 120, TRN: 120, LYS: 180 }, { aliases: ['Chantemerle', 'Villeneuve', 'Le Monêtier-les-Bains', 'Briançon', 'Serre Che'] }),
  r('Chamonix', 'FR', 3842, 1035, 170, { GVA: 75 }, { glacier: true, aliases: ['Chamonix Mont-Blanc', 'Argentière', 'Les Houches'] }),
  r('Morzine', 'FR', 2466, 1000, 600, PDS),
  r('Avoriaz', 'FR', 2466, 1800, 600, { GVA: 90 }),
  r('Les Gets', 'FR', 2002, 1172, 600, PDS),
  r('Flaine', 'FR', 2500, 1600, 265, { GVA: 70 }),

  // Austria
  r('St Anton', 'AT', 2811, 1304, 305, { INN: 75, ZRH: 150, FDH: 120 }, { aliases: ['St. Anton am Arlberg', 'Sankt Anton', 'St Anton am Arlberg', 'St Christoph', 'Stuben'] }),
  r('Lech', 'AT', 2811, 1450, 305, { INN: 105, ZRH: 150, FDH: 120 }, { aliases: ['Lech am Arlberg', 'Zürs', 'Oberlech'] }),
  r('Ischgl', 'AT', 2872, 1377, 239, { INN: 90, ZRH: 150, FDH: 150 }),
  r('Sölden', 'AT', 3340, 1350, 144, { INN: 75, MUC: 210 }, { glacier: true }),
  r('Obergurgl', 'AT', 3082, 1793, 110, { INN: 90, MUC: 225 }, { aliases: ['Obergurgl-Hochgurgl', 'Hochgurgl'] }),
  r('Mayrhofen', 'AT', 2500, 630, 136, { INN: 60, SZG: 150, MUC: 150 }),
  r('Kitzbühel', 'AT', 2000, 800, 234, { SZG: 75, INN: 75, MUC: 120 }),
  r('Saalbach', 'AT', 2096, 1003, 270, { SZG: 75, INN: 120, MUC: 150 }, { aliases: ['Saalbach-Hinterglemm', 'Hinterglemm', 'Leogang'] }),
  r('Zell am See', 'AT', 3029, 757, 138, { SZG: 75, MUC: 150 }, { glacier: true, aliases: ['Kaprun', 'Zell am See-Kaprun'] }),
  r('Bad Gastein', 'AT', 2686, 1100, 200, { SZG: 90, MUC: 180 }, { aliases: ['Gastein', 'Bad Hofgastein'] }),
  r('Obertauern', 'AT', 2313, 1630, 100, { SZG: 75, MUC: 165 }),
  r('Alpbach', 'AT', 2025, 670, 145, { INN: 50, SZG: 120, MUC: 120 }, { aliases: ['Ski Juwel Alpbachtal Wildschönau', 'Inneralpbach'] }),

  // Italy
  r('Cervinia', 'IT', 3480, 2050, 360, { TRN: 120, MXP: 150, GVA: 150 }, { glacier: true, aliases: ['Breuil-Cervinia', 'Breuil Cervinia', 'Valtournenche'] }),
  r('La Thuile', 'IT', 2641, 1441, 152, { TRN: 135, GVA: 120, MXP: 165 }),
  r('Courmayeur', 'IT', 2755, 1224, 100, { TRN: 120, GVA: 90, MXP: 165 }),
  r('Sestriere', 'IT', 2823, 2035, 400, { TRN: 105 }),
  r("Sauze d'Oulx", 'IT', 2823, 1509, 400, { TRN: 90 }, { aliases: ['Sauze dOulx', 'Sauze'] }),
  r('Selva', 'IT', 2518, 1563, 500, { VRN: 180, VCE: 180, INN: 120, BZO: 60 }, { aliases: ['Selva Val Gardena', 'Selva di Val Gardena', 'Val Gardena', 'Wolkenstein', 'Ortisei', 'Santa Cristina'] }),
  r('Alta Badia', 'IT', 2778, 1324, 130, { VRN: 180, VCE: 180, INN: 150 }, { aliases: ['Corvara', 'La Villa', 'San Cassiano', 'Colfosco'] }),
  r('Madonna di Campiglio', 'IT', 2504, 1550, 150, { VRN: 150, BGY: 180 }, { aliases: ['Campiglio'] }),
  r('Passo Tonale', 'IT', 3016, 1121, 100, { BGY: 150, VRN: 180 }, { glacier: true, aliases: ['Tonale', 'Ponte di Legno'] }),
  r('Livigno', 'IT', 2798, 1816, 115, { BGY: 210, MXP: 240, ZRH: 240 }),
  r('Bormio', 'IT', 3012, 1225, 50, { BGY: 180, MXP: 210 }),
  r('Cortina', 'IT', 2939, 1224, 120, { VCE: 120, TSF: 120 }, { aliases: ["Cortina d'Ampezzo", 'Cortina dAmpezzo'] }),

  // Switzerland
  r('Zermatt', 'CH', 3883, 1620, 360, { GVA: 225, ZRH: 210 }, { glacier: true }),
  r('Verbier', 'CH', 3330, 1500, 410, { GVA: 120 }, { aliases: ['4 Vallées', 'Quatre Vallées', 'Nendaz'] }),
  r('Saas-Fee', 'CH', 3600, 1800, 150, { GVA: 180, ZRH: 210 }, { glacier: true, aliases: ['Saas Fee'] }),
  r('St Moritz', 'CH', 3303, 1822, 350, { ZRH: 210 }, { aliases: ['St. Moritz', 'Saint-Moritz', 'Sankt Moritz'] }),
  r('Davos', 'CH', 2844, 1560, 300, { ZRH: 150 }),
  r('Klosters', 'CH', 2844, 1191, 300, { ZRH: 135 }),
  r('Laax', 'CH', 3018, 1100, 224, { ZRH: 105 }, { glacier: true, aliases: ['Flims', 'Flims Laax', 'Laax Murschetg'] }),
  r('Wengen', 'CH', 2971, 1274, 213, { ZRH: 165, GVA: 180 }),
  r('Grindelwald', 'CH', 2971, 943, 213, { ZRH: 150, GVA: 180 }),
  r('Mürren', 'CH', 2971, 1650, 213, { ZRH: 180, GVA: 195 }, { aliases: ['Murren'] }),
  r('Engelberg', 'CH', 3028, 1050, 82, { ZRH: 75 }, { glacier: true, aliases: ['Titlis'] }),
  r('Crans-Montana', 'CH', 3000, 1500, 140, { GVA: 150 }, { glacier: true, aliases: ['Crans Montana'] }),
  r('Andermatt', 'CH', 2963, 1444, 120, { ZRH: 105 }, { aliases: ['Andermatt-Sedrun'] }),

  // Andorra
  r('Soldeu', 'AD', 2640, 1710, 210, { BCN: 180, TLS: 180 }, { aliases: ['Grandvalira', 'Grandvalira Soldeu'] }),
  r('El Tarter', 'AD', 2640, 1710, 210, { BCN: 180, TLS: 180 }),
  r('Pas de la Casa', 'AD', 2640, 2050, 210, { TLS: 150, BCN: 210 }),
  r('Arinsal', 'AD', 2560, 1550, 63, { BCN: 180, TLS: 180 }, { aliases: ['Pal Arinsal', 'Vallnord'] }),

  // Bulgaria
  r('Bansko', 'BG', 2600, 990, 75, { SOF: 150 }),
  r('Borovets', 'BG', 2560, 1350, 58, { SOF: 75 }),
  r('Pamporovo', 'BG', 1926, 1450, 37, { PDV: 75, SOF: 210 }),

  // Canada (ski area in km of piste is not commonly published; left blank)
  r('Whistler', 'CA', 2284, 675, undefined, { YVR: 150 }, { aliases: ['Whistler Blackcomb', 'Blackcomb'] }),
  r('Banff', 'CA', 2730, 1660, undefined, { YYC: 90 }, { aliases: ['Lake Louise', 'Sunshine Village', 'Banff Sunshine', 'Mt Norquay'] }),
  r('Revelstoke', 'CA', 2225, 512, undefined, { YLW: 150, YYC: 330 }),
  r('Big White', 'CA', 2319, 1508, undefined, { YLW: 60 }),
  r('Sun Peaks', 'CA', 2080, 1255, undefined, { YKA: 60, YLW: 180 }),
  r('Fernie', 'CA', 2134, 1068, undefined, { YYC: 210 }),
  r('Mont Tremblant', 'CA', 875, 265, undefined, { YUL: 105 }, { aliases: ['Tremblant'] }),

  // USA
  r('Vail', 'US', 3527, 2475, undefined, { DEN: 120, EGE: 40 }),
  r('Beaver Creek', 'US', 3488, 2255, undefined, { DEN: 120, EGE: 35 }),
  r('Breckenridge', 'US', 3914, 2926, undefined, { DEN: 105 }, { aliases: ['Breck'] }),
  r('Aspen', 'US', 3813, 2422, undefined, { ASE: 10, DEN: 240 }, { aliases: ['Aspen Snowmass', 'Snowmass'] }),
  r('Telluride', 'US', 3831, 2659, undefined, { MTJ: 75, DEN: 360 }),
  r('Steamboat', 'US', 3221, 2103, undefined, { HDN: 30, DEN: 180 }, { aliases: ['Steamboat Springs'] }),
  r('Jackson Hole', 'US', 3185, 1924, undefined, { JAC: 25, SLC: 300 }, { aliases: ['Teton Village', 'Jackson'] }),
  r('Park City', 'US', 3049, 2080, undefined, { SLC: 40 }),
  r('Alta/Snowbird', 'US', 3353, 2365, undefined, { SLC: 45 }, { aliases: ['Alta', 'Snowbird'] }),
  r('Big Sky', 'US', 3403, 2072, undefined, { BZN: 60 }),
  r('Mammoth', 'US', 3369, 2424, undefined, { MMH: 15, RNO: 180, LAX: 300 }, { aliases: ['Mammoth Mountain', 'Mammoth Lakes'] }),
];

/** ESTIMATE of a typical shared return transfer per person, from one-way minutes. */
export function transferCost(mins: number): number {
  return Math.round((30 + mins * 0.45) / 5) * 5;
}

export type SourceSeed = {
  id: string;
  name: string;
  type: 'operator' | 'agent' | 'independent';
  base_url: string;
  note: string;
};

// Research notes are filled in as each source is investigated (see docs/sources.md).
export const sources: SourceSeed[] = [
  { id: 'crystal', name: 'Crystal Ski', type: 'operator', base_url: 'https://www.crystalski.co.uk', note: 'Blocked: returns HTTP 403 to non-browser clients (bot protection). Not used. Stock may appear via Iglu.' },
  { id: 'inghams', name: 'Inghams', type: 'operator', base_url: 'https://www.inghams.co.uk', note: 'To research.' },
  { id: 'esprit', name: 'Esprit Ski', type: 'operator', base_url: 'https://www.espritski.com', note: 'Family-focused sister brand of Inghams. Low priority.' },
  { id: 'skiworld', name: 'Skiworld', type: 'operator', base_url: 'https://www.skiworld.co.uk', note: 'To research.' },
  { id: 'skitotal', name: 'Ski Total', type: 'operator', base_url: 'https://www.skitotal.com', note: 'To research.' },
  { id: 'markwarner', name: 'Mark Warner', type: 'operator', base_url: 'https://www.markwarner.co.uk', note: 'To research.' },
  { id: 'clubmed', name: 'Club Med', type: 'operator', base_url: 'https://www.clubmed.co.uk', note: 'All-inclusive incl. lift pass; price not like-for-like. To research.' },
  { id: 'skibeat', name: 'Ski Beat', type: 'operator', base_url: 'https://www.skibeat.co.uk', note: 'To research.' },
  { id: 'leski', name: 'Le Ski', type: 'operator', base_url: 'https://www.leski.com', note: 'To research.' },
  { id: 'supertravel', name: 'Supertravel', type: 'operator', base_url: 'https://www.supertravel.co.uk', note: 'To research.' },
  { id: 'jet2', name: 'Jet2holidays', type: 'operator', base_url: 'https://www.jet2holidays.com', note: 'Check whether ski packages are sold.' },
  { id: 'skiindependence', name: 'Ski Independence', type: 'operator', base_url: 'https://www.skiindependence.co.uk', note: 'North America specialist. To research.' },
  { id: 'skisafari', name: 'Ski Safari', type: 'operator', base_url: 'https://www.skisafari.com', note: 'North America specialist. To research.' },
  { id: 'iglu', name: 'Iglu Ski', type: 'agent', base_url: 'https://www.igluski.com', note: 'Live adapter. Server-rendered listing with JSON data layer; covers many operators (supplier codes).' },
  { id: 'skiline', name: 'Ski Line', type: 'agent', base_url: 'https://www.skiline.co.uk', note: 'To research.' },
  { id: 'skisolutions', name: 'Ski Solutions', type: 'agent', base_url: 'https://www.skisolutions.com', note: 'To research.' },
  { id: 'snowwise', name: 'Snow-Wise', type: 'agent', base_url: 'https://www.snow-wise.co.uk', note: 'Verify trading.' },
];
