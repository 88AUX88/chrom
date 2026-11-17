import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import * as s from "@/db/schema";
import { dedupeKey, validateCsv, type ImportKind, type Row } from "./validate";
import { parseStrictDecimal } from "../money";

const num = (v: string) => parseStrictDecimal(v)!.toString();
const opt = (v: string | undefined) => (v ? v : null);

async function existingKeys(kind: ImportKind): Promise<Set<string>> {
  const db = await getDb();
  const keys = new Set<string>();
  const add = (r: Row) => keys.add(dedupeKey(kind, r));
  if (kind === "products") (await db.select({ id: s.products.id }).from(s.products)).forEach((r) => add({ id: r.id }));
  if (kind === "variants") (await db.select({ id: s.productVariants.id }).from(s.productVariants)).forEach((r) => add({ id: r.id }));
  if (kind === "market_observations") {
    const rows = await db.execute<Row>(sql`select variant_id, platform, kind, country, currency, case when currency = 'JPY' then price_jpy::text else price_local::text end as price_jpy, condition, coalesce(sold_at::text,'') sold_at, observed_at::text, coalesce(external_ref,'') external_ref from market_observations`);
    rows.rows.forEach(add);
  }
  if (kind === "retail_prices") {
    const rows = await db.execute<Row>(sql`select variant_id, country, coalesce(store,'') store, currency, amount::text, observed_at::text, price_kind from retail_prices`);
    rows.rows.forEach(add);
  }
  if (kind === "buyback_quotes") {
    const rows = await db.execute<Row>(sql`select variant_id, shop, price_jpy::text, quoted_at::text observed_at, condition from buyback_quotes`);
    rows.rows.forEach(add);
  }
  if (kind === "fx_rates") {
    const rows = await db.execute<Row>(sql`select currency, as_of::text from fx_rates`);
    rows.rows.forEach(add);
  }
  return keys;
}

export async function importCsv(kind: ImportKind, filename: string, bytes: Uint8Array) {
  const db = await getDb();
  const [products, variants, brands] = await Promise.all([
    db.select({ id: s.products.id, nameEn: s.products.nameEn, nameJaReading: s.products.nameJaReading }).from(s.products),
    db.select({ id: s.productVariants.id }).from(s.productVariants),
    db.select({ id: s.brands.id }).from(s.brands),
  ]);
  const result = validateCsv(kind, bytes, {
    productIds: new Set(products.map((p) => p.id)),
    variantIds: new Set(variants.map((v) => v.id)),
    brandIds: new Set(brands.map((b) => b.id)),
    catalog: products,
    existingKeys: await existingKeys(kind),
    today: new Date().toISOString().slice(0, 10),
  });
  if (result.fileErrors.length) return { batchId: null, ...result };

  const batchId = await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(s.importBatches)
      .values({ kind, filename, rowCount: result.accepted.length + result.quarantine.length, accepted: result.accepted.length, rejected: result.quarantine.length, quarantine: result.quarantine })
      .returning({ id: s.importBatches.id });
    const evidence = async (r: Row, observedAt: string) => {
      const [e] = await tx
        .insert(s.sourceEvidence)
        .values({
          url: opt(r.source_url),
          sourceName: r.source_name,
          sourceType: r.source_type as (typeof s.SOURCE_TYPES)[number],
          reliability: r.reliability as s.Reliability,
          observedAt,
          videoPublishedAt: opt(r.video_published_at),
          videoTimestamp: opt(r.video_timestamp),
          notes: opt(r.evidence_notes),
          importBatchId: batch.id,
        })
        .returning({ id: s.sourceEvidence.id });
      return e.id;
    };
    for (const { data: r } of result.accepted) {
      switch (kind) {
        case "products":
          await tx.insert(s.products).values({
            id: r.id,
            brandId: r.brand_id,
            category: r.category as (typeof s.PRODUCT_CATEGORIES)[number],
            nameEn: r.name_en,
            nameJaReading: r.name_ja_reading,
            officialModelNumber: opt(r.official_model_number),
            catalogStatus: r.catalog_status as (typeof s.CATALOG_STATUS)[number],
            distinguishingFeatures: opt(r.distinguishing_features),
            notes: opt(r.notes),
            sourceUrl: opt(r.source_url),
            verifiedAt: opt(r.verified_at),
          });
          for (const a of (r.aliases ?? "").split("|").map((x) => x.trim()).filter(Boolean))
            await tx.insert(s.productAliases).values({ productId: r.id, alias: a }).onConflictDoNothing();
          break;
        case "variants":
          await tx.insert(s.productVariants).values({
            id: r.id,
            productId: r.product_id,
            material: r.material as s.Material,
            hasStones: r.has_stones === "true",
            stoneType: opt(r.stone_type),
            sizeLabel: opt(r.size_label),
            ringSizeUs: r.ring_size_us ? num(r.ring_size_us) : null,
            lengthInch: r.length_inch ? num(r.length_inch) : null,
            color: opt(r.color),
            catalogStatus: r.catalog_status as (typeof s.CATALOG_STATUS)[number],
          });
          break;
        case "retail_prices":
          await tx.insert(s.retailPrices).values({
            variantId: r.variant_id,
            country: r.country,
            city: opt(r.city),
            store: opt(r.store),
            currency: r.currency,
            amount: num(r.amount),
            priceKind: r.price_kind as (typeof s.RETAIL_PRICE_KINDS)[number],
            taxInclusion: r.tax_inclusion as (typeof s.TAX_INCLUSION)[number],
            observedAt: r.observed_at,
            evidenceId: await evidence(r, r.observed_at),
            importBatchId: batch.id,
          });
          break;
        case "market_observations":
          await tx.insert(s.marketObservations).values({
            variantId: r.variant_id,
            platform: r.platform as (typeof s.MARKET_PLATFORMS)[number],
            kind: r.kind as s.MarketKind,
            ...((r.currency || "JPY") === "JPY"
              ? { priceJpy: num(r.price_jpy), country: r.country || "JP", currency: "JPY" }
              : {
                  priceJpy: parseStrictDecimal(r.price_local)!.times(parseStrictDecimal(r.fx_jpy_per_unit)!).toDecimalPlaces(0).toString(),
                  country: r.country || "JP",
                  currency: r.currency,
                  priceLocal: num(r.price_local),
                  fxJpyPerUnit: num(r.fx_jpy_per_unit),
                }),
            condition: r.condition as s.Condition,
            accessories: opt(r.accessories),
            observedAt: r.observed_at,
            listedAt: opt(r.listed_at),
            soldAt: opt(r.sold_at),
            externalRef: opt(r.external_ref),
            evidenceId: await evidence(r, r.observed_at),
            importBatchId: batch.id,
          });
          break;
        case "buyback_quotes":
          await tx.insert(s.buybackQuotes).values({
            variantId: r.variant_id,
            shop: r.shop,
            quoteKind: (r.quote_kind || "PRICE_LIST") as "PRICE_LIST" | "INDIVIDUAL_APPRAISAL",
            priceJpy: num(r.price_jpy),
            condition: r.condition as s.Condition,
            quotedAt: r.observed_at,
            evidenceId: await evidence(r, r.observed_at),
            importBatchId: batch.id,
          });
          break;
        case "fx_rates":
          await tx.insert(s.fxRates).values({ currency: r.currency, jpyPerUnit: num(r.jpy_per_unit), asOf: new Date(r.as_of), source: r.source });
          break;
      }
    }
    return batch.id;
  });
  return { batchId, ...result };
}
