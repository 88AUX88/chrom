"use client";
import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 text-center" role="alert">
      <p className="h-label">エラー</p>
      <h1 className="text-xl">処理できませんでした</h1>
      <p className="max-w-sm text-sm text-mute">{error.message && !error.digest ? error.message : "入力内容・通信状況を確認して、もう一度お試しください。データは変更されていない可能性があります。"}</p>
      <div className="flex gap-2"><button onClick={reset} className="btn-primary">再試行</button><Link href="/" className="btn">ホームへ</Link></div>
    </main>
  );
}
