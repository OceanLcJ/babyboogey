CREATE TABLE IF NOT EXISTS "operator_email_delivery" (
  "id" text PRIMARY KEY NOT NULL,
  "kind" text NOT NULL,
  "dedupe_key" text NOT NULL,
  "report_date" text NOT NULL,
  "recipient" text NOT NULL,
  "subject" text NOT NULL,
  "html" text NOT NULL,
  "text" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 5 NOT NULL,
  "claimed_at" integer,
  "sent_at" integer,
  "provider_message_id" text,
  "last_error" text,
  "created_at" integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
  "updated_at" integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uidx_operator_email_delivery_dedupe_key"
  ON "operator_email_delivery" ("dedupe_key");
CREATE INDEX IF NOT EXISTS "idx_operator_email_delivery_status"
  ON "operator_email_delivery" ("status", "attempts", "updated_at");
CREATE INDEX IF NOT EXISTS "idx_operator_email_delivery_report_date"
  ON "operator_email_delivery" ("report_date");
