# DLMM Top LPers Finder

Web app untuk menemukan wallet LP terbaik di **Meteora DLMM (Solana)** untuk di-copy oleh bot copy-trade.

**Aturan ranking (inti produk):**
1. **Win Rate 7D/30D** — dihitung dari posisi *closed*, di-adjust dengan Wilson score lower bound
   supaya sampel kecil tidak menang melawan konsistensi sampel besar.
2. **PnL** — penentu urutan kedua (lalu PnL 7D, EV per posisi, jumlah posisi).

**Sumber data: 100% gratis.**
- PnL & data pool: **Meteora DLMM Data API** (`dlmm.datapi.meteora.ag`, tanpa API key, 30 RPS bersama).
- Discovery wallet per pool: **Solana PUBLIC RPC saja** (`api.mainnet-beta.solana.com`, tanpa key) —
  scan `getProgramAccounts` yang sangat dibatasi & dihemat (dataSlice 72 byte, 1 call/pool, jeda 3 detik).
- Harga: Jupiter Price API (lite, tanpa key).
- **Tidak** memakai LP Agent API (berbayar) dan **tidak** memakai RPC berkunci (keputusan user).

📐 **Spesifikasi lengkap: [IMPLEMENTATION.md](./IMPLEMENTATION.md)** — baca itu dulu sebelum mengubah apa pun.
🤖 **AI agent yang melanjutkan project ini: baca [AGENTS.md](./AGENTS.md).**

## Quick start (lokal)

```bash
cp .env.example .env
docker compose up -d postgres redis        # database + queue
npm install                                # workspaces: apps/web, workers, packages/db
npm run db:generate
npm run db:migrate -- --name init
npm run db:seed                            # scoring_config defaults (Bab 2.5)

# Jalankan pipeline manual (urutan penting):
npm run job:pools -w workers               # 1. pool discovery (Meteora API)
npm run job:wallets -w workers             # 2. wallet discovery (public RPC) — butuh verifikasi decode dulu, lihat AGENTS.md
npm run job:profile -w workers             # 3. profil PnL per wallet (Meteora API)
npm run job:scoring -w workers             # 4. hitung ranking

npm run dev                                # Web UI di http://localhost:3000
npm run dev:worker                         # (opsional) worker terjadwal (BullMQ)
```

## Tests

```bash
npm test                                   # unit test scoring (Wilson, aggregate, filters) — vitest di workers/
```

## Struktur

```text
apps/web/       Next.js — Web UI + API routes (Bab 7 & 8 di IMPLEMENTATION.md)
workers/        Pipeline: poolDiscovery -> walletDiscovery -> walletProfiler -> scoringRun
packages/db/    Prisma schema + client + seed
IMPLEMENTATION.md  Spesifikasi produk & teknis (sumber kebenaran)
AGENTS.md       Instruksi & status untuk AI agent penerus
```

## Status

Skeleton Sprint 0/awal Sprint 1 — lihat checklist hidup di AGENTS.md.
