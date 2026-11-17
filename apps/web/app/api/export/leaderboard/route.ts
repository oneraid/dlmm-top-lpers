import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
// GET /api/export/leaderboard?format=json|csv&top=50 — contract for the user's copy-trade bot (Bab 15).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "json";
  const top = Math.min(200, Number(url.searchParams.get("top") ?? 50));
  const db = await getDb();
  const leaders: { rank: number; address: string; winScore: number }[] = [];
  if (db) {
    const snapshot = await db.rankingSnapshot.findFirst({ orderBy: { snapshotAt: "desc" } });
    if (snapshot) {
      const entries = await db.rankingEntry.findMany({
        where: { snapshotId: snapshot.id, passedFilters: true }, orderBy: { rank: "asc" }, take: top,
      });
      for (const e of entries) leaders.push({ rank: e.rank, address: e.walletAddress, winScore: e.winScore });
    }
  }
  const payload = { generatedAt: new Date().toISOString(), mode: "lexicographic", leaders };
  if (format === "csv") {
    const csv = ["rank,address,winScore", ...leaders.map((l) => `${l.rank},${l.address},${l.winScore}`)].join("\n");
    return new NextResponse(csv, { headers: { "content-type": "text/csv" } });
  }
  return NextResponse.json(payload);
}
