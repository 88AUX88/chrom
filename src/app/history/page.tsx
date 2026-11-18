import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import * as s from "@/db/schema";
import { recentScenarios } from "@/lib/data";
import { D, formatJpy } from "@/lib/money";
import { daysBetween } from "@/lib/market/stats";
import { DecisionBadge, Empty, ErrorBanner, PageTitle, Section } from "@/components/ui";
import { addPurchase, addSale } from "../actions";

export default async function History({ searchParams }: { searchParams: Promise<{ saved?: string; err?: string }> }) {
  const { saved, err } = await searchParams;
  const db = await getDb();
  const [scen, purchases, sales, scans] = await Promise.all([
    recentScenarios(30),
    db.select({ p: s.purchases, name: s.products.nameEn }).from(s.purchases).innerJoin(s.productVariants, eq(s.purchases.variantId, s.productVariants.id)).innerJoin(s.products, eq(s.productVariants.productId, s.products.id)).orderBy(desc(s.purchases.id)),
    db.select().from(s.sales).orderBy(desc(s.sales.id)),
    db.select({ id: s.scanLogs.id, createdAt: s.scanLogs.createdAt, chosen: s.scanLogs.chosenProductId, thumb: s.scanLogs.thumbnailDataUrl }).from(s.scanLogs).orderBy(desc(s.scanLogs.id)).limit(10),
  ]);
  const saleByPurchase = new Map(sales.map((x) => [x.purchaseId, x]));
  const realized = purchases.flatMap(({ p, name }) => {
    const sale = saleByPurchase.get(p.id);
    if (!sale) return [];
    const actual = D(sale.priceJpy).minus(sale.feesJpy).minus(sale.shippingJpy).minus(sale.otherCostsJpy).minus(p.totalCostJpy);
    return [{ p, name, sale, actual, days: daysBetween(p.purchasedAt, sale.soldAt), error: p.expectedProfitJpy !== null ? actual.minus(p.expectedProfitJpy) : null }];
  });
  const withErr = realized.filter((r) => r.error !== null);
  const mae = withErr.length ? withErr.reduce((a, r) => a.plus(r.error!.abs()), D(0)).dividedBy(withErr.length) : null;

  return (
    <main>
      <PageTitle label="履歴" title="履歴" />
      <ErrorBanner err={err} />
      {saved && <p className="mb-3 rounded-lg border border-buy/40 bg-buy/10 px-3 py-2 text-sm text-buy">判定を保存しました。</p>}

      <Section title="判定履歴（予想）">
        {scen.length === 0 ? <Empty>判定の保存はまだありません</Empty> : (
          <ul className="card divide-y divide-line p-0 text-sm">
            {scen.map((r) => {
              const inp = r.inputs as { country: string; currency: string; price: string | null };
              return <li key={r.id} className="flex items-center justify-between px-4 py-2"><span>#{r.id} {r.productName}<span className="block text-xs text-mute">{inp.country} {inp.currency} {inp.price ?? "—"} · {new Date(r.createdAt).toLocaleString("ja-JP")}</span></span><DecisionBadge d={r.decision} /></li>;
            })}
          </ul>
        )}
      </Section>

      <Section title="実績（予想との誤差）">
        {realized.length === 0 ? <Empty>販売実績はまだありません。購入と販売を記録すると、予想利益との誤差を測定します。</Empty> : (
          <div className="card overflow-x-auto p-3">
            <table className="data"><thead><tr><th>商品</th><th>実利益</th><th>予想</th><th>誤差</th><th>日数</th></tr></thead>
              <tbody>{realized.map((r) => <tr key={r.p.id}><td>{r.name}{r.sale.returned && <span className="block text-xs text-pass">返品</span>}</td><td className="tnum">{formatJpy(r.actual)}</td><td className="tnum">{formatJpy(r.p.expectedProfitJpy)}</td><td className="tnum">{r.error ? formatJpy(r.error) : "—"}</td><td className="tnum">{r.days}日</td></tr>)}</tbody>
            </table>
            <p className="mt-2 text-xs text-mute">平均絶対誤差: {mae ? formatJpy(mae) : "—"}（{withErr.length}件。件数が少ないうちは参考値）</p>
          </div>
        )}
      </Section>

      <Section title="購入を記録">
        <form action={addPurchase} className="card grid grid-cols-2 gap-2">
          <label className="col-span-2 text-xs text-mute">仕様ID（variant_id）<select name="variantId" className="field mt-1" required>{scen.map((r) => <option key={r.id} value={r.variantId}>{r.productName} — {r.variantId}</option>)}</select></label>
          <label className="text-xs text-mute">購入日<input type="date" name="purchasedAt" required className="field mt-1" /></label>
          <label className="text-xs text-mute">国<input name="country" required maxLength={2} className="field mt-1" /></label>
          <label className="text-xs text-mute">通貨<input name="currency" required maxLength={3} className="field mt-1" /></label>
          <label className="text-xs text-mute">現地支払額<input name="amount" inputMode="decimal" required className="field mt-1" /></label>
          <label className="text-xs text-mute">実際の為替<input name="fx" inputMode="decimal" required className="field mt-1" /></label>
          <label className="text-xs text-mute">取得原価合計（円）<input name="totalCostJpy" inputMode="numeric" required className="field mt-1" /></label>
          <label className="text-xs text-mute">うち輸入消費税（円）<input name="importCtJpy" inputMode="numeric" className="field mt-1" /></label>
          <label className="text-xs text-mute">予想利益（円）<input name="expectedProfitJpy" inputMode="numeric" className="field mt-1" /></label>
          <label className="col-span-2 text-xs text-mute">店舗・メモ<input name="store" className="field mt-1" /></label>
          <button className="btn col-span-2" disabled={scen.length === 0}>購入を記録</button>
          {scen.length === 0 && <p className="col-span-2 text-xs text-mute">先に判定を保存してください。</p>}
        </form>
      </Section>

      <Section title="販売を記録">
        <form action={addSale} className="card grid grid-cols-2 gap-2">
          <label className="col-span-2 text-xs text-mute">購入<select name="purchaseId" className="field mt-1" required>{purchases.filter(({ p }) => !saleByPurchase.has(p.id)).map(({ p, name }) => <option key={p.id} value={p.id}>#{p.id} {name} {p.purchasedAt}</option>)}</select></label>
          <label className="text-xs text-mute">販売先<input name="platform" required className="field mt-1" defaultValue="SNKRDUNK" /></label>
          <label className="text-xs text-mute">出品日<input type="date" name="listedAt" className="field mt-1" /></label>
          <label className="text-xs text-mute">成約日<input type="date" name="soldAt" required className="field mt-1" /></label>
          <label className="text-xs text-mute">売却価格（円）<input name="priceJpy" inputMode="numeric" required className="field mt-1" /></label>
          <label className="text-xs text-mute">手数料実績（円）<input name="feesJpy" inputMode="numeric" required className="field mt-1" /></label>
          <label className="text-xs text-mute">送料（円）<input name="shippingJpy" inputMode="numeric" className="field mt-1" /></label>
          <label className="text-xs text-mute">その他（円）<input name="otherCostsJpy" inputMode="numeric" className="field mt-1" /></label>
          <label className="text-xs text-mute">値下げ回数<input name="markdownCount" inputMode="numeric" className="field mt-1" /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="returned" />返品あり</label>
          <button className="btn col-span-2" disabled={purchases.length === 0}>販売を記録</button>
        </form>
      </Section>

      <Section title="最近のスキャン">
        {scans.length === 0 ? <Empty>スキャン履歴なし</Empty> : (
          <ul className="grid grid-cols-5 gap-1">{scans.map((x) => <li key={x.id} title={x.chosen ?? "未確定"}>
                {x.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={x.thumb} alt="" className="aspect-square w-full rounded object-cover" />
                ) : <div className="aspect-square rounded bg-panel" />}
              </li>)}</ul>
        )}
      </Section>

      <Section title="エクスポート / バックアップ">
        <div className="card flex flex-wrap gap-2 text-sm">
          <a className="btn" href="/api/export?table=all">全データ JSON</a>
          {([["buying_scenarios", "判定履歴"], ["purchases", "購入記録"], ["sales", "販売記録"], ["market_observations", "国内外の相場"], ["retail_prices", "正規店の価格"]] as const).map(([t, l]) => <a key={t} className="btn" href={`/api/export?table=${t}`}>{l}（CSV）</a>)}
        </div>
      </Section>
    </main>
  );
}
