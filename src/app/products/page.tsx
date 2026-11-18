import Link from "next/link";
import { allAliases, firstImageByProduct, listProducts } from "@/lib/data";
import { Empty, PageTitle, Rel } from "@/components/ui";
import { CATEGORY_LABEL, MATERIAL_LABEL } from "@/lib/settings-defaults";
import { MATERIALS, PRODUCT_CATEGORIES } from "@/db/schema";
import { findDuplicates } from "@/lib/catalog";

type SP = { q?: string; category?: string; material?: string; status?: string };

export default async function Products({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [list, imgs, all, aliases] = await Promise.all([listProducts(sp), firstImageByProduct(), listProducts(), allAliases()]);
  const dups = findDuplicates(all.map((p) => ({ id: p.id, nameEn: p.nameEn, nameJaReading: p.nameJaReading, aliases: aliases.filter((a) => a.productId === p.id).map((a) => a.alias) })));
  const filtered = !!(sp.q || sp.category || sp.material || sp.status);
  return (
    <main>
      <PageTitle label="商品図鑑" title="商品図鑑" sub={<>{list.length}件{filtered ? `（全${all.length}件中）` : ""} · <Link href="/products/new" className="underline">＋商品を追加</Link></>} />
      <form className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" role="search">
        <input name="q" defaultValue={sp.q} placeholder="名称・読み・別名・型番" aria-label="検索語" className="field col-span-2 sm:col-span-4" />
        <select name="category" defaultValue={sp.category ?? ""} aria-label="カテゴリー" className="field"><option value="">全カテゴリー</option>{PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select>
        <select name="material" defaultValue={sp.material ?? ""} aria-label="素材" className="field"><option value="">全素材</option>{MATERIALS.map((m) => <option key={m} value={m}>{MATERIAL_LABEL[m]}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ""} aria-label="確認状態" className="field"><option value="">全確認状態</option><option value="VERIFIED">確認済</option><option value="REPORTED">報告あり</option><option value="UNVERIFIED">未検証</option></select>
        <div className="flex gap-2"><button className="btn-primary flex-1">絞り込み</button>{filtered && <Link href="/products" className="btn">解除</Link>}</div>
      </form>

      {dups.length > 0 && (
        <div className="mb-3 rounded-lg border border-hold/40 bg-hold/10 p-3 text-sm text-hold" data-testid="duplicates">
          重複の可能性 {dups.length}組: {dups.map((d) => <span key={d.key} className="mr-2">[{d.reason}] {d.ids.map((id) => <Link key={id} href={`/products/${id}`} className="mr-1 underline">{id}</Link>)}</span>)}
        </div>
      )}

      {list.length === 0 ? <Empty>該当なし。<Link href="/products/new" className="underline">商品を追加</Link>または<Link href="/import" className="underline">CSVで取込</Link>できます。</Empty> : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <li key={p.id} className="fade-in">
              <Link href={`/products/${p.id}`} className="card flex gap-3 transition-colors hover:border-silver/50 active:opacity-70">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-ink text-center text-[10px] text-mute">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {imgs.get(p.id) ? <img src={imgs.get(p.id)} alt={`${p.nameEn}（自分で撮影）`} className="h-full w-full object-cover" /> : "画像未取得"}
                </div>
                <div className="min-w-0">
                  <p className="truncate">{p.nameEn}</p>
                  <p className="truncate text-sm text-silver">{p.nameJaReading}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-mute">{CATEGORY_LABEL[p.category]} <Rel v={p.catalogStatus} /> <span>· 更新 {new Date(p.updatedAt).toISOString().slice(0, 10)}</span></p>
                  <p className="truncate text-[10px] text-mute">ID {p.id}{p.officialModelNumber ? ` · 型番 ${p.officialModelNumber}` : " · 型番未確認"}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
