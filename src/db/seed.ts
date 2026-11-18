import { sql } from "drizzle-orm";
import * as s from "./schema";
import { SEED_BRANDS, SEED_FEE_RULES, SEED_PRODUCTS, SEED_TAX_ASSUMPTIONS } from "./seed-data";
import { DEFAULT_DECISION_SETTINGS } from "@/lib/decide/engine";
import { DEFAULT_EXPENSE_PROFILE } from "@/lib/settings-defaults";
import { buildLearningCards } from "@/lib/learn/cards";
import type { PgliteDatabase } from "drizzle-orm/pglite";

type DB = PgliteDatabase<typeof s>;

/** 空の DB にカタログ・前提条件・設定の初期値を入れる（価格データは入れない） */
export async function seedIfEmpty(db: DB): Promise<void> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.brands);
  if (n > 0) return;
  await db.transaction(async (tx) => {
    // 同時に複数のサーバーが起動しても二重登録しない（先に入れた側だけが続きを実行）
    const inserted = await tx.insert(s.brands).values(SEED_BRANDS).onConflictDoNothing().returning({ id: s.brands.id });
    if (inserted.length === 0) return;
    for (const p of SEED_PRODUCTS) {
      await tx.insert(s.products).values({
        id: p.id,
        brandId: "chrome-hearts",
        category: p.category,
        nameEn: p.nameEn,
        nameJaReading: p.nameJaReading,
        officialModelNumber: null,
        catalogStatus: "UNVERIFIED",
        distinguishingFeatures: p.features,
        confusableWith: p.confusableWith,
        variantOptions: p.options,
        notes: "初期カタログ（未検証）。名称・仕様を公式情報/調査資料で確認してください。",
      });
      if (p.aliases.length)
        await tx.insert(s.productAliases).values(p.aliases.map((a) => ({ productId: p.id, alias: a })));
    }
    await tx.insert(s.taxAssumptions).values(SEED_TAX_ASSUMPTIONS);
    const today = new Date().toISOString().slice(0, 10);
    await tx.insert(s.feeRules).values(
      SEED_FEE_RULES.map((f) => ({
        platform: f.platform,
        version: 1,
        effectiveFrom: today,
        feeRate: f.platform === "BUYBACK" ? "0" : null,
        fixedFeeJpy: "0",
        feeIncludesJct: true,
        status: "UNVERIFIED" as const,
        notes: f.notes,
      })),
    );
    await tx.insert(s.appSettings).values([
      { key: "decision", value: DEFAULT_DECISION_SETTINGS },
      { key: "businessTaxStatus", value: "UNKNOWN" },
    ]);
    await tx.insert(s.expenseProfiles).values({ name: "標準（仮置き）", data: DEFAULT_EXPENSE_PROFILE, isDefault: true });
    const cards = buildLearningCards(SEED_PRODUCTS);
    if (cards.length) await tx.insert(s.learningCards).values(cards);
  });
}
