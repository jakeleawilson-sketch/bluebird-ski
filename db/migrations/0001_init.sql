-- Bluebird initial schema. See HANDOFF.md section 11.

-- ---------------------------------------------------------------- reference data
CREATE TABLE countries (
  code        TEXT PRIMARY KEY,           -- ISO 3166-1 alpha-2
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL
);

CREATE TABLE resorts (
  id                 TEXT PRIMARY KEY,    -- slug, e.g. 'val-thorens'
  name               TEXT NOT NULL,
  aliases            TEXT NOT NULL DEFAULT '[]',   -- json array of strings
  country_code       TEXT NOT NULL REFERENCES countries(code),
  top_altitude_m     INTEGER,
  base_altitude_m    INTEGER,
  glacier            INTEGER NOT NULL DEFAULT 0,
  ski_area_km        INTEGER,
  nearest_airports   TEXT NOT NULL DEFAULT '[]',   -- json array of IATA codes (destination side)
  transfer_mins      TEXT NOT NULL DEFAULT '{}',   -- json { IATA: minutes }
  transfer_cost_gbp  TEXT NOT NULL DEFAULT '{}'    -- json { IATA: typical shared transfer pp, return }
);
CREATE INDEX resorts_country ON resorts(country_code);

CREATE TABLE airports (
  iata        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  grp         TEXT NOT NULL CHECK (grp IN ('london','regional')),
  sort_order  INTEGER NOT NULL
);

CREATE TABLE weeks (
  start_date  TEXT PRIMARY KEY,           -- YYYY-MM-DD, a Saturday
  label       TEXT NOT NULL,
  hidden      INTEGER NOT NULL DEFAULT 0,
  badge       TEXT                        -- e.g. 'Half term', 'Some regional half terms'
);

-- ---------------------------------------------------------------- members
CREATE TABLE members (
  id                      TEXT PRIMARY KEY,
  name                    TEXT NOT NULL,
  email                   TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email_verified_at       TEXT,
  phone_e164              TEXT,
  whatsapp_opt_in         INTEGER NOT NULL DEFAULT 0,
  status                  TEXT NOT NULL DEFAULT 'in' CHECK (status IN ('in','interested')),
  budget_ceiling_gbp      INTEGER,
  last_minute             TEXT CHECK (last_minute IN ('yes','maybe','no')),
  room_pref               TEXT CHECK (room_pref IN ('twin','own','partner')),
  room_partner_name       TEXT,
  room_partner_member_id  TEXT REFERENCES members(id) ON DELETE SET NULL,
  notes                   TEXT,
  is_admin                INTEGER NOT NULL DEFAULT 0,
  created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at            TEXT
);

CREATE TABLE member_countries (
  member_id     TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  country_code  TEXT NOT NULL REFERENCES countries(code),
  rank          INTEGER NOT NULL,
  PRIMARY KEY (member_id, country_code)
);

CREATE TABLE member_resorts (
  member_id  TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  resort_id  TEXT NOT NULL REFERENCES resorts(id),
  rank       INTEGER NOT NULL,
  PRIMARY KEY (member_id, resort_id)
);

CREATE TABLE member_accommodation (
  member_id  TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('catered_chalet','chalet_hotel','hotel')),
  PRIMARY KEY (member_id, type)
);

CREATE TABLE member_airports (
  member_id  TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  iata       TEXT NOT NULL REFERENCES airports(iata),
  PRIMARY KEY (member_id, iata)
);

CREATE TABLE member_weeks (
  member_id        TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  week_start_date  TEXT NOT NULL REFERENCES weeks(start_date),
  rank             INTEGER NOT NULL,
  PRIMARY KEY (member_id, week_start_date)
);

-- ---------------------------------------------------------------- auth & settings
CREATE TABLE trip_settings (
  key    TEXT PRIMARY KEY,
  value  TEXT                                -- json-encoded
);

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,              -- sha-256 of the cookie token
  member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at  TEXT NOT NULL
);
CREATE INDEX sessions_member ON sessions(member_id);

CREATE TABLE magic_links (
  token_hash  TEXT PRIMARY KEY,
  email       TEXT NOT NULL COLLATE NOCASE,
  ip          TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at  TEXT NOT NULL,
  used_at     TEXT
);
CREATE INDEX magic_links_email ON magic_links(email, created_at);
CREATE INDEX magic_links_ip ON magic_links(ip, created_at);

-- ---------------------------------------------------------------- deal sources
CREATE TABLE sources (
  id                    TEXT PRIMARY KEY,    -- slug, matches adapter id
  name                  TEXT NOT NULL,
  type                  TEXT NOT NULL CHECK (type IN ('operator','agent','independent')),
  base_url              TEXT NOT NULL,
  enabled               INTEGER NOT NULL DEFAULT 0,
  logging_enabled       INTEGER NOT NULL DEFAULT 0,
  research_note         TEXT,
  last_run_at           TEXT,
  last_status           TEXT,
  last_error            TEXT,
  runs_total            INTEGER NOT NULL DEFAULT 0,
  runs_ok               INTEGER NOT NULL DEFAULT 0,
  consecutive_failures  INTEGER NOT NULL DEFAULT 0,
  blocked               INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE deals (
  id                     TEXT PRIMARY KEY,
  source_id              TEXT NOT NULL REFERENCES sources(id),
  source_type            TEXT NOT NULL,
  external_ref           TEXT NOT NULL,         -- stable product key per source
  url                    TEXT NOT NULL,
  resort_id              TEXT REFERENCES resorts(id),
  resort_name_raw        TEXT NOT NULL,
  country                TEXT,
  accommodation_name     TEXT NOT NULL,
  accommodation_type     TEXT NOT NULL CHECK (accommodation_type IN ('catered_chalet','chalet_hotel','hotel')),
  board_basis            TEXT,
  departure_airport      TEXT,
  departure_date         TEXT NOT NULL,
  nights                 INTEGER NOT NULL,
  price_pp_gbp           REAL NOT NULL,
  was_price_pp_gbp       REAL,
  first_price_pp_gbp     REAL NOT NULL,
  price_basis_notes      TEXT,
  includes_flights       INTEGER NOT NULL DEFAULT 1,
  includes_transfers     INTEGER NOT NULL DEFAULT 1,
  includes_lift_pass     INTEGER NOT NULL DEFAULT 0,
  extras                 TEXT NOT NULL DEFAULT '[]',
  rooms_available        INTEGER,               -- pax capacity if the source shows it
  first_seen_at          TEXT NOT NULL,
  last_seen_at           TEXT NOT NULL,
  last_price_change_at   TEXT,
  is_available           INTEGER NOT NULL DEFAULT 1,
  raw_snapshot_r2_key    TEXT,
  extraction_confidence  REAL,
  blurb                  TEXT,
  hidden                 INTEGER NOT NULL DEFAULT 0,
  pinned                 INTEGER NOT NULL DEFAULT 0,
  booked                 INTEGER NOT NULL DEFAULT 0,
  UNIQUE (source_id, external_ref)
);
CREATE INDEX deals_date ON deals(departure_date);

CREATE TABLE deal_price_history (
  deal_id       TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  price_pp_gbp  REAL NOT NULL,
  captured_at   TEXT NOT NULL
);
CREATE INDEX deal_price_history_deal ON deal_price_history(deal_id, captured_at);

CREATE TABLE upvotes (
  deal_id     TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (deal_id, member_id)
);

-- ---------------------------------------------------------------- price logging (section 9c)
CREATE TABLE price_snapshots (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  product_key     TEXT NOT NULL,               -- stable per source, see sources/*.ts
  source_id       TEXT NOT NULL REFERENCES sources(id),
  resort          TEXT NOT NULL,
  resort_id       TEXT REFERENCES resorts(id),
  country         TEXT,
  accommodation   TEXT NOT NULL,
  accommodation_type TEXT,
  board_basis     TEXT,
  departure_date  TEXT NOT NULL,
  airport         TEXT,
  nights          INTEGER,
  price_pp_gbp    REAL NOT NULL,
  was_price_pp_gbp REAL,
  available       INTEGER NOT NULL DEFAULT 1,
  url             TEXT,
  captured_at     TEXT NOT NULL,
  captured_day    TEXT NOT NULL,               -- YYYY-MM-DD, one row per product per day
  UNIQUE (product_key, captured_day)
);
CREATE INDEX price_snapshots_departure ON price_snapshots(departure_date, country);
CREATE INDEX price_snapshots_product ON price_snapshots(product_key, captured_at);

CREATE TABLE scan_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id    TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('logging','deals','manual')),
  started_at   TEXT NOT NULL,
  finished_at  TEXT,
  status       TEXT,                           -- ok | error | blocked | skipped
  items        INTEGER NOT NULL DEFAULT 0,
  pages        INTEGER NOT NULL DEFAULT 0,
  error        TEXT
);
CREATE INDEX scan_runs_source ON scan_runs(source_id, started_at);

CREATE TABLE historical_deals (
  id                     TEXT PRIMARY KEY,
  source_name            TEXT NOT NULL,
  archive_url            TEXT NOT NULL,
  captured_on            TEXT NOT NULL,
  resort_raw             TEXT,
  resort_id              TEXT REFERENCES resorts(id),
  country                TEXT,
  accommodation_raw      TEXT,
  departure_date         TEXT,
  days_before_departure  INTEGER,
  price_pp_gbp           REAL,
  was_price_pp_gbp       REAL,
  notes                  TEXT
);

-- ---------------------------------------------------------------- chat, alerts, ops
CREATE TABLE chat_messages (
  id          TEXT PRIMARY KEY,
  member_id   TEXT REFERENCES members(id) ON DELETE SET NULL,
  body        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'user' CHECK (kind IN ('user','system','deal_share')),
  deal_id     TEXT REFERENCES deals(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL,
  edited_at   TEXT,
  deleted_at  TEXT
);
CREATE INDEX chat_messages_created ON chat_messages(created_at);

CREATE TABLE alerts_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  kind      TEXT NOT NULL,
  channel   TEXT NOT NULL,
  recipient TEXT,
  payload   TEXT,
  sent_at   TEXT NOT NULL,
  status    TEXT NOT NULL
);

CREATE TABLE ai_usage_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  job            TEXT NOT NULL,
  model          TEXT NOT NULL,
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  cost_estimate  REAL NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE ai_cache (
  key         TEXT PRIMARY KEY,               -- job + snapshot hash
  value       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
