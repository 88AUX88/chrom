import { and, asc, desc, eq, lte } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/db/client";
import * as s from "@/db/schema";
import { PageTitle } from "@/components/ui";
import { Quiz } from "./quiz";

export default async function Learn({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const { day } = await searchParams;
  const db = await getDb();
  const d = Number(day);
  const cards = d >= 1 && d <= 7
    ? await db.select().from(s.learningCards).where(eq(s.learningCards.day, d)).orderBy(asc(s.learningCards.id))
    // 復習: 期限到来カードを、間違いの多い順（苦手優先）に
    : await db.select().from(s.learningCards).where(and(lte(s.learningCards.dueAt, new Date()))).orderBy(desc(s.learningCards.lapses), asc(s.learningCards.day)).limit(20);
  const all = await db.select({ day: s.learningCards.day, reps: s.learningCards.reps }).from(s.learningCards);
  const progress = [1, 2, 3, 4, 5, 6, 7].map((n) => { const c = all.filter((x) => x.day === n); return { n, total: c.length, done: c.filter((x) => x.reps > 0).length }; });
  return (
    <main>
      <PageTitle label="Learn" title={d ? `Day ${d}` : "今日の復習"} sub="1日15分。価格の暗記ではなく、識別と判断の型を身につけます。" />
      <div className="mb-4 grid grid-cols-7 gap-1 text-center text-xs">
        {progress.map((p) => (
          <Link key={p.n} href={`/learn?day=${p.n}`} className={`rounded border py-2 ${d === p.n ? "border-silver" : "border-line"}`}>D{p.n}<span className="block text-[10px] text-mute">{p.done}/{p.total}</span></Link>
        ))}
      </div>
      {d ? <Link href="/learn" className="text-xs text-mute underline">復習モードへ</Link> : null}
      <Quiz cards={cards.map((c) => ({ id: c.id, kind: c.kind, prompt: c.prompt, choices: c.choices, answerIndex: c.answerIndex, explanation: c.explanation, isIllustrative: c.isIllustrative }))} />
      <p className="mt-6 text-xs text-mute">商品名カードは未検証カタログに基づきます。実物画像クイズは参照画像（自分で撮影）登録後に追加予定。</p>
    </main>
  );
}
