import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 text-center">
      <p className="h-label">404</p>
      <h1 className="text-xl">見つかりませんでした</h1>
      <Link href="/products" className="btn">商品図鑑へ</Link>
    </main>
  );
}
