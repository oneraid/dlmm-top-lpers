import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
// Marks the wallet stale so the profiler batch picks it up with priority.
// TODO(Sprint-1): push a BullMQ job directly instead of relying on the batch poller.
export async function POST(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const db = await getDb();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  await db.wallet.upsert({ where: { address }, create: { address, profileStatus: "queued" }, update: { profileStatus: "stale" } });
  return NextResponse.json({ queued: true, address });
}
