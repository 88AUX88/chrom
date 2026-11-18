"use client";
import { useActionState } from "react";
import { login } from "../actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, {});
  return (
    <main className="flex min-h-[80dvh] flex-col justify-center">
      <p className="h-label">クロムハーツ 買付判断システム</p>
      <h1 className="mb-8 mt-2 text-3xl font-extralight tracking-[0.2em]">ログイン</h1>
      <form action={action} className="space-y-3">
        <label className="block text-sm text-mute" htmlFor="password">パスワード</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
        {state?.error && <p className="text-sm text-pass">{state.error}</p>}
        <button className="btn-primary w-full" disabled={pending}>{pending ? "確認中…" : "ログイン"}</button>
      </form>
    </main>
  );
}
