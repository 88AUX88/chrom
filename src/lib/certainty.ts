/**
 * 確定値 / 推定値 / 未確認 の三区分（表示と判定の共通語彙）。
 * 一番弱い根拠が全体の区分になる（min）。
 */
export type Certainty = "CONFIRMED" | "ESTIMATED" | "UNVERIFIED";
export const CERTAINTY_LABEL: Record<Certainty, string> = { CONFIRMED: "確定", ESTIMATED: "推定", UNVERIFIED: "未確認" };

const RANK: Record<Certainty, number> = { UNVERIFIED: 0, ESTIMATED: 1, CONFIRMED: 2 };
export function minCertainty(...xs: Certainty[]): Certainty {
  return xs.reduce<Certainty>((m, x) => (RANK[x] < RANK[m] ? x : m), "CONFIRMED");
}

/** 税前提・手数料の status */
export function fromAssumptionStatus(s: string | null | undefined, hasValue = true): Certainty {
  if (!hasValue) return "UNVERIFIED";
  return s === "VERIFIED" || s === "USER_CONFIRMED" ? "CONFIRMED" : "UNVERIFIED";
}

/** 仕入価格の根拠 */
export function fromPriceSource(s: string | null | undefined): Certainty {
  if (s === "STORE_OBSERVED" || s === "OFFICIAL" || s === "RECEIPT") return "CONFIRMED";
  if (s === "BUYER_REPORT" || s === "ESTIMATE") return "ESTIMATED";
  return "UNVERIFIED";
}

/** 出典の信頼性 */
export function fromReliability(s: string | null | undefined): Certainty {
  if (s === "VERIFIED") return "CONFIRMED";
  if (s === "REPORTED" || s === "ESTIMATED") return "ESTIMATED";
  return "UNVERIFIED";
}

export function isCertainty(v: unknown): v is Certainty {
  return v === "CONFIRMED" || v === "ESTIMATED" || v === "UNVERIFIED";
}
