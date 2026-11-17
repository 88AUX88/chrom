import { describe, it, expect } from "vitest";
import { summarizeMarket, saleScenarios, dedupe, isStale, type Observation } from "@/lib/market/stats";
import { decide, DEFAULT_DECISION_SETTINGS, type DecisionInput } from "@/lib/decide/engine";
import { computeProfit } from "@/lib/profit/engine";
import { baseInputs } from "./fixtures";

const TODAY = "2026-11-17";
let id = 0;
const ob = (o: Partial<Observation>): Observation => ({
  id: ++id,
  variantId: "v-silver",
  platform: "SNKRDUNK",
  kind: "REPORTED_SOLD",
  priceJpy: "300000",
  condition: "NEW",
  observedAt: "2026-11-10",
  soldAt: "2026-11-10",
  externalRef: null,
  ...o,
});

describe("市場集計", () => {
  it("ASK と SOLD を混同しない", () => {
    const s = summarizeMarket(
      [ob({ kind: "ASK", priceJpy: "500000", soldAt: null }), ob({ priceJpy: "300000" })],
      "v-silver", "NEW_UNUSED", 90, TODAY,
    );
    expect(s.sold.count).toBe(1);
    expect(s.sold.max).toBe("300000");
    expect(s.ask.count).toBe(1);
  });

  it("別仕様（ホワイトゴールド等の別 variant）を除外", () => {
    const s = summarizeMarket([ob({ variantId: "v-wg", priceJpy: "2000000" }), ob({})], "v-silver", "NEW_UNUSED", 90, TODAY);
    expect(s.sold.count).toBe(1);
    expect(s.excludedOtherSpec).toBe(1);
  });

  it("成約日のない SOLD（売り切れ表示）は成約に数えない", () => {
    const s = summarizeMarket([ob({ soldAt: null })], "v-silver", "NEW_UNUSED", 90, TODAY);
    expect(s.sold.count).toBe(0);
  });

  it("中古は新品グループから除外", () => {
    const s = summarizeMarket([ob({ condition: "USED_B" })], "v-silver", "NEW_UNUSED", 90, TODAY);
    expect(s.sold.count).toBe(0);
  });

  it("期間外の成約を除外", () => {
    const s = summarizeMarket([ob({ soldAt: "2026-01-01" })], "v-silver", "NEW_UNUSED", 90, TODAY);
    expect(s.sold.count).toBe(0);
  });

  it("重複除去（外部ID / 同値同日）", () => {
    expect(dedupe([ob({ externalRef: "x" }), ob({ externalRef: "x", priceJpy: "1" })])).toHaveLength(1);
    expect(dedupe([ob({}), ob({})])).toHaveLength(1);
  });

  it("成約0件: 売却率は算出不能、シナリオは算出しない", () => {
    const s = summarizeMarket([], "v-silver", "NEW_UNUSED", 90, TODAY);
    expect(s.sellThroughRate).toBeNull();
    expect(s.sellThroughNote).toContain("算出不能");
    const sc = saleScenarios(s, 0.1, null);
    expect(sc.every((x) => x.priceJpy === null)).toBe(true);
  });

  it("少数件数ではパーセンタイルを出さない", () => {
    const s = summarizeMarket([ob({ priceJpy: "300000" }), ob({ priceJpy: "320000", soldAt: "2026-11-09" })], "v-silver", "NEW_UNUSED", 90, TODAY);
    expect(s.sold.p25).toBeNull();
    const sc = saleScenarios(s, 0.1, null);
    expect(sc[0].priceJpy).toBe("270000");
    expect(sc[0].isAssumption).toBe(true);
    expect(sc[2].priceJpy).toBeNull();
  });

  it("十分な件数で P25/中央値/P75", () => {
    const prices = [280000, 290000, 300000, 310000, 320000];
    const s = summarizeMarket(prices.map((p, k) => ob({ priceJpy: String(p), soldAt: `2026-11-0${k + 1}` })), "v-silver", "NEW_UNUSED", 90, TODAY);
    const sc = saleScenarios(s, 0.1, null);
    expect(sc.map((x) => x.priceJpy)).toEqual(["290000", "300000", "310000"]);
  });

  it("鮮度判定", () => {
    expect(isStale("2026-01-01", 180, TODAY)).toBe(true);
    expect(isStale("2026-11-01", 180, TODAY)).toBe(false);
  });
});

function decisionInput(over: Partial<DecisionInput> = {}): DecisionInput {
  const prices = [280000, 290000, 300000, 310000, 320000];
  const market = summarizeMarket(prices.map((p, k) => ob({ priceJpy: String(p), soldAt: `2026-11-0${k + 1}` })), "v-silver", "NEW_UNUSED", 90, TODAY);
  const scen = saleScenarios(market, 0.1, null);
  const calc = (p: string | null) => (p ? computeProfit({ ...baseInputs(), sale: { ...baseInputs().sale, priceJpy: p } }) : null);
  return {
    variantConfirmed: true,
    purchasePriceSource: "STORE_OBSERVED",
    purchasePriceAgeDays: 0,
    fxAgeHours: 1,
    importMode: "COMMERCIAL",
    dutyRateStatus: "USER_CONFIRMED",
    feeRuleStatus: "USER_CONFIRMED",
    businessTaxKnown: true,
    expenseProfileConfirmed: true,
    market,
    saleScenarios: scen,
    results: { CONSERVATIVE: calc(scen[0].priceJpy), STANDARD: calc(scen[1].priceJpy), OPTIMISTIC: calc(scen[2].priceJpy) },
    profitAtMaxSold: calc(market.sold.max),
    ...over,
  };
}

describe("BUY/HOLD/PASS", () => {
  it("すべて満たせば BUY", () => {
    expect(decide(decisionInput(), DEFAULT_DECISION_SETTINGS).decision).toBe("BUY");
  });
  it("成約データ不足なら HOLD（BUY を出さない）", () => {
    const empty = summarizeMarket([], "v-silver", "NEW_UNUSED", 90, TODAY);
    const d = decide(decisionInput({ market: empty, saleScenarios: saleScenarios(empty, 0.1, null), results: { CONSERVATIVE: null, STANDARD: null, OPTIMISTIC: null }, profitAtMaxSold: null }), DEFAULT_DECISION_SETTINGS);
    expect(d.decision).toBe("HOLD");
    expect(d.todo.join()).toContain("成約データ");
  });
  it("仕様未確定なら HOLD", () => {
    expect(decide(decisionInput({ variantConfirmed: false }), DEFAULT_DECISION_SETTINGS).decision).toBe("HOLD");
  });
  it("関税率未確認なら HOLD", () => {
    expect(decide(decisionInput({ dutyRateStatus: "UNVERIFIED" }), DEFAULT_DECISION_SETTINGS).decision).toBe("HOLD");
  });
  it("古い海外価格（推定）なら HOLD", () => {
    expect(decide(decisionInput({ purchasePriceSource: "BUYER_REPORT", purchasePriceAgeDays: 400 }), DEFAULT_DECISION_SETTINGS).decision).toBe("HOLD");
  });
  it("為替が古ければ HOLD", () => {
    expect(decide(decisionInput({ fxAgeHours: 200 }), DEFAULT_DECISION_SETTINGS).decision).toBe("HOLD");
  });
  it("経費プロファイル未確認なら HOLD", () => {
    expect(decide(decisionInput({ expenseProfileConfirmed: false }), DEFAULT_DECISION_SETTINGS).decision).toBe("HOLD");
  });
  it("個人使用モードは HOLD", () => {
    expect(decide(decisionInput({ importMode: "PERSONAL" }), DEFAULT_DECISION_SETTINGS).decision).toBe("HOLD");
  });
  it("最高成約でも赤字なら PASS", () => {
    const loss = computeProfit({ ...baseInputs(), sale: { ...baseInputs().sale, priceJpy: "100000" } });
    expect(decide(decisionInput({ profitAtMaxSold: loss }), DEFAULT_DECISION_SETTINGS).decision).toBe("PASS");
  });
  it("データ十分で標準シナリオでも基準未達なら PASS", () => {
    const d = decide(decisionInput(), { ...DEFAULT_DECISION_SETTINGS, minProfitJpy: 200000 });
    expect(d.decision).toBe("PASS");
  });
});

import { filterToCatalog } from "@/lib/identify/identify";
import { schedule } from "@/lib/learn/cards";
describe("画像認識の候補フィルタ", () => {
  it("カタログ外IDを破棄し、重複除去・最大3件", () => {
    const out = filterToCatalog(
      { observed: { category_guess: "charm", color_tone: "unclear", stones_visible: "no", engravings_seen: "", photo_quality_issues: "" },
        candidates: [
          { product_id: "made-up", reason: "", confidence: "high" },
          { product_id: "a", reason: "", confidence: "high" },
          { product_id: "a", reason: "", confidence: "low" },
          { product_id: "b", reason: "", confidence: "low" },
        ], possibly_not_in_catalog: false },
      new Set(["a", "b", "c"]),
    );
    expect(out.output.candidates.map((c) => c.product_id)).toEqual(["a", "b"]);
    expect(out.dropped).toEqual(["made-up"]);
    expect(out.output.possibly_not_in_catalog).toBe(true);
  });
});
describe("間隔反復", () => {
  it("不正解は当日再出題、正解で間隔が伸びる", () => {
    const now = new Date("2026-11-17T00:00:00Z");
    const w = schedule({ ease: 2.5, intervalDays: 3, reps: 2, lapses: 0 }, 0, now);
    expect(w.intervalDays).toBe(0);
    expect(w.lapses).toBe(1);
    const r1 = schedule({ ease: 2.5, intervalDays: 0, reps: 0, lapses: 0 }, 1, now);
    const r3 = schedule({ ease: 2.5, intervalDays: 3, reps: 2, lapses: 0 }, 1, now);
    expect(r1.intervalDays).toBe(1);
    expect(r3.intervalDays).toBeGreaterThan(3);
  });
});

describe("データ未取得と成約0件の区別", () => {
  it("観測データがない仕様は hasAnyData=false、ASKだけある仕様は true（成約0件）", () => {
    const none = summarizeMarket([], "v-silver", "NEW_UNUSED", 90, TODAY);
    expect(none.hasAnyData).toBe(false);
    const askOnly = summarizeMarket([ob({ kind: "ASK", soldAt: null })], "v-silver", "NEW_UNUSED", 90, TODAY);
    expect(askOnly.hasAnyData).toBe(true);
    expect(askOnly.sold.count).toBe(0);
    const d1 = decide(decisionInput({ market: none, saleScenarios: saleScenarios(none, 0.1, null), results: { CONSERVATIVE: null, STANDARD: null, OPTIMISTIC: null }, profitAtMaxSold: null }), DEFAULT_DECISION_SETTINGS);
    expect(d1.reasons.map((r) => r.message).join()).toContain("未取得のため成約件数は不明");
    const d2 = decide(decisionInput({ market: askOnly, saleScenarios: saleScenarios(askOnly, 0.1, null), results: { CONSERVATIVE: null, STANDARD: null, OPTIMISTIC: null }, profitAtMaxSold: null }), DEFAULT_DECISION_SETTINGS);
    expect(d2.reasons.map((r) => r.message).join()).toContain("0件");
  });
});

import { analyzeLiquidity } from "@/lib/market/liquidity";
describe("流動性分析", () => {
  it("データ未取得は全項目「不明」（0件と区別）", () => {
    const l = analyzeLiquidity([], "v-silver", "NEW_UNUSED", TODAY, 30, false);
    expect(l.dataStatus).toBe("NO_DATA");
    expect(l.soldPerMonth).toBeNull();
    expect(l.convertibility).toBe("UNKNOWN");
    expect(l.inventoryRisk).toBe("UNKNOWN");
  });
  it("出品のみ（成約0件）: 観測あり・在庫月数は算出不能・換金性低", () => {
    const l = analyzeLiquidity([ob({ kind: "ASK", soldAt: null })], "v-silver", "NEW_UNUSED", TODAY, 30, false);
    expect(l.dataStatus).toBe("OBSERVED");
    expect(l.sold90).toBe(0);
    expect(l.monthsOfSupply).toBeNull();
    expect(l.convertibility).toBe("LOW");
  });
  it("販売日数・在庫月数・出品と成約の差", () => {
    const sold = [1, 2, 3, 4, 5, 6].map((k) => ({ ...ob({ priceJpy: "100000", soldAt: `2026-11-0${k}`, externalRef: `s${k}` }), listedAt: `2026-10-2${k}` }));
    const asks = [1, 2, 3, 4].map((k) => ob({ kind: "ASK", priceJpy: "120000", soldAt: null, externalRef: `a${k}`, observedAt: "2026-11-15" }));
    const l = analyzeLiquidity([...sold, ...asks], "v-silver", "NEW_UNUSED", TODAY, 30, false);
    expect(l.sold90).toBe(6);
    expect(l.soldPerMonth).toBe(2);
    expect(l.monthsOfSupply).toBe(2);
    expect(l.inventoryRisk).toBe("MEDIUM");
    expect(l.daysToSell.median).toBe(11); // 10月は31日: 10-21→11-01 = 11日
    expect(l.askOverSoldPct).toBe(0.2);
    expect(l.convertibility).toBe("MEDIUM");
  });
});

describe("監査指摘の回帰テスト（集計・判定）", () => {
  it("#7 同じ取引IDの ASK と成約は両方残る", () => {
    const s = summarizeMarket([ob({ kind: "ASK", soldAt: null, externalRef: "m123", observedAt: "2026-11-10" }), ob({ kind: "VERIFIED_SOLD", externalRef: "m123", soldAt: "2026-11-05" })], "v-silver", "NEW_UNUSED", 90, TODAY);
    expect(s.sold.count).toBe(1);
    expect(s.ask.count).toBe(1);
  });
  it("#5 店頭確認でも記録日が古ければ HOLD", () => {
    expect(decide(decisionInput({ purchasePriceSource: "STORE_OBSERVED", purchasePriceAgeDays: 30 }), DEFAULT_DECISION_SETTINGS).decision).toBe("HOLD");
  });
  it("#6 未来の為替・未来の確認日は HOLD", () => {
    expect(decide(decisionInput({ fxAgeHours: -100 }), DEFAULT_DECISION_SETTINGS).decision).toBe("HOLD");
    expect(decide(decisionInput({ purchasePriceAgeDays: -3 }), DEFAULT_DECISION_SETTINGS).decision).toBe("HOLD");
  });
});
