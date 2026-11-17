import { PublicKey } from "@solana/web3.js";

// DLMM (lb_clmm) program + PositionV2 account layout.
//
// VERIFIED 2026-11-16 against @meteora-ag/dlmm v1.9.0 (the SDK version pinned in
// workers/package.json) — three independent routes, all agreeing:
//  1. IDL field-size arithmetic: 8 (discriminator) + 32 (lb_pair) + 32 (owner)
//     + 70x16 (liquidity_shares [u128;70]) + 70x48 (reward_infos [UserRewardInfo;70],
//     2xu128 + 2xu64) + 70x48 (fee_infos [FeeInfo;70], 2xu128 + 2xu64)
//     + 4 + 4 + 8 + 8 + 8 + 16 (lower/upper bin, last_updated_at, claimed fees,
//     claimed rewards [u64;2]) + 32 (operator) + 8 (lock_release_point)
//     + 1 (_padding_0) + 32 (fee_owner) + 87 (_reserved) = **8120 bytes**.
//  2. SDK constants: POSITION_MIN_SIZE = 8112, POSITION_BIN_DATA_SIZE = 112,
//     calculatePositionSize(70) = 8112, calculatePositionSize(140) = 15952
//     (= 8112 + 70*112); SDK code reads extended data at `8 + POSITION_MIN_SIZE`.
//  3. A synthetic 8120-byte account decodes correctly through the SDK's own
//     Anchor coder (decodeAccount(program, "positionV2", ...)): lb_pair and
//     owner come back identical to the bytes written at offsets 8 and 40.
//  Offsets are also confirmed by the SDK's own filters: positionLbPairFilter
//  memcmp offset 8, positionOwnerFilter memcmp offset 40 (= 8 + 32).
//
// CAVEAT — extended positions: a position wider than the default 70 bins is
// LONGER than 8120 bytes: size = 8120 + (width - 70) * 112, up to
// POSITION_MAX_LENGTH 1400 bins. A getProgramAccounts filter of
// `dataSize: 8120` therefore finds only default-width positions and MISSES
// wide positions. If wide positions must be found, drop the dataSize filter
// and rely on the discriminator + lb_pair memcmp filters instead (see
// services/rpc.ts). The live 20-position cross-check against
// pool.getPosition() (AGENTS.md Tugas #1, step 2) is still pending — it needs
// a network path to the public RPC, which this run's sandbox blocks.
export const DLMM_PROGRAM_ID = new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");

// Anchor discriminator of the PositionV2 account, from the SDK IDL:
// [117, 176, 212, 199, 245, 180, 133, 182] — bs58 "LgkNAEYaVX3".
export const POSITION_V2_DISCRIMINATOR = Buffer.from([117, 176, 212, 199, 245, 180, 133, 182]);
export const POSITION_V2_DISCRIMINATOR_B58 = "LgkNAEYaVX3";

export const POSITION_V2 = {
  // Total account size for a default 70-bin position: 8 + 8112 (see above).
  dataSize: 8120,
  // Base struct size without the 8-byte discriminator (SDK POSITION_MIN_SIZE).
  baseSize: 8112,
  // Extra bytes per bin beyond the default 70 (SDK POSITION_BIN_DATA_SIZE).
  extraBytesPerBin: 112,
  defaultBinCount: 70,
  lbPairOffset: 8, // right after the 8-byte Anchor discriminator
  ownerOffset: 40, // 8 + 32 (lb_pair)
  sliceLength: 72, // discriminator + lb_pair + owner — all wallet discovery needs
} as const;

/** Decode owner (and lb_pair) from a 72-byte dataSlice of a PositionV2 account. */
export function decodePositionSlice(data: Buffer): { lbPair: PublicKey; owner: PublicKey } {
  if (data.length < POSITION_V2.sliceLength) throw new Error(`Position slice too short: ${data.length}`);
  return {
    lbPair: new PublicKey(data.subarray(POSITION_V2.lbPairOffset, POSITION_V2.lbPairOffset + 32)),
    owner: new PublicKey(data.subarray(POSITION_V2.ownerOffset, POSITION_V2.ownerOffset + 32)),
  };
}
