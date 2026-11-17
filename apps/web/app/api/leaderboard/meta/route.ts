import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
export async function GET() {
  const db = await getDb();
  if (!db) return NextResponse.json({ snapshotAt: null, totalProfiled: 0, totalPassed: 0 });
  const snapshot = await db.rankingSnapshot.findFirst({ orderBy: { snapshotAt: "desc" } });
  const [totalProfiled, totalPassed] = await Promise.all([
    db.wallet.count(),
    snapshot ? db.rankingEntry.count({ where: { snapshotId: snapshot.id, passedFilters: true } }) : Promise.resolve(0),
  ]);
  return NextResponse.json({ snapshotAt: snapshot?.snapshotAt.toISOString() ?? null, totalProfiled, totalPassed });
}
