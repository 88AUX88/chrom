import Link from "next/link";
import type { ReactNode } from "react";

export function PageTitle({ label, title, sub }: { label: string; title: string; sub?: ReactNode }) {
  return (
    <header className="mb-5">
      <p className="h-label">{label}</p>
      <h1 className="mt-1 text-2xl font-light tracking-wide">{title}</h1>
      {sub && <div className="mt-1 text-sm text-mute">{sub}</div>}
    </header>
  );
}

const REL_STYLE: Record<string, string> = {
  VERIFIED: "border-buy/50 text-buy",
  USER_CONFIRMED: "border-buy/50 text-buy",
  REPORTED: "border-silver/50 text-silver",
  ESTIMATED: "border-hold/50 text-hold",
  UNVERIFIED: "border-pass/50 text-pass",
  STALE: "border-hold/60 text-hold",
};
const REL_LABEL: Record<string, string> = {
  VERIFIED: "確認済",
  USER_CONFIRMED: "本人確認済",
  REPORTED: "報告値",
  ESTIMATED: "推定",
  UNVERIFIED: "未検証",
  STALE: "古い",
};
export function Rel({ v }: { v: string }) {
  return <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] leading-none ${REL_STYLE[v] ?? "border-line text-mute"}`}>{REL_LABEL[v] ?? v}</span>;
}

export function DecisionBadge({ d, large }: { d: string; large?: boolean }) {
  const cls = d === "BUY" ? "bg-buy text-black" : d === "PASS" ? "bg-pass text-black" : "bg-hold text-black";
  return <span className={`inline-block rounded-md font-bold tracking-widest ${cls} ${large ? "px-5 py-2 text-2xl" : "px-2 py-0.5 text-xs"}`}>{d}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-sm text-mute">{children}</p>;
}

export function Warn({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-hold/40 bg-hold/10 px-3 py-2 text-sm text-hold">{children}</p>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card">
      <p className="h-label">{label}</p>
      <p className="tnum mt-1 text-xl font-light">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-mute">{sub}</p>}
    </div>
  );
}

export function ExtLink({ href, children }: { href: string | null; children?: ReactNode }) {
  if (!href) return <span className="text-mute">出典URLなし</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-silver underline decoration-line underline-offset-2">
      {children ?? new URL(href).hostname}
    </a>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-end justify-between">
        <h2 className="h-label">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="flex min-h-12 items-center justify-between border-t border-line py-3 first:border-t-0">
      <span>{children}</span>
      <span className="text-mute">›</span>
    </Link>
  );
}
