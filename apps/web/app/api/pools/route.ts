import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
export async function GET(req: Request) {
  const db = await getDb();
  if (!db) return NextResponse.json({ data: [] });
  const sort = new URL(req.url).searchParams.get("sort") ?? "feeTvl";
  const orderBy = sort === "volume" ? { volume24hUsd: "desc" as const }
    : sort === "tvl" ? { tvlUsd: "desc" as const } : { feeTvlRatio24h: "desc" as const };
  const data = await db.pool.findMany({ orderBy, take: 200 });
  return NextResponse.json({ data });
}
