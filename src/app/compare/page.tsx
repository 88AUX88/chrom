import Link from "next/link";
import { analyze, type AnalysisRequest } from "@/lib/analysis";
import { currentFeeRules, getDecisionSettings, getVariant, retailPricesFor } from "@/lib/data";
import { D, formatJpy, formatMoney, formatPct } from "@/lib/money";
import { isStale } from "@/lib/market/stats";
import { variantLabel } from "@/lib/settings-defaults";
import { DecisionBadge, Empty, PageTitle, Rel, Section } from "@/components/ui";
import type { PurchasePriceSource } from "@/lib/decide/engine";

const srcOf = (k: string): PurchasePriceSource => (k === "OFFICIAL" ? "OFFICIAL" : k === "RECEIPT" ? "RECEIPT" : k === "BUYER_REPORT" ? "BUYER_REPORT" : "ESTIMATE");

export default async function Compare({ searchParams }: { searchParams: Promise<{ variant?: string; platform?: string }> }) {
  const sp = await searchParams;
  if (!sp.variant) return <main><PageTitle label="比較" title="国・販売先比較" /><Empty>商品ページで仕様を確定してから比較してください。<Link href="/products" className="underline">商品へ</Link></Empty></main>;
  const v = await getVariant(sp.variant);
  if (!v) return <main><Empty>仕様が見つかりません。</Empty></main>;
  const [retail, fees, settings] = await Promise.all([retailPricesFor(sp.variant), currentFeeRules(), getDecisionSettings()]);
  const platform = sp.platform ?? "SNKRDUNK";
  const today = new Date().toISOString().slice(0, 10);

  // 国ごとに最新の価格を1件
  const latestByCountry = new Map<string, (typeof retail)[number]>();
  for (const r of retail) if (!latestByCountry.has(r.country) || latestByCountry.get(r.country)!.observedAt < r.observedAt) latestByCountry.set(r.country, r);
  const base = (r: (typeof retail)[number], pf: string): AnalysisRequest => ({
    variantId: sp.variant!, country: r.country, currency: r.currency, price: String(r.amount), priceSource: srcOf(r.priceKind), priceObservedAt: r.observedAt,
    priceIncludesLocalTax: r.taxInclusion === "INCLUDED", localTaxRate: "0", localTaxConfirmed: false, platform: pf, conditionGroup: "NEW_UNUSED", fxOverride: null, manualSalePriceJpy: null,
  });
  const rows = await Promise.all([...latestByCountry.values()].map(async (r) => ({ r, a: (await analyze(base(r, platform)))! })));
  const profitOf = (x: (typeof rows)[number], i: number) => { const res = x.a.scenarios[i].result; return res && res.ok ? D(res.adopted.preTaxProfitJpy) : null; };
  // キャッシュ回収優先: 保守利益の ROI 降順（仕入額の大きさでは並べない）
  rows.sort((x, y) => {
    const rx = x.a.scenarios[0].result, ry = y.a.scenarios[0].result;
    const ax = rx && rx.ok && rx.adopted.roi ? Number(rx.adopted.roi) : -Infinity;
    const ay = ry && ry.ok && ry.adopted.roi ? Number(ry.adopted.roi) : -Infinity;
    return ay - ax;
  });
  const best = rows[0];
  const routes = best ? await Promise.all(fees.map(async (f) => ({ f, a: (await analyze(base(best.r, f.platform)))! }))) : [];

  return (
    <main>
      <PageTitle label="比較" title={v.product.nameEn} sub={variantLabel(v.variant)} />
      <p className="text-xs text-mute">重量: {v.variant.weightG ? `${v.variant.weightG}g（根拠あり）` : "未計測"} ・ 購入難易度: データなし（現地確認の記録が必要）</p>
      <div className="mt-2 flex gap-1 text-xs">{fees.map((f) => <Link key={f.platform} href={`?variant=${encodeURIComponent(sp.variant!)}&platform=${f.platform}`} className={`rounded border px-2 py-1 ${platform === f.platform ? "border-silver" : "border-line text-mute"}`}>{f.platform}</Link>)}</div>

      <Section title={`仕入国の比較（販売先 ${platform}、保守ROI順）`}>
        {rows.length === 0 ? <Empty>この仕様の海外価格データがありません。</Empty> : (
          <div className="card overflow-x-auto p-3">
            <table className="data min-w-[560px]">
              <thead><tr><th>国</th><th>仕入</th><th>取得原価</th><th>保守利益</th><th>標準利益</th><th>保守ROI</th><th>判定</th><th>信頼性</th></tr></thead>
              <tbody>
                {rows.map(({ r, a }) => {
                  const c = a.scenarios[0].result;
                  return (
                    <tr key={r.country}>
                      <td>{r.country}</td>
                      <td className="tnum">{formatMoney(r.amount, r.currency)}<span className="block text-[10px] text-mute">{r.observedAt}</span></td>
                      <td className="tnum">{c && c.ok ? formatJpy(c.landedCashOutlayJpy) : "—"}</td>
                      <td className="tnum">{formatJpy(profitOf({ r, a }, 0)?.toString() ?? null)}</td>
                      <td className="tnum">{formatJpy(profitOf({ r, a }, 1)?.toString() ?? null)}</td>
                      <td className="tnum">{c && c.ok && c.adopted.roi ? formatPct(D(c.adopted.roi)) : "—"}</td>
                      <td><DecisionBadge d={a.decision.decision} /></td>
                      <td><Rel v={r.reliability} />{isStale(r.observedAt, settings.retailMaxAgeDays, today) && <Rel v="STALE" />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-mute">資金拘束 = 取得原価（現金支出）。需要は販売先共通の成約件数（{rows[0].a.market.sold.count}件/{rows[0].a.market.windowDays}日）。</p>
          </div>
        )}
      </Section>

      {best && (
        <Section title={`販売先の比較（仕入: ${best.r.country} ${formatMoney(best.r.amount, best.r.currency)}）`}>
          <div className="card overflow-x-auto p-3">
            <table className="data">
              <thead><tr><th>販売先</th><th>想定売却(標準)</th><th>手数料</th><th>標準利益</th><th>保守利益</th></tr></thead>
              <tbody>
                {routes.map(({ f, a }) => {
                  const sc = a.scenarios[1], cons = a.scenarios[0];
                  return (
                    <tr key={f.platform}>
                      <td>{f.platform}</td>
                      <td className="tnum">{formatJpy(sc.priceJpy)}<span className="block text-[10px] text-mute">{sc.basis}</span></td>
                      <td>{f.fee_rate !== null ? formatPct(D(f.fee_rate)) : "未確認"} <Rel v={f.status} /></td>
                      <td className="tnum">{sc.result && sc.result.ok ? formatJpy(sc.result.adopted.preTaxProfitJpy) : "—"}</td>
                      <td className="tnum">{cons.result && cons.result.ok ? formatJpy(cons.result.adopted.preTaxProfitJpy) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </main>
  );
}
