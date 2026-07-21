CREATE TABLE IF NOT EXISTS "customer_email_delivery" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "kind" text NOT NULL,
  "dedupe_key" text NOT NULL,
  "reference_id" text,
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
  "updated_at" integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS "uidx_customer_email_delivery_dedupe_key"
  ON "customer_email_delivery" ("dedupe_key");
CREATE INDEX IF NOT EXISTS "idx_customer_email_delivery_status"
  ON "customer_email_delivery" ("status", "attempts", "updated_at");
CREATE INDEX IF NOT EXISTS "idx_customer_email_delivery_user_kind"
  ON "customer_email_delivery" ("user_id", "kind");
