import type { WindowStats } from "./aggregateStats.js";

export interface ScoringConfig {
  minClosed30d: number;
  minClosed7d: number;
  maxLastActiveDays: number;
  minFeeShare: number;
  maxTopTradeShare: number;
  minDistinctPools30d: number;
  minAvgHoldMinutes: number;
  warnAvgHoldMinutes: number;
  pnlEpsilonSol: number;
  winScoreWeight7d: number;
  winScoreWeight30d: number;
  rankingMode: "lexicographic" | "composite";
}

// Defaults: IMPLEMENTATION.md Bab 2.5 (seeded into scoring_config, editable in UI Settings).
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  minClosed30d: 20,
  minClosed7d: 3,
  maxLastActiveDays: 7,
  minFeeShare: 0.10,
  maxTopTradeShare: 0.35,
  minDistinctPools30d: 5,
  minAvgHoldMinutes: 12,
  warnAvgHoldMinutes: 18,
  pnlEpsilonSol: 0.001,
  winScoreWeight7d: 0.4,
  winScoreWeight30d: 0.6,
  rankingMode: "lexicographic",
};

/** Returns list of failed filter codes; empty array = passed. Codes are shown in the UI. */
export function evaluateHardFilters(
  s7: WindowStats,
  s30: WindowStats,
  lastActiveAt: Date | null,
  cfg: ScoringConfig,
  now = new Date(),
): string[] {
  const failed: string[] = [];
  if (s30.closedCount < cfg.minClosed30d) failed.push(`closed_30d=${s30.closedCount} (<${cfg.minClosed30d})`);
  if (s7.closedCount < cfg.minClosed7d) failed.push(`closed_7d=${s7.closedCount} (<${cfg.minClosed7d})`);
  const idleDays = lastActiveAt ? (now.getTime() - lastActiveAt.getTime()) / 86_400_000 : Infinity;
  if (idleDays > cfg.maxLastActiveDays) failed.push(`last_active=${idleDays.toFixed(1)}d (>${cfg.maxLastActiveDays}d)`);
  if (s30.feeShare < cfg.minFeeShare) failed.push(`fee_share=${s30.feeShare.toFixed(2)} (<${cfg.minFeeShare})`);
  if (s30.topTradeShare > cfg.maxTopTradeShare) failed.push(`top_trade_share=${s30.topTradeShare.toFixed(2)} (>${cfg.maxTopTradeShare})`);
  if (s30.distinctPools < cfg.minDistinctPools30d) failed.push(`distinct_pools_30d=${s30.distinctPools} (<${cfg.minDistinctPools30d})`);
  if (s30.avgHoldMinutes < cfg.minAvgHoldMinutes) failed.push(`avg_hold=${s30.avgHoldMinutes.toFixed(0)}m (<${cfg.minAvgHoldMinutes}m)`);
  return failed;
}

export function winScore(s7: WindowStats, s30: WindowStats, cfg: ScoringConfig): number {
  return cfg.winScoreWeight7d * s7.winRateAdj + cfg.winScoreWeight30d * s30.winRateAdj;
}
