import { PageTitle } from "@/components/ui";
import { ProductForm } from "@/components/product-form";
import { MATERIALS, PRODUCT_CATEGORIES } from "@/db/schema";
import { createProduct } from "../../actions";

export default function NewProduct() {
  return (
    <main>
      <PageTitle label="商品の追加" title="商品を追加" sub="根拠のない型番・価格は登録しないでください。画像は登録後に自分で撮影したものを追加できます。" />
      <ProductForm action={createProduct} mode="create" categories={PRODUCT_CATEGORIES} materials={MATERIALS} />
    </main>
  );
}
