/**
 * 需要・流動性分析（純関数）。
 * データがないことと「成約0件」を区別する（dataStatus）。推測で埋めない。
 */
import Decimal from "decimal.js";
import { D } from "../money";
import { conditionGroupOf, daysBetween, dedupe, priceStats, SOLD_KINDS, type ConditionGroup, type Observation, type PriceStats } from "./stats";

export type Level = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export interface Liquidity {
  dataStatus: "NO_DATA" | "OBSERVED";
  sold30: number;
  sold90: number;
  soldPerMonth: number | null; // 90日ベース
  activeAsks: number; // 有効期間内の出品
  askStats: PriceStats;
  soldStats90: PriceStats;
  monthsOfSupply: number | null; // 出品数 ÷ 月間成約
  daysToSell: { median: number | null; n: number }; // 出品日→成約日（記録がある成約のみ）
  askOverSoldPct: number | null; // 出品中央値 / 成約中央値 - 1
  inventoryRisk: Level;
  convertibility: Level; // 換金容易性
  notes: string[];
}

export function analyzeLiquidity(
  obs: (Observation & { listedAt?: string | null })[],
  variantId: string,
  group: ConditionGroup,
  today: string,
  askMaxAgeDays: number,
  hasBuyback: boolean,
): Liquidity {
  const notes: string[] = [];
  const same = dedupe(obs.filter((o) => o.variantId === variantId && (group === "ANY" || conditionGroupOf(o.condition) === group)));
  const inWin = (d: string | null, w: number) => d !== null && daysBetween(d, today) >= 0 && daysBetween(d, today) <= w;
  const sold = same.filter((o) => SOLD_KINDS.includes(o.kind) && o.soldAt);
  const sold90 = sold.filter((o) => inWin(o.soldAt, 90));
  const sold30 = sold.filter((o) => inWin(o.soldAt, 30));
  const asks = same.filter((o) => o.kind === "ASK" && inWin(o.observedAt, askMaxAgeDays));
  const dataStatus = same.length === 0 ? "NO_DATA" : "OBSERVED";
  if (dataStatus === "NO_DATA") notes.push("この仕様の市場データは未取得です（成約0件とは異なります）");

  const soldPerMonth = dataStatus === "NO_DATA" ? null : sold90.length / 3;
  const monthsOfSupply = soldPerMonth && soldPerMonth > 0 ? asks.length / soldPerMonth : null;
  if (dataStatus === "OBSERVED" && sold90.length === 0) notes.push("観測データはありますが、90日間の成約は0件です");

  const dts = sold90.filter((o) => o.listedAt).map((o) => daysBetween(o.listedAt!, o.soldAt!)).filter((d) => d >= 0).sort((a, b) => a - b);
  const daysMedian = dts.length ? (dts.length % 2 ? dts[(dts.length - 1) / 2] : (dts[dts.length / 2 - 1] + dts[dts.length / 2]) / 2) : null;
  if (sold90.length && !dts.length) notes.push("販売までの日数: 出品日の記録がないため算出不能");

  const soldStats90 = priceStats(sold90.map((o) => D(o.priceJpy)));
  const askStats = priceStats(asks.map((o) => D(o.priceJpy)));
  const askOverSoldPct = soldStats90.median && askStats.median ? D(askStats.median).dividedBy(D(soldStats90.median)).minus(1).toDecimalPlaces(4).toNumber() : null;

  const inventoryRisk: Level = monthsOfSupply === null ? "UNKNOWN" : monthsOfSupply > 6 ? "HIGH" : monthsOfSupply >= 2 ? "MEDIUM" : "LOW";
  if (monthsOfSupply === null && dataStatus === "OBSERVED") notes.push("在庫リスク: 月間成約が0のため在庫月数を算出できません");
  let convertibility: Level;
  if (dataStatus === "NO_DATA" && !hasBuyback) convertibility = "UNKNOWN";
  else if (hasBuyback || (soldPerMonth ?? 0) >= 4) convertibility = "HIGH";
  else if ((soldPerMonth ?? 0) >= 1) convertibility = "MEDIUM";
  else convertibility = "LOW";
  if (hasBuyback) notes.push("買取査定があるため即時換金ルートあり（価格は査定額）");

  return {
    dataStatus,
    sold30: sold30.length,
    sold90: sold90.length,
    soldPerMonth: soldPerMonth === null ? null : new Decimal(soldPerMonth).toDecimalPlaces(2).toNumber(),
    activeAsks: asks.length,
    askStats,
    soldStats90,
    monthsOfSupply: monthsOfSupply === null ? null : new Decimal(monthsOfSupply).toDecimalPlaces(1).toNumber(),
    daysToSell: { median: daysMedian, n: dts.length },
    askOverSoldPct,
    inventoryRisk,
    convertibility,
    notes,
  };
}

export const LEVEL_LABEL: Record<Level, string> = { HIGH: "高", MEDIUM: "中", LOW: "低", UNKNOWN: "不明" };
