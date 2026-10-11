export interface Env {
  DB: D1Database;
  SNAPSHOTS: R2Bucket;
  CRAWLER: DurableObjectNamespace<import('./crawler').Crawler>;
  CHAT: DurableObjectNamespace<import('./chat').ChatRoom>;
  ASSETS: Fetcher;
  EMAIL?: SendEmail;

  APP_URL: string;
  ADMIN_EMAILS: string; // comma-separated
  ADMIN_NAME?: string; // shown to members, e.g. "Ask Sam for the link"
  EMAIL_FROM: string;
  LOGGING_AIRPORTS: string; // comma-separated IATA
  GEMINI_API_KEY?: string;
  RESEND_API_KEY?: string;
  OPS_TOKEN?: string; // bearer token for admin API from scripts
}
