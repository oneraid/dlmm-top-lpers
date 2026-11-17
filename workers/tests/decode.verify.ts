// Manual verification for AGENTS.md Tugas #1 — DO NOT run under `npm test`
// (vitest only picks up *.test.ts). Run it where the public RPC is reachable:
//
//   npx tsx tests/decode.verify.ts
//
// Part A (offline): proves POSITION_V2 constants against the @meteora-ag/dlmm
// IDL + the SDK's own filter helpers — no network needed.
// Part B (live, public RPC only): takes up to 10 real PositionV2 accounts from
// each of 3 pools, fetches the full account, and checks that our 72-byte slice
// decode returns the same lb_pair / owner as the SDK's Anchor decode
// (program.account.positionV2.fetch — the same path pool.getPosition() uses).
//
// Target: 20 real positions across 3 pools. The default pools are small on
// purpose (cheap getProgramAccounts responses); if one yields too few
// positions, pass busier pools via SAMPLE_POOLS, e.g. the top SOL-USDC pool
// 5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6:
//   SAMPLE_POOLS=5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6,... npx tsx tests/decode.verify.ts
//
// NOTE: getPositionOwnersForPool filters dataSize 8120, so Part B only sees
// default 70-bin positions. Extended positions (8120 + (width-70)*112 bytes)
// exist — see dlmmDecode.ts caveat — and are a known gap to fix before
// relying on walletDiscovery for wide positions.
import { PublicKey } from "@solana/web3.js";
import { IDL, createProgram, positionLbPairFilter, positionOwnerFilter, positionV2Filter } from "@meteora-ag/dlmm";
import { connection, getAccountInfo, getPositionOwnersForPool } from "../src/services/rpc.js";
import { POSITION_V2, POSITION_V2_DISCRIMINATOR, POSITION_V2_DISCRIMINATOR_B58, decodePositionSlice } from "../src/services/dlmmDecode.js";

const SAMPLE_POOLS = (process.env.SAMPLE_POOLS ??
  [
    "5SHjDACvwtox5nY8kpWNYyaceWjtTG8C6L821D9Gtpjf", // JLP-USDC, TVL ~$10.9k (Meteora API, 2026-11-16)
    "FcgMfW5UTrgviQWABgrTaYYHrb2gBhH98Y3KVE7ujk8m", // MM-SOL, TVL ~$1.9k
    "GKst47T4pTwRiiwjnjSgm2nLwB1wVsYvqH7ZSBzQVxA", // ANT-SOL, TVL ~$5.9k
  ].join(",")).split(",").map((s) => s.trim()).filter(Boolean);

const PER_POOL = Number(process.env.SAMPLE_PER_POOL ?? 10);
const TARGET_TOTAL = 20;

function fail(msg: string): never {
  console.error(`\nFAIL: ${msg}`);
  process.exit(1);
}

// ---------- Part A: constants vs the SDK IDL (offline) ----------
function idlTypeSize(t: any): number {
  const prim: Record<string, number> = { pubkey: 32, u8: 1, u64: 8, i64: 8, i32: 4, u128: 16 };
  if (typeof t === "string") return prim[t] ?? fail(`unknown primitive ${t}`);
  if (t.array) return t.array[1] * idlTypeSize(t.array[0]);
  if (t.defined) {
    const def = (IDL as any).types.find((x: any) => x.name === t.defined.name);
    if (!def) fail(`unknown defined type ${t.defined.name}`);
    return def.type.fields.reduce((a: number, f: any) => a + idlTypeSize(f.type), 0);
  }
  return fail(`unknown IDL type ${JSON.stringify(t)}`);
}

console.log("== Part A: constants vs @meteora-ag/dlmm IDL ==");
const fields = (IDL as any).types.find((t: any) => t.name === "PositionV2").type.fields;
const idlTotal = 8 + fields.reduce((a: number, f: any) => a + idlTypeSize(f.type), 0);
console.log(`IDL PositionV2 total size: ${idlTotal} (POSITION_V2.dataSize = ${POSITION_V2.dataSize})`);
if (idlTotal !== POSITION_V2.dataSize) fail(`dataSize mismatch: IDL says ${idlTotal}`);
if (fields[0].name !== "lb_pair" || fields[1].name !== "owner") fail("IDL field order changed: lb_pair/owner are not first");
const disc = Buffer.from((IDL as any).accounts.find((a: any) => a.name === "PositionV2").discriminator);
if (!disc.equals(POSITION_V2_DISCRIMINATOR)) fail("discriminator mismatch vs IDL");
const pairFilter: any = positionLbPairFilter(new PublicKey(SAMPLE_POOLS[0]));
const ownerFilter: any = positionOwnerFilter(new PublicKey(SAMPLE_POOLS[0]));
const discFilter: any = positionV2Filter();
if (pairFilter.memcmp.offset !== POSITION_V2.lbPairOffset) fail(`SDK lbPair filter offset ${pairFilter.memcmp.offset} != ${POSITION_V2.lbPairOffset}`);
if (ownerFilter.memcmp.offset !== POSITION_V2.ownerOffset) fail(`SDK owner filter offset ${ownerFilter.memcmp.offset} != ${POSITION_V2.ownerOffset}`);
if (discFilter.memcmp.bytes !== POSITION_V2_DISCRIMINATOR_B58) fail("SDK discriminator filter bytes mismatch");
console.log(`offsets confirmed by SDK filters: lb_pair @${POSITION_V2.lbPairOffset}, owner @${POSITION_V2.ownerOffset}, discriminator ${POSITION_V2_DISCRIMINATOR_B58}`);
console.log("Part A OK.\n");

// ---------- Part B: live cross-check vs SDK decode ----------
console.log("== Part B: live cross-check (public RPC) ==");
const program = createProgram(connection);
let total = 0;
for (const pool of SAMPLE_POOLS) {
  const owners = await getPositionOwnersForPool(pool);
  console.log(`pool ${pool}: ${owners.length} default-width positions found`);
  const sample = owners.slice(0, PER_POOL);
  for (const pos of sample) {
    const info = await getAccountInfo(new PublicKey(pos.positionAddress));
    if (!info) fail(`position ${pos.positionAddress} has no account info`);
    const data = info.data as Buffer;
    if (data.length < POSITION_V2.dataSize || (data.length - POSITION_V2.dataSize) % POSITION_V2.extraBytesPerBin !== 0) {
      fail(`position ${pos.positionAddress}: unexpected data length ${data.length}`);
    }
    const slice = decodePositionSlice(data.subarray(0, POSITION_V2.sliceLength));
    const fetched: any = await (program as any).account.positionV2.fetch(new PublicKey(pos.positionAddress));
    if (slice.lbPair.toBase58() !== fetched.lbPair.toBase58()) fail(`lb_pair mismatch on ${pos.positionAddress}`);
    if (slice.owner.toBase58() !== fetched.owner.toBase58()) fail(`owner mismatch on ${pos.positionAddress}`);
    if (slice.owner.toBase58() !== pos.owner) fail(`owner mismatch vs scan result on ${pos.positionAddress}`);
    total++;
  }
  console.log(`  verified ${sample.length} positions in this pool (data length 8120, slice == SDK decode)`);
}
console.log(`\nVerified ${total} real positions across ${SAMPLE_POOLS.length} pools.`);
if (total < TARGET_TOTAL) {
  fail(`only ${total}/${TARGET_TOTAL} positions verified — these pools are too thin. Re-run with busier pools via SAMPLE_POOLS (e.g. SOL-USDC 5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6).`);
}
console.log("Part B OK — decode verified. walletDiscovery may run.");
