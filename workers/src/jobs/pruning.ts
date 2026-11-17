import { prisma } from "@dlmm/db";

// Daily housekeeping: raw payloads are heavy — keep 30 days (IMPLEMENTATION.md Bab 4.1).
export async function pruning(): Promise<{ cleared: number }> {
  const cutoff = new Date(Date.now() - 30 * 86_400_000);
  const res = await prisma.position.updateMany({
    where: { createdAt: { lt: cutoff }, rawPayload: { not: undefined } },
    data: { rawPayload: undefined },
  });
  return { cleared: res.count };
}
