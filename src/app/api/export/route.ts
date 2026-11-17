import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { csvCell } from "@/lib/export";

export const runtime = "nodejs";

const TABLES: Record<string, string> = {
  products: "select * from products order by id",
  product_variants: "select * from product_variants order by id",
  product_aliases: "select * from product_aliases order by id",
  source_evidence: "select * from source_evidence order by id",
  retail_prices: "select * from retail_prices order by id",
  market_observations: "select * from market_observations order by id",
  buyback_quotes: "select * from buyback_quotes order by id",
  fx_rates: "select * from fx_rates order by id",
  fee_rules: "select * from fee_rules order by id",
  tax_assumptions: "select * from tax_assumptions order by id",
  expense_profiles: "select * from expense_profiles order by id",
  buying_scenarios: "select * from buying_scenarios order by id",
  purchases: "select * from purchases order by id",
  sales: "select * from sales order by id",
  scan_logs: "select id, provider, candidates, chosen_product_id, input_tokens, output_tokens, created_at from scan_logs order by id",
  import_batches: "select * from import_batches order by id",
  learning_cards: "select * from learning_cards order by id",
  app_settings: "select * from app_settings order by key",
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const table = url.searchParams.get("table") ?? "";
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  const db = await getDb();
  if (table === "all") {
    const out: Record<string, unknown[]> = {};
    for (const [k, q] of Object.entries(TABLES)) out[k] = (await db.execute(sql.raw(q))).rows;
    return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), tables: out }, null, 1), {
      headers: { "content-type": "application/json", "content-disposition": `attachment; filename="lmi-backup-${new Date().toISOString().slice(0, 10)}.json"` },
    });
  }
  const q = TABLES[table];
  if (!q) return new Response("unknown table", { status: 400 });
  const rows = (await db.execute<Record<string, unknown>>(sql.raw(q))).rows;
  if (format === "json") return Response.json(rows, { headers: { "content-disposition": `attachment; filename="${table}.json"` } });
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const body = [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n");
  return new Response("﻿" + body + "\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${table}.csv"` } });
}
