import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import * as s from "@/db/schema";
import { DEFAULT_DECISION_SETTINGS, type DecisionSettings } from "./decide/engine";
import { DEFAULT_EXPENSE_PROFILE, type ExpenseProfileData, variantIdFor } from "./settings-defaults";
import type { BusinessTaxStatus } from "./profit/types";
import type { Observation } from "./market/stats";

export interface ProductFilter {
  q?: string;
  category?: string;
  material?: string;
  status?: string;
}

export async function listProducts(qOrFilter?: string | ProductFilter) {
  const f: ProductFilter = typeof qOrFilter === "string" || qOrFilter === undefined ? { q: qOrFilter } : qOrFilter;
  const db = await getDb();
  const conds = [];
  const term = f.q?.trim();
  if (term) {
    const like = `%${term}%`;
    const aliasHits = await db.select({ id: s.productAliases.productId }).from(s.productAliases).where(ilike(s.productAliases.alias, like));
    const ids = aliasHits.map((a) => a.id);
    conds.push(
      or(
        ilike(s.products.nameEn, like),
        ilike(s.products.nameJaReading, like),
        ilike(s.products.id, like),
        ilike(s.products.officialModelNumber, like),
        ids.length ? inArray(s.products.id, ids) : sql`false`,
      ),
    );
  }
  if (f.category && (s.PRODUCT_CATEGORIES as readonly string[]).includes(f.category)) conds.push(eq(s.products.category, f.category as (typeof s.PRODUCT_CATEGORIES)[number]));
  if (f.status && (s.CATALOG_STATUS as readonly string[]).includes(f.status)) conds.push(eq(s.products.catalogStatus, f.status as (typeof s.CATALOG_STATUS)[number]));
  if (f.material && (s.MATERIALS as readonly string[]).includes(f.material)) conds.push(sql`${s.products.variantOptions}->'materials' ? ${f.material}`);
  return db.select().from(s.products).where(conds.length ? and(...conds) : undefined).orderBy(asc(s.products.category), asc(s.products.nameEn));
}

export async function allAliases() {
  const db = await getDb();
  return db.select().from(s.productAliases);
}

export async function getProduct(id: string) {
  const db = await getDb();
  const [p] = await db.select().from(s.products).where(eq(s.products.id, id));
  if (!p) return null;
  const [variants, images, aliases] = await Promise.all([
    db.select().from(s.productVariants).where(eq(s.productVariants.productId, id)).orderBy(asc(s.productVariants.id)),
    db.select({ id: s.productImages.id, dataUrl: s.productImages.dataUrl, linkUrl: s.productImages.linkUrl, licenseStatus: s.productImages.licenseStatus, caption: s.productImages.caption, variantId: s.productImages.variantId })
      .from(s.productImages).where(eq(s.productImages.productId, id)).orderBy(desc(s.productImages.id)),
    db.select().from(s.productAliases).where(eq(s.productAliases.productId, id)),
  ]);
  return { product: p, variants, images, aliases };
}

export async function firstImageByProduct(): Promise<Map<string, string>> {
  const db = await getDb();
  const rows = await db.execute<{ product_id: string; data_url: string }>(
    sql`select distinct on (product_id) product_id, data_url from product_images where data_url is not null order by product_id, id desc`,
  );
  return new Map(rows.rows.map((r) => [r.product_id, r.data_url]));
}

export async function getVariant(id: string) {
  const db = await getDb();
  const [v] = await db.select().from(s.productVariants).where(eq(s.productVariants.id, id));
  if (!v) return null;
  const [p] = await db.select().from(s.products).where(eq(s.products.id, v.productId));
  return { variant: v, product: p };
}

/** 人間が選択した仕様の variant を作成（既存なら返す） */
export async function ensureVariant(productId: string, material: string, hasStones: boolean, sizeLabel: string | null, stoneType: string | null) {
  const db = await getDb();
  const id = variantIdFor(productId, material, hasStones, sizeLabel);
  if (!(s.MATERIALS as readonly string[]).includes(material)) throw new Error("invalid material");
  const ring = sizeLabel?.match(/^US\s*(\d+(?:\.\d+)?)$/);
  const len = sizeLabel?.match(/^(\d+(?:\.\d+)?)inch$/);
  await db
    .insert(s.productVariants)
    .values({
      id,
      productId,
      material: material as s.Material,
      hasStones,
      stoneType: hasStones ? stoneType || "要確認" : null,
      sizeLabel,
      ringSizeUs: ring ? ring[1] : null,
      lengthInch: len ? len[1] : null,
      catalogStatus: "UNVERIFIED",
    })
    .onConflictDoNothing();
  return id;
}

export async function retailPricesFor(variantId: string) {
  const db = await getDb();
  return db
    .select({
      id: s.retailPrices.id,
      country: s.retailPrices.country,
      city: s.retailPrices.city,
      store: s.retailPrices.store,
      currency: s.retailPrices.currency,
      amount: s.retailPrices.amount,
      priceKind: s.retailPrices.priceKind,
      taxInclusion: s.retailPrices.taxInclusion,
      observedAt: s.retailPrices.observedAt,
      url: s.sourceEvidence.url,
      sourceName: s.sourceEvidence.sourceName,
      sourceType: s.sourceEvidence.sourceType,
      reliability: s.sourceEvidence.reliability,
      retrievedAt: s.sourceEvidence.retrievedAt,
      videoTimestamp: s.sourceEvidence.videoTimestamp,
    })
    .from(s.retailPrices)
    .innerJoin(s.sourceEvidence, eq(s.retailPrices.evidenceId, s.sourceEvidence.id))
    .where(and(eq(s.retailPrices.variantId, variantId), isNull(s.retailPrices.retractedAt)))
    .orderBy(asc(s.retailPrices.country), desc(s.retailPrices.observedAt));
}

export async function marketObservationsFor(productId: string): Promise<(Observation & { sourceName: string; reliability: string; country: string; currency: string; priceLocal: string | null; fxJpyPerUnit: string | null; listedAt: string | null })[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: s.marketObservations.id,
      variantId: s.marketObservations.variantId,
      platform: s.marketObservations.platform,
      kind: s.marketObservations.kind,
      priceJpy: s.marketObservations.priceJpy,
      condition: s.marketObservations.condition,
      observedAt: s.marketObservations.observedAt,
      soldAt: s.marketObservations.soldAt,
      externalRef: s.marketObservations.externalRef,
      country: s.marketObservations.country,
      currency: s.marketObservations.currency,
      priceLocal: s.marketObservations.priceLocal,
      fxJpyPerUnit: s.marketObservations.fxJpyPerUnit,
      listedAt: s.marketObservations.listedAt,
      evidenceUrl: s.sourceEvidence.url,
      sourceName: s.sourceEvidence.sourceName,
      reliability: s.sourceEvidence.reliability,
    })
    .from(s.marketObservations)
    .innerJoin(s.sourceEvidence, eq(s.marketObservations.evidenceId, s.sourceEvidence.id))
    .innerJoin(s.productVariants, eq(s.marketObservations.variantId, s.productVariants.id))
    .where(and(eq(s.productVariants.productId, productId), isNull(s.marketObservations.retractedAt)))
    .orderBy(desc(s.marketObservations.observedAt));
  return rows;
}

export async function buybackFor(variantId: string) {
  const db = await getDb();
  return db
    .select({ id: s.buybackQuotes.id, shop: s.buybackQuotes.shop, quoteKind: s.buybackQuotes.quoteKind, priceJpy: s.buybackQuotes.priceJpy, condition: s.buybackQuotes.condition, quotedAt: s.buybackQuotes.quotedAt, url: s.sourceEvidence.url, reliability: s.sourceEvidence.reliability })
    .from(s.buybackQuotes)
    .innerJoin(s.sourceEvidence, eq(s.buybackQuotes.evidenceId, s.sourceEvidence.id))
    .where(and(eq(s.buybackQuotes.variantId, variantId), isNull(s.buybackQuotes.retractedAt)))
    .orderBy(desc(s.buybackQuotes.quotedAt));
}

export async function latestFx(currency: string) {
  if (currency === "JPY") return { jpyPerUnit: "1", asOf: new Date(), source: "JPY" };
  const db = await getDb();
  const [r] = await db.select().from(s.fxRates).where(eq(s.fxRates.currency, currency)).orderBy(desc(s.fxRates.asOf)).limit(1);
  return r ?? null;
}

export async function allLatestFx() {
  const db = await getDb();
  const rows = await db.execute<{ currency: string; jpy_per_unit: string; as_of: string; source: string }>(
    sql`select distinct on (currency) currency, jpy_per_unit, as_of, source from fx_rates order by currency, as_of desc`,
  );
  return rows.rows;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await getDb();
  const [r] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, key));
  return (r?.value as T) ?? fallback;
}
export async function setSetting(key: string, value: unknown) {
  const db = await getDb();
  await db.insert(s.appSettings).values({ key, value }).onConflictDoUpdate({ target: s.appSettings.key, set: { value, updatedAt: new Date() } });
}

export const getDecisionSettings = async () => ({ ...DEFAULT_DECISION_SETTINGS, ...(await getSetting<Partial<DecisionSettings>>("decision", {})) });
export const getBusinessTaxStatus = () => getSetting<BusinessTaxStatus>("businessTaxStatus", "UNKNOWN");

export async function getExpenseProfile(): Promise<{ id: number | null; data: ExpenseProfileData }> {
  const db = await getDb();
  const [r] = await db.select().from(s.expenseProfiles).where(eq(s.expenseProfiles.isDefault, true)).orderBy(desc(s.expenseProfiles.id)).limit(1);
  return r ? { id: r.id, data: { ...DEFAULT_EXPENSE_PROFILE, ...(r.data as ExpenseProfileData) } } : { id: null, data: DEFAULT_EXPENSE_PROFILE };
}

/** 各 platform の最新版手数料 */
export async function currentFeeRules() {
  const db = await getDb();
  const rows = await db.execute<{ id: number; platform: string; version: number; fee_rate: string | null; fixed_fee_jpy: string; fee_includes_jct: boolean; status: s.AssumptionStatus; evidence_url: string | null; notes: string | null; effective_from: string }>(
    sql`select distinct on (platform) * from fee_rules where effective_from <= current_date order by platform, version desc`,
  );
  return rows.rows;
}

/** 各 key の最新版の前提 */
export async function currentTaxAssumptions() {
  const db = await getDb();
  const rows = await db.execute<{ id: number; key: string; value: string | null; status: s.AssumptionStatus; evidence_url: string | null; notes: string | null; created_at: string }>(
    sql`select distinct on (key) * from tax_assumptions order by key, id desc`,
  );
  return rows.rows;
}

export async function counts() {
  const db = await getDb();
  const r = await db.execute<Record<string, number>>(sql`select
    (select count(*)::int from products) as products,
    (select count(*)::int from product_variants) as variants,
    (select count(*)::int from retail_prices where retracted_at is null) as retail,
    (select count(*)::int from retail_prices r join source_evidence e on e.id = r.evidence_id where r.retracted_at is null and e.reliability = 'VERIFIED' and r.price_kind in ('OFFICIAL','RECEIPT')) as retail_verified,
    (select count(*)::int from market_observations where retracted_at is null and kind in ('VERIFIED_SOLD','REPORTED_SOLD')) as sold,
    (select count(*)::int from market_observations where retracted_at is null and kind = 'VERIFIED_SOLD') as sold_verified,
    (select count(*)::int from market_observations where retracted_at is null and kind = 'ASK') as ask,
    (select count(*)::int from buyback_quotes where retracted_at is null) as buyback,
    (select count(*)::int from fx_rates) as fx,
    (select count(*)::int from products where catalog_status = 'UNVERIFIED') as unverified_products,
    (select count(*)::int from product_images) as images,
    (select count(*)::int from scan_logs) as scans,
    (select coalesce(sum(input_tokens),0)::int from scan_logs where created_at > now() - interval '30 days') as in_tokens_30d,
    (select coalesce(sum(output_tokens),0)::int from scan_logs where created_at > now() - interval '30 days') as out_tokens_30d`);
  return r.rows[0];
}

export async function recentScenarios(limit = 20) {
  const db = await getDb();
  return db
    .select({ id: s.buyingScenarios.id, variantId: s.buyingScenarios.variantId, decision: s.buyingScenarios.decision, createdAt: s.buyingScenarios.createdAt, inputs: s.buyingScenarios.inputs, result: s.buyingScenarios.result, productName: s.products.nameEn })
    .from(s.buyingScenarios)
    .innerJoin(s.productVariants, eq(s.buyingScenarios.variantId, s.productVariants.id))
    .innerJoin(s.products, eq(s.productVariants.productId, s.products.id))
    .orderBy(desc(s.buyingScenarios.id))
    .limit(limit);
}

export { and, eq, desc, asc };

export async function latestPlan(variantId: string) {
  const db = await getDb();
  const [r] = await db.select().from(s.variantPlans).where(eq(s.variantPlans.variantId, variantId)).orderBy(desc(s.variantPlans.id)).limit(1);
  return r ?? null;
}
