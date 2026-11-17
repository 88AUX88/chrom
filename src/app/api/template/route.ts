import { IMPORT_KINDS } from "@/db/schema";
import { templateCsv } from "@/lib/import/validate";

export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get("kind") as (typeof IMPORT_KINDS)[number];
  if (!IMPORT_KINDS.includes(kind)) return new Response("unknown kind", { status: 400 });
  return new Response("﻿" + templateCsv(kind), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${kind}.csv"` } });
}
