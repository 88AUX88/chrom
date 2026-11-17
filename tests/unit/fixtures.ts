import type { ProfitInputs } from "@/lib/profit/types";

/** テスト用入力（実データではない） */
export function baseInputs(over: Partial<ProfitInputs> = {}): ProfitInputs {
  return {
    purchase: {
      currency: "USD",
      price: "1000",
      priceIncludesLocalTax: false,
      localTaxRate: "0.08875",
      localTaxRefundRate: "0",
      fxJpyPerUnit: "150",
      cardFeeRate: "0.02",
    },
    importing: {
      mode: "COMMERCIAL",
      customsDutyRate: "0.05",
      jctNationalRate: "0.078",
      jctLocalRatioOfNational: "22/78",
      jctStandardRate: "0.10",
      intlShippingJpy: "0",
      insuranceJpy: "0",
      customsBrokerFeeJpy: "0",
      applyLowValueExemption: true,
      personalUseFactor: "0.6",
    },
    sale: {
      priceJpy: "300000",
      platformFeeRate: "0.1",
      platformFixedFeeJpy: "0",
      platformFeeIncludesJct: true,
      domesticShippingJpy: "1100",
      packagingJpy: "550",
      riskReserveRate: "0",
    },
    travelAllocationJpy: "0",
    otherCostsJpy: "0",
    businessTaxStatus: "EXEMPT",
    ...over,
  };
}
