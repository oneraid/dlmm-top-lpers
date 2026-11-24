import { prisma } from "@dlmm/db";
import { buildRanking, type RankingCandidate } from "../scoring/ranking.js";
import { DEFAULT_SCORING_CONFIG, type ScoringConfig } from "../scoring/filters.js";
import type { WindowStats } from "../scoring/aggregateStats.js";

// Tahap 4 — Scoring Engine (IMPLEMENTATION.md Bab 6.4). Hourly + after profiler batches.
async function loadConfig(): Promise<ScoringConfig> {
  const rows = await prisma.scoringConfig.findMany();
  const cfg: ScoringConfig = { ...DEFAULT_SCORING_CONFIG };
  for (const r of rows) {
    if (r.key in cfg) (cfg as unknown as Record<string, unknown>)[r.key] = r.value;
  }
  return cfg;
}

function toStats(row: {
  closedCount: number; wins: number; losses: number; flats: number; winRateRaw: number; winRateAdj: number;
  pnlSol: number; pnlUsd: number; feesEarnedSol: number; feeShare: number; evPerPositionSol: number;
  profitFactor: number | null; medianPnlSol: number; topTradeShare: number; avgHoldMinutes: number;
  medianHoldMinutes: number; medianPositionSol: number; distinctPools: number; openCount: number;
  openUnrealizedSol: number; windowDays: number;
}): WindowStats {
  return { ...row };
}

export async function scoringRun(): Promise<{ wallets: number; passed: number }> {
  // Siklus 08:58 18 Nov: catat ke job_runs seperti poolDiscovery/walletDiscovery
  // (sebelumnya job ini tak terlacak — riwayat pipeline di DB bolong).
  const run = await prisma.jobRun.create({ data: { jobName: "scoringRun", status: "running" } });
  try {
    const cfg = await loadConfig();
    const wallets = await prisma.wallet.findMany({ where: { profileStatus: "done" }, include: { stats: true } });
    // MAX(closed_at) per wallet — dasar aturan copy-ready 3 hari (user,
    // 2026-11-24): tidak ada posisi close dalam 72 jam terakhir sebelum
    // snapshot = keluar dari copy-ready (tetap di-skor/di-track).
    const lastClosedRows = await prisma.position.groupBy({
      by: ["walletAddress"],
      where: { status: "closed", closedAt: { not: null } },
      _max: { closedAt: true },
    });
    const lastClosedByWallet = new Map(lastClosedRows.map((r) => [r.walletAddress, r._max.closedAt]));
    const candidates: RankingCandidate[] = [];
    for (const w of wallets) {
      const s7 = w.stats.find((s) => s.windowDays === 7);
      const s30 = w.stats.find((s) => s.windowDays === 30);
      if (!s7 || !s30) continue;
      candidates.push({ walletAddress: w.address, lastActiveAt: w.lastActiveAt,
        lastClosedAt: lastClosedByWallet.get(w.address) ?? null, stats7: toStats(s7), stats30: toStats(s30) });
    }
    const results = buildRanking(candidates, cfg);
    const snapshot = await prisma.rankingSnapshot.create({ data: { mode: cfg.rankingMode } });
    for (const r of results) {
      await prisma.rankingEntry.create({
        data: {
          snapshotId: snapshot.id, walletAddress: r.walletAddress, rank: r.rank,
          winScore: r.winScore, compositeScore: r.compositeScore,
          passedFilters: r.passedFilters, failedFilters: r.failedFilters,
          copyReady: r.copyReady,
        },
      });
    }
    // Freeze-stats (#55, diterapkan #56): bekukan salinan WindowStats 7D/30D
    // tiap kandidat bersama snapshot, agar angka di balik ranking bisa
    // direproduksi walau wallet_window_stats ditimpa profiler run berikutnya.
    for (const r of results) {
      for (const s of [r.stats7, r.stats30]) {
        await prisma.snapshotWalletStat.create({
          data: {
            snapshotId: snapshot.id, walletAddress: r.walletAddress,
            windowDays: s.windowDays, closedCount: s.closedCount, wins: s.wins,
            losses: s.losses, flats: s.flats, winRateRaw: s.winRateRaw,
            winRateAdj: s.winRateAdj, pnlSol: s.pnlSol, pnlUsd: s.pnlUsd,
            feesEarnedSol: s.feesEarnedSol, feeShare: s.feeShare,
            evPerPositionSol: s.evPerPositionSol, profitFactor: s.profitFactor,
            medianPnlSol: s.medianPnlSol, topTradeShare: s.topTradeShare,
            avgHoldMinutes: s.avgHoldMinutes, medianHoldMinutes: s.medianHoldMinutes,
            medianPositionSol: s.medianPositionSol, distinctPools: s.distinctPools,
            openCount: s.openCount, openUnrealizedSol: s.openUnrealizedSol,
          },
        });
      }
    }
    const out = { wallets: results.length, passed: results.filter((r) => r.passedFilters).length };
    await prisma.jobRun.update({ where: { id: run.id }, data: { status: "done", finishedAt: new Date(),
      detail: out } });
    return out;
  } catch (err) {
    await prisma.jobRun.update({ where: { id: run.id }, data: { status: "failed", finishedAt: new Date(),
      detail: { error: err instanceof Error ? err.message : String(err) } } });
    throw err;
  }
}
