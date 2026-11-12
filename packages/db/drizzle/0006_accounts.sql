CREATE TABLE "app"."accounts" (
	"address" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"kdf" jsonb NOT NULL,
	"auth_hash" text NOT NULL,
	"keystore" jsonb NOT NULL,
	"drip_tx" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_handle_unique" UNIQUE("handle")
);
