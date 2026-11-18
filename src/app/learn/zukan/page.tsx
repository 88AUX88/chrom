import Link from "next/link";
import { firstImageByProduct, listProducts } from "@/lib/data";
import { CATEGORY_LABEL } from "@/lib/settings-defaults";
import { PageTitle, Rel } from "@/components/ui";

/** 暗記用の商品図鑑: 名前を隠して特徴・写真から思い出す（タップで答え） */
export default async function Zukan({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const [list, imgs] = await Promise.all([listProducts({ category }), firstImageByProduct()]);
  return (
    <main>
      <PageTitle label="学習・図鑑" title="商品図鑑" sub="特徴（と写真）を見て名前を思い出し、タップで答えを確認" />
      <div className="mb-3 flex flex-wrap gap-1 text-xs">
        <Link href="/learn/zukan" className={`rounded border px-2 py-1 ${!category ? "border-silver" : "border-line text-mute"}`}>すべて</Link>
        {[...new Set((await listProducts()).map((p) => p.category))].map((c) => <Link key={c} href={`/learn/zukan?category=${c}`} className={`rounded border px-2 py-1 ${category === c ? "border-silver" : "border-line text-mute"}`}>{CATEGORY_LABEL[c]}</Link>)}
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {list.map((p) => (
          <li key={p.id} className="card">
            {imgs.get(p.id) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imgs.get(p.id)} alt="自分で撮影した参照画像" className="mb-2 h-40 w-full rounded-lg object-cover" />
            )}
            <p className="text-sm text-silver">{CATEGORY_LABEL[p.category]} · {p.distinguishingFeatures ?? "特徴未登録"}</p>
            <details className="mt-2">
              <summary className="cursor-pointer text-sm">答えを見る</summary>
              <p className="mt-1 text-lg">{p.nameEn}</p>
              <p className="text-silver">{p.nameJaReading} <Rel v={p.catalogStatus} /></p>
              <Link href={`/products/${p.id}`} className="text-xs underline">商品詳細へ</Link>
            </details>
          </li>
        ))}
      </ul>
    </main>
  );
}
