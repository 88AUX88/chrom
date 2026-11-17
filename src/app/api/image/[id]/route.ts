import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import * as s from "@/db/schema";

/** 自分で撮影して登録した参照画像を返す（認証必須: middleware） */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new Response("bad id", { status: 400 });
  const db = await getDb();
  const [img] = await db.select({ dataUrl: s.productImages.dataUrl }).from(s.productImages).where(eq(s.productImages.id, id));
  const m = img?.dataUrl ? /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(img.dataUrl) : null;
  if (!m) return new Response("not found", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), { headers: { "content-type": m[1], "cache-control": "private, max-age=3600" } });
}
