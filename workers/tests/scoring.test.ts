import { describe, it, expect } from "vitest";
import { wilsonLowerBound } from "../src/scoring/wilson.js";
import { aggregateStats, classifyWin, type PositionLike } from "../src/scoring/aggregateStats.js";
import { evaluateHardFilters, DEFAULT_SCORING_CONFIG } from "../src/scoring/filters.js";

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
});
