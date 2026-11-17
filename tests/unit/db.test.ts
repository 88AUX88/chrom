import { describe, it, expect } from "vitest";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { seedIfEmpty } from "@/db/seed";

describe("DB マイグレーションと初期データ（統合テスト）", () => {
  it("マイグレーション→シード→冪等性→価格データなし", async () => {
    const db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    await seedIfEmpty(db);
    await seedIfEmpty(db); // 2回目は何もしない
    const count = async (t: string) => (await db.execute<{ n: number }>(sql.raw(`select count(*)::int as n from ${t}`))).rows[0].n;
    expect(await count("brands")).toBe(1);
    expect(await count("products")).toBe(20);
    expect(await count("retail_prices")).toBe(0);
    expect(await count("market_observations")).toBe(0);
    expect(await count("learning_cards")).toBeGreaterThan(30);
    const unverified = await db.execute<{ n: number }>(sql`select count(*)::int as n from products where catalog_status <> 'UNVERIFIED' or official_model_number is not null`);
    expect(unverified.rows[0].n).toBe(0);
    // 出典なしの価格は DB 制約で入らない
    await expect(
      db.execute(sql`insert into retail_prices (variant_id, country, currency, amount, price_kind, tax_inclusion, observed_at) values ('x','US','USD',1,'OFFICIAL','EXCLUDED','2026-01-01')`),
    ).rejects.toThrow();
  });
});
