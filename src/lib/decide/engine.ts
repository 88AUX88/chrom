/**
 * BUY / HOLD / PASS 判定（純関数）。
 * 原則: データ不足・前提未確認なら絶対に BUY を出さない（HOLD）。
 * PASS は「十分なデータがあり、それでも基準に届かない」または「確認できた最高成約でも赤字」のときのみ。
 */
import { D } from "../money";
import type { ImportMode, ProfitOutcome } from "../profit/types";
import type { MarketSummary, SaleScenarioPrice } from "../market/stats";
import type { AssumptionStatus } from "@/db/schema";

export type Decision = "BUY" | "HOLD" | "PASS";

export interface DecisionSettings {
  minProfitJpy: number; // 保守シナリオの最低税引前利益
  minRoi: number; // 保守シナリオの最低 ROI（0.1 = 10%）
  minSoldCount: number; // 判定に必要な同一仕様の成約件数
  marketWindowDays: number; // 成約を数える期間
  retailMaxAgeDays: number;
  marketMaxAgeDays: number;
  fxMaxAgeHours: number;
  fxBufferRate: number; // 保守シナリオの為替上振れ
  thinDataHaircut: number; // 成約件数不足時の追加ヘアカット
}

export const DEFAULT_DECISION_SETTINGS: DecisionSettings = {
  // 初期値は仮置き。設定画面で利用者が決定する。
  minProfitJpy: 10000,
  minRoi: 0.1,
  minSoldCount: 3,
  marketWindowDays: 90,
  retailMaxAgeDays: 180,
  marketMaxAgeDays: 30,
  fxMaxAgeHours: 48,
  fxBufferRate: 0.03,
  thinDataHaircut: 0.1,
};

export type PurchasePriceSource = "STORE_OBSERVED" | "OFFICIAL" | "RECEIPT" | "BUYER_REPORT" | "ESTIMATE" | "UNKNOWN";

export interface DecisionInput {
  variantConfirmed: boolean;
  purchasePriceSource: PurchasePriceSource;
  purchasePriceAgeDays: number | null;
  fxAgeHours: number | null;
  importMode: ImportMode;
  dutyRateStatus: AssumptionStatus;
  feeRuleStatus: AssumptionStatus;
  businessTaxKnown: boolean;
  expenseProfileConfirmed: boolean;
  market: MarketSummary;
  saleScenarios: SaleScenarioPrice[];
  results: { CONSERVATIVE: ProfitOutcome | null; STANDARD: ProfitOutcome | null; OPTIMISTIC: ProfitOutcome | null };
  /** 確認できた最高成約価格での利益（赤字判定用） */
  profitAtMaxSold: ProfitOutcome | null;
}

export interface Reason {
  level: "BLOCKER" | "WARNING" | "OK" | "FAIL";
  message: string;
}

export interface DecisionOutput {
  decision: Decision;
  reasons: Reason[];
  /** 判定前に確認すべき項目 */
  todo: string[];
}

export function decide(input: DecisionInput, st: DecisionSettings): DecisionOutput {
  const reasons: Reason[] = [];
  const todo: string[] = [];
  const blocker = (m: string, t?: string) => {
    reasons.push({ level: "BLOCKER", message: m });
    if (t) todo.push(t);
  };

  // 1. 商品同一性
  if (!input.variantConfirmed) blocker("商品・仕様（素材/サイズ/石）が人間により確定されていません", "商品と仕様を確定する");
  else reasons.push({ level: "OK", message: "商品・仕様は確定済み" });

  // 2. 仕入価格
  const trusted: PurchasePriceSource[] = ["STORE_OBSERVED", "OFFICIAL", "RECEIPT"];
  if (!trusted.includes(input.purchasePriceSource))
    blocker(
      `仕入価格の根拠が「${input.purchasePriceSource}」で未確認です`,
      "店頭価格・公式価格・レシートで仕入価格を確認する",
    );
  if (input.purchasePriceSource !== "STORE_OBSERVED") {
    if (input.purchasePriceAgeDays === null) blocker("仕入価格の確認日が不明です", "仕入価格の確認日を記録する");
    else if (input.purchasePriceAgeDays > st.retailMaxAgeDays)
      blocker(`海外価格が古い（${input.purchasePriceAgeDays}日前）`, "最新の海外価格を確認する");
  }

  // 3. 為替
  if (input.fxAgeHours === null) blocker("為替レートがありません", "為替レートを登録する");
  else if (input.fxAgeHours > st.fxMaxAgeHours)
    blocker(`為替レートが古い（${Math.round(input.fxAgeHours)}時間前）`, "為替レートを更新する");

  // 4. 前提条件
  if (input.importMode !== "COMMERCIAL")
    blocker("個人使用の特例で計算されています。販売目的の買付には使えません", "輸入区分を「商業輸入」にする");
  if (input.dutyRateStatus === "UNVERIFIED") blocker("関税率が未確認です", "関税率（HSコード）を税関資料で確認し設定で確定する");
  if (input.feeRuleStatus === "UNVERIFIED") blocker("販売手数料率が未確認です", "販売先の最新手数料を確認し設定で確定する");
  if (!input.expenseProfileConfirmed)
    blocker("経費プロファイル（カード手数料・送料・旅費等）が未確認の仮置き値です", "設定で経費を確認し「確認済み」にする");
  if (!input.businessTaxKnown)
    reasons.push({ level: "WARNING", message: "消費税の課税事業者区分が未設定（低い方の利益で計算）" });

  // 5. 市場データ
  const m = input.market;
  const soldN = m.sold.count;
  const dataSufficient = soldN >= st.minSoldCount;
  if (!dataSufficient)
    blocker(
      `同一仕様の成約が${m.windowDays}日間で${soldN}件（必要${st.minSoldCount}件）`,
      "同一仕様（素材・サイズ・状態）の成約データを追加する",
    );
  else reasons.push({ level: "OK", message: `同一仕様の成約 ${soldN}件（${m.windowDays}日間）` });
  if (m.latestSoldAt === null && m.ask.count > 0)
    reasons.push({ level: "WARNING", message: "出品価格しかありません（出品価格は売却見込に使用しません）" });
  if (m.reportedSoldCount > 0 && m.verifiedSoldCount === 0)
    reasons.push({ level: "WARNING", message: "成約はすべてプラットフォーム等の報告値です（VERIFIED ではない）" });
  if (m.sold.count > 0 && m.latestSoldAt) {
    reasons.push({ level: "OK", message: `最新成約日 ${m.latestSoldAt}` });
  }
  for (const sc of input.saleScenarios) if (sc.isAssumption && sc.priceJpy) reasons.push({ level: "WARNING", message: `${scLabel(sc.name)}: ${sc.basis}` });

  // 6. 利益
  const cons = input.results.CONSERVATIVE;
  const std = input.results.STANDARD;
  const meets = (r: ProfitOutcome | null) =>
    r !== null && r.ok && D(r.adopted.preTaxProfitJpy).greaterThanOrEqualTo(st.minProfitJpy) &&
    r.adopted.roi !== null && D(r.adopted.roi).greaterThanOrEqualTo(st.minRoi);

  if (input.profitAtMaxSold && input.profitAtMaxSold.ok && D(input.profitAtMaxSold.adopted.preTaxProfitJpy).isNegative()) {
    reasons.push({ level: "FAIL", message: "確認できた最高成約価格で売れても赤字です" });
    return { decision: "PASS", reasons, todo };
  }

  if (cons === null || !cons.ok) {
    blocker("保守シナリオの利益が計算できません", cons && !cons.ok ? `不足: ${cons.missing.join("、")}` : undefined);
  } else if (meets(cons)) {
    reasons.push({ level: "OK", message: "保守シナリオで利益・ROI基準を満たす" });
  } else {
    reasons.push({ level: "FAIL", message: "保守シナリオで利益またはROI基準に届かない" });
  }

  const hasBlocker = reasons.some((r) => r.level === "BLOCKER");

  // PASS: データ十分かつ標準シナリオでも基準未達
  if (dataSufficient && std && std.ok && !meets(std)) {
    reasons.push({ level: "FAIL", message: "標準シナリオ（成約中央値）でも基準に届かない" });
    return { decision: "PASS", reasons, todo };
  }
  if (hasBlocker) return { decision: "HOLD", reasons, todo };
  if (meets(cons)) return { decision: "BUY", reasons, todo };
  todo.push("仕入価格の交渉・別の国/販売先を比較する");
  return { decision: "HOLD", reasons, todo };
}

export function scLabel(n: string): string {
  return n === "CONSERVATIVE" ? "保守" : n === "STANDARD" ? "標準" : "楽観";
}
