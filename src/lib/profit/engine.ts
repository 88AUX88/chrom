/**
 * 利益計算エンジン（純関数）。
 *
 * 輸入税額の端数処理（国税通則法 118 条・119 条に基づく一般的な扱い。設定 docs/CALCULATIONS.md 参照）:
 *   - 課税標準: 1,000 円未満切捨て
 *   - 税額: 100 円未満切捨て
 *   - 地方消費税 = 消費税（国税）額 × 22/78（100 円未満切捨て）
 *
 * 税の二重計上防止:
 *   - 輸入消費税は現金支出には含めるが、課税事業者ビューでは仕入税額控除として取得原価から除外する。
 *   - 免税事業者ビューでは輸入消費税を取得原価に含め、売上も税込で扱う。
 */
import Decimal from "decimal.js";
import { D, ZERO, floorTo, yen } from "../money";
import type {
  TaxViewStatus,
  ImportBreakdown,
  ProfitInputs,
  ProfitOutcome,
  ProfitResult,
  TaxView,
} from "./types";

const LOW_VALUE_THRESHOLD_JPY = 10000;

/** "22/78" のような分数文字列、または小数文字列を厳密な Decimal にする（浮動小数の誤差で切捨てがずれるのを防ぐ） */
export function parseRatio(v: string): Decimal {
  const m = /^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/.exec(v);
  return m ? D(m[1]).dividedBy(D(m[2])) : D(v);
}

function requireFields(i: ProfitInputs): string[] {
  const missing: string[] = [];
  if (i.purchase.fxJpyPerUnit === null || i.purchase.fxJpyPerUnit === "")
    missing.push("為替レート");
  if (i.importing.customsDutyRate === null || i.importing.customsDutyRate === "")
    missing.push("関税率");
  if (i.sale.priceJpy === null || i.sale.priceJpy === "") missing.push("想定売却価格");
  if (i.sale.platformFeeRate === null || i.sale.platformFeeRate === "")
    missing.push("販売手数料率");
  if (i.businessTaxStatus === "SIMPLIFIED" && !i.deemedPurchaseRate) missing.push("みなし仕入率");
  return missing;
}

function validateNonNegative(i: ProfitInputs): string[] {
  const errs: string[] = [];
  const check = (label: string, v: string | null) => {
    if (v === null || v === "") return;
    let d: Decimal;
    try {
      d = D(v);
    } catch {
      errs.push(`${label}が数値ではありません`);
      return;
    }
    if (d.isNegative() || !d.isFinite()) errs.push(`${label}は0以上である必要があります`);
  };
  check("現地価格", i.purchase.price);
  check("現地税率", i.purchase.localTaxRate);
  check("還付率", i.purchase.localTaxRefundRate);
  check("為替レート", i.purchase.fxJpyPerUnit);
  check("カード手数料率", i.purchase.cardFeeRate);
  check("関税率", i.importing.customsDutyRate);
  check("国際送料", i.importing.intlShippingJpy);
  check("保険", i.importing.insuranceJpy);
  check("通関手数料", i.importing.customsBrokerFeeJpy);
  check("想定売却価格", i.sale.priceJpy);
  check("販売手数料率", i.sale.platformFeeRate);
  check("固定手数料", i.sale.platformFixedFeeJpy);
  check("国内送料", i.sale.domesticShippingJpy);
  check("梱包費", i.sale.packagingJpy);
  check("リスク控除率", i.sale.riskReserveRate);
  check("旅費配賦", i.travelAllocationJpy);
  check("その他経費", i.otherCostsJpy);
  if (errs.length) return errs; // 数値でない値があれば以降の比較をしない（例外にしない）
  check("消費税率", i.importing.jctNationalRate);
  check("みなし仕入率", i.deemedPurchaseRate ?? null);
  if (errs.length) return errs;
  if (i.purchase.fxJpyPerUnit && D(i.purchase.fxJpyPerUnit).isZero()) errs.push("為替レートが0です");
  if (D(i.importing.jctNationalRate).greaterThan(1)) errs.push("消費税率は1以下である必要があります");
  if (D(i.purchase.localTaxRefundRate).greaterThan(1)) errs.push("還付率は1以下である必要があります");
  if (i.deemedPurchaseRate && (!/^\d+(\.\d+)?$/.test(i.deemedPurchaseRate) || D(i.deemedPurchaseRate).greaterThan(1)))
    errs.push("みなし仕入率は0〜1である必要があります");
  if (i.sale.platformFeeRate && D(i.sale.platformFeeRate).greaterThanOrEqualTo(1))
    errs.push("販売手数料率は1未満である必要があります");
  return errs;
}

export function computeImportTaxes(
  customsValueJpy: Decimal,
  dutyRate: Decimal,
  i: ProfitInputs["importing"],
): ImportBreakdown {
  const lowValueExempt =
    i.applyLowValueExemption && customsValueJpy.lessThanOrEqualTo(LOW_VALUE_THRESHOLD_JPY);
  if (lowValueExempt) {
    return {
      customsValueJpy: yen(customsValueJpy).toString(),
      lowValueExempt: true,
      dutyJpy: "0",
      jctBaseJpy: "0",
      jctNationalJpy: "0",
      jctLocalJpy: "0",
      importConsumptionTaxJpy: "0",
    };
  }
  const dutyBase = floorTo(customsValueJpy, 1000);
  const duty = floorTo(dutyBase.times(dutyRate), 100);
  const jctBase = floorTo(customsValueJpy.plus(duty), 1000);
  const national = floorTo(jctBase.times(D(i.jctNationalRate)), 100);
  const local = floorTo(national.times(parseRatio(i.jctLocalRatioOfNational)), 100);
  return {
    customsValueJpy: yen(customsValueJpy).toString(),
    lowValueExempt: false,
    dutyJpy: duty.toString(),
    jctBaseJpy: jctBase.toString(),
    jctNationalJpy: national.toString(),
    jctLocalJpy: local.toString(),
    importConsumptionTaxJpy: national.plus(local).toString(),
  };
}

export function computeProfit(i: ProfitInputs): ProfitOutcome {
  const missing = requireFields(i);
  const invalid = validateNonNegative(i);
  if (missing.length || invalid.length) return { ok: false, missing: [...missing, ...invalid] };

  const warnings: string[] = [];
  const p = i.purchase;
  const fx = D(p.fxJpyPerUnit!);
  const taxRate = D(p.localTaxRate);
  const price = D(p.price);

  // 1. 現地購入
  const goodsExTax = p.priceIncludesLocalTax ? price.dividedBy(D(1).plus(taxRate)) : price;
  const localTax = p.priceIncludesLocalTax ? price.minus(goodsExTax) : price.times(taxRate);
  const paidLocal = goodsExTax.plus(localTax);
  const refund = localTax.times(D(p.localTaxRefundRate));
  if (refund.greaterThan(0))
    warnings.push("現地税の還付を見込んでいます。適用条件（購入者・持出し・手続き）を確認してください。");

  const purchaseJpy = yen(paidLocal.times(fx));
  const refundJpy = yen(refund.times(fx));
  const cardFee = yen(purchaseJpy.times(D(p.cardFeeRate)));

  // 2. 輸入
  const im = i.importing;
  const intlShip = D(im.intlShippingJpy);
  const insurance = D(im.insuranceJpy);
  const broker = D(im.customsBrokerFeeJpy);
  let customsValue: Decimal;
  if (im.mode === "COMMERCIAL") {
    // 課税価格 ≒ CIF: 実際に支払う価格（還付されない現地税を含む）+ 運賃 + 保険
    customsValue = paidLocal.minus(refund).times(fx).plus(intlShip).plus(insurance);
  } else {
    customsValue = paidLocal.times(fx).times(D(im.personalUseFactor));
    warnings.push(
      "個人使用の特例（×0.6）で計算しています。販売目的の輸入には適用されません。金・白金等の国際相場品は特例対象外の場合があります。",
    );
  }
  const imp = computeImportTaxes(customsValue, D(im.customsDutyRate!), im);
  const duty = D(imp.dutyJpy);
  const importCT = D(imp.importConsumptionTaxJpy);

  const travel = D(i.travelAllocationJpy);
  const other = D(i.otherCostsJpy);

  // 現金支出（取得まで）: 還付は後日入金のため控除して純額化
  const landedCash = purchaseJpy
    .minus(refundJpy)
    .plus(cardFee)
    .plus(intlShip)
    .plus(insurance)
    .plus(broker)
    .plus(duty)
    .plus(importCT)
    .plus(travel);

  // 3. 売却
  const s = i.sale;
  const sale = D(s.priceJpy!);
  const fee = yen(sale.times(D(s.platformFeeRate!))).plus(D(s.platformFixedFeeJpy));
  const ship = D(s.domesticShippingJpy);
  const pack = D(s.packagingJpy);
  const risk = yen(sale.times(D(s.riskReserveRate)));
  const sellingGross = fee.plus(ship).plus(pack);

  const cashFlow = sale.minus(risk).minus(landedCash).minus(sellingGross).minus(other);

  const jctRate = D(im.jctStandardRate);
  const exTax = (v: Decimal) => v.dividedBy(D(1).plus(jctRate));
  const taxPart = (v: Decimal) => v.minus(exTax(v));

  const buildView = (status: TaxViewStatus): TaxView => {
    let revenue: Decimal, riskR: Decimal, acq: Decimal, selling: Decimal, settlement: Decimal;
    let deemedCredit = ZERO;
    if (status === "SIMPLIFIED") {
      // 簡易課税: 輸入消費税・国内経費の消費税は実額控除できない → 原価は税込のまま
      revenue = exTax(sale);
      riskR = exTax(risk);
      acq = landedCash;
      selling = sellingGross;
      const outputTax = taxPart(sale.minus(risk));
      deemedCredit = outputTax.times(D(i.deemedPurchaseRate!));
      settlement = outputTax.minus(deemedCredit);
    } else if (status === "TAXABLE") {
      revenue = exTax(sale);
      riskR = exTax(risk);
      // 輸入消費税は仕入税額控除の対象 → 取得原価に含めない（二重計上防止）
      acq = purchaseJpy
        .minus(refundJpy)
        .plus(cardFee)
        .plus(intlShip)
        .plus(insurance)
        .plus(exTax(broker))
        .plus(duty)
        .plus(travel);
      const feeEx = s.platformFeeIncludesJct ? exTax(fee) : fee;
      selling = feeEx.plus(exTax(ship)).plus(exTax(pack));
      const outputTax = taxPart(sale.minus(risk));
      const inputTax = importCT
        .plus(taxPart(broker))
        .plus(s.platformFeeIncludesJct ? taxPart(fee) : ZERO)
        .plus(taxPart(ship))
        .plus(taxPart(pack));
      settlement = outputTax.minus(inputTax);
    } else {
      revenue = sale;
      riskR = risk;
      acq = landedCash;
      selling = sellingGross;
      settlement = ZERO;
    }
    const gross = revenue.minus(riskR).minus(acq);
    const afterSelling = gross.minus(selling);
    const preTax = afterSelling.minus(other).plus(deemedCredit);
    const netRevenue = revenue.minus(riskR);
    return {
      status,
      revenueJpy: yen(revenue).toString(),
      riskReserveJpy: yen(riskR).toString(),
      acquisitionCostJpy: yen(acq).toString(),
      sellingExpensesJpy: yen(selling).toString(),
      grossProfitJpy: yen(gross).toString(),
      profitAfterSellingJpy: yen(afterSelling).toString(),
      preTaxProfitJpy: yen(preTax).toString(),
      marginRate: netRevenue.isZero() ? null : preTax.dividedBy(netRevenue).toDecimalPlaces(6).toString(),
      roi: landedCash.isZero() ? null : preTax.dividedBy(landedCash).toDecimalPlaces(6).toString(),
      jctSettlementJpy: yen(settlement).toString(),
      deemedCreditJpy: yen(deemedCredit).toString(),
      cashAfterJctSettlementJpy: yen(cashFlow.minus(settlement)).toString(),
    };
  };

  let views: TaxView[];
  let adopted: TaxView;
  if (i.businessTaxStatus === "UNKNOWN") {
    views = [buildView("TAXABLE"), buildView("EXEMPT")];
    adopted = D(views[0].preTaxProfitJpy).lessThanOrEqualTo(D(views[1].preTaxProfitJpy)) ? views[0] : views[1];
    warnings.push("消費税の課税事業者区分が未設定のため、課税・免税の両方で計算し低い方を採用しました（要確認）。");
  } else {
    adopted = buildView(i.businessTaxStatus);
    views = [adopted];
  }

  const result: ProfitResult = {
    ok: true,
    purchaseLocal: {
      goodsPriceExTax: goodsExTax.toDecimalPlaces(2).toString(),
      localTax: localTax.toDecimalPlaces(2).toString(),
      localTaxRefund: refund.toDecimalPlaces(2).toString(),
      paidLocal: paidLocal.toDecimalPlaces(2).toString(),
    },
    purchaseJpy: purchaseJpy.toString(),
    cardFeeJpy: cardFee.toString(),
    importBreakdown: imp,
    landedCashOutlayJpy: yen(landedCash).toString(),
    purchaseTotalJpy: purchaseJpy.minus(refundJpy).plus(cardFee).toString(),
    saleProceedsJpy: sale.minus(fee).toString(),
    netReceiptJpy: sale.minus(fee).minus(ship).minus(pack).toString(),
    costLines: {
      platformFeeJpy: fee.toString(),
      domesticShippingJpy: ship.toString(),
      packagingJpy: pack.toString(),
      intlShippingJpy: intlShip.toString(),
      insuranceJpy: insurance.toString(),
      customsBrokerFeeJpy: broker.toString(),
      travelAllocationJpy: travel.toString(),
      otherCostsJpy: other.toString(),
      riskReserveJpy: risk.toString(),
    },
    cashFlowBeforeJctSettlementJpy: yen(cashFlow).toString(),
    adopted,
    views,
    warnings,
  };
  return result;
}

// ───────────── 逆算（二分探索。端数処理で階段状でも単調性は保たれる） ─────────────

function profitOf(i: ProfitInputs): Decimal | null {
  const r = computeProfit(i);
  return r.ok ? D(r.adopted.preTaxProfitJpy) : null;
}

/** 税引前利益 >= target となる最小の売却価格（円）。見つからなければ null。 */
export function requiredSalePrice(i: ProfitInputs, targetProfitJpy: Decimal.Value = 0): Decimal | null {
  const target = D(targetProfitJpy);
  const at = (price: Decimal) => profitOf({ ...i, sale: { ...i.sale, priceJpy: price.toString() } });
  let lo = D(0);
  let hi = D(1000);
  for (let k = 0; k < 40; k++) {
    const v = at(hi);
    if (v === null) return null;
    if (v.greaterThanOrEqualTo(target)) break;
    hi = hi.times(2);
    if (k === 39) return null;
  }
  while (hi.minus(lo).greaterThan(1)) {
    const mid = lo.plus(hi).dividedBy(2).floor();
    const v = at(mid)!;
    if (v.greaterThanOrEqualTo(target)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * 利益 >= targetProfit かつ ROI >= targetRoi を満たす最大の現地価格（現地通貨、0.01 単位）。
 * 0 でも満たせない場合は null。
 */
export function maxPurchasePrice(
  i: ProfitInputs,
  targetProfitJpy: Decimal.Value,
  targetRoi: Decimal.Value | null,
): Decimal | null {
  const tp = D(targetProfitJpy);
  const ok = (localPrice: Decimal): boolean | null => {
    const r = computeProfit({ ...i, purchase: { ...i.purchase, price: localPrice.toFixed(2) } });
    if (!r.ok) return null;
    const pOk = D(r.adopted.preTaxProfitJpy).greaterThanOrEqualTo(tp);
    // 投下資金 0（ROI 未定義）の場合は利益条件のみで判定
    const rOk =
      targetRoi === null || r.adopted.roi === null || D(r.adopted.roi).greaterThanOrEqualTo(D(targetRoi));
    return pOk && rOk;
  };
  const base = ok(D(0));
  if (base === null || base === false) return null;
  // 単位: セント
  let lo = D(0);
  let hi = D(100);
  for (let k = 0; k < 50; k++) {
    if (!ok(hi.dividedBy(100))) break;
    lo = hi;
    hi = hi.times(2);
  }
  while (hi.minus(lo).greaterThan(1)) {
    const mid = lo.plus(hi).dividedBy(2).floor();
    if (ok(mid.dividedBy(100))) lo = mid;
    else hi = mid;
  }
  return lo.dividedBy(100);
}
