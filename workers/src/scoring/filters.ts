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
  // Siklus 18 Nov 00:58: wallet WR 98.6% (73W/1L) tapi pnl_30d -0.47 SOL sempat lolos dan
  // ranking #1 — aturan user: wallet PnL negatif tidak boleh jadi kandidat. Gate di sini
  // (bukan cuma di laporan) supaya snapshot/leaderboard tidak pernah menampilkannya.
  if (s30.pnlSol <= cfg.pnlEpsilonSol) failed.push(`pnl_30d=${s30.pnlSol.toFixed(3)} SOL (<=${cfg.pnlEpsilonSol})`);
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

// Copy-ready (leaderboard yang bisa di-copy user) — definisi TUNGGAL di sini.
// scoringRun menulis hasilnya ke ranking_entries.copy_ready, dan semua
// konsumen (laporan siklus, notify-telegram) membaca flag itu; tidak ada
// lagi penebakan ulang kriteria di SQL laporan/notifikasi.
// Kriteria lama: lolos hard filters + PnL 30D > 0 + >= 50 posisi closed 30D
// + <= 2 posisi open.
// Aturan user 2026-11-24: wallet yang tidak menutup posisi apa pun dalam
// 3 hari (72 jam) terakhir sebelum waktu snapshot dikeluarkan dari
// copy-ready. Wallet tetap di-skor dan di-track seperti biasa, dan otomatis
// masuk lagi ke copy-ready begitu ia menutup posisi lagi.
export const COPY_READY_MIN_CLOSED_30D = 50;
export const COPY_READY_MAX_OPEN = 2;
export const COPY_READY_MAX_IDLE_HOURS = 72;

export function evaluateCopyReady(
  s30: WindowStats,
  lastClosedAt: Date | null,
  passedFilters: boolean,
  now = new Date(),
): boolean {
  if (!passedFilters) return false;
  if (s30.pnlSol <= 0) return false;
  if (s30.closedCount < COPY_READY_MIN_CLOSED_30D) return false;
  if (s30.openCount > COPY_READY_MAX_OPEN) return false;
  if (!lastClosedAt) return false;
  const idleHours = (now.getTime() - lastClosedAt.getTime()) / 3_600_000;
  return idleHours <= COPY_READY_MAX_IDLE_HOURS;
}
