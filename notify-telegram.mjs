#!/usr/bin/env node
// notify-telegram.mjs — kirim ringkasan snapshot DLMM Top LPers ke Telegram.
//
// Dipanggil run-pipeline.sh setelah job scoring selesai (dan bisa dijalankan
// manual: `node notify-telegram.mjs`). Membaca konfigurasi dari .env di
// direktori yang sama (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, DATABASE_URL).
// Tanpa token/chat id, script keluar diam-diam (exit 0) supaya pipeline
// tidak pernah gagal gara-gara notifikasi.
//
// Isi pesan: jumlah wallet di-skor, lolos filter, copy-ready, dan 10
// copy-ready teratas berdasarkan win rate (Wilson-adjusted) 30 hari +
// status daily-green. Copy-ready dibaca dari flag ranking_entries.copy_ready
// yang dihitung scoring engine (definisi tunggal di workers/src/scoring/
// filters.ts): lolos filter + PnL > 0 + >= 50 posisi closed + <= 2 posisi
// open + masih aktif (ada posisi close dalam 72 jam terakhir sebelum
// snapshot — aturan user 2026-11-24: tidak aktif 3 hari keluar dari
// leaderboard).
// Tiap wallet di top 10 diberi tanda gerak rank vs snapshot sebelumnya:
// 🆕 NEW (baru masuk top 10), ⬆️n naik n peringkat, ⬇️n turun n peringkat,
// ➡️ rank tetap. Rank snapshot sebelumnya dibaca dari statistik frozen
// (snapshot_wallet_stats, tersedia sejak snapshot 32) bila ada, fallback ke
// statistik live — sama seperti daftar utama.

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const env = { ...process.env };
  const path = join(ROOT, ".env");
  if (existsSync(path)) {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim();
    }
  }
  return env;
}

function findPsql() {
  const candidates = [
    "psql",
    join(process.env.HOME ?? "", "workspace/monitored-projects/.pgbin/usr/lib/postgresql/16/bin/psql"),
    "/usr/lib/postgresql/16/bin/psql",
  ];
  for (const c of candidates) {
    try {
      execFileSync(c, ["--version"], { stdio: "pipe" });
      return c;
    } catch {
      /* coba kandidat berikutnya */
    }
  }
  return null;
}

function queryJson(psql, dbUrl, sql) {
  const out = execFileSync(psql, [dbUrl, "-t", "-A", "-c", sql], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(out.trim());
}

const SQL = `
SELECT json_build_object(
  'snapshot_id', s.id,
  'snapshot_at', to_char(s.snapshot_at, 'YYYY-MM-DD HH24:MI'),
  'scored', (SELECT COUNT(*) FROM ranking_entries e WHERE e.snapshot_id = s.id),
  'passed', (SELECT COUNT(*) FROM ranking_entries e WHERE e.snapshot_id = s.id AND e.passed_filters),
  'copy_ready', (
    SELECT COUNT(*) FROM ranking_entries e
    WHERE e.snapshot_id = s.id AND e.copy_ready
  ),
  'top', (
    SELECT json_agg(t ORDER BY t.win_score DESC) FROM (
      SELECT e.wallet_address,
             ROUND((w.win_rate_adj * 100)::numeric, 1) AS win_score,
             ROUND((w.win_rate_raw * 100)::numeric, 1) AS wr_raw,
             w.wins, w.losses, w.flats,
             ROUND(w.pnl_sol::numeric, 2) AS pnl_sol,
             w.open_count,
             dg.green_days, dg.total_days
      FROM ranking_entries e
      JOIN wallet_window_stats w ON w.wallet_address = e.wallet_address AND w.window_days = 30
      LEFT JOIN (
        SELECT wallet_address,
               COUNT(*) AS total_days,
               COUNT(*) FILTER (WHERE day_pnl > 0) AS green_days
        FROM (
          SELECT wallet_address,
                 DATE(closed_at AT TIME ZONE 'Asia/Jakarta') AS d,
                 SUM(pnl_sol) AS day_pnl
          FROM positions
          WHERE closed_at >= NOW() - INTERVAL '30 days' AND pnl_sol IS NOT NULL
          GROUP BY wallet_address, DATE(closed_at AT TIME ZONE 'Asia/Jakarta')
        ) per_day
        GROUP BY wallet_address
      ) dg ON dg.wallet_address = e.wallet_address
      WHERE e.snapshot_id = s.id AND e.copy_ready
      ORDER BY w.win_rate_adj DESC
      LIMIT 10
    ) t
  ),
  'prev_top', (
    SELECT json_agg(p.wallet_address ORDER BY p.win_score DESC) FROM (
      SELECT e.wallet_address,
             COALESCE(f.win_rate_adj, w.win_rate_adj) AS win_score
      FROM ranking_entries e
      JOIN wallet_window_stats w ON w.wallet_address = e.wallet_address AND w.window_days = 30
      LEFT JOIN snapshot_wallet_stats f
        ON f.snapshot_id = e.snapshot_id AND f.wallet_address = e.wallet_address AND f.window_days = 30
      WHERE e.snapshot_id = (SELECT MAX(id) FROM ranking_snapshots WHERE id < s.id)
        AND e.copy_ready
      ORDER BY win_score DESC
      LIMIT 10
    ) p
  )
)
FROM ranking_snapshots s
WHERE s.id = (SELECT MAX(id) FROM ranking_snapshots);
`;

function fmt(n) {
  return n.toLocaleString("id-ID");
}

function buildMessage(d) {
  const lines = [];
  lines.push(`🏆 *DLMM Top LPers — Snapshot ${d.snapshot_id}*`);
  lines.push(`🕐 ${d.snapshot_at} WIB`);
  lines.push(
    `Di-skor: ${fmt(d.scored)} · Lolos filter: ${fmt(d.passed)} · Copy-ready: ${fmt(d.copy_ready)}`
  );
  lines.push("");
  lines.push("*Top 10 copy-ready (win rate 30D):*");
  lines.push("🆕 baru masuk · ⬆️ naik · ⬇️ turun · ➡️ tetap (vs snapshot sebelumnya)");
  const prevRank = new Map((d.prev_top ?? []).map((addr, i) => [addr, i + 1]));
  (d.top ?? []).forEach((w, i) => {
    const rank = i + 1;
    const prev = prevRank.get(w.wallet_address);
    let marker;
    if (prev === undefined) marker = "🆕 NEW";
    else if (prev > rank) marker = `⬆️${prev - rank}`;
    else if (prev < rank) marker = `⬇️${rank - prev}`;
    else marker = "➡️";
    const green =
      w.total_days != null ? ` · 🌱 hijau ${w.green_days}/${w.total_days} hari` : "";
    lines.push(
      `${rank}. ${marker} \`${w.wallet_address}\`\n` +
        `   WR ${w.wr_raw}% (${w.wins}W/${w.losses}L/${w.flats}F) · +${w.pnl_sol} SOL · ${w.open_count} open${green}`
    );
  });
  return lines.join("\n");
}

async function main() {
  const env = loadEnv();
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log("notify-telegram: TELEGRAM_BOT_TOKEN/CHAT_ID belum di-set — skip.");
    return;
  }
  const psql = findPsql();
  if (!psql) {
    console.error("notify-telegram: psql tidak ditemukan — skip.");
    return;
  }
  const data = queryJson(psql, env.DATABASE_URL, SQL);
  const text = buildMessage(data);
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!body.ok) {
    console.error(`notify-telegram: gagal kirim — ${body.description ?? res.status}`);
    process.exitCode = 1;
    return;
  }
  console.log(`notify-telegram: terkirim (snapshot ${data.snapshot_id}).`);
}

main().catch((err) => {
  console.error(`notify-telegram: error — ${err.message}`);
  process.exitCode = 1;
});
