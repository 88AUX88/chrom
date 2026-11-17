"use client";
import Link from "next/link";
import { useRef, useState } from "react";

interface Candidate {
  product_id: string;
  nameEn: string;
  nameJaReading: string;
  reason: string;
  confidence: "high" | "medium" | "low";
  catalogStatus: string;
  confusableWith: string[];
}
interface Resp {
  scanId?: number;
  candidates?: Candidate[];
  observed?: { color_tone: string; stones_visible: string; engravings_seen: string; photo_quality_issues: string };
  possiblyNotInCatalog?: boolean;
  elapsedMs?: number;
  error?: string;
}

/** 端末側で長辺 1024px の JPEG に縮小（通信量・API費用・待ち時間を削減） */
export async function resizeToDataUrl(file: File, maxSide = 1024, quality = 0.85): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

const CONF = { high: "高", medium: "中", low: "低" } as const;
const TONE: Record<string, string> = { silver_or_white_metal: "白系（シルバー or ホワイトゴールド：写真では判別不可）", yellow_gold: "黄色系（イエローゴールドの可能性）", unclear: "不明" };
const STONES: Record<string, string> = { yes: "石が見える", no: "石は見えない", unclear: "不明" };

export function Scanner({ apiReady }: { apiReady: boolean }) {
  const cam = useRef<HTMLInputElement>(null);
  const album = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Resp | null>(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setRes(null);
    const dataUrl = await resizeToDataUrl(f);
    setPreview(dataUrl);
    if (!apiReady) return;
    setBusy(true);
    try {
      const r = await fetch("/api/identify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image: dataUrl }) });
      setRes(await r.json().catch(() => ({ error: "応答を読めませんでした" })));
    } catch {
      setRes({ error: "通信できませんでした。電波状況を確認し、手動検索をご利用ください。" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => cam.current?.click()} className="btn-primary h-24 flex-col text-base">📷 撮影</button>
        <button onClick={() => album.current?.click()} className="btn h-24 flex-col text-base">🖼 アルバム</button>
      </div>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0])} data-testid="camera-input" />
      <input ref={album} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} data-testid="album-input" />

      {!apiReady && <p className="mt-3 rounded-lg border border-hold/40 bg-hold/10 px-3 py-2 text-sm text-hold">画像認識APIが未設定のため、写真は表示のみです。下の手動検索で商品を選んでください。</p>}

      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="撮影した商品" className="mt-4 max-h-80 w-full rounded-xl border border-line object-contain" />
      )}
      {busy && <p className="mt-4 animate-pulse text-center text-sm text-mute">識別中…（通常数秒〜十数秒。通信状況で変わります）</p>}
      {res?.error && <p className="mt-4 rounded-lg border border-pass/40 bg-pass/10 px-3 py-2 text-sm text-pass">{res.error}</p>}

      {res?.candidates && (
        <section className="mt-5">
          <h2 className="h-label mb-2">候補（最大3件）— 必ずご自身で確定してください</h2>
          {res.candidates.length === 0 && <p className="text-sm text-mute">カタログ内に該当候補がありません。手動検索、またはカタログへの追加を検討してください。</p>}
          <ol className="space-y-2">
            {res.candidates.map((c, i) => (
              <li key={c.product_id}>
                <Link href={`/products/${c.product_id}?scan=${res.scanId}`} className="card block active:opacity-70">
                  <div className="flex items-baseline justify-between">
                    <span className="text-lg">{i + 1}. {c.nameEn}</span>
                    <span className="text-xs text-mute">AI自己申告: {CONF[c.confidence]}</span>
                  </div>
                  <p className="text-sm text-silver">{c.nameJaReading}</p>
                  <p className="mt-1 text-sm text-mute">{c.reason}</p>
                  {c.catalogStatus === "UNVERIFIED" && <p className="mt-1 text-xs text-pass">カタログ未検証の商品です</p>}
                </Link>
              </li>
            ))}
          </ol>
          {res.observed && (
            <div className="card mt-3 text-sm">
              <p className="h-label mb-1">写真から読み取れたこと（仕様は確定しません）</p>
              <p>色調: {TONE[res.observed.color_tone]}</p>
              <p>石: {STONES[res.observed.stones_visible]}</p>
              <p>刻印: {res.observed.engravings_seen || "読めず"}</p>
              {res.observed.photo_quality_issues && <p className="text-hold">写真の問題: {res.observed.photo_quality_issues}</p>}
            </div>
          )}
          <p className="mt-2 text-xs text-mute">AIの「自信度」は校正された確率ではありません。写真だけで真贋は判定しません。{res.elapsedMs ? ` 所要 ${(res.elapsedMs / 1000).toFixed(1)}秒` : ""}</p>
        </section>
      )}
    </div>
  );
}
