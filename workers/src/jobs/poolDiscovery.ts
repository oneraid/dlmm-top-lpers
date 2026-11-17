import { prisma } from "@dlmm/db";
import { config } from "../config.js";
import { listPools, type MeteoraPool } from "../services/meteora.js";

// Tahap 1 — Pool Discovery (IMPLEMENTATION.md Bab 6.1). Runs hourly.
export async function poolDiscovery(): Promise<{ pools: number; tracked: number }> {
  const run = await prisma.jobRun.create({ data: { jobName: "poolDiscovery", status: "running" } });
  try {
    const seen: MeteoraPool[] = [];
    let page = 1;
    for (;;) {
      const res = await listPools({ page, pageSize: 100 });
      seen.push(...res.data);
      if (page >= res.pages || seen.length >= 1000) break;
      page++;
    }
    for (const p of seen) {
      await prisma.pool.upsert({
        where: { address: p.address },
        create: {
          address: p.address, name: p.name,
          tokenX: p.token_x.address, tokenY: p.token_y.address,
          binStep: p.pool_config.bin_step, baseFeePct: p.pool_config.base_fee_pct,
          tvlUsd: p.tvl ?? 0, volume24hUsd: p.volume?.["24h"] ?? 0,
          fees24hUsd: p.fees?.["24h"] ?? 0, feeTvlRatio24h: p.fee_tvl_ratio?.["24h"] ?? 0,
          isBlacklisted: p.is_blacklisted ?? false,
        },
        update: {
          tvlUsd: p.tvl ?? 0, volume24hUsd: p.volume?.["24h"] ?? 0,
          fees24hUsd: p.fees?.["24h"] ?? 0, feeTvlRatio24h: p.fee_tvl_ratio?.["24h"] ?? 0,
          isBlacklisted: p.is_blacklisted ?? false,
        },
      });
    }
    // Mark Top N as tracked (MVP rule; Sprint-2 adds the "2 of last 3 runs" consistency rule).
    const top = await prisma.pool.findMany({
      where: { isBlacklisted: false },
      orderBy: { feeTvlRatio24h: "desc" },
      take: config.scanTopPools,
      select: { address: true },
    });
    await prisma.pool.updateMany({ data: { isTracked: false } });
    await prisma.pool.updateMany({
      where: { address: { in: top.map((t) => t.address) } },
      data: { isTracked: true },
    });
    await prisma.jobRun.update({ where: { id: run.id }, data: { status: "done", finishedAt: new Date(),
      detail: { pools: seen.length, tracked: top.length } } });
    return { pools: seen.length, tracked: top.length };
  } catch (err) {
    await prisma.jobRun.update({ where: { id: run.id }, data: { status: "failed", finishedAt: new Date(),
      detail: { error: err instanceof Error ? err.message : String(err) } } });
    throw err;
  }
}
