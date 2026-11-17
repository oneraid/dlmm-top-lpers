import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
export async function GET() {
  const db = await getDb();
  if (!db) return NextResponse.json({ data: [] });
  return NextResponse.json({ data: await db.watchlistItem.findMany({ orderBy: { addedAt: "desc" } }) });
}
export async function POST(req: Request) {
  const { walletAddress, label, copyRatioHint } = (await req.json()) as { walletAddress: string; label?: string; copyRatioHint?: number };
  const db = await getDb();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const item = await db.watchlistItem.upsert({
    where: { walletAddress }, create: { walletAddress, label, copyRatioHint }, update: { label, copyRatioHint },
  });
  return NextResponse.json(item);
}
export async function DELETE(req: Request) {
  const { walletAddress } = (await req.json()) as { walletAddress: string };
  const db = await getDb();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  await db.watchlistItem.delete({ where: { walletAddress } });
  return NextResponse.json({ deleted: true });
}
