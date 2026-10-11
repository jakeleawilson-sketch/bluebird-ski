// Thin JSON client + shared types for the Bluebird API.

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch('/api' + path, {
    method: init?.method ?? (init?.body !== undefined ? 'POST' : 'GET'),
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`, data);
  return data as T;
}

export type Band = { key: string; label: string; min: number; ceiling: number | null; piste: string; note: string };
export type Week = { start_date: string; label: string; hidden: number; badge: string | null };
export type Reference = {
  countries: { code: string; name: string }[];
  resorts: { id: string; name: string; country_code: string; top_altitude_m: number; glacier: number }[];
  airports: { iata: string; name: string; grp: 'london' | 'regional' }[];
  weeks: Week[];
  bands: Band[];
  admin_name: string;
};

export type AccType = 'catered_chalet' | 'chalet_hotel' | 'hotel';
export const ACC_LABELS: Record<AccType, string> = { catered_chalet: 'Catered chalet', chalet_hotel: 'Chalet hotel', hotel: 'Hotel' };

export type Prefs = {
  name: string;
  phone_e164: string | null;
  whatsapp_opt_in: boolean;
  status: 'in' | 'interested';
  budget_ceiling_gbp: number;
  countries: string[];
  resorts: string[];
  accommodation: AccType[];
  weeks: string[];
  airports: string[];
  last_minute: 'yes' | 'maybe' | 'no';
  room_pref: 'twin' | 'own' | 'partner' | null;
  room_partner_name: string | null;
  notes: string | null;
};

export type Me = Prefs & { id: string; email: string; is_admin: number; whatsapp_opt_in: number | boolean };

export type Standing = { start: string; available: number; preference: number; inCount: number; interestedCount: number; names: string[] };

export type Trip = {
  locked_week: string | null;
  vote_deadline: string | null;
  allow_sunday: boolean;
  group_ceiling: number | null;
  budget_overridden: boolean;
  booked: { id: string; accommodation_name: string; resort_name_raw: string; url: string } | null;
  weeks: Week[];
  leaderboard: Standing[];
  members: { id: string; name: string; status: 'in' | 'interested'; online: boolean; is_admin: boolean }[];
};

export type ScorePart = { key: string; label: string; score: number; weight: number; why: string };
export type Deal = {
  id: string; url: string; source_id: string; source_name: string; source_type: string;
  resort_id: string | null; resort: string; resort_raw: string; country: string | null;
  accommodation_name: string; accommodation_type: AccType; board_basis: string | null;
  departure_airport: string | null; departure_date: string; nights: number;
  price_pp_gbp: number; was_price_pp_gbp: number | null; first_price_pp_gbp: number;
  includes_lift_pass: boolean; extras: string[]; blurb: string | null;
  last_seen_at: string; first_seen_at: string; pinned: boolean; booked: boolean; hidden: boolean;
  upvotes: number; upvoted: boolean; fit: 'within' | 'stretch';
  score: { total: number; parts: ScorePart[]; suitsCount: number; memberCount: number };
};

// ------------------------------------------------------------------ formatting

export const gbp = (n: number | null | undefined) => (n == null ? '–' : '£' + Math.round(n).toLocaleString('en-GB'));

export const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts });

export function ago(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function daysUntil(iso: string): number {
  return Math.ceil((Date.parse(iso + 'T00:00:00Z') - Date.now()) / 86400000);
}

export const COUNTRY_FLAGS: Record<string, string> = { FR: '🇫🇷', AT: '🇦🇹', IT: '🇮🇹', CH: '🇨🇭', AD: '🇦🇩', BG: '🇧🇬', CA: '🇨🇦', US: '🇺🇸' };

const AVATAR_COLOURS = ['#1446c4', '#d93636', '#1f9d55', '#7a3fd1', '#e0731b', '#0f8a8a', '#c2337a', '#3c4a8c'];
export function avatarColour(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_COLOURS[Math.abs(h) % AVATAR_COLOURS.length];
}
export const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
