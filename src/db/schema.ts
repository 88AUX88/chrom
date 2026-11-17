/**
 * LUXURY MARKET INTELLIGENCE — データベーススキーマ
 *
 * 原則:
 * - 価格・市場データは必ず variant（素材・サイズ・石の有無を確定した仕様）と source_evidence に紐付ける。
 * - 正規定価(retail_prices)・二次流通観測(market_observations)・買取査定(buyback_quotes)は別テーブル。
 * - 金額は numeric（文字列）で保存し、計算は decimal.js で行う（浮動小数点を使わない）。
 * - 過去データは上書きしない（追記のみ）。
 * - 公式型番が確認できない場合 official_model_number は NULL。架空の型番を作らない。
 */
import {
  pgTable,
  text,
  integer,
  serial,
  numeric,
  boolean,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** データの信頼性区分 */
export const RELIABILITY = ["VERIFIED", "REPORTED", "ESTIMATED", "UNVERIFIED"] as const;
export type Reliability = (typeof RELIABILITY)[number];

export const brands = pgTable("brands", {
  id: text("id").primaryKey(), // slug 例: chrome-hearts
  name: text("name").notNull(),
  nameJa: text("name_ja"),
  createdAt: createdAt(),
});

export const PRODUCT_CATEGORIES = ["RING", "PENDANT", "CHARM", "EARRING", "CHAIN", "BRACELET", "OTHER"] as const;
export const CATALOG_STATUS = ["VERIFIED", "REPORTED", "UNVERIFIED"] as const;

export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey(), // 内部ID（型番ではない）
    brandId: text("brand_id").notNull().references(() => brands.id),
    category: text("category", { enum: PRODUCT_CATEGORIES }).notNull(),
    nameEn: text("name_en").notNull(),
    nameJaReading: text("name_ja_reading").notNull(), // 日本語読み（カタカナ）
    officialModelNumber: text("official_model_number"), // 確認できなければ NULL
    catalogStatus: text("catalog_status", { enum: CATALOG_STATUS }).notNull().default("UNVERIFIED"),
    distinguishingFeatures: text("distinguishing_features"), // 画像認識・人間確認用の特徴
    confusableWith: jsonb("confusable_with").$type<string[]>().notNull().default([]), // 誤認しやすい product id
    /** 仕様選択肢（実在の確認は別。variant は人間が選択した時点で作成） */
    variantOptions: jsonb("variant_options")
      .$type<{ materials: string[]; sizes: string[]; stones: boolean[] }>()
      .notNull()
      .default({ materials: ["SILVER_925"], sizes: [], stones: [false] }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("products_brand_idx").on(t.brandId)],
);

export const MATERIALS = ["SILVER_925", "K18_WG", "K18_YG", "K22_YG", "K22_WG", "PLATINUM", "OTHER"] as const;
export type Material = (typeof MATERIALS)[number];

export const productVariants = pgTable(
  "product_variants",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull().references(() => products.id),
    material: text("material", { enum: MATERIALS }).notNull(),
    hasStones: boolean("has_stones").notNull().default(false),
    stoneType: text("stone_type"), // 例: diamond（has_stones=true のとき）
    sizeLabel: text("size_label"), // 例: "US 8", "20inch", "Small"
    ringSizeUs: numeric("ring_size_us", { precision: 5, scale: 2 }),
    lengthInch: numeric("length_inch", { precision: 6, scale: 2 }),
    color: text("color"),
    weightG: numeric("weight_g", { precision: 8, scale: 2 }), // 実測/根拠ありの場合のみ
    weightEvidenceId: integer("weight_evidence_id"),
    catalogStatus: text("catalog_status", { enum: CATALOG_STATUS }).notNull().default("UNVERIFIED"),
    createdAt: createdAt(),
  },
  (t) => [index("variants_product_idx").on(t.productId)],
);

export const IMAGE_LICENSE = ["OWN_PHOTO", "LICENSED", "LINK_ONLY", "UNKNOWN"] as const;
export const productImages = pgTable("product_images", {
  id: serial("id").primaryKey(),
  productId: text("product_id").notNull().references(() => products.id),
  variantId: text("variant_id").references(() => productVariants.id),
  /** 自分で撮影した画像のみ data_url で保存。権利不明な画像は link_url のみ。 */
  dataUrl: text("data_url"),
  linkUrl: text("link_url"),
  licenseStatus: text("license_status", { enum: IMAGE_LICENSE }).notNull(),
  caption: text("caption"),
  createdAt: createdAt(),
});

export const productAliases = pgTable(
  "product_aliases",
  {
    id: serial("id").primaryKey(),
    productId: text("product_id").notNull().references(() => products.id),
    alias: text("alias").notNull(),
    lang: text("lang").notNull().default("ja"),
  },
  (t) => [uniqueIndex("aliases_unique").on(t.productId, t.alias)],
);

export const IMPORT_KINDS = [
  "products",
  "variants",
  "retail_prices",
  "market_observations",
  "buyback_quotes",
  "fx_rates",
] as const;
export const importBatches = pgTable("import_batches", {
  id: serial("id").primaryKey(),
  kind: text("kind", { enum: IMPORT_KINDS }).notNull(),
  filename: text("filename"),
  rowCount: integer("row_count").notNull(),
  accepted: integer("accepted").notNull(),
  rejected: integer("rejected").notNull(),
  /** 隔離された行（行番号・理由・元データ） */
  quarantine: jsonb("quarantine").$type<{ row: number; reasons: string[]; raw: Record<string, string> }[]>().notNull(),
  createdAt: createdAt(),
});

export const SOURCE_TYPES = [
  "OFFICIAL_SITE",
  "STORE_VISIT",
  "RECEIPT",
  "YOUTUBE",
  "SNS",
  "MARKETPLACE",
  "BUYBACK_SITE",
  "AI_RESEARCH",
  "USER_NOTE",
  "OTHER",
] as const;
export const sourceEvidence = pgTable("source_evidence", {
  id: serial("id").primaryKey(),
  url: text("url"), // STORE_VISIT / USER_NOTE 以外は必須（取込時に検証）
  sourceName: text("source_name").notNull(),
  sourceType: text("source_type", { enum: SOURCE_TYPES }).notNull(),
  reliability: text("reliability", { enum: RELIABILITY }).notNull(),
  observedAt: date("observed_at").notNull(), // 情報の観測日（価格が有効だった日）
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull().defaultNow(), // 取得日
  videoPublishedAt: date("video_published_at"),
  videoTimestamp: text("video_timestamp"), // 例: "12:34"
  notes: text("notes"),
  importBatchId: integer("import_batch_id").references(() => importBatches.id),
  createdAt: createdAt(),
});

export const RETAIL_PRICE_KINDS = ["OFFICIAL", "RECEIPT", "BUYER_REPORT", "ESTIMATE", "UNKNOWN"] as const;
export const TAX_INCLUSION = ["INCLUDED", "EXCLUDED", "UNKNOWN"] as const;
export const retailPrices = pgTable(
  "retail_prices",
  {
    id: serial("id").primaryKey(),
    variantId: text("variant_id").notNull().references(() => productVariants.id),
    country: text("country").notNull(), // ISO 3166-1 alpha-2 (EU は "EU")
    city: text("city"),
    store: text("store"),
    currency: text("currency").notNull(), // ISO 4217
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    priceKind: text("price_kind", { enum: RETAIL_PRICE_KINDS }).notNull(),
    taxInclusion: text("tax_inclusion", { enum: TAX_INCLUSION }).notNull(),
    observedAt: date("observed_at").notNull(),
    evidenceId: integer("evidence_id").notNull().references(() => sourceEvidence.id),
    importBatchId: integer("import_batch_id").references(() => importBatches.id),
    createdAt: createdAt(),
  },
  (t) => [index("retail_variant_idx").on(t.variantId)],
);

export const MARKET_PLATFORMS = ["SNKRDUNK", "BUYMA", "RINKAN", "BRING", "KOMEHYO", "MERCARI", "OTHER"] as const;
/** 二次流通の観測区分。RETAIL は retail_prices、BUYBACK_QUOTE は buyback_quotes に分離。 */
export const MARKET_KINDS = ["ASK", "VERIFIED_SOLD", "REPORTED_SOLD", "ESTIMATE"] as const;
export type MarketKind = (typeof MARKET_KINDS)[number];
export const CONDITIONS = ["NEW", "UNUSED", "USED_A", "USED_B", "USED_C", "UNKNOWN"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const marketObservations = pgTable(
  "market_observations",
  {
    id: serial("id").primaryKey(),
    variantId: text("variant_id").notNull().references(() => productVariants.id),
    platform: text("platform", { enum: MARKET_PLATFORMS }).notNull(),
    kind: text("kind", { enum: MARKET_KINDS }).notNull(),
    priceJpy: numeric("price_jpy", { precision: 14, scale: 0 }).notNull(),
    condition: text("condition", { enum: CONDITIONS }).notNull(),
    accessories: text("accessories"),
    observedAt: date("observed_at").notNull(),
    listedAt: date("listed_at"),
    soldAt: date("sold_at"), // *_SOLD のとき必須
    externalRef: text("external_ref"), // 取引ID等（重複検出用）
    evidenceId: integer("evidence_id").notNull().references(() => sourceEvidence.id),
    importBatchId: integer("import_batch_id").references(() => importBatches.id),
    createdAt: createdAt(),
  },
  (t) => [index("market_variant_idx").on(t.variantId)],
);

export const buybackQuotes = pgTable("buyback_quotes", {
  id: serial("id").primaryKey(),
  variantId: text("variant_id").notNull().references(() => productVariants.id),
  shop: text("shop").notNull(),
  priceJpy: numeric("price_jpy", { precision: 14, scale: 0 }).notNull(),
  condition: text("condition", { enum: CONDITIONS }).notNull(),
  quotedAt: date("quoted_at").notNull(),
  evidenceId: integer("evidence_id").notNull().references(() => sourceEvidence.id),
  importBatchId: integer("import_batch_id").references(() => importBatches.id),
  createdAt: createdAt(),
});

export const fxRates = pgTable(
  "fx_rates",
  {
    id: serial("id").primaryKey(),
    currency: text("currency").notNull(), // 1 単位あたりの JPY
    jpyPerUnit: numeric("jpy_per_unit", { precision: 18, scale: 8 }).notNull(),
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
    source: text("source").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("fx_currency_idx").on(t.currency, t.asOf)],
);

export const ASSUMPTION_STATUS = ["VERIFIED", "USER_CONFIRMED", "UNVERIFIED"] as const;
export type AssumptionStatus = (typeof ASSUMPTION_STATUS)[number];

/** 販売先手数料（バージョン管理: 変更時は新しい行を追加） */
export const feeRules = pgTable("fee_rules", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  version: integer("version").notNull(),
  effectiveFrom: date("effective_from").notNull(),
  feeRate: numeric("fee_rate", { precision: 8, scale: 6 }), // 0.1 = 10%。不明なら NULL
  fixedFeeJpy: numeric("fixed_fee_jpy", { precision: 12, scale: 0 }).notNull().default("0"),
  feeIncludesJct: boolean("fee_includes_jct").notNull().default(true),
  status: text("status", { enum: ASSUMPTION_STATUS }).notNull(),
  evidenceUrl: text("evidence_url"),
  notes: text("notes"),
  createdAt: createdAt(),
});

/** 税率等の前提（バージョン管理: 変更時は新しい行を追加） */
export const taxAssumptions = pgTable("tax_assumptions", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(), // 例: CUSTOMS_DUTY_RATE:7113.11
  value: numeric("value", { precision: 18, scale: 6 }), // 不明なら NULL
  status: text("status", { enum: ASSUMPTION_STATUS }).notNull(),
  evidenceUrl: text("evidence_url"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const expenseProfiles = pgTable("expense_profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  /** ExpenseProfileData（src/lib/profit/types.ts）を JSON で保持 */
  data: jsonb("data").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: createdAt(),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const DECISIONS = ["BUY", "HOLD", "PASS"] as const;
export const buyingScenarios = pgTable("buying_scenarios", {
  id: serial("id").primaryKey(),
  variantId: text("variant_id").notNull().references(() => productVariants.id),
  inputs: jsonb("inputs").notNull(),
  result: jsonb("result").notNull(),
  decision: text("decision", { enum: DECISIONS }).notNull(),
  reasons: jsonb("reasons").notNull(),
  createdAt: createdAt(),
});

export const scanLogs = pgTable("scan_logs", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(), // anthropic / manual
  candidates: jsonb("candidates").notNull(),
  chosenProductId: text("chosen_product_id"),
  thumbnailDataUrl: text("thumbnail_data_url"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  createdAt: createdAt(),
});

export const purchases = pgTable("purchases", {
  id: serial("id").primaryKey(),
  variantId: text("variant_id").notNull().references(() => productVariants.id),
  scenarioId: integer("scenario_id").references(() => buyingScenarios.id),
  purchasedAt: date("purchased_at").notNull(),
  country: text("country").notNull(),
  store: text("store"),
  currency: text("currency").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  fxJpyPerUnit: numeric("fx_jpy_per_unit", { precision: 18, scale: 8 }).notNull(),
  /** 実際にかかった取得原価合計（関税・輸入消費税・送料等を含む円） */
  totalCostJpy: numeric("total_cost_jpy", { precision: 14, scale: 0 }).notNull(),
  importConsumptionTaxJpy: numeric("import_ct_jpy", { precision: 14, scale: 0 }).notNull().default("0"),
  expectedProfitJpy: numeric("expected_profit_jpy", { precision: 14, scale: 0 }),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const sales = pgTable("sales", {
  id: serial("id").primaryKey(),
  purchaseId: integer("purchase_id").notNull().references(() => purchases.id),
  platform: text("platform").notNull(),
  listedAt: date("listed_at"),
  soldAt: date("sold_at").notNull(),
  priceJpy: numeric("price_jpy", { precision: 14, scale: 0 }).notNull(),
  feesJpy: numeric("fees_jpy", { precision: 14, scale: 0 }).notNull(),
  shippingJpy: numeric("shipping_jpy", { precision: 14, scale: 0 }).notNull().default("0"),
  otherCostsJpy: numeric("other_costs_jpy", { precision: 14, scale: 0 }).notNull().default("0"),
  markdownCount: integer("markdown_count").notNull().default(0),
  returned: boolean("returned").notNull().default(false),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const LEARNING_KINDS = ["NAME_READING", "MATERIAL", "CONFUSION", "PROFIT_DRILL", "IMAGE"] as const;
export const learningCards = pgTable("learning_cards", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: LEARNING_KINDS }).notNull(),
  productId: text("product_id").references(() => products.id),
  day: integer("day").notNull(), // 7日間教材の何日目か
  prompt: text("prompt").notNull(),
  choices: jsonb("choices").$type<string[]>().notNull(),
  answerIndex: integer("answer_index").notNull(),
  explanation: text("explanation").notNull(),
  /** 教材用の仮想例（実データではない）なら true */
  isIllustrative: boolean("is_illustrative").notNull().default(false),
  // 間隔反復
  ease: numeric("ease", { precision: 4, scale: 2 }).notNull().default("2.5"),
  intervalDays: integer("interval_days").notNull().default(0),
  reps: integer("reps").notNull().default(0),
  lapses: integer("lapses").notNull().default(0),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull().defaultNow(),
});
