// Shared UI/API types — mirrors IMPLEMENTATION.md Bab 7 response shapes.
export interface WindowStatView {
  closed: number;
  winRateRaw: number;
  winRateAdj: number;
  pnlSol: number;
  pnlUsd?: number;
  feesEarnedSol?: number;
  feeShare?: number;
  evPerPositionSol?: number;
  profitFactor?: number | null;
  medianHoldMinutes?: number;
  distinctPools?: number;
}

export interface LeaderboardEntryView {
  rank: number;
  address: string;
  winScore: number;
  compositeScore?: number | null;
  stats7: WindowStatView;
  stats30: WindowStatView;
  flags: string[];
  lastActiveAt: string | null;
}

export interface LeaderboardResponse {
  snapshotAt: string | null;
  totalProfiled: number;
  totalPassed: number;
  data: LeaderboardEntryView[];
}
