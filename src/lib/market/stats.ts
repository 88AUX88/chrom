/**
 * 二次流通データの集計（純関数）。
 * - ASK（出品価格）と SOLD（成約）は絶対に混ぜない。
 * - 同一 variant（素材・サイズ・石の有無が一致）かつ状態グループが一致するデータのみ比較。
 * - 標本が少ない場合はパーセンタイルや信頼区間を出さない。
 * - 売却率は出品母数がない限り「算出不能」。
 */
import Decimal from "decimal.js";
import { D } from "../money";
import type { Condition, MarketKind } from "@/db/schema";

export interface Observation {
  id: number;
  variantId: string;
  platform: string;
  kind: MarketKind;
  priceJpy: string;
  condition: Condition;
  observedAt: string; // YYYY-MM-DD
  soldAt: string | null;
  externalRef: string | null;
  evidenceUrl?: string | null;
}

export type ConditionGroup = "NEW_UNUSED" | "USED" | "ANY";
export const conditionGroupOf = (c: Condition): ConditionGroup =>
  c === "NEW" || c === "UNUSED" ? "NEW_UNUSED" : c === "UNKNOWN" ? "ANY" : "USED";

export const SOLD_KINDS: MarketKind[] = ["VERIFIED_SOLD", "REPORTED_SOLD"];

const dayMs = 86400000;
export function daysBetween(a: string | Date, b: string | Date): number {
  const ta = typeof a === "string" ? Date.parse(a + (a.length === 10 ? "T00:00:00Z" : "")) : a.getTime();
  const tb = typeof b === "string" ? Date.parse(b + (b.length === 10 ? "T00:00:00Z" : "")) : b.getTime();
  return Math.floor((tb - ta) / dayMs);
}

/** 重複除去: 同一 platform・kind・価格・日付・外部ID（あれば外部ID優先） */
export function dedupe(obs: Observation[]): Observation[] {
  const seen = new Set<string>();
  const out: Observation[] = [];
  for (const o of obs) {
    const key = o.externalRef
      ? `${o.platform}|ref|${o.externalRef}`
      : `${o.platform}|${o.kind}|${D(o.priceJpy).toFixed(0)}|${o.soldAt ?? o.observedAt}|${o.condition}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out;
}

/** nearest-rank 法のパーセンタイル（ソート済み配列） */
function percentile(sorted: Decimal[], p: number): Decimal {
  const rank = Math.max(1, Math.ceil(p * sorted.length));
  return sorted[rank - 1];
}
function median(sorted: Decimal[]): Decimal {
  const n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : sorted[n / 2 - 1].plus(sorted[n / 2]).dividedBy(2);
}

export interface PriceStats {
  count: number;
  min: string | null;
  max: string | null;
  median: string | null;
  p25: string | null; // count >= MIN_FOR_PERCENTILE のときのみ
  p75: string | null;
  /** 変動係数（標準偏差/平均）。count >= MIN_FOR_PERCENTILE のときのみ */
  cv: string | null;
}
export const MIN_FOR_PERCENTILE = 5;

export function priceStats(prices: Decimal[]): PriceStats {
  const s = [...prices].sort((a, b) => a.comparedTo(b));
  const n = s.length;
  if (n === 0) return { count: 0, min: null, max: null, median: null, p25: null, p75: null, cv: null };
  const enough = n >= MIN_FOR_PERCENTILE;
  let cv: string | null = null;
  if (enough) {
    const mean = s.reduce((a, b) => a.plus(b), D(0)).dividedBy(n);
    const variance = s.reduce((a, b) => a.plus(b.minus(mean).pow(2)), D(0)).dividedBy(n - 1);
    cv = mean.isZero() ? null : variance.sqrt().dividedBy(mean).toDecimalPlaces(4).toString();
  }
  return {
    count: n,
    min: s[0].toFixed(0),
    max: s[n - 1].toFixed(0),
    median: median(s).toFixed(0),
    p25: enough ? percentile(s, 0.25).toFixed(0) : null,
    p75: enough ? percentile(s, 0.75).toFixed(0) : null,
    cv,
  };
}

export interface MarketSummary {
  variantId: string;
  conditionGroup: ConditionGroup;
  windowDays: number;
  sold: PriceStats; // VERIFIED_SOLD + REPORTED_SOLD
  verifiedSoldCount: number;
  reportedSoldCount: number;
  ask: PriceStats; // 参考: 現在の出品
  excludedOtherSpec: number; // 別仕様のため除外した件数
  sellThroughRate: null; // 出品母数がないため常に算出不能（将来: 母数データ取込時に算出）
  sellThroughNote: string;
  latestSoldAt: string | null;
}

export function summarizeMarket(
  all: Observation[],
  variantId: string,
  group: ConditionGroup,
  windowDays: number,
  today: string,
): MarketSummary {
  const sameSpec = all.filter((o) => o.variantId === variantId);
  const excludedOtherSpec = all.length - sameSpec.length;
  const inGroup = sameSpec.filter((o) => group === "ANY" || conditionGroupOf(o.condition) === group);
  const deduped = dedupe(inGroup);
  const within = (d: string | null) => d !== null && daysBetween(d, today) <= windowDays && daysBetween(d, today) >= 0;

  // 成約は sold_at 必須。sold_at がない「売り切れ表示」は成約として扱わない。
  const sold = deduped.filter((o) => SOLD_KINDS.includes(o.kind) && within(o.soldAt));
  const ask = deduped.filter((o) => o.kind === "ASK" && within(o.observedAt));
  const latestSoldAt = sold.reduce<string | null>((m, o) => (m === null || o.soldAt! > m ? o.soldAt : m), null);

  return {
    variantId,
    conditionGroup: group,
    windowDays,
    sold: priceStats(sold.map((o) => D(o.priceJpy))),
    verifiedSoldCount: sold.filter((o) => o.kind === "VERIFIED_SOLD").length,
    reportedSoldCount: sold.filter((o) => o.kind === "REPORTED_SOLD").length,
    ask: priceStats(ask.map((o) => D(o.priceJpy))),
    excludedOtherSpec,
    sellThroughRate: null,
    sellThroughNote: "算出不能: 対象期間の正確な出品母数データがありません",
    latestSoldAt,
  };
}

export type SaleScenarioName = "CONSERVATIVE" | "STANDARD" | "OPTIMISTIC";
export interface SaleScenarioPrice {
  name: SaleScenarioName;
  priceJpy: string | null;
  basis: string;
  isAssumption: boolean; // 成約データ不足時の仮定値
}

/**
 * 成約データから売却価格シナリオを作る。出品価格は売却見込に使わない。
 * - 成約 >= MIN_FOR_PERCENTILE: 保守=P25, 標準=中央値, 楽観=P75
 * - 成約 1〜(MIN-1): 保守=最小値×(1-追加ヘアカット), 標準=中央値（仮定扱い）, 楽観=なし
 * - 成約 0: 買取査定があれば保守=最高査定額（即時売却ルート）。それ以外は算出しない。
 */
export function saleScenarios(
  summary: MarketSummary,
  thinDataHaircut: Decimal.Value,
  bestBuybackJpy: string | null,
): SaleScenarioPrice[] {
  const s = summary.sold;
  const n = s.count;
  if (n >= MIN_FOR_PERCENTILE) {
    return [
      { name: "CONSERVATIVE", priceJpy: s.p25, basis: `成約${n}件の25パーセンタイル`, isAssumption: false },
      { name: "STANDARD", priceJpy: s.median, basis: `成約${n}件の中央値`, isAssumption: false },
      { name: "OPTIMISTIC", priceJpy: s.p75, basis: `成約${n}件の75パーセンタイル`, isAssumption: false },
    ];
  }
  if (n > 0) {
    const cons = D(s.min!).times(D(1).minus(D(thinDataHaircut))).toDecimalPlaces(0, Decimal.ROUND_DOWN);
    const consFinal = bestBuybackJpy && D(bestBuybackJpy).greaterThan(cons) ? D(bestBuybackJpy) : cons;
    return [
      {
        name: "CONSERVATIVE",
        priceJpy: consFinal.toFixed(0),
        basis: `成約${n}件の最小値から${D(thinDataHaircut).times(100).toFixed(0)}%減（データ不足のため仮定）`,
        isAssumption: true,
      },
      { name: "STANDARD", priceJpy: s.median, basis: `成約${n}件の中央値（件数不足のため仮定）`, isAssumption: true },
      { name: "OPTIMISTIC", priceJpy: null, basis: "成約件数不足のため算出しない", isAssumption: true },
    ];
  }
  return [
    {
      name: "CONSERVATIVE",
      priceJpy: bestBuybackJpy,
      basis: bestBuybackJpy ? "買取査定の最高額（即時売却ルート）" : "成約データなし",
      isAssumption: !bestBuybackJpy,
    },
    { name: "STANDARD", priceJpy: null, basis: "成約データなし", isAssumption: true },
    { name: "OPTIMISTIC", priceJpy: null, basis: "成約データなし", isAssumption: true },
  ];
}

// ───────────── 鮮度 ─────────────
export interface FreshnessRule {
  retailMaxDays: number;
  marketMaxDays: number;
  fxMaxHours: number;
  buybackMaxDays: number;
}
export function isStale(observedAt: string, maxDays: number, today: string): boolean {
  return daysBetween(observedAt, today) > maxDays;
}
