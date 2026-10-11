// Deterministic resort-name matching. Gemini is only used when this fails.
import { normalise } from './text';

export type ResortRef = { id: string; name: string; aliases: string[]; country_code: string };

export function buildResortMatcher(resorts: ResortRef[]) {
  const exact = new Map<string, ResortRef>();
  const keys: [string, ResortRef][] = [];
  for (const r of resorts) {
    for (const n of [r.name, ...r.aliases]) {
      const k = normalise(n);
      if (!exact.has(k)) exact.set(k, r);
      keys.push([k, r]);
    }
  }
  // Longest keys first so "les arcs" beats "arc" style partials.
  keys.sort((a, b) => b[0].length - a[0].length);

  return function match(raw: string, countryCode?: string | null): ResortRef | null {
    const n = normalise(raw);
    if (!n) return null;
    const hit = exact.get(n);
    if (hit && (!countryCode || hit.country_code === countryCode)) return hit;
    // Token-boundary containment: "Chalet Foo, Courchevel 1850, France" contains "courchevel 1850".
    const padded = ` ${n} `;
    for (const [k, r] of keys) {
      if (k.length < 4) continue;
      if (countryCode && r.country_code !== countryCode) continue;
      if (padded.includes(` ${k} `)) return r;
    }
    return null;
  };
}
