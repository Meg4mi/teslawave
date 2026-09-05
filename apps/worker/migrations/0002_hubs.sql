-- Which hub Durable Objects exist, so the daily cron can harvest each one. A namespace
-- cannot be listed; the edge writes a hub down the first time it sees it. At most 1,024 rows.
CREATE TABLE IF NOT EXISTS hubs (
  hub        TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL
);
