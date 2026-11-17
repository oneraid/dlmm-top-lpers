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
  const cfg = await loadConfig();
  const wallets = await prisma.wallet.findMany({ where: { profileStatus: "done" }, include: { stats: true } });
  const candidates: RankingCandidate[] = [];
  for (const w of wallets) {
    const s7 = w.stats.find((s) => s.windowDays === 7);
    const s30 = w.stats.find((s) => s.windowDays === 30);
    if (!s7 || !s30) continue;
    candidates.push({ walletAddress: w.address, lastActiveAt: w.lastActiveAt, stats7: toStats(s7), stats30: toStats(s30) });
  }
  const results = buildRanking(candidates, cfg);
  const snapshot = await prisma.rankingSnapshot.create({ data: { mode: cfg.rankingMode } });
  for (const r of results) {
    await prisma.rankingEntry.create({
      data: {
        snapshotId: snapshot.id, walletAddress: r.walletAddress, rank: r.rank,
        winScore: r.winScore, compositeScore: r.compositeScore,
        passedFilters: r.passedFilters, failedFilters: r.failedFilters,
      },
    });
  }
  return { wallets: results.length, passed: results.filter((r) => r.passedFilters).length };
}
