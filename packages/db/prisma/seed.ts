import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Default scoring config — IMPLEMENTATION.md Bab 2.5. Editable later via UI Settings.
const DEFAULTS: Record<string, unknown> = {
  minClosed30d: 20,
  minClosed7d: 3,
  maxLastActiveDays: 7,
  minFeeShare: 0.10,
  maxTopTradeShare: 0.35,
  minDistinctPools30d: 5,
  minAvgHoldMinutes: 12,
  warnAvgHoldMinutes: 18,
  pnlEpsilonSol: 0.001,
  winScoreWeight7d: 0.4,
  winScoreWeight30d: 0.6,
  rankingMode: "lexicographic",
};

async function main() {
  for (const [key, value] of Object.entries(DEFAULTS)) {
    await prisma.scoringConfig.upsert({
      where: { key },
      create: { key, value: value as object },
      update: {}, // never overwrite user edits on re-seed
    });
  }
  console.log("Seeded scoring_config defaults:", Object.keys(DEFAULTS).join(", "));
}

main().finally(() => prisma.$disconnect());
