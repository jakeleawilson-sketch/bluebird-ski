import { Hono, type Context, type Next } from 'hono';
import { z } from 'zod';
import type { Env } from './env';
import { currentMember, isAdminEmail, logout, rateLimited, sendMagicLink, verifyMagicLink, type Member } from './auth';
import { BANDS, groupCeiling } from './lib/budget';
import { ACCOMMODATION_TYPES } from './lib/deals';
import { nowIso } from './lib/time';
import { hourlyTick, startScan } from './scans';
import { getSettings, setSetting, DEFAULTS } from './settings';
import { autoLock, board, ensureInviteToken, leaderboard, loadMembers, lockWeek, visibleWeeks } from './trip';
import { insights } from './insights';
import { listModels, USD_TO_GBP } from './ai/gemini';

export { Crawler } from './crawler';
export { ChatRoom } from './chat';

type Vars = { member: Member };
type C = Context<{ Bindings: Env; Variables: Vars }>;

const app = new Hono<{ Bindings: Env; Variables: Vars }>().basePath('/api');

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Something went wrong. Try again in a moment.' }, 500);
});

const firstName = (n: string) => n.trim().split(/\s+/)[0];
const ip = (c: C) => c.req.header('CF-Connecting-IP') ?? null;

// ------------------------------------------------------------------ middleware

async function requireMember(c: C, next: Next) {
  const m = await currentMember(c as never);
  if (!m) return c.json({ error: 'Please sign in.' }, 401);
  c.set('member', m);
  await next();
}

async function requireAdmin(c: C, next: Next) {
  // Ops token (CLI / scripts) or an admin session.
  const auth = c.req.header('Authorization');
  if (auth?.startsWith('Bearer ') && c.env.OPS_TOKEN && auth.slice(7) === c.env.OPS_TOKEN) {
    c.set('member', { id: 'ops', name: 'Ops', email: '', status: 'in', is_admin: 1, email_verified_at: null });
    return next();
  }
  const m = await currentMember(c as never);
  if (!m) return c.json({ error: 'Please sign in.' }, 401);
  if (!m.is_admin) return c.json({ error: 'Admins only.' }, 403);
  c.set('member', m);
  await next();
}

// ------------------------------------------------------------------ public

app.get('/health', (c) => c.json({ ok: true, at: nowIso() }));

app.get('/reference', async (c) => {
  const [countries, resorts, airports] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT code, name FROM countries ORDER BY sort_order'),
    c.env.DB.prepare('SELECT id, name, country_code, top_altitude_m, glacier FROM resorts ORDER BY name'),
    c.env.DB.prepare('SELECT iata, name, grp FROM airports ORDER BY sort_order'),
  ]);
  const weeks = (await visibleWeeks(c.env)).filter((w) => !w.hidden);
  return c.json({ countries: countries.results, resorts: resorts.results, airports: airports.results, weeks, bands: BANDS, accommodation: ACCOMMODATION_TYPES, admin_name: c.env.ADMIN_NAME || 'the organiser' });
});

app.get('/invite/:token', async (c) => {
  const s = await getSettings(c.env);
  const valid = !!s.invite_token && c.req.param('token') === s.invite_token;
  if (!valid) return c.json({ valid: false });
  const { results } = await c.env.DB.prepare('SELECT name, status FROM members WHERE email_verified_at IS NOT NULL ORDER BY created_at').all<{ name: string; status: string }>();
  return c.json({ valid: true, open: s.registration_open, joined: results.map((m) => ({ name: firstName(m.name), status: m.status })) });
});

const prefsSchema = z.object({
  name: z.string().trim().min(1).max(60),
  phone_e164: z.string().trim().regex(/^\+[1-9]\d{6,14}$/).nullable().optional(),
  whatsapp_opt_in: z.boolean().default(false),
  status: z.enum(['in', 'interested']),
  budget_ceiling_gbp: z.number().int().positive().max(99999),
  countries: z.array(z.string().length(2)).min(1).max(8),
  resorts: z.array(z.string().max(60)).max(5).default([]),
  accommodation: z.array(z.enum(['catered_chalet', 'chalet_hotel', 'hotel'])).min(1),
  weeks: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(13),
  airports: z.array(z.string().length(3)).min(1).max(22),
  last_minute: z.enum(['yes', 'maybe', 'no']),
  room_pref: z.enum(['twin', 'own', 'partner']).nullable().optional(),
  room_partner_name: z.string().trim().max(60).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
type Prefs = z.infer<typeof prefsSchema>;

async function savePrefs(env: Env, memberId: string, p: Prefs) {
  const db = env.DB;
  const stmts = [
    db.prepare(`UPDATE members SET name = ?, phone_e164 = ?, whatsapp_opt_in = ?, status = ?, budget_ceiling_gbp = ?, last_minute = ?,
      room_pref = ?, room_partner_name = ?, notes = ? WHERE id = ?`)
      .bind(p.name, p.phone_e164 ?? null, p.whatsapp_opt_in && p.phone_e164 ? 1 : 0, p.status, p.budget_ceiling_gbp, p.last_minute,
        p.room_pref ?? null, p.room_pref === 'partner' ? p.room_partner_name ?? null : null, p.notes ?? null, memberId),
    ...['member_countries', 'member_resorts', 'member_accommodation', 'member_airports', 'member_weeks'].map((t) => db.prepare(`DELETE FROM ${t} WHERE member_id = ?`).bind(memberId)),
    ...p.countries.map((cc, i) => db.prepare('INSERT INTO member_countries (member_id, country_code, rank) VALUES (?,?,?)').bind(memberId, cc, i + 1)),
    ...p.resorts.map((r, i) => db.prepare('INSERT INTO member_resorts (member_id, resort_id, rank) VALUES (?,?,?)').bind(memberId, r, i + 1)),
    ...p.accommodation.map((a) => db.prepare('INSERT INTO member_accommodation (member_id, type) VALUES (?,?)').bind(memberId, a)),
    ...p.airports.map((a) => db.prepare('INSERT INTO member_airports (member_id, iata) VALUES (?,?)').bind(memberId, a)),
    ...p.weeks.map((w, i) => db.prepare('INSERT INTO member_weeks (member_id, week_start_date, rank) VALUES (?,?,?)').bind(memberId, w, i + 1)),
  ];
  await db.batch(stmts);
}

app.post('/join', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = prefsSchema.extend({ token: z.string(), email: z.string().trim().toLowerCase().email().max(200) }).safeParse(body);
  if (!parsed.success) return c.json({ error: 'Some answers are missing or invalid.', issues: parsed.error.issues }, 400);
  const p = parsed.data;
  const s = await getSettings(c.env);
  if (!s.invite_token || p.token !== s.invite_token) return c.json({ error: `This invite link is no longer valid. Ask ${c.env.ADMIN_NAME || 'the organiser'} for the new one.` }, 403);
  if (!s.registration_open && !isAdminEmail(c.env, p.email)) return c.json({ error: 'Registration is closed.' }, 403);
  if (await rateLimited(c.env, p.email, ip(c))) return c.json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);

  const existing = await c.env.DB.prepare('SELECT id, email_verified_at FROM members WHERE email = ?').bind(p.email).first<{ id: string; email_verified_at: string | null }>();
  if (existing?.email_verified_at) {
    // Never let someone overwrite a verified member's answers by typing their email.
    await sendMagicLink(c.env, p.email, p.name, ip(c), false);
    return c.json({ ok: true, existing: true });
  }
  const id = existing?.id ?? crypto.randomUUID();
  if (!existing) await c.env.DB.prepare('INSERT INTO members (id, name, email, is_admin) VALUES (?, ?, ?, ?)').bind(id, p.name, p.email, +isAdminEmail(c.env, p.email)).run();
  await savePrefs(c.env, id, p);
  await sendMagicLink(c.env, p.email, p.name, ip(c), true);
  return c.json({ ok: true });
});

app.post('/auth/request', async (c) => {
  const { email } = (await c.req.json().catch(() => ({}))) as { email?: string };
  const e = (email ?? '').trim().toLowerCase();
  if (!z.string().email().safeParse(e).success) return c.json({ error: 'Enter a valid email address.' }, 400);
  if (await rateLimited(c.env, e, ip(c))) return c.json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
  const m = await c.env.DB.prepare('SELECT name FROM members WHERE email = ?').bind(e).first<{ name: string }>();
  if (m || isAdminEmail(c.env, e)) await sendMagicLink(c.env, e, m?.name ?? c.env.ADMIN_NAME ?? 'there', ip(c), false);
  // Same answer either way, so the form can't be used to discover who's a member.
  return c.json({ ok: true });
});

app.post('/auth/verify', async (c) => {
  const { token } = (await c.req.json().catch(() => ({}))) as { token?: string };
  if (!token) return c.json({ error: 'Missing token.' }, 400);
  const r = await verifyMagicLink(c as never, token);
  if ('error' in r) return c.json(r, 400);
  const m = await c.env.DB.prepare('SELECT name, created_at, last_seen_at FROM members WHERE id = ?').bind(r.memberId).first<{ name: string; last_seen_at: string | null }>();
  if (m && !m.last_seen_at) {
    const chat = c.env.CHAT.get(c.env.CHAT.idFromName('trip'));
    c.executionCtx.waitUntil(chat.post({ kind: 'system', body: `👋 ${firstName(m.name)} joined the trip.` }).then(() => chat.event({ event: 'trip' })));
  }
  return c.json({ ok: true });
});

app.post('/auth/logout', async (c) => {
  await logout(c as never);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ members

const member = new Hono<{ Bindings: Env; Variables: Vars }>();
member.use('*', requireMember);

member.get('/me', async (c) => {
  const me = c.get('member');
  const [full] = (await loadMembers(c.env, false)).filter((m) => m.id === me.id);
  const { email, phone_e164, ...rest } = full;
  return c.json({ ...rest, email, phone_e164, is_admin: me.is_admin });
});

member.put('/me', async (c) => {
  const parsed = prefsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Some answers are missing or invalid.', issues: parsed.error.issues }, 400);
  await savePrefs(c.env, c.get('member').id, parsed.data);
  const chat = c.env.CHAT.get(c.env.CHAT.idFromName('trip'));
  c.executionCtx.waitUntil(chat.event({ event: 'trip' }));
  return c.json({ ok: true });
});

member.get('/trip', async (c) => {
  const s = await getSettings(c.env);
  const members = await loadMembers(c.env);
  const board = await leaderboard(c.env, members);
  const weeks = await visibleWeeks(c.env);
  const chat = c.env.CHAT.get(c.env.CHAT.idFromName('trip'));
  const online = new Set(await chat.online());
  const booked = s.booked_deal_id ? await c.env.DB.prepare('SELECT id, accommodation_name, resort_name_raw, url FROM deals WHERE id = ?').bind(s.booked_deal_id).first() : null;
  return c.json({
    locked_week: s.locked_week,
    vote_deadline: s.vote_deadline,
    allow_sunday: s.allow_sunday,
    group_ceiling: groupCeiling(members, s.group_budget_override),
    budget_overridden: !!s.group_budget_override,
    booked,
    weeks: weeks.filter((w) => !w.hidden),
    leaderboard: board,
    members: members.filter((m) => m.budget_ceiling_gbp).map((m) => ({ id: m.id, name: firstName(m.name), status: m.status, online: online.has(m.id), is_admin: !!m.is_admin })),
  });
});

member.get('/deals', async (c) => {
  const b = await board(c.env, c.get('member').id);
  return c.json({ ...b, deals: b.deals.map(slimDeal) });
});

member.get('/deals/:id', async (c) => {
  const b = await board(c.env, c.get('member').id, { dealId: c.req.param('id') });
  const deal = b.deals[0];
  if (!deal) return c.json({ error: 'Deal not found.' }, 404);
  const { results: history } = await c.env.DB.prepare('SELECT price_pp_gbp, captured_at FROM deal_price_history WHERE deal_id = ? ORDER BY captured_at').bind(deal.id).all();
  const { results: voters } = await c.env.DB.prepare('SELECT m.name FROM upvotes u JOIN members m ON m.id = u.member_id WHERE u.deal_id = ? ORDER BY u.created_at').bind(deal.id).all<{ name: string }>();
  return c.json({ deal: slimDeal(deal), history, voters: voters.map((v) => firstName(v.name)) });
});

member.post('/deals/:id/upvote', async (c) => {
  const id = c.req.param('id');
  const me = c.get('member').id;
  const del = await c.env.DB.prepare('DELETE FROM upvotes WHERE deal_id = ? AND member_id = ? RETURNING deal_id').bind(id, me).first();
  if (!del) await c.env.DB.prepare('INSERT OR IGNORE INTO upvotes (deal_id, member_id) VALUES (?, ?)').bind(id, me).run();
  const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM upvotes WHERE deal_id = ?').bind(id).first<{ n: number }>();
  const chat = c.env.CHAT.get(c.env.CHAT.idFromName('trip'));
  c.executionCtx.waitUntil(chat.event({ event: 'upvote', deal_id: id, upvotes: n?.n ?? 0 }));
  return c.json({ upvoted: !del, upvotes: n?.n ?? 0 });
});

member.post('/deals/:id/share', async (c) => {
  const me = c.get('member');
  const d = await c.env.DB.prepare('SELECT id, accommodation_name, resort_name_raw, departure_airport, departure_date, price_pp_gbp FROM deals WHERE id = ?')
    .bind(c.req.param('id')).first<{ id: string; accommodation_name: string; resort_name_raw: string; departure_airport: string; departure_date: string; price_pp_gbp: number }>();
  if (!d) return c.json({ error: 'Deal not found.' }, 404);
  const { note } = (await c.req.json().catch(() => ({}))) as { note?: string };
  const chat = c.env.CHAT.get(c.env.CHAT.idFromName('trip'));
  await chat.post({ kind: 'deal_share', member_id: me.id, name: firstName(me.name), deal_id: d.id, body: (note ?? '').slice(0, 500), deal: d });
  return c.json({ ok: true });
});

member.get('/chat', async (c) => {
  const me = c.get('member');
  const stub = c.env.CHAT.get(c.env.CHAT.idFromName('trip'));
  const headers = new Headers(c.req.raw.headers);
  headers.set('X-Member-Id', me.id);
  headers.set('X-Member-Name', firstName(me.name));
  headers.set('X-Is-Admin', me.is_admin ? '1' : '0');
  return stub.fetch(new Request(c.req.url, { headers }));
});

member.get('/insights', async (c) => c.json(await insights(c.env)));

// ------------------------------------------------------------------ admin

const admin = new Hono<{ Bindings: Env; Variables: Vars }>();
admin.use('*', requireAdmin);

admin.get('/overview', async (c) => {
  const s = await getSettings(c.env);
  const token = await ensureInviteToken(c.env, s);
  const members = await loadMembers(c.env, false);
  const [sources, runs, ai, alerts, snaps] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT * FROM sources ORDER BY enabled DESC, logging_enabled DESC, name'),
    c.env.DB.prepare('SELECT * FROM scan_runs ORDER BY id DESC LIMIT 30'),
    c.env.DB.prepare("SELECT COALESCE(SUM(cost_estimate),0) AS usd, COUNT(*) AS calls FROM ai_usage_log WHERE created_at >= strftime('%Y-%m-01','now')"),
    c.env.DB.prepare("SELECT channel, status, COUNT(*) AS n FROM alerts_log WHERE sent_at >= date('now','-7 day') GROUP BY channel, status"),
    c.env.DB.prepare('SELECT COUNT(*) AS rows, COUNT(DISTINCT product_key) AS products, COUNT(DISTINCT captured_day) AS days, MAX(captured_at) AS last FROM price_snapshots'),
  ]);
  return c.json({
    settings: { ...s, invite_token: token },
    invite_url: `${c.env.APP_URL}/join/${token}`,
    members,
    leaderboard: await leaderboard(c.env),
    weeks: await visibleWeeks(c.env),
    sources: sources.results,
    runs: runs.results,
    health: { ai: { ...(ai.results[0] as { usd: number; calls: number }), gbp: Number((ai.results[0] as { usd: number }).usd) * USD_TO_GBP }, alerts: alerts.results, snapshots: snaps.results[0], email_configured: !!(c.env.EMAIL || c.env.RESEND_API_KEY) },
  });
});

admin.delete('/members/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM members WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

admin.post('/lock', async (c) => {
  const { week } = (await c.req.json()) as { week: string | null };
  await lockWeek(c.env, week, firstName(c.get('member').name));
  return c.json({ ok: true });
});

const settingsSchema = z.object({
  vote_deadline: z.string().datetime().nullable(),
  group_budget_override: z.number().int().positive().nullable(),
  registration_open: z.boolean(),
  allow_sunday: z.boolean(),
  score_weights: z.object({ value: z.number(), budget: z.number(), group: z.number(), resort: z.number(), snow: z.number(), practicality: z.number() }),
  alert_thresholds: z.object({ score: z.number(), price_drop_pct: z.number(), whatsapp_daily_cap: z.number().int(), deal_of_the_day: z.boolean() }),
  ai_monthly_cap_gbp: z.number().min(0).max(200),
}).partial();

admin.post('/settings', async (c) => {
  const parsed = settingsSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: 'Invalid settings.', issues: parsed.error.issues }, 400);
  for (const [k, v] of Object.entries(parsed.data)) await setSetting(c.env, k as keyof typeof DEFAULTS, v as never);
  c.executionCtx.waitUntil(c.env.CHAT.get(c.env.CHAT.idFromName('trip')).event({ event: 'trip' }));
  return c.json({ ok: true });
});

admin.post('/invite/rotate', async (c) => {
  await setSetting(c.env, 'invite_token', null);
  const t = await ensureInviteToken(c.env);
  return c.json({ invite_url: `${c.env.APP_URL}/join/${t}` });
});

admin.post('/weeks/:date', async (c) => {
  const { hidden } = (await c.req.json()) as { hidden: boolean };
  await c.env.DB.prepare('UPDATE weeks SET hidden = ? WHERE start_date = ?').bind(+hidden, c.req.param('date')).run();
  return c.json({ ok: true });
});

admin.post('/sources/:id', async (c) => {
  const b = (await c.req.json()) as { enabled?: boolean; logging_enabled?: boolean; unblock?: boolean };
  const id = c.req.param('id');
  if (b.enabled !== undefined) await c.env.DB.prepare('UPDATE sources SET enabled = ? WHERE id = ?').bind(+b.enabled, id).run();
  if (b.logging_enabled !== undefined) await c.env.DB.prepare('UPDATE sources SET logging_enabled = ? WHERE id = ?').bind(+b.logging_enabled, id).run();
  if (b.unblock) await c.env.DB.prepare('UPDATE sources SET blocked = 0, consecutive_failures = 0 WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

admin.post('/sources/:id/run', async (c) => {
  const { kind } = (await c.req.json().catch(() => ({}))) as { kind?: 'logging' | 'deals' };
  return c.json(await startScan(c.env, c.req.param('id'), kind ?? 'logging'));
});

admin.post('/deals/:id', async (c) => {
  const id = c.req.param('id');
  const b = (await c.req.json()) as Partial<Record<'hidden' | 'pinned' | 'booked', boolean>> & { fields?: Record<string, string | number | null> };
  for (const k of ['hidden', 'pinned', 'booked'] as const) if (b[k] !== undefined) await c.env.DB.prepare(`UPDATE deals SET ${k} = ? WHERE id = ?`).bind(+b[k]!, id).run();
  const editable = ['resort_id', 'country', 'accommodation_name', 'accommodation_type', 'board_basis', 'departure_airport', 'price_pp_gbp', 'was_price_pp_gbp'];
  for (const [k, v] of Object.entries(b.fields ?? {})) if (editable.includes(k)) await c.env.DB.prepare(`UPDATE deals SET ${k} = ? WHERE id = ?`).bind(v, id).run();
  const chat = c.env.CHAT.get(c.env.CHAT.idFromName('trip'));
  if (b.booked !== undefined) {
    await setSetting(c.env, 'booked_deal_id', b.booked ? id : null);
    if (b.booked) {
      const d = await c.env.DB.prepare('SELECT accommodation_name, resort_name_raw FROM deals WHERE id = ?').bind(id).first<{ accommodation_name: string; resort_name_raw: string }>();
      await chat.post({ kind: 'system', body: `🎉 BOOKED! ${d?.accommodation_name}, ${d?.resort_name_raw}. See you on the slopes.` });
    }
  }
  c.executionCtx.waitUntil(chat.event({ event: 'deals' }));
  return c.json({ ok: true });
});

const csv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [cols.join(','), ...rows.map((r) => cols.map((k) => cell(r[k])).join(','))].join('\n');
};

admin.get('/export/:what', async (c) => {
  const what = c.req.param('what');
  let rows: Record<string, unknown>[] = [];
  if (what === 'members.csv') {
    rows = (await loadMembers(c.env, false)).map((m) => ({
      name: m.name, email: m.email, status: m.status, verified: !!m.email_verified_at, budget: m.budget_ceiling_gbp, countries: m.countries.join(' '),
      resorts: m.resorts.join(' '), accommodation: m.accommodation.join(' '), airports: m.airports.join(' '), weeks: m.weeks.join(' '),
      last_minute: m.last_minute, room: m.room_pref, partner: m.room_partner_name, notes: m.notes, joined: m.created_at,
    }));
  } else if (what === 'deals.csv') {
    rows = (await c.env.DB.prepare('SELECT d.*, (SELECT COUNT(*) FROM upvotes u WHERE u.deal_id = d.id) AS upvotes FROM deals d ORDER BY departure_date, price_pp_gbp').all()).results;
  } else return c.json({ error: 'Unknown export.' }, 404);
  return new Response(csv(rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="bluebird-${what}"` } });
});

admin.get('/ai/models', async (c) => c.json({ models: await listModels(c.env) }));

admin.post('/alerts/test', async (c) => {
  const me = c.get('member');
  const { sendEmail } = await import('./notify');
  const status = await sendEmail(c.env, { to: me.email, subject: 'Bluebird test alert', text: 'If you can read this, email alerts work.', html: '<p>If you can read this, email alerts work.</p>' });
  return c.json({ status });
});

// Admin first: the member router's '*' middleware would otherwise also catch /admin/*.
app.route('/admin', admin);
app.route('/', member);

// Strip deal rows down to what the client renders.
function slimDeal(d: Awaited<ReturnType<typeof board>>['deals'][number]) {
  return {
    id: d.id, url: d.url, source_id: d.source_id, source_name: d.source_name, source_type: d.source_type,
    resort_id: d.resort_id, resort: d.resort_name ?? d.resort_name_raw, resort_raw: d.resort_name_raw, country: d.country,
    accommodation_name: d.accommodation_name, accommodation_type: d.accommodation_type, board_basis: d.board_basis,
    departure_airport: d.departure_airport, departure_date: d.departure_date, nights: d.nights,
    price_pp_gbp: d.price_pp_gbp, was_price_pp_gbp: d.was_price_pp_gbp, first_price_pp_gbp: d.first_price_pp_gbp,
    includes_lift_pass: !!d.includes_lift_pass, extras: JSON.parse(d.extras || '[]'), blurb: d.blurb,
    last_seen_at: d.last_seen_at, first_seen_at: d.first_seen_at, pinned: !!d.pinned, booked: !!d.booked, hidden: !!d.hidden,
    upvotes: d.upvotes, upvoted: !!d.upvoted, fit: d.fit, score: d.score,
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return app.fetch(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      await autoLock(env);
      await hourlyTick(env, new Date(controller.scheduledTime));
    })());
  },
} satisfies ExportedHandler<Env>;

