import "server-only";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import * as s from "@/db/schema";

/**
 * 自分で撮影した参照画像（OWN_PHOTO）から「写真→商品名」クイズを作る（冪等）。
 * AI生成画像や権利不明の画像は使わない。誤答の選択肢は誤認しやすい商品を優先。
 */
export async function syncImageCards(): Promise<number> {
  const db = await getDb();
  const imgs = await db.select({ id: s.productImages.id, productId: s.productImages.productId }).from(s.productImages).where(eq(s.productImages.licenseStatus, "OWN_PHOTO"));
  if (imgs.length === 0) return 0;
  const products = await db.select().from(s.products);
  const byId = new Map(products.map((p) => [p.id, p]));
  const existing = new Set((await db.select({ id: s.learningCards.id }).from(s.learningCards).where(inArray(s.learningCards.id, imgs.map((i) => `img-${i.id}`)))).map((r) => r.id));
  let added = 0;
  for (const img of imgs) {
    const cid = `img-${img.id}`;
    const p = byId.get(img.productId);
    if (existing.has(cid) || !p) continue;
    const wrongPool = [...p.confusableWith.map((c) => byId.get(c)).filter(Boolean), ...products.filter((x) => x.category === p.category && x.id !== p.id), ...products.filter((x) => x.id !== p.id)]
      .map((x) => x!.nameJaReading)
      .filter((n, i, a) => n !== p.nameJaReading && a.indexOf(n) === i)
      .slice(0, 3);
    const choices = [p.nameJaReading, ...wrongPool];
    const rot = img.id % choices.length; // 正解位置を分散
    const rotated = [...choices.slice(rot), ...choices.slice(0, rot)];
    await db.insert(s.learningCards).values({
      id: cid,
      kind: "IMAGE",
      productId: p.id,
      day: 7,
      prompt: `image:${img.id}|この写真の商品は？`,
      choices: rotated,
      answerIndex: rotated.indexOf(p.nameJaReading),
      explanation: `${p.nameEn}（${p.nameJaReading}）。特徴: ${p.distinguishingFeatures ?? "—"}`,
      isIllustrative: false,
    }).onConflictDoNothing();
    added++;
  }
  return added;
}
