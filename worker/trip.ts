// Trip state: members' preferences, the week leaderboard, locking, board.
import type { Env } from './env';
import { getSettings, setSetting, type Settings } from './settings';
import { weekLeaderboard, topWeek, type WeekVoter } from './lib/weeks';
import { groupCeiling } from './lib/budget';
import { filterDeal, median, scoreDeal, type DealRow, type MemberPrefs, type ResortFacts } from './lib/deals';
import { alertEveryone } from './notify';
import { randomToken } from './lib/time';

export type FullMember = MemberPrefs & {
  name: string;
  email: string;
  phone_e164: string | null;
  whatsapp_opt_in: number;
  budget_ceiling_gbp: number | null;
  last_minute: string | null;
  room_pref: string | null;
  room_partner_name: string | null;
  notes: string | null;
  is_admin: number;
  email_verified_at: string | null;
  created_at: string;
  last_seen_at: string | null;
  weeks: string[];
};

export async function loadMembers(env: Env, verifiedOnly = true): Promise<FullMember[]> {
  const where = verifiedOnly ? 'WHERE email_verified_at IS NOT NULL' : '';
  const [m, c, r, a, ap, w] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM members ${where} ORDER BY created_at`),
    env.DB.prepare('SELECT member_id, country_code FROM member_countries ORDER BY rank'),
    env.DB.prepare('SELECT member_id, resort_id FROM member_resorts ORDER BY rank'),
    env.DB.prepare('SELECT member_id, type FROM member_accommodation'),
    env.DB.prepare('SELECT member_id, iata FROM member_airports'),
    env.DB.prepare('SELECT member_id, week_start_date FROM member_weeks ORDER BY rank'),
  ]);
  const group = <T,>(rows: Record<string, unknown>[], key: string) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const id = row.member_id as string;
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(row[key] as T);
    }
    return map;
  };
  const cs = group<string>(c.results as never, 'country_code');
  const rs = group<string>(r.results as never, 'resort_id');
  const as = group<string>(a.results as never, 'type');
  const aps = group<string>(ap.results as never, 'iata');
  const ws = group<string>(w.results as never, 'week_start_date');
  return (m.results as Record<string, unknown>[]).map((row) => ({
    ...(row as Omit<FullMember, 'countries' | 'resorts' | 'accommodation' | 'airports' | 'weeks'>),
    countries: cs.get(row.id as string) ?? [],
    resorts: rs.get(row.id as string) ?? [],
    accommodation: (as.get(row.id as string) ?? []) as FullMember['accommodation'],
    airports: aps.get(row.id as string) ?? [],
    weeks: ws.get(row.id as string) ?? [],
  }));
}

export async function visibleWeeks(env: Env) {
  const { results } = await env.DB.prepare('SELECT start_date, label, hidden, badge FROM weeks ORDER BY start_date').all<{ start_date: string; label: string; hidden: number; badge: string | null }>();
  return results;
}

export async function leaderboard(env: Env, members?: FullMember[]) {
  members ??= await loadMembers(env);
  const weeks = (await visibleWeeks(env)).filter((w) => !w.hidden).map((w) => w.start_date);
  const voters: WeekVoter[] = members.map((m) => ({ id: m.id, name: m.name.split(' ')[0], status: m.status, rankedWeeks: m.weeks }));
  return weekLeaderboard(weeks, voters);
}

export async function ensureInviteToken(env: Env, s?: Settings): Promise<string> {
  s ??= await getSettings(env);
  if (s.invite_token) return s.invite_token;
  const t = randomToken(12);
  await setSetting(env, 'invite_token', t);
  return t;
}

export async function lockWeek(env: Env, week: string | null, by: string) {
  await setSetting(env, 'locked_week', week);
  const chat = env.CHAT.get(env.CHAT.idFromName('trip'));
  if (!week) {
    await chat.post({ kind: 'system', body: `${by} unlocked the week. Voting is open again.` });
    await chat.event({ event: 'trip' });
    return;
  }
  const label = new Date(week + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  await chat.post({ kind: 'system', body: `🔒 Week locked: ${label}. Bluebird is now hunting deals for that week.` });
  await chat.event({ event: 'trip' });
  await alertEveryone(env, {
    kind: 'week_locked',
    title: `We're going ${label} ⛷️`,
    body: `The group has picked the week: departing ${label}. Bluebird will now hunt for the best-value deals for that week and post them to the board.`,
    link: env.APP_URL,
  });
}

/** Called hourly: lock the top week once the voting deadline has passed. */
export async function autoLock(env: Env) {
  const s = await getSettings(env);
  if (s.locked_week || !s.vote_deadline || Date.parse(s.vote_deadline) > Date.now()) return;
  const week = topWeek(await leaderboard(env));
  if (week) await lockWeek(env, week, 'Bluebird');
}

// ------------------------------------------------------------------ board

export type BoardDeal = DealRow & {
  url: string;
  resort_name_raw: string;
  resort_name: string | null;
  accommodation_name: string;
  board_basis: string | null;
  nights: number;
  source_name: string;
  source_type: string;
  last_seen_at: string;
  first_seen_at: string;
  includes_lift_pass: number;
  extras: string;
  blurb: string | null;
  pinned: number;
  booked: number;
  upvotes: number;
  upvoted: number;
  fit: 'within' | 'stretch';
  score: ReturnType<typeof scoreDeal>;
};

export async function board(env: Env, memberId: string, opts: { includeHidden?: boolean; dealId?: string } = {}) {
  const s = await getSettings(env);
  // Only members who have answered the questions count towards fit and scores.
  const members = (await loadMembers(env)).filter((m) => m.countries.length && m.budget_ceiling_gbp);
  const ceiling = groupCeiling(members, s.group_budget_override);
  if (!s.locked_week) return { locked: false as const, ceiling, deals: [] as BoardDeal[] };

  const dates = [s.locked_week, ...(s.allow_sunday ? [new Date(Date.parse(s.locked_week + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10)] : [])];
  const { results } = await env.DB.prepare(
    `SELECT d.*, r.name AS resort_name, s.name AS source_name,
       (SELECT COUNT(*) FROM upvotes u WHERE u.deal_id = d.id) AS upvotes,
       (SELECT COUNT(*) FROM upvotes u WHERE u.deal_id = d.id AND u.member_id = ?) AS upvoted
     FROM deals d JOIN sources s ON s.id = d.source_id LEFT JOIN resorts r ON r.id = d.resort_id
     WHERE d.departure_date IN (${dates.map(() => '?').join(',')}) AND d.is_available = 1 ${opts.dealId ? 'AND d.id = ?' : ''}`,
  ).bind(memberId, ...dates, ...(opts.dealId ? [opts.dealId] : [])).all<Omit<BoardDeal, 'fit' | 'score'>>();

  const resortIds = [...new Set(results.map((d) => d.resort_id).filter(Boolean))] as string[];
  const facts = new Map<string, ResortFacts>();
  if (resortIds.length) {
    const { results: rs } = await env.DB.prepare(`SELECT id, top_altitude_m, glacier, transfer_mins FROM resorts WHERE id IN (${resortIds.map(() => '?').join(',')})`)
      .bind(...resortIds).all<{ id: string; top_altitude_m: number; glacier: number; transfer_mins: string }>();
    for (const r of rs) facts.set(r.id, { ...r, transfer_mins: JSON.parse(r.transfer_mins) });
  }

  // Peer medians per country + accommodation type for the week, from our own data.
  const peers = new Map<string, number[]>();
  for (const d of results) {
    const k = `${d.country}|${d.accommodation_type}`;
    if (!peers.has(k)) peers.set(k, []);
    peers.get(k)!.push(d.price_pp_gbp);
  }

  const ctx = { lockedWeek: s.locked_week, allowSunday: s.allow_sunday, ceiling, members };
  const deals: BoardDeal[] = [];
  for (const d of results) {
    const f = filterDeal(d, ctx);
    if (!f.show && !(opts.includeHidden && f.reason === 'hidden') && !opts.dealId) continue;
    if (f.fit === 'over' && !opts.dealId) continue;
    const peer = peers.get(`${d.country}|${d.accommodation_type}`) ?? [];
    const score = scoreDeal({ deal: d, ceiling, members, resort: d.resort_id ? facts.get(d.resort_id) ?? null : null, peerMedian: peer.length >= 5 ? median(peer) : null }, s.score_weights);
    deals.push({ ...d, fit: f.fit === 'over' ? 'stretch' : f.fit, score });
  }
  return { locked: true as const, ceiling, deals };
}
