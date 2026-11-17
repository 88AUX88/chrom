import Link from "next/link";
import { allLatestFx, counts, currentFeeRules, currentTaxAssumptions, getExpenseProfile, getBusinessTaxStatus, recentScenarios } from "@/lib/data";
import { DecisionBadge, Section, Stat, Warn } from "@/components/ui";
import { identifyConfigured } from "@/lib/identify/identify";

export default async function Dashboard() {
  const [c, fx, fees, taxes, expense, bts, recent] = await Promise.all([counts(), allLatestFx(), currentFeeRules(), currentTaxAssumptions(), getExpenseProfile(), getBusinessTaxStatus(), recentScenarios(5)]);
  const issues: string[] = [];
  if (c.retail === 0) issues.push("海外正規価格のデータがありません（取込が必要）");
  if (c.sold === 0) issues.push("国内の成約データがありません（取込が必要）");
  if (fx.length === 0) issues.push("為替レートが未登録です");
  else if (fx.some((r) => Date.now() - new Date(r.as_of).getTime() > 48 * 3600000)) issues.push("48時間以上前の為替レートがあります");
  if (taxes.some((t) => t.key.startsWith("CUSTOMS_DUTY_RATE") && (t.status === "UNVERIFIED" || t.value === null))) issues.push("関税率が未確認です");
  if (fees.some((f) => f.platform !== "BUYBACK" && (f.status === "UNVERIFIED" || f.fee_rate === null))) issues.push("販売手数料率が未確認です");
  if (!expense.data.confirmed) issues.push("経費プロファイルが仮置きのままです");
  if (bts === "UNKNOWN") issues.push("消費税の課税事業者区分が未設定です");
  if (c.unverified_products > 0) issues.push(`未検証のカタログ商品 ${c.unverified_products} 件`);
  if (!identifyConfigured()) issues.push("画像認識APIが未設定です（手動検索は利用可能）");

  return (
    <main>
      <header className="mb-6">
        <p className="h-label">Luxury Market Intelligence</p>
        <h1 className="mt-1 text-xl font-extralight tracking-[0.15em]">CHROME HEARTS</h1>
      </header>

      <Link href="/scan" className="flex h-36 flex-col items-center justify-center rounded-2xl bg-white text-black active:opacity-80">
        <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden><path d="M3 8a2 2 0 012-2h2l2-2h6l2 2h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><circle cx="12" cy="13" r="4" /></svg>
        <span className="mt-2 text-lg font-semibold tracking-[0.3em]">SCAN</span>
        <span className="text-xs">撮影して商品を特定</span>
      </Link>

      <form action="/products" className="mt-3">
        <input name="q" placeholder="商品名・読みで検索（例: ペーパーチェーン）" className="field" />
      </form>

      {issues.length > 0 && (
        <Section title="判定前に必要な確認">
          <div className="space-y-2">{issues.map((i) => <Warn key={i}>{i}</Warn>)}</div>
          <div className="mt-2 flex gap-2"><Link className="btn" href="/settings">設定</Link><Link className="btn" href="/import">データ取込</Link></div>
        </Section>
      )}

      <Section title="データ状況">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="商品" value={c.products} sub={`仕様 ${c.variants}`} />
          <Stat label="海外価格" value={c.retail} sub="出典付き" />
          <Stat label="成約" value={c.sold} sub={`出品 ${c.ask}`} />
          <Stat label="買取査定" value={c.buyback} sub={`為替 ${fx.length}通貨`} />
        </div>
      </Section>

      <Section title="最近の判定" right={<Link href="/history" className="text-xs text-mute">すべて ›</Link>}>
        {recent.length === 0 ? <p className="text-sm text-mute">まだ判定はありません。</p> : (
          <ul className="card divide-y divide-line p-0">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>{r.productName}<span className="block text-xs text-mute">{new Date(r.createdAt).toLocaleString("ja-JP")}</span></span>
                <DecisionBadge d={r.decision} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}
