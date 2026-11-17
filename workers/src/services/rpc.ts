import { Connection, PublicKey, type GetProgramAccountsFilter } from "@solana/web3.js";
import Bottleneck from "bottleneck";
import { config } from "../config.js";
import { DLMM_PROGRAM_ID, POSITION_V2, decodePositionSlice } from "./dlmmDecode.js";

// PUBLIC RPC ONLY (user decision). We are guests on shared infrastructure:
// - getProgramAccounts: max 1 concurrent, min interval from config (default 3s), exponential backoff on 429.
// - Never call getProgramAccounts without filters. Never parallelise pool scans.
// Docs: IMPLEMENTATION.md Bab 3.2
const endpoint = config.rpcPublicEndpoints[0] ?? "https://api.mainnet-beta.solana.com";
export const connection = new Connection(endpoint, "confirmed");

const gpaLimiter = new Bottleneck({
  maxConcurrent: config.rpcGpaConcurrency,
  minTime: config.rpcGpaMinIntervalMs,
});
const lightLimiter = new Bottleneck({ maxConcurrent: 5, minTime: 1000 / config.rpcLightMaxRps });

async function withBackoff<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const retriable = msg.includes("429") || msg.includes("Too Many Requests") || msg.includes("timeout");
    if (!retriable || attempt >= 3) throw err;
    const wait = [30_000, 120_000, 600_000][attempt] ?? 600_000;
    console.warn(`[rpc] retriable error (${msg.slice(0, 120)}), backing off ${wait}ms`);
    await new Promise((r) => setTimeout(r, wait));
    return withBackoff(fn, attempt + 1);
  }
}

export interface PoolPositionOwner { positionAddress: string; owner: string }

/**
 * Find all PositionV2 owners in ONE pool, using ONE getProgramAccounts call
 * with a 72-byte dataSlice (we only need the owner field).
 */
export async function getPositionOwnersForPool(poolAddress: string): Promise<PoolPositionOwner[]> {
  if (!POSITION_V2.dataSize) {
    throw new Error(
      "POSITION_V2.dataSize is not verified yet. Complete the Sprint-0 decode verification (Bab 3.2) before scanning.",
    );
  }
  const filters: GetProgramAccountsFilter[] = [
    { dataSize: POSITION_V2.dataSize },
    { memcmp: { offset: POSITION_V2.lbPairOffset, bytes: poolAddress } },
  ];
  const accounts = await gpaLimiter.schedule(() =>
    withBackoff(() =>
      connection.getProgramAccounts(DLMM_PROGRAM_ID, {
        filters,
        dataSlice: { offset: 0, length: POSITION_V2.sliceLength },
        encoding: "base64",
        commitment: "confirmed",
      }),
    ),
  );
  return accounts.map(({ pubkey, account }) => ({
    positionAddress: pubkey.toBase58(),
    owner: decodePositionSlice(account.data as Buffer).owner.toBase58(),
  }));
}

export function getAccountInfo(pubkey: PublicKey) {
  return lightLimiter.schedule(() => connection.getAccountInfo(pubkey, "confirmed"));
}

export function getSlot() {
  return lightLimiter.schedule(() => connection.getSlot("confirmed"));
}
