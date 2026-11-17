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

describe("海外の二次流通・査定種別", () => {
  const H = "variant_id,platform,kind,condition,source_url,source_name,source_type,reliability,observed_at,sold_at,country,currency,price_local,fx_jpy_per_unit,price_jpy\n";
  it("米国 eBay の成約を現地通貨＋換算レートで受理", () => {
    const r = validateCsv("market_observations", enc(H + "ch-baby-fat-cross-charm-silver,EBAY,REPORTED_SOLD,NEW,https://www.ebay.com/itm/1,eBay,MARKETPLACE,REPORTED,2026-11-10,2026-11-09,US,USD,350,150,\n"), ctx());
    expect(r.accepted).toHaveLength(1);
  });
  it("換算レートなし・円価格の同時指定・日本の販売先の国違いを隔離", () => {
    const r = validateCsv("market_observations", enc(H +
      "ch-baby-fat-cross-charm-silver,EBAY,REPORTED_SOLD,NEW,https://www.ebay.com/itm/2,eBay,MARKETPLACE,REPORTED,2026-11-10,2026-11-09,US,USD,350,,\n" +
      "ch-baby-fat-cross-charm-silver,EBAY,REPORTED_SOLD,NEW,https://www.ebay.com/itm/3,eBay,MARKETPLACE,REPORTED,2026-11-10,2026-11-09,US,USD,350,150,52500\n" +
      "ch-baby-fat-cross-charm-silver,SNKRDUNK,ASK,NEW,https://snkrdunk.com/4,S,MARKETPLACE,REPORTED,2026-11-10,,US,JPY,,,52000\n"), ctx());
    expect(r.accepted).toHaveLength(0);
    expect(r.quarantine[0].reasons.join()).toContain("fx_jpy_per_unit");
    expect(r.quarantine[1].reasons.join()).toContain("price_jpy を空に");
    expect(r.quarantine[2].reasons.join()).toContain("日本の販売先");
  });
});

import { findDuplicates, conflictsWith, normalizeName } from "@/lib/catalog";
describe("商品の重複検出", () => {
  it("表記ゆれ（大文字小文字・空白・全角・中黒）を同一視", () => {
    expect(normalizeName("Paper Chain  Necklace")).toBe(normalizeName("paper-chain necklace"));
    expect(normalizeName("ペーパーチェーン・ネックレス")).toBe(normalizeName("ペーパーチェーン ネックレス"));
    expect(normalizeName("ＣＨ Ｐｌｕｓ")).toBe("chplus");
  });
  it("英名・読み・別名の衝突を検出し、別商品は検出しない", () => {
    const g = findDuplicates([
      { id: "a", nameEn: "Paper Chain Necklace", nameJaReading: "ペーパーチェーン ネックレス", aliases: ["ペーパーチェーン"] },
      { id: "b", nameEn: "paper chain necklace", nameJaReading: "ペーパー チェーン", aliases: [] },
      { id: "c", nameEn: "Roll Chain Necklace", nameJaReading: "ロールチェーン", aliases: ["ペーパーチェーン"] },
      { id: "d", nameEn: "Twist Chain Necklace", nameJaReading: "ツイストチェーン", aliases: [] },
    ]);
    expect(g.find((x) => x.reason === "英語名が同じ")?.ids).toEqual(["a", "b"]);
    expect(g.find((x) => x.reason === "別名が同じ")?.ids).toEqual(["a", "c"]);
    expect(g.some((x) => x.ids.includes("d"))).toBe(false);
    expect(conflictsWith("PAPER chain necklace", "", [{ id: "a", nameEn: "Paper Chain Necklace", nameJaReading: "x" }])).toHaveLength(1);
  });
});

describe("監査指摘の回帰テスト（取込）", () => {
  const H = "variant_id,platform,kind,condition,source_url,source_name,source_type,reliability,observed_at,sold_at,country,currency,price_local,fx_jpy_per_unit,price_jpy,external_ref\n";
  const v = "ch-baby-fat-cross-charm-silver";
  it("#2 海外通貨で country 未指定・JP+USD は隔離（日本の成約に混入させない）", () => {
    const r = validateCsv("market_observations", enc(H +
      `${v},EBAY,REPORTED_SOLD,NEW,https://www.ebay.com/itm/9,eBay,MARKETPLACE,REPORTED,2026-11-10,2026-11-09,,USD,800,150,,\n` +
      `${v},EBAY,REPORTED_SOLD,NEW,https://www.ebay.com/itm/8,eBay,MARKETPLACE,REPORTED,2026-11-10,2026-11-09,JP,USD,800,150,,\n` +
      `${v},GRAILED,REPORTED_SOLD,NEW,https://www.grailed.com/7,G,MARKETPLACE,REPORTED,2026-11-10,2026-11-09,,JPY,,,120000,\n`), ctx());
    expect(r.accepted).toHaveLength(0);
    expect(r.quarantine[0].reasons.join()).toContain("country が必須");
    expect(r.quarantine[1].reasons.join()).toContain("country=JP で JPY 以外");
    expect(r.quarantine[2].reasons.join()).toContain("country が必須");
  });
  it("#7 同じ取引IDの ASK と SOLD は重複扱いしない", () => {
    const r = validateCsv("market_observations", enc(H +
      `${v},SNKRDUNK,ASK,NEW,https://snkrdunk.com/1,S,MARKETPLACE,REPORTED,2026-11-01,,JP,JPY,,,52000,m123\n` +
      `${v},SNKRDUNK,REPORTED_SOLD,NEW,https://snkrdunk.com/1,S,MARKETPLACE,REPORTED,2026-11-10,2026-11-09,JP,JPY,,,51000,m123\n`), ctx());
    expect(r.accepted).toHaveLength(2);
  });
  it("#6 未来日時の為替を拒否", () => {
    const r = validateCsv("fx_rates", enc("currency,jpy_per_unit,as_of,source\nUSD,150,2030-01-01T00:00:00Z,x\n"), ctx());
    expect(r.quarantine[0].reasons.join()).toContain("未来");
  });
  it("二次流通サイトのURLを OFFICIAL 定価として取り込まない", () => {
    const csv = "variant_id,country,currency,amount,price_kind,tax_inclusion,source_url,source_name,source_type,reliability,observed_at\n" +
      `${v},US,USD,400,OFFICIAL,EXCLUDED,https://www.buyma.com/item/1,公式?,OFFICIAL_SITE,VERIFIED,2026-11-10\n`;
    const r = validateCsv("retail_prices", enc(csv), ctx());
    expect(r.quarantine[0].reasons.join()).toContain("二次流通・買取サイト");
  });
});
