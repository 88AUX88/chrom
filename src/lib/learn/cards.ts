/**
 * 7日間（1日15分想定）の初期教材カード生成と間隔反復（SM-2 簡易版）。
 * 価格の暗記ではなく、識別・仕様・計算の考え方を身につける構成。
 * PROFIT_DRILL は教材用の仮想例（isIllustrative=true）であり、実データではない。
 */
import type { SeedProduct } from "@/db/seed-data";
import { computeProfit } from "../profit/engine";
import { formatJpy } from "../money";

export interface CardRow {
  id: string;
  kind: "NAME_READING" | "MATERIAL" | "CONFUSION" | "PROFIT_DRILL" | "IMAGE";
  productId: string | null;
  day: number;
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  isIllustrative: boolean;
}

/** 決定的な疑似乱数（同じ入力で同じ教材を生成） */
function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 100000) / 100000;
  };
}
function shuffleWithAnswer(correct: string, wrong: string[], seed: number): { choices: string[]; answerIndex: number } {
  const r = rng(seed);
  const all = [correct, ...wrong.slice(0, 3)];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return { choices: all, answerIndex: all.indexOf(correct) };
}
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const MATERIAL_FACTS: { prompt: string; correct: string; wrong: string[]; explanation: string }[] = [
  {
    prompt: "「925」刻印の意味は？",
    correct: "銀の含有率 92.5%（スターリングシルバー）",
    wrong: ["金の含有率 92.5%", "プラチナ 925mg", "ホワイトゴールドの品位"],
    explanation: "925 は銀 92.5% の合金。黒ずみ（硫化）が出る。",
  },
  {
    prompt: "18K の金の含有率は？",
    correct: "75%",
    wrong: ["91.7%", "58.5%", "99.9%"],
    explanation: "18/24 = 75%。22K は 22/24 ≒ 91.7%。",
  },
  {
    prompt: "シルバーとホワイトゴールドを写真だけで区別するのが危険な理由は？",
    correct: "どちらも白系の色で、刻印・重さ・付属品の確認が必要だから",
    wrong: ["ホワイトゴールドは必ず黄色いから", "シルバーは必ず光らないから", "価格が同じだから問題ない"],
    explanation: "色味が近く、仕入額が桁違い。刻印（925 / 18K 等）と重さ・購入証明で確定する。",
  },
  {
    prompt: "石付きと石なしの相場を混ぜて比較してはいけない理由は？",
    correct: "別仕様で価格帯が大きく異なるため",
    wrong: ["石付きは売れないため", "石なしは中古しかないため", "混ぜると件数が増えて精度が上がるため"],
    explanation: "仕様違いを混ぜると中央値が歪む。本アプリは variant 単位で集計する。",
  },
  {
    prompt: "SNKRDUNK で「出品価格（ASK）」しか見つからない。売却見込として使える？",
    correct: "使えない。成約価格ではないので参考上限にとどめる",
    wrong: ["使える。出品価格＝売却価格", "出品価格の1.2倍で計算する", "最安出品を成約とみなす"],
    explanation: "出品価格は売れていない価格。判定は成約（SOLD）データで行う。",
  },
  {
    prompt: "販売目的の買付で「個人使用の特例（海外小売価格×0.6）」は使える？",
    correct: "使えない",
    wrong: ["使える", "20万円以下なら使える", "シルバーなら使える"],
    explanation: "特例は個人的に使用する貨物が対象。販売目的は商業輸入として課税価格を計算する。",
  },
  {
    prompt: "課税事業者の場合、輸入消費税の扱いとして正しいものは？",
    correct: "支払うが、仕入税額控除により利益計算上の原価には含めない",
    wrong: ["原価に含め、さらに売上の消費税も差し引く", "支払わなくてよい", "関税に含まれる"],
    explanation: "現金は出るが控除される。原価に入れたうえで売上税抜もすると二重計上になる。",
  },
];

/** 教材用の仮想利益計算（実データではない） */
function profitDrills(): CardRow[] {
  const cases = [
    { usd: "500", fx: "150", sale: "120000", fee: "0.1" },
    { usd: "900", fx: "155", sale: "200000", fee: "0.1" },
    { usd: "300", fx: "150", sale: "60000", fee: "0.1" },
  ];
  return cases.map((c, k) => {
    const r = computeProfit({
      purchase: { currency: "USD", price: c.usd, priceIncludesLocalTax: false, localTaxRate: "0", localTaxRefundRate: "0", fxJpyPerUnit: c.fx, cardFeeRate: "0" },
      importing: { mode: "COMMERCIAL", customsDutyRate: "0.05", jctNationalRate: "0.078", jctLocalRatioOfNational: "22/78", jctStandardRate: "0.10", intlShippingJpy: "0", insuranceJpy: "0", customsBrokerFeeJpy: "0", applyLowValueExemption: true, personalUseFactor: "0.6" },
      sale: { priceJpy: c.sale, platformFeeRate: c.fee, platformFixedFeeJpy: "0", platformFeeIncludesJct: true, domesticShippingJpy: "0", packagingJpy: "0", riskReserveRate: "0" },
      travelAllocationJpy: "0",
      otherCostsJpy: "0",
      businessTaxStatus: "EXEMPT",
    });
    if (!r.ok) throw new Error("drill");
    const correct = formatJpy(r.adopted.preTaxProfitJpy);
    const v = Number(r.adopted.preTaxProfitJpy);
    const wrong = [v + 15000, v - 12000, Number(c.sale) - Number(c.usd) * Number(c.fx)].map((x) => formatJpy(String(x)));
    const { choices, answerIndex } = shuffleWithAnswer(correct, wrong, 1000 + k);
    return {
      id: `drill-${k + 1}`,
      kind: "PROFIT_DRILL",
      productId: null,
      day: 5 + k,
      prompt: `【教材用の仮想例】USD ${c.usd}（税なし）、為替 ${c.fx}円、関税率 5%（仮定）、売却 ${formatJpy(c.sale)}、販売手数料 ${Number(c.fee) * 100}%。免税事業者として税引前利益は？`,
      choices,
      answerIndex,
      explanation: `課税価格→関税（千円未満・百円未満切捨）→輸入消費税10%→手数料を差し引く。取得原価 ${formatJpy(r.adopted.acquisitionCostJpy)}、関税 ${formatJpy(r.importBreakdown.dutyJpy)}、輸入消費税 ${formatJpy(r.importBreakdown.importConsumptionTaxJpy)}。`,
      isIllustrative: true,
    };
  });
}

export function buildLearningCards(products: SeedProduct[]): CardRow[] {
  const cards: CardRow[] = [];
  const names = products.map((p) => p.nameJaReading);
  products.forEach((p, idx) => {
    const day = 1 + (idx % 4); // Day1-4: 名称と識別
    const wrong = names.filter((n) => n !== p.nameJaReading).sort((a, b) => (hash(a + p.id) % 97) - (hash(b + p.id) % 97));
    const a = shuffleWithAnswer(p.nameJaReading, wrong, hash(p.id));
    cards.push({
      id: `name-${p.id}`,
      kind: "NAME_READING",
      productId: p.id,
      day,
      prompt: `「${p.nameEn}」の読み方は？`,
      choices: a.choices,
      answerIndex: a.answerIndex,
      explanation: `${p.nameEn} = ${p.nameJaReading}。特徴: ${p.features}（カタログ未検証）`,
      isIllustrative: false,
    });
    if (p.confusableWith.length) {
      const confusables = p.confusableWith.map((c) => products.find((x) => x.id === c)?.nameJaReading).filter(Boolean) as string[];
      const others = names.filter((n) => n !== p.nameJaReading && !confusables.includes(n));
      const b = shuffleWithAnswer(p.nameJaReading, [...confusables, ...others], hash(p.id + "c"));
      cards.push({
        id: `conf-${p.id}`,
        kind: "CONFUSION",
        productId: p.id,
        day: Math.min(day + 1, 4),
        prompt: `特徴「${p.features}」に当てはまるのは？`,
        choices: b.choices,
        answerIndex: b.answerIndex,
        explanation: `正解は ${p.nameJaReading}。誤認しやすい: ${confusables.join("、")}`,
        isIllustrative: false,
      });
    }
  });
  MATERIAL_FACTS.forEach((f, k) => {
    const a = shuffleWithAnswer(f.correct, f.wrong, 500 + k);
    cards.push({ id: `mat-${k + 1}`, kind: "MATERIAL", productId: null, day: k < 4 ? 3 + (k % 2) : 6 + (k % 2), prompt: f.prompt, choices: a.choices, answerIndex: a.answerIndex, explanation: f.explanation, isIllustrative: false });
  });
  cards.push(...profitDrills());
  return cards;
}

/** SM-2 簡易版。grade: 0=不正解, 1=正解（難しい）, 2=正解（簡単） */
export function schedule(card: { ease: number; intervalDays: number; reps: number; lapses: number }, grade: 0 | 1 | 2, now: Date) {
  let { ease, intervalDays, reps, lapses } = card;
  if (grade === 0) {
    reps = 0;
    lapses += 1;
    intervalDays = 0; // 当日中に再出題
    ease = Math.max(1.3, ease - 0.2);
  } else {
    reps += 1;
    intervalDays = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(intervalDays * ease);
    ease = Math.min(3.0, ease + (grade === 2 ? 0.1 : -0.05));
  }
  const due = new Date(now.getTime() + (intervalDays === 0 ? 10 * 60 * 1000 : intervalDays * 86400000));
  return { ease, intervalDays, reps, lapses, dueAt: due };
}
