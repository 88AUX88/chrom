import "server-only";
import { analyze, type AnalysisRequest } from "./analysis";
import { latestPlan, retailPricesFor } from "./data";
import type { PurchasePriceSource } from "./decide/engine";
import type { ConditionGroup } from "./market/stats";

const kindToSource = (k: string): PurchasePriceSource =>
  k === "OFFICIAL" ? "OFFICIAL" : k === "RECEIPT" ? "RECEIPT" : k === "BUYER_REPORT" ? "BUYER_REPORT" : k === "ESTIMATE" ? "ESTIMATE" : "UNKNOWN";

/**
 * 仕様確定直後に自動表示する分析のための入力を組み立てる。
 * 優先順: 1) 本人が登録した買付計画 2) 登録済みの海外正規価格（米国優先・最新）3) 価格なし
 */
export async function defaultRequestFor(variantId: string, cond: ConditionGroup = "NEW_UNUSED"): Promise<{ req: AnalysisRequest; priceOrigin: "PLAN" | "RETAIL" | "NONE" }> {
  const [plan, retail] = await Promise.all([latestPlan(variantId), retailPricesFor(variantId)]);
  const base = { variantId, conditionGroup: cond, fxOverride: null, manualSalePriceJpy: null };
  if (plan && plan.localPrice !== null) {
    return {
      priceOrigin: "PLAN",
      req: {
        ...base,
        country: plan.purchaseCountry,
        currency: plan.currency,
        price: String(plan.localPrice),
        priceSource: plan.priceSource as PurchasePriceSource,
        priceObservedAt: plan.priceObservedAt,
        priceEvidenceUrl: plan.priceEvidenceUrl,
        priceIncludesLocalTax: plan.priceIncludesLocalTax,
        localTaxRate: String(plan.localTaxRate),
        localTaxConfirmed: true, // 買付計画で本人が入力した税率
        platform: plan.platform,
      },
    };
  }
  const sorted = [...retail].sort((a, b) => (a.country === "US" ? -1 : 0) - (b.country === "US" ? -1 : 0) || (b.observedAt > a.observedAt ? 1 : -1));
  const r = sorted[0];
  if (r) {
    return {
      priceOrigin: "RETAIL",
      req: {
        ...base,
        country: r.country,
        currency: r.currency,
        price: String(r.amount),
        priceSource: kindToSource(r.priceKind),
        priceObservedAt: r.observedAt,
        priceEvidenceUrl: r.url,
        priceIncludesLocalTax: r.taxInclusion === "INCLUDED",
        localTaxRate: plan ? String(plan.localTaxRate) : "0",
        // 税別/税区分不明の正規価格は、買付計画で税率を入れるまで未確認（0%で利益を過大評価しない）
        localTaxConfirmed: !!plan,
        platform: plan?.platform ?? "SNKRDUNK",
      },
    };
  }
  return {
    priceOrigin: "NONE",
    req: {
      ...base,
      country: plan?.purchaseCountry ?? "US",
      currency: plan?.currency ?? "USD",
      price: null,
      priceSource: "UNKNOWN",
      priceObservedAt: null,
      priceIncludesLocalTax: false,
      localTaxRate: "0",
      platform: plan?.platform ?? "SNKRDUNK",
    },
  };
}

export async function summaryFor(variantId: string, cond: ConditionGroup = "NEW_UNUSED") {
  const { req, priceOrigin } = await defaultRequestFor(variantId, cond);
  const a = await analyze(req);
  return a ? { a, priceOrigin } : null;
}

/** 判定画面（/profit）へ同じ条件で遷移するための URL */
export function profitUrl(req: AnalysisRequest): string {
  const q = new URLSearchParams({
    variant: req.variantId,
    country: req.country,
    currency: req.currency,
    src: req.priceSource,
    taxRate: req.localTaxRate,
    taxIncl: req.priceIncludesLocalTax ? "1" : "0",
    platform: req.platform,
    cond: req.conditionGroup,
  });
  if (req.price) q.set("price", req.price);
  if (req.priceObservedAt) q.set("date", req.priceObservedAt);
  if (req.localTaxConfirmed) q.set("taxOk", "1");
  return `/profit?${q.toString()}`;
}
