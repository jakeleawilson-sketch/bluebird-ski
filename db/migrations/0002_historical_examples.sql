-- Past-season late deals (HANDOFF 9b): from press/deal-news round-ups now,
-- and from Wayback Machine snapshots once that import runs.
ALTER TABLE historical_deals ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'press' CHECK (source_kind IN ('press','wayback'));
ALTER TABLE historical_deals ADD COLUMN source_title TEXT;
ALTER TABLE historical_deals ADD COLUMN operator TEXT;
ALTER TABLE historical_deals ADD COLUMN accommodation_type TEXT;
ALTER TABLE historical_deals ADD COLUMN board_basis TEXT;
ALTER TABLE historical_deals ADD COLUMN departure_airport TEXT;
ALTER TABLE historical_deals ADD COLUMN nights INTEGER;
ALTER TABLE historical_deals ADD COLUMN price_basis TEXT;
CREATE INDEX historical_deals_departure ON historical_deals(departure_date);
