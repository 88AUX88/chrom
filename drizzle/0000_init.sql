CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ja" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buyback_quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"variant_id" text NOT NULL,
	"shop" text NOT NULL,
	"price_jpy" numeric(14, 0) NOT NULL,
	"condition" text NOT NULL,
	"quoted_at" date NOT NULL,
	"evidence_id" integer NOT NULL,
	"import_batch_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buying_scenarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"variant_id" text NOT NULL,
	"inputs" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"decision" text NOT NULL,
	"reasons" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"data" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"version" integer NOT NULL,
	"effective_from" date NOT NULL,
	"fee_rate" numeric(8, 6),
	"fixed_fee_jpy" numeric(12, 0) DEFAULT '0' NOT NULL,
	"fee_includes_jct" boolean DEFAULT true NOT NULL,
	"status" text NOT NULL,
	"evidence_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"currency" text NOT NULL,
	"jpy_per_unit" numeric(18, 8) NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"filename" text,
	"row_count" integer NOT NULL,
	"accepted" integer NOT NULL,
	"rejected" integer NOT NULL,
	"quarantine" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"product_id" text,
	"day" integer NOT NULL,
	"prompt" text NOT NULL,
	"choices" jsonb NOT NULL,
	"answer_index" integer NOT NULL,
	"explanation" text NOT NULL,
	"is_illustrative" boolean DEFAULT false NOT NULL,
	"ease" numeric(4, 2) DEFAULT '2.5' NOT NULL,
	"interval_days" integer DEFAULT 0 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_observations" (
	"id" serial PRIMARY KEY NOT NULL,
	"variant_id" text NOT NULL,
	"platform" text NOT NULL,
	"kind" text NOT NULL,
	"price_jpy" numeric(14, 0) NOT NULL,
	"condition" text NOT NULL,
	"accessories" text,
	"observed_at" date NOT NULL,
	"listed_at" date,
	"sold_at" date,
	"external_ref" text,
	"evidence_id" integer NOT NULL,
	"import_batch_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"alias" text NOT NULL,
	"lang" text DEFAULT 'ja' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"variant_id" text,
	"data_url" text,
	"link_url" text,
	"license_status" text NOT NULL,
	"caption" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"material" text NOT NULL,
	"has_stones" boolean DEFAULT false NOT NULL,
	"stone_type" text,
	"size_label" text,
	"ring_size_us" numeric(5, 2),
	"length_inch" numeric(6, 2),
	"color" text,
	"weight_g" numeric(8, 2),
	"weight_evidence_id" integer,
	"catalog_status" text DEFAULT 'UNVERIFIED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"category" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ja_reading" text NOT NULL,
	"official_model_number" text,
	"catalog_status" text DEFAULT 'UNVERIFIED' NOT NULL,
	"distinguishing_features" text,
	"confusable_with" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"variant_options" jsonb DEFAULT '{"materials":["SILVER_925"],"sizes":[],"stones":[false]}'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"variant_id" text NOT NULL,
	"scenario_id" integer,
	"purchased_at" date NOT NULL,
	"country" text NOT NULL,
	"store" text,
	"currency" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"fx_jpy_per_unit" numeric(18, 8) NOT NULL,
	"total_cost_jpy" numeric(14, 0) NOT NULL,
	"import_ct_jpy" numeric(14, 0) DEFAULT '0' NOT NULL,
	"expected_profit_jpy" numeric(14, 0),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retail_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"variant_id" text NOT NULL,
	"country" text NOT NULL,
	"city" text,
	"store" text,
	"currency" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"price_kind" text NOT NULL,
	"tax_inclusion" text NOT NULL,
	"observed_at" date NOT NULL,
	"evidence_id" integer NOT NULL,
	"import_batch_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_id" integer NOT NULL,
	"platform" text NOT NULL,
	"listed_at" date,
	"sold_at" date NOT NULL,
	"price_jpy" numeric(14, 0) NOT NULL,
	"fees_jpy" numeric(14, 0) NOT NULL,
	"shipping_jpy" numeric(14, 0) DEFAULT '0' NOT NULL,
	"other_costs_jpy" numeric(14, 0) DEFAULT '0' NOT NULL,
	"markdown_count" integer DEFAULT 0 NOT NULL,
	"returned" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"candidates" jsonb NOT NULL,
	"chosen_product_id" text,
	"thumbnail_data_url" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_evidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text,
	"source_name" text NOT NULL,
	"source_type" text NOT NULL,
	"reliability" text NOT NULL,
	"observed_at" date NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"video_published_at" date,
	"video_timestamp" text,
	"notes" text,
	"import_batch_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_assumptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" numeric(18, 6),
	"status" text NOT NULL,
	"evidence_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "buyback_quotes" ADD CONSTRAINT "buyback_quotes_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyback_quotes" ADD CONSTRAINT "buyback_quotes_evidence_id_source_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."source_evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyback_quotes" ADD CONSTRAINT "buyback_quotes_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buying_scenarios" ADD CONSTRAINT "buying_scenarios_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_cards" ADD CONSTRAINT "learning_cards_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_observations" ADD CONSTRAINT "market_observations_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_observations" ADD CONSTRAINT "market_observations_evidence_id_source_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."source_evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_observations" ADD CONSTRAINT "market_observations_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_scenario_id_buying_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."buying_scenarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_prices" ADD CONSTRAINT "retail_prices_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_prices" ADD CONSTRAINT "retail_prices_evidence_id_source_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."source_evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_prices" ADD CONSTRAINT "retail_prices_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_evidence" ADD CONSTRAINT "source_evidence_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fx_currency_idx" ON "fx_rates" USING btree ("currency","as_of");--> statement-breakpoint
CREATE INDEX "market_variant_idx" ON "market_observations" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "aliases_unique" ON "product_aliases" USING btree ("product_id","alias");--> statement-breakpoint
CREATE INDEX "variants_product_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_brand_idx" ON "products" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "retail_variant_idx" ON "retail_prices" USING btree ("variant_id");