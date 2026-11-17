import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import * as s from "@/db/schema";
import { identifyConfigured, identifyImage, IdentifyError } from "@/lib/identify/identify";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

const MAX_DATAURL = 3_000_000; // クライアントで 1024px JPEG に縮小済みの想定

export async function POST(req: Request) {
  if (!identifyConfigured())
    return NextResponse.json({ error: "画像認識APIが未設定です（ANTHROPIC_API_KEY）。手動検索をご利用ください。" }, { status: 503 });
  let body: { image?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.image ?? "");
  if (!m || (body.image?.length ?? 0) > MAX_DATAURL) return NextResponse.json({ error: "画像形式が不正、または大きすぎます" }, { status: 400 });

  const db = await getDb();
  // 1日あたりの上限（費用暴走防止）
  const limit = Number(process.env.IDENTIFY_DAILY_LIMIT ?? 100);
  const [{ n }] = (await db.execute<{ n: number }>(sql`select count(*)::int as n from scan_logs where provider = 'anthropic' and created_at > now() - interval '1 day'`)).rows;
  if (n >= limit) return NextResponse.json({ error: `本日の画像認識上限（${limit}回）に達しました。手動検索をご利用ください。` }, { status: 429 });

  const products = await db.select().from(s.products);
  const catalog = products.map((p) => ({ id: p.id, nameEn: p.nameEn, nameJaReading: p.nameJaReading, category: p.category, features: p.distinguishingFeatures, confusableWith: p.confusableWith }));
  try {
    const started = Date.now();
    const r = await identifyImage(m[2], m[1] as "image/jpeg", catalog);
    const byId = new Map(products.map((p) => [p.id, p]));
    const candidates = r.output.candidates.map((c) => {
      const p = byId.get(c.product_id)!;
      return { ...c, nameEn: p.nameEn, nameJaReading: p.nameJaReading, category: p.category, catalogStatus: p.catalogStatus, confusableWith: p.confusableWith };
    });
    const [log] = await db
      .insert(s.scanLogs)
      .values({ provider: "anthropic", candidates: { ...r.output, candidates, model: r.model, dropped: r.dropped }, thumbnailDataUrl: body.image!.length < 400_000 ? body.image! : null, inputTokens: r.inputTokens, outputTokens: r.outputTokens })
      .returning({ id: s.scanLogs.id });
    return NextResponse.json({ scanId: log.id, observed: r.output.observed, candidates, possiblyNotInCatalog: r.output.possibly_not_in_catalog, elapsedMs: Date.now() - started, model: r.model });
  } catch (e) {
    if (e instanceof IdentifyError) return NextResponse.json({ error: e.message }, { status: 502 });
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "画像認識APIが混雑しています。少し待って再試行してください。" }, { status: 503 });
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "画像認識APIの認証に失敗しました（APIキー設定を確認）。" }, { status: 503 });
    if (e instanceof Anthropic.APIConnectionError) return NextResponse.json({ error: "画像認識APIに接続できません（通信状況を確認）。" }, { status: 503 });
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: "画像認識APIでエラーが発生しました。手動検索をご利用ください。" }, { status: 502 });
    console.error("identify failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "内部エラー。手動検索をご利用ください。" }, { status: 500 });
  }
}
