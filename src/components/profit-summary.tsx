import Link from "next/link";
import type { ReactNode } from "react";
import type { Analysis } from "@/lib/analysis";
import { D, formatJpy, formatMoney, formatPct } from "@/lib/money";
import { scLabel } from "@/lib/decide/engine";
import { profitUrl } from "@/lib/summary";
import { Cert, DecisionBadge, ExtLink } from "./ui";

function Row({ label, value, c, sub }: { label: string; value: ReactNode; c?: string; sub?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 border-t border-line py-2 first:border-t-0">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {sub && <p className="text-[11px] text-mute">{sub}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 text-right">
        <span className="tnum text-sm">{value}</span>
        {c && <Cert c={c} />}
      </div>
    </div>
  );
}

const TAX_LABEL: Record<string, string> = { TAXABLE: "課税事業者（原則）", SIMPLIFIED: "課税事業者（簡易）", EXEMPT: "免税事業者", UNKNOWN: "未設定" };
const ORIGIN_LABEL = { PLAN: "登録した買付計画", RETAIL: "登録済みの海外正規価格", NONE: "価格未登録" } as const;

/** 商品詳細（スマホ）で一目で分かる概算利益と判定 */
export function ProfitSummary({ a, priceOrigin }: { a: Analysis; priceOrigin: keyof typeof ORIGIN_LABEL }) {
  const d = a.decision.decision;
  const ring = d === "BUY" ? "border-buy/70" : d === "PASS" ? "border-pass/70" : "border-hold/70";
  const pick = a.scenarios.find((s) => s.name === "STANDARD" && s.result?.ok) ?? a.scenarios.find((s) => s.result?.ok);
  const r = pick?.result && pick.result.ok ? pick.result : null;
  const v = r?.adopted;
  const cur = a.req.currency;
  const blockers = a.decision.reasons.filter((x) => x.level === "BLOCKER" || x.level === "FAIL");

  return (
    <section className={`mt-4 rounded-2xl border-2 ${ring} bg-panel p-4`} data-testid="profit-summary">
      {/* 一目で分かる部分 */}
      <div className="flex items-center justify-between">
        <DecisionBadge d={d} large />
        <div className="text-right">
          <p className="h-label">概算利益</p>
          <Cert c={a.certainty.profit} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        {a.scenarios.map((sc) => {
          const res = sc.result && sc.result.ok ? sc.result : null;
          const neg = res && D(res.adopted.preTaxProfitJpy).isNegative();
          return (
            <div key={sc.name} className="rounded-lg bg-ink px-1 py-2">
              <p className="text-[10px] text-mute">{scLabel(sc.name)}{sc.isAssumption && sc.priceJpy ? "※" : ""}</p>
              <p className={`tnum text-base font-medium ${neg ? "text-pass" : ""}`}>{res ? formatJpy(res.adopted.preTaxProfitJpy) : "—"}</p>
              <p className="tnum text-[10px] text-mute">ROI {res?.adopted.roi ? formatPct(D(res.adopted.roi), 0) : "—"}</p>
            </div>
          );
        })}
      </div>
      {a.maxPurchaseLocal && <p className="tnum mt-2 text-center text-sm">最大仕入許容価格 <b>{formatMoney(a.maxPurchaseLocal, cur)}</b> <Cert c={a.certainty.profit} /></p>}
      {blockers.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-hold">{blockers.slice(0, 4).map((b, i) => <li key={i}>! {b.message}</li>)}{blockers.length > 4 && <li>ほか {blockers.length - 4} 件</li>}</ul>
      )}
      <p className="mt-1 text-[10px] text-mute">※は仮定値。販売用の商業輸入として計算。利益は予測であり保証されません。価格の出所: {ORIGIN_LABEL[priceOrigin]}</p>

      {/* 内訳 */}
      <details className="mt-3" open>
        <summary className="cursor-pointer text-sm text-silver">内訳（{pick ? `${scLabel(pick.name)}シナリオ` : "計算不可"}）</summary>
        <div className="mt-2">
          <Row label="購入国 / 原産国" value={<>{a.purchaseCountry} / {a.originCountry ?? "未設定"}</>} c={a.originCertainty} sub="関税は原産国で判定（購入国とは別）" />
          <Row
            label={`正規購入価格（${a.purchaseCountry}）`}
            value={a.req.price ? formatMoney(a.req.price, cur) : "未登録"}
            c={a.certainty.purchasePrice}
            sub={a.req.priceObservedAt ? `確認日 ${a.req.priceObservedAt}` : "確認日なし"}
          />
          <Row label="円換算" value={r ? formatJpy(r.purchaseJpy) : "—"} c={a.certainty.fx} sub={a.fx.rate ? `為替 ${D(a.fx.rate).toString()}円/${cur}（${a.fx.asOf?.slice(0, 10)}）` : "為替未登録"} />
          <Row
            label="関税率 / 関税額"
            value={<>{a.duty.rate !== null ? formatPct(D(a.duty.rate), 2) : "未確認"}{a.dutyAssumed ? "（仮定）" : ""} / {r ? formatJpy(r.importBreakdown.dutyJpy) : "—"}</>}
            c={a.certainty.duty}
            sub={`HS ${a.duty.hsCode ?? "未設定"}・${a.duty.rateType === "EPA" ? "協定(EPA)税率" : "一般税率"}・課税価格 ${r ? formatJpy(r.importBreakdown.customsValueJpy) : "—"}`}
          />
          <Row label="輸入消費税（国+地方）" value={r ? formatJpy(r.importBreakdown.importConsumptionTaxJpy) : "—"} c={a.certainty.importTax} sub={a.businessTaxStatus === "TAXABLE" ? "原則課税: 仕入税額控除の対象（原価から除外）" : "控除しない（原価に含む）"} />
          <Row label={`販売手数料（${a.fee.platform}）`} value={<>{a.fee.rate !== null ? formatPct(D(a.fee.rate), 1) : "未確認"} / {r ? formatJpy(r.costLines.platformFeeJpy) : "—"}</>} c={a.certainty.fee} />
          <Row label="旅費（配賦）" value={r ? formatJpy(r.costLines.travelAllocationJpy) : "—"} c={a.certainty.expenses} />
          <Row label="送料（国際 / 国内+梱包）" value={r ? <>{formatJpy(r.costLines.intlShippingJpy)} / {formatJpy(D(r.costLines.domesticShippingJpy).plus(r.costLines.packagingJpy))}</> : "—"} c={a.certainty.expenses} />
          <Row label="その他経費（カード・保険・通関・その他）" value={r ? formatJpy(D(r.cardFeeJpy).plus(r.costLines.insuranceJpy).plus(r.costLines.customsBrokerFeeJpy).plus(r.costLines.otherCostsJpy)) : "—"} c={a.certainty.expenses} sub={r ? `返品・値下げリスク控除 ${formatJpy(r.costLines.riskReserveJpy)}` : undefined} />
          <Row label="総取得原価（現金支出）" value={r ? formatJpy(r.landedCashOutlayJpy) : "—"} c={a.certainty.acquisition} sub={v ? `会計上の取得原価 ${formatJpy(v.acquisitionCostJpy)}（${TAX_LABEL[v.status]}）` : undefined} />
          <Row label="手残り（消費税精算前）" value={r ? formatJpy(r.cashFlowBeforeJctSettlementJpy) : "—"} c={a.certainty.profit} />
          <Row label="手残り（消費税精算後）" value={v ? formatJpy(v.cashAfterJctSettlementJpy) : "—"} c={a.certainty.jctSettlement} sub={v ? `消費税 納付(+)/還付(-) ${formatJpy(v.jctSettlementJpy)}・区分 ${TAX_LABEL[a.businessTaxStatus]}` : undefined} />
          <Row label="投資に対する利益率(ROI) / 利益率" value={v ? <>{formatPct(v.roi ? D(v.roi) : null)} / {formatPct(v.marginRate ? D(v.marginRate) : null)}</> : "—"} c={a.certainty.profit} />
          <Row
            label="赤字リスク"
            value={a.lossRisk.soldCount ? `${a.lossRisk.belowBreakEven}/${a.lossRisk.soldCount}件` : "判定不可"}
            c={a.lossRisk.soldCount ? "ESTIMATED" : "UNVERIFIED"}
            sub={<>損益分岐 {formatJpy(a.breakEvenSaleJpy)}。過去成約のうち分岐未満の件数{a.lossRisk.negativeScenarios.length ? `・赤字シナリオ: ${a.lossRisk.negativeScenarios.map(scLabel).join("/")}` : ""}</>}
          />
        </div>
      </details>

      <details className="mt-2">
        <summary className="cursor-pointer text-sm text-silver">出典URLと確認日</summary>
        <ul className="mt-2 space-y-1.5 text-xs">
          {a.sources.map((s, i) => (
            <li key={i} className="flex items-start justify-between gap-2">
              <span className="min-w-0">{s.label}<span className="block text-[10px] text-mute">{s.date ?? "日付なし"}</span></span>
              <span className="flex shrink-0 items-center gap-1"><ExtLink href={s.url} /><Cert c={s.certainty} /></span>
            </li>
          ))}
        </ul>
        {a.duty.notes.length > 0 && <ul className="mt-2 space-y-0.5 text-[11px] text-mute">{a.duty.notes.map((n) => <li key={n}>・{n}</li>)}</ul>}
      </details>

      <Link href={profitUrl(a.req)} className="btn mt-3 w-full">条件を変えて詳しく計算</Link>
    </section>
  );
}
