"use client";
import { useActionState } from "react";
import { runImport } from "../actions";

type State = { error?: string; result?: { batchId: number | null; fileErrors: string[]; accepted: number; quarantine: { row: number; reasons: string[] }[] } };

export function ImportForm({ kinds }: { kinds: { k: string; l: string }[] }) {
  const [state, action, pending] = useActionState<State, FormData>(runImport as (s: State, f: FormData) => Promise<State>, {});
  const r = state.result;
  return (
    <div>
      <form action={action} className="card space-y-3">
        <select name="kind" className="field" aria-label="種類">{kinds.map((x) => <option key={x.k} value={x.k}>{x.l}</option>)}</select>
        <input type="file" name="file" accept=".csv,text/csv" className="field" aria-label="CSVファイル" />
        <button className="btn-primary w-full" disabled={pending}>{pending ? "検証中…" : "検証して取込"}</button>
      </form>
      {state.error && <p className="mt-3 text-sm text-pass">{state.error}</p>}
      {r && (
        <div className="card mt-3 text-sm" data-testid="import-result">
          {r.fileErrors.length > 0 ? (
            <><p className="text-pass">ファイルを取り込めませんでした</p><ul className="list-inside list-disc">{r.fileErrors.map((e) => <li key={e}>{e}</li>)}</ul></>
          ) : (
            <>
              <p>受理 <b>{r.accepted}</b> 行 / 隔離 <b className={r.quarantine.length ? "text-pass" : ""}>{r.quarantine.length}</b> 行{r.batchId ? `（バッチ #${r.batchId}）` : ""}</p>
              {r.quarantine.length > 0 && (
                <ul className="mt-2 space-y-1">{r.quarantine.map((q) => <li key={q.row} className="text-xs"><span className="text-pass">行{q.row}:</span> {q.reasons.join(" / ")}</li>)}</ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
