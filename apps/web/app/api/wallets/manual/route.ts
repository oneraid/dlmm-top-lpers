import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export async function POST(req: Request) {
  const { address, label } = (await req.json()) as { address?: string; label?: string };
  if (!address || !BASE58.test(address)) return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  const db = await getDb();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  await db.wallet.upsert({ where: { address }, create: { address, profileStatus: "queued", notes: label ?? null }, update: {} });
  return NextResponse.json({ queued: true, address });
}
