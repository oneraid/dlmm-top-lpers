import type { WindowStats } from "./aggregateStats.js";

// Heuristic flags — IMPLEMENTATION.md Bab 2.6. Keep thresholds in one place.
export const FLAGS = {
  CREATOR: "CREATOR_FLAG",
  ONE_POOL: "ONE_POOL_FLAG",
  SNIPER: "SNIPER_FLAG",
  HIDDEN_LOSS: "HIDDEN_LOSS_FLAG",
  BURST: "BURST_FLAG",
} as const;

export interface FlagInput {
  stats30: WindowStats;
  topPoolPnlShare: number; // share of 30d PnL from the single biggest pool, 0..1
  medianHoldMinutes: number;
  openUnrealizedSol: number;
  pnl30Sol: number;
  activityLast48hShare: number; // share of 30d closes in the last 48h, 0..1
  isPoolCreator: boolean;
}

export function evaluateFlags(i: FlagInput): string[] {
  const flags: string[] = [];
  if (i.isPoolCreator) flags.push(FLAGS.CREATOR);
  if (i.topPoolPnlShare > 0.8) flags.push(FLAGS.ONE_POOL);
  if (i.medianHoldMinutes < 5) flags.push(FLAGS.SNIPER);
  if (i.pnl30Sol > 0 && i.openUnrealizedSol < -0.5 * i.pnl30Sol) flags.push(FLAGS.HIDDEN_LOSS);
  if (i.activityLast48hShare > 0.7) flags.push(FLAGS.BURST);
  return flags;
}
