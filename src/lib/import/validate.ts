/**
 * CSV 取込の検証（純関数）。不正行は推測で埋めず、理由付きで隔離する。
 */
import Papa from "papaparse";
import {
  CATALOG_STATUS,
  CONDITIONS,
  IMPORT_KINDS,
  MARKET_KINDS,
  MARKET_PLATFORMS,
  MATERIALS,
  PRODUCT_CATEGORIES,
  RELIABILITY,
  RETAIL_PRICE_KINDS,
  SOURCE_TYPES,
  TAX_INCLUSION,
} from "@/db/schema";
import { parseStrictDecimal } from "../money";
import { conflictsWith, type CatalogItem } from "../catalog";

export type ImportKind = (typeof IMPORT_KINDS)[number];
export type Row = Record<string, string>;

export interface Quarantined {
  row: number; // 1 始まり（ヘッダー除く）
  reasons: string[];
  raw: Row;
}
export interface ValidationResult {
  fileErrors: string[];
  accepted: { row: number; data: Row }[];
  quarantine: Quarantined[];
}

export interface RefContext {
  productIds: Set<string>;
  variantIds: Set<string>;
  brandIds: Set<string>;
  /** 既存データの重複キー */
  existingKeys: Set<string>;
  today: string; // YYYY-MM-DD
  /** 既存商品（名称の重複検出用） */
  catalog?: CatalogItem[];
}

export const CURRENCIES = ["JPY", "USD", "EUR", "GBP", "HKD", "SGD", "CNY", "KRW", "TWD", "AUD", "CAD", "CHF", "AED", "THB"];

const EVIDENCE_COLS = ["source_url", "source_name", "source_type", "reliability", "observed_at"];
export const TEMPLATE_COLUMNS: Record<ImportKind, { required: string[]; optional: string[] }> = {
  products: {
    required: ["id", "brand_id", "category", "name_en", "name_ja_reading", "catalog_status"],
    optional: ["official_model_number", "distinguishing_features", "aliases", "notes", "source_url", "verified_at"],
  },
  variants: {
    required: ["id", "product_id", "material", "has_stones", "catalog_status"],
    optional: ["stone_type", "size_label", "ring_size_us", "length_inch", "color"],
  },
  retail_prices: {
    required: ["variant_id", "country", "currency", "amount", "price_kind", "tax_inclusion", ...EVIDENCE_COLS],
    optional: ["city", "store", "video_published_at", "video_timestamp", "evidence_notes"],
  },
  market_observations: {
    required: ["variant_id", "platform", "kind", "condition", ...EVIDENCE_COLS],
    optional: ["price_jpy", "country", "currency", "price_local", "fx_jpy_per_unit", "sold_at", "listed_at", "accessories", "external_ref", "video_published_at", "video_timestamp", "evidence_notes"],
  },
  buyback_quotes: {
    required: ["variant_id", "shop", "price_jpy", "condition", ...EVIDENCE_COLS],
    optional: ["quote_kind", "evidence_notes"],
  },
  fx_rates: { required: ["currency", "jpy_per_unit", "as_of", "source"], optional: [] },
};

const MOJIBAKE = /�|(?:[ÃÂãâ][\u0080-¿‘-›€ŒœŠšŸŽžƒˆ˜])/;

/** バイト列を UTF-8 として厳密に復号。失敗したら null。 */
export function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    const s = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return s.replace(/^﻿/, "");
  } catch {
    return null;
  }
}

function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const oneOf = <T extends readonly string[]>(arr: T, v: string) => (arr as readonly string[]).includes(v);

/** 数値表記ゆれ（"400" と "400.00"）を同一視するための正規化 */
const n = (v: string | undefined) => (v ? parseStrictDecimal(v)?.toString() ?? v : "");

const MARKETPLACE_HOST = /(^|\.)(buyma\.com|snkrdunk\.com|ebay\.[a-z.]+|grailed\.com|stockx\.com|mercari\.com|jp\.mercari\.com|fril\.jp|2ndstreet\.jp|komehyo\.(co\.jp|jp)|rinkan\.(co\.jp|jp)|brandoff\.co\.jp|vestiairecollective\.com|therealreal\.com|farfetch\.com|bring\.co\.jp)$/i;
function safeHost(u: string): string {
  try {
    return new URL(u).hostname;
  } catch {
    return "";
  }
}

export function dedupeKey(kind: ImportKind, r: Row): string {
  switch (kind) {
    case "products":
    case "variants":
      return `${kind}|${r.id}`;
    case "retail_prices":
      return `${kind}|${r.variant_id}|${r.country}|${r.store ?? ""}|${r.currency}|${n(r.amount)}|${r.observed_at}|${r.price_kind}`;
    case "market_observations":
      return r.external_ref
        ? `${kind}|${r.platform}|ref|${r.external_ref}|${r.kind === "ASK" ? "ASK" : "SOLD"}`
        : `${kind}|${r.variant_id}|${r.platform}|${r.kind}|${n(r.price_jpy || r.price_local)}|${r.sold_at || r.observed_at}|${r.condition}`;
    case "buyback_quotes":
      return `${kind}|${r.variant_id}|${r.shop}|${n(r.price_jpy)}|${r.observed_at}|${r.condition}`;
    case "fx_rates":
      return `${kind}|${r.currency}|${new Date(r.as_of).getTime() || r.as_of}`;
  }
}

function validateEvidence(r: Row, today: string, errs: string[]) {
  if (!oneOf(SOURCE_TYPES, r.source_type)) errs.push(`source_type が不正: ${r.source_type}`);
  if (!oneOf(RELIABILITY, r.reliability)) errs.push(`reliability が不正: ${r.reliability}`);
  if (!r.source_name) errs.push("source_name がありません");
  const needsUrl = !["STORE_VISIT", "USER_NOTE"].includes(r.source_type);
  if (needsUrl && !r.source_url) errs.push("出典URLがありません");
  if (r.source_url) {
    let u: URL | null = null;
    try {
      u = new URL(r.source_url);
    } catch {
      errs.push("出典URLが不正です");
    }
    if (u && !["http:", "https:"].includes(u.protocol)) errs.push("出典URLは http(s) のみ");
    if (u && /(^|\.)example\.(com|org|net)$/.test(u.hostname)) errs.push("出典URLがサンプル（example.com）のままです");
  }
  if (!isValidDate(r.observed_at)) errs.push(`observed_at が日付(YYYY-MM-DD)ではありません: ${r.observed_at}`);
  else if (r.observed_at > today) errs.push("observed_at が未来日です");
  if (r.source_type === "YOUTUBE") {
    if (!r.video_published_at || !isValidDate(r.video_published_at)) errs.push("YouTube出典には video_published_at が必要です");
    if (!r.video_timestamp || !/^\d{1,2}(:\d{2}){1,2}$/.test(r.video_timestamp)) errs.push("YouTube出典には video_timestamp（例 12:34）が必要です");
  }
}

function positive(label: string, v: string | undefined, errs: string[]) {
  if (v === undefined || v === "") return errs.push(`${label} がありません`);
  const d = parseStrictDecimal(v);
  if (d === null) errs.push(`${label} が数値形式ではありません: ${v}`);
  else if (d.lessThanOrEqualTo(0)) errs.push(`${label} は正の数である必要があります`);
}

export function validateRow(kind: ImportKind, r: Row, ctx: RefContext): string[] {
  const errs: string[] = [];
  for (const [k, v] of Object.entries(r)) if (v && MOJIBAKE.test(v)) errs.push(`文字化けの疑い（${k}）`);

  switch (kind) {
    case "products":
      if (!/^[a-z0-9][a-z0-9-]{2,80}$/.test(r.id)) errs.push("id は英小文字・数字・ハイフンのみ");
      if (!ctx.brandIds.has(r.brand_id)) errs.push(`brand_id が存在しません: ${r.brand_id}`);
      if (!oneOf(PRODUCT_CATEGORIES, r.category)) errs.push(`category が不正: ${r.category}`);
      if (!oneOf(CATALOG_STATUS, r.catalog_status)) errs.push(`catalog_status が不正`);
      if (!r.name_en) errs.push("name_en がありません");
      if (!r.name_ja_reading) errs.push("name_ja_reading がありません");
      {
        const dup = conflictsWith(r.name_en ?? "", r.name_ja_reading ?? "", (ctx.catalog ?? []).filter((c) => c.id !== r.id));
        if (dup.length) errs.push(`既存商品と名称が重複しています: ${dup.map((d) => d.id).join(", ")}`);
      }
      if (r.catalog_status === "VERIFIED" && !r.source_url) errs.push("VERIFIED にするには source_url（根拠）が必要です");
      if (r.official_model_number && !r.source_url) errs.push("公式型番には source_url（根拠）が必要です");
      if (r.source_url && !/^https?:\/\//.test(r.source_url)) errs.push("source_url が不正です");
      if (r.verified_at && !isValidDate(r.verified_at)) errs.push("verified_at が日付ではありません");
      break;
    case "variants":
      if (!/^[a-z0-9][a-z0-9-]{2,120}$/.test(r.id)) errs.push("id は英小文字・数字・ハイフンのみ");
      if (!ctx.productIds.has(r.product_id)) errs.push(`product_id が存在しません: ${r.product_id}`);
      if (!oneOf(MATERIALS, r.material)) errs.push(`material が不正: ${r.material}`);
      if (!["true", "false"].includes(r.has_stones)) errs.push("has_stones は true/false");
      if (r.has_stones === "true" && !r.stone_type) errs.push("石付きの場合 stone_type が必要です");
      if (r.ring_size_us) positive("ring_size_us", r.ring_size_us, errs);
      if (r.length_inch) positive("length_inch", r.length_inch, errs);
      if (!oneOf(CATALOG_STATUS, r.catalog_status)) errs.push(`catalog_status が不正`);
      break;
    case "retail_prices": {
      if (!ctx.variantIds.has(r.variant_id)) errs.push(`variant_id が存在しません: ${r.variant_id}`);
      if (!/^([A-Z]{2}|EU)$/.test(r.country)) errs.push(`country は ISO 2文字: ${r.country}`);
      if (!CURRENCIES.includes(r.currency)) errs.push(`未対応の通貨: ${r.currency}`);
      positive("amount", r.amount, errs);
      if (!oneOf(RETAIL_PRICE_KINDS, r.price_kind)) errs.push(`price_kind が不正: ${r.price_kind}`);
      if (!oneOf(TAX_INCLUSION, r.tax_inclusion)) errs.push(`tax_inclusion が不正`);
      validateEvidence(r, ctx.today, errs);
      if (r.price_kind === "OFFICIAL" && !["OFFICIAL_SITE", "STORE_VISIT"].includes(r.source_type))
        errs.push("OFFICIAL価格の出典は公式サイトまたは店頭確認のみ");
      if (r.price_kind === "RECEIPT" && r.source_type !== "RECEIPT") errs.push("RECEIPT価格の出典はレシートのみ");
      if (r.price_kind === "OFFICIAL" && r.source_url && MARKETPLACE_HOST.test(safeHost(r.source_url)))
        errs.push("出典URLが二次流通・買取サイトです。正規定価として取り込めません");
      if (["MARKETPLACE", "BUYBACK_SITE"].includes(r.source_type))
        errs.push("中古店・BUYMA等の価格は正規定価として取り込めません（market_observations へ）");
      if (r.price_kind === "ESTIMATE" && r.reliability !== "ESTIMATED") errs.push("ESTIMATE は reliability=ESTIMATED");
      if (["OFFICIAL", "RECEIPT"].includes(r.price_kind) && !["VERIFIED", "REPORTED"].includes(r.reliability))
        errs.push("公式/レシート価格の reliability が不整合");
      const amt = parseStrictDecimal(r.amount ?? "");
      if (amt && r.currency === "JPY" && amt.lessThan(1000)) errs.push("JPY価格が1,000円未満（桁誤りの疑い）");
      break;
    }
    case "market_observations":
      if (!ctx.variantIds.has(r.variant_id)) errs.push(`variant_id が存在しません: ${r.variant_id}`);
      if (!oneOf(MARKET_PLATFORMS, r.platform)) errs.push(`platform が不正: ${r.platform}`);
      if (!oneOf(MARKET_KINDS, r.kind)) errs.push(`kind が不正（RETAIL/BUYBACK は別ファイル、SOLD_OUT 表示は不可）: ${r.kind}`);
      {
        const JP_PLATFORMS = ["SNKRDUNK", "BUYMA", "RINKAN", "BRING", "KOMEHYO", "MERCARI"];
        const currency = r.currency || "JPY";
        // 海外通貨・海外販売先は国の明示を必須にする（未指定で日本の成約として混入するのを防ぐ）
        if (!r.country && (currency !== "JPY" || !JP_PLATFORMS.includes(r.platform))) errs.push("海外通貨・海外販売先のデータは country が必須です");
        const country = r.country || "JP";
        if (country === "JP" && currency !== "JPY") errs.push("country=JP で JPY 以外の通貨は使えません");
        if (!/^([A-Z]{2}|EU)$/.test(country)) errs.push(`country は ISO 2文字: ${country}`);
        if (!CURRENCIES.includes(currency)) errs.push(`未対応の通貨: ${currency}`);
        if (currency === "JPY") positive("price_jpy", r.price_jpy, errs);
        else {
          // 海外の二次流通: 現地価格と換算レートを明示させる（暗黙の換算をしない）
          positive("price_local", r.price_local, errs);
          positive("fx_jpy_per_unit", r.fx_jpy_per_unit, errs);
          if (r.price_jpy) errs.push("JPY 以外は price_jpy を空にしてください（price_local × fx_jpy_per_unit で計算します）");
        }
      }
      if (!oneOf(CONDITIONS, r.condition)) errs.push(`condition が不正: ${r.condition}`);
      validateEvidence(r, ctx.today, errs);
      if (r.kind?.endsWith("_SOLD")) {
        if (!r.sold_at || !isValidDate(r.sold_at)) errs.push("成約データには sold_at（成約日）が必要です");
        else if (r.sold_at > ctx.today) errs.push("sold_at が未来日です");
      }
      if (r.kind === "ASK" && r.sold_at) errs.push("ASK（出品）に sold_at があります。区分を確認してください");
      if (r.kind === "VERIFIED_SOLD" && r.reliability !== "VERIFIED") errs.push("VERIFIED_SOLD は reliability=VERIFIED が必要");
      if (r.listed_at && !isValidDate(r.listed_at)) errs.push("listed_at が日付ではありません");
      if (r.price_jpy && parseStrictDecimal(r.price_jpy)?.lessThan(1000)) errs.push("price_jpy が1,000円未満（桁誤りの疑い）");
      if (["SNKRDUNK", "BUYMA", "RINKAN", "BRING", "KOMEHYO", "MERCARI"].includes(r.platform) && (r.country || "JP") !== "JP")
        errs.push(`${r.platform} は日本の販売先です。country を確認してください`);
      break;
    case "buyback_quotes":
      if (!ctx.variantIds.has(r.variant_id)) errs.push(`variant_id が存在しません: ${r.variant_id}`);
      if (r.quote_kind && !["PRICE_LIST", "INDIVIDUAL_APPRAISAL"].includes(r.quote_kind)) errs.push("quote_kind は PRICE_LIST / INDIVIDUAL_APPRAISAL");
      if (!r.shop) errs.push("shop がありません");
      positive("price_jpy", r.price_jpy, errs);
      if (!oneOf(CONDITIONS, r.condition)) errs.push(`condition が不正: ${r.condition}`);
      validateEvidence(r, ctx.today, errs);
      break;
    case "fx_rates":
      if (!CURRENCIES.includes(r.currency) || r.currency === "JPY") errs.push(`通貨が不正: ${r.currency}`);
      positive("jpy_per_unit", r.jpy_per_unit, errs);
      if (Number.isNaN(Date.parse(r.as_of ?? ""))) errs.push("as_of が日時ではありません");
      else if (Date.parse(r.as_of) > Date.now() + 60_000) errs.push("as_of が未来の日時です");
      if (!r.source) errs.push("source がありません");
      break;
  }
  return errs;
}

export function validateCsv(kind: ImportKind, bytes: Uint8Array, ctx: RefContext): ValidationResult {
  const fileErrors: string[] = [];
  const text = decodeUtf8(bytes);
  if (text === null) return { fileErrors: ["UTF-8 として読めません（Shift_JIS 等の可能性）。UTF-8 で保存し直してください"], accepted: [], quarantine: [] };
  const parsed = Papa.parse<Row>(text, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
  if (parsed.errors.length) fileErrors.push(...parsed.errors.slice(0, 5).map((e) => `CSV構文エラー 行${(e.row ?? 0) + 1}: ${e.message}`));
  const cols = TEMPLATE_COLUMNS[kind];
  const headers = parsed.meta.fields ?? [];
  const missingCols = cols.required.filter((c) => !headers.includes(c));
  if (missingCols.length) fileErrors.push(`必須列がありません: ${missingCols.join(", ")}`);
  const unknown = headers.filter((h) => !cols.required.includes(h) && !cols.optional.includes(h));
  if (unknown.length) fileErrors.push(`不明な列があります: ${unknown.join(", ")}`);
  if (fileErrors.length) return { fileErrors, accepted: [], quarantine: [] };

  const accepted: ValidationResult["accepted"] = [];
  const quarantine: Quarantined[] = [];
  const seen = new Set<string>();
  // 同一ファイル内で新規追加される product/variant も参照可能にする
  const localCtx: RefContext = { ...ctx, productIds: new Set(ctx.productIds), variantIds: new Set(ctx.variantIds), catalog: [...(ctx.catalog ?? [])] };
  parsed.data.forEach((raw, idx) => {
    const r: Row = {};
    for (const [k, v] of Object.entries(raw)) r[k] = (v ?? "").trim();
    const reasons = validateRow(kind, r, localCtx);
    const key = dedupeKey(kind, r);
    if (seen.has(key)) reasons.push("ファイル内で重複しています");
    if (ctx.existingKeys.has(key)) reasons.push("既存データと重複しています");
    if (reasons.length) quarantine.push({ row: idx + 1, reasons, raw: r });
    else {
      seen.add(key);
      accepted.push({ row: idx + 1, data: r });
      if (kind === "products") {
        localCtx.productIds.add(r.id);
        localCtx.catalog!.push({ id: r.id, nameEn: r.name_en, nameJaReading: r.name_ja_reading });
      }
      if (kind === "variants") localCtx.variantIds.add(r.id);
    }
  });
  return { fileErrors, accepted, quarantine };
}

export function templateCsv(kind: ImportKind): string {
  const c = TEMPLATE_COLUMNS[kind];
  return [...c.required, ...c.optional].join(",") + "\n";
}
