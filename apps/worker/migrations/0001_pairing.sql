-- Pairing codes carry an identity from a phone to a car screen. Short-lived and single use.
CREATE TABLE IF NOT EXISTS pairing_codes (
  code       TEXT PRIMARY KEY,
  payload    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);
CREATE INDEX IF NOT EXISTS pairing_codes_expires_at ON pairing_codes (expires_at);

-- Aggregate wave counts per cell per day. No positions, no trips, no identities.
CREATE TABLE IF NOT EXISTS daily_stats (
  day   TEXT NOT NULL,
  cell  TEXT NOT NULL,
  waves INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, cell)
);
