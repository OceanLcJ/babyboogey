CREATE TABLE IF NOT EXISTS "rate_limit" (
  "id" text PRIMARY KEY NOT NULL,
  "key" text NOT NULL,
  "count" integer DEFAULT 0 NOT NULL,
  "last_request" integer DEFAULT 0 NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_rate_limit_key" ON "rate_limit" ("key");
