// Email magic-link auth (HANDOFF section 4). Links open the app, which POSTs
// the token, so email scanners that prefetch GET links cannot burn them.
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env } from './env';
import { addDays, nowIso, randomToken, sha256Hex } from './lib/time';
import { sendEmail } from './notify';

export const SESSION_COOKIE = 'bb_session';
const LINK_TTL_MIN = 30;
const SESSION_DAYS = 180;
const LIMIT_PER_EMAIL = 4; // per 15 minutes
const LIMIT_PER_IP = 12;

export type Member = {
  id: string;
  name: string;
  email: string;
  status: 'in' | 'interested';
  is_admin: number;
  email_verified_at: string | null;
};

export const isAdminEmail = (env: Env, email: string) =>
  env.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean).includes(email.trim().toLowerCase());

export async function currentMember(c: Context<{ Bindings: Env }>): Promise<Member | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const id = await sha256Hex(token);
  const m = await c.env.DB.prepare(
    `SELECT m.id, m.name, m.email, m.status, m.is_admin, m.email_verified_at, m.last_seen_at FROM sessions s JOIN members m ON m.id = s.member_id
     WHERE s.id = ? AND s.expires_at > ?`,
  ).bind(id, nowIso()).first<Member & { last_seen_at: string | null }>();
  if (!m) return null;
  if (isAdminEmail(c.env, m.email)) m.is_admin = 1;
  if (!m.last_seen_at || Date.now() - Date.parse(m.last_seen_at) > 5 * 60_000)
    c.executionCtx.waitUntil(c.env.DB.prepare('UPDATE members SET last_seen_at = ? WHERE id = ?').bind(nowIso(), m.id).run());
  return m;
}

export async function rateLimited(env: Env, email: string, ip: string | null): Promise<boolean> {
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const byEmail = await env.DB.prepare('SELECT COUNT(*) AS n FROM magic_links WHERE email = ? AND created_at > ?').bind(email, since).first<{ n: number }>();
  if ((byEmail?.n ?? 0) >= LIMIT_PER_EMAIL) return true;
  if (ip) {
    const byIp = await env.DB.prepare('SELECT COUNT(*) AS n FROM magic_links WHERE ip = ? AND created_at > ?').bind(ip, since).first<{ n: number }>();
    if ((byIp?.n ?? 0) >= LIMIT_PER_IP) return true;
  }
  return false;
}

export async function sendMagicLink(env: Env, email: string, name: string, ip: string | null, welcome: boolean) {
  const token = randomToken();
  const expires = new Date(Date.now() + LINK_TTL_MIN * 60_000).toISOString();
  await env.DB.prepare('INSERT INTO magic_links (token_hash, email, ip, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256Hex(token), email, ip, expires).run();
  const link = `${env.APP_URL}/auth?token=${encodeURIComponent(token)}`;
  const first = name.split(' ')[0];
  const subject = welcome ? 'Confirm your email for Bluebird ❄️' : 'Your Bluebird sign-in link';
  const lead = welcome ? `Thanks for joining the ski trip, ${first}! Tap below to confirm your email and see the trip dashboard.` : `Hi ${first}, here's your link to get back into Bluebird.`;
  await sendEmail(env, {
    to: email,
    subject,
    text: `${lead}\n\n${link}\n\nThis link works once and expires in ${LINK_TTL_MIN} minutes. If you didn't ask for it, ignore this email.`,
    html: emailShell(`<p>${lead}</p><p style="margin:28px 0"><a href="${link}" style="background:#f5a524;color:#1b1f3b;padding:14px 22px;border-radius:999px;font-weight:700;text-decoration:none;display:inline-block">${welcome ? "Confirm, I'm in" : 'Sign in to Bluebird'}</a></p><p style="color:#5b6478;font-size:14px">This link works once and expires in ${LINK_TTL_MIN} minutes. If you didn't ask for it, just ignore this email.</p>`),
  });
  return link;
}

export function emailShell(inner: string) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;color:#1b1f3b;font-size:16px;line-height:1.5">
<div style="background:linear-gradient(180deg,#1446c4,#7fb2f0);border-radius:16px 16px 0 0;padding:28px 24px;color:#fff;font-size:28px;font-weight:800;letter-spacing:.02em">Bluebird</div>
<div style="padding:24px;border:1px solid #e3e8f2;border-top:0;border-radius:0 0 16px 16px">${inner}</div></div>`;
}

/** Consume a magic link and start a session. Returns the member id or an error. */
export async function verifyMagicLink(c: Context<{ Bindings: Env }>, token: string): Promise<{ memberId: string } | { error: string }> {
  const env = c.env;
  const hash = await sha256Hex(token);
  const link = await env.DB.prepare('UPDATE magic_links SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING email')
    .bind(nowIso(), hash, nowIso()).first<{ email: string }>();
  if (!link) return { error: 'That link has expired or has already been used. Request a new one below.' };

  let member = await env.DB.prepare('SELECT id FROM members WHERE email = ?').bind(link.email).first<{ id: string }>();
  if (!member && isAdminEmail(env, link.email)) {
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO members (id, name, email, is_admin, status) VALUES (?, ?, ?, 1, 'in')").bind(id, 'Admin', link.email).run();
    member = { id };
  }
  if (!member) return { error: 'No member with that email.' };
  await env.DB.prepare('UPDATE members SET email_verified_at = COALESCE(email_verified_at, ?), is_admin = ? WHERE id = ?')
    .bind(nowIso(), isAdminEmail(env, link.email) ? 1 : 0, member.id).run();

  const session = randomToken();
  await env.DB.prepare('INSERT INTO sessions (id, member_id, expires_at) VALUES (?, ?, ?)').bind(await sha256Hex(session), member.id, addDays(nowIso(), SESSION_DAYS) + 'T00:00:00Z').run();
  setCookie(c, SESSION_COOKIE, session, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: SESSION_DAYS * 86400 });
  return { memberId: member.id };
}

export async function logout(c: Context<{ Bindings: Env }>) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Hex(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}
