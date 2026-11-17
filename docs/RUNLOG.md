# RUNLOG — DLMM Top LPers Finder

Catatan langkah verifikasi, kendala, dan perbaikan saat menjalankan project secara lokal.

## 16 Nov 2026 — Initial Local Bring-up & Verification

### 1. Database (PostgreSQL & Redis)
- **Kendala:** Docker tidak terpasang di host Windows. Service PostgreSQL sistem utama (`postgresql-x64-18`) berjalan pada port 5433 dengan auth `scram-sha-256`.
- **Solusi:** 
  - Menginisialisasi cluster PostgreSQL lokal terisolasi di folder project: `data/pgdata` menggunakan `initdb` dari PostgreSQL 18.
  - Menjalankan PostgreSQL lokal pada port standar `5432` dengan user `dlmm` (password: `dlmm`) dan database `dlmm_top_lpers`.
  - Mengatur database agar otomatis dijalankan bersama launcher script.

### 2. NPM Workspaces & Dependencies
- **Kendala:** `npm install` gagal pada `apps/web` karena `lucide-react@^0.450.0` tidak ditemukan di registry npm.
- **Solusi:** Memperbarui versi `lucide-react` di `apps/web/package.json` ke `^1.73.0`.
- **Hasil:** `npm install` sukses menginstal 467 package di seluruh workspaces (`apps/web`, `workers`, `packages/db`).

### 3. Prisma Client & Migrations
- **Kendala:** `prisma migrate dev` tidak menemukan `DATABASE_URL` saat dijalankan via npm workspace `@dlmm/db` karena `.env` hanya ada di root.
- **Solusi:** Menyalin `.env` ke masing-masing sub-workspace (`packages/db/.env`, `workers/.env`, `apps/web/.env`).
- **Hasil:**
  - `prisma generate`: sukses men-generate client Prisma v5.22.0.
  - `prisma migrate dev --name init`: migrasi `20261116151447_init` berhasil diterapkan ke database `dlmm_top_lpers`.
  - `prisma/seed.ts`: sukses mengisi parameter default `scoring_config` (Bab 2.5).

### 4. Unit Test Scoring Engine
- Menjalankan `npm test` (`vitest run` di `workers/`).
- **Hasil:** 5 test di `workers/tests/scoring.test.ts` (Wilson score, stats aggregation, filter minimum posisi/hold, flags) **100% Passed (5/5)** dalam 730ms.

### 5. Pool Discovery (Meteora DLMM Data API)
- Menjalankan `npm run job:pools -w workers`.
- **Hasil:** Sukses mengambil 170 pool dari API Meteora (`dlmm.datapi.meteora.ag`), menyaring dan menyimpan 50 pool ber-TVL/Fee tertinggi ke database lokal.

### 6. TypeScript & Build Fixes
- **Kendala 1 (apps/web):** Syntax error di `apps/web/app/api/export/leaderboard/route.ts` baris 21 (string literal `\n` terpecah baris baru mentah).
  - **Solusi:** Memperbaiki string concatenation menjadi `.join("\n")`.
- **Kendala 2 (workers):**
  - Di `workers/tsconfig.json`: `"include": ["src", "tests"]` bentrok dengan `"rootDir": "src"`.
  - Di `workers/src/jobs/walletProfiler.ts`: baris 82 menduplikasi key `windowDays` pada create object (`error TS2783`).
  - **Solusi:** Mengubah `include` ke `["src"]` di `tsconfig.json`, dan menghapus key ganda di `walletProfiler.ts`.
- **Hasil:** `npm run build` berhasil 100% (baik Next.js 15 SSR/Static build maupun workers TypeScript compilation).

### 7. PositionV2 Decode Verification (Tugas #1 Selesai)
- Menjalankan `npx tsx tests/decode.verify.ts` di `workers/`:
  - **Part A:** Konstanta ukuran data (8120 byte), discriminator `LgkNAEYaVX3`, offset `lb_pair` @8, dan `owner` @40 terbukti cocok dengan IDL `@meteora-ag/dlmm`.
  - **Part B:** Cross-check live ke Solana public RPC terhadap 22 posisi nyata di 3 pool terbukti 100% identik dengan hasil Anchor decode SDK.
  - **Status:** Blokir dicabut, `walletDiscovery` dinyatakan aman dijalankan.


---

### [2026-11-17] Wallet Profiler Schema Alignment & Leaderboard Activation
- **Masalah:**
  - `walletProfiler` gagal dengan `address: undefined` saat upsert pool.
  - Investigasi endpoint real Meteora Data API menemukan:
    1. Endpoint `/portfolio?user=...` mengembalikan properti `poolAddress` (bukan `address`).
    2. Endpoint `/positions/{pool}/pnl` mengembalikan properti `positionAddress` (bukan `address`).
    3. Timestamp `createdAt` dan `closedAt` bertipe Unix epoch dalam detik (bukan milidetik).
    4. Struktur `allTimeFees` bertipe nested `{ total: { sol, usd } }` dan `allTimeDeposits` `{ total: { sol, usd } }`.
- **Solusi:**
  - Memperbarui parser di `workers/src/jobs/walletProfiler.ts` agar mendukung `poolAddress || address`, `positionAddress || address`, normalisasi timestamp detik ke milidetik, dan ekstraksi `allTimeFees.total.sol` serta `allTimeDeposits.total.sol`.
- **Hasil Eksekusi Pipeline:**
  1. `npm run job:profile -w workers`: 50 wallet diprofil, 4.365 posisi tersimpan, statistik window (7D, 30D, 90D) terhitung.
  2. `npm run job:scoring -w workers`: Berhasil membuat ranking snapshot, 36 wallet lolos hard filters.
  3. Leaderboard di `http://localhost:3000/` aktif dan menampilkan tabel peringkat wallet top LPer secara real-time.
