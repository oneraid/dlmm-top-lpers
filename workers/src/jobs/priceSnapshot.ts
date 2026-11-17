import { prisma } from "@dlmm/db";
import { getSpotPricesUsd, SOL_MINT, USDC_MINT } from "../services/price.js";

// Every 5 minutes: spot prices for SOL + tokens of tracked pools (IMPLEMENTATION.md Bab 4.2).
export async function priceSnapshot(): Promise<{ mints: number }> {
  const pools = await prisma.pool.findMany({ where: { isTracked: true }, select: { tokenX: true, tokenY: true } });
  const mints = new Set<string>([SOL_MINT, USDC_MINT]);
  for (const p of pools) { if (p.tokenX) mints.add(p.tokenX); if (p.tokenY) mints.add(p.tokenY); }
  const prices = await getSpotPricesUsd([...mints]);
  const at = new Date();
  let n = 0;
  for (const [mint, priceUsd] of Object.entries(prices)) {
    if (!priceUsd) continue;
    await prisma.priceSnapshot.upsert({
      where: { mint_at: { mint, at } },
      create: { mint, at, priceUsd },
      update: { priceUsd },
    });
    n++;
  }
  return { mints: n };
}
