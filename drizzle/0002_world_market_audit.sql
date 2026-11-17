CREATE TABLE "change_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"changes" jsonb NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "buyback_quotes" ADD COLUMN "quote_kind" text DEFAULT 'PRICE_LIST' NOT NULL;--> statement-breakpoint
ALTER TABLE "buyback_quotes" ADD COLUMN "retracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "buyback_quotes" ADD COLUMN "retract_reason" text;--> statement-breakpoint
ALTER TABLE "market_observations" ADD COLUMN "country" text DEFAULT 'JP' NOT NULL;--> statement-breakpoint
ALTER TABLE "market_observations" ADD COLUMN "currency" text DEFAULT 'JPY' NOT NULL;--> statement-breakpoint
ALTER TABLE "market_observations" ADD COLUMN "price_local" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "market_observations" ADD COLUMN "fx_jpy_per_unit" numeric(18, 8);--> statement-breakpoint
ALTER TABLE "market_observations" ADD COLUMN "retracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "market_observations" ADD COLUMN "retract_reason" text;--> statement-breakpoint
ALTER TABLE "retail_prices" ADD COLUMN "retracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "retail_prices" ADD COLUMN "retract_reason" text;--> statement-breakpoint
CREATE INDEX "change_log_entity_idx" ON "change_log" USING btree ("entity","entity_id");