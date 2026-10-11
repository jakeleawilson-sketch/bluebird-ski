// Starting scans and the hourly scheduler (HANDOFF sections 7 and 9c).
import type { Env } from './env';
import { getSettings } from './settings';
import { daysBetween, nowIso, todayUtc } from './lib/time';
import { ADAPTERS } from './sources/registry';
import type { JobKind } from './sources/types';

export async function startScan(env: Env, sourceId: string, kind: JobKind): Promise<{ runId: number; jobs: number } | { error: string }> {
  const adapter = ADAPTERS[sourceId];
  if (!adapter) return { error: 'no adapter for this source yet' };
  const settings = await getSettings(env);

  let jobs;
  if (kind === 'logging') {
    const { results } = await env.DB.prepare('SELECT start_date FROM weeks ORDER BY start_date').all<{ start_date: string }>();
    const airports = env.LOGGING_AIRPORTS.split(',').map((s) => s.trim()).filter(Boolean);
    if (!airports.length) return { error: 'price logging disabled (LOGGING_AIRPORTS is empty)' };
    jobs = adapter.loggingJobs({ weeks: results.map((r) => r.start_date), airports });
  } else {
    if (!settings.locked_week) return { error: 'week not locked yet' };
    const { results: ap } = await env.DB.prepare('SELECT DISTINCT iata FROM member_airports').all<{ iata: string }>();
    const { results: cc } = await env.DB.prepare('SELECT DISTINCT country_code FROM member_countries').all<{ country_code: string }>();
    jobs = adapter.dealJobs({ week: settings.locked_week, allowSunday: settings.allow_sunday, airports: ap.map((r) => r.iata), countries: cc.map((r) => r.country_code) });
  }
  if (!jobs.length) return { error: 'nothing to scan' };

  const run = await env.DB.prepare('INSERT INTO scan_runs (source_id, kind, started_at) VALUES (?, ?, ?) RETURNING id')
    .bind(sourceId, kind, nowIso()).first<{ id: number }>();
  const stub = env.CRAWLER.get(env.CRAWLER.idFromName(adapter.origin));
  await stub.enqueue(jobs, run!.id);
  return { runId: run!.id, jobs: jobs.length };
}

/** Hours (UTC) at which group deal scans run, by days to departure. */
export function dealScanDue(hourUtc: number, daysToDeparture: number, lastMinuteKeen: boolean): boolean {
  if (daysToDeparture < 0) return false;
  if (daysToDeparture <= 3) return lastMinuteKeen ? hourUtc % 3 === 0 : hourUtc % 6 === 0;
  if (daysToDeparture <= 14) return hourUtc % 6 === 0;
  return hourUtc === 5;
}

export const LOGGING_HOUR_UTC = 4;

export async function hourlyTick(env: Env, when = new Date()) {
  const hour = when.getUTCHours();
  const settings = await getSettings(env);

  if (hour === LOGGING_HOUR_UTC) {
    const { results } = await env.DB.prepare('SELECT id FROM sources WHERE logging_enabled = 1 AND blocked = 0').all<{ id: string }>();
    for (const s of results) await startScan(env, s.id, 'logging');
  }

  if (settings.locked_week) {
    const days = daysBetween(todayUtc(), settings.locked_week);
    const keen = !!(await env.DB.prepare("SELECT 1 FROM members WHERE last_minute IN ('yes','maybe') LIMIT 1").first());
    // The daily logging basket already covers the locked week once a day; extra scans only when due.
    if (dealScanDue(hour, days, keen) && hour !== LOGGING_HOUR_UTC) {
      const { results } = await env.DB.prepare('SELECT id FROM sources WHERE enabled = 1 AND blocked = 0').all<{ id: string }>();
      for (const s of results) await startScan(env, s.id, 'deals');
    }
  }
}
