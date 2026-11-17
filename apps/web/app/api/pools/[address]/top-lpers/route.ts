import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
// Top LPers within ONE pool, from our own positions/stats — never from the paid LP Agent API.
export async function GET(req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const db = await getDb();
  if (!db) return NextResponse.json({ data: [] });
  const days = Number(new URL(req.url).searchParams.get("days") ?? 30);
  const since = new Date(Date.now() - days * 86_400_000);
  const grouped = await db.position.groupBy({
    by: ["walletAddress"],
    where: { poolAddress: address, status: "closed", closedAt: { gte: since } },
    _sum: { pnlSol: true }, _count: { _all: true },
    orderBy: { _sum: { pnlSol: "desc" } }, take: 50,
  });
  return NextResponse.json({ data: grouped.map((g) => ({ wallet: g.walletAddress, closed: g._count._all, pnlSol: g._sum.pnlSol ?? 0 })) });
}
