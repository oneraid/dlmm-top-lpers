import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
export async function GET() {
  const db = await getDb();
  if (!db) return NextResponse.json({ data: [] });
  const data = await db.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 50 });
  return NextResponse.json({ data });
}
