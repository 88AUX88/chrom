/**
 * 本番 Postgres（Supabase 等）へのマイグレーション。
 * 使い方: DATABASE_URL=... npm run db:migrate
 */
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL が未設定です");
  const client = postgres(url, { max: 1, prepare: false });
  await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await client.end();
  console.log("migration done");
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
