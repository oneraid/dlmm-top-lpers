// Run a single job once, e.g.: npm run job:pools  |  tsx src/run-job.ts walletProfiler
import "./loadEnv.js"; // must stay first: loads repo-root .env before Prisma is constructed
import { poolDiscovery, walletDiscovery, walletProfilerBatch, scoringRun, priceSnapshot } from "./jobs/index.js";

const name = process.argv[2];
const jobs: Record<string, () => Promise<unknown>> = {
  poolDiscovery,
  walletDiscovery,
  walletProfiler: () => walletProfilerBatch(50),
  scoringRun,
  priceSnapshot,
};
const job = jobs[name ?? ""];
if (!job) { console.error(`Unknown job "${name}". Known: ${Object.keys(jobs).join(", ")}`); process.exit(1); }
console.log(await job());
process.exit(0);
