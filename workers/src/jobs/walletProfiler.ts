import { prisma } from "@dlmm/db";
import { getPortfolio, getPositionPnl } from "../services/meteora.js";
import { aggregateStats, classifyWin, type PositionLike } from "../scoring/aggregateStats.js";
import { DEFAULT_SCORING_CONFIG } from "../scoring/filters.js";

// Tahap 3 — Wallet Profiler (IMPLEMENTATION.md Bab 6.3).
// For one wallet: pull closed+open position PnL per pool from the Meteora Data API,
// upsert positions, then recompute 7/30/90 window stats.
// NOTE: response shapes of /portfolio and /positions/{pool}/pnl must be pinned by the
// Sprint-0 contract test; the normalisers below are deliberately defensive (TODO markers).
interface RawPositionPnl {
  address?: string;
  positionAddress?: string;
  createdAt?: number;
  closedAt?: number;
  pnlSol?: string | number;
  pnlUsd?: string | number;
  pnlPctChange?: string | number;
  allTimeFees?: {
    total?: { sol?: number | string; usd?: number | string };
    totalSol?: number | string;
  } | number;
  allTimeDeposits?: {
    total?: { sol?: number | string; usd?: number | string };
  };
  lowerBinId?: number;
  upperBinId?: number;
  totalXAmount?: number;
  totalYAmount?: number;
}

function num(v: string | number | undefined): number {
  return v == null ? 0 : Number(v);
}

function toDate(ts: number | undefined): Date | null {
  if (!ts) return null;
  return new Date(ts < 100_000_000_000 ? ts * 1000 : ts);
}

export async function profileWallet(walletAddress: string): Promise<void> {
  await prisma.wallet.update({ where: { address: walletAddress }, data: { profileStatus: "profiling" } });
  try {
    const closedPortfolio = (await getPortfolio(walletAddress, false)) as {
      pools?: { poolAddress?: string; address?: string }[];
    } | undefined;
    const openPortfolio = (await getPortfolio(walletAddress, true)) as {
      pools?: { poolAddress?: string; address?: string }[];
    } | undefined;

    const poolAddrs = new Set<string>();
    for (const p of closedPortfolio?.pools ?? []) {
      const addr = p.poolAddress || p.address;
      if (addr) poolAddrs.add(addr);
    }
    for (const p of openPortfolio?.pools ?? []) {
      const addr = p.poolAddress || p.address;
      if (addr) poolAddrs.add(addr);
    }

    for (const poolAddr of poolAddrs) {
      // Pool row may not exist yet if the wallet was added manually.
      await prisma.pool.upsert({
        where: { address: poolAddr },
        create: { address: poolAddr, name: "UNKNOWN", tokenX: "", tokenY: "", binStep: 0, baseFeePct: 0 },
        update: {},
      });
      for (const status of ["closed", "open"] as const) {
        const raw = (await getPositionPnl(poolAddr, walletAddress, status)) as
          | { positions?: RawPositionPnl[] }
          | RawPositionPnl[];
        const list: RawPositionPnl[] = Array.isArray(raw) ? raw : raw?.positions ?? [];
        for (const rp of list) {
          const posAddr = rp.positionAddress || rp.address;
          if (!posAddr) continue;

          const pnlSol = num(rp.pnlSol);
          const createdAt = toDate(rp.createdAt) ?? new Date();
          const closedAt = status === "closed" ? toDate(rp.closedAt) : null;

          let fees = 0;
          if (typeof rp.allTimeFees === "number") {
            fees = rp.allTimeFees;
          } else if (rp.allTimeFees?.total?.sol != null) {
            fees = num(rp.allTimeFees.total.sol);
          } else if (rp.allTimeFees?.totalSol != null) {
            fees = num(rp.allTimeFees.totalSol);
          }

          const depositedSol = num(rp.allTimeDeposits?.total?.sol);

          await prisma.position.upsert({
            where: { address: posAddr },
            create: {
              address: posAddr,
              walletAddress,
              poolAddress: poolAddr,
              status,
              lowerBinId: rp.lowerBinId ?? 0,
              upperBinId: rp.upperBinId ?? 0,
              createdAt,
              closedAt,
              holdMinutes: closedAt ? Math.max(0, (closedAt.getTime() - createdAt.getTime()) / 60000) : null,
              depositedSol: depositedSol > 0 ? depositedSol : null,
              feesEarnedSol: fees,
              pnlSol,
              pnlUsd: num(rp.pnlUsd),
              pnlPct: num(rp.pnlPctChange),
              isWin: status === "closed" ? classifyWin(pnlSol, DEFAULT_SCORING_CONFIG.pnlEpsilonSol) : null,
              rawPayload: rp as object,
            },
            update: {
              status,
              closedAt,
              depositedSol: depositedSol > 0 ? depositedSol : null,
              feesEarnedSol: fees,
              pnlSol,
              pnlUsd: num(rp.pnlUsd),
              isWin: status === "closed" ? classifyWin(pnlSol, DEFAULT_SCORING_CONFIG.pnlEpsilonSol) : null,
              rawPayload: rp as object,
            },
          });
        }
      }
    }

    // Recompute window stats from DB positions (single source of truth).
    const dbPositions = await prisma.position.findMany({ where: { walletAddress } });
    const likes: PositionLike[] = dbPositions.map((p) => ({
      status: p.status as "open" | "closed", poolAddress: p.poolAddress,
      closedAt: p.closedAt, createdAt: p.createdAt, holdMinutes: p.holdMinutes,
      depositedSol: p.depositedSol, pnlSol: p.pnlSol, pnlUsd: p.pnlUsd,
      feesEarnedSol: p.feesEarnedSol, isWin: p.isWin,
    }));
    const now = new Date();
    for (const days of [7, 30, 90]) {
      const s = aggregateStats(likes, days, now);
      await prisma.walletWindowStat.upsert({
        where: { walletAddress_windowDays: { walletAddress, windowDays: days } },
        create: { walletAddress, ...s, profitFactor: s.profitFactor, computedAt: now },
        update: { ...s, profitFactor: s.profitFactor, computedAt: now },
      });
    }
    const lastActive = dbPositions.reduce<Date | null>((acc, p) => {
      const t = p.closedAt ?? p.createdAt;
      return !acc || t > acc ? t : acc;
    }, null);
    await prisma.wallet.update({
      where: { address: walletAddress },
      data: { profileStatus: "done", profiledAt: now, lastActiveAt: lastActive },
    });
  } catch (err) {
    await prisma.wallet.update({ where: { address: walletAddress }, data: { profileStatus: "failed" } });
    throw err;
  }
}

/** Drain a batch of queued wallets (priority ordering added in Sprint-1: watchlist first). */
export async function walletProfilerBatch(limit = 50): Promise<{ profiled: number }> {
  const queued = await prisma.wallet.findMany({
    where: { profileStatus: { in: ["queued", "stale"] } },
    orderBy: { firstSeenAt: "asc" },
    take: limit,
    select: { address: true },
  });
  let ok = 0;
  for (const w of queued) {
    try { await profileWallet(w.address); ok++; }
    catch (err) { console.error(`[walletProfiler] ${w.address} failed:`, err); }
  }
  return { profiled: ok };
}
