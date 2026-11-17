import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// GET /api/leaderboard?mode=&page=&pageSize=&minClosed30=&minPnlSol30=&q=
// TODO(Sprint-1): honour all filter params (currently returns latest snapshot, passed only).
export async function GET(req: Request) {
  const db = await getDb();
  if (!db) return NextResponse.json({ snapshotAt: null, totalProfiled: 0, totalPassed: 0, data: [] });
  const url = new URL(req.url);
  const pageSize = Math.min(200, Number(url.searchParams.get("pageSize") ?? 50));
  const snapshot = await db.rankingSnapshot.findFirst({ orderBy: { snapshotAt: "desc" } });
  if (!snapshot) return NextResponse.json({ snapshotAt: null, totalProfiled: 0, totalPassed: 0, data: [] });
  const [entries, totalProfiled] = await Promise.all([
    db.rankingEntry.findMany({ where: { snapshotId: snapshot.id, passedFilters: true }, orderBy: { rank: "asc" }, take: pageSize }),
    db.wallet.count(),
  ]);
  return NextResponse.json({
    snapshotAt: snapshot.snapshotAt.toISOString(), totalProfiled, totalPassed: entries.length,
    data: entries.map((e) => ({ rank: e.rank, address: e.walletAddress, winScore: e.winScore, compositeScore: e.compositeScore })),
  });
}
