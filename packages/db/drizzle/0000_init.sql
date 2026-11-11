CREATE SCHEMA "app";
--> statement-breakpoint
CREATE SCHEMA "chain";
--> statement-breakpoint
CREATE TABLE "app"."author_labels" (
	"subject" text NOT NULL,
	"label" text NOT NULL,
	"score" real NOT NULL,
	"labeler" text NOT NULL,
	"batch" text NOT NULL,
	CONSTRAINT "author_labels_subject_label_labeler_pk" PRIMARY KEY("subject","label","labeler")
);
--> statement-breakpoint
CREATE TABLE "app"."blocklist" (
	"subject" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."builder_stats" (
	"address" text PRIMARY KEY NOT NULL,
	"contracts_deployed" integer NOT NULL,
	"chains" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."compile_cache" (
	"hash" text PRIMARY KEY NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chain"."delegates" (
	"owner" text NOT NULL,
	"key" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"added_at" bigint NOT NULL,
	CONSTRAINT "delegates_owner_key_pk" PRIMARY KEY("owner","key")
);
--> statement-breakpoint
CREATE TABLE "app"."events" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"subject" text,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."fc_links" (
	"fid" integer NOT NULL,
	"target_fid" integer NOT NULL,
	CONSTRAINT "fc_links_fid_target_fid_pk" PRIMARY KEY("fid","target_fid")
);
--> statement-breakpoint
CREATE TABLE "app"."fc_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"fid" integer NOT NULL,
	"author_address" text,
	"text" text NOT NULL,
	"channel" text,
	"parent_id" text,
	"created_at" bigint NOT NULL,
	"reactions" integer DEFAULT 0 NOT NULL,
	"replies" integer DEFAULT 0 NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."fc_users" (
	"fid" integer PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text,
	"pfp_url" text,
	"bio" text,
	"addresses" text[] DEFAULT '{}'::text[] NOT NULL,
	"follower_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chain"."follows" (
	"follower" text NOT NULL,
	"target" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "follows_follower_target_pk" PRIMARY KEY("follower","target")
);
--> statement-breakpoint
CREATE TABLE "chain"."indexer_state" (
	"id" text PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"last_block" bigint NOT NULL,
	"head_block" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."label_batches" (
	"digest" text PRIMARY KEY NOT NULL,
	"labeler" text NOT NULL,
	"issued_at" bigint NOT NULL,
	"signature" text NOT NULL,
	"items" integer NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."labels" (
	"post_id" text NOT NULL,
	"label" text NOT NULL,
	"score" real NOT NULL,
	"labeler" text NOT NULL,
	"batch" text NOT NULL,
	CONSTRAINT "labels_post_id_label_labeler_pk" PRIMARY KEY("post_id","label","labeler")
);
--> statement-breakpoint
CREATE TABLE "app"."notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient" text NOT NULL,
	"kind" text NOT NULL,
	"actor" text NOT NULL,
	"post_id" text,
	"created_at" bigint NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_dedup" UNIQUE NULLS NOT DISTINCT("recipient","kind","actor","post_id")
);
--> statement-breakpoint
CREATE TABLE "chain"."payments" (
	"id" text PRIMARY KEY NOT NULL,
	"user" text NOT NULL,
	"plan_id" integer NOT NULL,
	"amount" text NOT NULL,
	"paid_until" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"tx_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."pending_follows" (
	"owner" text NOT NULL,
	"target_fid" integer NOT NULL,
	"username" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_follows_owner_target_fid_pk" PRIMARY KEY("owner","target_fid")
);
--> statement-breakpoint
CREATE TABLE "chain"."posts" (
	"id" text PRIMARY KEY NOT NULL,
	"author" text NOT NULL,
	"parent_id" text,
	"root_id" text NOT NULL,
	"channel" text,
	"text" text NOT NULL,
	"meta" text DEFAULT '0x' NOT NULL,
	"mentions" text[] DEFAULT '{}'::text[] NOT NULL,
	"hashtags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" bigint NOT NULL,
	"block_number" bigint NOT NULL,
	"tx_hash" text NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."profiles" (
	"address" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"bio" text,
	"avatar_url" text,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chain"."reactions" (
	"actor" text NOT NULL,
	"post_id" text NOT NULL,
	"kind" integer NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "reactions_actor_post_id_kind_pk" PRIMARY KEY("actor","post_id","kind")
);
--> statement-breakpoint
CREATE TABLE "app"."reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"reporter" text NOT NULL,
	"post_id" text NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."saved_feeds" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"spec" jsonb NOT NULL,
	"nl_text" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"forked_from" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."usage" (
	"address" text NOT NULL,
	"day" text NOT NULL,
	"kind" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_address_day_kind_pk" PRIMARY KEY("address","day","kind")
);
--> statement-breakpoint
CREATE TABLE "app"."user_fc" (
	"address" text PRIMARY KEY NOT NULL,
	"fid" integer NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."user_settings" (
	"address" text PRIMARY KEY NOT NULL,
	"feeds" text[] DEFAULT '{}'::text[] NOT NULL,
	"moderation" text[] DEFAULT '{mod:safety}'::text[] NOT NULL,
	"muted_authors" text[] DEFAULT '{}'::text[] NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"analytics_opt_out" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chain"."users" (
	"address" text PRIMARY KEY NOT NULL,
	"handle" text,
	"profile_uri" text DEFAULT '' NOT NULL,
	"registered_at" bigint NOT NULL,
	"block_number" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."worker_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "delegates_key_idx" ON "chain"."delegates" USING btree ("key");--> statement-breakpoint
CREATE INDEX "events_name_idx" ON "app"."events" USING btree ("name","created_at");--> statement-breakpoint
CREATE INDEX "events_subject_idx" ON "app"."events" USING btree ("subject","created_at");--> statement-breakpoint
CREATE INDEX "fc_posts_fid_idx" ON "app"."fc_posts" USING btree ("fid","created_at");--> statement-breakpoint
CREATE INDEX "fc_posts_channel_idx" ON "app"."fc_posts" USING btree ("channel","created_at");--> statement-breakpoint
CREATE INDEX "fc_posts_created_idx" ON "app"."fc_posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "follows_target_idx" ON "chain"."follows" USING btree ("target");--> statement-breakpoint
CREATE INDEX "labels_label_idx" ON "app"."labels" USING btree ("label");--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "app"."notifications" USING btree ("recipient","created_at");--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "chain"."payments" USING btree ("user","plan_id");--> statement-breakpoint
CREATE INDEX "posts_author_idx" ON "chain"."posts" USING btree ("author","created_at");--> statement-breakpoint
CREATE INDEX "posts_parent_idx" ON "chain"."posts" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "posts_root_idx" ON "chain"."posts" USING btree ("root_id");--> statement-breakpoint
CREATE INDEX "posts_channel_idx" ON "chain"."posts" USING btree ("channel","created_at");--> statement-breakpoint
CREATE INDEX "posts_created_idx" ON "chain"."posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "reactions_post_idx" ON "chain"."reactions" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "app"."reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "saved_feeds_owner_idx" ON "app"."saved_feeds" USING btree ("owner");--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_idx" ON "chain"."users" USING btree ("handle");