"use client";
import { useState } from "react";
import { uploadReferencePhoto } from "../../actions";
import { resizeToDataUrl } from "../../scan/scanner";

export function PhotoUpload({ productId }: { productId: string }) {
  const [dataUrl, setDataUrl] = useState("");
  return (
    <form action={uploadReferencePhoto} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="dataUrl" value={dataUrl} />
      <input type="file" accept="image/*" className="field" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setDataUrl(await resizeToDataUrl(f, 800, 0.8)); }} />
      <input name="caption" placeholder="メモ（例: 刻印面、素材確認済み）" className="field" />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="own" value="yes" required /> 自分で撮影した画像です（権利不明な画像は登録しない）</label>
      <button className="btn" disabled={!dataUrl}>参照画像を登録</button>
    </form>
  );
}
