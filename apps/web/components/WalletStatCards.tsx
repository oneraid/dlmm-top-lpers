import type { WindowStatView } from "@/lib/types";
import { fmtPct, fmtSol, pnlClass } from "@/lib/format";

export function WalletStatCards({ stats }: { stats: WindowStatView }) {
  const cards: [string, string, string?][] = [
    ["Win Rate", `${fmtPct(stats.winRateRaw)} (adj ${fmtPct(stats.winRateAdj)})`],
    ["Posisi Closed", String(stats.closed)],
    ["PnL", fmtSol(stats.pnlSol), pnlClass(stats.pnlSol)],
    ["Fees Earned", stats.feesEarnedSol != null ? fmtSol(stats.feesEarnedSol) : "-"],
    ["EV / Posisi", stats.evPerPositionSol != null ? fmtSol(stats.evPerPositionSol, 3) : "-"],
    ["Median Hold", stats.medianHoldMinutes != null ? `${Math.round(stats.medianHoldMinutes)}m` : "-"],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {cards.map(([label, value, cls]) => (
        <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
          <p className={`mt-1 text-lg font-semibold ${cls ?? ""}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}
