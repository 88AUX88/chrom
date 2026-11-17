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
