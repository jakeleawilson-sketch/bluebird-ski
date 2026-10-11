# Deal sources: research log

Checked 2026-10-08 with the Bluebird user agent. Rules in HANDOFF.md section 7 apply: respect robots.txt, one request every few seconds per domain, never bypass bot protection.

| Source | Status | Notes |
|---|---|---|
| **Iglu Ski** | **Adapter live** (`worker/sources/iglu.ts`) | `/ski-holidays` is server-rendered and filterable by URL (`date=ddMMyyyy`, `nts`, `ad`, `board=ca/hb/al/ap`, `fr=<IATA>`, `page`). Each page embeds a JSON data layer with property, resort, country, price pp (2 sharing), original price, outbound airport, board, package type. Card widgets give the booking URL and the underlying supplier code (e.g. `ING` = Inghams), so this one adapter covers stock from many operators. robots.txt allows it. 10 results/page; `perpage` ignored. |
| Crystal Ski | **Blocked** | robots.txt and pages return HTTP 403 to non-browser clients (bot protection). Not usable without bypassing protection, which we don't do. Crystal stock may still appear via Iglu. |
| Inghams | To build | robots.txt disallows `/ski-holidays/search-results`. Need another route (deals pages, or an affiliate feed). Inghams stock appears via Iglu (supplier `ING`). |
| Skiworld | To build | robots.txt allows general paths (blocks booking steps and one bot). Sitemap at `/sitemap.php`. |
| Ski Total | Check | TLS error from our client on 2026-10-08; recheck. |
| Ski Beat | To build | robots.txt only blocks specific bots for `*`. |
| Ski Solutions | To build | WordPress site; robots.txt allows most paths. |
| Ski Line | To build | robots.txt allows everything. |
| Supertravel | To build | robots.txt disallows any URL with `?`, so query-string search pages are off limits. |
| Mark Warner | To build | robots.txt blocks `/Book` only. |
| Le Ski | Check | robots.txt 404 (no rules). |
| Club Med, Esprit, Jet2, Ski Independence, Ski Safari, Snow-Wise | Not yet checked | |
| Flights API (Duffel etc.), Booking.com affiliate | Not yet researched | Needed for "independent combos". |

## Insights research (9 Oct 2026)

- The guide's sources are listed in `app/components/Guide.tsx` (`SOURCES`); each was opened and checked on 9 Oct 2026.
- Past late deals: 13 verified examples from dated press/deal-news pages, in `seed/historical.ts` (generates `db/historical.sql`).
- **Wayback Machine import: not built yet.** On 9 Oct 2026 the Internet Archive was down ("Temporarily Offline", HTTP 503), so the CDX lookups for operators' late-deal pages (Jan to Mar 2023 to 2026) couldn't run. Plan: CDX query per page → fetch snapshots through the Crawler DO (origin `web.archive.org`, polite delay) → Iglu pages parse with the existing data-layer parser, others via Gemini Flash structured extraction → `historical_deals` with `source_kind = 'wayback'`.
