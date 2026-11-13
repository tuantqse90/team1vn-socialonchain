CREATE TABLE "app"."linked_wallets" (
	"address" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"signature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "linked_wallets_owner_idx" ON "app"."linked_wallets" USING btree ("owner");