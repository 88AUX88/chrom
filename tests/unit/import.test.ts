import { describe, it, expect } from "vitest";
import { validateCsv, type RefContext } from "@/lib/import/validate";

const ctx = (): RefContext => ({
  productIds: new Set(["ch-baby-fat-cross-charm"]),
  variantIds: new Set(["ch-baby-fat-cross-charm-silver"]),
  brandIds: new Set(["chrome-hearts"]),
  existingKeys: new Set(),
  today: "2026-11-17",
});
const enc = (s: string) => new TextEncoder().encode(s);
const MO_HEAD = "variant_id,platform,kind,price_jpy,condition,source_url,source_name,source_type,reliability,observed_at,sold_at,external_ref\n";
const mo = (rest: string) => enc(MO_HEAD + rest);

describe("CSV取込検証", () => {
  it("正常な成約行を受理", () => {
    const r = validateCsv("market_observations", mo("ch-baby-fat-cross-charm-silver,SNKRDUNK,REPORTED_SOLD,52000,NEW,https://snkrdunk.com/x,SNKRDUNK,MARKETPLACE,REPORTED,2026-11-10,2026-11-09,t1\n"), ctx());
    expect(r.fileErrors).toEqual([]);
    expect(r.accepted).toHaveLength(1);
  });

  it("UTF-8 以外（Shift_JIS バイト）をファイルごと拒否", () => {
    const sjis = new Uint8Array([0x83, 0x4e, 0x83, 0x8d, 0x81, 0x5b, 0x83, 0x80]); // "クローム" in SJIS
    const r = validateCsv("market_observations", sjis, ctx());
    expect(r.fileErrors[0]).toContain("UTF-8");
  });

  it("文字化け（UTF-8をLatin-1で読んだ痕跡）を隔離", () => {
    const r = validateCsv("market_observations", mo("ch-baby-fat-cross-charm-silver,SNKRDUNK,REPORTED_SOLD,52000,NEW,https://snkrdunk.com/x,ã‚¹ãƒ‹ãƒ€ãƒ³,MARKETPLACE,REPORTED,2026-11-10,2026-11-09,\n"), ctx());
    expect(r.quarantine[0].reasons.join()).toContain("文字化け");
  });

  it("存在しない商品ID・不正価格・日付・未来日を隔離", () => {
    const r = validateCsv("market_observations", mo("unknown-variant,SNKRDUNK,REPORTED_SOLD,¥52000,NEW,https://snkrdunk.com/x,S,MARKETPLACE,REPORTED,2026/11/10,2027-01-01,\n"), ctx());
    const reasons = r.quarantine[0].reasons.join("|");
    expect(reasons).toContain("variant_id が存在しません");
    expect(reasons).toContain("数値形式ではありません");
    expect(reasons).toContain("observed_at");
    expect(reasons).toContain("未来日");
  });

  it("成約日のない SOLD / SOLD_OUT 区分 / sold_at 付き ASK を隔離", () => {
    const r = validateCsv(
      "market_observations",
      mo(
        "ch-baby-fat-cross-charm-silver,SNKRDUNK,REPORTED_SOLD,52000,NEW,https://snkrdunk.com/x,S,MARKETPLACE,REPORTED,2026-11-10,,\n" +
          "ch-baby-fat-cross-charm-silver,SNKRDUNK,SOLD_OUT,52000,NEW,https://snkrdunk.com/x,S,MARKETPLACE,REPORTED,2026-11-10,,\n" +
          "ch-baby-fat-cross-charm-silver,SNKRDUNK,ASK,52000,NEW,https://snkrdunk.com/x,S,MARKETPLACE,REPORTED,2026-11-10,2026-11-10,\n",
      ),
      ctx(),
    );
    expect(r.accepted).toHaveLength(0);
    expect(r.quarantine).toHaveLength(3);
  });

  it("出典URLなし・example.com を隔離", () => {
    const r = validateCsv(
      "market_observations",
      mo(
        "ch-baby-fat-cross-charm-silver,SNKRDUNK,ASK,52000,NEW,,S,MARKETPLACE,REPORTED,2026-11-10,,\n" +
          "ch-baby-fat-cross-charm-silver,SNKRDUNK,ASK,52000,NEW,https://example.com/a,S,MARKETPLACE,REPORTED,2026-11-10,,\n",
      ),
      ctx(),
    );
    expect(r.quarantine.map((q) => q.reasons.join())).toEqual([
      expect.stringContaining("出典URLがありません"),
      expect.stringContaining("example.com"),
    ]);
  });

  it("ファイル内重複・既存重複を隔離", () => {
    const line = "ch-baby-fat-cross-charm-silver,SNKRDUNK,REPORTED_SOLD,52000,NEW,https://snkrdunk.com/x,S,MARKETPLACE,REPORTED,2026-11-10,2026-11-09,t9\n";
    const r = validateCsv("market_observations", mo(line + line), ctx());
    expect(r.accepted).toHaveLength(1);
    expect(r.quarantine[0].reasons).toContain("ファイル内で重複しています");
  });

  it("BUYMA等の価格を正規定価として取り込まない", () => {
    const csv = "variant_id,country,currency,amount,price_kind,tax_inclusion,source_url,source_name,source_type,reliability,observed_at\n" +
      "ch-baby-fat-cross-charm-silver,US,USD,400,OFFICIAL,EXCLUDED,https://www.buyma.com/x,BUYMA,MARKETPLACE,REPORTED,2026-11-10\n";
    const r = validateCsv("retail_prices", enc(csv), ctx());
    expect(r.quarantine[0].reasons.join()).toContain("正規定価として取り込めません");
  });

  it("YouTube出典は公開日とタイムスタンプ必須", () => {
    const csv = "variant_id,country,currency,amount,price_kind,tax_inclusion,source_url,source_name,source_type,reliability,observed_at\n" +
      "ch-baby-fat-cross-charm-silver,US,USD,400,BUYER_REPORT,EXCLUDED,https://www.youtube.com/watch?v=abc,YT,YOUTUBE,REPORTED,2026-11-10\n";
    const r = validateCsv("retail_prices", enc(csv), ctx());
    expect(r.quarantine[0].reasons.join()).toContain("video_published_at");
  });

  it("必須列不足・不明列はファイルエラー", () => {
    const r = validateCsv("fx_rates", enc("currency,rate\nUSD,150\n"), ctx());
    expect(r.fileErrors.join()).toContain("必須列");
  });

  it("同じファイルで追加した variant を参照できる", () => {
    const csv = "id,product_id,material,has_stones,catalog_status,stone_type\n" +
      "ch-baby-fat-cross-charm-k18wg,ch-baby-fat-cross-charm,K18_WG,false,UNVERIFIED,\n" +
      "ch-baby-fat-cross-charm-k18wg-dia,ch-baby-fat-cross-charm,K18_WG,true,UNVERIFIED,\n";
    const r = validateCsv("variants", enc(csv), ctx());
    expect(r.accepted).toHaveLength(1);
    expect(r.quarantine[0].reasons.join()).toContain("stone_type");
  });
});

import { csvCell } from "@/lib/export";
describe("CSV出力", () => {
  it("数式インジェクション対策と引用", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-12000")).toBe("-12000");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell(null)).toBe("");
  });
});
