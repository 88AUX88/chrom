import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * 画像からの商品候補抽出。
 * - 候補は登録カタログ内の product_id のみ（カタログ外の ID は破棄）。
 * - 素材（シルバー/ホワイトゴールド）・石の有無・サイズは写真だけで確定させない。人間が選択する。
 * - confidence は AI の自己申告で、校正された確率ではない。
 */
export interface CatalogEntry {
  id: string;
  nameEn: string;
  nameJaReading: string;
  category: string;
  features: string | null;
  confusableWith: string[];
}

export const IdentifyOutput = z.object({
  observed: z.object({
    category_guess: z.string(),
    color_tone: z.enum(["silver_or_white_metal", "yellow_gold", "unclear"]),
    stones_visible: z.enum(["yes", "no", "unclear"]),
    engravings_seen: z.string(),
    photo_quality_issues: z.string(),
  }),
  candidates: z
    .array(
      z.object({
        product_id: z.string(),
        reason: z.string(),
        confidence: z.enum(["high", "medium", "low"]),
      }),
    )
    .max(3),
  possibly_not_in_catalog: z.boolean(),
});
export type IdentifyOutputT = z.infer<typeof IdentifyOutput>;

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["observed", "candidates", "possibly_not_in_catalog"],
  properties: {
    observed: {
      type: "object",
      additionalProperties: false,
      required: ["category_guess", "color_tone", "stones_visible", "engravings_seen", "photo_quality_issues"],
      properties: {
        category_guess: { type: "string" },
        color_tone: { type: "string", enum: ["silver_or_white_metal", "yellow_gold", "unclear"] },
        stones_visible: { type: "string", enum: ["yes", "no", "unclear"] },
        engravings_seen: { type: "string" },
        photo_quality_issues: { type: "string" },
      },
    },
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["product_id", "reason", "confidence"],
        properties: {
          product_id: { type: "string" },
          reason: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    possibly_not_in_catalog: { type: "boolean" },
  },
} as const;

const SYSTEM = `あなたはジュエリー商品の識別補助です。写真に写った商品を、与えられたカタログの中から最大3件の候補として挙げます。
規則:
- product_id はカタログに記載された ID のみを使う。該当しそうなものがなければ candidates を空にし possibly_not_in_catalog を true にする。
- 真贋（本物/偽物）は判定しない。言及もしない。
- シルバーとホワイトゴールドは色だけでは区別できないため、color_tone は見た目の色調のみを記録する。
- 刻印が読める場合は engravings_seen に読めた文字だけを書く（推測で補わない）。
- reason は日本語で簡潔に、形状上の根拠と、誤認しやすい候補との違いを書く。
- 写真のピンぼけ・反射・一部しか写っていない等の問題は photo_quality_issues に書く。`;

export function catalogText(catalog: CatalogEntry[]): string {
  return catalog
    .map((c) => `${c.id} | ${c.nameEn} | ${c.nameJaReading} | ${c.category} | 特徴: ${c.features ?? "-"} | 誤認注意: ${c.confusableWith.join(",") || "-"}`)
    .join("\n");
}

export function identifyConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export interface IdentifyResult {
  output: IdentifyOutputT;
  dropped: string[]; // カタログ外で破棄した ID
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/** 画像（base64 JPEG）から候補を得る。 */
export async function identifyImage(imageBase64: string, mediaType: "image/jpeg" | "image/png" | "image/webp", catalog: CatalogEntry[]): Promise<IdentifyResult> {
  const client = new Anthropic();
  const model = process.env.IDENTIFY_MODEL || "claude-opus-5-5";
  const resp = await client.beta.messages.create({
    model,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: JSON_SCHEMA } },
    // カタログ部分（不変）をキャッシュ
    system: [
      { type: "text", text: SYSTEM },
      { type: "text", text: `カタログ:\n${catalogText(catalog)}`, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: "この写真の商品候補を挙げてください。" },
        ],
      },
    ],
  });
  if (resp.stop_reason === "refusal") throw new IdentifyError("AI が応答を拒否しました。手動検索をご利用ください。");
  if (resp.stop_reason === "max_tokens") throw new IdentifyError("AI の応答が途中で切れました。もう一度お試しください。");
  const text = resp.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    throw new IdentifyError("AI の応答を解釈できませんでした。");
  }
  const parsed = IdentifyOutput.safeParse(parsedJson);
  if (!parsed.success) throw new IdentifyError("AI の応答形式が不正でした。");
  return {
    ...filterToCatalog(parsed.data, new Set(catalog.map((c) => c.id))),
    model: resp.model,
    inputTokens: resp.usage.input_tokens + (resp.usage.cache_read_input_tokens ?? 0) + (resp.usage.cache_creation_input_tokens ?? 0),
    outputTokens: resp.usage.output_tokens,
  };
}

/** カタログ外 ID を除外し、重複を除き最大3件にする（純関数・テスト対象） */
export function filterToCatalog(out: IdentifyOutputT, ids: Set<string>): { output: IdentifyOutputT; dropped: string[] } {
  const dropped: string[] = [];
  const seen = new Set<string>();
  const candidates = out.candidates.filter((c) => {
    if (!ids.has(c.product_id)) {
      dropped.push(c.product_id);
      return false;
    }
    if (seen.has(c.product_id)) return false;
    seen.add(c.product_id);
    return true;
  });
  return { output: { ...out, candidates: candidates.slice(0, 3), possibly_not_in_catalog: out.possibly_not_in_catalog || dropped.length > 0 }, dropped };
}

export class IdentifyError extends Error {}
