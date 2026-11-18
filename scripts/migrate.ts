/**
 * 本番 Postgres（Supabase 等）へのマイグレーション。
 * 使い方: DATABASE_URL=... npm run db:migrate
 */
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "../src/db/schema";
import { seedIfEmpty } from "../src/db/seed";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL が未設定です");
  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  // 初期データ（商品カタログ・税の前提・教材。価格データは入れない）
  await seedIfEmpty(db as unknown as Parameters<typeof seedIfEmpty>[0]);
  await client.end();
  console.log("migration done");
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
