// Central config. HARD RULES (user decisions, do not change silently):
// - Solana RPC: PUBLIC ONLY (https://api.mainnet-beta.solana.com). No API keys, no Helius.
// - No paid LP Agent API. PnL data comes from the free Meteora DLMM Data API.
export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",

  rpcPublicEndpoints: (process.env.RPC_PUBLIC_ENDPOINTS ?? "https://api.mainnet-beta.solana.com")
    .split(",").map((s) => s.trim()).filter(Boolean),
  rpcGpaMinIntervalMs: Number(process.env.RPC_GPA_MIN_INTERVAL_MS ?? 3000),
  rpcGpaConcurrency: Number(process.env.RPC_GPA_CONCURRENCY ?? 1),
  rpcLightMaxRps: Number(process.env.RPC_LIGHT_MAX_RPS ?? 5),

  meteoraApiBase: process.env.METEORA_API_BASE ?? "https://dlmm.datapi.meteora.ag",
  jupiterPriceBase: process.env.JUPITER_PRICE_BASE ?? "https://lite-api.jup.ag/price/v3",

  scanTopPools: Number(process.env.SCAN_TOP_POOLS ?? 50),
  scanIntervalHours: Number(process.env.SCAN_INTERVAL_HOURS ?? 12),
  profilerDailyTarget: Number(process.env.PROFILER_DAILY_TARGET ?? 1000),
  userCapitalSol: Number(process.env.USER_CAPITAL_SOL ?? 10),

  botWebhookUrl: process.env.BOT_WEBHOOK_URL ?? "",
  botWebhookSecret: process.env.BOT_WEBHOOK_SECRET ?? "",
} as const;
