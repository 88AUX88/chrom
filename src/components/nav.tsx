"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "ホーム", icon: "M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" },
  { href: "/scan", label: "SCAN", icon: "M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M9 12a3 3 0 106 0 3 3 0 00-6 0" },
  { href: "/products", label: "商品", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/history", label: "履歴", icon: "M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0" },
  { href: "/menu", label: "メニュー", icon: "M5 12h.01M12 12h.01M19 12h.01" },
];

export function Nav() {
  const path = usePathname();
  if (path === "/login") return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-3xl lg:max-w-5xl">
        {TABS.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          return (
            <li key={t.href} className="flex-1">
              <Link href={t.href} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] tracking-wider ${active ? "text-white" : "text-mute"}`}>
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={t.label === "メニュー" ? 3.5 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={t.icon} />
                </svg>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
