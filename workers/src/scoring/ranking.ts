import type { WindowStats } from "./aggregateStats.js";
import { evaluateCopyReady, evaluateHardFilters, winScore, type ScoringConfig } from "./filters.js";

export interface RankingCandidate {
  walletAddress: string;
  lastActiveAt: Date | null;
  /** MAX(closed_at) posisi closed wallet ini — dasar aturan copy-ready 3 hari (user, 2026-11-24). */
  lastClosedAt: Date | null;
  stats7: WindowStats;
  stats30: WindowStats;
}

export interface RankingResult extends RankingCandidate {
  winScore: number;
  compositeScore: number;
  passedFilters: boolean;
  failedFilters: string[];
  copyReady: boolean;
  rank: number; // 0 = not ranked (failed filters)
}

/** Lexicographic sort — THE product rule: WinScore first, PnL second. Spec: IMPLEMENTATION.md Bab 2.4 */
export function lexicographicComparator(a: RankingResult, b: RankingResult): number {
  if (b.winScore !== a.winScore) return b.winScore - a.winScore;
  if (b.stats30.pnlSol !== a.stats30.pnlSol) return b.stats30.pnlSol - a.stats30.pnlSol;
  if (b.stats7.pnlSol !== a.stats7.pnlSol) return b.stats7.pnlSol - a.stats7.pnlSol;
  if (b.stats30.evPerPositionSol !== a.stats30.evPerPositionSol)
    return b.stats30.evPerPositionSol - a.stats30.evPerPositionSol;
  return b.stats30.closedCount - a.stats30.closedCount;
}

export function buildRanking(candidates: RankingCandidate[], cfg: ScoringConfig, now = new Date()): RankingResult[] {
  const maxLogPnl = Math.max(1, ...candidates.map((c) => Math.log1p(Math.max(0, c.stats30.pnlSol))));
  const results: RankingResult[] = candidates.map((c) => {
    const failed = evaluateHardFilters(c.stats7, c.stats30, c.lastActiveAt, cfg, now);
    const ws = winScore(c.stats7, c.stats30, cfg);
    const logNorm = Math.log1p(Math.max(0, c.stats30.pnlSol)) / maxLogPnl;
    const pfNorm = Math.min(c.stats30.profitFactor ?? 5, 5) / 5;
    return {
      ...c,
      winScore: ws,
      compositeScore: 100 * (0.7 * ws + 0.2 * logNorm + 0.1 * pfNorm),
      passedFilters: failed.length === 0,
      failedFilters: failed,
      copyReady: evaluateCopyReady(c.stats30, c.lastClosedAt, failed.length === 0, now),
      rank: 0,
    };
  });
  const passed = results.filter((r) => r.passedFilters);
  passed.sort(cfg.rankingMode === "composite"
    ? (a, b) => b.compositeScore - a.compositeScore || lexicographicComparator(a, b)
    : lexicographicComparator);
  passed.forEach((r, i) => (r.rank = i + 1));
  return results;
}
