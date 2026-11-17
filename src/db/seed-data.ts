/**
 * 初期カタログ（商品名・仕様の選択肢のみ）。
 *
 * 重要:
 * - ここには価格・相場・重量などの数値を一切含めない（根拠のない数値を作らない）。
 * - 商品名・読み・特徴は開発者（AI）の一般知識による「UNVERIFIED（未検証）」の候補。
 *   Gemini調査資料・公式情報・実物で確認後、CSV 取込または編集で VERIFIED に更新すること。
 * - 公式型番は確認できていないため、すべて NULL。
 * - 素材・サイズの選択肢は「選べるようにする」ためのもので、各仕様の実在を保証しない。
 */
export const SEED_BRANDS = [{ id: "chrome-hearts", name: "Chrome Hearts", nameJa: "クロムハーツ" }];

const RING_SIZES = ["US 5", "US 6", "US 7", "US 8", "US 9", "US 10", "US 11", "US 12", "US 13"];
const CHAIN_LENGTHS = ["16inch", "18inch", "20inch", "22inch", "24inch"];
const SMALL_METALS = ["SILVER_925", "K22_YG", "K18_WG"];

type Cat = "RING" | "PENDANT" | "CHARM" | "EARRING" | "CHAIN" | "BRACELET";
export interface SeedProduct {
  id: string;
  category: Cat;
  nameEn: string;
  nameJaReading: string;
  features: string;
  confusableWith: string[];
  aliases: string[];
  options: { materials: string[]; sizes: string[]; stones: boolean[] };
}

const ring = (o: Omit<SeedProduct, "category" | "options">): SeedProduct => ({
  ...o,
  category: "RING",
  options: { materials: ["SILVER_925", "K22_YG", "K18_WG"], sizes: RING_SIZES, stones: [false, true] },
});
const chain = (o: Omit<SeedProduct, "category" | "options">): SeedProduct => ({
  ...o,
  category: "CHAIN",
  options: { materials: ["SILVER_925", "K22_YG"], sizes: CHAIN_LENGTHS, stones: [false] },
});
const small = (category: Cat, o: Omit<SeedProduct, "category" | "options">): SeedProduct => ({
  ...o,
  category,
  options: { materials: SMALL_METALS, sizes: [], stones: [false, true] },
});

export const SEED_PRODUCTS: SeedProduct[] = [
  small("CHARM", {
    id: "ch-baby-fat-cross-charm",
    nameEn: "Baby Fat Cross Charm",
    nameJaReading: "ベイビーファット クロス チャーム",
    features: "小型で厚みのある（ファットな）CHクロス。立体的で丸みのある十字。",
    confusableWith: ["ch-floral-cross-charm", "ch-bs-flare-charm"],
    aliases: ["ベビーファット", "ベイビーファット", "baby fat"],
  }),
  small("CHARM", {
    id: "ch-floral-cross-charm",
    nameEn: "Floral Cross Charm",
    nameJaReading: "フローラル クロス チャーム",
    features: "花のような装飾的な十字。ベイビーファットより平面的で縁取りがある。",
    confusableWith: ["ch-baby-fat-cross-charm"],
    aliases: ["フローラルクロス"],
  }),
  small("CHARM", {
    id: "ch-bs-flare-charm",
    nameEn: "BS Flare Charm",
    nameJaReading: "ビーエス フレア チャーム",
    features: "フレア（フルール・ド・リス）モチーフ。十字ではない。",
    confusableWith: ["ch-baby-fat-cross-charm"],
    aliases: ["BSフレア", "フレア"],
  }),
  small("CHARM", {
    id: "ch-heart-charm",
    nameEn: "Heart Charm",
    nameJaReading: "ハート チャーム",
    features: "ハート型の小型チャーム。",
    confusableWith: [],
    aliases: ["ハートチャーム"],
  }),
  small("PENDANT", {
    id: "ch-dagger-pendant",
    nameEn: "Dagger Pendant",
    nameJaReading: "ダガー ペンダント",
    features: "短剣（ダガー）モチーフのペンダント。サイズ違いに注意。",
    confusableWith: ["ch-dagger-ring"],
    aliases: ["ダガー"],
  }),
  small("PENDANT", {
    id: "ch-dog-tag-pendant",
    nameEn: "Dog Tag Pendant",
    nameJaReading: "ドッグタグ ペンダント",
    features: "軍用認識票型のプレート。刻印デザイン・サイズ違いに注意。",
    confusableWith: [],
    aliases: ["ドッグタグ"],
  }),
  small("EARRING", {
    id: "ch-plus-stud-earring",
    nameEn: "CH Plus Stud Earring",
    nameJaReading: "シーエイチ プラス スタッド ピアス",
    features: "CHプラス（十字の先端が装飾された＋形）の小型スタッドピアス。片耳/ペアの区別に注意。",
    confusableWith: ["ch-cross-stud-earring"],
    aliases: ["CHプラス", "プラスピアス", "CH Plus Earrings"],
  }),
  small("EARRING", {
    id: "ch-cross-stud-earring",
    nameEn: "Cross Stud Earring",
    nameJaReading: "クロス スタッド ピアス",
    features: "十字型のスタッドピアス。CHプラスとの形状差（縦横比・先端装飾）に注意。",
    confusableWith: ["ch-plus-stud-earring"],
    aliases: ["クロスピアス"],
  }),
  chain({
    id: "ch-paper-chain-necklace",
    nameEn: "Paper Chain Necklace",
    nameJaReading: "ペーパーチェーン ネックレス",
    features: "平たい楕円リンクが連なるチェーン。長さ（inch）違いに注意。",
    confusableWith: ["ch-roll-chain-necklace", "ch-twist-chain-necklace", "ch-fancy-chain-necklace"],
    aliases: ["ペーパーチェーン", "paper chain"],
  }),
  chain({
    id: "ch-roll-chain-necklace",
    nameEn: "Roll Chain Necklace",
    nameJaReading: "ロールチェーン ネックレス",
    features: "丸いリンクが連なるチェーン。ペーパーチェーンより丸く厚い。",
    confusableWith: ["ch-paper-chain-necklace"],
    aliases: ["ロールチェーン"],
  }),
  chain({
    id: "ch-twist-chain-necklace",
    nameEn: "Twist Chain Necklace",
    nameJaReading: "ツイストチェーン ネックレス",
    features: "ねじれたリンクのチェーン。",
    confusableWith: ["ch-paper-chain-necklace"],
    aliases: ["ツイストチェーン"],
  }),
  chain({
    id: "ch-fancy-chain-necklace",
    nameEn: "Fancy Chain Necklace",
    nameJaReading: "ファンシーチェーン ネックレス",
    features: "装飾的なリンクのチェーン。",
    confusableWith: ["ch-paper-chain-necklace"],
    aliases: ["ファンシーチェーン"],
  }),
  {
    id: "ch-paper-chain-bracelet",
    category: "BRACELET",
    nameEn: "Paper Chain Bracelet",
    nameJaReading: "ペーパーチェーン ブレスレット",
    features: "ペーパーチェーンのブレスレット。長さ違いに注意。",
    confusableWith: ["ch-paper-chain-necklace"],
    aliases: ["ペーパーチェーンブレス"],
    options: { materials: ["SILVER_925", "K22_YG"], sizes: ["7inch", "8inch", "9inch"], stones: [false] },
  },
  {
    id: "ch-cross-ball-bracelet",
    category: "BRACELET",
    nameEn: "Cross Ball Bracelet",
    nameJaReading: "クロスボール ブレスレット",
    features: "十字が刻まれたボールが連なるブレスレット。",
    confusableWith: [],
    aliases: ["クロスボール"],
    options: { materials: ["SILVER_925", "K22_YG"], sizes: ["7inch", "8inch", "9inch"], stones: [false] },
  },
  ring({
    id: "ch-forever-spacer-ring",
    nameEn: "Forever Spacer Ring",
    nameJaReading: "フォーエバー スペーサー リング",
    features: "細身のバンドに「FOREVER」の刻印。幅違い（3mm/6mm等）があれば size_label に含めて管理。",
    confusableWith: ["ch-plain-spacer-ring"],
    aliases: ["フォーエバー", "フォーエバースペーサー"],
  }),
  ring({
    id: "ch-plain-spacer-ring",
    nameEn: "Spacer Ring (Plain)",
    nameJaReading: "スペーサー リング（プレーン）",
    features: "刻印のないシンプルなスペーサーリング。",
    confusableWith: ["ch-forever-spacer-ring"],
    aliases: ["スペーサー", "プレーンスペーサー"],
  }),
  ring({
    id: "ch-keeper-ring",
    nameEn: "Keeper Ring",
    nameJaReading: "キーパー リング",
    features: "クロスとボール状装飾が交互に並ぶ太めのリング。",
    confusableWith: [],
    aliases: ["キーパー"],
  }),
  ring({
    id: "ch-scroll-band-ring",
    nameEn: "Scroll Band Ring",
    nameJaReading: "スクロールバンド リング",
    features: "唐草（スクロール）模様のバンドリング。",
    confusableWith: [],
    aliases: ["スクロールバンド"],
  }),
  ring({
    id: "ch-cemetery-ring",
    nameEn: "Cemetery Ring",
    nameJaReading: "セメタリー リング",
    features: "十字架が並ぶ墓地モチーフのリング。",
    confusableWith: [],
    aliases: ["セメタリー"],
  }),
  ring({
    id: "ch-dagger-ring",
    nameEn: "Dagger Ring",
    nameJaReading: "ダガー リング",
    features: "ダガーモチーフのリング。",
    confusableWith: ["ch-dagger-pendant"],
    aliases: ["ダガーリング"],
  }),
];

export const SEED_TAX_ASSUMPTIONS = [
  {
    key: "JCT_NATIONAL_RATE",
    value: "0.078",
    status: "VERIFIED" as const,
    evidenceUrl: "https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/",
    notes: "消費税（国税）標準税率 7.8%。地方消費税と合わせ 10%（法定税率）",
  },
  {
    key: "JCT_LOCAL_RATIO",
    value: null,
    status: "VERIFIED" as const,
    evidenceUrl: null,
    notes: "地方消費税 = 消費税額 × 22/78（計算式として固定。値は使用しない）",
  },
  {
    key: "CUSTOMS_DUTY_RATE:7113.11",
    value: null,
    status: "UNVERIFIED" as const,
    evidenceUrl: "https://www.customs.go.jp/tariff/",
    notes: "銀製の身辺用細貨類。実行関税率表（最新年度）で税率を確認して入力すること。開発時点で未確認",
  },
  {
    key: "CUSTOMS_DUTY_RATE:7113.19",
    value: null,
    status: "UNVERIFIED" as const,
    evidenceUrl: "https://www.customs.go.jp/tariff/",
    notes: "その他の貴金属製（金・白金等）の身辺用細貨類。実行関税率表で確認すること。開発時点で未確認",
  },
  {
    key: "PERSONAL_USE_FACTOR",
    value: "0.6",
    status: "VERIFIED" as const,
    evidenceUrl: "https://www.customs.go.jp/tetsuzuki/c-answer/imtsukan/1405_jr.htm",
    notes: "個人使用目的の小売段階輸入: 海外小売価格×0.6（関税定率法第4条の6）。販売目的には適用不可。金・白金等の国際相場品は対象外の場合あり",
  },
  {
    key: "LOW_VALUE_EXEMPTION_JPY",
    value: "10000",
    status: "UNVERIFIED" as const,
    evidenceUrl: "https://www.customs.go.jp/",
    notes: "課税価格1万円以下の少額免税。対象外品目・条件があるため税関資料で確認すること",
  },
];

export const SEED_FEE_RULES = [
  { platform: "SNKRDUNK", notes: "販売手数料率は開発時点で未確認。公式ヘルプで確認して入力" },
  { platform: "BUYMA", notes: "販売手数料率は開発時点で未確認。公式ヘルプで確認して入力" },
  { platform: "BUYBACK", notes: "買取店への売却。手数料なしを想定（査定額が入金額）。店舗条件を確認" },
];
