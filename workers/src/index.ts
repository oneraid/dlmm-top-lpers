import "./loadEnv.js"; // must stay first: loads repo-root .env before Prisma/config are read
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { config } from "./config.js";
import { poolDiscovery, walletDiscovery, walletProfilerBatch, scoringRun, priceSnapshot, pruning } from "./jobs/index.js";

// Worker bootstrap: BullMQ queues + repeatable (scheduled) jobs.
// Schedules: IMPLEMENTATION.md Bab 4.2 (wallet discovery adapted to public RPC limits).
const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

const handlers: Record<string, () => Promise<unknown>> = {
  poolDiscovery, walletDiscovery, scoringRun, priceSnapshot, pruning,
  walletProfiler: () => walletProfilerBatch(50),
};

async function main() {
  for (const name of Object.keys(handlers)) {
    const queue = new Queue(name, { connection });
    await queue.drain(true).catch(() => undefined);
    new Worker(name, async () => handlers[name]!(), { connection });
  }
  const schedule = async (name: string, patternOrEvery: string | number) => {
    const q = new Queue(name, { connection });
    await q.add(name, {}, {
      repeat: typeof patternOrEvery === "number" ? { every: patternOrEvery } : { pattern: patternOrEvery },
      jobId: `repeat:${name}`,
    });
  };
  await schedule("priceSnapshot", 5 * 60_000);
  await schedule("poolDiscovery", 60 * 60_000);
  await schedule("walletDiscovery", config.scanIntervalHours * 60 * 60_000);
  await schedule("walletProfiler", 10 * 60_000);
  await schedule("scoringRun", 60 * 60_000);
  await schedule("pruning", "0 3 * * *");
  console.log("[worker] queues + schedules registered (public RPC only, Meteora API free).");
}

main().catch((err) => { console.error(err); process.exit(1); });
