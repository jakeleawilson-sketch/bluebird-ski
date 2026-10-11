// trip_settings: small JSON key/value store with typed defaults.
import type { Env } from './env';
import { DEFAULT_WEIGHTS, type ScoreWeights } from './lib/deals';

export type Settings = {
  locked_week: string | null;
  vote_deadline: string | null; // ISO datetime
  group_budget_override: number | null;
  invite_token: string | null;
  registration_open: boolean;
  allow_sunday: boolean;
  score_weights: ScoreWeights;
  alert_thresholds: { score: number; price_drop_pct: number; whatsapp_daily_cap: number; deal_of_the_day: boolean };
  booked_deal_id: string | null;
  /** Gemini spend cap per calendar month, in GBP. */
  ai_monthly_cap_gbp: number;
};

export const DEFAULTS: Settings = {
  locked_week: null,
  vote_deadline: null,
  group_budget_override: null,
  invite_token: null,
  registration_open: true,
  allow_sunday: true,
  score_weights: DEFAULT_WEIGHTS,
  alert_thresholds: { score: 80, price_drop_pct: 10, whatsapp_daily_cap: 3, deal_of_the_day: false },
  booked_deal_id: null,
  ai_monthly_cap_gbp: 10,
};

export async function getSettings(env: Env): Promise<Settings> {
  const { results } = await env.DB.prepare('SELECT key, value FROM trip_settings').all<{ key: string; value: string }>();
  const s: Record<string, unknown> = { ...DEFAULTS };
  for (const r of results) if (r.key in DEFAULTS) s[r.key] = JSON.parse(r.value);
  return s as Settings;
}

export async function setSetting<K extends keyof Settings>(env: Env, key: K, value: Settings[K]) {
  await env.DB.prepare('INSERT INTO trip_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
    .bind(key, JSON.stringify(value)).run();
}
