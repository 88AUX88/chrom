import Link from "next/link";
import { notFound } from "next/navigation";
import { buybackFor, currentFeeRules, getDecisionSettings, getProduct, latestPlan, marketObservationsFor, retailPricesFor } from "@/lib/data";
import { summaryFor } from "@/lib/summary";
import { defaultHsForMaterial } from "@/lib/profit/duty";
import { ProfitSummary } from "@/components/profit-summary";
import { PlanForm } from "./plan-form";
import { RetractForm } from "@/components/retract-form";
import { SubmitButton } from "@/components/submit-button";
import { summarizeMarket, isStale, type ConditionGroup } from "@/lib/market/stats";
import { formatJpy, formatMoney } from "@/lib/money";
import { CATEGORY_LABEL, MATERIAL_LABEL, variantLabel } from "@/lib/settings-defaults";
import { Empty, ErrorBanner, ExtLink, PageTitle, Rel, Section, Warn } from "@/components/ui";
import { confirmVariant } from "../../actions";
import { PhotoUpload } from "./photo-upload";

const KIND_LABEL: Record<string, string> = { ASK: "出品", VERIFIED_SOLD: "成約(確認)", REPORTED_SOLD: "成約(報告)", ESTIMATE: "推定" };
const PRICE_KIND: Record<string, string> = { OFFICIAL: "公式", RECEIPT: "レシート", BUYER_REPORT: "購入者報告", ESTIMATE: "推定", UNKNOWN: "不明" };

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ variant?: string; scan?: string; cond?: string; saved?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const data = await getProduct(id);
  if (!data) notFound();
  const { product: p, variants, images, aliases } = data;
  const selected = variants.find((v) => v.id === sp.variant) ?? null;
  const today = new Date().toISOString().slice(0, 10);
  const settings = await getDecisionSettings();
  const cond = (sp.cond as ConditionGroup) || "NEW_UNUSED";

  const [retail, obsAll, buyback] = selected
    ? await Promise.all([retailPricesFor(selected.id), marketObservationsFor(p.id), buybackFor(selected.id)])
    : [[], [], []];
  // 日本国内の二次流通（海外は世界相場画面）
  const obs = obsAll.filter((o) => o.country === "JP");
  const back = `/products/${p.id}`;
  const m30 = selected ? summarizeMarket(obs, selected.id, cond, 30, today) : null;
  const m90 = selected ? summarizeMarket(obs, selected.id, cond, 90, today) : null;
  const sameVariantObs = selected ? obs.filter((o) => o.variantId === selected.id) : [];
  const [summary, plan, fees] = selected ? await Promise.all([summaryFor(selected.id, cond), latestPlan(selected.id), currentFeeRules()]) : [null, null, []];
  const opts = p.variantOptions;

  return (
    <main>
      <PageTitle label={`Product · ${CATEGORY_LABEL[p.category]}`} title={p.nameEn} sub={<span className="flex flex-wrap items-center gap-2"><span className="text-silver">{p.nameJaReading}</span><Rel v={p.catalogStatus} /><Link href={`/products/${p.id}/edit`} className="text-xs underline">編集</Link></span>} />
      <ErrorBanner err={sp.err} />
      {sp.saved && <p className="mb-2 rounded-lg border border-buy/40 bg-buy/10 px-3 py-2 text-sm text-buy">保存しました（変更履歴に記録）</p>}

      <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4">
        {images.filter((i) => i.dataUrl).map((i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i.id} src={i.dataUrl!} alt={i.caption ?? p.nameEn} className="h-64 w-64 shrink-0 snap-center rounded-xl border border-line object-cover" />
        ))}
        {images.filter((i) => i.dataUrl).length === 0 && <div className="flex h-11 w-full items-center justify-center rounded-lg border border-dashed border-line text-xs text-mute">参照画像未登録（自分で撮影した画像のみ・下部から登録）</div>}
      </div>

      {selected && summary && (
        <div id="summary">
          <p className="mt-4 text-sm text-silver">確定した仕様: {variantLabel(selected)}</p>
          <ProfitSummary a={summary.a} priceOrigin={summary.priceOrigin} />
        </div>
      )}

      {p.catalogStatus === "UNVERIFIED" && <div className="mt-3"><Warn>この商品の名称・仕様は未検証です。公式情報・実物で確認してください。</Warn></div>}
      <div className="card mt-3 space-y-1 text-sm">
        <p><span className="text-mute">特徴: </span>{p.distinguishingFeatures ?? "—"}</p>
        <p><span className="text-mute">商品ID: </span>{p.id}<span className="text-mute"> ／ 公式型番: </span>{p.officialModelNumber ?? "未確認（架空の型番は作成しません）"}</p>
        <p><span className="text-mute">出典: </span><ExtLink href={p.sourceUrl} /><span className="text-mute"> ／ 確認日: </span>{p.verifiedAt ?? "未確認"}<span className="text-mute"> ／ 更新: </span>{new Date(p.updatedAt).toISOString().slice(0, 10)}</p>
        {aliases.length > 0 && <p><span className="text-mute">別名: </span>{aliases.map((a) => a.alias).join("、")}</p>}
        {p.confusableWith.length > 0 && (
          <p><span className="text-pass">誤認注意: </span>{p.confusableWith.map((c) => <Link key={c} href={`/products/${c}`} className="mr-2 underline">{c}</Link>)}</p>
        )}
      </div>

      <Section title="仕様を確定（人間が選択）">
        <form action={confirmVariant} className="card space-y-3">
          <input type="hidden" name="productId" value={p.id} />
          {sp.scan && <input type="hidden" name="scanId" value={sp.scan} />}
          <fieldset>
            <legend className="mb-1 text-sm text-mute">素材（刻印・重さで確認）</legend>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              {opts.materials.map((mt, i) => (
                <label key={mt} className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-3"><input type="radio" name="material" value={mt} defaultChecked={selected ? selected.material === mt : i === 0} required />{MATERIAL_LABEL[mt]}</label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-sm text-mute">石</legend>
            <div className="grid grid-cols-2 gap-1.5">
              {opts.stones.map((st) => (
                <label key={String(st)} className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-3"><input type="radio" name="stones" value={String(st)} defaultChecked={selected ? selected.hasStones === st : !st} />{st ? "石付き" : "石なし"}</label>
              ))}
            </div>
            {opts.stones.includes(true) && <input name="stoneType" placeholder="石の種類（例: diamond）※石付きの場合" className="field mt-1.5" />}
          </fieldset>
          {opts.sizes.length > 0 && (
            <label className="block">
              <span className="mb-1 block text-sm text-mute">サイズ / 長さ（違うサイズの相場は混ぜません）</span>
              <select name="size" className="field" defaultValue={selected?.sizeLabel ?? ""} required>
                <option value="" disabled>選択してください</option>
                {opts.sizes.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}
          <SubmitButton>この仕様で確定</SubmitButton>
          <p className="text-xs text-mute">選択肢は入力補助であり、各仕様の実在を保証しません。</p>
        </form>
      </Section>

      {selected && m30 && m90 && (
        <>
          <div className="mt-6 rounded-xl border border-silver/40 p-4">
            <p className="h-label">確定した仕様</p>
            <p className="mt-1">{variantLabel(selected)}</p>
            <p className="mt-1 text-xs text-mute">重量: {selected.weightG ? `${selected.weightG}g` : "未計測（根拠のある値のみ表示）"}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link href={`/profit?variant=${encodeURIComponent(selected.id)}&cond=${cond}`} className="btn-primary">利益計算・判定</Link>
              <Link href={`/compare?variant=${encodeURIComponent(selected.id)}`} className="btn">国・販売先比較</Link>
              <Link href={`/market?variant=${encodeURIComponent(selected.id)}`} className="btn col-span-2">世界相場・流動性</Link>
            </div>
          </div>

          <Section title="買付条件（購入国・原産国・HSコード・価格・売却予定）">
            <PlanForm
              productId={p.id}
              variantId={selected.id}
              material={selected.material}
              defaultHs={defaultHsForMaterial(selected.material)}
              plan={plan ? { ...plan, localPrice: plan.localPrice === null ? null : String(plan.localPrice), localTaxRate: String(plan.localTaxRate), plannedSalePriceJpy: plan.plannedSalePriceJpy === null ? null : String(plan.plannedSalePriceJpy) } : null}
              platforms={fees.map((f) => f.platform)}
            />
          </Section>

          <Section title="PRICE｜各国の正規価格（出典付き）">
            {retail.length === 0 ? <Empty>この仕様の海外価格データがありません。<Link href="/import" className="underline">取込</Link></Empty> : (
              <div className="card overflow-x-auto p-3">
                <table className="data">
                  <thead><tr><th>国</th><th>価格</th><th>区分</th><th>確認日</th><th>出典</th></tr></thead>
                  <tbody>
                    {retail.map((r) => (
                      <tr key={r.id}>
                        <td>{r.country}{r.city ? `/${r.city}` : ""}<span className="block text-xs text-mute">{r.store}</span></td>
                        <td className="tnum">{formatMoney(r.amount, r.currency)}<span className="block text-xs text-mute">{r.taxInclusion === "INCLUDED" ? "税込" : r.taxInclusion === "EXCLUDED" ? "税別" : "税区分不明"}</span></td>
                        <td>{PRICE_KIND[r.priceKind]} <Rel v={r.reliability} /></td>
                        <td className="tnum">{r.observedAt}{isStale(r.observedAt, settings.retailMaxAgeDays, today) && <span className="block"><Rel v="STALE" /></span>}</td>
                        <td><ExtLink href={r.url} />{r.videoTimestamp && <span className="block text-xs text-mute">@{r.videoTimestamp}</span>}<RetractForm entity="retail_prices" id={r.id} back={back} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-mute">過去の購入報告は現在の定価ではありません。中古店・BUYMA価格は正規価格に含めません。</p>
              </div>
            )}
          </Section>

          <Section title="MARKET｜日本の二次流通" right={
            <div className="flex gap-1 text-xs">
              {(["NEW_UNUSED", "USED", "ANY"] as const).map((g) => <Link key={g} href={`?variant=${encodeURIComponent(selected.id)}&cond=${g}`} className={`rounded border px-2 py-1 ${cond === g ? "border-silver text-white" : "border-line text-mute"}`}>{g === "NEW_UNUSED" ? "新品/未使用" : g === "USED" ? "中古" : "全状態"}</Link>)}
            </div>
          }>
            <div className="grid grid-cols-2 gap-2">
              {[m30, m90].map((m) => (
                <div key={m.windowDays} className="card">
                  <p className="h-label">成約 {m.windowDays}日</p>
                  <p className="tnum mt-1 text-xl font-light">{m.hasAnyData ? `${m.sold.count}件` : "不明"}</p>
                  {!m.hasAnyData && <p className="text-[10px] text-hold">データ未取得（成約0件とは異なります）</p>}
                  <p className="tnum text-sm">中央値 {formatJpy(m.sold.median)}</p>
                  <p className="tnum text-xs text-mute">範囲 {formatJpy(m.sold.min)}〜{formatJpy(m.sold.max)}</p>
                  {m.sold.cv ? <p className="tnum text-xs text-mute">ばらつき(CV) {(Number(m.sold.cv) * 100).toFixed(1)}%</p> : m.sold.count > 0 && <p className="text-xs text-hold">件数不足のため分布は算出しません</p>}
                  <p className="tnum mt-2 text-xs text-mute">出品(参考) {m.ask.count}件 {m.ask.min ? `最安 ${formatJpy(m.ask.min)}` : ""}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-mute">売却率: {m90.sellThroughNote}。別仕様のデータ {m90.excludedOtherSpec}件は除外。</p>

            {sameVariantObs.length === 0 ? <div className="mt-2"><Empty>この仕様の市場データがありません。</Empty></div> : (
              <div className="card mt-2 overflow-x-auto p-3">
                <table className="data">
                  <thead><tr><th>区分</th><th>価格</th><th>状態</th><th>日付</th><th>出典</th></tr></thead>
                  <tbody>
                    {sameVariantObs.slice(0, 50).map((o) => (
                      <tr key={o.id}>
                        <td className={o.kind === "ASK" ? "text-mute" : ""}>{KIND_LABEL[o.kind]}<span className="block text-xs text-mute">{o.platform}</span></td>
                        <td className="tnum">{formatJpy(o.priceJpy)}</td>
                        <td className="text-xs">{o.condition}</td>
                        <td className="tnum text-xs">{o.soldAt ? `成約 ${o.soldAt}` : `観測 ${o.observedAt}`}{isStale(o.observedAt, settings.marketMaxAgeDays, today) && <span className="block"><Rel v="STALE" /></span>}</td>
                        <td><ExtLink href={o.evidenceUrl ?? null} /> <Rel v={o.reliability} /><RetractForm entity="market_observations" id={o.id} back={back} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="買取査定（即時売却ルート）">
            {buyback.length === 0 ? <Empty>買取査定データなし</Empty> : (
              <ul className="card divide-y divide-line p-0 text-sm">
                {buyback.map((b) => <li key={b.id} className="flex justify-between px-4 py-2"><span>{b.shop}<span className="block text-xs text-mute">{b.quoteKind === "INDIVIDUAL_APPRAISAL" ? "個別査定" : "買取価格表"} · {b.quotedAt} / {b.condition}</span></span><span className="tnum text-right">{formatJpy(b.priceJpy)} <ExtLink href={b.url}>出典</ExtLink><RetractForm entity="buyback_quotes" id={b.id} back={back} /></span></li>)}
              </ul>
            )}
          </Section>
        </>
      )}

      <Section title="参照画像を登録">
        <div className="card"><PhotoUpload productId={p.id} /></div>
      </Section>
    </main>
  );
}
