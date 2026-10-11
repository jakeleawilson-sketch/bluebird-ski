// Week selection (HANDOFF section 5).

export type Status = 'in' | 'interested';

export type WeekVoter = {
  id: string;
  name: string;
  status: Status;
  /** Week start dates in rank order (index 0 = top pick). Unranked = unavailable. */
  rankedWeeks: string[];
};

export type WeekStanding = {
  start: string;
  /** Weighted count of members available ("I'm in" = 1, "Interested" = 0.5). */
  available: number;
  /** Sum of weighted preference points, used as tie-break. */
  preference: number;
  /** Raw headcounts for display. */
  inCount: number;
  interestedCount: number;
  names: string[];
};

export const statusWeight = (s: Status) => (s === 'in' ? 1 : 0.5);

/** Points for the week at 1-based rank r when a member ranked k weeks: (k - r + 1) / k. */
export const preferencePoints = (rank: number, k: number) => (k - rank + 1) / k;

export function weekLeaderboard(weeks: string[], voters: WeekVoter[]): WeekStanding[] {
  const table = new Map<string, WeekStanding>(
    weeks.map((start) => [start, { start, available: 0, preference: 0, inCount: 0, interestedCount: 0, names: [] }]),
  );
  for (const v of voters) {
    const w = statusWeight(v.status);
    const ranked = v.rankedWeeks.filter((d) => table.has(d));
    const k = ranked.length;
    ranked.forEach((start, i) => {
      const row = table.get(start)!;
      row.available += w;
      row.preference += w * preferencePoints(i + 1, k);
      if (v.status === 'in') row.inCount++;
      else row.interestedCount++;
      row.names.push(v.name);
    });
  }
  return [...table.values()].sort(compareStandings);
}

export function compareStandings(a: WeekStanding, b: WeekStanding): number {
  return b.available - a.available || b.preference - a.preference || a.start.localeCompare(b.start);
}

/** The week to auto-lock, or null if nobody can make any week. */
export function topWeek(board: WeekStanding[]): string | null {
  return board.length && board[0].available > 0 ? board[0].start : null;
}
