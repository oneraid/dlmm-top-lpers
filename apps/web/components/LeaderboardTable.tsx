import Link from "next/link";
import type { LeaderboardEntryView } from "@/lib/types";
import { fmtPct, fmtSol, pnlClass, shortAddress, timeAgo } from "@/lib/format";
import { FlagBadges, ConsistentBadge } from "./FlagBadges";

// Column order is a product rule: WinScore / WR BEFORE PnL (IMPLEMENTATION.md Bab 8.2).
export function LeaderboardTable({ data }: { data: LeaderboardEntryView[] }) {
  if (!data.length) return null;
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900 text-left text-zinc-400">
          <tr>
            <th className="px-3 py-2">#</th><th className="px-3 py-2">Wallet</th>
            <th className="px-3 py-2">WinScore</th><th className="px-3 py-2">WR 7D</th>
            <th className="px-3 py-2">WR 30D</th><th className="px-3 py-2">PnL 30D</th>
            <th className="px-3 py-2">PnL 7D</th><th className="px-3 py-2">Posisi 30D</th>
            <th className="px-3 py-2">Aktif</th>
          </tr>
        </thead>
        <tbody>
          {data.map((e) => (
            <tr key={e.address} className="border-t border-zinc-800 hover:bg-zinc-900/60">
              <td className="px-3 py-2">{e.rank}</td>
              <td className="px-3 py-2">
                <Link href={`/wallet/${e.address}`} className="font-mono text-sky-300 hover:underline">
                  {shortAddress(e.address)}
                </Link>
                <div className="mt-1 flex gap-1"><ConsistentBadge winScore={e.winScore} /><FlagBadges flags={e.flags} /></div>
              </td>
              <td className="px-3 py-2 font-semibold">{e.winScore.toFixed(2)}</td>
              <td className="px-3 py-2">{fmtPct(e.stats7.winRateRaw)} <span className="text-xs text-zinc-500">adj {fmtPct(e.stats7.winRateAdj)}</span></td>
              <td className="px-3 py-2">{fmtPct(e.stats30.winRateRaw)} <span className="text-xs text-zinc-500">adj {fmtPct(e.stats30.winRateAdj)}</span></td>
              <td className={`px-3 py-2 ${pnlClass(e.stats30.pnlSol)}`}>{fmtSol(e.stats30.pnlSol)}</td>
              <td className={`px-3 py-2 ${pnlClass(e.stats7.pnlSol)}`}>{fmtSol(e.stats7.pnlSol)}</td>
              <td className="px-3 py-2">{e.stats30.closed}</td>
              <td className="px-3 py-2 text-zinc-400">{timeAgo(e.lastActiveAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
