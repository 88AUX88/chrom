import { desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import * as s from "@/db/schema";
import { PageTitle, Section } from "@/components/ui";
import { TEMPLATE_COLUMNS } from "@/lib/import/validate";
import { ImportForm } from "./import-form";

const LABEL: Record<string, string> = { products: "商品", variants: "仕様（素材・サイズ）", retail_prices: "海外正規価格", market_observations: "国内市場（出品/成約）", buyback_quotes: "買取査定", fx_rates: "為替" };

export default async function ImportPage() {
  const db = await getDb();
  const batches = await db.select({ id: s.importBatches.id, kind: s.importBatches.kind, filename: s.importBatches.filename, accepted: s.importBatches.accepted, rejected: s.importBatches.rejected, createdAt: s.importBatches.createdAt }).from(s.importBatches).orderBy(desc(s.importBatches.id)).limit(20);
  return (
    <main>
      <PageTitle label="データ取込" title="データ取込（CSV）" sub="UTF-8 の CSV。不正な行は推測で補完せず、理由付きで隔離します。" />
      <ImportForm kinds={Object.keys(TEMPLATE_COLUMNS).map((k) => ({ k, l: LABEL[k] }))} />
      <Section title="テンプレート">
        <ul className="card space-y-2 text-sm">
          {Object.entries(TEMPLATE_COLUMNS).map(([k, c]) => (
            <li key={k}><a className="underline" href={`/api/template?kind=${k}`}>{LABEL[k]}.csv</a><span className="block text-[10px] text-mute">必須: {c.required.join(", ")}</span></li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-mute">取込順: 商品 → 仕様 → 価格/市場/買取。variant_id は商品ページで仕様確定時に作られるIDか、仕様CSVで定義したIDを使用。区分の詳細は docs/DATA_RULES.md。</p>
      </Section>
      <Section title="取込履歴">
        <ul className="card divide-y divide-line p-0 text-sm">
          {batches.length === 0 && <li className="px-4 py-3 text-mute">なし</li>}
          {batches.map((b) => <li key={b.id} className="px-4 py-2">#{b.id} {LABEL[b.kind]} — {b.filename}<span className="block text-xs text-mute">受理 {b.accepted} / 隔離 {b.rejected} · {new Date(b.createdAt).toLocaleString("ja-JP")}</span></li>)}
        </ul>
      </Section>
    </main>
  );
}
