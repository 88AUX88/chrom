/**
 * 関税率の選択（純関数）。販売目的の商業輸入を前提とする。
 *
 * - 関税率は「原産国」で決まる。購入国（例: 米国の正規店）とは区別する。
 * - EPA/協定の特恵税率は、原産国が確定し、かつ原産性を証明できる（原産品申告等）場合のみ適用。
 *   それ以外は一般の税率（WTO協定税率等 = MFN）を適用する（通常こちらが高く、保守的）。
 * - HS コードは素材からの推定（7113.11 銀 / 7113.19 その他貴金属）を初期値とし、本人確認まで「推定」。
 * - 個人使用の簡易税率・特例はここでは一切使わない。
 */
import { minCertainty, fromAssumptionStatus, type Certainty } from "../certainty";

export interface DutyAssumption {
  key: string;
  value: string | null;
  status: string;
  evidence_url: string | null;
}

export interface DutyContext {
  hsCode: string | null;
  hsCertainty: Certainty;
  originCountry: string | null; // ISO 3166-1 alpha-2
  originCertainty: Certainty;
  originProof: boolean; // 原産品申告書等で原産性を証明できる
  purchaseCountry: string;
  assumptions: DutyAssumption[];
}

export interface DutySelection {
  hsCode: string | null;
  rateType: "MFN" | "EPA" | null;
  key: string | null;
  rate: string | null;
  certainty: Certainty;
  evidenceUrl: string | null;
  notes: string[];
}

export const EU_MEMBERS = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

/** 素材から HS コードの初期値（推定） */
export function defaultHsForMaterial(material: string): string | null {
  if (material === "SILVER_925") return "7113.11";
  if (["K18_WG", "K18_YG", "K22_YG", "K22_WG", "PLATINUM"].includes(material)) return "7113.19";
  return null;
}

export const mfnKey = (hs: string) => `CUSTOMS_DUTY_RATE:${hs}`;
export const epaKey = (hs: string, partner: string) => `CUSTOMS_DUTY_RATE:${hs}:EPA:${partner}`;

export function selectDutyRate(c: DutyContext): DutySelection {
  const notes: string[] = [];
  if (c.originCountry && c.originCountry !== c.purchaseCountry)
    notes.push(`購入国（${c.purchaseCountry}）と原産国（${c.originCountry}）は異なります。関税は原産国で判定します`);
  if (!c.hsCode) {
    return { hsCode: null, rateType: null, key: null, rate: null, certainty: "UNVERIFIED", evidenceUrl: null, notes: [...notes, "HSコードが未設定です"] };
  }
  const find = (k: string) => c.assumptions.find((a) => a.key === k && a.value !== null);

  // EPA の適用可否
  if (c.originCountry) {
    const partners = [c.originCountry, ...(EU_MEMBERS.has(c.originCountry) ? ["EU"] : [])];
    const epa = partners.map((p) => find(epaKey(c.hsCode!, p))).find(Boolean);
    if (epa) {
      const epaOk = c.originCertainty === "CONFIRMED" && c.originProof && fromAssumptionStatus(epa.status) === "CONFIRMED";
      if (epaOk) {
        return {
          hsCode: c.hsCode,
          rateType: "EPA",
          key: epa.key,
          rate: epa.value,
          certainty: minCertainty(c.hsCertainty, c.originCertainty, fromAssumptionStatus(epa.status)),
          evidenceUrl: epa.evidence_url,
          notes: [...notes, "原産国確定・原産性証明ありのため協定（EPA）税率を適用"],
        };
      }
      notes.push(
        c.originCertainty !== "CONFIRMED"
          ? "原産国が未確定のため協定（EPA）税率は適用せず一般税率で計算"
          : !c.originProof
            ? "原産性の証明（原産品申告等）がないため協定（EPA）税率は適用せず一般税率で計算"
            : "協定（EPA）税率が未確認のため一般税率で計算",
      );
    }
  } else {
    notes.push("原産国が未設定のため一般税率（WTO協定税率等）で計算");
  }

  const mfn = find(mfnKey(c.hsCode));
  const status = c.assumptions.find((a) => a.key === mfnKey(c.hsCode!));
  if (!mfn) {
    return { hsCode: c.hsCode, rateType: "MFN", key: mfnKey(c.hsCode), rate: null, certainty: "UNVERIFIED", evidenceUrl: status?.evidence_url ?? null, notes: [...notes, `HS ${c.hsCode} の関税率が未入力です`] };
  }
  return {
    hsCode: c.hsCode,
    rateType: "MFN",
    key: mfn.key,
    rate: mfn.value,
    // 一般税率は原産国に依存しない（WTO加盟国前提）ため原産国の確度は含めない
    certainty: minCertainty(c.hsCertainty, fromAssumptionStatus(mfn.status)),
    evidenceUrl: mfn.evidence_url,
    notes,
  };
}
