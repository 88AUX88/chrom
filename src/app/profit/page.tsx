import Link from "next/link";
import { analyze, type AnalysisRequest } from "@/lib/analysis";
import { getVariant, retailPricesFor, currentFeeRules } from "@/lib/data";
import { D, formatJpy, formatMoney, formatPct } from "@/lib/money";
import { variantLabel } from "@/lib/settings-defaults";
import { scLabel } from "@/lib/decide/engine";
import { DecisionBadge, Empty, ExtLink, PageTitle, Rel, Section, Warn } from "@/components/ui";
import { saveScenario } from "../actions";
import type { PurchasePriceSource } from "@/lib/decide/engine";
import type { ConditionGroup } from "@/lib/market/stats";

type SP = Record<string, string | undefined>;

const SOURCES: { v: PurchasePriceSource; l: string }[] = [
  { v: "STORE_OBSERVED", l: "店頭で今確認した価格" },
  { v: "OFFICIAL", l: "公式サイト価格" },
  { v: "RECEIPT", l: "レシート" },
  { v: "BUYER_REPORT", l: "購入者報告（参考）" },
  { v: "ESTIMATE", l: "推定（参考）" },
];

function toReq(sp: SP): AnalysisRequest {
  const num = (v?: string) => (v && /^\d+(\.\d+)?$/.test(v.replace(/,/g, "")) ? v.replace(/,/g, "") : null);
  return {
    variantId: sp.variant ?? "",
    country: (sp.country ?? "US").toUpperCase(),
    currency: (sp.currency ?? "USD").toUpperCase(),
    price: num(sp.price),
    priceSource: (SOURCES.some((s) => s.v === sp.src) ? sp.src : "STORE_OBSERVED") as PurchasePriceSource,
    priceObservedAt: sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null,
    priceIncludesLocalTax: sp.taxIncl === "1",
    localTaxRate: num(sp.taxRate) ?? "0",
    platform: sp.platform ?? "SNKRDUNK",
    conditionGroup: (["NEW_UNUSED", "USED", "ANY"].includes(sp.cond ?? "") ? sp.cond : "NEW_UNUSED") as ConditionGroup,
    fxOverride: num(sp.fx),
    manualSalePriceJpy: num(sp.manual),
  };
}

export default async function ProfitPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  if (!sp.variant)
    return (
      <main>
        <PageTitle label="Profit" title="利益計算・判定" />
        <Empty>まず <Link href="/scan" className="underline">SCAN</Link> または <Link href="/products" className="underline">商品</Link> から仕様を確定してください。</Empty>
      </main>
    );
  const v = await getVariant(sp.variant);
  if (!v) return <main><PageTitle label="Profit" title="利益計算・判定" /><Empty>仕様が見つかりません。</Empty></main>;
  const req = toReq(sp);
  const [a, retail, fees] = await Promise.all([analyze(req), retailPricesFor(req.variantId), currentFeeRules()]);
  if (!a) return null;
  const q = (over: Record<string, string>) => {
    const u = new URLSearchParams(Object.entries({ ...sp, ...over }).filter(([, x]) => x !== undefined) as [string, string][]);
    return `/profit?${u.toString()}`;
  };

  return (
    <main>
      <PageTitle label="Profit · Decide" title={v.product.nameEn} sub={<>{variantLabel(v.variant)} · <Link className="underline" href={`/products/${v.product.id}?variant=${encodeURIComponent(v.variant.id)}`}>商品へ</Link></>} />

      {/* 判定 */}
      <div className="card flex flex-col items-center gap-2 py-6 text-center">
        <DecisionBadge d={a.decision.decision} large />
        <p className="text-xs text-mute">{a.decision.decision === "BUY" ? "買付条件を満たします（予想であり利益は保証されません）" : a.decision.decision === "PASS" ? "現条件では見送り" : "追加確認が必要"}</p>
        {a.maxPurchaseLocal && <p className="tnum text-sm">最大仕入許容価格（保守・基準達成）: <b>{formatMoney(a.maxPurchaseLocal, req.currency)}</b></p>}
      </div>

      <ul className="mt-3 space-y-1 text-sm">
        {a.decision.reasons.map((r, i) => (
          <li key={i} className={`flex gap-2 ${r.level === "OK" ? "text-buy" : r.level === "FAIL" ? "text-pass" : r.level === "BLOCKER" ? "text-hold" : "text-silver"}`}>
            <span className="w-4 shrink-0">{r.level === "OK" ? "✓" : r.level === "FAIL" ? "✕" : r.level === "BLOCKER" ? "!" : "・"}</span>
            {r.message}
          </li>
        ))}
      </ul>
      {a.decision.todo.length > 0 && (
        <div className="card mt-3"><p className="h-label mb-1">不足している確認項目</p><ul className="list-inside list-disc text-sm">{a.decision.todo.map((t) => <li key={t}>{t}</li>)}</ul></div>
      )}

      {/* 入力 */}
      <Section title="仕入条件">
        <form className="card space-y-3" action="/profit">
          <input type="hidden" name="variant" value={req.variantId} />
          <div className="grid grid-cols-3 gap-2">
            <label className="col-span-1 text-xs text-mute">国<input name="country" defaultValue={req.country} maxLength={2} className="field mt-1 uppercase" /></label>
            <label className="col-span-1 text-xs text-mute">通貨<input name="currency" defaultValue={req.currency} maxLength={3} className="field mt-1 uppercase" /></label>
            <label className="col-span-1 text-xs text-mute">現地税率<input name="taxRate" inputMode="decimal" defaultValue={req.localTaxRate} placeholder="0.08875" className="field mt-1" /></label>
          </div>
          <label className="block text-xs text-mute">現地価格<input name="price" inputMode="decimal" defaultValue={req.price ?? ""} placeholder="例: 1250" className="field mt-1 text-lg" /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-mute">価格の根拠<select name="src" defaultValue={req.priceSource} className="field mt-1">{SOURCES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select></label>
            <label className="text-xs text-mute">確認日<input type="date" name="date" defaultValue={req.priceObservedAt ?? ""} className="field mt-1" /></label>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="taxIncl" value="1" defaultChecked={req.priceIncludesLocalTax} />表示価格は現地税込み（欧州VAT等）</label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-mute">販売先<select name="platform" defaultValue={req.platform} className="field mt-1">{fees.map((f) => <option key={f.platform} value={f.platform}>{f.platform}</option>)}</select></label>
            <label className="text-xs text-mute">比較する状態<select name="cond" defaultValue={req.conditionGroup} className="field mt-1"><option value="NEW_UNUSED">新品/未使用</option><option value="USED">中古</option><option value="ANY">全状態</option></select></label>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-mute">詳細（為替の手入力・売却価格の仮定）</summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs text-mute">為替 円/1{req.currency}<input name="fx" inputMode="decimal" defaultValue={req.fxOverride ?? ""} placeholder={a.fx.rate ?? "未登録"} className="field mt-1" /></label>
              <label className="text-xs text-mute">売却価格の仮定（円）<input name="manual" inputMode="numeric" defaultValue={req.manualSalePriceJpy ?? ""} placeholder="成約データがない場合" className="field mt-1" /></label>
            </div>
          </details>
          <button className="btn-primary w-full">計算する</button>
        </form>
        {retail.length > 0 && (
          <div className="mt-2 text-sm">
            <p className="h-label mb-1">登録済みの海外価格から入力</p>
            <div className="flex flex-wrap gap-1.5">
              {retail.map((r) => (
                <Link key={r.id} className="rounded border border-line px-2 py-1 text-xs" href={q({ country: r.country, currency: r.currency, price: String(r.amount), src: r.priceKind === "OFFICIAL" ? "OFFICIAL" : r.priceKind === "RECEIPT" ? "RECEIPT" : r.priceKind === "BUYER_REPORT" ? "BUYER_REPORT" : "ESTIMATE", date: r.observedAt, taxIncl: r.taxInclusion === "INCLUDED" ? "1" : "0" })}>
                  {r.country} {formatMoney(r.amount, r.currency)} ({r.observedAt})
                </Link>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* 前提 */}
      <Section title="計算の前提">
        <div className="card space-y-1 text-sm">
          <p>為替: {a.fx.rate ? <>{D(a.fx.rate).toString()}円 <span className="text-mute">（{a.fx.source}, {a.fx.asOf ? new Date(a.fx.asOf).toLocaleString("ja-JP") : ""}）</span></> : <span className="text-pass">未登録</span>}</p>
          <p>関税率（{a.dutyKey.split(":")[1]}）: {a.dutyRate !== null ? formatPct(D(a.dutyRate), 2) : <span className="text-pass">未確認</span>} <Rel v={a.dutyStatus} /></p>
          <p>販売手数料（{a.fee.platform}）: {a.fee.rate !== null ? formatPct(D(a.fee.rate), 2) : <span className="text-pass">未確認</span>} <Rel v={a.fee.status} /></p>
          <p>課税事業者区分: {a.businessTaxStatus === "TAXABLE" ? "課税事業者" : a.businessTaxStatus === "EXEMPT" ? "免税事業者" : <span className="text-hold">未設定（低い方を採用）</span>}</p>
          <p>経費プロファイル: {a.expenseConfirmed ? "確認済み" : <span className="text-hold">仮置き</span>} · <Link href="/settings" className="underline">設定</Link></p>
        </div>
      </Section>

      {/* シナリオ */}
      <Section title="3シナリオ（税引前・法人税等は未考慮）">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {a.scenarios.map((sc) => {
            const r = sc.result;
            return (
              <div key={sc.name} className="card">
                <div className="flex items-center justify-between"><p className="h-label">{scLabel(sc.name)}</p>{sc.isAssumption && <span className="text-[10px] text-hold">仮定</span>}</div>
                <p className="mt-1 text-xs text-mute">売却 {formatJpy(sc.priceJpy)} — {sc.basis}</p>
                {r && r.ok ? (
                  <>
                    <p className={`tnum mt-2 text-2xl font-light ${D(r.adopted.preTaxProfitJpy).isNegative() ? "text-pass" : ""}`}>{formatJpy(r.adopted.preTaxProfitJpy)}</p>
                    <p className="tnum text-xs text-mute">ROI {formatPct(r.adopted.roi ? D(r.adopted.roi) : null)} · 利益率 {formatPct(r.adopted.marginRate ? D(r.adopted.marginRate) : null)}</p>
                    {sc.name === "CONSERVATIVE" && <p className="text-[10px] text-mute">為替 {sc.fxUsed}円（上振れ想定）</p>}
                  </>
                ) : r && !r.ok ? <p className="mt-2 text-xs text-hold">計算不可: {r.missing.join("、")}</p> : <p className="mt-2 text-xs text-mute">{req.price ? "売却根拠なし" : "仕入価格未入力"}</p>}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-mute">出品価格は売却見込に使用しません。成約データ不足時の値は仮定です。確定利益ではありません。</p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div className="card"><p className="h-label">損益分岐売却価格</p><p className="tnum mt-1">{formatJpy(a.breakEvenSaleJpy)}</p></div>
          <div className="card"><p className="h-label">目標利益に必要な売却価格</p><p className="tnum mt-1">{formatJpy(a.targetSaleJpy)}</p></div>
        </div>
      </Section>

      <Breakdown a={a} />

      <form action={saveScenario} className="mt-6">
        <input type="hidden" name="req" value={JSON.stringify(req)} />
        <button className="btn w-full">この判定を履歴に保存</button>
      </form>
    </main>
  );
}

function Breakdown({ a }: { a: NonNullable<Awaited<ReturnType<typeof analyze>>> }) {
  const sc = a.scenarios.find((s) => s.result?.ok && s.name === "STANDARD") ?? a.scenarios.find((s) => s.result?.ok);
  if (!sc || !sc.result || !sc.result.ok) return null;
  const r = sc.result;
  const rows: [string, string, string?][] = [
    ["現地支払額", formatMoney(r.purchaseLocal.paidLocal, a.req.currency), `税 ${r.purchaseLocal.localTax} / 還付見込 ${r.purchaseLocal.localTaxRefund}`],
    ["円換算", formatJpy(r.purchaseJpy)],
    ["カード手数料", formatJpy(r.cardFeeJpy)],
    ["課税価格", formatJpy(r.importBreakdown.customsValueJpy), r.importBreakdown.lowValueExempt ? "少額免税適用" : undefined],
    ["関税", formatJpy(r.importBreakdown.dutyJpy)],
    ["輸入消費税（国+地方）", formatJpy(r.importBreakdown.importConsumptionTaxJpy), `課税標準 ${formatJpy(r.importBreakdown.jctBaseJpy)}`],
    ["取得までの現金支出", formatJpy(r.landedCashOutlayJpy)],
  ];
  return (
    <Section title={`内訳（${scLabel(sc.name)}シナリオ）`}>
      <div className="card p-3">
        <table className="data"><tbody>{rows.map(([k, v, n]) => <tr key={k}><td className="text-mute">{k}</td><td className="tnum text-right">{v}{n && <span className="block text-[10px] text-mute">{n}</span>}</td></tr>)}</tbody></table>
        {r.views.map((v) => (
          <div key={v.status} className="mt-3">
            <p className="h-label">{v.status === "TAXABLE" ? "課税事業者ビュー（税抜・輸入消費税は控除）" : "免税事業者ビュー（税込・輸入消費税は原価）"}{v === r.adopted && r.views.length > 1 ? " ← 採用" : ""}</p>
            <table className="data mt-1"><tbody>
              <tr><td className="text-mute">売上</td><td className="tnum text-right">{formatJpy(v.revenueJpy)}</td></tr>
              <tr><td className="text-mute">リスク控除（返品・値下げ）</td><td className="tnum text-right">-{formatJpy(v.riskReserveJpy)}</td></tr>
              <tr><td className="text-mute">取得原価</td><td className="tnum text-right">-{formatJpy(v.acquisitionCostJpy)}</td></tr>
              <tr><td>粗利益</td><td className="tnum text-right">{formatJpy(v.grossProfitJpy)}</td></tr>
              <tr><td className="text-mute">販売経費</td><td className="tnum text-right">-{formatJpy(v.sellingExpensesJpy)}</td></tr>
              <tr><td>販売経費控除後</td><td className="tnum text-right">{formatJpy(v.profitAfterSellingJpy)}</td></tr>
              <tr><td className="font-semibold">税引前利益</td><td className="tnum text-right font-semibold">{formatJpy(v.preTaxProfitJpy)}</td></tr>
              {v.status === "TAXABLE" && <tr><td className="text-mute">消費税 納付(+)/還付(-)見込</td><td className="tnum text-right">{formatJpy(v.jctSettlementJpy)}</td></tr>}
            </tbody></table>
          </div>
        ))}
        <p className="mt-2 text-sm">税引前キャッシュフロー（消費税精算前）: <span className="tnum">{formatJpy(r.cashFlowBeforeJctSettlementJpy)}</span></p>
        {r.warnings.map((w) => <div key={w} className="mt-2"><Warn>{w}</Warn></div>)}
        {a.fee.evidenceUrl && <p className="mt-2 text-xs">手数料出典: <ExtLink href={a.fee.evidenceUrl} /></p>}
      </div>
    </Section>
  );
}
