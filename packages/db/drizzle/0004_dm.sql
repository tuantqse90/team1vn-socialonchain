CREATE TABLE "app"."dm_keys" (
	"address" text NOT NULL,
	"public_key" text NOT NULL,
	"signature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dm_keys_address_public_key_pk" PRIMARY KEY("address","public_key")
);
--> statement-breakpoint
CREATE TABLE "app"."dm_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"pair" text NOT NULL,
	"sender" text NOT NULL,
	"recipient" text NOT NULL,
	"sender_key" text NOT NULL,
	"recipient_key" text NOT NULL,
	"nonce" text NOT NULL,
	"ciphertext" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."dm_threads" (
	"owner" text NOT NULL,
	"peer" text NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"last_message_id" integer DEFAULT 0 NOT NULL,
	"last_incoming_id" integer DEFAULT 0 NOT NULL,
	"last_read_id" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dm_threads_owner_peer_pk" PRIMARY KEY("owner","peer")
);
--> statement-breakpoint
CREATE INDEX "dm_keys_addr_idx" ON "app"."dm_keys" USING btree ("address","created_at");--> statement-breakpoint
CREATE INDEX "dm_messages_pair_idx" ON "app"."dm_messages" USING btree ("pair","id");--> statement-breakpoint
CREATE INDEX "dm_messages_sender_idx" ON "app"."dm_messages" USING btree ("sender","created_at");--> statement-breakpoint
CREATE INDEX "dm_threads_owner_idx" ON "app"."dm_threads" USING btree ("owner","last_message_id");