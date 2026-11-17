/**
 * 利益計算エンジンの入出力型。
 * 金額・率はすべて文字列（Decimal で解釈）。null は「不明」を意味し、計算不能として扱う。
 */

/** COMMERCIAL: 販売目的の商業輸入 / PERSONAL: 個人使用目的（転売には使えない参考計算） */
export type ImportMode = "COMMERCIAL" | "PERSONAL";

/** 消費税の納税義務者区分。UNKNOWN の場合は両方で計算し低い方を採用する。 */
export type BusinessTaxStatus = "TAXABLE" | "EXEMPT" | "UNKNOWN";

export interface PurchaseInput {
  currency: string; // ISO 4217
  price: string; // 現地の表示価格
  priceIncludesLocalTax: boolean;
  localTaxRate: string; // 例 "0.08875"
  /** 現地税のうち実際に戻る見込み割合（還付代行手数料控除後）。条件不明なら "0"。 */
  localTaxRefundRate: string;
  fxJpyPerUnit: string | null; // 1 単位あたり円
  cardFeeRate: string; // 海外事務手数料等（円換算額に対する率）
}

export interface ImportInput {
  mode: ImportMode;
  customsDutyRate: string | null; // 関税率（不明なら null）
  /** 消費税（国税）率 7.8% と地方消費税（国税の 22/78）は法定値だが設定で変更可能 */
  jctNationalRate: string; // "0.078"
  jctLocalRatioOfNational: string; // "22/78"（分数表記可）
  jctStandardRate: string; // "0.10" 国内取引の税込→税抜計算用
  intlShippingJpy: string; // 国際送料（国際輸送は消費税免税）
  insuranceJpy: string;
  customsBrokerFeeJpy: string; // 通関手数料（国内役務: 消費税込）
  /** 課税価格 1 万円以下の少額免税を適用するか */
  applyLowValueExemption: boolean;
  /** 個人使用の特例: 海外小売価格 × この係数（通常 0.6）。金・白金等の国際相場品は対象外の場合あり。 */
  personalUseFactor: string;
}

export interface SaleInput {
  priceJpy: string | null; // 想定売却価格（税込・購入者支払額）
  platformFeeRate: string | null; // 販売手数料率（不明なら null）
  platformFixedFeeJpy: string;
  platformFeeIncludesJct: boolean;
  domesticShippingJpy: string; // 消費税込
  packagingJpy: string; // 消費税込
  /** 返品・値下げ・不良の見込み損失（売却価格に対する率） */
  riskReserveRate: string;
}

export interface ProfitInputs {
  purchase: PurchaseInput;
  importing: ImportInput;
  sale: SaleInput;
  travelAllocationJpy: string; // 旅費配賦（消費税なし扱い）
  otherCostsJpy: string; // その他経費（消費税なし扱い）
  businessTaxStatus: BusinessTaxStatus;
}

export interface ImportBreakdown {
  customsValueJpy: string; // 課税価格
  lowValueExempt: boolean;
  dutyJpy: string;
  jctBaseJpy: string; // 消費税の課税標準（千円未満切捨て後）
  jctNationalJpy: string;
  jctLocalJpy: string;
  importConsumptionTaxJpy: string; // 輸入消費税（国+地方）
}

export interface TaxView {
  status: "TAXABLE" | "EXEMPT";
  revenueJpy: string; // 売上（TAXABLE は税抜）
  riskReserveJpy: string;
  acquisitionCostJpy: string; // 取得原価
  sellingExpensesJpy: string; // 販売経費
  grossProfitJpy: string; // 粗利益 = 売上 - リスク控除 - 取得原価
  profitAfterSellingJpy: string; // 販売経費控除後
  preTaxProfitJpy: string; // 税引前利益（法人税・所得税は未考慮）
  marginRate: string | null; // 税引前利益 / 売上
  roi: string | null; // 税引前利益 / 投下資金（キャッシュ支出ベース取得原価）
  jctSettlementJpy: string; // 消費税の納付(+)/還付(-)見込（TAXABLE のみ）
}

export interface ProfitResult {
  ok: true;
  purchaseLocal: {
    goodsPriceExTax: string;
    localTax: string;
    localTaxRefund: string;
    paidLocal: string; // 店頭支払額（還付前）
  };
  purchaseJpy: string; // 支払額の円換算
  cardFeeJpy: string;
  importBreakdown: ImportBreakdown;
  /** 取得までの現金支出合計（輸入消費税・旅費含む） */
  landedCashOutlayJpy: string;
  /** 売却完了時点の税引前キャッシュフロー（消費税精算前） */
  cashFlowBeforeJctSettlementJpy: string;
  /** 採用ビュー（UNKNOWN の場合は低い方） */
  adopted: TaxView;
  views: TaxView[];
  warnings: string[];
}

export interface ProfitMissing {
  ok: false;
  missing: string[];
}

export type ProfitOutcome = ProfitResult | ProfitMissing;
