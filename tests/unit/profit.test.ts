import { describe, it, expect } from "vitest";
import { computeProfit, maxPurchasePrice, requiredSalePrice, computeImportTaxes } from "@/lib/profit/engine";
import { D } from "@/lib/money";
import { baseInputs } from "./fixtures";
import type { ProfitResult } from "@/lib/profit/types";

const ok = (r: ReturnType<typeof computeProfit>): ProfitResult => {
  if (!r.ok) throw new Error("expected ok: " + r.missing.join(","));
  return r;
};

describe("computeProfit — 手計算との一致", () => {
  it("免税事業者・商業輸入（USD1000+NY税8.875%, 関税5%）", () => {
    const r = ok(computeProfit(baseInputs()));
    expect(r.purchaseLocal.paidLocal).toBe("1088.75");
    expect(r.purchaseJpy).toBe("163313"); // 163312.5 → 四捨五入
    expect(r.cardFeeJpy).toBe("3266");
    expect(r.importBreakdown.dutyJpy).toBe("8100"); // floor1000(163312.5)=163000 ×5% = 8150 → 100円未満切捨 8100
    expect(r.importBreakdown.jctBaseJpy).toBe("171000");
    expect(r.importBreakdown.jctNationalJpy).toBe("13300");
    expect(r.importBreakdown.jctLocalJpy).toBe("3700");
    expect(r.importBreakdown.importConsumptionTaxJpy).toBe("17000");
    expect(r.landedCashOutlayJpy).toBe("191679");
    expect(r.adopted.status).toBe("EXEMPT");
    expect(r.adopted.preTaxProfitJpy).toBe("76671");
    expect(r.cashFlowBeforeJctSettlementJpy).toBe("76671");
  });

  it("課税事業者: 輸入消費税を取得原価から除外し、二重計上しない", () => {
    const r = ok(computeProfit(baseInputs({ businessTaxStatus: "TAXABLE" })));
    const v = r.adopted;
    expect(v.status).toBe("TAXABLE");
    // 取得原価 = 163313 + 3266 + 8100（輸入消費税 17000 を含まない）
    expect(v.acquisitionCostJpy).toBe("174679");
    expect(v.revenueJpy).toBe("272727");
    expect(v.preTaxProfitJpy).toBe("69276");
    expect(v.jctSettlementJpy).toBe("7395");
    // 整合性: 免税ビューのキャッシュフロー − 消費税精算 = 課税ビューの利益
    expect(D(r.cashFlowBeforeJctSettlementJpy).minus(v.jctSettlementJpy).toNumber()).toBe(69276);
  });

  it("課税区分不明: 両方計算し低い方を採用、警告を出す", () => {
    const r = ok(computeProfit(baseInputs({ businessTaxStatus: "UNKNOWN" })));
    expect(r.views).toHaveLength(2);
    expect(r.adopted.preTaxProfitJpy).toBe("69276");
    expect(r.warnings.join()).toContain("課税事業者区分");
  });

  it("税込表示価格（欧州VAT込）から税抜を逆算し、還付見込を反映", () => {
    const i = baseInputs();
    i.purchase = { ...i.purchase, currency: "EUR", price: "1200", priceIncludesLocalTax: true, localTaxRate: "0.20", localTaxRefundRate: "0.5", fxJpyPerUnit: "160" };
    const r = ok(computeProfit(i));
    expect(r.purchaseLocal.goodsPriceExTax).toBe("1000");
    expect(r.purchaseLocal.localTax).toBe("200");
    expect(r.purchaseLocal.localTaxRefund).toBe("100");
    // 課税価格 = (1200-100)×160 = 176000
    expect(r.importBreakdown.customsValueJpy).toBe("176000");
    expect(r.warnings.join()).toContain("還付");
  });

  it("為替変動: 円安で利益が減る", () => {
    const a = ok(computeProfit(baseInputs()));
    const b = ok(computeProfit(baseInputs({ purchase: { ...baseInputs().purchase, fxJpyPerUnit: "160" } })));
    expect(D(b.adopted.preTaxProfitJpy).lessThan(D(a.adopted.preTaxProfitJpy))).toBe(true);
  });

  it("手数料変更が反映される", () => {
    const a = ok(computeProfit(baseInputs()));
    const i = baseInputs();
    i.sale = { ...i.sale, platformFeeRate: "0.15" };
    const b = ok(computeProfit(i));
    expect(D(a.adopted.preTaxProfitJpy).minus(b.adopted.preTaxProfitJpy).toNumber()).toBe(15000);
  });

  it("送料・旅費・保険・通関手数料が原価に入る", () => {
    const i = baseInputs();
    i.importing = { ...i.importing, intlShippingJpy: "5000", insuranceJpy: "1000", customsBrokerFeeJpy: "2200" };
    i.travelAllocationJpy = "20000";
    const r = ok(computeProfit(i));
    // 課税価格に運賃・保険を加算
    expect(r.importBreakdown.customsValueJpy).toBe(String(Math.round(163312.5 + 6000)));
    expect(D(r.landedCashOutlayJpy).greaterThan(191679 + 28200)).toBe(true);
  });

  it("赤字ケース", () => {
    const i = baseInputs();
    i.sale = { ...i.sale, priceJpy: "150000" };
    const r = ok(computeProfit(i));
    expect(D(r.adopted.preTaxProfitJpy).isNegative()).toBe(true);
    expect(D(r.adopted.roi!).isNegative()).toBe(true);
  });

  it("少額免税（課税価格1万円以下）", () => {
    const i = baseInputs();
    i.purchase = { ...i.purchase, price: "50", localTaxRate: "0" };
    const r = ok(computeProfit(i));
    expect(r.importBreakdown.lowValueExempt).toBe(true);
    expect(r.importBreakdown.importConsumptionTaxJpy).toBe("0");
  });

  it("個人使用モードは×0.6で計算し、転売不可の警告を出す", () => {
    const i = baseInputs();
    i.importing = { ...i.importing, mode: "PERSONAL" };
    const r = ok(computeProfit(i));
    expect(r.importBreakdown.customsValueJpy).toBe(String(Math.round(163312.5 * 0.6)));
    expect(r.warnings.join()).toContain("販売目的の輸入には適用されません");
  });

  it("不明項目（関税率・為替・売却価格・手数料）は計算せず不足を返す", () => {
    const i = baseInputs();
    i.importing = { ...i.importing, customsDutyRate: null };
    i.purchase = { ...i.purchase, fxJpyPerUnit: null };
    i.sale = { ...i.sale, priceJpy: null, platformFeeRate: null };
    const r = computeProfit(i);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toEqual(["為替レート", "関税率", "想定売却価格", "販売手数料率"]);
  });

  it("負の値・不正値を拒否", () => {
    const i = baseInputs();
    i.purchase = { ...i.purchase, price: "-1" };
    const r = computeProfit(i);
    expect(r.ok).toBe(false);
  });

  it("浮動小数点誤差が出ない（0.1+0.2問題）", () => {
    const i = baseInputs();
    i.purchase = { ...i.purchase, price: "0.1", localTaxRate: "0" };
    i.importing = { ...i.importing, intlShippingJpy: "0" };
    const r = ok(computeProfit(i));
    expect(r.purchaseLocal.paidLocal).toBe("0.1");
  });
});

describe("computeImportTaxes — 端数処理", () => {
  it("課税標準 千円未満切捨・税額 百円未満切捨・地方税=国税×22/78", () => {
    const r = computeImportTaxes(D("100999"), D("0"), baseInputs().importing);
    expect(r.jctBaseJpy).toBe("100000");
    expect(r.jctNationalJpy).toBe("7800");
    expect(r.jctLocalJpy).toBe("2200");
  });
});

describe("逆算", () => {
  it("損益分岐売却価格: その価格で利益>=0、1円下で<0", () => {
    const i = baseInputs();
    const be = requiredSalePrice(i, 0)!;
    const at = (p: string) => ok(computeProfit({ ...i, sale: { ...i.sale, priceJpy: p } })).adopted.preTaxProfitJpy;
    expect(D(at(be.toString())).greaterThanOrEqualTo(0)).toBe(true);
    expect(D(at(be.minus(1).toString())).lessThan(0)).toBe(true);
  });

  it("目標利益に必要な売却価格", () => {
    const i = baseInputs();
    const p = requiredSalePrice(i, 50000)!;
    const prof = ok(computeProfit({ ...i, sale: { ...i.sale, priceJpy: p.toString() } })).adopted.preTaxProfitJpy;
    expect(D(prof).greaterThanOrEqualTo(50000)).toBe(true);
  });

  it("最大仕入許容価格: その価格で基準達成、0.01上で未達", () => {
    const i = baseInputs();
    const mp = maxPurchasePrice(i, 30000, 0.1)!;
    expect(mp.greaterThan(0)).toBe(true);
    const r1 = ok(computeProfit({ ...i, purchase: { ...i.purchase, price: mp.toFixed(2) } }));
    const r2 = ok(computeProfit({ ...i, purchase: { ...i.purchase, price: mp.plus(0.01).toFixed(2) } }));
    expect(D(r1.adopted.preTaxProfitJpy).greaterThanOrEqualTo(30000) && D(r1.adopted.roi!).greaterThanOrEqualTo(0.1)).toBe(true);
    expect(D(r2.adopted.preTaxProfitJpy).greaterThanOrEqualTo(30000) && D(r2.adopted.roi!).greaterThanOrEqualTo(0.1)).toBe(false);
  });

  it("価格0でも基準未達なら null", () => {
    const i = baseInputs();
    i.sale = { ...i.sale, priceJpy: "1000" };
    expect(maxPurchasePrice(i, 30000, null)).toBeNull();
  });
});

describe("消費税区分ごとの控除の扱い", () => {
  it("簡易課税: 輸入消費税を実額控除しない（原価に含める）。みなし仕入率で納付額を計算", () => {
    const r = ok(computeProfit({ ...baseInputs(), businessTaxStatus: "SIMPLIFIED", deemedPurchaseRate: "0.8" }));
    const v = r.adopted;
    expect(v.status).toBe("SIMPLIFIED");
    // 取得原価は現金支出（輸入消費税17,000円を含む）
    expect(v.acquisitionCostJpy).toBe("191679");
    // 売上の消費税 = 300000 - 300000/1.1 = 27272.73 → 納付 = 20% = 5454.55
    expect(v.jctSettlementJpy).toBe("5455");
    // 手残り（精算後）= 免税CF 76671 - 5454.55
    expect(v.cashAfterJctSettlementJpy).toBe("71216");
    expect(v.preTaxProfitJpy).toBe("71216");
  });

  it("簡易課税でみなし仕入率が未設定なら計算しない", () => {
    const r = computeProfit({ ...baseInputs(), businessTaxStatus: "SIMPLIFIED" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toContain("みなし仕入率");
  });

  it("全区分で 精算後の手残り = 税引前利益（二重計上・控除漏れがない）", () => {
    for (const st of ["TAXABLE", "EXEMPT", "SIMPLIFIED"] as const) {
      const r = ok(computeProfit({ ...baseInputs({ importing: { ...baseInputs().importing, customsBrokerFeeJpy: "3300" } }), businessTaxStatus: st, deemedPurchaseRate: "0.8" }));
      expect(Math.abs(Number(r.adopted.cashAfterJctSettlementJpy) - Number(r.adopted.preTaxProfitJpy))).toBeLessThanOrEqual(1);
    }
  });

  it("原則課税のみ輸入消費税を控除（免税・簡易は原価に含む）", () => {
    const acq = (st: "TAXABLE" | "EXEMPT" | "SIMPLIFIED") => Number(ok(computeProfit({ ...baseInputs(), businessTaxStatus: st, deemedPurchaseRate: "0.8" })).adopted.acquisitionCostJpy);
    expect(acq("EXEMPT") - acq("TAXABLE")).toBe(17000);
    expect(acq("SIMPLIFIED")).toBe(acq("EXEMPT"));
  });
});
