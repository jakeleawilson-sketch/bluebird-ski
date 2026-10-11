# Bluebird

A small private web app for planning one group ski holiday: friends join via an invite link, rank the weeks they can do, and Bluebird locks the most popular week, then hunts for good-value deals for it on a shared board with upvotes and a live chat. It also logs prices daily from day one for the Insights page. It never books anything.

The full spec is in [HANDOFF.md](HANDOFF.md). Source research is in [docs/sources.md](docs/sources.md).

## Stack

One Cloudflare Worker with static assets:

- `worker/` Hono API, auth, cron (`index.ts`), D1 access
- `worker/crawler.ts` one Durable Object per source site; serial, rate-limited fetching, robots.txt, R2 snapshots, auto-block after repeated failures
- `worker/chat.ts` chat room Durable Object (WebSocket hibernation); also broadcasts live board events
- `worker/sources/*` one adapter per deal source
- `worker/lib/*` pure logic (week scoring, budget, filters, Bluebird score), unit tested
- `app/` Preact frontend built by Vite into `dist/`
- `db/migrations` D1 schema, `seed/` reference data (generates `db/seed.sql`)

## Deploy your own

You need a Cloudflare account (the free Workers plan is enough to start; Durable Objects with SQLite are included) and Node 22+.

1. **Clone and install**

   ```bash
   git clone https://github.com/jakeleawilson-sketch/bluebird-ski.git
   ```

   ```bash
   npm install
   ```

2. **Create your config.** Copy the template, then fill in the placeholders in `wrangler.jsonc` (it's gitignored, so pulling updates never overwrites it):

   ```bash
   cp wrangler.example.jsonc wrangler.jsonc
   ```

3. **Create the database and bucket.** Paste the `database_id` that the first command prints into `wrangler.jsonc`:

   ```bash
   npx wrangler d1 create bluebird
   ```

   ```bash
   npx wrangler r2 bucket create bluebird-snapshots
   ```

4. **Set secrets.** `OPS_TOKEN` is any long random string (it lets you call the admin API from a terminal). `GEMINI_API_KEY` comes from Google AI Studio and powers the AI features; Bluebird caps its own monthly spend.

   ```bash
   npx wrangler secret put OPS_TOKEN
   ```

   ```bash
   npx wrangler secret put GEMINI_API_KEY
   ```

5. **Choose how sign-in emails are sent** (sign-in is by magic link). Pick one:
   - Cloudflare Email Sending: onboard a domain you own, uncomment `send_email` in `wrangler.jsonc` and set `EMAIL_FROM` to an address on it.
   - Resend: verify a domain there, set `EMAIL_FROM`, and run `npx wrangler secret put RESEND_API_KEY`.
   - Neither: links are printed in the Worker log (`npx wrangler tail`). Fine for trying it out, not for a real group.

6. **Deploy, then load the schema and reference data:**

   ```bash
   npm run deploy
   ```

   ```bash
   npm run db:migrate
   ```

7. **Sign in as admin.** Open your `APP_URL`, go to Sign in and enter an address from `ADMIN_EMAILS`. The admin page has the invite link to send to your group.

Updating later: `git pull`, then `npm run deploy`, plus `npm run db:migrate` if there are new migrations.

**Season.** The candidate weeks live in `seed/data.ts` (currently January to March 2027) and some page copy mentions 2027. For another season, edit the weeks, run `npm run seed:sql` and update the copy.

**Be a good citizen.** Each deployment runs its own crawlers against the deal sites. They respect robots.txt, fetch one page at a time with delays and stop on repeated errors. Please don't remove those limits. To skip the daily price-logging basket (it feeds the Insights page), set `LOGGING_AIRPORTS` to an empty string.

## Commands

```bash
npm install
npm run seed:sql            # regenerate db/seed.sql from seed/data.ts
npm run db:migrate:local    # local D1 schema + seed
npm run dev:worker          # API on :8787 (serves dist/ too)
npm run dev                 # Vite on :5173, proxies /api to :8787
npm test                    # unit tests
npm run typecheck
npm run deploy              # build + wrangler deploy
npm run db:migrate          # remote D1 schema + seed
```

For local dev, copy `.dev.vars.example` to `.dev.vars`.
Local test members: `npx tsx seed/fake-members.ts > /tmp/fake.sql && npx wrangler d1 execute bluebird --local --file /tmp/fake.sql`.
Without an email provider, magic links are printed in the Worker log.

## Config

Vars in `wrangler.jsonc`: `APP_URL`, `ADMIN_EMAILS`, `ADMIN_NAME`, `EMAIL_FROM`, `LOGGING_AIRPORTS`.
Secrets: `OPS_TOKEN` (bearer token for the admin API from scripts), `GEMINI_API_KEY`, optional `RESEND_API_KEY`.

Admin API from a terminal:

```bash
curl -X POST -H "Authorization: Bearer $OPS_TOKEN" -H 'content-type: application/json' -d '{"kind":"logging"}' https://<your-app-url>/api/admin/sources/iglu/run
```

## Licence

MIT. See [LICENSE](LICENSE).
