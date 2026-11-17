import Link from "next/link";
import { firstImageByProduct, listProducts } from "@/lib/data";
import { Empty, PageTitle, Rel } from "@/components/ui";
import { CATEGORY_LABEL } from "@/lib/settings-defaults";

export default async function Products({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const [list, imgs] = await Promise.all([listProducts(q), firstImageByProduct()]);
  return (
    <main>
      <PageTitle label="Product" title="商品" sub={`${list.length}件`} />
      <form className="mb-4"><input name="q" defaultValue={q} placeholder="商品名・読み・別名で検索" className="field" /></form>
      {list.length === 0 ? <Empty>該当なし。<Link href="/import" className="underline">CSVで商品を追加</Link>できます。</Empty> : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {list.map((p) => (
            <li key={p.id}>
              <Link href={`/products/${p.id}`} className="card flex gap-3 active:opacity-70">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-ink text-[10px] text-mute">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {imgs.get(p.id) ? <img src={imgs.get(p.id)} alt="" className="h-full w-full object-cover" /> : "画像未登録"}
                </div>
                <div className="min-w-0">
                  <p className="truncate">{p.nameEn}</p>
                  <p className="truncate text-sm text-silver">{p.nameJaReading}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-mute">{CATEGORY_LABEL[p.category]} <Rel v={p.catalogStatus} /></p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
