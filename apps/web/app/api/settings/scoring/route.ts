import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
export async function GET() {
  const db = await getDb();
  if (!db) return NextResponse.json({ data: {} });
  const rows = await db.scoringConfig.findMany();
  return NextResponse.json({ data: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
}
export async function PUT(req: Request) {
  const updates = (await req.json()) as Record<string, unknown>;
  const db = await getDb();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  // TODO(Sprint-2): validate keys/values against the ScoringConfig schema before saving.
  for (const [key, value] of Object.entries(updates)) {
    await db.scoringConfig.upsert({ where: { key }, create: { key, value: value as object }, update: { value: value as object } });
  }
  return NextResponse.json({ saved: Object.keys(updates) });
}
