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
  if (["TAXABLE", "EXEMPT", "UNKNOWN"].includes(bts)) await setSetting("businessTaxStatus", bts);
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
