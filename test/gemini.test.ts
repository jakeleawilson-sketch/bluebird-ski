import { describe, expect, it } from 'vitest';
import { costUsd, priceFor } from '../worker/ai/gemini';

describe('gemini pricing', () => {
  it('matches the most specific model prefix', () => {
    expect(priceFor('gemini-2.5-flash-lite-preview')).toEqual({ input: 0.1, output: 0.4 });
    expect(priceFor('gemini-2.5-flash')).toEqual({ input: 0.3, output: 2.5 });
  });
  it('prices unknown models at the safe (expensive) fallback', () => {
    expect(priceFor('gemini-9-ultra').input).toBeGreaterThanOrEqual(4);
  });
  it('computes cost per million tokens', () => {
    expect(costUsd('gemini-2.5-flash', 1_000_000, 100_000)).toBeCloseTo(0.55);
  });
});
