import { allLatestFx, counts, currentFeeRules, currentTaxAssumptions, getBusinessTaxStatus, getDecisionSettings, getExpenseProfile } from "@/lib/data";
import { ExtLink, PageTitle, Rel, Section } from "@/components/ui";
import { addFeeRule, addFxRate, addTaxAssumption, saveDecisionSettings, saveExpenseProfile } from "../actions";
import { identifyConfigured } from "@/lib/identify/identify";

function F({ label, name, def, hint, type = "text" }: { label: string; name: string; def: string | number; hint?: string; type?: string }) {
  return (
    <label className="block text-xs text-mute">
      {label}
      <input name={name} type={type} defaultValue={def} inputMode={type === "text" ? "decimal" : undefined} className="field mt-1" />
      {hint && <span className="mt-0.5 block text-[10px]">{hint}</span>}
    </label>
  );
}

export default async function Settings() {
  const [d, bts, exp, taxes, fees, fx, c] = await Promise.all([getDecisionSettings(), getBusinessTaxStatus(), getExpenseProfile(), currentTaxAssumptions(), currentFeeRules(), allLatestFx(), counts()]);
  const e = exp.data;
  // Opus 5.5 標準料金（$4/$20 per MTok, 2026-11 時点の公表値）による概算
  const usd = (c.in_tokens_30d * 4 + c.out_tokens_30d * 20) / 1_000_000;
  return (
    <main>
      <PageTitle label="Settings" title="設定" sub="変更は履歴として追加され、過去の値は上書きされません（判定基準を除く）" />

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
          <label className="block text-xs text-mute">消費税の課税事業者区分
            <select name="businessTaxStatus" defaultValue={bts} className="field mt-1">
              <option value="UNKNOWN">未設定（両方計算し低い方）</option><option value="TAXABLE">課税事業者</option><option value="EXEMPT">免税事業者</option>
            </select>
            <span className="mt-0.5 block text-[10px]">インボイス登録・簡易課税等は税理士に確認</span>
          </label>
          <button className="btn-primary col-span-2">判定基準を保存</button>
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
          <button className="btn-primary col-span-2">経費プロファイルを保存</button>
        </form>
      </Section>

      <Section title="税の前提（関税率など）">
        <div className="card overflow-x-auto p-3">
          <table className="data"><thead><tr><th>項目</th><th>値</th><th>状態</th><th>根拠</th></tr></thead>
            <tbody>{taxes.map((t) => <tr key={t.id}><td className="text-xs">{t.key}<span className="block text-[10px] text-mute">{t.notes}</span></td><td className="tnum">{t.value ?? "—"}</td><td><Rel v={t.status} /></td><td className="text-xs"><ExtLink href={t.evidence_url} /></td></tr>)}</tbody>
          </table>
        </div>
        <form action={addTaxAssumption} className="card mt-2 grid grid-cols-2 gap-2">
          <label className="col-span-2 block text-xs text-mute">項目
            <select name="key" className="field mt-1">{taxes.map((t) => <option key={t.key}>{t.key}</option>)}</select>
          </label>
          <F label="値（率は 0.052 形式）" name="value" def="" />
          <label className="block text-xs text-mute">状態<select name="status" className="field mt-1"><option value="USER_CONFIRMED">本人確認済</option><option value="VERIFIED">一次資料で確認済</option><option value="UNVERIFIED">未確認</option></select></label>
          <label className="col-span-2 block text-xs text-mute">根拠URL（確認済みには必須）<input name="evidenceUrl" type="url" className="field mt-1" /></label>
          <label className="col-span-2 block text-xs text-mute">メモ<input name="notes" className="field mt-1" /></label>
          <button className="btn col-span-2">新しい版として追加</button>
        </form>
      </Section>

      <Section title="販売先手数料（バージョン管理）">
        <div className="card overflow-x-auto p-3">
          <table className="data"><thead><tr><th>販売先</th><th>率</th><th>固定</th><th>版</th><th>状態</th></tr></thead>
            <tbody>{fees.map((f) => <tr key={f.id}><td>{f.platform}<span className="block text-[10px] text-mute">{f.notes}</span></td><td className="tnum">{f.fee_rate ?? "未確認"}</td><td className="tnum">{f.fixed_fee_jpy}</td><td>v{f.version}</td><td><Rel v={f.status} /></td></tr>)}</tbody>
          </table>
        </div>
        <form action={addFeeRule} className="card mt-2 grid grid-cols-2 gap-2">
          <F label="販売先（例 SNKRDUNK）" name="platform" def="SNKRDUNK" />
          <F label="手数料率（0.1 = 10%）" name="feeRate" def="" />
          <F label="固定手数料（円）" name="fixedFeeJpy" def="0" />
          <F label="適用開始日" name="effectiveFrom" def="" type="date" />
          <label className="block text-xs text-mute">状態<select name="status" className="field mt-1"><option value="USER_CONFIRMED">本人確認済</option><option value="VERIFIED">一次資料で確認済</option><option value="UNVERIFIED">未確認</option></select></label>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="feeIncludesJct" defaultChecked />手数料は消費税込み</label>
          <label className="col-span-2 block text-xs text-mute">根拠URL<input name="evidenceUrl" type="url" className="field mt-1" /></label>
          <button className="btn col-span-2">新しい版として追加</button>
        </form>
      </Section>

      <Section title="為替レート（円/1通貨）">
        <div className="card p-3 text-sm">
          {fx.length === 0 ? <p className="text-mute">未登録</p> : fx.map((r) => <p key={r.currency} className="tnum">{r.currency} {r.jpy_per_unit} <span className="text-xs text-mute">{new Date(r.as_of).toLocaleString("ja-JP")} · {r.source}</span></p>)}
          <p className="mt-1 text-[10px] text-mute">自動取得は未実装（為替APIの利用規約・費用承認後に追加予定）。カード会社の換算レートを推奨。</p>
        </div>
        <form action={addFxRate} className="card mt-2 grid grid-cols-2 gap-2">
          <F label="通貨（USD等）" name="currency" def="USD" />
          <F label="1通貨あたり円" name="rate" def="" />
          <F label="基準日時" name="asOf" def="" type="datetime-local" />
          <F label="取得元" name="source" def="" />
          <button className="btn col-span-2">為替を追加</button>
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
