import { allLatestFx, counts, currentFeeRules, currentTaxAssumptions, getBusinessTaxStatus, getDecisionSettings, getExpenseProfile } from "@/lib/data";
import { ErrorBanner, ExtLink, PageTitle, Rel, Section } from "@/components/ui";
import { addFeeRule, addFxRate, addTaxAssumption, saveDecisionSettings, saveExpenseProfile } from "../actions";
import { identifyConfigured } from "@/lib/identify/identify";
import { SubmitButton } from "@/components/submit-button";

/** 税の前提の項目名（プログラム用の記号）を日本語の名前にする */
function taxLabel(key: string): string {
  const m = /^CUSTOMS_DUTY_RATE:([\d.]+)(?::EPA:([A-Z]{2}))?$/.exec(key);
  if (m) return m[2] ? `関税率・協定税率（HS ${m[1]}、原産国 ${m[2]}）` : `関税率（HS ${m[1]}）`;
  return (
    { JCT_NATIONAL_RATE: "消費税率（国の分）", JCT_LOCAL_RATIO: "地方消費税の割合", PERSONAL_USE_FACTOR: "個人使用の特例の係数（販売目的では使わない）", LOW_VALUE_EXEMPTION_JPY: "少額免税の上限（円）", DEEMED_PURCHASE_RATE: "簡易課税のみなし仕入率" } as Record<string, string>
  )[key] ?? key;
}

function F({ label, name, def, hint, type = "text", numeric = true }: { label: string; name: string; def: string | number; hint?: string; type?: string; numeric?: boolean }) {
  return (
    <label className="block text-xs text-mute">
      {label}
      <input name={name} type={type} defaultValue={def} inputMode={type === "text" && numeric ? "decimal" : undefined} pattern={type === "text" && numeric ? "\\d+(\\.\\d+)?" : undefined} title={numeric ? "半角数字（小数可）" : undefined} className="field mt-1" />
      {hint && <span className="mt-0.5 block text-[10px]">{hint}</span>}
    </label>
  );
}

export default async function Settings({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const [d, bts, exp, taxes, fees, fx, c] = await Promise.all([getDecisionSettings(), getBusinessTaxStatus(), getExpenseProfile(), currentTaxAssumptions(), currentFeeRules(), allLatestFx(), counts()]);
  const e = exp.data;
  // Opus 5.5 標準料金（$4/$20 per MTok, 2026-11 時点の公表値）による概算
  const usd = (c.in_tokens_30d * 4 + c.out_tokens_30d * 20) / 1_000_000;
  return (
    <main>
      <PageTitle label="設定" title="設定" sub="変更は履歴として追加され、過去の値は上書きされません（判定基準を除く）" />
      <ErrorBanner err={err} />

      <Section title="判定基準（BUY/HOLD/PASS）">
        <form action={saveDecisionSettings} className="card grid grid-cols-2 gap-2">
          <F label="保守シナリオ最低利益（円）" name="minProfitJpy" def={d.minProfitJpy} />
          <F label="保守シナリオ最低ROI" name="minRoi" def={d.minRoi} hint="0.1 = 10%" />
          <F label="必要な同一仕様の成約件数" name="minSoldCount" def={d.minSoldCount} />
          <F label="成約集計期間（日）" name="marketWindowDays" def={d.marketWindowDays} />
          <F label="海外価格の有効日数" name="retailMaxAgeDays" def={d.retailMaxAgeDays} />
          <F label="市場データの有効日数" name="marketMaxAgeDays" def={d.marketMaxAgeDays} />
          <F label="為替の有効時間" name="fxMaxAgeHours" def={d.fxMaxAgeHours} />
          <F label="保守シナリオの為替上振れ" name="fxBufferRate" def={d.fxBufferRate} hint="0.03 = 3%円安" />
          <F label="成約不足時の追加値引き" name="thinDataHaircut" def={d.thinDataHaircut} />
          <F label="買取査定の有効日数" name="buybackMaxAgeDays" def={d.buybackMaxAgeDays} />
          <label className="block text-xs text-mute">消費税の課税事業者区分
            <select name="businessTaxStatus" defaultValue={bts} className="field mt-1">
              <option value="UNKNOWN">未設定（原則課税・免税の低い方）</option><option value="TAXABLE">課税事業者（原則課税）</option><option value="SIMPLIFIED">課税事業者（簡易課税）</option><option value="EXEMPT">免税事業者</option>
            </select>
            <span className="mt-0.5 block text-[10px]">インボイス登録・簡易課税等は税理士に確認</span>
          </label>
          <div className="col-span-2"><SubmitButton>判定基準を保存</SubmitButton></div>
        </form>
      </Section>

      <Section title="経費プロファイル" right={e.confirmed ? <Rel v="USER_CONFIRMED" /> : <Rel v="UNVERIFIED" />}>
        <form action={saveExpenseProfile} className="card grid grid-cols-2 gap-2">
          <label className="col-span-2 block text-xs text-mute">輸入区分
            <select name="importMode" defaultValue={e.importMode} className="field mt-1"><option value="COMMERCIAL">商業輸入（販売目的）</option><option value="PERSONAL">個人使用（参考計算のみ・BUY不可）</option></select>
          </label>
          <F label="カード海外手数料率" name="cardFeeRate" def={e.cardFeeRate} hint="例 0.022" />
          <F label="現地税の還付見込割合" name="localTaxRefundRate" def={e.localTaxRefundRate} hint="不明なら 0" />
          <F label="国際送料（円）" name="intlShippingJpy" def={e.intlShippingJpy} hint="手荷物なら 0" />
          <F label="保険（円）" name="insuranceJpy" def={e.insuranceJpy} />
          <F label="通関手数料（円・税込）" name="customsBrokerFeeJpy" def={e.customsBrokerFeeJpy} />
          <F label="旅費配賦（1点あたり円）" name="travelAllocationJpy" def={e.travelAllocationJpy} />
          <F label="国内送料（円・税込）" name="domesticShippingJpy" def={e.domesticShippingJpy} />
          <F label="梱包費（円・税込）" name="packagingJpy" def={e.packagingJpy} />
          <F label="返品・値下げリスク率" name="riskReserveRate" def={e.riskReserveRate} hint="売却価格に対する率" />
          <F label="その他経費（円）" name="otherCostsJpy" def={e.otherCostsJpy} />
          <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="applyLowValueExemption" defaultChecked={e.applyLowValueExemption} />課税価格1万円以下の少額免税を適用</label>
          <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="confirmed" defaultChecked={e.confirmed} />上記の値を自分で確認した（未確認のままでは BUY を出しません）</label>
          <div className="col-span-2"><SubmitButton>経費プロファイルを保存</SubmitButton></div>
        </form>
      </Section>

      <Section title="税の前提（関税率など）">
        <div className="card overflow-x-auto p-3">
          <table className="data"><thead><tr><th>項目</th><th>値</th><th>状態</th><th>根拠</th></tr></thead>
            <tbody>{taxes.map((t) => <tr key={t.id}><td className="text-xs">{taxLabel(t.key)}<span className="block text-[10px] text-mute">{t.key} · {t.notes}</span></td><td className="tnum">{t.value ?? "—"}</td><td><Rel v={t.status} /></td><td className="text-xs"><ExtLink href={t.evidence_url} /></td></tr>)}</tbody>
          </table>
        </div>
        <form action={addTaxAssumption} className="card mt-2 grid grid-cols-2 gap-2">
          <label className="col-span-2 block text-xs text-mute">項目
            <input name="key" list="tax-keys" required placeholder="例 CUSTOMS_DUTY_RATE:7113.11" className="field mt-1" />
            <datalist id="tax-keys">{[...new Set([...taxes.map((t) => t.key), "DEEMED_PURCHASE_RATE", "CUSTOMS_DUTY_RATE:7113.11:EPA:US", "CUSTOMS_DUTY_RATE:7113.19:EPA:US", "CUSTOMS_DUTY_RATE:7113.11:EPA:EU", "CUSTOMS_DUTY_RATE:7113.11:EPA:GB"])].map((k) => <option key={k} value={k} />)}</datalist>
            <span className="mt-0.5 block text-[10px]">一般税率: CUSTOMS_DUTY_RATE:HS / 協定税率: CUSTOMS_DUTY_RATE:HS:EPA:原産国 / 簡易課税: DEEMED_PURCHASE_RATE</span>
          </label>
          <F label="値（率は 0.052 形式）" name="value" def="" />
          <label className="block text-xs text-mute">状態<select name="status" className="field mt-1"><option value="USER_CONFIRMED">本人確認済</option><option value="VERIFIED">一次資料で確認済</option><option value="UNVERIFIED">未確認</option></select></label>
          <label className="col-span-2 block text-xs text-mute">根拠URL（確認済みには必須）<input name="evidenceUrl" type="url" className="field mt-1" /></label>
          <label className="col-span-2 block text-xs text-mute">メモ<input name="notes" className="field mt-1" /></label>
          <div className="col-span-2"><SubmitButton className="btn w-full">新しい版として追加</SubmitButton></div>
        </form>
      </Section>

      <Section title="販売先手数料（バージョン管理）">
        <div className="card overflow-x-auto p-3">
          <table className="data"><thead><tr><th>販売先</th><th>率</th><th>固定</th><th>版</th><th>状態</th></tr></thead>
            <tbody>{fees.map((f) => <tr key={f.id}><td>{f.platform}<span className="block text-[10px] text-mute">{f.notes}</span></td><td className="tnum">{f.fee_rate ?? "未確認"}</td><td className="tnum">{f.fixed_fee_jpy}</td><td>v{f.version}</td><td><Rel v={f.status} /></td></tr>)}</tbody>
          </table>
        </div>
        <form action={addFeeRule} className="card mt-2 grid grid-cols-2 gap-2">
          <F label="販売先（例 SNKRDUNK）" name="platform" def="SNKRDUNK" numeric={false} />
          <F label="手数料率（0.1 = 10%）" name="feeRate" def="" />
          <F label="固定手数料（円）" name="fixedFeeJpy" def="0" />
          <F label="適用開始日" name="effectiveFrom" def="" type="date" />
          <label className="block text-xs text-mute">状態<select name="status" className="field mt-1"><option value="USER_CONFIRMED">本人確認済</option><option value="VERIFIED">一次資料で確認済</option><option value="UNVERIFIED">未確認</option></select></label>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="feeIncludesJct" defaultChecked />手数料は消費税込み</label>
          <label className="col-span-2 block text-xs text-mute">根拠URL<input name="evidenceUrl" type="url" className="field mt-1" /></label>
          <div className="col-span-2"><SubmitButton className="btn w-full">新しい版として追加</SubmitButton></div>
        </form>
      </Section>

      <Section title="為替レート（円/1通貨）">
        <div className="card p-3 text-sm">
          {fx.length === 0 ? <p className="text-mute">未登録</p> : fx.map((r) => <p key={r.currency} className="tnum">{r.currency} {r.jpy_per_unit} <span className="text-xs text-mute">{new Date(r.as_of).toLocaleString("ja-JP")} · {r.source}</span></p>)}
          <p className="mt-1 text-[10px] text-mute">自動取得は未実装（為替APIの利用規約・費用承認後に追加予定）。カード会社の換算レートを推奨。</p>
        </div>
        <form action={addFxRate} className="card mt-2 grid grid-cols-2 gap-2">
          <F label="通貨（USD等）" name="currency" def="USD" numeric={false} />
          <F label="1通貨あたり円" name="rate" def="" />
          <F label="基準日時" name="asOf" def="" type="datetime-local" />
          <F label="取得元" name="source" def="" numeric={false} />
          <div className="col-span-2"><SubmitButton className="btn w-full">為替を追加</SubmitButton></div>
        </form>
      </Section>

      <Section title="外部サービス費用">
        <div className="card space-y-1 text-sm">
          <p>画像認識API: {identifyConfigured() ? "設定済み" : <span className="text-hold">未設定（ANTHROPIC_API_KEY）</span>} · 上限 {process.env.IDENTIFY_DAILY_LIMIT ?? 100}回/日</p>
          <p className="tnum">直近30日: 入力 {c.in_tokens_30d.toLocaleString()} / 出力 {c.out_tokens_30d.toLocaleString()} トークン ≈ ${usd.toFixed(2)}（概算・キャッシュ割引未反映の上限側）</p>
          <p className="text-[10px] text-mute">正確な請求額は Anthropic Console で確認してください。Claude/Gemini の月額サブスクリプションとは別費用です。</p>
        </div>
      </Section>
    </main>
  );
}
