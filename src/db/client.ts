import "server-only";
import path from "node:path";
import fs from "node:fs";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";
import { seedIfEmpty } from "./seed";

/**
 * DB 接続:
 * - DATABASE_URL があれば Postgres（Supabase 等）に postgres-js で接続（マイグレーションは npm run db:migrate）
 * - なければローカル組込み Postgres（PGlite）を PGLITE_DIR（既定 ./.data/pglite）に作成し自動マイグレーション
 * 両者のクエリ API は同一（drizzle PgDatabase）。
 */
export type DB = PgliteDatabase<typeof schema>;

const g = globalThis as unknown as { __lmiDb?: Promise<DB> };

async function init(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const postgres = (await import("postgres")).default;
    const client = postgres(url, { prepare: false, max: 3 });
    const db = drizzle(client, { schema }) as unknown as DB;
    await seedIfEmpty(db);
    return db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  if (dir !== "memory://") fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await seedIfEmpty(db);
  return db;
}

export function getDb(): Promise<DB> {
  if (!g.__lmiDb) {
    g.__lmiDb = init().catch((e) => {
      g.__lmiDb = undefined;
      throw e;
    });
  }
  return g.__lmiDb;
}
