"use client";
import { useActionState } from "react";
import Link from "next/link";
import { MATERIAL_LABEL, CATEGORY_LABEL } from "@/lib/settings-defaults";

type State = { error?: string; duplicates?: string[]; values?: Record<string, string[]>; n?: number };
type Action = (s: State, f: FormData) => Promise<State>;

export interface ProductFormValues {
  id: string; category: string; catalogStatus: string; nameEn: string; nameJaReading: string; officialModelNumber: string | null;
  features: string | null; notes: string | null; sourceUrl: string | null; verifiedAt: string | null; materials: string[]; sizes: string[];
  stones: boolean[]; aliases: string[]; confusableWith: string[];
}

export function ProductForm({ action, mode, v: initial, categories, materials }: { action: Action; mode: "create" | "edit"; v?: ProductFormValues; categories: readonly string[]; materials: readonly string[] }) {
  let v = initial;
  const [state, formAction, pending] = useActionState<State, FormData>(action, {});
  const L = "block text-xs text-mute";
  // エラー時は送信した値で再表示（入力を失わない）
  const sv = state.values;
  const one = (k: string, fallback: string | null | undefined) => (sv ? sv[k]?.[0] ?? "" : fallback ?? "");
  if (sv) {
    v = {
      id: one("id", v?.id), category: one("category", v?.category), catalogStatus: one("catalogStatus", v?.catalogStatus), nameEn: one("nameEn", v?.nameEn),
      nameJaReading: one("nameJaReading", v?.nameJaReading), officialModelNumber: one("officialModelNumber", null), features: one("features", null), notes: one("notes", null),
      sourceUrl: one("sourceUrl", null), verifiedAt: one("verifiedAt", null), materials: sv.materials ?? [], sizes: one("sizes", "").split(",").map((x) => x.trim()).filter(Boolean),
      stones: (sv.stones ?? []).map((x) => x === "true"), aliases: one("aliases", "").split(",").map((x) => x.trim()).filter(Boolean),
      confusableWith: one("confusableWith", "").split(",").map((x) => x.trim()).filter(Boolean),
    };
  }
  return (
    <form key={state.n ?? 0} action={formAction} className="card grid grid-cols-2 gap-2" data-testid="product-form">
      {mode === "edit" ? <input type="hidden" name="id" value={v!.id} /> : (
        <label className={`${L} col-span-2`}>商品ID（内部ID・型番ではない）<input name="id" required defaultValue={sv?.id?.[0] ?? ""} placeholder="ch-cross-pendant-large" className="field mt-1" /></label>
      )}
      <label className={`${L} col-span-2`}>正式名称（英語）<input name="nameEn" required defaultValue={v?.nameEn} className="field mt-1" /></label>
      <label className={`${L} col-span-2`}>読み（カタカナ）<input name="nameJaReading" required defaultValue={v?.nameJaReading} className="field mt-1" /></label>
      <label className={L}>カテゴリー<select name="category" defaultValue={v?.category ?? "RING"} className="field mt-1">{categories.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c] ?? c}</option>)}</select></label>
      <label className={L}>確認状態<select name="catalogStatus" defaultValue={v?.catalogStatus ?? "UNVERIFIED"} className="field mt-1"><option value="UNVERIFIED">未検証</option><option value="REPORTED">報告あり</option><option value="VERIFIED">確認済（出典必須）</option></select></label>
      <label className={L}>公式型番（出典必須・不明なら空欄）<input name="officialModelNumber" defaultValue={v?.officialModelNumber ?? ""} className="field mt-1" /></label>
      <label className={L}>確認日<input type="date" name="verifiedAt" defaultValue={v?.verifiedAt ?? ""} className="field mt-1" /></label>
      <label className={`${L} col-span-2`}>出典URL（公式ページ等）<input type="url" name="sourceUrl" defaultValue={v?.sourceUrl ?? ""} className="field mt-1" /></label>
      <fieldset className="col-span-2">
        <legend className="text-xs text-mute">素材の選択肢</legend>
        <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-3">
          {materials.map((m) => <label key={m} className="flex min-h-10 items-center gap-2 rounded border border-line px-2 text-sm"><input type="checkbox" name="materials" value={m} defaultChecked={v ? v.materials.includes(m) : m === "SILVER_925"} />{MATERIAL_LABEL[m] ?? m}</label>)}
        </div>
      </fieldset>
      <label className={`${L} col-span-2`}>サイズ / 長さの選択肢（カンマ区切り。例 US 7, US 8 / 18inch, 20inch / S, M, L / W30, W32）<input name="sizes" defaultValue={v?.sizes.join(", ")} className="field mt-1" /></label>
      <fieldset className="col-span-2 flex gap-2">
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="stones" value="false" defaultChecked={v ? v.stones.includes(false) : true} />石なしあり</label>
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="stones" value="true" defaultChecked={v?.stones.includes(true)} />石付きあり</label>
      </fieldset>
      <label className={`${L} col-span-2`}>識別の特徴<textarea name="features" rows={2} defaultValue={v?.features ?? ""} className="field mt-1" /></label>
      <label className={`${L} col-span-2`}>別名（カンマ区切り）<input name="aliases" defaultValue={v?.aliases.join(", ")} className="field mt-1" /></label>
      <label className={`${L} col-span-2`}>誤認しやすい商品ID（カンマ区切り）<input name="confusableWith" defaultValue={v?.confusableWith.join(", ")} className="field mt-1" /></label>
      <label className={`${L} col-span-2`}>メモ<input name="notes" defaultValue={v?.notes ?? ""} className="field mt-1" /></label>
      {mode === "edit" && <label className={`${L} col-span-2`}>変更理由（履歴に残ります）<input name="reason" className="field mt-1" /></label>}
      {state.duplicates && state.error && (
        <div className="col-span-2 rounded-lg border border-hold/40 bg-hold/10 p-2 text-sm text-hold">
          重複の可能性: {state.duplicates.map((d) => <Link key={d} href={`/products/${d}`} className="mr-2 underline">{d}</Link>)}
          <label className="mt-1 flex items-center gap-2"><input type="checkbox" name="allowDuplicate" />別商品であることを確認した</label>
        </div>
      )}
      {state.error && <p className="col-span-2 text-sm text-pass" role="alert">{state.error}</p>}
      <button className="btn-primary col-span-2" disabled={pending}>{pending ? "保存中…" : mode === "create" ? "商品を追加" : "変更を保存"}</button>
    </form>
  );
}
