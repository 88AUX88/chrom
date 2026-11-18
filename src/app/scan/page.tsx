import { identifyConfigured } from "@/lib/identify/identify";
import { PageTitle } from "@/components/ui";
import { Scanner } from "./scanner";

export default function ScanPage() {
  return (
    <main>
      <PageTitle label="撮影" title="商品を撮影" sub="全体が写るよう、明るい場所で。刻印が見えると精度が上がります。" />
      <Scanner apiReady={identifyConfigured()} />
      <form action="/products" className="mt-6">
        <label className="h-label" htmlFor="q">手動検索</label>
        <input id="q" name="q" placeholder="商品名・読み（例: ベイビーファット）" className="field mt-1" />
      </form>
    </main>
  );
}
