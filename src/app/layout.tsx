import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "クロムハーツ買付判断",
  description: "海外ブランド買付判断システム",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "CH買付", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#0a0a0b", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        <div className="mx-auto min-h-dvh max-w-3xl px-4 pb-28 pt-[max(env(safe-area-inset-top),16px)] lg:max-w-5xl lg:px-8">{children}</div>
        <Nav />
      </body>
    </html>
  );
}
