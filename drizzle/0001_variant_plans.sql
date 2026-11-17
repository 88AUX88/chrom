CREATE TABLE "variant_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"variant_id" text NOT NULL,
	"purchase_country" text NOT NULL,
	"currency" text NOT NULL,
	"local_price" numeric(14, 2),
	"price_source" text NOT NULL,
	"price_observed_at" date,
	"price_evidence_url" text,
	"price_includes_local_tax" boolean DEFAULT false NOT NULL,
	"local_tax_rate" numeric(8, 6) DEFAULT '0' NOT NULL,
	"hs_code" text,
	"hs_certainty" text DEFAULT 'UNVERIFIED' NOT NULL,
	"hs_evidence_url" text,
	"origin_country" text,
	"origin_certainty" text DEFAULT 'UNVERIFIED' NOT NULL,
	"origin_evidence" text,
	"origin_proof" boolean DEFAULT false NOT NULL,
	"planned_sale_price_jpy" numeric(14, 0),
	"platform" text DEFAULT 'SNKRDUNK' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "variant_plans" ADD CONSTRAINT "variant_plans_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plans_variant_idx" ON "variant_plans" USING btree ("variant_id");