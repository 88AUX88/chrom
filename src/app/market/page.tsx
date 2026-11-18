import Link from "next/link";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { allLatestFx, buybackFor, getDecisionSettings, getVariant, marketObservationsFor, retailPricesFor } from "@/lib/data";
import { analyzeLiquidity, LEVEL_LABEL } from "@/lib/market/liquidity";
import { priceStats, daysBetween, isStale, type ConditionGroup } from "@/lib/market/stats";
import { D, formatJpy, formatMoney } from "@/lib/money";
import { variantLabel } from "@/lib/settings-defaults";
import { Empty, ExtLink, PageTitle, Rel, Section, Stat } from "@/components/ui";

const RETAIL_KIND: Record<string, string> = { OFFICIAL: "正規店定価", RECEIPT: "正規購入レシート", BUYER_REPORT: "購入報告", ESTIMATE: "推定", UNKNOWN: "不明" };
const MARKET_KIND: Record<string, string> = { ASK: "出品中の価格（ASK・未成約）", VERIFIED_SOLD: "売れた価格（SOLD・確認済）", REPORTED_SOLD: "売れた価格（SOLD・報告）", ESTIMATE: "推定" };

export default async function MarketPage({ searchParams }: { searchParams: Promise<{ variant?: string; cond?: string }> }) {
  const sp = await searchParams;
  const db = await getDb();
  if (!sp.variant) {
    const rows = (await db.execute<{ variant_id: string; name_en: string; n: number }>(sql`
      select v.id as variant_id, p.name_en, count(*)::int as n from (
        select variant_id from retail_prices where retracted_at is null
        union all select variant_id from market_observations where retracted_at is null
        union all select variant_id from buyback_quotes where retracted_at is null) d
      join product_variants v on v.id = d.variant_id join products p on p.id = v.product_id
      group by v.id, p.name_en order by n desc`)).rows;
    return (
      <main>
        <PageTitle label="相場" title="世界相場・流動性" sub="価格データのある仕様" />
        {rows.length === 0 ? <Empty>まだ価格データがありません。<Link href="/import" className="underline">取込</Link>から追加してください。</Empty> : (
          <ul className="card divide-y divide-line p-0">{rows.map((r) => <li key={r.variant_id}><Link href={`/market?variant=${encodeURIComponent(r.variant_id)}`} className="flex justify-between px-4 py-3 text-sm"><span>{r.name_en}<span className="block text-[10px] text-mute">{r.variant_id}</span></span><span className="text-mute">{r.n}件 ›</span></Link></li>)}</ul>
        )}
      </main>
    );
  }
  const v = await getVariant(sp.variant);
  if (!v) return <main><Empty>仕様が見つかりません</Empty></main>;
  const cond = (["NEW_UNUSED", "USED", "ANY"].includes(sp.cond ?? "") ? sp.cond : "NEW_UNUSED") as ConditionGroup;
  const today = new Date().toISOString().slice(0, 10);
  const [retail, obsAll, buyback, fx, settings] = await Promise.all([retailPricesFor(sp.variant), marketObservationsFor(v.product.id), buybackFor(sp.variant), allLatestFx(), getDecisionSettings()]);
  const obs = obsAll.filter((o) => o.variantId === sp.variant);
  const fxMap = new Map(fx.map((f) => [f.currency, f]));
  const toJpy = (amount: string, cur: string) => (cur === "JPY" ? D(amount) : fxMap.has(cur) ? D(amount).times(fxMap.get(cur)!.jpy_per_unit) : null);
  const freshBb = buyback.filter((b) => Math.floor((Date.parse(today) - Date.parse(b.quotedAt)) / 86400000) <= settings.buybackMaxAgeDays);
  const liq = analyzeLiquidity(obs.filter((o) => o.country === "JP"), sp.variant, cond, today, settings.marketMaxAgeDays, freshBb.length > 0);

  // 国 × 種別 の集計（海外市場を含む・90日）
  const groups = new Map<string, typeof obs>();
  for (const o of obs) {
    const d = o.soldAt ?? o.observedAt;
    if (daysBetween(d, today) > 90) continue;
    const k = `${o.country}|${o.platform}|${o.kind}`;
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }

  return (
    <main>
      <PageTitle label="相場・売れやすさ" title={v.product.nameEn} sub={<>{variantLabel(v.variant)} · <Link href={`/products/${v.product.id}?variant=${encodeURIComponent(sp.variant)}`} className="underline">商品へ</Link></>} />

      <Section title={`需要・流動性（日本・${cond === "NEW_UNUSED" ? "新品/未使用" : cond === "USED" ? "中古" : "全状態"}）`}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="成約 30日 / 90日" value={liq.dataStatus === "NO_DATA" ? "不明" : `${liq.sold30} / ${liq.sold90}`} sub={liq.soldPerMonth !== null ? `月 ${liq.soldPerMonth}件` : "データ未取得"} />
          <Stat label="成約価格（中央値）" value={formatJpy(liq.soldStats90.median)} sub={liq.soldStats90.min ? `${formatJpy(liq.soldStats90.min)}〜${formatJpy(liq.soldStats90.max)}` : "—"} />
          <Stat label="競合出品" value={liq.dataStatus === "NO_DATA" ? "不明" : `${liq.activeAsks}件`} sub={liq.askStats.min ? `最安 ${formatJpy(liq.askStats.min)}` : "—"} />
          <Stat label="販売までの日数" value={liq.daysToSell.median !== null ? `${liq.daysToSell.median}日` : "算出不能"} sub={`記録 ${liq.daysToSell.n}件`} />
          <Stat label="価格のばらつき" value={liq.soldStats90.cv ? `${(Number(liq.soldStats90.cv) * 100).toFixed(1)}%` : "算出不能"} sub="成約5件以上で算出" />
          <Stat label="在庫月数" value={liq.monthsOfSupply !== null ? `${liq.monthsOfSupply}か月` : "算出不能"} sub={`在庫リスク ${LEVEL_LABEL[liq.inventoryRisk]}`} />
          <Stat label="現金化しやすさ" value={LEVEL_LABEL[liq.convertibility]} sub={buyback.length ? "買取査定あり" : "買取査定なし"} />
          <Stat label="出品と成約の差" value={liq.askOverSoldPct !== null ? `${liq.askOverSoldPct > 0 ? "+" : ""}${(liq.askOverSoldPct * 100).toFixed(0)}%` : "—"} sub="出品中央値÷成約中央値" />
        </div>
        {liq.notes.length > 0 && <ul className="mt-2 space-y-0.5 text-xs text-mute">{liq.notes.map((n) => <li key={n}>・{n}</li>)}</ul>}
      </Section>

      <Section title="正規店・購入報告価格（国別）">
        {retail.length === 0 ? <Empty>正規価格データなし（海外転売価格から定価は作りません）</Empty> : (
          <div className="card overflow-x-auto p-3">
            <table className="data min-w-[520px]">
              <thead><tr><th>国</th><th>種別</th><th>現地価格</th><th>円換算（現在為替）</th><th>確認日</th><th>出典</th></tr></thead>
              <tbody>{retail.map((r) => {
                const jpy = toJpy(String(r.amount), r.currency);
                return (
                  <tr key={r.id}>
                    <td>{r.country}</td>
                    <td>{RETAIL_KIND[r.priceKind]} <Rel v={r.reliability} /></td>
                    <td className="tnum">{formatMoney(r.amount, r.currency)}<span className="block text-[10px] text-mute">{r.taxInclusion === "INCLUDED" ? "税込" : r.taxInclusion === "EXCLUDED" ? "税別" : "税区分不明"}</span></td>
                    <td className="tnum">{jpy ? formatJpy(jpy) : <span className="text-hold">為替未登録</span>}</td>
                    <td className="tnum text-xs">{r.observedAt}{isStale(r.observedAt, settings.retailMaxAgeDays, today) && <Rel v="STALE" />}</td>
                    <td><ExtLink href={r.url} /></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="二次流通（国・販売先・種別ごと、90日）">
        {groups.size === 0 ? <Empty>二次流通データ未取得（成約0件とは異なります）</Empty> : (
          <div className="card overflow-x-auto p-3">
            <table className="data min-w-[560px]">
              <thead><tr><th>国 / 販売先</th><th>種別</th><th>件数</th><th>中央値（円）</th><th>中央値（現地）</th><th>最新</th></tr></thead>
              <tbody>{[...groups.entries()].sort().map(([k, list]) => {
                const [country, platform, kind] = k.split("|");
                const st = priceStats(list.map((o) => D(o.priceJpy)));
                const local = list[0].currency !== "JPY" ? priceStats(list.filter((o) => o.priceLocal).map((o) => D(o.priceLocal!))) : null;
                const latest = list.map((o) => o.soldAt ?? o.observedAt).sort().at(-1);
                const verified = list.filter((o) => o.reliability === "VERIFIED").length;
                return (
                  <tr key={k}>
                    <td>{country} / {platform}</td>
                    <td className={kind === "ASK" ? "text-mute" : ""}>{MARKET_KIND[kind]}<span className="block text-[10px] text-mute">確認済 {verified}/{list.length}</span></td>
                    <td className="tnum">{list.length}</td>
                    <td className="tnum">{formatJpy(st.median)}</td>
                    <td className="tnum">{local?.median ? formatMoney(local.median, list[0].currency) : "—"}</td>
                    <td className="tnum text-xs">{latest}</td>
                  </tr>
                );
              })}</tbody>
            </table>
            <p className="mt-2 text-[10px] text-mute">海外の円換算は各観測時に記録したレート。出品ASKは売れた価格ではありません。</p>
          </div>
        )}
      </Section>

      <Section title="業者買取・個別査定">
        {buyback.length === 0 ? <Empty>買取査定データなし</Empty> : (
          <ul className="card divide-y divide-line p-0 text-sm">{buyback.map((b) => <li key={b.id} className="flex justify-between px-4 py-2"><span>{b.shop}<span className="block text-[10px] text-mute">{b.quoteKind === "INDIVIDUAL_APPRAISAL" ? "個別査定" : "買取価格表"} · {b.quotedAt} · {b.condition}</span></span><span className="tnum">{formatJpy(b.priceJpy)} <Rel v={b.reliability} /></span></li>)}</ul>
        )}
      </Section>
    </main>
  );
}
