import Link from "next/link";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { summaryFor } from "@/lib/summary";
import { analyzeLiquidity, LEVEL_LABEL } from "@/lib/market/liquidity";
import { buybackFor, getDecisionSettings, marketObservationsFor } from "@/lib/data";
import { D, formatJpy, formatMoney, formatPct } from "@/lib/money";
import { Cert, DecisionBadge, Empty, PageTitle } from "@/components/ui";

const ORDER = { BUY: 0, HOLD: 1, PASS: 2 } as const;

export default async function Candidates() {
  const db = await getDb();
  // 価格の根拠（買付計画 or 正規価格）がある仕様だけを候補にする
  const ids = (await db.execute<{ id: string; product_id: string; name_en: string }>(sql`
    select v.id, v.product_id, p.name_en from product_variants v join products p on p.id = v.product_id
    where exists (select 1 from variant_plans x where x.variant_id = v.id and x.local_price is not null)
       or exists (select 1 from retail_prices r where r.variant_id = v.id and r.retracted_at is null)
    order by p.name_en`)).rows;
  const settings = await getDecisionSettings();
  const today = new Date().toISOString().slice(0, 10);
  const rows = await Promise.all(
    ids.map(async (v) => {
      const [s, obs, bb] = await Promise.all([summaryFor(v.id), marketObservationsFor(v.product_id), buybackFor(v.id)]);
      const freshBb = bb.filter((b) => Math.floor((Date.parse(today) - Date.parse(b.quotedAt)) / 86400000) <= settings.buybackMaxAgeDays);
      const liq = analyzeLiquidity(obs.filter((o) => o.country === "JP"), v.id, "NEW_UNUSED", today, settings.marketMaxAgeDays, freshBb.length > 0);
      return { v, s, liq };
    }),
  );
  const list = rows.filter((r) => r.s).map((r) => ({ ...r, a: r.s!.a }));
  const roi = (x: (typeof list)[number]) => { const c = x.a.scenarios[0].result; return c && c.ok && c.adopted.roi ? Number(c.adopted.roi) : -Infinity; };
  list.sort((x, y) => ORDER[x.a.decision.decision] - ORDER[y.a.decision.decision] || roi(y) - roi(x));
  const count = (d: string) => list.filter((x) => x.a.decision.decision === d).length;

  return (
    <main>
      <PageTitle label="Candidates" title="買付候補" sub={`BUY ${count("BUY")} / HOLD ${count("HOLD")} / PASS ${count("PASS")}（価格の根拠がある仕様 ${list.length}件）`} />
      <p className="mb-3 text-xs text-mute">並び順: 判定 → 保守シナリオのROI（資金回収の効率）。仕入額の大きさでは並べません。</p>
      {list.length === 0 ? <Empty>候補がありません。商品詳細で仕様を確定し、買付条件（現地価格）を登録するか、正規価格を取込んでください。</Empty> : (
        <ul className="space-y-2">
          {list.map(({ v, a, liq }) => {
            const cons = a.scenarios[0].result, std = a.scenarios[1].result;
            const risks = a.decision.reasons.filter((r) => r.level === "BLOCKER" || r.level === "FAIL" || r.level === "WARNING").slice(0, 3);
            return (
              <li key={v.id}>
                <Link href={`/products/${v.product_id}?variant=${encodeURIComponent(v.id)}`} className="card block active:opacity-70">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="truncate">{v.name_en}</p><p className="truncate text-[10px] text-mute">{v.id}</p></div>
                    <DecisionBadge d={a.decision.decision} />
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1 text-center text-xs">
                    <div><p className="text-mute">保守利益</p><p className="tnum">{cons && cons.ok ? formatJpy(cons.adopted.preTaxProfitJpy) : "—"}</p></div>
                    <div><p className="text-mute">標準利益</p><p className="tnum">{std && std.ok ? formatJpy(std.adopted.preTaxProfitJpy) : "—"}</p></div>
                    <div><p className="text-mute">保守ROI</p><p className="tnum">{cons && cons.ok && cons.adopted.roi ? formatPct(D(cons.adopted.roi), 0) : "—"}</p></div>
                  </div>
                  <p className="mt-1 text-xs">仕入 {a.req.price ? formatMoney(a.req.price, a.req.currency) : "未登録"}（{a.req.country}）· 上限 {a.maxPurchaseLocal ? formatMoney(a.maxPurchaseLocal, a.req.currency) : "—"} <Cert c={a.certainty.profit} /></p>
                  <p className="text-xs text-mute">流動性: 成約90日 {liq.dataStatus === "NO_DATA" ? "不明" : `${liq.sold90}件`} · 換金性 {LEVEL_LABEL[liq.convertibility]} · 在庫リスク {LEVEL_LABEL[liq.inventoryRisk]}</p>
                  {risks.length > 0 && <ul className="mt-1 text-[11px] text-hold">{risks.map((r, i) => <li key={i}>・{r.message}</li>)}</ul>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
