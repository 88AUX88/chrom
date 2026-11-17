import { savePlan } from "../../actions";
import { MATERIAL_LABEL } from "@/lib/settings-defaults";
import { SubmitButton } from "@/components/submit-button";

type Plan = {
  purchaseCountry: string; currency: string; localPrice: string | null; priceSource: string; priceObservedAt: string | null; priceEvidenceUrl: string | null;
  priceIncludesLocalTax: boolean; localTaxRate: string; hsCode: string | null; hsCertainty: string; hsEvidenceUrl: string | null; originCountry: string | null;
  originCertainty: string; originEvidence: string | null; originProof: boolean; plannedSalePriceJpy: string | null; platform: string;
} | null;

const CERT_OPTS = [["UNVERIFIED", "未確認"], ["ESTIMATED", "推定"], ["CONFIRMED", "確定（根拠あり）"]] as const;

export function PlanForm({ productId, variantId, material, defaultHs, plan, platforms }: { productId: string; variantId: string; material: string; defaultHs: string | null; plan: Plan; platforms: string[] }) {
  const p = plan;
  const L = "block text-xs text-mute";
  return (
    <form action={savePlan} className="card grid grid-cols-2 gap-2" data-testid="plan-form">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="variantId" value={variantId} />
      <p className="col-span-2 text-xs text-mute">素材: {MATERIAL_LABEL[material]}（仕様で確定済み）。保存すると新しい版として記録されます。</p>
      <label className={L}>購入国<input name="purchaseCountry" required defaultValue={p?.purchaseCountry ?? "US"} maxLength={2} pattern="[A-Za-z]{2}" title="ISO 2文字（例 US）" className="field mt-1 uppercase" /></label>
      <label className={L}>通貨<input name="currency" required defaultValue={p?.currency ?? "USD"} maxLength={3} pattern="[A-Za-z]{3}" title="ISO 3文字（例 USD）" className="field mt-1 uppercase" /></label>
      <label className={L}>現地価格<input name="localPrice" inputMode="decimal" pattern="\d+(\.\d+)?" title="半角数字（小数可）" defaultValue={p?.localPrice ?? ""} className="field mt-1" /></label>
      <label className={L}>現地税率<input name="localTaxRate" inputMode="decimal" pattern="\d+(\.\d+)?" title="半角数字（小数可）" defaultValue={p?.localTaxRate ?? "0"} className="field mt-1" /></label>
      <label className={L}>価格の根拠
        <select name="priceSource" defaultValue={p?.priceSource ?? "OFFICIAL"} className="field mt-1">
          <option value="STORE_OBSERVED">店頭で確認</option><option value="OFFICIAL">公式</option><option value="RECEIPT">レシート</option>
          <option value="BUYER_REPORT">購入者報告</option><option value="ESTIMATE">推定</option><option value="UNKNOWN">不明</option>
        </select>
      </label>
      <label className={L}>価格確認日<input type="date" name="priceObservedAt" defaultValue={p?.priceObservedAt ?? ""} className="field mt-1" /></label>
      <label className={`${L} col-span-2`}>価格の出典URL<input name="priceEvidenceUrl" type="url" defaultValue={p?.priceEvidenceUrl ?? ""} className="field mt-1" /></label>
      <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="priceIncludesLocalTax" defaultChecked={p?.priceIncludesLocalTax} />表示価格は現地税込み</label>

      <p className="col-span-2 mt-2 h-label">原産国（購入国とは別）</p>
      <label className={L}>原産国<input name="originCountry" defaultValue={p?.originCountry ?? ""} maxLength={2} pattern="[A-Za-z]{2}" title="ISO 2文字（例 US）" placeholder="例 US" className="field mt-1 uppercase" /></label>
      <label className={L}>確度<select name="originCertainty" defaultValue={p?.originCertainty ?? "UNVERIFIED"} className="field mt-1">{CERT_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className={`${L} col-span-2`}>原産国の根拠（刻印・タグ・インボイス等。「確定」には必須）<input name="originEvidence" defaultValue={p?.originEvidence ?? ""} className="field mt-1" /></label>
      <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="originProof" defaultChecked={p?.originProof} />原産品申告等で原産性を証明できる（協定税率の適用条件）</label>

      <p className="col-span-2 mt-2 h-label">HSコード</p>
      <label className={L}>HSコード<input name="hsCode" defaultValue={p?.hsCode ?? defaultHs ?? ""} placeholder="7113.11" pattern="\d{4}\.\d{2}(\.\d{2,4})?" title="例 7113.11" className="field mt-1" /></label>
      <label className={L}>確度<select name="hsCertainty" defaultValue={p?.hsCode ? p.hsCertainty : "ESTIMATED"} className="field mt-1">{CERT_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className={`${L} col-span-2`}>HSコードの根拠URL（「確定」には必須）<input name="hsEvidenceUrl" type="url" defaultValue={p?.hsEvidenceUrl ?? ""} className="field mt-1" /></label>

      <p className="col-span-2 mt-2 h-label">日本での売却</p>
      <label className={L}>販売先<select name="platform" defaultValue={p?.platform ?? "SNKRDUNK"} className="field mt-1">{platforms.map((x) => <option key={x}>{x}</option>)}</select></label>
      <label className={L}>売却予定価格（円・仮定）<input name="plannedSalePriceJpy" inputMode="numeric" pattern="\d+(\.\d+)?" title="半角数字（小数可）" defaultValue={p?.plannedSalePriceJpy ?? ""} className="field mt-1" /></label>
      <p className="col-span-2 text-[10px] text-mute">売却予定価格は成約データがないときの仮定としてのみ使い、BUY 判定の根拠にはしません。</p>
      <div className="col-span-2"><SubmitButton>買付条件を保存</SubmitButton></div>
    </form>
  );
}
