import { LeaderboardTable } from "@/components/LeaderboardTable";
import { FilterPanel } from "@/components/FilterPanel";
import { EmptyState } from "@/components/EmptyState";
import type { LeaderboardResponse } from "@/lib/types";

// Leaderboard — IMPLEMENTATION.md Bab 8.2. Server component: reads the latest ranking
// snapshot via the internal API route logic (DB). Empty DB -> pipeline empty state.
async function loadLeaderboard(): Promise<LeaderboardResponse> {
  const { getDb } = await import("@/lib/db");
  const db = await getDb();
  if (!db) return { snapshotAt: null, totalProfiled: 0, totalPassed: 0, data: [] };
  const snapshot = await db.rankingSnapshot.findFirst({ orderBy: { snapshotAt: "desc" } });
  if (!snapshot) return { snapshotAt: null, totalProfiled: 0, totalPassed: 0, data: [] };
  const [entries, wallets, stats] = await Promise.all([
    db.rankingEntry.findMany({ where: { snapshotId: snapshot.id, passedFilters: true }, orderBy: { rank: "asc" }, take: 100 }),
    db.wallet.findMany({ select: { address: true, flags: true, lastActiveAt: true } }),
    db.walletWindowStat.findMany({ where: { windowDays: { in: [7, 30] } } }),
  ]);
  const wMap = new Map(wallets.map((x) => [x.address, x]));
  const sMap = new Map(stats.map((s) => [`${s.walletAddress}:${s.windowDays}`, s]));
  const view = (a: string, d: number) => {
    const s = sMap.get(`${a}:${d}`);
    return s ? { closed: s.closedCount, winRateRaw: s.winRateRaw, winRateAdj: s.winRateAdj, pnlSol: s.pnlSol, pnlUsd: s.pnlUsd,
      feesEarnedSol: s.feesEarnedSol, feeShare: s.feeShare, evPerPositionSol: s.evPerPositionSol,
      profitFactor: s.profitFactor, medianHoldMinutes: s.medianHoldMinutes, distinctPools: s.distinctPools }
      : { closed: 0, winRateRaw: 0, winRateAdj: 0, pnlSol: 0 };
  };
  return {
    snapshotAt: snapshot.snapshotAt.toISOString(),
    totalProfiled: wallets.length,
    totalPassed: entries.length,
    data: entries.map((e) => ({
      rank: e.rank, address: e.walletAddress, winScore: e.winScore, compositeScore: e.compositeScore,
      stats7: view(e.walletAddress, 7), stats30: view(e.walletAddress, 30),
      flags: wMap.get(e.walletAddress)?.flags ?? [],
      lastActiveAt: wMap.get(e.walletAddress)?.lastActiveAt?.toISOString() ?? null,
    })),
  };
}

export default async function LeaderboardPage() {
  const lb = await loadLeaderboard();
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Top LPers — Win Rate dulu, PnL kedua</h1>
          <p className="text-sm text-zinc-400">
            {lb.snapshotAt ? `Snapshot: ${new Date(lb.snapshotAt).toLocaleString("id-ID")} · ${lb.totalProfiled} wallet diprofil · ${lb.totalPassed} lolos filter`
              : "Belum ada snapshot ranking."}
          </p>
        </div>
        <a href="/api/export/leaderboard?format=json&top=50" className="rounded bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700">Export JSON</a>
      </div>
      <div className="flex flex-col gap-4 lg:flex-row">
        <FilterPanel />
        <div className="min-w-0 flex-1">
          {lb.data.length
            ? <LeaderboardTable data={lb.data} />
            : <EmptyState title="Leaderboard masih kosong" hint="Jalankan pipeline: npm run job:pools -> job:wallets -> job:profile -> job:scoring (lihat /jobs dan README)." />}
        </div>
      </div>
    </div>
  );
}
