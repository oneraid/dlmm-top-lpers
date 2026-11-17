import { config } from "../config.js";

// Jupiter Price API (lite, no key) for spot prices. Historical prices come from our own
// price_snapshots table (written by the priceSnapshot job) — never revalue old closes with today's price.
export async function getSpotPricesUsd(mints: string[]): Promise<Record<string, number>> {
  if (mints.length === 0) return {};
  const url = `${config.jupiterPriceBase}?ids=${mints.join(",")}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Jupiter price API ${res.status}`);
  const json = (await res.json()) as Record<string, { usdPrice?: number; price?: number }>;
  const out: Record<string, number> = {};
  for (const [mint, v] of Object.entries(json)) out[mint] = v.usdPrice ?? v.price ?? 0;
  return out;
}

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
