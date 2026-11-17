import type { ImportMode } from "./profit/types";

/**
 * 経費プロファイル。初期値はすべて仮置き（confirmed=false）。
 * 未確認のままでは BUY 判定を出さない。
 */
export interface ExpenseProfileData {
  confirmed: boolean;
  importMode: ImportMode;
  cardFeeRate: string; // カード海外事務手数料（例 0.022）
  localTaxRefundRate: string; // 現地税の還付見込割合（不明なら 0）
  intlShippingJpy: string; // 国際送料（手荷物持込なら 0）
  insuranceJpy: string;
  customsBrokerFeeJpy: string;
  travelAllocationJpy: string; // 1 商品あたり旅費配賦
  domesticShippingJpy: string;
  packagingJpy: string;
  riskReserveRate: string; // 返品・値下げ・不良リスク
  otherCostsJpy: string;
  applyLowValueExemption: boolean;
}

export const DEFAULT_EXPENSE_PROFILE: ExpenseProfileData = {
  confirmed: false,
  importMode: "COMMERCIAL",
  cardFeeRate: "0",
  localTaxRefundRate: "0",
  intlShippingJpy: "0",
  insuranceJpy: "0",
  customsBrokerFeeJpy: "0",
  travelAllocationJpy: "0",
  domesticShippingJpy: "0",
  packagingJpy: "0",
  riskReserveRate: "0.05",
  otherCostsJpy: "0",
  applyLowValueExemption: true,
};

export const MATERIAL_LABEL: Record<string, string> = {
  SILVER_925: "シルバー925",
  K18_WG: "18K ホワイトゴールド",
  K18_YG: "18K イエローゴールド",
  K22_YG: "22K イエローゴールド",
  K22_WG: "22K ホワイトゴールド",
  PLATINUM: "プラチナ",
  OTHER: "その他",
};

export const CATEGORY_LABEL: Record<string, string> = {
  RING: "リング",
  PENDANT: "ペンダント",
  CHARM: "チャーム",
  EARRING: "ピアス",
  CHAIN: "チェーン",
  BRACELET: "ブレスレット",
  OTHER: "その他",
};

export function variantIdFor(productId: string, material: string, hasStones: boolean, sizeLabel: string | null): string {
  const size = (sizeLabel ?? "").toLowerCase().replace(/[^a-z0-9.]+/g, "").replace(/\./g, "_");
  return [productId, material.toLowerCase().replace(/_/g, ""), hasStones ? "stones" : "nostone", size || "onesize"].join("-");
}

export function variantLabel(v: { material: string; hasStones: boolean; stoneType?: string | null; sizeLabel: string | null }): string {
  return [MATERIAL_LABEL[v.material] ?? v.material, v.hasStones ? `石付き${v.stoneType ? `(${v.stoneType})` : ""}` : "石なし", v.sizeLabel ?? "サイズ指定なし"].join(" / ");
}
