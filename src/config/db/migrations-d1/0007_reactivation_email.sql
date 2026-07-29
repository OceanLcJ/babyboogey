ALTER TABLE "customer_email_delivery" ADD COLUMN "headers" text;

CREATE TABLE IF NOT EXISTS "customer_email_preference" (
  "user_id" text PRIMARY KEY NOT NULL,
  "marketing_opt_out_at" integer,
  "created_at" integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
  "updated_at" integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON UPDATE no action ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "idx_customer_email_preference_opt_out"
  ON "customer_email_preference" ("marketing_opt_out_at");
