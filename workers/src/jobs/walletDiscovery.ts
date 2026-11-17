import { prisma } from "@dlmm/db";
import { getPositionOwnersForPool } from "../services/rpc.js";

// Tahap 2 — Wallet Discovery (IMPLEMENTATION.md Bab 6.2). PUBLIC RPC ONLY.
// Sequential, checkpointed, polite: 1 getProgramAccounts per pool, dataSlice 72 bytes.
// Blocked until POSITION_V2.dataSize is verified (services/dlmmDecode.ts throws otherwise).
export async function walletDiscovery(): Promise<{ poolsScanned: number; walletsSeen: number }> {
  const run = await prisma.jobRun.create({ data: { jobName: "walletDiscovery", status: "running" } });
  let poolsScanned = 0;
  const wallets = new Set<string>();
  try {
    const pools = await prisma.pool.findMany({
      where: { isTracked: true },
      orderBy: { feeTvlRatio24h: "desc" },
      select: { address: true },
    });
    const checkpoint = await prisma.scanCheckpoint.findUnique({ where: { jobName: "walletDiscovery" } });
    const startIdx = checkpoint?.cursor ? Math.max(0, pools.findIndex((p) => p.address === checkpoint.cursor)) : 0;

    for (let i = startIdx; i < pools.length; i++) {
      const pool = pools[i]!;
      try {
        const owners = await getPositionOwnersForPool(pool.address);
        for (const o of owners) {
          wallets.add(o.owner);
          await prisma.wallet.upsert({
            where: { address: o.owner },
            create: { address: o.owner, lastActiveAt: new Date() },
            update: { lastActiveAt: new Date() },
          });
          // TODO(Sprint-1): upsert the open Position row itself once position account
          // decoding beyond the 72-byte slice is implemented (needs a second, targeted read).
        }
        await prisma.pool.update({ where: { address: pool.address }, data: { lastScannedAt: new Date() } });
        poolsScanned++;
      } catch (err) {
        // Do NOT treat a failed scan as "no positions". Log, checkpoint past it, retry next run.
        console.error(`[walletDiscovery] pool ${pool.address} failed, will retry next run:`, err);
      }
      const next = pools[i + 1]?.address ?? null;
      await prisma.scanCheckpoint.upsert({
        where: { jobName: "walletDiscovery" },
        create: { jobName: "walletDiscovery", cursor: next },
        update: { cursor: next },
      });
    }
    await prisma.scanCheckpoint.upsert({
      where: { jobName: "walletDiscovery" },
      create: { jobName: "walletDiscovery", cursor: null },
      update: { cursor: null },
    });
    await prisma.jobRun.update({ where: { id: run.id }, data: { status: "done", finishedAt: new Date(),
      detail: { poolsScanned, walletsSeen: wallets.size } } });
    return { poolsScanned, walletsSeen: wallets.size };
  } catch (err) {
    await prisma.jobRun.update({ where: { id: run.id }, data: { status: "failed", finishedAt: new Date(),
      detail: { error: err instanceof Error ? err.message : String(err) } } });
    throw err;
  }
}
