-- BabyBoogey production D1 schema snapshot
-- Database: babyboogey-db
-- Generated: 2026-05-05
-- Source: sqlite_master DDL only; no production data included.

-- TABLE: _cf_KV
CREATE TABLE _cf_KV (
        key TEXT PRIMARY KEY,
        value BLOB
      ) WITHOUT ROWID;

-- TABLE: account
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

-- TABLE: ai_task
CREATE TABLE `ai_task` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`media_type` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`prompt` text NOT NULL,
	`options` text,
	`status` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`deleted_at` integer,
	`task_id` text,
	`task_info` text,
	`task_result` text,
	`cost_credits` integer DEFAULT 0 NOT NULL,
	`scene` text DEFAULT '' NOT NULL,
	`credit_id` text, watermark_applied INTEGER NOT NULL DEFAULT 0, watermark_mode TEXT NOT NULL DEFAULT 'dynamic_overlay', watermarked_asset_id TEXT, `refunded_at` integer, `refund_reason` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

-- TABLE: apikey
CREATE TABLE `apikey` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

-- TABLE: chat
CREATE TABLE `chat` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`model` text NOT NULL,
	`provider` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`parts` text NOT NULL,
	`metadata` text,
	`content` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

-- TABLE: chat_message
CREATE TABLE `chat_message` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`role` text NOT NULL,
	`parts` text NOT NULL,
	`metadata` text,
	`model` text NOT NULL,
	`provider` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chat_id`) REFERENCES `chat`(`id`) ON UPDATE no action ON DELETE cascade
);

-- TABLE: config
CREATE TABLE `config` (
	`name` text NOT NULL,
	`value` text
);

-- TABLE: credit
CREATE TABLE `credit` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`user_email` text,
	`order_no` text,
	`subscription_no` text,
	`transaction_no` text NOT NULL,
	`transaction_type` text NOT NULL,
	`transaction_scene` text,
	`credits` integer NOT NULL,
	`remaining_credits` integer DEFAULT 0 NOT NULL,
	`description` text,
	`expires_at` integer,
	`status` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`deleted_at` integer,
	`consumed_detail` text,
	`metadata` text, "signup_ip" text, "claim_ip" text, "claim_country" text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

-- TABLE: d1_migrations
CREATE TABLE d1_migrations(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- TABLE: media_asset
CREATE TABLE `media_asset` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`purpose` text NOT NULL,
	`media_type` text NOT NULL,
	`provider` text,
	`bucket` text,
	`object_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer,
	`checksum_sha256` text,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`linked_task_id` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`expires_at` integer
);

-- TABLE: order
CREATE TABLE `order` (
	`id` text PRIMARY KEY NOT NULL,
	`order_no` text NOT NULL,
	`user_id` text NOT NULL,
	`user_email` text,
	`status` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`product_id` text,
	`payment_type` text,
	`payment_interval` text,
	`payment_provider` text NOT NULL,
	`payment_session_id` text,
	`checkout_info` text NOT NULL,
	`checkout_result` text,
	`payment_result` text,
	`discount_code` text,
	`discount_amount` integer,
	`discount_currency` text,
	`payment_email` text,
	`payment_amount` integer,
	`payment_currency` text,
	`paid_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`deleted_at` integer,
	`description` text,
	`product_name` text,
	`subscription_id` text,
	`subscription_result` text,
	`checkout_url` text,
	`callback_url` text,
	`credits_amount` integer,
	`credits_valid_days` integer,
	`plan_name` text,
	`payment_product_id` text,
	`invoice_id` text,
	`invoice_url` text,
	`subscription_no` text,
	`transaction_id` text,
	`payment_user_name` text,
	`payment_user_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

-- TABLE: payment_audit_log
CREATE TABLE "payment_audit_log" (
  "id" text PRIMARY KEY NOT NULL,
  "actor_user_id" text,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "provider" text,
  "payload" text,
  "created_at" integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);

-- TABLE: payment_event
CREATE TABLE "payment_event" (
  "id" text PRIMARY KEY NOT NULL,
  "provider" text NOT NULL,
  "event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "resource_id" text,
  "status" text NOT NULL,
  "order_no" text,
  "subscription_no" text,
  "transaction_id" text,
  "payload" text,
  "error_message" text,
  "processed_at" integer,
  "created_at" integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
  "updated_at" integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);

-- TABLE: payment_refund
CREATE TABLE "payment_refund" (
  "id" text PRIMARY KEY NOT NULL,
  "provider" text NOT NULL,
  "refund_id" text NOT NULL,
  "order_no" text NOT NULL,
  "transaction_id" text,
  "amount" integer,
  "currency" text,
  "status" text NOT NULL,
  "reason" text,
  "metadata" text,
  "reversed_at" integer,
  "created_at" integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
  "updated_at" integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);

-- TABLE: permission
CREATE TABLE `permission` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`resource` text NOT NULL,
	`action` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);

-- TABLE: post
CREATE TABLE `post` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`parent_id` text,
	`slug` text NOT NULL,
	`type` text NOT NULL,
	`title` text,
	`description` text,
	`image` text,
	`content` text,
	`categories` text,
	`tags` text,
	`author_name` text,
	`author_image` text,
	`status` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`deleted_at` integer,
	`sort` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

-- TABLE: role
CREATE TABLE `role` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL
);

-- TABLE: role_permission
CREATE TABLE `role_permission` (
	`id` text PRIMARY KEY NOT NULL,
	`role_id` text NOT NULL,
	`permission_id` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`role_id`) REFERENCES `role`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`permission_id`) REFERENCES `permission`(`id`) ON UPDATE no action ON DELETE cascade
);

-- TABLE: session
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

-- TABLE: subscription
CREATE TABLE `subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_no` text NOT NULL,
	`user_id` text NOT NULL,
	`user_email` text,
	`status` text NOT NULL,
	`payment_provider` text NOT NULL,
	`subscription_id` text NOT NULL,
	`subscription_result` text,
	`product_id` text,
	`description` text,
	`amount` integer,
	`currency` text,
	`interval` text,
	`interval_count` integer,
	`trial_period_days` integer,
	`current_period_start` integer,
	`current_period_end` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`deleted_at` integer,
	`plan_name` text,
	`billing_url` text,
	`product_name` text,
	`credits_amount` integer,
	`credits_valid_days` integer,
	`payment_product_id` text,
	`payment_user_id` text,
	`canceled_at` integer,
	`canceled_end_at` integer,
	`canceled_reason` text,
	`canceled_reason_type` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

-- TABLE: subscription_plan_change
CREATE TABLE "subscription_plan_change" (
  "id" text PRIMARY KEY NOT NULL,
  "subscription_no" text NOT NULL,
  "user_id" text NOT NULL,
  "provider" text NOT NULL,
  "provider_subscription_id" text NOT NULL,
  "from_product_id" text,
  "to_product_id" text NOT NULL,
  "from_payment_product_id" text,
  "to_payment_product_id" text NOT NULL,
  "change_type" text NOT NULL,
  "status" text NOT NULL,
  "approval_url" text,
  "effective_at" integer,
  "metadata" text,
  "created_at" integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
  "updated_at" integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);

-- TABLE: taxonomy
CREATE TABLE `taxonomy` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`parent_id` text,
	`slug` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`image` text,
	`icon` text,
	`status` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`deleted_at` integer,
	`sort` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

-- TABLE: user
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`utm_source` text DEFAULT '' NOT NULL,
	`ip` text DEFAULT '' NOT NULL,
	`locale` text DEFAULT '' NOT NULL
);

-- TABLE: user_role
CREATE TABLE `user_role` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`expires_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `role`(`id`) ON UPDATE no action ON DELETE cascade
);

-- TABLE: verification
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);

-- TABLE: video_unlock
CREATE TABLE "video_unlock" (
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

-- INDEX: config_name_unique
CREATE UNIQUE INDEX `config_name_unique` ON `config` (`name`);

-- INDEX: credit_transaction_no_unique
CREATE UNIQUE INDEX `credit_transaction_no_unique` ON `credit` (`transaction_no`);

-- INDEX: idx_account_provider_account
CREATE INDEX `idx_account_provider_account` ON `account` (`provider_id`,`account_id`);

-- INDEX: idx_account_user_id
CREATE INDEX `idx_account_user_id` ON `account` (`user_id`);

-- INDEX: idx_ai_task_media_type_status
CREATE INDEX `idx_ai_task_media_type_status` ON `ai_task` (`media_type`,`status`);

-- INDEX: idx_ai_task_user_media_type
CREATE INDEX `idx_ai_task_user_media_type` ON `ai_task` (`user_id`,`media_type`);

-- INDEX: idx_apikey_key_status
CREATE INDEX `idx_apikey_key_status` ON `apikey` (`key`,`status`);

-- INDEX: idx_apikey_user_status
CREATE INDEX `idx_apikey_user_status` ON `apikey` (`user_id`,`status`);

-- INDEX: idx_chat_message_chat_id
CREATE INDEX `idx_chat_message_chat_id` ON `chat_message` (`chat_id`,`status`);

-- INDEX: idx_chat_message_user_id
CREATE INDEX `idx_chat_message_user_id` ON `chat_message` (`user_id`,`status`);

-- INDEX: idx_chat_user_status
CREATE INDEX `idx_chat_user_status` ON `chat` (`user_id`,`status`);

-- INDEX: idx_credit_claim_ip_created_at
CREATE INDEX "idx_credit_claim_ip_created_at" ON "credit" ("claim_ip","created_at");

-- INDEX: idx_credit_consume_fifo
CREATE INDEX `idx_credit_consume_fifo` ON `credit` (`user_id`,`status`,`transaction_type`,`remaining_credits`,`expires_at`);

-- INDEX: idx_credit_order_no
CREATE INDEX `idx_credit_order_no` ON `credit` (`order_no`);

-- INDEX: idx_credit_signup_ip_created_at
CREATE INDEX "idx_credit_signup_ip_created_at" ON "credit" ("signup_ip","created_at");

-- INDEX: idx_credit_subscription_no
CREATE INDEX `idx_credit_subscription_no` ON `credit` (`subscription_no`);

-- INDEX: idx_media_asset_checksum
CREATE INDEX `idx_media_asset_checksum` ON `media_asset` (`checksum_sha256`);

-- INDEX: idx_media_asset_linked_task
CREATE INDEX `idx_media_asset_linked_task` ON `media_asset` (`linked_task_id`);

-- INDEX: idx_media_asset_owner
CREATE INDEX `idx_media_asset_owner` ON `media_asset` (`owner_type`,`owner_id`);

-- INDEX: idx_media_asset_purpose_created
CREATE INDEX `idx_media_asset_purpose_created` ON `media_asset` (`purpose`,`created_at`);

-- INDEX: idx_media_asset_status_expires
CREATE INDEX `idx_media_asset_status_expires` ON `media_asset` (`status`,`expires_at`);

-- INDEX: idx_order_created_at
CREATE INDEX `idx_order_created_at` ON `order` (`created_at`);

-- INDEX: idx_order_transaction_provider
CREATE INDEX `idx_order_transaction_provider` ON `order` (`transaction_id`,`payment_provider`);

-- INDEX: idx_order_user_status_payment_type
CREATE INDEX `idx_order_user_status_payment_type` ON `order` (`user_id`,`status`,`payment_type`);

-- INDEX: idx_payment_audit_actor
CREATE INDEX "idx_payment_audit_actor"
  ON "payment_audit_log" ("actor_user_id", "created_at");

-- INDEX: idx_payment_audit_target
CREATE INDEX "idx_payment_audit_target"
  ON "payment_audit_log" ("target_type", "target_id");

-- INDEX: idx_payment_event_resource
CREATE INDEX "idx_payment_event_resource"
  ON "payment_event" ("provider", "resource_id");

-- INDEX: idx_payment_event_status
CREATE INDEX "idx_payment_event_status"
  ON "payment_event" ("status", "created_at");

-- INDEX: idx_payment_refund_order
CREATE INDEX "idx_payment_refund_order"
  ON "payment_refund" ("order_no");

-- INDEX: idx_permission_resource_action
CREATE INDEX `idx_permission_resource_action` ON `permission` (`resource`,`action`);

-- INDEX: idx_post_type_status
CREATE INDEX `idx_post_type_status` ON `post` (`type`,`status`);

-- INDEX: idx_role_permission_role_permission
CREATE INDEX `idx_role_permission_role_permission` ON `role_permission` (`role_id`,`permission_id`);

-- INDEX: idx_role_status
CREATE INDEX `idx_role_status` ON `role` (`status`);

-- INDEX: idx_session_user_expires
CREATE INDEX `idx_session_user_expires` ON `session` (`user_id`,`expires_at`);

-- INDEX: idx_subscription_created_at
CREATE INDEX `idx_subscription_created_at` ON `subscription` (`created_at`);

-- INDEX: idx_subscription_plan_change_effective
CREATE INDEX "idx_subscription_plan_change_effective"
  ON "subscription_plan_change" ("effective_at");

-- INDEX: idx_subscription_plan_change_subscription
CREATE INDEX "idx_subscription_plan_change_subscription"
  ON "subscription_plan_change" ("subscription_no", "status");

-- INDEX: idx_subscription_provider_id
CREATE INDEX `idx_subscription_provider_id` ON `subscription` (`subscription_id`,`payment_provider`);

-- INDEX: idx_subscription_user_status_interval
CREATE INDEX `idx_subscription_user_status_interval` ON `subscription` (`user_id`,`status`,`interval`);

-- INDEX: idx_taxonomy_type_status
CREATE INDEX `idx_taxonomy_type_status` ON `taxonomy` (`type`,`status`);

-- INDEX: idx_user_created_at
CREATE INDEX `idx_user_created_at` ON `user` (`created_at`);

-- INDEX: idx_user_name
CREATE INDEX `idx_user_name` ON `user` (`name`);

-- INDEX: idx_user_role_user_expires
CREATE INDEX `idx_user_role_user_expires` ON `user_role` (`user_id`,`expires_at`);

-- INDEX: idx_verification_identifier
CREATE INDEX `idx_verification_identifier` ON `verification` (`identifier`);

-- INDEX: idx_video_unlock_asset
CREATE INDEX "idx_video_unlock_asset"
  ON "video_unlock" ("asset_id", "status");

-- INDEX: idx_video_unlock_task
CREATE INDEX "idx_video_unlock_task"
  ON "video_unlock" ("task_id", "status");

-- INDEX: idx_video_unlock_user_task_asset
CREATE INDEX "idx_video_unlock_user_task_asset"
  ON "video_unlock" ("user_id", "task_id", "asset_id");

-- INDEX: order_order_no_unique
CREATE UNIQUE INDEX `order_order_no_unique` ON `order` (`order_no`);

-- INDEX: permission_code_unique
CREATE UNIQUE INDEX `permission_code_unique` ON `permission` (`code`);

-- INDEX: post_slug_unique
CREATE UNIQUE INDEX `post_slug_unique` ON `post` (`slug`);

-- INDEX: role_name_unique
CREATE UNIQUE INDEX `role_name_unique` ON `role` (`name`);

-- INDEX: session_token_unique
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);

-- INDEX: subscription_subscription_no_unique
CREATE UNIQUE INDEX `subscription_subscription_no_unique` ON `subscription` (`subscription_no`);

-- INDEX: taxonomy_slug_unique
CREATE UNIQUE INDEX `taxonomy_slug_unique` ON `taxonomy` (`slug`);

-- INDEX: uidx_payment_event_provider_event
CREATE UNIQUE INDEX "uidx_payment_event_provider_event"
  ON "payment_event" ("provider", "event_id");

-- INDEX: uidx_payment_refund_provider_refund
CREATE UNIQUE INDEX "uidx_payment_refund_provider_refund"
  ON "payment_refund" ("provider", "refund_id");

-- INDEX: uidx_video_unlock_order
CREATE UNIQUE INDEX "uidx_video_unlock_order"
  ON "video_unlock" ("order_no");

-- INDEX: user_email_unique
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);
