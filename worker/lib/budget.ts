// Budget bands and group ceiling (HANDOFF section 6).

export type Band = { key: string; label: string; min: number; ceiling: number | null; piste: 'green' | 'blue' | 'red' | 'black' | 'offpiste' | 'heli' | 'champagne'; note: string };

export const BANDS: Band[] = [
  { key: 'green', label: 'Green run', min: 0, ceiling: 700, piste: 'green', note: 'Bulgaria, Andorra, early January, some late deals' },
  { key: 'blue', label: 'Blue run', min: 700, ceiling: 950, piste: 'blue', note: 'Good-value Alps chalets and hotels' },
  { key: 'red', label: 'Red run', min: 950, ceiling: 1250, piste: 'red', note: 'Mainstream catered chalet territory' },
  { key: 'black', label: 'Black run', min: 1250, ceiling: 1600, piste: 'black', note: 'Better chalets, bigger-name resorts, peak weeks' },
  { key: 'offpiste', label: 'Off-piste', min: 1600, ceiling: 2000, piste: 'offpiste', note: 'Premium Alps, budget North America' },
  { key: 'heli', label: 'Heli-ski', min: 2000, ceiling: 2750, piste: 'heli', note: 'Most North America packages, luxury Alps' },
  { key: 'champagne', label: 'Champagne powder', min: 2750, ceiling: null, piste: 'champagne', note: 'Luxury anywhere' },
];

/** Stored ceiling for the open-ended top band. */
export const UNLIMITED = 99999;

export const bandCeiling = (b: Band) => b.ceiling ?? UNLIMITED;

export function bandFor(ceiling: number): Band {
  return BANDS.find((b) => ceiling <= bandCeiling(b)) ?? BANDS[BANDS.length - 1];
}

/** The ceiling one band above `ceiling` (the "Stretch" limit). */
export function stretchCeiling(ceiling: number): number {
  const i = BANDS.findIndex((b) => ceiling <= bandCeiling(b));
  if (i < 0 || i === BANDS.length - 1) return UNLIMITED;
  return bandCeiling(BANDS[i + 1]);
}

export type BudgetMember = { status: 'in' | 'interested'; budget_ceiling_gbp: number | null };

/** Lowest ceiling among "I'm in" members, unless overridden. Null if nobody has set one. */
export function groupCeiling(members: BudgetMember[], override?: number | null): number | null {
  if (override) return override;
  const ceilings = members.filter((m) => m.status === 'in' && m.budget_ceiling_gbp).map((m) => m.budget_ceiling_gbp!);
  return ceilings.length ? Math.min(...ceilings) : null;
}

export type BudgetFit = 'within' | 'stretch' | 'over';

export function budgetFit(price: number, ceiling: number | null): BudgetFit {
  if (ceiling == null) return 'within';
  if (price <= ceiling) return 'within';
  if (price <= stretchCeiling(ceiling)) return 'stretch';
  return 'over';
}
