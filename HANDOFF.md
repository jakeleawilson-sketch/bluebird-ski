# Bluebird: build handoff for Claude Code

> Read this whole file before writing any code. It is the product spec, the key decisions already made, and the open items. Where this file says "verify", check the current docs or site before relying on it, because APIs, prices and operators change.

---

## 1. What Bluebird is

Bluebird is a small private web app for planning one group ski holiday. The admin shares a link with 10 to 12 friends. Anyone with the link can opt in, set their preferences, and rank the weeks they can do. Bluebird works out the best week, then keeps hunting for good-value holiday deals for that week and posts them to a shared board that everyone can browse, upvote and chat about.

It also has an "Insights" page that explains how last-minute ski pricing tends to behave, shows real examples of last-minute deals from previous seasons, and logs live prices from day one so the group can see how prices move as departure approaches.

**Bluebird never books anything.** Every deal links out to the operator or supplier to book.

### The trip
- One week (7 nights), Saturday to Saturday, January to March 2027.
- Expected group: 4 to 6 people (10 to 12 invited). No children. Everyone is an experienced skier or boarder.
- Accommodation: catered chalets, chalet hotels or hotels. **No self-catering.**
- Price shown and compared = **flights + transfers + accommodation, per person**. Lift passes, hire and lessons are excluded from the comparison price (but note them on a deal if included, e.g. "free lift pass").

### Deadline
Live and ready to send invites within about **two weeks** (target: Thursday 22 October 2026). Price logging should start **as early as possible**, because historical data only accrues with time (see section 9).

---

## 2. Decisions already made

| Area | Decision |
|---|---|
| Name | Bluebird |
| Hosting | Cloudflare |
| Stack | Your choice (Claude Code), within Cloudflare. Suggestions in section 3. |
| Auth | Email magic link. No passwords. |
| Admin | One admin. Admin set by email allowlist in an env var. |
| AI provider | **Google Gemini API** (the admin's preference). Not OpenAI, not Anthropic, for runtime features. |
| Alerts | **WhatsApp** (preferred) plus email as a fallback. See section 8. |
| Chat | One live group chat, shown alongside the deal board. |
| Date choice | Week most people can do, weighted by preference. Price is ignored until the week is locked. Then everything focuses on that week only. |
| Deal frequency | Daily, increasing in the final fortnight before departure. |
| Upvotes | Yes, on every deal. |
| Insights | Well-researched page AND live price logging from day one. |
| Look and feel | Yes, a proper visual identity (section 12). |

---

## 3. Suggested architecture (Cloudflare)

You choose the frontend framework. Constraints: mobile-first (people will open links from WhatsApp on their phones), fast, accessible, and simple to deploy with Wrangler.

Suggested building blocks (verify current Cloudflare guidance; for new full-stack apps Cloudflare now steers people to **Workers with static assets** rather than Pages):

- **Workers**: API, auth, server rendering if wanted.
- **D1**: main database (members, preferences, weeks, deals, upvotes, price snapshots, sources).
- **Durable Objects**: the live chat room (WebSockets, use the hibernation API), and optionally a single "TripRoom" object that broadcasts board updates (new deal, upvote counts, week locked) to connected clients.
- **Cron Triggers**: schedule deal scans and price logging.
- **Queues**: fan out scan jobs per source per search, with retries and back-off.
- **Browser Rendering**: headless Chromium for JavaScript-heavy operator sites.
- **R2**: store raw page snapshots (HTML or screenshots) for each scan, so extraction can be re-run and errors audited.
- **Secrets**: Gemini key, email provider key, WhatsApp tokens, session secret.
- **Email**: magic links and digests. Use Cloudflare's email sending if available on the account, otherwise Resend or Postmark (verify).

Keep it as one repo, one Worker (or a small number), with clear modules:
`/app` (frontend), `/worker` (API + crons), `/worker/sources/*` (one adapter per deal source), `/worker/ai` (Gemini helpers), `/db/migrations`, `/seed` (countries, resorts, airports, weeks, sources).

---

## 4. Users, roles and flows

### Roles
- **Member**: anyone who has registered via the invite link and verified their email.
- **Admin**: the organiser. Everything a member can do, plus the admin view.

### Invite link
- One shareable invite URL, e.g. `/join/<token>`. Admin can rotate the token (old link stops working) and close registration.
- The landing page explains the trip in two lines, shows first names of who has already joined, and has a big "I'm in" button.

### Registration wizard (mobile-friendly, one step per screen, progress indicator)
1. **About you**: name, email. Optional mobile number for WhatsApp alerts, with an explicit consent tick.
2. **Status**: "I'm in" or "Interested, not sure yet". (Added by Claude in chat; it improves the date and budget logic. The admin can drop it.)
3. **Budget**: pick a band (section 6).
4. **Countries**: multi-select, then drag to rank. Offer in this order: France, Austria, Italy, Switzerland, Andorra, Bulgaria, Canada, USA.
5. **Resorts (optional step, skippable)**: only shows resorts in the countries they selected. Let them pick and rank up to 5.
6. **Accommodation type**: multi-select from Catered chalet, Chalet hotel, Hotel. (No self-catering anywhere in the app.)
7. **Weeks**: drag to rank the weeks they can do. Any week they leave unranked = cannot go. See section 5.
8. **Departure airports**: multi-select their preferred airports, grouped London and Regional (list in section 13).
9. **Last-minute**: "Would you consider booking very late (days before) for a good deal?" Yes / Maybe / No.
10. **Room**: Happy to share a twin / Need my own room / Sharing with a partner who is also coming (name). This matters because single supplements change the per-person price. (Added by Claude; optional.)
11. **Anything else**: free text, optional.

Then: "Check your email" screen. Clicking the magic link verifies the email, creates a long-lived session cookie (HttpOnly, Secure, SameSite=Lax), and lands them on the trip dashboard. Members can edit their preferences at any time from "My preferences".

Magic links: single use, expire after 30 minutes, rate-limited per email and per IP. Returning members request a new link from a simple "Sign in" page.

### Trip dashboard (the main screen)
- **Top banner**: before the week is locked, show the week leaderboard (section 5) and the voting deadline. After locking, show the locked week, a countdown to departure, and the current group budget.
- **Deal board** (main area): cards in a grid on desktop, a list on mobile. Sort by Bluebird score, cheapest, most upvoted, newest. Filter by country, accommodation type, airport, "suits me".
- **Chat** (side panel on desktop, slide-up drawer on mobile, with an unread badge).
- **Who's in**: first names, status, and avatars (initials).

### Deal card
Resort and country, accommodation name and type, board basis, departure airport, departure date, nights, **price per person** (flights + transfers + accommodation), "was" price if shown by the source, source name and type (tour operator / agent / independent combo), when it was last checked, Bluebird score, "suits X of Y" badge, upvote button and count, "Share to chat" button, "View deal" outbound link. A detail view adds the price-history sparkline, the score breakdown, and any extras (e.g. free lift pass, ski hosting).

### Admin view
- Members table: status, preferences summary, verified or not, last seen. Remove a member.
- Week leaderboard with who can make each week. **Lock week** button (and unlock). Set the voting deadline.
- Group budget override.
- Sources: enable or disable each source, see last run, success rate, errors, blocked status. "Run now" button per source.
- Deals: hide, pin, edit a mis-extracted field, mark as "Booked!" (celebration state across the app).
- Alerts: WhatsApp connection status, send a test, alert thresholds, daily cap.
- Invite: copy link, rotate token, close registration.
- Export members and deals as CSV.

---

## 5. Choosing the week

### Candidate weeks (Saturday departures, 2027)
Jan 2, Jan 9, Jan 16, Jan 23, Jan 30, Feb 6, Feb 13, Feb 20, Feb 27, Mar 6, Mar 13, Mar 20, Mar 27.

### School holidays (the group does not want half term)
- London February half term 2027 is Monday 15 to Friday 19 February, so the **Sat 13 Feb** week is half term. **Hide it by default.**
- London Easter holidays 2027 run from 26 March to 9 April, so the **Sat 27 Mar** week is Easter. **Hide it by default.** The **Sat 20 Mar** week returns on 27 March, so it brushes the start of Easter; show it with a "Start of Easter, may be pricier" badge.
- Some English regions and Scotland use different February dates. Show **Sat 6 Feb** and **Sat 20 Feb** with a small "Some regional half terms" badge. Verify against a few regional term-date lists before launch.
- Admin can un-hide any week.

### Algorithm
- Each member ranks the weeks they can do. Unranked = unavailable.
- Member weight: "I'm in" = 1.0, "Interested" = 0.5.
- For a member who ranked k weeks, their week at rank r gets preference points `(k - r + 1) / k` (so 1.0 for their top pick, scaled so people who tick many weeks do not dominate).
- **Primary score** = weighted count of members available that week.
- **Secondary score** (tie-break and display) = sum of weighted preference points.
- Show a leaderboard: week, available count, names, preference bar.
- When the voting deadline passes, auto-lock the top week (admin can override or lock earlier). Send an alert to everyone when the week is locked.
- Once locked, all deal hunting is confined to that week. Saturday departures are primary. Sunday departures on the same weekend (some operators fly Sundays) appear with a "Sunday departure" flag; admin can switch them off.

---

## 6. Budget

### Bands (per person, flights + transfers + accommodation, 7 nights, based on sharing)
| Band | Label | Notes |
|---|---|---|
| Up to £700 | Green run | Bulgaria, Andorra, early January, some late deals |
| £700 to £950 | Blue run | Good-value Alps chalets and hotels |
| £950 to £1,250 | Red run | Mainstream catered chalet territory |
| £1,250 to £1,600 | Black run | Better chalets, bigger-name resorts, peak weeks |
| £1,600 to £2,000 | Off-piste | Premium Alps, budget North America |
| £2,000 to £2,750 | Heli-ski | Most North America packages, luxury Alps |
| £2,750+ | Champagne powder | Luxury anywhere |

These are rough guide bands for the UI, not data. Store each member's choice as a numeric ceiling.

### Group budget
- Default group ceiling = the **lowest ceiling among "I'm in" members**.
- Deals up to the next band above are shown as "Stretch" with a flag, so people can see what a bit more buys.
- Admin can override the group ceiling.

---

## 7. Finding deals

### Principle
There are no public APIs for most UK ski tour operators. The pipeline must be built as a set of **source adapters**, each of which fetches results and normalises them into one `Deal` shape. Prefer, in this order:
1. **Official feeds or affiliate product feeds** (check Awin and similar networks for each operator; verify).
2. **Public search or deals pages**, fetched politely and rendered with Browser Rendering where needed, with **Gemini** extracting structured data from the page.
3. **Assembled "independent combos"** (separate flight + accommodation + transfer estimate), clearly labelled as estimates.

### Scraping rules (non-negotiable)
- Check and respect `robots.txt` for every source.
- Low rate: at most one request every few seconds per domain, cache aggressively, never parallelise against one site.
- Identify honestly with a descriptive user agent.
- Never log in, never bypass bot protection, never solve CAPTCHAs, never use rotating proxies to evade blocks.
- If a source blocks or errors repeatedly, mark it "blocked" in the admin view and stop calling it.
- This is a private, non-commercial tool for one group; keep it that way.

### Sources to research and build adapters for (verify each is trading and what it offers)
Tour operators and specialists:
- Crystal Ski (TUI)
- Inghams (and sister brand Esprit, though Esprit is family-focused)
- Skiworld
- Ski Total
- Mark Warner
- Club Med
- Ski Beat
- Le Ski
- Supertravel
- Jet2 (check whether they currently sell ski packages)
- Ski Independence and Ski Safari (strong for Canada and USA)

Agents and aggregators (good for breadth and last-minute stock):
- Iglu Ski
- Ski Line
- Ski Solutions
- Snow-Wise (verify)

Independent combos:
- Flights: find a legitimate flight API with UK coverage (e.g. Duffel; verify current options and pricing). Do not scrape Google Flights.
- Accommodation: independent catered chalets and hotels via any affiliate or partner API available (e.g. Booking.com affiliate programme; verify). Airbnb has no public API and is mostly self-catering, so skip it.
- Transfers: estimate from a small lookup table per resort (typical shared transfer cost and time from the nearest airports), researched once and stored in the resorts seed.

**Build the first 2 or 3 adapters that are easiest and most reliable first** (likely an agent/aggregator with broad stock plus Crystal and Inghams), get the full pipeline and board working end to end, then add more.

### Normalised `Deal` shape (suggested)
```
id, source_id, source_type (operator | agent | independent),
external_ref, url,
resort_id (nullable if unmatched), resort_name_raw, country,
accommodation_name, accommodation_type (catered_chalet | chalet_hotel | hotel),
board_basis, departure_airport (IATA), departure_date, nights,
price_pp_gbp, was_price_pp_gbp (nullable), price_basis_notes,
includes_flights, includes_transfers, includes_lift_pass, extras (json),
first_seen_at, last_seen_at, last_price_change_at, is_available,
raw_snapshot_r2_key, extraction_confidence
```
Plus `deal_price_history(deal_id, price_pp_gbp, captured_at)`.

Matching: normalise resort names to the seed list (aliases help, e.g. "Les 3 Vallées" areas). Use Gemini only when a deterministic match fails, and store the result.

### Filtering for the board
A deal is shown on the board when all of these hold:
- Departure date is the locked week (Saturday, or Sunday if allowed).
- Country is one at least one member selected.
- Accommodation type is one at least one member selected, and never self-catered.
- Departure airport is in at least one member's preferred list.
- Price is within the group ceiling, or within the "Stretch" band (flagged).
- Has availability for at least the number of "I'm in" members (where the source shows this).

### Bluebird score (0 to 100)
Weighted blend, weights in config so the admin can tune them:
- **Value**: price versus the median for that week, country and accommodation type in our own data; plus discount versus "was" price or first-seen price.
- **Budget fit**: how far under the group ceiling.
- **Group fit**: share of members whose preferred country, accommodation type and airport match ("suits X of Y").
- **Resort preference**: Borda-style points from members' resort rankings, and country ranking.
- **Snow sense**: resort top altitude and glacier access (from the seed). Higher matters more for late March.
- **Practicality**: transfer time.

Show the breakdown on the deal detail view, in plain words.

### Scan schedule
- Before the week is locked: no group deal scanning (only the price-logging basket in section 9).
- After locking, more than 14 days before departure: once a day (early morning UK time).
- 14 to 4 days before departure: every 6 hours.
- Final 72 hours: every 3 hours, if at least one member said Yes or Maybe to last-minute.
- Respect per-domain politeness above all; if the schedule and politeness conflict, politeness wins.
- Deduplicate on `(source, external_ref)` or a hash of resort + accommodation + date + airport.

### Gemini usage
Use the Gemini API (check current model names; use a fast, cheap "Flash" class model for bulk extraction and a "Pro" class model for research and writing):
- Extract structured deals from rendered pages using JSON schema / structured output. Validate every field; reject and log anything that fails validation.
- Resort-name matching fallback.
- A one-line "why this is a good deal" blurb per deal (generated from the structured data only; no invented facts).
- Research and drafting for the Insights page, using search grounding where available, with sources kept.
- Extraction of archived deals pages (section 9).

Put a monthly spend cap in config and log token use per job. Cache extraction results by snapshot hash.

---

## 8. Alerts

### Events that trigger alerts
- Week locked.
- New deal with Bluebird score above a threshold (config, e.g. 80).
- Price drop of X% or more (config, e.g. 10%) on any upvoted deal.
- Final-fortnight "deal of the day" (optional, admin toggle).
- Daily cap on WhatsApp alerts (config, e.g. 3 per day) so it never becomes spam; extras roll into an email digest.

### WhatsApp: three options, in order of preference (verify current terms and pricing)
1. **Official Meta WhatsApp Cloud API, Groups API.** Meta's Cloud API now supports groups: the business creates a group via the API, gets an invite link to share, and can post messages to the group once people have joined. Requirements: a Meta business account, a phone number dedicated to Cloud API (not one used in the normal WhatsApp app), webhooks configured, and possibly eligibility criteria. Bluebird would show a "Join the Bluebird alerts group" link after registration. Check Groups API eligibility and per-message pricing first.
2. **Official Cloud API, individual messages.** Send template messages to each member who opted in with their number. Needs approved message templates. Reliable but less sociable than a group.
3. **Unofficial gateways** (services that link an ordinary WhatsApp number and expose a groups API). Quickest to set up and can post into an existing WhatsApp group, but they run against WhatsApp's terms and the number can be banned. **Not recommended.** If chosen anyway, use a spare number, never a main one.

Build alerts behind a small `Notifier` interface so the channel can be swapped, and **always send email as a baseline** so nothing depends on WhatsApp working.

Every alert links straight to the deal (or the dashboard) in Bluebird.

---

## 9. Insights page: last-minute deals and price logging

This page answers questions like: "How likely is it that we book 3 days before and get half price?" and "What holidays can we expect to see around our week?" It has three parts, and it must be **honest about uncertainty**.

### 9a. The research guide (written content)
Research, with sources, and write a readable guide covering:
- How UK ski operators price a season (early booking offers, free lift pass and "free place" offers, late availability), and when discounts typically appear.
- Which weeks tend to be cheapest (early January, late January, early March) and which are pricier (New Year, February half term, Easter).
- How big last-minute discounts typically are, how often genuinely large discounts (40% to 50% or more) appear, and on what kind of stock (often less popular chalets, resorts, airports or room types). Explain the survivorship effect: advertised late deals are leftover stock.
- Practical tactics for a flexible group: being open on airport and resort, booking a whole small chalet, watching specific operators' late-deals pages.
- Use Gemini with search grounding plus manual review. Every factual claim needs a source link. Mark any estimate clearly as an estimate.
- Present a simple, labelled estimate table such as "Chance of finding a package at least X% below its early price within N days of departure", with a confidence label (Low / Medium / High) and the reasoning. Initially it is based on research ("prior"), then increasingly on Bluebird's own data (9c).

Seed example worth including (verify before use): Skiworld's early offers for 2026/27 included a free lift pass on selected catered chalet departures on 6/7 February, 20/21 February and 13/14 March 2027.

### 9b. Real examples from previous seasons
- Use the Internet Archive Wayback Machine (CDX API) to find archived snapshots of operators' and agents' "late deals" / "last minute ski" pages from January to March of 2023, 2024, 2025 and 2026.
- Fetch the archived pages politely, extract deals with Gemini (resort, accommodation, date, days before departure if derivable, price, was price), and store them in `historical_deals` with the archive URL.
- Show them as a gallery: "Last-minute deals seen around this week in previous seasons", filterable by week of season and country, each linking to the archived page. Once the group's week is locked, highlight examples from the same week in past years.
- Also collect press round-ups of last-minute ski deals from previous seasons as supporting examples (summarise; do not copy articles).

### 9c. Live price logging (start this first)
- From day one, run a daily **price-logging basket** across **all** candidate weeks, independent of the group's choice. Example basket: for each logging-enabled source, for each Saturday January to March 2027, a fixed set of reference searches (2 adults sharing, catered chalet and hotel, from LGW, LHR and MAN, top 5 resorts in France and Austria plus any resorts members rank highly).
- Track the **same product over time** (stable product key per source) so discount curves are real, not just "cheapest today".
- Store `price_snapshots(product_key, source_id, resort, accommodation, departure_date, airport, price_pp_gbp, available, captured_at)`.
- Charts:
  - Price versus days to departure, per week and country (median and range).
  - Discount from first-seen price versus days to departure.
  - "Cheapest week right now" heatmap (weeks × countries).
- As the season approaches, compute empirical probabilities from the snapshots (e.g. share of tracked products whose price fell at least 20%, 30%, 50% below first-seen in the final 3, 7 and 14 days), and show them next to the research priors, with sample sizes.
- Keep logging after the trip is booked; the data stays useful for future trips.

---

## 10. Chat

- One room for the whole trip, implemented with a Durable Object and WebSockets (hibernation API).
- Messages persisted (DO storage, mirrored to D1 if useful for search/export). Load the last 100 on open; infinite scroll upwards.
- Display names and initials avatars. Timestamps. Edit and delete own messages within 10 minutes. Admin can delete any message.
- "Share to chat" on a deal posts a compact deal card into the chat that links to the deal.
- System messages for events: new top deal, price drop, week locked, someone joined, booked.
- Basic rate limiting and length limits. Plain text plus links; emoji reactions are a nice extra if cheap to add.
- Works well on mobile as a drawer over the board.

---

## 11. Data model (starting point; adapt as needed)

```
members(id, name, email, email_verified_at, phone_e164, whatsapp_opt_in,
        status [in|interested], budget_ceiling_gbp, last_minute [yes|maybe|no],
        room_pref, room_partner_member_id, notes, is_admin, created_at, last_seen_at)
member_countries(member_id, country_code, rank)
member_resorts(member_id, resort_id, rank)
member_accommodation(member_id, type)
member_airports(member_id, iata)
member_weeks(member_id, week_start_date, rank)

weeks(start_date, label, hidden, badge)
trip_settings(key, value)        -- locked_week, vote_deadline, group_budget_override, invite_token, registration_open, score_weights, alert_thresholds
sessions(id, member_id, created_at, expires_at)
magic_links(token_hash, email, expires_at, used_at)

countries(code, name, sort_order)
resorts(id, name, aliases json, country_code, top_altitude_m, base_altitude_m,
        glacier bool, ski_area_km, nearest_airports json, transfer_mins json, transfer_cost_gbp json)
airports(iata, name, group [london|regional])

sources(id, name, type, base_url, enabled, logging_enabled, last_run_at, last_status, consecutive_failures, blocked)
deals(...see section 7...)
deal_price_history(deal_id, price_pp_gbp, captured_at)
upvotes(deal_id, member_id, created_at)   -- unique per pair
price_snapshots(...see section 9c...)
historical_deals(id, source_name, archive_url, captured_on, resort_raw, country, accommodation_raw,
                 departure_date, days_before_departure, price_pp_gbp, was_price_pp_gbp, notes)
chat_messages(id, member_id, body, kind [user|system|deal_share], deal_id, created_at, edited_at, deleted_at)
alerts_log(id, kind, channel, payload, sent_at, status)
ai_usage_log(job, model, input_tokens, output_tokens, cost_estimate, created_at)
```

---

## 12. Look and feel

The name comes from a "bluebird day": perfect sunshine and deep blue sky after fresh snow. The app should feel like that: bright, crisp, optimistic, a bit playful.

- **Palette**: deep cobalt sky fading to a pale horizon, snow white surfaces, a warm sun accent (golden yellow to orange) for calls to action and the Bluebird score. Piste colours (green, blue, red, black) used sparingly as a secondary system, e.g. for the budget bands.
- **Typography**: a bold, slightly retro display face with character (think vintage ski-resort posters) for headings, paired with a clean, highly legible sans for body and numbers. Prices must be very easy to read.
- **Details**: a simple mountain-ridge silhouette motif, subtle snow texture or grain, piste-marker style badges, friendly microcopy ("Waxing the skis..." for loading, "Fresh tracks!" for a new top deal, a small celebration when the trip is booked).
- **Dark mode**: "night skiing" or alpenglow tones.
- Mobile first, fast, accessible (contrast, focus states, reduced-motion support).
- Avoid generic template looks. Use the frontend-design approach: a clear aesthetic direction, intentional typography, no default component-library styling left unthemed.

---

## 13. Seed data to prepare

**Countries (in this order)**: France, Austria, Italy, Switzerland, Andorra, Bulgaria, Canada, USA.

**Resorts (starting list; verify spellings and add altitude, glacier, nearest airports, transfer times and typical transfer cost)**:
- France: Val Thorens, Les Menuires, Méribel, Courchevel, La Tania, Tignes, Val d'Isère, Les Arcs, Peisey-Vallandry, La Plagne, La Rosière, Sainte-Foy, Alpe d'Huez, Les Deux Alpes, Serre Chevalier, Chamonix, Morzine, Avoriaz, Les Gets, Flaine
- Austria: St Anton, Lech, Ischgl, Sölden, Obergurgl, Mayrhofen, Kitzbühel, Saalbach, Zell am See, Bad Gastein, Obertauern, Alpbach
- Italy: Cervinia, La Thuile, Courmayeur, Sestriere, Sauze d'Oulx, Selva (Val Gardena), Alta Badia, Madonna di Campiglio, Passo Tonale, Livigno, Bormio, Cortina
- Switzerland: Zermatt, Verbier, Saas-Fee, St Moritz, Davos, Klosters, Laax, Wengen, Grindelwald, Mürren, Engelberg, Crans-Montana, Andermatt
- Andorra: Soldeu, El Tarter, Pas de la Casa, Arinsal
- Bulgaria: Bansko, Borovets, Pamporovo
- Canada: Whistler, Banff (Sunshine and Lake Louise), Revelstoke, Big White, Sun Peaks, Fernie, Mont Tremblant
- USA: Vail, Beaver Creek, Breckenridge, Aspen, Telluride, Steamboat, Jackson Hole, Park City, Alta/Snowbird, Big Sky, Mammoth

**Airports**:
- London: Heathrow (LHR), Gatwick (LGW), Stansted (STN), Luton (LTN), London City (LCY), Southend (SEN)
- Regional: Manchester (MAN), Birmingham (BHX), Bristol (BRS), Edinburgh (EDI), Glasgow (GLA), Newcastle (NCL), Leeds Bradford (LBA), East Midlands (EMA), Liverpool (LPL), Cardiff (CWL), Belfast International (BFS), Aberdeen (ABZ), Southampton (SOU), Exeter (EXT), Norwich (NWI), Bournemouth (BOH)

**Weeks**: as in section 5, with hidden flags and badges.

**Sources**: as in section 7, each with a short research note (what is available, robots.txt status, affiliate feed or not, rendering needed or not).

---

## 14. Build order (aim: invites out within about a week, full app within two)

**Phase 0 (days 1 to 2): foundations and data clock**
- Repo, Wrangler config, D1 schema and migrations, seeds.
- Price-logging basket for the first 1 or 2 easiest sources, running daily. Getting this running early matters more than polish elsewhere.

**Phase 1 (days 2 to 6): invite-ready**
- Visual identity and core layout.
- Invite landing, registration wizard, magic link auth, My preferences.
- Week ranking and leaderboard, voting deadline, lock.
- Admin view (members, weeks, invite controls).
- Live chat.
- Email notifications (magic links, week locked).
- The admin sends the invite link at the end of this phase.

**Phase 2 (days 6 to 12): deals**
- Source adapter framework, first 2 or 3 adapters end to end, Gemini extraction with validation.
- Deal board, detail view, upvotes, Bluebird score, filters, live updates.
- Scan schedule tied to the locked week.
- Alerts: email first, then WhatsApp via the chosen option.

**Phase 3 (days 10 to 14): insights**
- Research guide with sources.
- Wayback historical examples gallery.
- Live price charts and the estimate table.

**After launch**
- More adapters, independent combos, score tuning, booked state.

---

## 15. Testing and quality

- Unit tests for the week-scoring algorithm, budget logic, deal filtering and the Bluebird score.
- Each source adapter has saved HTML fixtures and tests, so site changes are caught quickly.
- Validate every Gemini extraction against a schema; log and surface low-confidence extractions in admin instead of showing them.
- Seed script with 6 fake members with varied preferences for local testing.
- Check the whole flow on a phone-width screen.
- Error monitoring and a simple health panel in admin (last successful scan per source, AI spend this month, alerts sent).

---

## 16. Privacy

- Collect only what is listed above. Emails and phone numbers are never shown to other members.
- A short, plain-English privacy note on the registration page: what is stored, why, that it is only for this trip, and that it will be deleted after the trip on request or automatically (e.g. 3 months after return).
- No third-party tracking or analytics beyond basic, privacy-respecting server logs.
- WhatsApp numbers used only with explicit opt-in, and only for Bluebird alerts.

---

## 17. What the admin needs to provide

- Cloudflare account access (and which domain or subdomain Bluebird should live on).
- Gemini API key, and a monthly AI spend cap.
- Email sending: a sending domain and provider choice (or confirm Cloudflare's email sending is available).
- WhatsApp: which option from section 8. For the official route: a Meta business account and a dedicated phone number for Cloud API.
- His admin email address.
- Optional: affiliate network accounts (e.g. Awin) if any operator feeds turn out to need them.
- The voting deadline for weeks (suggestion: about 10 days after invites go out).

---

## 18. Open questions to resolve with the admin (sensible defaults in brackets)

1. Domain for the app? [subdomain on one of the admin's existing domains]
2. Voting deadline? [10 days after invites]
3. Keep the "Interested" status and room-sharing step? [yes, both]
4. Allow Sunday departures on the locked weekend? [yes, flagged]
5. WhatsApp route? [official Groups API if eligible, otherwise individual template messages; email always]
6. Alert thresholds and daily cap? [score 80+, price drop 10%+, max 3 WhatsApp alerts per day]
