CREATE TABLE IF NOT EXISTS "video_unlock" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "task_id" text NOT NULL,
  "asset_id" text NOT NULL,
  "order_no" text NOT NULL,
  "product_id" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_at" integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
  "updated_at" integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
  "unlocked_at" integer,
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY ("task_id") REFERENCES "ai_task"("id") ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY ("asset_id") REFERENCES "media_asset"("id") ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS "uidx_video_unlock_order"
  ON "video_unlock" ("order_no");
CREATE INDEX IF NOT EXISTS "idx_video_unlock_user_task_asset"
  ON "video_unlock" ("user_id", "task_id", "asset_id");
CREATE INDEX IF NOT EXISTS "idx_video_unlock_task"
  ON "video_unlock" ("task_id", "status");
CREATE INDEX IF NOT EXISTS "idx_video_unlock_asset"
  ON "video_unlock" ("asset_id", "status");
