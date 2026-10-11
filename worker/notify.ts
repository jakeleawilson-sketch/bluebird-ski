// Notifier (HANDOFF section 8). Email is always the baseline; WhatsApp is a
// pluggable channel added once the route is chosen.
import type { Env } from './env';
import { emailShell } from './auth';
import { nowIso } from './lib/time';

export type Email = { to: string; subject: string; text: string; html: string };

export async function sendEmail(env: Env, m: Email): Promise<'sent' | 'logged' | 'failed'> {
  let status: 'sent' | 'logged' | 'failed' = 'failed';
  let error: string | null = null;
  try {
    if (env.EMAIL) {
      await env.EMAIL.send({ to: m.to, from: { email: env.EMAIL_FROM, name: 'Bluebird' }, subject: m.subject, text: m.text, html: m.html });
      status = 'sent';
    } else if (env.RESEND_API_KEY) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `Bluebird <${env.EMAIL_FROM}>`, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
      });
      status = res.ok ? 'sent' : 'failed';
      if (!res.ok) console.error('resend', res.status, await res.text());
    } else {
      // No provider configured yet: log so local dev and early testing still work.
      console.log(`[email not configured] to=${m.to} subject=${m.subject}\n${m.text}`);
      status = 'logged';
    }
  } catch (e) {
    const err = e as { code?: string; message?: string };
    error = `${err.code ?? 'error'}: ${err.message ?? String(e)}`.slice(0, 300);
    console.error('email send failed', error);
  }
  await env.DB.prepare('INSERT INTO alerts_log (kind, channel, recipient, payload, sent_at, status) VALUES (?,?,?,?,?,?)')
    .bind('email', 'email', m.to, error ? `${m.subject} | ${error}` : m.subject, nowIso(), status).run();
  return status;
}

export type Alert = { kind: string; title: string; body: string; link: string };

export interface Notifier {
  channel: string;
  send(env: Env, alert: Alert, recipients: { name: string; email: string; phone_e164: string | null; whatsapp_opt_in: number }[]): Promise<void>;
}

export const emailNotifier: Notifier = {
  channel: 'email',
  async send(env, alert, recipients) {
    for (const r of recipients) {
      await sendEmail(env, {
        to: r.email,
        subject: alert.title,
        text: `${alert.body}\n\n${alert.link}`,
        html: emailShell(`<p>${alert.body}</p><p><a href="${alert.link}" style="color:#1446c4;font-weight:700">Open Bluebird →</a></p>`),
      });
    }
  },
};

/** Send an alert to every verified member on every configured channel. */
export async function alertEveryone(env: Env, alert: Alert) {
  const { results } = await env.DB.prepare('SELECT name, email, phone_e164, whatsapp_opt_in FROM members WHERE email_verified_at IS NOT NULL')
    .all<{ name: string; email: string; phone_e164: string | null; whatsapp_opt_in: number }>();
  await emailNotifier.send(env, alert, results);
}
