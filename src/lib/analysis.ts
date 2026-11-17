import "server-only";
import Decimal from "decimal.js";
import { D } from "./money";
import { computeProfit, maxPurchasePrice, requiredSalePrice } from "./profit/engine";
import type { ProfitInputs, ProfitOutcome } from "./profit/types";
import { saleScenarios, soldObservations, summarizeMarket, type ConditionGroup, type MarketSummary, type SaleScenarioPrice } from "./market/stats";
import { decide, type DecisionOutput, type PurchasePriceSource } from "./decide/engine";
import {
  buybackFor,
  currentFeeRules,
  currentTaxAssumptions,
  getBusinessTaxStatus,
  getDecisionSettings,
  getExpenseProfile,
  getVariant,
  latestFx,
  latestPlan,
  marketObservationsFor,
} from "./data";
import { defaultHsForMaterial, selectDutyRate, type DutySelection } from "./profit/duty";
import { fromAssumptionStatus, fromPriceSource, minCertainty, isCertainty, type Certainty } from "./certainty";
import type { AssumptionStatus } from "@/db/schema";

export interface AnalysisRequest {
  variantId: string;
  country: string;
  currency: string;
  price: string | null;
  priceSource: PurchasePriceSource;
  priceObservedAt: string | null;
  priceIncludesLocalTax: boolean;
  localTaxRate: string;
  platform: string;
  conditionGroup: ConditionGroup;
  fxOverride: string | null; // 店頭で確認したレート等（入力時点を基準日時とする）
  priceEvidenceUrl?: string | null;
  manualSalePriceJpy: string | null; // 利用者の仮定（判定には使わない）
}

export interface ScenarioOut extends SaleScenarioPrice {
  result: ProfitOutcome | null;
  fxUsed: string | null;
}

export interface SourceRef {
  label: string;
  url: string | null;
  date: string | null;
  certainty: Certainty;
}

export interface Analysis {
  req: AnalysisRequest;
  plan: Awaited<ReturnType<typeof latestPlan>>;
  duty: DutySelection;
  purchaseCountry: string;
  originCountry: string | null;
  originCertainty: Certainty;
  certainty: {
    purchasePrice: Certainty;
    fx: Certainty;
    duty: Certainty;
    importTax: Certainty;
    fee: Certainty;
    expenses: Certainty;
    acquisition: Certainty;
    profit: Certainty;
    jctSettlement: Certainty;
  };
  lossRisk: { soldCount: number; belowBreakEven: number; negativeScenarios: string[] };
  sources: SourceRef[];
  variantFound: boolean;
  productName: string;
  material: string;
  dutyKey: string;
  dutyRate: string | null;
  dutyStatus: AssumptionStatus;
  fee: { rate: string | null; status: AssumptionStatus; platform: string; evidenceUrl: string | null };
  fx: { rate: string | null; asOf: string | null; source: string | null; ageHours: number | null };
  market: MarketSummary;
  bestBuyback: string | null;
  scenarios: ScenarioOut[];
  decision: DecisionOutput;
  maxPurchaseLocal: string | null;
  breakEvenSaleJpy: string | null;
  targetSaleJpy: string | null;
  expenseConfirmed: boolean;
  businessTaxStatus: string;
}


export async function analyze(req: AnalysisRequest, today = new Date()): Promise<Analysis | null> {
  const v = await getVariant(req.variantId);
  if (!v) return null;
  const [settings, taxStatus, expense, fees, taxes, obs, buyback, fxRow, plan] = await Promise.all([
    getDecisionSettings(),
    getBusinessTaxStatus(),
    getExpenseProfile(),
    currentFeeRules(),
    currentTaxAssumptions(),
    marketObservationsFor(v.product.id).then((rows) => rows.filter((o) => o.country === "JP")), // 売却は日本国内
    buybackFor(req.variantId),
    latestFx(req.currency),
    latestPlan(req.variantId),
  ]);
  const todayStr = today.toISOString().slice(0, 10);

  // 関税: HS コード（計画で確定 or 素材からの推定）× 原産国（購入国とは別）
  const hsCode = plan?.hsCode ?? defaultHsForMaterial(v.variant.material);
  const hsCertainty: Certainty = plan?.hsCode && isCertainty(plan.hsCertainty) ? plan.hsCertainty : hsCode ? "ESTIMATED" : "UNVERIFIED";
  const originCertainty: Certainty = plan?.originCountry && isCertainty(plan.originCertainty) ? plan.originCertainty : "UNVERIFIED";
  const dutySel = selectDutyRate({
    hsCode,
    hsCertainty,
    originCountry: plan?.originCountry ?? null,
    originCertainty,
    originProof: plan?.originProof ?? false,
    purchaseCountry: req.country,
    assumptions: taxes,
  });
  const deemed = taxes.find((t) => t.key === "DEEMED_PURCHASE_RATE");
  const jct = taxes.find((t) => t.key === "JCT_NATIONAL_RATE");
  const personal = taxes.find((t) => t.key === "PERSONAL_USE_FACTOR");
  const fee = fees.find((f) => f.platform === req.platform);

  // 為替
  let fx: Analysis["fx"];
  if (req.fxOverride) fx = { rate: req.fxOverride, asOf: today.toISOString(), source: "手入力（店頭/カード会社確認）", ageHours: 0 };
  else if (fxRow) {
    const asOf = new Date(fxRow.asOf);
    fx = { rate: String(fxRow.jpyPerUnit), asOf: asOf.toISOString(), source: fxRow.source, ageHours: (today.getTime() - asOf.getTime()) / 3600000 };
  } else fx = { rate: null, asOf: null, source: null, ageHours: null };

  const e = expense.data;
  const base: ProfitInputs = {
    purchase: {
      currency: req.currency,
      price: req.price ?? "0",
      priceIncludesLocalTax: req.priceIncludesLocalTax,
      localTaxRate: req.localTaxRate || "0",
      localTaxRefundRate: e.localTaxRefundRate,
      fxJpyPerUnit: fx.rate,
      cardFeeRate: e.cardFeeRate,
    },
    importing: {
      mode: e.importMode,
      customsDutyRate: dutySel.rate,
      jctNationalRate: jct?.value ?? "0.078",
      jctLocalRatioOfNational: "22/78",
      jctStandardRate: "0.10",
      intlShippingJpy: e.intlShippingJpy,
      insuranceJpy: e.insuranceJpy,
      customsBrokerFeeJpy: e.customsBrokerFeeJpy,
      applyLowValueExemption: e.applyLowValueExemption,
      personalUseFactor: personal?.value ?? "0.6",
    },
    sale: {
      priceJpy: null,
      platformFeeRate: fee?.fee_rate ?? null,
      platformFixedFeeJpy: fee?.fixed_fee_jpy ?? "0",
      platformFeeIncludesJct: fee?.fee_includes_jct ?? true,
      domesticShippingJpy: e.domesticShippingJpy,
      packagingJpy: e.packagingJpy,
      riskReserveRate: e.riskReserveRate,
    },
    travelAllocationJpy: e.travelAllocationJpy,
    otherCostsJpy: e.otherCostsJpy,
    businessTaxStatus: taxStatus,
    deemedPurchaseRate: deemed?.value ?? null,
  };

  const market = summarizeMarket(obs, req.variantId, req.conditionGroup, settings.marketWindowDays, todayStr);
  const sameCondBuyback = buyback.filter((b) => req.conditionGroup === "ANY" || (["NEW", "UNUSED"].includes(b.condition) ? "NEW_UNUSED" : "USED") === req.conditionGroup);
  const bestBuyback = sameCondBuyback.reduce<string | null>((m, b) => (m === null || D(b.priceJpy).greaterThan(m) ? String(b.priceJpy) : m), null);
  let scen = saleScenarios(market, settings.thinDataHaircut, bestBuyback);
  if (req.platform === "BUYBACK") {
    // 買取店ルート: 売却価格は査定額（成約相場ではない）
    const b = { priceJpy: bestBuyback, basis: bestBuyback ? "買取査定の最高額" : "買取査定データなし", isAssumption: !bestBuyback };
    scen = [{ name: "CONSERVATIVE", ...b }, { name: "STANDARD", ...b }, { name: "OPTIMISTIC", ...b }];
  }
  const manualSale = req.manualSalePriceJpy ?? (plan?.plannedSalePriceJpy ? String(plan.plannedSalePriceJpy) : null);
  if (manualSale && scen[1].priceJpy === null)
    scen[1] = { name: "STANDARD", priceJpy: manualSale, basis: "利用者入力の売却予定価格（仮定・判定根拠には不十分）", isAssumption: true };

  const withSale = (i: ProfitInputs, price: string | null, fxMul: Decimal.Value = 1): ProfitInputs => ({
    ...i,
    purchase: { ...i.purchase, fxJpyPerUnit: i.purchase.fxJpyPerUnit ? D(i.purchase.fxJpyPerUnit).times(fxMul).toString() : null },
    sale: { ...i.sale, priceJpy: price },
  });
  const hasPrice = req.price !== null && req.price !== "";
  const scenarios: ScenarioOut[] = scen.map((sc) => {
    const fxMul = sc.name === "CONSERVATIVE" ? D(1).plus(settings.fxBufferRate) : D(1);
    const inputs = withSale(base, sc.priceJpy, fxMul);
    return { ...sc, fxUsed: inputs.purchase.fxJpyPerUnit, result: sc.priceJpy && hasPrice ? computeProfit(inputs) : null };
  });

  const profitAtMaxSold = market.sold.max && hasPrice ? computeProfit(withSale(base, market.sold.max)) : null;
  const ageDays = req.priceObservedAt ? Math.floor((today.getTime() - Date.parse(req.priceObservedAt + "T00:00:00Z")) / 86400000) : null;

  const decision = decide(
    {
      variantConfirmed: true, // variant はユーザーが仕様選択で作成した時点で確定
      purchasePriceSource: hasPrice ? req.priceSource : "UNKNOWN",
      purchasePriceAgeDays: req.priceSource === "STORE_OBSERVED" ? 0 : ageDays,
      fxAgeHours: fx.ageHours,
      importMode: e.importMode,
      dutyRateStatus: dutySel.certainty === "CONFIRMED" ? "USER_CONFIRMED" : "UNVERIFIED",
      feeRuleStatus: fee?.fee_rate !== null && fee?.fee_rate !== undefined ? fee.status : "UNVERIFIED",
      businessTaxKnown: taxStatus !== "UNKNOWN",
      expenseProfileConfirmed: e.confirmed,
      market,
      saleScenarios: scen,
      results: {
        CONSERVATIVE: scenarios[0].result,
        STANDARD: scenarios[1].priceJpy && !scenarios[1].basis.startsWith("利用者入力") ? scenarios[1].result : null,
        OPTIMISTIC: scenarios[2].result,
      },
      profitAtMaxSold,
      extraBlockers:
        taxStatus === "SIMPLIFIED" && fromAssumptionStatus(deemed?.status, !!deemed?.value) !== "CONFIRMED"
          ? [{ message: "簡易課税のみなし仕入率が未確認です", todo: "設定で DEEMED_PURCHASE_RATE を確認・入力する" }]
          : [],
      extraWarnings: dutySel.notes,
    },
    settings,
  );
  if (!hasPrice) decision.todo.unshift("仕入価格（現地価格）を入力する");

  // 逆算（保守シナリオ基準）
  const consInputs = scenarios[0].priceJpy ? withSale(base, scenarios[0].priceJpy, D(1).plus(settings.fxBufferRate)) : null;
  const maxLocal = consInputs ? maxPurchasePrice(consInputs, settings.minProfitJpy, settings.minRoi) : null;
  const be = hasPrice ? requiredSalePrice(withSale(base, "0"), 0) : null;
  const target = hasPrice ? requiredSalePrice(withSale(base, "0"), settings.minProfitJpy) : null;

  // 確度（確定/推定/未確認）
  const cPrice: Certainty = hasPrice ? fromPriceSource(req.priceSource) : "UNVERIFIED";
  const cFx: Certainty = !fx.rate ? "UNVERIFIED" : fx.ageHours !== null && fx.ageHours <= settings.fxMaxAgeHours ? "CONFIRMED" : "ESTIMATED";
  const cFee = fromAssumptionStatus(fee?.status, fee?.fee_rate !== null && fee?.fee_rate !== undefined);
  const cExp: Certainty = e.confirmed ? "CONFIRMED" : "ESTIMATED";
  const cAcq = minCertainty(cPrice, cFx, dutySel.certainty, cExp);
  const cTaxStatus: Certainty = taxStatus === "UNKNOWN" ? "UNVERIFIED" : taxStatus === "SIMPLIFIED" ? fromAssumptionStatus(deemed?.status, !!deemed?.value) : "CONFIRMED";
  const anyProfit = scenarios.some((x) => x.result?.ok);
  const cProfit: Certainty = anyProfit ? minCertainty(cAcq, cFee, "ESTIMATED") : "UNVERIFIED";

  // 赤字リスク: 確認できた成約価格のうち損益分岐を下回るもの
  const sold = soldObservations(obs, req.variantId, req.conditionGroup, settings.marketWindowDays, todayStr);
  const lossRisk = {
    soldCount: sold.length,
    belowBreakEven: be ? sold.filter((o) => D(o.priceJpy).lessThan(be)).length : 0,
    negativeScenarios: scenarios.filter((x) => x.result?.ok && D(x.result.adopted.preTaxProfitJpy).isNegative()).map((x) => x.name),
  };

  const sources: SourceRef[] = [
    { label: `仕入価格（${req.country}）`, url: req.priceEvidenceUrl ?? plan?.priceEvidenceUrl ?? null, date: req.priceObservedAt, certainty: cPrice },
    { label: `為替（${fx.source ?? "未登録"}）`, url: null, date: fx.asOf ? fx.asOf.slice(0, 10) : null, certainty: cFx },
    { label: `関税率（HS ${dutySel.hsCode ?? "未設定"}・${dutySel.rateType === "EPA" ? "協定税率" : "一般税率"}）`, url: dutySel.evidenceUrl, date: null, certainty: dutySel.certainty },
    { label: `HSコード`, url: plan?.hsEvidenceUrl ?? null, date: plan ? new Date(plan.createdAt).toISOString().slice(0, 10) : null, certainty: hsCertainty },
    { label: `販売手数料（${req.platform}）`, url: fee?.evidence_url ?? null, date: fee?.effective_from ?? null, certainty: cFee },
    ...[...sold]
      .sort((a, b) => (b.soldAt! > a.soldAt! ? 1 : -1))
      .slice(0, 3)
      .map((o) => ({ label: `成約 ${o.platform} ¥${D(o.priceJpy).toFixed(0)}`, url: o.evidenceUrl ?? null, date: o.soldAt, certainty: o.kind === "VERIFIED_SOLD" ? ("CONFIRMED" as const) : ("ESTIMATED" as const) })),
  ];

  return {
    req,
    plan,
    duty: dutySel,
    purchaseCountry: req.country,
    originCountry: plan?.originCountry ?? null,
    originCertainty,
    certainty: {
      purchasePrice: cPrice,
      fx: cFx,
      duty: dutySel.certainty,
      importTax: minCertainty(cPrice, cFx, dutySel.certainty),
      fee: cFee,
      expenses: cExp,
      acquisition: cAcq,
      profit: cProfit,
      jctSettlement: minCertainty(cProfit, cTaxStatus),
    },
    lossRisk,
    sources,
    variantFound: true,
    productName: v.product.nameEn,
    material: v.variant.material,
    dutyKey: dutySel.key ?? "",
    dutyRate: dutySel.rate,
    dutyStatus: dutySel.certainty === "CONFIRMED" ? "USER_CONFIRMED" : "UNVERIFIED",
    fee: { rate: fee?.fee_rate ?? null, status: fee?.status ?? "UNVERIFIED", platform: req.platform, evidenceUrl: fee?.evidence_url ?? null },
    fx,
    market,
    bestBuyback,
    scenarios,
    decision,
    maxPurchaseLocal: maxLocal ? maxLocal.toFixed(2) : null,
    breakEvenSaleJpy: be ? be.toFixed(0) : null,
    targetSaleJpy: target ? target.toFixed(0) : null,
    expenseConfirmed: e.confirmed,
    businessTaxStatus: taxStatus,
  };
}
