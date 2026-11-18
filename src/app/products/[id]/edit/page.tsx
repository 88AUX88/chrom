import { notFound } from "next/navigation";
import { desc, eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import * as s from "@/db/schema";
import { getProduct } from "@/lib/data";
import { PageTitle, Section } from "@/components/ui";
import { ProductForm } from "@/components/product-form";
import { updateProduct } from "../../../actions";

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getProduct(id);
  if (!d) notFound();
  const p = d.product;
  const db = await getDb();
  const history = await db.select().from(s.changeLog).where(and(eq(s.changeLog.entity, "products"), eq(s.changeLog.entityId, id))).orderBy(desc(s.changeLog.id)).limit(20);
  return (
    <main>
      <PageTitle label="商品の編集" title={p.nameEn} sub={`最終更新 ${new Date(p.updatedAt).toLocaleString("ja-JP")}`} />
      <ProductForm
        action={updateProduct}
        mode="edit"
        categories={s.PRODUCT_CATEGORIES}
        materials={s.MATERIALS}
        v={{ id: p.id, category: p.category, catalogStatus: p.catalogStatus, nameEn: p.nameEn, nameJaReading: p.nameJaReading, officialModelNumber: p.officialModelNumber, features: p.distinguishingFeatures, notes: p.notes, sourceUrl: p.sourceUrl, verifiedAt: p.verifiedAt, materials: p.variantOptions.materials, sizes: p.variantOptions.sizes, stones: p.variantOptions.stones, aliases: d.aliases.map((a) => a.alias), confusableWith: p.confusableWith }}
      />
      <Section title="変更履歴">
        {history.length === 0 ? <p className="text-sm text-mute">手動での変更はまだありません</p> : (
          <ul className="card space-y-2 text-xs">
            {history.map((h) => (
              <li key={h.id}>
                <span className="text-mute">{new Date(h.createdAt).toLocaleString("ja-JP")} · {h.action}</span>{h.reason && <span> · {h.reason}</span>}
                <ul className="ml-2">{Object.entries(h.changes).map(([k, c]) => <li key={k}>{k}: <span className="text-mute">{JSON.stringify(c.before)}</span> → {JSON.stringify(c.after)}</li>)}</ul>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}
