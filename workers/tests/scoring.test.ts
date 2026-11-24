import { describe, it, expect } from "vitest";
import { wilsonLowerBound } from "../src/scoring/wilson.js";
import { aggregateStats, classifyWin, type PositionLike } from "../src/scoring/aggregateStats.js";
import { evaluateCopyReady, evaluateHardFilters, DEFAULT_SCORING_CONFIG } from "../src/scoring/filters.js";

describe("wilsonLowerBound", () => {
  it("discounts tiny perfect samples below large consistent samples", () => {
    expect(wilsonLowerBound(3, 0)).toBeLessThan(wilsonLowerBound(156, 44));
    expect(wilsonLowerBound(3, 0)).toBeCloseTo(0.44, 1);
    expect(wilsonLowerBound(156, 44)).toBeCloseTo(0.72, 1);
  });
  it("returns 0 for no samples", () => expect(wilsonLowerBound(0, 0)).toBe(0));
});

describe("classifyWin", () => {
  it("treats dust as flat", () => {
    expect(classifyWin(0.0005)).toBeNull();
    expect(classifyWin(0.01)).toBe(true);
    expect(classifyWin(-0.01)).toBe(false);
  });
});

function pos(partial: Partial<PositionLike>): PositionLike {
  const now = new Date();
  return {
    status: "closed", poolAddress: "poolA", closedAt: now, createdAt: now,
    holdMinutes: 60, depositedSol: 1, pnlSol: 0.1, pnlUsd: 15, feesEarnedSol: 0.05,
    isWin: true, ...partial,
  };
}

describe("aggregateStats + filters", () => {
  it("aggregates wins/losses and passes a consistent wallet", () => {
    const positions: PositionLike[] = [];
    for (let i = 0; i < 25; i++)
      positions.push(pos({ poolAddress: `pool${i % 6}`, pnlSol: i % 5 === 4 ? -0.05 : 0.1, isWin: i % 5 !== 4 }));
    const s30 = aggregateStats(positions, 30);
    const s7 = aggregateStats(positions, 7);
    expect(s30.closedCount).toBe(25);
    expect(s30.winRateRaw).toBeCloseTo(0.8);
    expect(evaluateHardFilters(s7, s30, new Date(), DEFAULT_SCORING_CONFIG)).toEqual([]);
  });
  it("rejects a wallet with too few closed positions", () => {
    const s30 = aggregateStats([pos({})], 30);
    const failed = evaluateHardFilters(s30, s30, new Date(), DEFAULT_SCORING_CONFIG);
    expect(failed.some((f) => f.startsWith("closed_30d"))).toBe(true);
  });
  it("rejects a high-win-rate wallet with negative total PnL 30D", () => {
    // 24 small wins (+0.01) wiped out by 1 big loss (-5): WR 96% but pnl -4.76 SOL.
    const positions: PositionLike[] = [];
    for (let i = 0; i < 24; i++)
      positions.push(pos({ poolAddress: `pool${i % 6}`, pnlSol: 0.01, isWin: true }));
    positions.push(pos({ poolAddress: "pool0", pnlSol: -5, isWin: false }));
    const s30 = aggregateStats(positions, 30);
    const s7 = aggregateStats(positions, 7);
    expect(s30.winRateRaw).toBeCloseTo(0.96);
    const failed = evaluateHardFilters(s7, s30, new Date(), DEFAULT_SCORING_CONFIG);
    expect(failed.some((f) => f.startsWith("pnl_30d"))).toBe(true);
  });
});

describe("evaluateCopyReady (aturan user 2026-11-24: tidak aktif 3 hari keluar dari leaderboard)", () => {
  const now = new Date("2026-11-24T02:00:00Z");
  function stats60(openExtra = 0) {
    const positions: PositionLike[] = [];
    for (let i = 0; i < 60; i++)
      positions.push(pos({ poolAddress: `pool${i % 6}`, pnlSol: 0.1, isWin: true, closedAt: now, createdAt: now }));
    for (let i = 0; i < openExtra; i++)
      positions.push(pos({ poolAddress: "pool0", status: "open", closedAt: null, pnlSol: null, isWin: null }));
    return aggregateStats(positions, 30, now);
  }
  it("passes an active wallet that meets the old criteria", () => {
    expect(evaluateCopyReady(stats60(), now, true, now)).toBe(true);
  });
  it("keeps a wallet whose last close is exactly 72h before the snapshot", () => {
    const last = new Date(now.getTime() - 72 * 3_600_000);
    expect(evaluateCopyReady(stats60(), last, true, now)).toBe(true);
  });
  it("drops a wallet idle for more than 72h since its last close", () => {
    const last = new Date(now.getTime() - 72 * 3_600_000 - 1);
    expect(evaluateCopyReady(stats60(), last, true, now)).toBe(false);
  });
  it("drops a wallet that never closed a position", () => {
    expect(evaluateCopyReady(stats60(), null, true, now)).toBe(false);
  });
  it("drops a wallet with more than 2 open positions", () => {
    expect(evaluateCopyReady(stats60(3), now, true, now)).toBe(false);
  });
  it("drops a wallet below 50 closed or failing hard filters", () => {
    const few = aggregateStats([pos({ closedAt: now, createdAt: now })], 30, now);
    expect(evaluateCopyReady(few, now, true, now)).toBe(false);
    expect(evaluateCopyReady(stats60(), now, false, now)).toBe(false);
  });
});
