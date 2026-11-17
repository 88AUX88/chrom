"use client";
import { useFormStatus } from "react-dom";

/** 送信中は無効化して「処理中…」を表示（二重送信防止） */
export function SubmitButton({ children, className = "btn-primary w-full" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} aria-busy={pending}>
      {pending ? "処理中…" : children}
    </button>
  );
}
