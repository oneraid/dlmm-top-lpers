import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
export async function GET(req: Request) {
  const addresses = (new URL(req.url).searchParams.get("addresses") ?? "").split(",").filter(Boolean).slice(0, 4);
  const db = await getDb();
  if (!db || !addresses.length) return NextResponse.json({ data: [] });
  const data = await db.wallet.findMany({ where: { address: { in: addresses } }, include: { stats: true } });
  return NextResponse.json({ data });
}
