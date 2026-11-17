import Bottleneck from "bottleneck";
import { config } from "../config.js";

// THE single Meteora DLMM Data API client. Free, no API key, shared 30 RPS limit.
// ALL calls to dlmm.datapi.meteora.ag must go through here (IMPLEMENTATION.md Bab 3.1).
const limiter = new Bottleneck({
  reservoir: 25,
  reservoirRefreshAmount: 25,
  reservoirRefreshInterval: 1000, // stay safely under the shared 30 RPS
  maxConcurrent: 10,
});

async function fetchWithRetry(url: string, attempt = 0): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 4) throw new Error(`Meteora API ${res.status} for ${url}`);
    const backoff = Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500;
    await new Promise((r) => setTimeout(r, backoff));
    return fetchWithRetry(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`Meteora API ${res.status} for ${url}`);
  return res.json();
}

export function meteoraGet<T>(path: string): Promise<T> {
  return limiter.schedule(() => fetchWithRetry(`${config.meteoraApiBase}${path}`)) as Promise<T>;
}

// --- Typed wrappers (shapes per Swagger at https://dlmm.datapi.meteora.ag/swagger-ui/ ) ---
// NOTE: keep these loose until the Sprint-0 contract test pins the exact production shapes.

export interface MeteoraPool {
  address: string;
  name: string;
  token_x: { address: string; symbol: string };
  token_y: { address: string; symbol: string };
  pool_config: { bin_step: number; base_fee_pct: number };
  tvl: number;
  volume: Record<string, number>;
  fees: Record<string, number>;
  fee_tvl_ratio: Record<string, number>;
  is_blacklisted: boolean;
}

export interface PoolsPage { total: number; pages: number; current_page: number; data: MeteoraPool[] }

export function listPools(params: {
  page: number; pageSize: number; sortBy?: string; filterBy?: string; query?: string;
}): Promise<PoolsPage> {
  const q = new URLSearchParams({
    page: String(params.page),
    page_size: String(params.pageSize),
    sort_by: params.sortBy ?? "fee_tvl_ratio_24h:desc",
    filter_by: params.filterBy ?? "is_blacklisted=false && volume_24h>=50000",
  });
  if (params.query) q.set("query", params.query);
  return meteoraGet<PoolsPage>(`/pools?${q.toString()}`);
}

export function getPortfolio(user: string, open: boolean): Promise<unknown> {
  return meteoraGet(open ? `/portfolio/open?user=${user}` : `/portfolio?user=${user}`);
}

export function getPortfolioTotal(user: string): Promise<unknown> {
  return meteoraGet(`/portfolio/total?user=${user}`);
}

/** Core profiler call: per-position PnL for one wallet in one pool. */
export function getPositionPnl(poolAddress: string, user: string, status: "open" | "closed"): Promise<unknown> {
  return meteoraGet(`/positions/${poolAddress}/pnl?user=${user}&status=${status}`);
}

export function getPositionHistorical(positionAddress: string): Promise<unknown> {
  return meteoraGet(`/positions/${positionAddress}/historical`);
}

export function getTotalClaims(wallet: string, poolAddress: string): Promise<unknown> {
  return meteoraGet(`/wallets/${wallet}/pools/${poolAddress}/total_claims`);
}

export function getProtocolMetrics(): Promise<unknown> {
  return meteoraGet(`/stats/protocol_metrics`);
}
