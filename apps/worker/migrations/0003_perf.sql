-- Anonymous frame timings from drivers who opted in (ADR-0027). No position, no id, no
-- nickname: what a screen is and how the app runs on it. Pruned after 30 days.
CREATE TABLE IF NOT EXISTS perf_samples (
  at        INTEGER NOT NULL,
  dpr       REAL    NOT NULL,
  tesla     INTEGER NOT NULL,
  chromium  INTEGER NOT NULL,
  width     INTEGER NOT NULL,
  height    INTEGER NOT NULL,
  mean_ms   REAL    NOT NULL,
  p95_ms    REAL    NOT NULL,
  samples   INTEGER NOT NULL,
  half_rate INTEGER NOT NULL,
  low_res   INTEGER NOT NULL,
  cars      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS perf_samples_at ON perf_samples (at);
