import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const db = await getDb();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const wallet = await db.wallet.findUnique({ where: { address }, include: { stats: true } });
  if (!wallet) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(wallet);
}
