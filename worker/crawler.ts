// One Crawler Durable Object per source origin. It owns a FIFO of crawl jobs
// and processes exactly one request per alarm, so requests to a site are
// always serial and at least `minDelayMs` apart (politeness wins over
// schedule). It checks robots.txt, keeps raw snapshots in R2, and marks a
// source blocked after repeated failures (HANDOFF section 7, scraping rules).
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { ingestOffers } from './ingest';
import { nowIso, sha256Hex } from './lib/time';
import { ADAPTERS } from './sources/registry';
import { isAllowed, parseRobots } from './sources/robots';
import { ROBOTS_TOKEN, USER_AGENT, type CrawlJob } from './sources/types';

const MAX_ATTEMPTS = 3;
const BLOCK_AFTER_FAILURES = 5;
const ROBOTS_TTL_MS = 24 * 3600_000;

type QueueRow = { seq: number; job: string; run_id: number; attempts: number };

export class Crawler extends DurableObject<Env> {
  sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS queue (seq INTEGER PRIMARY KEY AUTOINCREMENT, job TEXT NOT NULL, run_id INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, not_before INTEGER NOT NULL DEFAULT 0)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)`);
  }

  /** Add jobs for a scan run. Returns the queue length. */
  async enqueue(jobs: CrawlJob[], runId: number): Promise<number> {
    for (const j of jobs) this.sql.exec('INSERT INTO queue (job, run_id) VALUES (?, ?)', JSON.stringify(j), runId);
    if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(Date.now() + 1000);
    return this.queueLength();
  }

  queueLength(): number {
    return (this.sql.exec('SELECT COUNT(*) AS n FROM queue').one().n as number) ?? 0;
  }

  /** Drop everything queued (used when a source is disabled or blocked). */
  async clear(): Promise<void> {
    const runs = this.sql.exec<{ run_id: number }>('SELECT DISTINCT run_id FROM queue').toArray();
    this.sql.exec('DELETE FROM queue');
    for (const r of runs) await this.finishRun(r.run_id, 'cancelled');
    await this.ctx.storage.deleteAlarm();
  }

  async alarm(): Promise<void> {
    const row = this.sql.exec<QueueRow>('SELECT seq, job, run_id, attempts FROM queue WHERE not_before <= ? ORDER BY seq LIMIT 1', Date.now()).toArray()[0];
    if (!row) {
      const waiting = this.sql.exec<{ t: number }>('SELECT MIN(not_before) AS t FROM queue').one().t;
      if (waiting) await this.ctx.storage.setAlarm(waiting);
      return;
    }
    const job: CrawlJob = JSON.parse(row.job);
    const adapter = ADAPTERS[job.sourceId];
    let delay = adapter?.minDelayMs ?? 10_000;

    try {
      const source = await this.env.DB.prepare('SELECT type, enabled, logging_enabled, blocked FROM sources WHERE id = ?').bind(job.sourceId)
        .first<{ type: string; enabled: number; logging_enabled: number; blocked: number }>();
      const active = source && !source.blocked && (job.kind === 'logging' ? source.logging_enabled : source.enabled || job.kind === 'manual');
      if (!adapter || !active) {
        this.sql.exec('DELETE FROM queue WHERE run_id = ?', row.run_id);
        await this.finishRun(row.run_id, 'skipped', 'source disabled, blocked or has no adapter');
        delay = 0;
      } else if (!(await this.robotsAllow(job.url))) {
        this.sql.exec('DELETE FROM queue WHERE seq = ?', row.seq);
        await this.bumpRun(row.run_id, 0, 0, `robots.txt disallows ${new URL(job.url).pathname}`);
      } else {
        const res = await fetch(job.url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: AbortSignal.timeout(30_000) });
        if (res.status === 403 || res.status === 429 || res.status === 503) throw new HttpError(res.status);
        if (!res.ok) throw new HttpError(res.status);
        const body = await res.text();
        const hash = await sha256Hex(body);
        const key = `snapshots/${job.sourceId}/${nowIso().slice(0, 10)}/${hash.slice(0, 16)}.html`;
        await this.env.SNAPSHOTS.put(key, body, { httpMetadata: { contentType: 'text/html' }, customMetadata: { url: job.url, kind: job.kind } });

        const parsed = adapter.parse(body, job);
        const ingest = await ingestOffers(this.env, job.sourceId, source.type, parsed.offers, key);
        for (const n of parsed.next) this.sql.exec('INSERT INTO queue (job, run_id) VALUES (?, ?)', JSON.stringify(n), row.run_id);
        this.sql.exec('DELETE FROM queue WHERE seq = ?', row.seq);
        await this.bumpRun(row.run_id, 1, ingest.offers);
        await this.env.DB.prepare('UPDATE sources SET consecutive_failures = 0, last_status = ?, last_run_at = ? WHERE id = ?').bind('ok', nowIso(), job.sourceId).run();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const attempts = row.attempts + 1;
      const backoff = err instanceof HttpError && (err.status === 429 || err.status === 503) ? 10 * 60_000 : 60_000 * attempts;
      if (attempts >= MAX_ATTEMPTS) this.sql.exec('DELETE FROM queue WHERE seq = ?', row.seq);
      else this.sql.exec('UPDATE queue SET attempts = ?, not_before = ? WHERE seq = ?', attempts, Date.now() + backoff, row.seq);
      await this.bumpRun(row.run_id, 0, 0, msg);
      const s = await this.env.DB.prepare(
        `UPDATE sources SET consecutive_failures = consecutive_failures + 1, last_status = 'error', last_error = ?, last_run_at = ?,
           blocked = CASE WHEN consecutive_failures + 1 >= ? THEN 1 ELSE blocked END WHERE id = ? RETURNING blocked`,
      ).bind(msg.slice(0, 500), nowIso(), BLOCK_AFTER_FAILURES, job.sourceId).first<{ blocked: number }>();
      if (s?.blocked) {
        await this.clear();
        return;
      }
    }

    // Finish runs that have nothing left queued.
    const open = this.sql.exec<{ run_id: number }>('SELECT DISTINCT run_id FROM queue').toArray().map((r) => r.run_id);
    if (!open.includes(row.run_id)) await this.finishRun(row.run_id);

    if (this.queueLength() > 0) await this.ctx.storage.setAlarm(Date.now() + Math.max(delay, 1000));
  }

  private async robotsAllow(url: string): Promise<boolean> {
    const u = new URL(url);
    const cached = this.sql.exec<{ v: string }>('SELECT v FROM kv WHERE k = ?', 'robots:' + u.origin).toArray()[0];
    let entry: { at: number; txt: string } | null = cached ? JSON.parse(cached.v) : null;
    if (!entry || Date.now() - entry.at > ROBOTS_TTL_MS) {
      const res = await fetch(u.origin + '/robots.txt', { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15_000) });
      // 4xx = no robots file = allowed; 5xx = treat as disallow until next check.
      const txt = res.ok ? await res.text() : res.status >= 500 ? 'User-agent: *\nDisallow: /' : '';
      entry = { at: Date.now(), txt };
      this.sql.exec('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)', 'robots:' + u.origin, JSON.stringify(entry));
    }
    return isAllowed(parseRobots(entry.txt, ROBOTS_TOKEN), u.pathname + u.search);
  }

  private async bumpRun(runId: number, pages: number, items: number, error?: string) {
    await this.env.DB.prepare('UPDATE scan_runs SET pages = pages + ?, items = items + ?, error = COALESCE(?, error) WHERE id = ?')
      .bind(pages, items, error?.slice(0, 500) ?? null, runId).run();
  }

  private async finishRun(runId: number, status?: string, error?: string) {
    const run = await this.env.DB.prepare(
      `UPDATE scan_runs SET finished_at = ?, status = COALESCE(?, CASE WHEN pages > 0 THEN 'ok' ELSE 'error' END), error = COALESCE(?, error)
       WHERE id = ? AND finished_at IS NULL RETURNING source_id, status`,
    ).bind(nowIso(), status ?? null, error ?? null, runId).first<{ source_id: string; status: string }>();
    if (!run) return;
    await this.env.DB.prepare('UPDATE sources SET runs_total = runs_total + 1, runs_ok = runs_ok + ? WHERE id = ?')
      .bind(run.status === 'ok' ? 1 : 0, run.source_id).run();
  }
}

class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}
