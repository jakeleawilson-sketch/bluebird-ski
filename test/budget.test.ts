import { describe, expect, it } from 'vitest';
import { bandFor, budgetFit, groupCeiling, stretchCeiling, UNLIMITED } from '../worker/lib/budget';

describe('budget', () => {
  it('maps a ceiling to its band', () => {
    expect(bandFor(700).key).toBe('green');
    expect(bandFor(950).key).toBe('blue');
    expect(bandFor(1250).key).toBe('red');
    expect(bandFor(UNLIMITED).key).toBe('champagne');
  });

  it('stretch is the next band up', () => {
    expect(stretchCeiling(950)).toBe(1250);
    expect(stretchCeiling(2750)).toBe(UNLIMITED);
  });

  it('group ceiling is the lowest among "in" members only', () => {
    expect(groupCeiling([
      { status: 'in', budget_ceiling_gbp: 1250 },
      { status: 'in', budget_ceiling_gbp: 950 },
      { status: 'interested', budget_ceiling_gbp: 700 },
      { status: 'in', budget_ceiling_gbp: null },
    ])).toBe(950);
    expect(groupCeiling([], null)).toBeNull();
    expect(groupCeiling([{ status: 'in', budget_ceiling_gbp: 950 }], 1600)).toBe(1600);
  });

  it('classifies price fit', () => {
    expect(budgetFit(900, 950)).toBe('within');
    expect(budgetFit(1100, 950)).toBe('stretch');
    expect(budgetFit(1300, 950)).toBe('over');
    expect(budgetFit(5000, null)).toBe('within');
  });
});
