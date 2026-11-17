"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import * as s from "@/db/schema";
import { checkPassword, createSessionValue, SESSION_COOKIE, SESSION_TTL_SEC } from "@/lib/auth/session";
import { ensureVariant, getExpenseProfile, setSetting } from "@/lib/data";
import { parseStrictDecimal } from "@/lib/money";
import { schedule } from "@/lib/learn/cards";
import { importCsv } from "@/lib/import/apply";
import { IMPORT_KINDS } from "@/db/schema";
import { analyze, type AnalysisRequest } from "@/lib/analysis";
import type { ExpenseProfileData } from "@/lib/settings-defaults";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const dec = (f: FormData, k: string, opts: { allowEmpty?: boolean } = {}) => {
  const v = str(f, k);
  if (!v && opts.allowEmpty) return null;
  const d = parseStrictDecimal(v);
  if (d === null || d.isNegative()) throw new Error(`${k} の数値が不正です`);
  return d.toString();
};

// ───────── 認証 ─────────
export async function login(_: unknown, f: FormData): Promise<{ error?: string }> {
  // 総当たり対策の遅延
  await new Promise((r) => setTimeout(r, 400));
  if (!checkPassword(str(f, "password"))) return { error: "パスワードが違うか、サーバー側の認証設定（APP_PASSWORD / SESSION_SECRET）がありません。" };
  (await cookies()).set(SESSION_COOKIE, await createSessionValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
  redirect("/");
}
export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ───────── 商品・仕様確定 ─────────
export async function confirmVariant(f: FormData) {
  const productId = str(f, "productId");
  const material = str(f, "material");
  const hasStones = str(f, "stones") === "true";
  const size = str(f, "size") || null;
  const scanId = Number(str(f, "scanId")) || null;
  const db = await getDb();
  const [p] = await db.select().from(s.products).where(eq(s.products.id, productId));
  if (!p) throw new Error("商品が見つかりません");
  const opts = p.variantOptions;
  if (!opts.materials.includes(material)) throw new Error("素材が不正です");
  if (opts.sizes.length && (!size || !opts.sizes.includes(size))) throw new Error("サイズを選択してください");
  const variantId = await ensureVariant(productId, material, hasStones, opts.sizes.length ? size : null, str(f, "stoneType") || null);
  if (scanId) await db.update(s.scanLogs).set({ chosenProductId: productId }).where(eq(s.scanLogs.id, scanId));
  redirect(`/products/${productId}?variant=${encodeURIComponent(variantId)}`);
}

export async function uploadReferencePhoto(f: FormData) {
  const productId = str(f, "productId");
  const dataUrl = str(f, "dataUrl");
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl) || dataUrl.length > 1_500_000) throw new Error("画像が不正、または大きすぎます");
  if (str(f, "own") !== "yes") throw new Error("自分で撮影した画像のみ登録できます");
  const db = await getDb();
  await db.insert(s.productImages).values({ productId, dataUrl, licenseStatus: "OWN_PHOTO", caption: str(f, "caption") || null });
  revalidatePath(`/products/${productId}`);
}

// ───────── 判定の保存 ─────────
export async function saveScenario(f: FormData) {
  const req = JSON.parse(str(f, "req")) as AnalysisRequest;
  const a = await analyze(req);
  if (!a) throw new Error("仕様が見つかりません");
  const db = await getDb();
  await db.insert(s.buyingScenarios).values({
    variantId: req.variantId,
    inputs: req,
    result: { scenarios: a.scenarios, market: a.market, fx: a.fx, dutyRate: a.dutyRate, fee: a.fee, maxPurchaseLocal: a.maxPurchaseLocal },
    decision: a.decision.decision,
    reasons: { reasons: a.decision.reasons, todo: a.decision.todo },
  });
  redirect("/history?saved=1");
}

// ───────── 購入・販売実績 ─────────
export async function addPurchase(f: FormData) {
  const db = await getDb();
  await db.insert(s.purchases).values({
    variantId: str(f, "variantId"),
    scenarioId: Number(str(f, "scenarioId")) || null,
    purchasedAt: str(f, "purchasedAt"),
    country: str(f, "country").toUpperCase(),
    store: str(f, "store") || null,
    currency: str(f, "currency").toUpperCase(),
    amount: dec(f, "amount")!,
    fxJpyPerUnit: dec(f, "fx")!,
    totalCostJpy: dec(f, "totalCostJpy")!,
    importConsumptionTaxJpy: dec(f, "importCtJpy", { allowEmpty: true }) ?? "0",
    expectedProfitJpy: parseStrictDecimal(str(f, "expectedProfitJpy"))?.toFixed(0) ?? null,
    notes: str(f, "notes") || null,
  });
  revalidatePath("/history");
}

export async function addSale(f: FormData) {
  const db = await getDb();
  await db.insert(s.sales).values({
    purchaseId: Number(str(f, "purchaseId")),
    platform: str(f, "platform"),
    listedAt: str(f, "listedAt") || null,
    soldAt: str(f, "soldAt"),
    priceJpy: dec(f, "priceJpy")!,
    feesJpy: dec(f, "feesJpy")!,
    shippingJpy: dec(f, "shippingJpy", { allowEmpty: true }) ?? "0",
    otherCostsJpy: dec(f, "otherCostsJpy", { allowEmpty: true }) ?? "0",
    markdownCount: Number(str(f, "markdownCount")) || 0,
    returned: str(f, "returned") === "on",
    notes: str(f, "notes") || null,
  });
  revalidatePath("/history");
}

// ───────── 設定 ─────────
const DecisionForm = z.object({
  minProfitJpy: z.coerce.number().min(0),
  minRoi: z.coerce.number().min(0).max(10),
  minSoldCount: z.coerce.number().int().min(1).max(1000),
  marketWindowDays: z.coerce.number().int().min(7).max(730),
  retailMaxAgeDays: z.coerce.number().int().min(1).max(3650),
  marketMaxAgeDays: z.coerce.number().int().min(1).max(3650),
  fxMaxAgeHours: z.coerce.number().min(1).max(24 * 60),
  fxBufferRate: z.coerce.number().min(0).max(0.5),
  thinDataHaircut: z.coerce.number().min(0).max(0.9),
});
export async function saveDecisionSettings(f: FormData) {
  const v = DecisionForm.parse(Object.fromEntries(f));
  await setSetting("decision", v);
  const bts = str(f, "businessTaxStatus");
  if (["TAXABLE", "SIMPLIFIED", "EXEMPT", "UNKNOWN"].includes(bts)) await setSetting("businessTaxStatus", bts);
  revalidatePath("/settings");
}

export async function saveExpenseProfile(f: FormData) {
  const cur = await getExpenseProfile();
  const data: ExpenseProfileData = {
    confirmed: str(f, "confirmed") === "on",
    importMode: str(f, "importMode") === "PERSONAL" ? "PERSONAL" : "COMMERCIAL",
    cardFeeRate: dec(f, "cardFeeRate")!,
    localTaxRefundRate: dec(f, "localTaxRefundRate")!,
    intlShippingJpy: dec(f, "intlShippingJpy")!,
    insuranceJpy: dec(f, "insuranceJpy")!,
    customsBrokerFeeJpy: dec(f, "customsBrokerFeeJpy")!,
    travelAllocationJpy: dec(f, "travelAllocationJpy")!,
    domesticShippingJpy: dec(f, "domesticShippingJpy")!,
    packagingJpy: dec(f, "packagingJpy")!,
    riskReserveRate: dec(f, "riskReserveRate")!,
    otherCostsJpy: dec(f, "otherCostsJpy")!,
    applyLowValueExemption: str(f, "applyLowValueExemption") === "on",
  };
  if (Number(data.localTaxRefundRate) > 1 || Number(data.riskReserveRate) >= 1 || Number(data.cardFeeRate) >= 1) throw new Error("率は 0〜1 で入力してください");
  const db = await getDb();
  // 履歴を残すため新しい行を追加し、既定を切り替える
  await db.transaction(async (tx) => {
    if (cur.id) await tx.update(s.expenseProfiles).set({ isDefault: false }).where(eq(s.expenseProfiles.id, cur.id));
    await tx.insert(s.expenseProfiles).values({ name: data.confirmed ? "確認済み" : "仮置き", data, isDefault: true });
  });
  revalidatePath("/settings");
}

export async function addTaxAssumption(f: FormData) {
  const status = str(f, "status") as s.AssumptionStatus;
  if (!s.ASSUMPTION_STATUS.includes(status)) throw new Error("status が不正");
  if (!/^[A-Z_]+(:[0-9.]+(:EPA:[A-Z]{2})?)?$/.test(str(f, "key"))) throw new Error("項目名の形式が不正です");
  const value = dec(f, "value", { allowEmpty: true });
  if (status !== "UNVERIFIED" && !str(f, "evidenceUrl")) throw new Error("確認済みにするには根拠URLが必要です");
  const db = await getDb();
  await db.insert(s.taxAssumptions).values({ key: str(f, "key"), value, status, evidenceUrl: str(f, "evidenceUrl") || null, notes: str(f, "notes") || null });
  revalidatePath("/settings");
}

export async function addFeeRule(f: FormData) {
  const status = str(f, "status") as s.AssumptionStatus;
  if (!s.ASSUMPTION_STATUS.includes(status)) throw new Error("status が不正");
  const platform = str(f, "platform");
  const rate = dec(f, "feeRate", { allowEmpty: true });
  if (rate !== null && Number(rate) >= 1) throw new Error("手数料率は 0〜1（例 0.1 = 10%）");
  if (status !== "UNVERIFIED" && !str(f, "evidenceUrl")) throw new Error("確認済みにするには根拠URLが必要です");
  const db = await getDb();
  const prev = await db.select({ v: s.feeRules.version }).from(s.feeRules).where(eq(s.feeRules.platform, platform));
  const version = prev.reduce((m, r) => Math.max(m, r.v), 0) + 1;
  await db.insert(s.feeRules).values({
    platform,
    version,
    effectiveFrom: str(f, "effectiveFrom") || new Date().toISOString().slice(0, 10),
    feeRate: rate,
    fixedFeeJpy: dec(f, "fixedFeeJpy", { allowEmpty: true }) ?? "0",
    feeIncludesJct: str(f, "feeIncludesJct") === "on",
    status,
    evidenceUrl: str(f, "evidenceUrl") || null,
    notes: str(f, "notes") || null,
  });
  revalidatePath("/settings");
}

export async function addFxRate(f: FormData) {
  const currency = str(f, "currency").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency) || currency === "JPY") throw new Error("通貨が不正");
  const asOf = new Date(str(f, "asOf") || Date.now());
  if (Number.isNaN(asOf.getTime()) || asOf.getTime() > Date.now() + 60000) throw new Error("日時が不正");
  const source = str(f, "source");
  if (!source) throw new Error("取得元を入力してください");
  const db = await getDb();
  await db.insert(s.fxRates).values({ currency, jpyPerUnit: dec(f, "rate")!, asOf, source });
  revalidatePath("/settings");
}

// ───────── 取込 ─────────
export async function runImport(_: unknown, f: FormData) {
  const kind = str(f, "kind") as (typeof IMPORT_KINDS)[number];
  if (!IMPORT_KINDS.includes(kind)) return { error: "種類が不正です" };
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "ファイルを選択してください" };
  if (file.size > 5_000_000) return { error: "5MB 以下にしてください" };
  const res = await importCsv(kind, file.name, new Uint8Array(await file.arrayBuffer()));
  revalidatePath("/");
  return { result: { batchId: res.batchId, fileErrors: res.fileErrors, accepted: res.accepted.length, quarantine: res.quarantine } };
}

// ───────── 学習 ─────────
export async function gradeCard(cardId: string, grade: 0 | 1 | 2) {
  const db = await getDb();
  const [c] = await db.select().from(s.learningCards).where(eq(s.learningCards.id, cardId));
  if (!c) return;
  const next = schedule({ ease: Number(c.ease), intervalDays: c.intervalDays, reps: c.reps, lapses: c.lapses }, grade, new Date());
  await db.update(s.learningCards).set({ ease: next.ease.toFixed(2), intervalDays: next.intervalDays, reps: next.reps, lapses: next.lapses, dueAt: next.dueAt }).where(eq(s.learningCards.id, cardId));
}

// ───────── 買付計画（購入国・原産国・HS・価格・売却予定） ─────────
const PRICE_SOURCES = ["STORE_OBSERVED", "OFFICIAL", "RECEIPT", "BUYER_REPORT", "ESTIMATE", "UNKNOWN"];
export async function savePlan(f: FormData) {
  const variantId = str(f, "variantId");
  const productId = str(f, "productId");
  const cert = (k: string) => {
    const v = str(f, k);
    if (!s.CERTAINTY.includes(v as (typeof s.CERTAINTY)[number])) throw new Error(`${k} が不正`);
    return v as (typeof s.CERTAINTY)[number];
  };
  const purchaseCountry = str(f, "purchaseCountry").toUpperCase();
  const currency = str(f, "currency").toUpperCase();
  const originCountry = str(f, "originCountry").toUpperCase() || null;
  const hsCode = str(f, "hsCode") || null;
  const priceSource = str(f, "priceSource");
  if (!/^[A-Z]{2}$/.test(purchaseCountry)) throw new Error("購入国は ISO 2文字（例 US）");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("通貨は ISO 3文字（例 USD）");
  if (originCountry && !/^[A-Z]{2}$/.test(originCountry)) throw new Error("原産国は ISO 2文字");
  if (hsCode && !/^\d{4}\.\d{2}(\.\d{2,4})?$/.test(hsCode)) throw new Error("HSコードの形式（例 7113.11）");
  if (!PRICE_SOURCES.includes(priceSource)) throw new Error("価格の根拠が不正");
  const hsCertainty = hsCode ? cert("hsCertainty") : "UNVERIFIED";
  const originCertainty = originCountry ? cert("originCertainty") : "UNVERIFIED";
  const hsEvidenceUrl = str(f, "hsEvidenceUrl") || null;
  const originEvidence = str(f, "originEvidence") || null;
  if (hsCertainty === "CONFIRMED" && !hsEvidenceUrl) throw new Error("HSコードを確定にするには根拠URLが必要です");
  if (originCertainty === "CONFIRMED" && !originEvidence) throw new Error("原産国を確定にするには根拠（刻印・タグ・インボイス等）が必要です");
  const originProof = str(f, "originProof") === "on";
  if (originProof && originCertainty !== "CONFIRMED") throw new Error("原産性の証明は原産国が確定している場合のみ");
  const price = dec(f, "localPrice", { allowEmpty: true });
  const date = str(f, "priceObservedAt") || null;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("確認日が不正");
  const db = await getDb();
  await db.insert(s.variantPlans).values({
    variantId,
    purchaseCountry,
    currency,
    localPrice: price,
    priceSource,
    priceObservedAt: date,
    priceEvidenceUrl: str(f, "priceEvidenceUrl") || null,
    priceIncludesLocalTax: str(f, "priceIncludesLocalTax") === "on",
    localTaxRate: dec(f, "localTaxRate", { allowEmpty: true }) ?? "0",
    hsCode,
    hsCertainty,
    hsEvidenceUrl,
    originCountry,
    originCertainty,
    originEvidence,
    originProof,
    plannedSalePriceJpy: dec(f, "plannedSalePriceJpy", { allowEmpty: true }),
    platform: str(f, "platform") || "SNKRDUNK",
    notes: str(f, "notes") || null,
  });
  redirect(`/products/${productId}?variant=${encodeURIComponent(variantId)}#summary`);
}

// ───────── 商品の追加・編集・取り消し（変更履歴付き） ─────────
import { conflictsWith } from "@/lib/catalog";

type Tx = Parameters<Parameters<Awaited<ReturnType<typeof getDb>>["transaction"]>[0]>[0];
async function logChange(tx: Tx, entity: string, entityId: string, action: "CREATE" | "UPDATE" | "RETRACT", before: Record<string, unknown> | null, after: Record<string, unknown>, reason?: string | null) {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const k of Object.keys(after)) {
    const b = before ? before[k] : null;
    if (JSON.stringify(b) !== JSON.stringify(after[k])) changes[k] = { before: b ?? null, after: after[k] };
  }
  if (action !== "CREATE" && Object.keys(changes).length === 0) return false;
  await tx.insert(s.changeLog).values({ entity, entityId, action, changes, reason: reason ?? null });
  return true;
}

function productFields(f: FormData) {
  const category = str(f, "category");
  if (!(s.PRODUCT_CATEGORIES as readonly string[]).includes(category)) throw new Error("カテゴリーが不正です");
  const catalogStatus = str(f, "catalogStatus");
  if (!(s.CATALOG_STATUS as readonly string[]).includes(catalogStatus)) throw new Error("確認状態が不正です");
  const nameEn = str(f, "nameEn");
  const nameJaReading = str(f, "nameJaReading");
  if (!nameEn || !nameJaReading) throw new Error("正式名称と読みは必須です");
  const sourceUrl = str(f, "sourceUrl") || null;
  if (sourceUrl && !/^https?:\/\//.test(sourceUrl)) throw new Error("出典URLが不正です");
  const officialModelNumber = str(f, "officialModelNumber") || null;
  if (officialModelNumber && !sourceUrl) throw new Error("公式型番を登録するには出典URLが必要です（架空の型番を防ぐため）");
  if (catalogStatus === "VERIFIED" && !sourceUrl) throw new Error("確認済み（VERIFIED）にするには出典URLが必要です");
  const verifiedAt = str(f, "verifiedAt") || null;
  if (verifiedAt && !/^\d{4}-\d{2}-\d{2}$/.test(verifiedAt)) throw new Error("確認日が不正です");
  const materials = f.getAll("materials").map(String).filter((m) => (s.MATERIALS as readonly string[]).includes(m));
  if (materials.length === 0) throw new Error("素材を1つ以上選んでください");
  const sizes = str(f, "sizes").split(/[,、\n]/).map((x) => x.trim()).filter(Boolean);
  const stones = f.getAll("stones").map((x) => String(x) === "true");
  return {
    category: category as (typeof s.PRODUCT_CATEGORIES)[number],
    catalogStatus: catalogStatus as (typeof s.CATALOG_STATUS)[number],
    nameEn,
    nameJaReading,
    officialModelNumber,
    distinguishingFeatures: str(f, "features") || null,
    notes: str(f, "notes") || null,
    sourceUrl,
    verifiedAt,
    variantOptions: { materials, sizes, stones: stones.length ? [...new Set(stones)] : [false] },
    confusableWith: str(f, "confusableWith").split(/[,\s]+/).map((x) => x.trim()).filter(Boolean),
  };
}

export async function createProduct(_: unknown, f: FormData): Promise<{ error?: string; duplicates?: string[] }> {
  try {
    const id = str(f, "id");
    if (!/^[a-z0-9][a-z0-9-]{2,80}$/.test(id)) return { error: "商品IDは英小文字・数字・ハイフン（例 ch-cross-pendant-large）" };
    const fields = productFields(f);
    const db = await getDb();
    const existing = await db.select({ id: s.products.id, nameEn: s.products.nameEn, nameJaReading: s.products.nameJaReading }).from(s.products);
    if (existing.some((e) => e.id === id)) return { error: "同じ商品IDが既に存在します" };
    const dup = conflictsWith(fields.nameEn, fields.nameJaReading, existing);
    if (dup.length && str(f, "allowDuplicate") !== "on") return { error: "名称が既存商品と重複しています。別商品であることを確認した場合のみチェックを入れて再送信してください", duplicates: dup.map((d) => d.id) };
    await db.transaction(async (tx) => {
      await tx.insert(s.products).values({ id, brandId: "chrome-hearts", ...fields });
      const aliases = str(f, "aliases").split(/[,、]/).map((x) => x.trim()).filter(Boolean);
      if (aliases.length) await tx.insert(s.productAliases).values(aliases.map((alias) => ({ productId: id, alias }))).onConflictDoNothing();
      await logChange(tx, "products", id, "CREATE", null, { ...fields, aliases });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "保存できませんでした" };
  }
  redirect(`/products/${str(f, "id")}`);
}

export async function updateProduct(_: unknown, f: FormData): Promise<{ error?: string }> {
  const id = str(f, "id");
  try {
    const fields = productFields(f);
    const db = await getDb();
    const [before] = await db.select().from(s.products).where(eq(s.products.id, id));
    if (!before) return { error: "商品が見つかりません" };
    await db.transaction(async (tx) => {
      const beforeAliases = (await tx.select({ a: s.productAliases.alias }).from(s.productAliases).where(eq(s.productAliases.productId, id))).map((r) => r.a).sort();
      const aliases = [...new Set(str(f, "aliases").split(/[,、]/).map((x) => x.trim()).filter(Boolean))].sort();
      const changed = await logChange(tx, "products", id, "UPDATE", { ...before, aliases: beforeAliases } as Record<string, unknown>, { ...fields, aliases }, str(f, "reason") || null);
      if (!changed) return;
      await tx.update(s.products).set({ ...fields, updatedAt: new Date() }).where(eq(s.products.id, id));
      await tx.delete(s.productAliases).where(eq(s.productAliases.productId, id));
      if (aliases.length) await tx.insert(s.productAliases).values(aliases.map((alias) => ({ productId: id, alias })));
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "保存できませんでした" };
  }
  redirect(`/products/${id}?saved=1`);
}

const RETRACTABLE = { retail_prices: s.retailPrices, market_observations: s.marketObservations, buyback_quotes: s.buybackQuotes } as const;
/** 誤ったデータを「取り消し」扱いにする（削除しない・履歴に残す） */
export async function retractRecord(f: FormData) {
  const entity = str(f, "entity") as keyof typeof RETRACTABLE;
  const table = RETRACTABLE[entity];
  if (!table) throw new Error("対象が不正です");
  const id = Number(str(f, "id"));
  const reason = str(f, "reason");
  if (!reason) throw new Error("取り消し理由を入力してください");
  const db = await getDb();
  await db.transaction(async (tx) => {
    const now = new Date();
    await tx.update(table).set({ retractedAt: now, retractReason: reason }).where(eq(table.id, id));
    await logChange(tx, entity, String(id), "RETRACT", { retractedAt: null }, { retractedAt: now.toISOString() }, reason);
  });
  revalidatePath(str(f, "back") || "/products");
}
