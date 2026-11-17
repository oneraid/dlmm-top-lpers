import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
export async function GET(req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const db = await getDb();
  if (!db) return NextResponse.json({ data: [] });
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "closed";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = 50;
  const data = await db.position.findMany({
    where: { walletAddress: address, status },
    orderBy: { closedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
  });
  return NextResponse.json({ data });
}
