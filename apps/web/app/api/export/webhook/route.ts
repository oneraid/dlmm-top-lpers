import { NextResponse } from "next/server";
import { createHmac } from "crypto";
// POST { url, top } — sends the leaderboard payload to the user's bot, HMAC-signed (Bab 15).
// TODO(Sprint-2): read url/secret from settings instead of the request body.
export async function POST(req: Request) {
  const { url, top = 20 } = (await req.json()) as { url: string; top?: number };
  const origin = new URL(req.url).origin;
  const payload = await (await fetch(`${origin}/api/export/leaderboard?format=json&top=${top}`)).json();
  const body = JSON.stringify(payload);
  const secret = process.env.BOT_WEBHOOK_SECRET ?? "";
  const signature = secret ? createHmac("sha256", secret).update(body).digest("hex") : "";
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-signature": signature }, body });
  return NextResponse.json({ sent: res.ok, status: res.status });
}
