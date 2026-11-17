import { retractRecord } from "@/app/actions";

/** 誤データの取り消し（削除しない・理由と履歴を残す） */
export function RetractForm({ entity, id, back }: { entity: "retail_prices" | "market_observations" | "buyback_quotes"; id: number; back: string }) {
  return (
    <details className="mt-1 text-[10px]">
      <summary className="cursor-pointer text-mute">取り消し</summary>
      <form action={retractRecord} className="mt-1 flex gap-1">
        <input type="hidden" name="entity" value={entity} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="back" value={back} />
        <input name="reason" required placeholder="理由" aria-label="取り消し理由" className="w-24 rounded border border-line bg-ink px-1 py-1 text-xs" />
        <button className="rounded border border-pass/50 px-2 text-pass">確定</button>
      </form>
    </details>
  );
}
