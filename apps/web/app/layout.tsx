import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata = { title: "DLMM Top LPers", description: "Find consistently profitable Meteora DLMM LPs — Win Rate first, PnL second." };

const NAV: [string, string][] = [
  ["/", "Leaderboard"], ["/pools", "Pools"], ["/watchlist", "Watchlist"],
  ["/compare", "Compare"], ["/settings", "Settings"], ["/jobs", "Pipeline"],
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className="dark">
      <body>
        <header className="border-b border-zinc-800">
          <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
            <Link href="/" className="font-bold">DLMM Top LPers</Link>
            <nav className="flex gap-4 text-sm text-zinc-300">
              {NAV.map(([href, label]) => <Link key={href} href={href} className="hover:text-white">{label}</Link>)}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
