import { describe, it, expect } from "vitest";
import { selectDutyRate, defaultHsForMaterial, type DutyContext } from "@/lib/profit/duty";
import { minCertainty, fromPriceSource, fromAssumptionStatus } from "@/lib/certainty";

const ctx = (o: Partial<DutyContext> = {}): DutyContext => ({
  hsCode: "7113.11",
  hsCertainty: "CONFIRMED",
  originCountry: null,
  originCertainty: "UNVERIFIED",
  originProof: false,
  purchaseCountry: "US",
  assumptions: [
    { key: "CUSTOMS_DUTY_RATE:7113.11", value: "0.05", status: "USER_CONFIRMED", evidence_url: "https://x.test.invalid/mfn" },
    { key: "CUSTOMS_DUTY_RATE:7113.11:EPA:US", value: "0", status: "USER_CONFIRMED", evidence_url: "https://x.test.invalid/epa" },
    { key: "CUSTOMS_DUTY_RATE:7113.11:EPA:EU", value: "0.01", status: "USER_CONFIRMED", evidence_url: null },
  ],
  ...o,
});

describe("関税率の選択（商業輸入・原産国ベース）", () => {
  it("原産国未設定は一般税率", () => {
    const r = selectDutyRate(ctx());
    expect(r.rateType).toBe("MFN");
    expect(r.rate).toBe("0.05");
    expect(r.certainty).toBe("CONFIRMED");
  });
  it("原産国が確定していても原産性証明がなければ EPA を適用しない", () => {
    const r = selectDutyRate(ctx({ originCountry: "US", originCertainty: "CONFIRMED", originProof: false }));
    expect(r.rateType).toBe("MFN");
    expect(r.notes.join()).toContain("原産性の証明");
  });
  it("原産国が推定なら EPA を適用しない", () => {
    expect(selectDutyRate(ctx({ originCountry: "US", originCertainty: "ESTIMATED", originProof: true })).rateType).toBe("MFN");
  });
  it("原産国確定＋証明ありで EPA", () => {
    const r = selectDutyRate(ctx({ originCountry: "US", originCertainty: "CONFIRMED", originProof: true }));
    expect(r.rateType).toBe("EPA");
    expect(r.rate).toBe("0");
  });
  it("購入国は米国でも原産国がイタリアなら EU の協定税率（購入国の協定は使わない）", () => {
    const r = selectDutyRate(ctx({ purchaseCountry: "US", originCountry: "IT", originCertainty: "CONFIRMED", originProof: true }));
    expect(r.key).toBe("CUSTOMS_DUTY_RATE:7113.11:EPA:EU");
    expect(r.notes.join()).toContain("購入国（US）と原産国（IT）は異なります");
  });
  it("HSコードが推定なら全体も推定", () => {
    expect(selectDutyRate(ctx({ hsCertainty: "ESTIMATED" })).certainty).toBe("ESTIMATED");
  });
  it("税率未入力・HS未設定は未確認", () => {
    expect(selectDutyRate(ctx({ hsCode: "7113.19" })).certainty).toBe("UNVERIFIED");
    expect(selectDutyRate(ctx({ hsCode: null })).rate).toBeNull();
  });
  it("素材から HS 初期値", () => {
    expect(defaultHsForMaterial("SILVER_925")).toBe("7113.11");
    expect(defaultHsForMaterial("K18_WG")).toBe("7113.19");
    expect(defaultHsForMaterial("OTHER")).toBeNull();
  });
});

describe("確度の区分", () => {
  it("最も弱い根拠を採用", () => {
    expect(minCertainty("CONFIRMED", "ESTIMATED")).toBe("ESTIMATED");
    expect(minCertainty("CONFIRMED", "UNVERIFIED", "ESTIMATED")).toBe("UNVERIFIED");
    expect(fromPriceSource("BUYER_REPORT")).toBe("ESTIMATED");
    expect(fromPriceSource("OFFICIAL")).toBe("CONFIRMED");
    expect(fromAssumptionStatus("UNVERIFIED")).toBe("UNVERIFIED");
  });
});
