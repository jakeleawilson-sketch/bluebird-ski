// Gemini API helper (HANDOFF section 7, "Gemini usage"). Every call goes
// through here so the monthly spend cap is enforced and token use is logged.
import type { Env } from '../env';
import { getSettings } from '../settings';

const API = 'https://generativelanguage.googleapis.com/v1beta';

/** Conservative USD->GBP rate for cap checks (overstates GBP slightly so we stop early, not late). */
export const USD_TO_GBP = 0.8;

/**
 * Estimated list prices, USD per million tokens. Keep in sync with
 * https://ai.google.dev/gemini-api/docs/pricing. Unknown models are priced at
 * the most expensive entry so the cap still errs on the safe side.
 */
export const PRICES: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-3-flash': { input: 0.5, output: 3 },
  'gemini-3.1-pro': { input: 2, output: 12 },
};
const FALLBACK_PRICE = { input: 4, output: 18 };

export function priceFor(model: string) {
  const key = Object.keys(PRICES).sort((a, b) => b.length - a.length).find((k) => model.startsWith(k));
  return key ? PRICES[key] : FALLBACK_PRICE;
}

export function costUsd(model: string, input: number, output: number) {
  const p = priceFor(model);
  return (input * p.input + output * p.output) / 1e6;
}

export class SpendCapReached extends Error {
  constructor(public spentGbp: number, public capGbp: number) {
    super(`Gemini monthly cap reached (£${spentGbp.toFixed(2)} of £${capGbp})`);
  }
}

export async function monthSpendGbp(env: Env): Promise<number> {
  const r = await env.DB.prepare("SELECT COALESCE(SUM(cost_estimate), 0) AS usd FROM ai_usage_log WHERE created_at >= strftime('%Y-%m-01','now')").first<{ usd: number }>();
  return (r?.usd ?? 0) * USD_TO_GBP;
}

export type GenerateOptions = {
  job: string;
  model: string;
  prompt: string;
  system?: string;
  /** JSON schema for structured output; the reply is parsed as JSON. */
  schema?: Record<string, unknown>;
  /** Ground with Google Search (research jobs). */
  search?: boolean;
  maxOutputTokens?: number;
};

export async function generate<T = string>(env: Env, o: GenerateOptions): Promise<{ value: T; sources: { title: string; uri: string }[] }> {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
  const { ai_monthly_cap_gbp: cap } = await getSettings(env);
  const spent = await monthSpendGbp(env);
  if (spent >= cap) throw new SpendCapReached(spent, cap);

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: o.prompt }] }],
    generationConfig: {
      maxOutputTokens: o.maxOutputTokens ?? 2048,
      ...(o.schema ? { responseMimeType: 'application/json', responseSchema: o.schema } : {}),
    },
  };
  if (o.system) body.systemInstruction = { parts: [{ text: o.system }] };
  if (o.search) body.tools = [{ google_search: {} }];

  const res = await fetch(`${API}/models/${o.model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as {
    error?: { message: string };
    candidates?: { content?: { parts?: { text?: string }[] }; groundingMetadata?: { groundingChunks?: { web?: { title: string; uri: string } }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  };

  // Log usage even for failed calls that consumed tokens.
  const u = data.usageMetadata ?? {};
  const input = u.promptTokenCount ?? 0;
  const output = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0); // thinking is billed as output
  if (input || output)
    await env.DB.prepare('INSERT INTO ai_usage_log (job, model, input_tokens, output_tokens, cost_estimate) VALUES (?,?,?,?,?)')
      .bind(o.job, o.model, input, output, costUsd(o.model, input, output)).run();

  if (!res.ok || data.error) throw new Error(`Gemini ${res.status}: ${data.error?.message ?? 'request failed'}`);
  const cand = data.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  const sources = (cand?.groundingMetadata?.groundingChunks ?? []).flatMap((c) => (c.web ? [{ title: c.web.title, uri: c.web.uri }] : []));
  return { value: (o.schema ? JSON.parse(text) : text) as T, sources };
}

/** Lists models the key can use (no tokens spent). */
export async function listModels(env: Env): Promise<string[]> {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
  const out: string[] = [];
  let page = '';
  do {
    const res = await fetch(`${API}/models?pageSize=200${page ? `&pageToken=${page}` : ''}`, { headers: { 'x-goog-api-key': env.GEMINI_API_KEY } });
    const d = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[]; nextPageToken?: string; error?: { message: string } };
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${d.error?.message}`);
    for (const m of d.models ?? []) if (m.supportedGenerationMethods?.includes('generateContent')) out.push(m.name.replace('models/', ''));
    page = d.nextPageToken ?? '';
  } while (page);
  return out;
}
