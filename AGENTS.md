# AGENTS.md — Instruksi untuk AI Agent Penerus

Kamu melanjutkan project **DLMM Top LPers Finder**. Dokumen ini adalah titik masukmu.
Ikuti urutannya, jangan loncat.

## 0. Baca dulu (wajib, berurutan)

1. `IMPLEMENTATION.md` — spesifikasi lengkap (produk, ranking, data, DB, UI, roadmap).
   Ini **sumber kebenaran**. Kalau kode dan dokumen ini bertentangan, dokumen yang menang —
   atau ubah dokumennya di commit yang sama dengan penjelasan.
2. `README.md` — quick start & cara menjalankan pipeline.
3. File ini sampai habis.

## 1. Keputusan yang TIDAK boleh diubah tanpa persetujuan user

| # | Keputusan | Alasan |
|---|---|---|
| 1 | Ranking: **Win Rate (Wilson-adjusted) 7D/30D = prioritas #1, PnL = #2**, mode default leksikografis | Brief langsung dari user |
| 2 | **RPC hanya public RPC Solana** (`api.mainnet-beta.solana.com`). Dilarang menambah Helius / provider berkunci / API key RPC | Keputusan user 16 Nov 2026 |
| 3 | **Tidak memakai LP Agent API** (berbayar). PnL dari Meteora Data API gratis | Keputusan user |
| 4 | Win Rate hanya dari posisi **closed**; posisi open tidak dihitung ke Win Rate | Definisi Bab 2.1 — mencegah PnL unrealized memalsukan statistik |
| 5 | Semua call Meteora API lewat `workers/src/services/meteora.ts` (limiter 25 RPS) | Rate limit 30 RPS itu **bersama untuk semua endpoint** |
| 6 | Semua call `getProgramAccounts` lewat `workers/src/services/rpc.ts` (concurrency 1, jeda >= 3 dtk, wajib filter + dataSlice) | Public RPC adalah infrastruktur bersama; kita tamu di sana |

## 2. Status saat handoff (16 Nov 2026)

**Sudah ada (skeleton Sprint 0 + sebagian Sprint 1):**
- Monorepo npm workspaces: `apps/web`, `workers`, `packages/db`; `docker-compose.yml`; `.env.example`.
- Prisma schema lengkap (Bab 5) + seed `scoring_config` berisi default Bab 2.5.
- Scoring engine **selesai & teruji**: `workers/src/scoring/` (wilson, aggregateStats, filters, flags, ranking)
  + unit test di `workers/tests/scoring.test.ts`. Jangan tulis ulang — pakai.
- Services: `meteora.ts` (client terpusat + typed wrappers), `rpc.ts` (public RPC + disiplin limiter),
  `dlmmDecode.ts`, `price.ts` (Jupiter).
- Jobs: `poolDiscovery` (utuh), `walletDiscovery` (utuh tapi terblokir verifikasi decode, lihat Tugas #1),
  `walletProfiler` (alur utuh, normaliser response masih defensif), `scoringRun`, `priceSnapshot`, `pruning`.
  Worker BullMQ terjadwal di `workers/src/index.ts`; job sekali jalan: `npm run job:* -w workers`.
- Web UI: layout + Leaderboard (baca snapshot DB), Pools, Wallet Detail (stat cards), halaman
  Watchlist/Compare/Settings (masih placeholder bertanda), Jobs (baca `job_runs`).
- API routes lengkap sesuai Bab 7 (sebagian masih perlu pendalaman filter — ada TODO di tiap file).

**Belum terverifikasi / belum jalan end-to-end:** belum pernah `npm install` + migrate + run pipeline
di handoff ini. Anggap itu tugas pertamamu (Tugas #0).

## 3. Tugas berikutnya (urut prioritas)

### Tugas #0 — Buktikan skeleton jalan
```bash
cp .env.example .env
docker compose up -d postgres redis
npm install && npm run db:generate && npm run db:migrate -- --name init && npm run db:seed
npm test                                   # scoring harus hijau semua
npm run job:pools -w workers               # harus mengisi tabel pools dari Meteora API live
npm run dev                                # leaderboard tampil (kosong tidak apa-apa, asal tidak error)
```
Catat semua error yang kamu temui & perbaiki di file `docs/RUNLOG.md` (buat file itu).

### Tugas #1 — Verifikasi decode PositionV2 (MEMBLOKIR walletDiscovery)

**Status 16 Nov 2026: separuh selesai — bagian IDL sudah terbukti, bagian live belum.**
- ✅ Terbukti dari IDL `@meteora-ag/dlmm` v1.9.0 (tiga jalur independen, semua cocok):
  `dataSize = 8120`, `lbPairOffset = 8`, `ownerOffset = 40`, discriminator
  `[117,176,212,199,245,180,133,182]` (bs58 `LgkNAEYaVX3`). Sudah ditulis ke
  `workers/src/services/dlmmDecode.ts` (lengkap dengan hitungan ukuran per field).
  Bukti: aritmetika ukuran field IDL = 8120; konstanta SDK `POSITION_MIN_SIZE =
  8112`, `calculatePositionSize(70) = 8112`; akun sintetis 8120 byte ter-decode
  benar lewat Anchor coder SDK; filter SDK sendiri (`positionLbPairFilter`
  offset 8, `positionOwnerFilter` offset 40).
- ⏳ **Masih harus dijalankan di tempat yang bisa mencapai public RPC:**
  `npx tsx tests/decode.verify.ts` (file sudah dibuat, manual, tidak masuk
  `npm test`). Bagian live-nya membandingkan `decodePositionSlice()` vs
  `program.account.positionV2.fetch()` untuk 20 posisi nyata dari 3 pool.
  Percobaan dari sandbox 16 Nov gagal di `getProgramAccounts` karena egress
  sandbox memblokir POST ke `api.mainnet-beta.solana.com` (403) — bukan bug kode.
- ⚠️ **Celah yang ditemukan:** posisi yang lebih lebar dari 70 bin ukurannya
  `8120 + (width-70)*112` byte, jadi filter `dataSize: 8120` di `rpc.ts`
  **melewatkan posisi lebar**. Kalau posisi lebar harus ikut ter-scan, hapus
  filter `dataSize` dan andalkan memcmp discriminator + `lb_pair` saja
  (lihat catatan di `dlmmDecode.ts` dan IMPLEMENTATION.md Bab 3.2).

Langkah live yang tersisa:
1. Jalankan `npx tsx tests/decode.verify.ts` di mesin yang bisa mencapai public RPC.
2. Kalau ada pool sampel yang terlalu sepi, ganti lewat env `SAMPLE_POOLS` (lihat komentar di file test).
3. Kalau Part B hijau (20 posisi, 3 pool), coret blokir ini — `walletDiscovery` boleh dijalankan.
4. Putuskan soal posisi lebar (lihat ⚠️ di atas) sebelum mengandalkan hasil scan untuk ranking.

### Tugas #2 — Contract test Meteora API
Normaliser di `walletProfiler.ts` masih defensif karena bentuk persis response `/portfolio` &
`/positions/{pool}/pnl` belum dipaku. Panggil tiap endpoint Bab 3.1 satu kali ke produksi,
simpan contoh response (wallet contoh yang aktif) sebagai fixture di `workers/tests/fixtures/`,
ketatkan tipe di `meteora.ts`, dan sederhanakan normalisernya.

### Tugas #3 — Selesaikan Sprint 1 (lihat checklist di IMPLEMENTATION.md Bab 11)
Filter leaderboard berfungsi penuh, tab 7/30/90 di Wallet Detail, tabel riwayat posisi,
prioritas antrean profiler (watchlist > multi-pool > FIFO), golden wallet test 10 wallet (Bab 14).

### Tugas #4 — Sprint 2
Flags lengkap + badge, panel "kenapa tidak lolos filter", Watchlist & Compare utuh,
Settings form (menulis `scoring_config`), export + webhook teruji ke bot user.

## 4. Konvensi kerja

- Bahasa: UI & dokumen Bahasa Indonesia; istilah trading tetap Inggris. Kode & komentar boleh Inggris/Indonesia, konsisten per file.
- Setiap perubahan rumus scoring **wajib** disertai unit test baru/ubahan di `workers/tests/scoring.test.ts`.
- Setiap perubahan skema: migration Prisma baru, jangan edit migration lama.
- Response API eksternal mentah disimpan ke `raw_payload` (sudah ada di profiler) — jangan dibuang.
- Jangan commit `.env`, private key, atau seed phrase apa pun. Project ini **tidak pernah** memegang private key user.
- Commit kecil & deskriptif; sebutkan Bab IMPLEMENTATION.md yang disentuh di pesan commit.

## 5. Jebakan yang sudah diketahui

- Public RPC bisa mengembalikan error/timeout untuk `getProgramAccounts` kapan saja. Hasil scan yang
  gagal **bukan** berarti "tidak ada posisi" — `walletDiscovery` sudah menangani ini; jangan "disederhanakan".
- PnL Meteora belum termasuk swap in/out follower (Bab 6.5). Jangan pernah menampilkan PnL seolah itu hasil follower.
- Endpoint Meteora lama dari blog bisa 404. Satu-satunya kebenaran: Swagger produksi
  `https://dlmm.datapi.meteora.ag/swagger-ui/`.
- `getAllLbPairPositionsByUser()` dari SDK itu berat (getProgramAccounts besar) — jangan dipakai di pipeline massal.
