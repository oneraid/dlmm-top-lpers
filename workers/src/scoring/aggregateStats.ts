import { wilsonLowerBound } from "./wilson.js";

export interface PositionLike {
  status: "open" | "closed";
  poolAddress: string;
  closedAt: Date | null;
  createdAt: Date;
  holdMinutes: number | null;
  depositedSol: number | null;
  pnlSol: number | null;
  pnlUsd: number | null;
  feesEarnedSol: number;
  isWin: boolean | null; // null = flat (inside epsilon) or not closed
}

export interface WindowStats {
  windowDays: number;
  closedCount: number;
  wins: number;
  losses: number;
  flats: number;
  winRateRaw: number;
  winRateAdj: number;
  pnlSol: number;
  pnlUsd: number;
  feesEarnedSol: number;
  feeShare: number;
  evPerPositionSol: number;
  profitFactor: number | null;
  medianPnlSol: number;
  topTradeShare: number;
  avgHoldMinutes: number;
  medianHoldMinutes: number;
  medianPositionSol: number;
  distinctPools: number;
  openCount: number;
  openUnrealizedSol: number;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/** Pure aggregation of one wallet's positions into window stats. Spec: IMPLEMENTATION.md Bab 6.3 step 4. */
export function aggregateStats(positions: PositionLike[], windowDays: number, now = new Date()): WindowStats {
  const since = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const closed = positions.filter(
    (p) => p.status === "closed" && p.closedAt && p.closedAt.getTime() >= since,
  );
  const open = positions.filter((p) => p.status === "open");

  const wins = closed.filter((p) => p.isWin === true);
  const losses = closed.filter((p) => p.isWin === false);
  const flats = closed.length - wins.length - losses.length;

  const pnlSol = closed.reduce((a, p) => a + (p.pnlSol ?? 0), 0);
  const pnlUsd = closed.reduce((a, p) => a + (p.pnlUsd ?? 0), 0);
  const fees = closed.reduce((a, p) => a + (p.feesEarnedSol ?? 0), 0);

  const grossWin = wins.reduce((a, p) => a + Math.max(0, p.pnlSol ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((a, p) => a + Math.min(0, p.pnlSol ?? 0), 0));
  // feeShare: how much of the positive result came from fees (vs price movement).
  const feeShare = grossWin + fees > 0 ? fees / (grossWin + fees) : 0;
  const biggestWin = wins.reduce((a, p) => Math.max(a, p.pnlSol ?? 0), 0);

  return {
    windowDays,
    closedCount: closed.length,
    wins: wins.length,
    losses: losses.length,
    flats,
    winRateRaw: wins.length + losses.length ? wins.length / (wins.length + losses.length) : 0,
    winRateAdj: wilsonLowerBound(wins.length, losses.length),
    pnlSol,
    pnlUsd,
    feesEarnedSol: fees,
    feeShare,
    evPerPositionSol: closed.length ? pnlSol / closed.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? null : 0,
    medianPnlSol: median(closed.map((p) => p.pnlSol ?? 0)),
    topTradeShare: grossWin > 0 ? biggestWin / grossWin : 0,
    avgHoldMinutes: closed.length ? closed.reduce((a, p) => a + (p.holdMinutes ?? 0), 0) / closed.length : 0,
    medianHoldMinutes: median(closed.map((p) => p.holdMinutes ?? 0)),
    medianPositionSol: median(closed.map((p) => p.depositedSol ?? 0)),
    distinctPools: new Set(closed.map((p) => p.poolAddress)).size,
    openCount: open.length,
    openUnrealizedSol: open.reduce((a, p) => a + (p.pnlSol ?? 0), 0),
  };
}

/** Win classification with dust epsilon. Spec: IMPLEMENTATION.md Bab 2.1 */
export function classifyWin(pnlSol: number, epsilonSol = 0.001): boolean | null {
  if (pnlSol > epsilonSol) return true;
  if (pnlSol < -epsilonSol) return false;
  return null; // flat
}
