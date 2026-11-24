# DLMM Top LPers Finder — Implementation Plan

> **Tujuan:** Web app untuk menemukan wallet LP (Liquidity Provider) terbaik di Meteora DLMM (Solana),
> di-ranking dengan prioritas: **#1 Win Rate 7D/30D yang konsisten, #2 PnL**.
> Hasilnya dipakai sebagai sumber leader untuk bot copy-trade DLMM.
>
> **Versi:** 1.1 — 16 November 2026 (revisi: RPC public saja, sesuai keputusan user)
> **Stack utama:** Next.js (Web UI + API) · Node.js Worker · PostgreSQL · Redis/BullMQ
> **Biaya target MVP:** **$0** (tanpa LP Agent API berbayar — lihat Bab 3)

---

## 0. Jawaban Singkat: LP Agent API Berbayar, Ada Cara Lain?

**Ada. Dan cara gratisnya justru cukup kuat untuk MVP, asal paham 1 batasannya.**

LP Agent API memang praktis (ada endpoint `top-lpers` per pool, sudah di-ranking), tapi endpoint
tersebut butuh plan Premium/Enterprise — key plan Free akan kena `401`.

Alternatif gratisnya adalah **menggabungkan 2 sumber resmi + indexing sendiri**:

| Kebutuhan | Cara berbayar (LP Agent) | Cara gratis (project ini) |
|---|---|---|
| Data pool (TVL, volume, fees, Fee/TVL) | LP Agent | **Meteora DLMM Data API** — gratis, tanpa API key, limit 30 req/detik |
| PnL per posisi / per wallet | LP Agent | **Meteora DLMM Data API** — endpoint `/portfolio` & `/positions/{pool}/pnl` sudah mengembalikan PnL posisi open & closed per wallet, gratis |
| Daftar wallet LP di sebuah pool | LP Agent `top-lpers` | **Indexing on-chain sendiri** — scan akun `PositionV2` milik program DLMM via Solana RPC (filter by pool), ambil field `owner`-nya |
| Leaderboard global Top LPers | LP Agent Smart LP | **Hitung sendiri** — gabungkan 2 langkah di atas, lalu ranking dengan scoring engine sendiri (Bab 6.4). Ini inti project ini |
| Harga token (untuk valuasi USD) | LP Agent / Birdeye | **Jupiter Price API** (gratis) untuk harga spot + snapshot harga yang disimpan sendiri untuk harga historis |
| Cross-check / seed wallet tambahan | — | **Dune / Flipside** (free tier, SQL) — opsional, untuk validasi, bukan sumber utama |

**Batasan jujurnya (penting, jangan sampai salah ekspektasi):**

1. Meteora Data API **tidak punya** endpoint "top LPers global" dan **tidak punya** swap feed.
   Jadi discovery wallet harus dimulai dari pool dulu (*pool-first discovery*, Bab 6.1–6.2).
   Konsekuensinya: LP yang hanya main di pool kecil di luar daftar pool yang kita scan bisa terlewat.
   Mitigasinya: scan Top 50–100 pool berdasarkan Fee/TVL & volume (batasan public RPC, Bab 3.2) — di situlah mayoritas fee (dan LP bagus) berada.
2. PnL dari Meteora API adalah PnL versi Meteora (per posisi, dari likuiditas masuk sampai keluar).
   Umumnya **belum termasuk biaya swap in/out & slippage** yang dialami follower saat copy.
   Karena itu project ini punya **True PnL (Fase 2, Bab 6.5)** sebagai koreksi — dan UI wajib memberi label
   mana angka yang masih "PnL Meteora" dan mana yang sudah "True PnL".
3. **Keputusan user: RPC hanya public RPC Solana** (`https://api.mainnet-beta.solana.com`, tanpa API key,
   tanpa provider berbayar/free-tier berkunci seperti Helius). Public RPC punya batas keras
   (±100 req/10 detik/IP, ±40 req/10 detik untuk 1 method, tanpa SLA, dan secara resmi "tidak ditujukan
   untuk aplikasi produksi"). Cukup untuk scan berkala Top pool yang dibatasi ketat, **tidak** cukup
   untuk indexing seluruh program DLMM atau real-time. Desain harus incremental, hemat request,
   dan terjadwal longgar (Bab 3.2 & 6.2) — streaming dikeluarkan dari roadmap selama keputusan ini berlaku.

---

## 1. Tujuan, Non-Tujuan, Definisi Sukses

### 1.1 Tujuan

1. Menghasilkan **leaderboard Top LPers** yang bisa difilter (window 7D / 30D, min. posisi, min. modal, gaya pool).
2. Ranking **mengutamakan konsistensi (Win Rate ter-adjust) di atas PnL mentah** — sesuai permintaan:
   Win Rate dulu, PnL nomor dua.
3. Setiap wallet punya **halaman detail** yang bisa diaudit: daftar posisi closed, PnL per posisi,
   breakdown per pool, distribusi hold time — supaya keputusan copy bukan berdasarkan 1 angka.
4. **Watchlist + export** (CSV/JSON/webhook) yang bisa langsung dikonsumsi bot copy-trade.
5. Semua berjalan di jalur gratis (Bab 11 untuk rincian biaya $0 dan kapan harus mulai bayar).

### 1.2 Non-tujuan (MVP)

- Bukan bot eksekusi: project ini **tidak** membuka posisi / tidak memegang private key.
- Bukan real-time copy engine: delay data menit–jam masih dapat diterima untuk *riset leader*.
  (Bot copy yang sudah ada tetap yang mengeksekusi.)
- Tidak mencakup DAMM v2 (fokus DLMM dulu; arsitektur menyisakan tempat untuk menambahkannya).

### 1.3 Definisi sukses MVP

- Leaderboard ter-update otomatis minimal setiap 6 jam.
- Minimal 300–1.000 wallet ter-profiling dengan statistik 7D & 30D yang lengkap.
- Setiap angka di UI bisa ditelusur balik ke posisi-posisi sumbernya (tidak ada angka "ajaib").
- Ada minimal 10 "golden wallet" yang diverifikasi manual cocok dengan tampilan Meteora (Bab 14).

---

## 2. Prinsip Ranking: Win Rate Dulu, PnL Kedua

### 2.1 Definisi dasar (kunci — semua harus konsisten pakai ini)

- **Posisi closed:** posisi DLMM yang likuiditasnya sudah ditarik penuh (status `closed` di Meteora API)
  dalam window yang dihitung, diukur dari `closed_at`.
- **Win:** posisi closed dengan `pnl_sol > 0` (basis utama SOL; USD sebagai tampilan sekunder).
  Posisi dengan `|pnl_sol| < epsilon` (default epsilon = 0.001 SOL, biaya debu) dihitung **bukan** win dan bukan loss —
  masuk kategori `flat` dan dikeluarkan dari denominator Win Rate.
- **Win Rate mentah:** `wins / (wins + losses)`.
- **Window 7D / 30D:** dua statistik dihitung terpisah, selalu dari posisi closed. Posisi masih open
  **tidak** dihitung ke Win Rate (unrealized PnL bisa berbalik), tapi ditampilkan terpisah di detail wallet.

### 2.2 Kenapa Win Rate mentah tidak boleh langsung di-sort

Wallet A: 3 posisi, 3 win → WR 100%. Wallet B: 200 posisi, 156 win → WR 78%.
Sort mentah menempatkan A di atas B, padahal bukti konsistensi B jauh lebih kuat.

Solusi: **Adjusted Win Rate = Wilson score lower bound (confidence 95%)**.
Ini batas bawah statistik dari Win Rate "sebenarnya" — makin banyak posisi, makin dekat ke WR mentah;
makin sedikit posisi, makin keras didiskon.

```ts
// workers/src/scoring/wilson.ts
export function wilsonLowerBound(wins: number, losses: number, z = 1.96): number {
  const n = wins + losses;
  if (n === 0) return 0;
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return Math.max(0, (centre - margin) / denom);
}
// Contoh: wilson(3,0)   ≈ 0.44   <- 100% mentah, tapi bukti tipis
//         wilson(156,44) ≈ 0.72   <- 78% mentah, bukti kuat -> menang
```

### 2.3 Skor komposit window

```text
AdjWR7   = wilson(wins_7d,  losses_7d)
AdjWR30  = wilson(wins_30d, losses_30d)
WinScore = 0.4 * AdjWR7 + 0.6 * AdjWR30        // 30D lebih berbobot: konsistensi > streak sesaat
```

### 2.4 Urutan ranking (mode default: Leksikografis — sesuai permintaan user)

```text
SORT BY
  1. lolos semua Hard Filter (Bab 2.5)          -- gate, bukan skor
  2. WinScore            DESC                    -- PRIORITAS #1
  3. pnl_sol_30d         DESC                    -- PRIORITAS #2
  4. pnl_sol_7d          DESC                    -- tie-breaker momentum
  5. ev_per_position_30d DESC                    -- tie-breaker kualitas
  6. closed_30d          DESC                    -- tie-breaker bukti/sample
```

**Mode alternatif (sediakan toggle di UI Settings, jangan hardcode satu-satunya):**

```text
CompositeScore = 100 * ( 0.70 * WinScore
                       + 0.20 * logNormPnl30        // log1p(pnl_sol_30d) dinormalisasi 0..1 per snapshot
                       + 0.10 * profitFactorNorm )  // min(profit_factor, 5) / 5
```

Mode leksikografis = transparan & sesuai brief. Mode komposit = lebih halus untuk membedakan
wallet dengan WinScore hampir sama tapi PnL beda jauh. Default tetap leksikografis.

### 2.5 Hard Filter (gate — wallet yang gagal TIDAK masuk leaderboard utama)

| Filter | Default | Alasan |
|---|---|---|
| `closed_30d >= 20` | 20 (bisa diatur 10–50) | Di bawah ini Win Rate tidak punya makna statistik |
| `closed_7d >= 3` | 3 | Bukti masih aktif & form terkini ada |
| `pnl_sol_30d > epsilon` | epsilon = 0.001 SOL | Wallet Win Rate tinggi tapi total PnL negatif tidak boleh jadi kandidat copy-trade (aturan user 17 Nov 2026; ditambahkan 18 Nov 2026 setelah wallet WR 98.6% / PnL -0.47 SOL sempat ranking #1) |
| `last_active_at <= 7 hari lalu` | 7 hari | Leader yang sudah pensiun tidak berguna untuk di-copy |
| `fee_share >= 0.10` | 10% | `total_fees / max(total_fees + gross_price_gain, epsilon)`. Di bawah ini profit kemungkinan besar dari pergerakan harga / token sendiri, bukan skill LP |
| `top_trade_share <= 0.35` | 35% | PnL posisi terbesar / total PnL positif. Di atas ini = terkonsentrasi, rawan "sekali hoki" |
| `distinct_pools_30d >= 5` | 5 | Menghindari spesialis 1 pool yang pool-nya bisa mati besok |
| `median_position_size_sol >= min_user_capital * 0.02` | relatif ke modal user | Wallet terlalu kecil = noise; terlalu besar diatur terpisah di UI (Bab 8) |
| `avg_hold_minutes >= 12` | 12 menit (peringatan di 18 mnt) | Hold terlalu pendek tidak ter-copy: follower selalu telat + kena swap in/out |
| Bukan wallet ter-flag | creator/insider/sybil flag = false | Lihat Bab 2.6 |

Semua nilai default di atas masuk tabel `scoring_config` dan bisa diubah dari UI Settings tanpa deploy ulang.

### 2.6 Red flag & flagging otomatis (ditampilkan sebagai badge, sebagian jadi gate)

- `CREATOR_FLAG`: wallet adalah creator / first LP-er dominan dari token yang dia LP-kan sendiri
  (heuristik: wallet muncul sebagai creator di metadata token / posisi pertama di pool launch).
- `ONE_POOL_FLAG`: > 80% PnL 30D dari 1 pool.
- `SNIPER_FLAG`: median hold < 5 menit dan mayoritas posisi di pool berumur < 1 jam.
- `HIDDEN_LOSS_FLAG`: banyak posisi open berumur lama dengan unrealized PnL sangat negatif
  sementara posisi closed hampir semua win → indikasi "yang rugi tidak pernah di-close".
- `SIZE_MISMATCH_FLAG`: median ukuran posisi > 20× modal user (untuk UI per-user, bukan gate global).
- `BURST_FLAG`: > 70% aktivitas 30D terjadi dalam 48 jam (bukan pola konsisten mingguan).

---

## 3. Sumber Data Gratis (Terverifikasi 16 Nov 2026)

### 3.1 Meteora DLMM Data API — sumber utama (GRATIS, tanpa key)

- Base URL: `https://dlmm.datapi.meteora.ag`
- Swagger / OpenAPI: `https://dlmm.datapi.meteora.ag/swagger-ui/`
- Auth: **tidak ada** (`security: []` di spec). Rate limit: **30 request/detik, dibagi ke semua endpoint**.
- Sudah diuji live saat dokumen ini dibuat: `GET /pools?query=SOL-USDC&page=1&page_size=2`
  mengembalikan `total, pages, data[]` berisi `address, name, token_x/token_y, tvl, volume{24h,...},
  fees{24h,...}, fee_tvl_ratio{24h,...}, pool_config{bin_step, base_fee_pct,...}, current_price`.

Endpoint yang dipakai project ini:

| Endpoint | Dipakai untuk |
|---|---|
| `GET /pools?sort_by=fee_tvl_ratio_24h:desc&filter_by=...&page=&page_size=` | Discovery pool (Bab 6.1) |
| `GET /pools/{address}` | Detail & state 1 pool |
| `GET /pools/{address}/ohlcv` · `GET /pools/{address}/volume/history` | Konteks pool di UI (chart volume/fees) |
| `GET /portfolio?user={wallet}` | Daftar pool tempat wallet punya posisi **closed** |
| `GET /portfolio/open?user={wallet}` | Daftar pool tempat wallet punya posisi **open** |
| `GET /portfolio/total?user={wallet}` | Total PnL portfolio wallet (cross-check cepat) |
| `GET /positions/{pool_address}/pnl?user={wallet}&status=closed\|open` | **Inti profiler:** PnL per posisi (`pnlUsd, pnlSol, pnlPctChange, allTimeFees`, timestamp) |
| `GET /positions/{address}/historical` | Event add / remove / claim fee / claim reward per posisi (untuk True PnL Fase 2) |
| `GET /wallets/{wallet}/pools/{pool_address}/total_claims` | Total fee yang pernah di-claim wallet di 1 pool |
| `GET /stats/protocol_metrics` | Statistik protokol (header/konteks UI) |

> ⚠️ **Aturan main penting:**
> 1. Jangan panggil endpoint "karangan" dari blog lama — beberapa endpoint lama sudah 404.
>    Selalu jadikan Swagger produksi sebagai satu-satunya kebenaran, dan tulis *contract test*
>    yang memanggil tiap endpoint 1× per hari (Bab 14).
> 2. API ini **tidak punya pagination cursor** dan **tidak punya endpoint daftar user per pool**.
>    Daftar user per pool didapat dari indexing on-chain (Bab 3.2), bukan dari API ini.
> 3. Hormati 30 RPS bersama: semua pemanggilan WAJIB lewat 1 client terpusat dengan token-bucket
>    limiter (Bab 6.3), bukan fetch bebas dari tiap modul.

### 3.2 Solana RPC + DLMM SDK — untuk discovery wallet per pool (PUBLIC RPC SAJA)

> **Keputusan user (16 Nov 2026): hanya public RPC.** Tidak ada API key, tidak ada Helius/provider lain.
> Semua desain di sub-bab ini sudah disesuaikan dengan batasan public RPC — baca konsekuensinya baik-baik.

- Endpoint: `https://api.mainnet-beta.solana.com` (resmi Solana Foundation).
  Cadangan baca ringan sejenis public: `https://api.mainnet-beta.solana.com` saja secara default;
  daftar endpoint bisa diganti lewat `RPC_PUBLIC_ENDPOINTS` (Bab 10) bila user mengubah keputusan ini.
- Batasan public RPC yang harus dihormati (dokumentasi cluster Solana):
  - ±**100 request / 10 detik / IP** total, dan ±**40 request / 10 detik untuk 1 method** yang sama.
  - **Tanpa SLA** — bisa throttle / timeout / ban IP tanpa pemberitahuan, dan endpoint ini secara resmi
    dinyatakan *tidak ditujukan untuk aplikasi produksi*.
  - `getProgramAccounts` adalah method terberat & paling dibatasi — beberapa sumber bahkan menyebutnya
    sangat dibatasi/diblokir sebagian di public endpoint. Karena itu desain kita membuatnya
    **semurah dan sesedikit mungkin** (lihat taktik hemat di bawah).
- Program ID DLMM (`lb_clmm`): `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo`
- SDK resmi: `@meteora-ag/dlmm` (TypeScript) dipakai **hanya untuk decode & verifikasi**, bukan untuk
  scan massal (method SDK seperti `DLMM.getLbPairs()` / `getAllLbPairPositionsByUser()` melakukan
  `getProgramAccounts` besar di belakang layar — terlalu berat untuk public RPC):
  - `pool.getPosition(positionPubKey)` — verifikasi decode manual pada sampel posisi.
  - `pool.getPositionsByUserAndLbPair(userPubKey)` — hanya untuk cek sesekali 1 wallet di 1 pool, bukan pipeline.
- Untuk discovery per pool, cara yang dipakai: **`getProgramAccounts` standar** (public RPC tidak punya
  `getProgramAccountsV2` ala Helius) dengan penghematan maksimal:
  - `programId = DLMM`
  - filter ukuran akun `dataSize` untuk tipe akun `PositionV2` — **wajib ada filter**, call tanpa filter ditolak.
  - filter `memcmp` pada field `lb_pair` = alamat pool yang sedang di-scan → hasilnya semua posisi di pool itu.
  - **`dataSlice: { offset: 0, length: 72 }`** — hanya minta 72 byte pertama tiap akun
    (discriminator 8 + `lb_pair` 32 + `owner` 32). Kita hanya butuh `owner`; memangkas payload seperti ini
    mengurangi ukuran response berkali-kali lipat dan jauh lebih ramah ke public RPC.
  - **Celah ukuran akun (ditemukan 16 Nov 2026, terverifikasi dari IDL SDK v1.9.0):**
    `dataSize = 8120` hanya berlaku untuk posisi default 70 bin. Posisi yang lebih lebar
    ukurannya `8120 + (width − 70) × 112` byte (SDK: `POSITION_MIN_SIZE = 8112`,
    `POSITION_BIN_DATA_SIZE = 112`), jadi filter `dataSize: 8120` melewatkan posisi lebar.
    Kalau posisi lebar harus ikut ter-scan, hapus filter `dataSize` dan andalkan memcmp
    discriminator (`LgkNAEYaVX3`) + `lb_pair` saja. Keputusan ini harus dicatat sebelum
    hasil scan dipakai untuk ranking.
  - `encoding: "base64"`, `commitment: "confirmed"` (jangan `finalized` — lebih lambat tanpa manfaat di sini).
  - **WAJIB verifikasi offset** `lb_pair` (perkiraan offset 8) & `owner` (perkiraan offset 40) dari layout akun
    `PositionV2` di IDL/SDK versi yang dipakai (jangan percaya angka perkiraan ini mentah-mentah).
    Tulis unit test yang membandingkan hasil decode manual vs `pool.getPosition()` untuk 20 posisi sampel
    sebelum scan massal dijalankan.
- **Disiplin request di public RPC (hard rule di `services/rpc.ts`):**
  - Limiter khusus: `getProgramAccounts` maks **1 req / 3 detik, concurrency 1** (jauh di bawah cap resmi —
    kita tamu di infrastruktur bersama).
  - Method ringan lain (`getAccountInfo`, `getSlot`, dll.): maks 5 req/detik.
  - `429` / timeout → exponential backoff + jitter (30 dtk → 2 mnt → 10 mnt), pool yang gagal masuk
    antrean ulang di run berikutnya, **bukan** di-retry agresif di run yang sama.
  - Checkpoint per pool: hasil scan disimpan per pool, jadi run yang terputus melanjutkan dari pool terakhir,
    tidak mengulang dari awal.
  - Semua call RPC tercatat (method, latency, status) ke tabel log sederhana untuk memantau kesehatan endpoint di `/jobs`.

### 3.3 Harga token

| Sumber | Dipakai untuk | Catatan |
|---|---|---|
| Jupiter Price API (`lite-api.jup.ag/price/v3`) | Harga spot SOL & token saat profiling & saat snapshot event | Gratis, tanpa key di lite endpoint. Selalu simpan `price_at_snapshot`, jangan hitung ulang historis dari harga hari ini |
| Snapshot harga internal | Valuasi posisi closed pada `closed_at` (True PnL) | Worker menyimpan harga SOL + token pool aktif tiap 5 menit ke tabel `price_snapshots` |
| Pyth / Switchboard | Cadangan harga SOL | Opsional |
| Birdeye free tier | Harga historis OHLCV kalau snapshot internal belum punya | Opsional, ada kuota; bukan dependensi wajib |

### 3.4 Sumber pelengkap (opsional, tetap gratis)

- **GeckoTerminal API** (gratis): cadangan discovery pool & OHLCV kalau Meteora API bermasalah.
- **DexScreener** (gratis, tanpa key): cross-check volume/liquidity pool.
- **Dune Analytics** (free: ±1.000 kredit/bulan) / **Flipside** (free tier SQL): query SQL atas tabel
  decoded Solana untuk *seed* kandidat wallet tambahan & validasi silang mingguan. Bukan sumber utama
  karena latency & kuota.
- **LP Army Hub** (`lparmy.com/community-tools`): direktori tool komunitas (Tokleo, Metlab, dll.)
  untuk inspirasi fitur & cross-check manual — bukan API yang di-depend.

### 3.5 Yang SENGAJA tidak dipakai

- **LP Agent API** — berbayar untuk endpoint yang kita butuhkan (`top-lpers` butuh Premium/Enterprise).
  Arsitektur menyisakan `providers/lpagent.ts` opsional: kalau suatu saat user berlangganan,
  provider ini tinggal diaktifkan sebagai *shortcut* discovery & pembanding skor, tanpa mengubah UI.
- **Birdeye / Solscan Pro sebagai dependensi wajib** — boleh sebagai enrichment opsional, bukan fondasi.

---

## 4. Arsitektur Sistem

```mermaid
flowchart LR
    subgraph Sumber["Sumber Data (Gratis)"]
        MAPI["Meteora DLMM Data API<br/>30 RPS, tanpa key"]
        RPC["Solana Public RPC<br/>api.mainnet-beta.solana.com<br/>getProgramAccounts + dataSlice"]
        JUP["Jupiter Price API"]
    end

    subgraph Worker["Worker (BullMQ + Redis)"]
        PD["1. Pool Discovery<br/>(tiap 1 jam)"]
        WD["2. Wallet Discovery<br/>(scan PositionV2 per pool)"]
        WP["3. Wallet Profiler<br/>(PnL per wallet, antre & dibatasi)"]
        SE["4. Scoring Engine<br/>(7D/30D, Wilson, ranking)"]
        PS["Price Snapshotter<br/>(tiap 5 menit)"]
    end

    DB[("PostgreSQL<br/>pools · wallets · positions<br/>wallet_window_stats · rankings")]
    API["Next.js API Routes<br/>/api/leaderboard · /api/wallets/:addr · ..."]
    UI["Web UI (Next.js)<br/>Leaderboard · Wallet Detail<br/>Pools · Watchlist · Compare · Settings"]

    MAPI --> PD
    PD --> DB
    DB --> WD
    RPC --> WD
    WD --> DB
    DB --> WP
    MAPI --> WP
    JUP --> WP
    JUP --> PS
    PS --> DB
    WP --> DB
    DB --> SE
    SE --> DB
    DB --> API
    API --> UI
    UI -->|export CSV/JSON/webhook| BOT["Bot Copy-Trade User<br/>(di luar project ini)"]
```

### 4.1 Prinsip desain

1. **Semua pemanggilan eksternal lewat service terpusat** (`services/meteora.ts`, `services/rpc.ts`,
   `services/price.ts`) — ada limiter, retry dengan backoff, cache, dan log kuota di satu tempat.
2. **Pipeline bertahap & bisa di-resume.** Setiap tahap menulis status job ke DB. Kalau worker mati
   di tengah, tahap berikutnya tidak mengulang dari nol.
3. **Raw dulu, hitung kemudian.** Response penting dari Meteora API disimpan mentah (`raw_payload` JSONB,
   dengan TTL pruning 30 hari) supaya scoring bisa dihitung ulang tanpa memanggil API lagi
   kalau rumus berubah.
4. **Snapshot ranking, bukan hitung live di UI.** Leaderboard dibaca dari tabel `rankings`
   hasil Scoring Engine — UI selalu cepat dan konsisten untuk semua pengunjung di snapshot yang sama.

### 4.2 Jadwal pipeline (default)

| Job | Jadwal | Perkiraan beban |
|---|---|---|
| Price Snapshotter | tiap 5 menit | 1 call Jupiter (multi-mint) |
| Pool Discovery | tiap 1 jam | ±5–15 call Meteora API (paginated, page_size besar) |
| Wallet Discovery | tiap 12 jam, hanya Top 50 pool (naik ke Top 100 bila endpoint sehat) | 1× `getProgramAccounts` per pool dengan `dataSlice` 72 byte, limiter 1 req/3 dtk, concurrency 1 — batasan public RPC (Bab 3.2) |
| Wallet Profiler | kontinu (antre), prioritas: wallet watchlist > wallet aktif > wallet baru | lihat perhitungan kuota di Bab 6.3 |
| Scoring Engine | tiap 1 jam + setiap batch profiler selesai | murni SQL + komputasi lokal |
| Pruning & Vacuum | harian | hapus raw payload > 30 hari, posisi duplikat, dll. |

---

## 5. Desain Database (PostgreSQL)

```prisma
// prisma/schema.prisma (ringkasan — field terpenting saja)

model Pool {
  address        String   @id                      // alamat LbPair
  name           String                            // "SOL-USDC"
  tokenX         String                            // mint
  tokenY         String
  binStep        Int      @map("bin_step")
  baseFeePct     Float    @map("base_fee_pct")
  tvlUsd         Float    @map("tvl_usd")
  volume24hUsd   Float    @map("volume_24h_usd")
  fees24hUsd     Float    @map("fees_24h_usd")
  feeTvlRatio24h Float    @map("fee_tvl_ratio_24h")
  isBlacklisted  Boolean  @default(false)
  isTracked      Boolean  @default(false)          // masuk daftar scan wallet discovery
  lastScannedAt  DateTime? @map("last_scanned_at")
  updatedAt      DateTime @updatedAt
  positions      Position[]
  @@index([feeTvlRatio24h(sort: Desc)])
  @@map("pools")
}

model Wallet {
  address       String   @id
  firstSeenAt   DateTime @map("first_seen_at")
  lastActiveAt  DateTime? @map("last_active_at")
  profiledAt    DateTime? @map("profiled_at")      // terakhir dihitung penuh oleh profiler
  profileStatus String   @default("queued")        // queued | profiling | done | failed | stale
  flags         String[] @default([])              // CREATOR_FLAG, SNIPER_FLAG, ...
  notes         String?
  positions     Position[]
  stats         WalletWindowStat[]
  @@index([lastActiveAt(sort: Desc)])
  @@map("wallets")
}

model Position {
  address        String   @id                      // alamat akun posisi (PositionV2)
  walletAddress  String   @map("wallet_address")
  poolAddress    String   @map("pool_address")
  status         String                            // open | closed
  lowerBinId     Int      @map("lower_bin_id")
  upperBinId     Int      @map("upper_bin_id")
  createdAt      DateTime @map("created_at")
  closedAt       DateTime? @map("closed_at")
  holdMinutes    Float?   @map("hold_minutes")
  depositedSol   Float?   @map("deposited_sol")    // modal masuk (ekuivalen SOL)
  withdrawnSol   Float?   @map("withdrawn_sol")
  feesEarnedSol  Float    @default(0) @map("fees_earned_sol")  // allTimeFees terkonversi
  pnlSol         Float?   @map("pnl_sol")          // PnL versi Meteora API
  pnlUsd         Float?   @map("pnl_usd")
  pnlPct         Float?   @map("pnl_pct")
  truePnlSol     Float?   @map("true_pnl_sol")     // Fase 2: setelah koreksi swap/slippage (Bab 6.5)
  isWin          Boolean? @map("is_win")           // null = flat / belum closed
  rawPayload     Json?    @map("raw_payload")
  wallet         Wallet   @relation(fields: [walletAddress], references: [address])
  pool           Pool     @relation(fields: [poolAddress], references: [address])
  @@index([walletAddress, closedAt(sort: Desc)])
  @@index([poolAddress, status])
  @@map("positions")
}

// Statistik ter-materialisasi per wallet per window — sumber semua angka leaderboard
model WalletWindowStat {
  walletAddress       String   @map("wallet_address")
  windowDays          Int      @map("window_days")            // 7 | 30 | 90
  closedCount         Int      @map("closed_count")
  wins                Int
  losses              Int
  flats               Int      @default(0)
  winRateRaw          Float    @map("win_rate_raw")
  winRateAdj          Float    @map("win_rate_adj")           // Wilson lower bound
  pnlSol              Float    @map("pnl_sol")
  pnlUsd              Float    @map("pnl_usd")
  feesEarnedSol       Float    @map("fees_earned_sol")
  feeShare            Float    @map("fee_share")
  evPerPositionSol    Float    @map("ev_per_position_sol")    // rata-rata PnL per posisi
  profitFactor        Float?   @map("profit_factor")          // gross win / |gross loss|
  medianPnlSol        Float    @map("median_pnl_sol")
  topTradeShare       Float    @map("top_trade_share")
  avgHoldMinutes      Float    @map("avg_hold_minutes")
  medianHoldMinutes   Float    @map("median_hold_minutes")
  medianPositionSol   Float    @map("median_position_sol")
  distinctPools       Int      @map("distinct_pools")
  openCount           Int      @map("open_count")
  openUnrealizedSol   Float    @default(0) @map("open_unrealized_sol")
  computedAt          DateTime @map("computed_at")
  wallet              Wallet   @relation(fields: [walletAddress], references: [address])
  @@id([walletAddress, windowDays])
  @@map("wallet_window_stats")
}

model RankingSnapshot {
  id           BigInt   @id @default(autoincrement())
  snapshotAt   DateTime @map("snapshot_at")
  mode         String                            // lexicographic | composite
  entries      RankingEntry[]
  @@map("ranking_snapshots")
}

model RankingEntry {
  snapshotId    BigInt @map("snapshot_id")
  walletAddress String @map("wallet_address")
  rank          Int
  winScore      Float  @map("win_score")
  compositeScore Float? @map("composite_score")
  passedFilters Boolean @map("passed_filters")
  failedFilters String[] @default([]) @map("failed_filters")  // alasan tidak lolos, untuk UI "kenapa wallet X tidak masuk"
  snapshot      RankingSnapshot @relation(fields: [snapshotId], references: [id])
  @@id([snapshotId, walletAddress])
  @@map("ranking_entries")
}

model WatchlistItem {
  walletAddress String   @id @map("wallet_address")
  label         String?
  copyRatioHint Float?   @map("copy_ratio_hint")
  addedAt       DateTime @default(now()) @map("added_at")
  @@map("watchlist")
}

model PriceSnapshot {
  mint       String
  at         DateTime
  priceUsd   Float @map("price_usd")
  @@id([mint, at])
  @@map("price_snapshots")
}

model ScoringConfig {
  key   String @id
  value Json
  @@map("scoring_config")   // semua default Bab 2.5 disimpan di sini, diedit dari UI Settings
}
```

**Catatan index & skala:** query terberat adalah agregasi posisi per wallet per window.
Itu sebabnya agregasi dilakukan worker ke `wallet_window_stats`, bukan dihitung API saat request.
Leaderboard API hanya membaca `ranking_entries JOIN wallet_window_stats`.

---

## 6. Algoritma Detail per Tahap

### 6.1 Tahap 1 — Pool Discovery (memilih pool yang layak di-scan wallet-nya)

```ts
// GET https://dlmm.datapi.meteora.ag/pools
//   ?sort_by=fee_tvl_ratio_24h:desc
//   &filter_by=is_blacklisted=false && volume_24h>=50000 && tvl>=25000
//   &page={n}&page_size=100
```

1. Tarik semua halaman hasil filter di atas (urut Fee/TVL 24h tertinggi).
2. Simpan/update ke tabel `pools`.
3. Tandai `is_tracked = true` untuk **Top 50** (batas public RPC; bisa dinaikkan ke Top 100 dari Settings
   bila scan terbukti stabil) berdasarkan kombinasi: Fee/TVL 24h, volume 24h, dan
   konsistensi (pool harus muncul di Top 150 pada minimal 2 dari 3 run terakhir — menghindari pool
   1-jam-an yang langsung mati).
4. Preset filter bisa diganti per gaya (Settings):
   - *Bluechip mode:* TVL ≥ $250k, pasangan SOL/USDC/USDT/stable.
   - *Memecoin mode:* TVL ≥ $25k, volume 24h ≥ $50k, umur pool ≥ 1 jam, token tanpa mint/freeze authority.

### 6.2 Tahap 2 — Wallet Discovery (menemukan kandidat wallet dari pool)

```text
UNTUK setiap pool is_tracked (diurutkan Fee/TVL tertinggi, 1 per 1 — concurrency RPC = 1):
  1. getProgramAccounts(program=DLMM, filters=[
       dataSize(PositionV2),
       memcmp(offset_lb_pair, pool.address)
     ], dataSlice={ offset: 0, length: 72 }, encoding="base64", commitment="confirmed")
     -- TANPA pagination (itu fitur provider berbayar); 1 call per pool, payload dipangkas dataSlice
  2. Decode 72 byte tiap akun -> ambil owner (offset owner terverifikasi, Bab 3.2)
  3. UPSERT owner ke tabel wallets (first_seen_at, last_active_at = sekarang bila posisi open)
  4. UPSERT posisi open yang ditemukan ke tabel positions (status=open, snapshot awal)
  5. Tandai pools.last_scanned_at + simpan checkpoint (pool berikutnya yang belum di-scan)
  6. Jeda minimal 3 detik sebelum pool berikutnya; 429/timeout -> backoff, lanjut run berikutnya
PRIORITAS ANTRIAN PROFILER:
  wallet watchlist > wallet yang terlihat di >= 3 pool tracked > wallet lain (FIFO)
```

- **Frekuensi & batas public RPC:** scan penuh Top 50 pool tiap 12 jam adalah target awal
  (50 call `getProgramAccounts` per run, ±3–10 menit dengan jeda sopan). Logika adaptif di
  `jobs/walletDiscovery.ts`: bila run terakhir error rate-nya < 5% selama 3 run berurutan, naikkan
  bertahap ke Top 75 → Top 100; bila banyak 429/timeout, turunkan ke Top 25 & interval 24 jam.
  Jangan pernah scan seluruh program tanpa filter pool, dan jangan paralelkan scan antar pool.
- **Sumber kandidat tambahan (murah):** wallet dari PnL card publik / input manual user di UI
  ("Add wallet by address") langsung masuk antrean profiler prioritas tertinggi — ini cara tercepat
  mengevaluasi wallet yang ditemukan user dari Twitter/Discord.

### 6.3 Tahap 3 — Wallet Profiler (menghitung riwayat PnL per wallet)

```ts
// services/meteora.ts — SATU client untuk semua call, dengan limiter global
import Bottleneck from "bottleneck";
export const meteoraLimiter = new Bottleneck({
  reservoir: 25, reservoirRefreshAmount: 25, reservoirRefreshInterval: 1000, // aman di bawah 30 RPS
  maxConcurrent: 10,
});
export async function meteoraGet<T>(path: string): Promise<T> {
  return meteoraLimiter.schedule(() => fetchWithRetry(`https://dlmm.datapi.meteora.ag${path}`));
}
```

Alur per wallet:

```text
1. GET /portfolio?user={wallet}            -> pool-pool dengan posisi closed
   GET /portfolio/open?user={wallet}       -> pool-pool dengan posisi open
2. UNTUK setiap pool di gabungan keduanya:
     GET /positions/{pool}/pnl?user={wallet}&status=closed
     GET /positions/{pool}/pnl?user={wallet}&status=open
   Simpan tiap posisi ke tabel positions (upsert by address):
     pnlSol, pnlUsd, pnlPct, allTimeFees -> feesEarnedSol, createdAt, closedAt, holdMinutes
     isWin = pnlSol >  epsilon ? true : pnlSol < -epsilon ? false : null(flat)
3. Cache per (wallet,pool,status) dengan TTL: closed = 6 jam (riwayat lama jarang berubah,
   cukup refresh posisi closed 30 hari terakhir tiap run), open = 15 menit.
4. Setelah semua pool selesai -> hitung ulang WalletWindowStat untuk window 7/30/90
   (fungsi murni aggregateStats(positions, windowDays), gampang di-unit-test).
5. Evaluasi flags (Bab 2.6) & simpan. Set wallets.profiled_at, profileStatus=done.
```

**Perhitungan beban (kenapa ini feasible gratis):** 1 wallet rata-rata aktif di ±5–15 pool →
±10–30 call API per profiling penuh. Dengan limiter 25 RPS, 500 wallet ≈ 7.500–15.000 call ≈
5–10 menit kerja API murni. Bottleneck sebenarnya adalah *kesopanan* ke API publik & kuota RPC
di Tahap 2, bukan Meteora API. Jadwalkan profiler kontinu dengan target awal 500–1.000 wallet/hari.

### 6.4 Tahap 4 — Scoring Engine

```ts
// workers/src/scoring/run.ts (pseudocode)
const cfg = await loadScoringConfig();              // Bab 2.5
const stats7  = indexByWallet(await getStats(7));
const stats30 = indexByWallet(await getStats(30));

for (const wallet of allProfiledWallets) {
  const s7 = stats7[wallet], s30 = stats30[wallet];
  const failed = evaluateHardFilters(s7, s30, cfg);       // [] = lolos
  const winScore = 0.4 * s7.winRateAdj + 0.6 * s30.winRateAdj;
  entries.push({ wallet, winScore, passed: failed.length === 0, failed,
                 pnl30: s30.pnlSol, pnl7: s7.pnlSol, ev30: s30.evPerPositionSol });
}
entries.filter(e => e.passed)
       .sort(lexicographicComparator)               // Bab 2.4
       .forEach((e, i) => e.rank = i + 1);
await saveSnapshot(entries);                        // yang gagal filter tetap disimpan (passed=false)
                                                    // supaya UI bisa menjelaskan "kenapa tidak masuk"
```

### 6.5 Fase 2 — True PnL (koreksi PnL Meteora)

Untuk tiap posisi closed, rekonstruksi dari `GET /positions/{address}/historical`
(event add/remove/claim) + `price_snapshots` pada timestamp event:

```text
TruePnL = ( nilai SOL-ekuivalen semua withdraw + fee yang di-claim )
        - ( nilai SOL-ekuivalen semua deposit )
        - estimasi biaya swap in/out follower   // parameter % di ScoringConfig, default tampilkan 2 skenario: 0% dan 0.5%
```

Leaderboard tetap memakai PnL Meteora di MVP (konsisten untuk semua wallet), True PnL ditampilkan
sebagai kolom tambahan & badge peringatan bila selisihnya > 20% dari PnL Meteora.

---

## 7. Spesifikasi API Internal (yang dikonsumsi Web UI)

Base: `/api` (Next.js Route Handlers, membaca DB — tidak pernah memanggil Meteora API secara sinkron
saat request UI, kecuali endpoint refresh manual 1 wallet).

| Method & Path | Fungsi | Parameter utama |
|---|---|---|
| `GET /api/leaderboard` | Leaderboard dari snapshot ranking terakhir | `mode=lexicographic\|composite`, `page`, `pageSize`, `minClosed30`, `minPnlSol30`, `poolTag=bluechip\|memecoin\|all`, `q=` (cari alamat) |
| `GET /api/leaderboard/meta` | Info snapshot: `snapshotAt`, total wallet ter-profiling, total lolos filter | — |
| `GET /api/wallets/{address}` | Detail wallet: stat 7/30/90, flags, breakdown per pool, posisi open | — |
| `GET /api/wallets/{address}/positions` | Riwayat posisi (untuk tabel & chart detail) | `status=closed\|open`, `days=7\|30\|90`, `page` |
| `POST /api/wallets/{address}/refresh` | Paksa wallet masuk antrean profiler prioritas (rate-limit per IP/user) | — |
| `POST /api/wallets/manual` | Tambah wallet manual by address (dari PnL card, Twitter, dll.) | `{ address, label? }` |
| `GET /api/pools` | Daftar pool tracked + statistiknya | `sort=feeTvl\|volume\|tvl` |
| `GET /api/pools/{address}/top-lpers` | Top LPers **di pool itu saja**, dari data internal kita | `days=30` |
| `GET/POST/DELETE /api/watchlist` | Kelola watchlist | — |
| `GET /api/compare?addresses=a,b,c` | Data perbandingan 2–4 wallet (stat 7/30 berdampingan) | — |
| `GET /api/export/leaderboard.csv` · `.json` | Export untuk bot copy-trade | `top=50`, `mode=` |
| `POST /api/export/webhook` | Kirim payload leaderboard ke URL bot user (format Bab 15) | `{ url, top }` |
| `GET/PUT /api/settings/scoring` | Baca/tulis `scoring_config` (semua threshold Bab 2.5 + bobot) | — |
| `GET /api/jobs/status` | Status pipeline: run terakhir tiap tahap, sisa estimasi kuota RPC, antrean profiler | — |

Contoh response `GET /api/leaderboard?mode=lexicographic&pageSize=2`:

```json
{
  "snapshotAt": "2026-11-16T08:00:00Z",
  "totalProfiled": 842,
  "totalPassed": 67,
  "data": [
    {
      "rank": 1,
      "address": "7xKz...9dF",
      "winScore": 0.81,
      "stats7":  { "closed": 18, "winRateRaw": 0.89, "winRateAdj": 0.68, "pnlSol": 12.4 },
      "stats30": { "closed": 96, "winRateRaw": 0.85, "winRateAdj": 0.77, "pnlSol": 58.2,
                   "feesEarnedSol": 21.7, "feeShare": 0.37, "evPerPositionSol": 0.61,
                   "profitFactor": 2.9, "medianHoldMinutes": 84, "distinctPools": 14 },
      "flags": [],
      "lastActiveAt": "2026-11-16T06:42:00Z"
    }
  ]
}
```

---

## 8. Web UI — Spesifikasi Detail

**Stack UI:** Next.js 15 (App Router) · Tailwind CSS · shadcn/ui · TanStack Table (sorting/pagination)
· Recharts (chart PnL & distribusi) · lucide-react (ikon). Tema gelap default (audiens trader),
bahasa UI: Bahasa Indonesia dengan istilah trading tetap Inggris (Win Rate, PnL, Hold, Pool).

### 8.1 Halaman & route

| Route | Nama | Fungsi inti |
|---|---|---|
| `/` | Leaderboard | Halaman utama — tabel Top LPers (Bab 8.2) |
| `/wallet/[address]` | Wallet Detail | Audit 1 wallet secara mendalam (Bab 8.3) |
| `/pools` | Pools | Pool tracked, Fee/TVL, dan Top LPers per pool |
| `/watchlist` | Watchlist | Wallet pantauan + status copy-readiness |
| `/compare` | Compare | Bandingkan 2–4 wallet head-to-head |
| `/settings` | Settings | Semua threshold scoring, preset gaya, URL webhook bot, modal user (untuk flag size-mismatch) |
| `/jobs` | Pipeline | Status job, kuota, antrean, log error terakhir |

### 8.2 Leaderboard (`/`) — wireframe

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ DLMM Top LPers        Snapshot: 16 Nov 2026 15:00 WIB · 842 wallet diprofil  │
│ [Mode: Lexicographic ▾] [Window sorotan: 30D]        [Export ▾] [↻ Refresh]  │
├────────────┬─────────────────────────────────────────────────────────────────┤
│ FILTER     │  #  Wallet        WinScore  WR 7D   WR 30D  PnL 30D  PnL 7D    │
│ Window     │  1  7xKz...9dF    0.81      89%     85%     +58.2◎   +12.4◎    │
│ (•) 30D    │     ├ badge: Consistent · 96 posisi · 14 pool · aktif 12m lalu  │
│ ( ) 7D     │  2  ... dst                                                     │
│            │                                                                 │
│ Min posisi │  Kolom lengkap (bisa di-toggle tampil/sembunyi):                │
│ 30D [20]   │  EV/posisi · Profit Factor · Fees · Fee Share · Median Hold ·   │
│ Min PnL    │  Median Size · Pool Count · Last Active · Flags                 │
│ [   ] SOL  │                                                                 │
│ Gaya pool  │  Baris yang TIDAK lolos filter tidak tampil di tabel utama,     │
│ [All ▾]    │  tapi bisa dicari manual → tampil dengan panel merah            │
│            │  "Tidak masuk leaderboard karena: closed_30d=8 (<20),           │
│ ☑ Hanya yg │   top_trade_share=0.52 (>0.35)"                                 │
│   lolos    │                                                                 │
│ [Terapkan] │  Aksi per baris: [+ Watchlist] [Detail] [Copy Address]          │
└────────────┴─────────────────────────────────────────────────────────────────┘
```

Aturan UX leaderboard:

- Kolom **WinScore, WR 7D, WR 30D selalu di kiri sebelum PnL** — mencerminkan prioritas ranking secara visual.
- WR ditampilkan ganda: angka mentah besar, angka adjusted kecil di bawahnya (mis. `85% · adj 77%`).
- PnL berwarna hijau/merah, selalu dengan satuan SOL utama + USD kecil.
- Badge otomatis: `Consistent` (lolos filter + WinScore ≥ 0.75 di 2 snapshot berurutan),
  `Hot Streak` (AdjWR7 jauh di atas AdjWR30), `Whale` (median size besar), badge merah untuk tiap flag Bab 2.6.
- Klik baris = ke Wallet Detail. Tidak ada angka yang tidak bisa diklik telusur ke sumbernya.

### 8.3 Wallet Detail (`/wallet/[address]`)

```text
Header : alamat (copy button) · link Solscan & Meteora · flags · [＋ Watchlist] [↻ Profil Ulang]
Stat cards (tab 7D | 30D | 90D):
  Win Rate (raw/adj) · Posisi Closed · PnL SOL/USD · Fees Earned · Fee Share
  EV/Posisi · Profit Factor · Median PnL · Median Hold · Median Size · Distinct Pools
Chart 1: PnL kumulatif per posisi closed (urutan waktu) — garis naik stabil = konsisten;
         garis datar lalu 1 lompatan = terkonsentrasi (korelasi visual dengan top_trade_share)
Chart 2: Distribusi hold time (histogram) + distribusi PnL per posisi (histogram, nol di tengah)
Tabel A: Breakdown per pool — pool, posisi, WR, PnL, fees, share % dari total PnL
Tabel B: Riwayat posisi — pool, buka, tutup, hold, size, PnL SOL/USD/%, fees, status, link posisi
Panel  : Posisi open saat ini — pool, range bin, unrealized PnL, umur posisi
         (dengan peringatan HIDDEN_LOSS bila relevan)
Panel  : "Copy-readiness" — checklist otomatis: hold cukup lama? size cocok dengan modal saya?
         aktif minggu ini? + tombol [Export wallet ini ke bot]
```

### 8.4 Pools (`/pools`)

Tabel pool tracked: nama, bin step, base fee, TVL, volume 24h, fees 24h, Fee/TVL 24h,
jumlah posisi open ter-scan, jumlah wallet unik, terakhir di-scan.
Klik pool → daftar Top LPers **di pool itu** (dari data internal) + tombol "Scan ulang pool ini".

### 8.5 Watchlist & Compare

- Watchlist: kartu per wallet dengan sparkline PnL 30D, perubahan rank antar snapshot,
  dan status terakhir (masih lolos filter / baru gagal filter → highlight kuning).
- Compare: pilih 2–4 wallet → tabel stat 7/30 berdampingan + chart PnL kumulatif overlay.
  Ini halaman keputusan akhir sebelum memasukkan leader ke bot.

### 8.6 Settings (`/settings`)

- Semua threshold Bab 2.5 dalam form angka (dengan tombol "Reset ke default").
- Bobot WinScore (slider 7D vs 30D) & pilihan mode ranking.
- Modal saya (SOL) → mengaktifkan `SIZE_MISMATCH_FLAG` personal.
- Webhook bot: URL + secret + tombol "Kirim tes" (format Bab 15).
- Preset gaya: Bluechip / Balanced / Memecoin (mengubah filter pool Bab 6.1 & filter leaderboard).

### 8.7 Keadaan UI yang wajib ditangani

Loading skeleton · snapshot kosong (pipeline pertama belum selesai → tampilkan progress job) ·
wallet belum ter-profiling (tombol "Minta profiling" + posisi antrean) · API internal error ·
data basi (snapshot > 12 jam → banner kuning "data basi, pipeline terakhir gagal — lihat /jobs").

---

## 9. Struktur Repository

```text
dlmm-top-lpers/
├── apps/
│   └── web/                      # Next.js: UI + API routes (Bab 7 & 8)
│       ├── app/                  # route: /, /wallet/[address], /pools, /watchlist, /compare, /settings, /jobs, /api/*
│       ├── components/           # LeaderboardTable, WalletStatCards, PnlChart, FilterPanel, FlagBadges, ...
│       └── lib/                  # api client, format (SOL/USD/WIB), constants
├── workers/
│   └── src/
│       ├── jobs/                 # poolDiscovery.ts, walletDiscovery.ts, walletProfiler.ts, scoringRun.ts, priceSnapshot.ts, pruning.ts
│       ├── services/             # meteora.ts (limiter!), rpc.ts, price.ts, dlmmDecode.ts
│       ├── scoring/              # wilson.ts, filters.ts, aggregateStats.ts, flags.ts, ranking.ts
│       └── index.ts              # BullMQ worker bootstrap + scheduler
├── packages/
│   └── db/                       # prisma/schema.prisma, migrations, seed (scoring_config default)
├── docker-compose.yml            # postgres + redis + web + worker (1 perintah jalan)
├── .env.example                  # Bab 10
└── IMPLEMENTATION.md             # dokumen ini
```

---

## 10. Konfigurasi Environment

```bash
# .env.example
DATABASE_URL=postgresql://user:pass@localhost:5432/dlmm_top_lpers
REDIS_URL=redis://localhost:6379

RPC_PUBLIC_ENDPOINTS=https://api.mainnet-beta.solana.com            # PUBLIC RPC SAJA, tanpa API key (keputusan user)
RPC_GPA_MIN_INTERVAL_MS=3000                                        # jeda minimum antar getProgramAccounts
RPC_GPA_CONCURRENCY=1
RPC_LIGHT_MAX_RPS=5
METEORA_API_BASE=https://dlmm.datapi.meteora.ag                     # tanpa key
JUPITER_PRICE_BASE=https://lite-api.jup.ag/price/v3                 # tanpa key

SCAN_TOP_POOLS=50
SCAN_INTERVAL_HOURS=12
PROFILER_DAILY_TARGET=1000
USER_CAPITAL_SOL=10            # default untuk SIZE_MISMATCH_FLAG, bisa diubah di UI
BOT_WEBHOOK_URL=               # opsional, diisi dari UI Settings
BOT_WEBHOOK_SECRET=
```

---

## 11. Roadmap Implementasi

### Sprint 0 — Fondasi (hari 1–2)
- [ ] Inisialisasi monorepo, docker-compose (Postgres + Redis), Prisma schema Bab 5, seed `scoring_config`.
- [ ] `services/meteora.ts` dengan limiter + retry + contract test ke Swagger produksi.
- [ ] `services/rpc.ts` + verifikasi offset decode `PositionV2` vs SDK (test 20 posisi sampel).
- **Acceptance:** bisa memanggil `/pools` dan menampilkan 1 pool di halaman kosong Next.js.

### Sprint 1 — MVP Leaderboard (hari 3–7) ← target rilis pertama
- [ ] Job Pool Discovery + halaman `/pools` (read-only dari DB).
- [ ] Job Wallet Discovery untuk Top 50 pool via public RPC (limiter + dataSlice + checkpoint) + input wallet manual.
- [ ] Job Wallet Profiler (antre BullMQ, cache, agregasi 7/30/90).
- [ ] Scoring Engine mode leksikografis + snapshot ranking.
- [ ] UI Leaderboard (filter dasar) + Wallet Detail (stat cards + tabel posisi).
- **Acceptance:** leaderboard ≥ 300 wallet, snapshot otomatis, 10 golden wallet cocok manual (Bab 14).

### Sprint 2 — Keputusan & Export (minggu 2)
- [ ] Flags lengkap (Bab 2.6), badge, panel "kenapa tidak lolos filter".
- [ ] Watchlist, Compare, Settings (threshold bisa diedit & langsung dipakai snapshot berikutnya).
- [ ] Export CSV/JSON + webhook ke bot (Bab 15) + halaman `/jobs`.
- [ ] Logika adaptif scan public RPC (Top 50 → 75 → 100 bila stabil, turun otomatis bila banyak 429).
- **Acceptance:** user bisa dari UI: saring → audit wallet → masuk watchlist → export ke bot, tanpa menyentuh DB.

### Sprint 3 — True PnL & Paper-Copy (minggu 3–4, Fase 2)
- [ ] Price Snapshotter berjalan stabil; rekonstruksi event per posisi; kolom True PnL + badge selisih.
- [ ] Paper-copy simulator: untuk tiap wallet watchlist, simulasikan "seandainya copy sejak 7 hari lalu"
      dengan delay & biaya yang bisa diatur → PnL simulasi vs PnL leader.
- **Acceptance:** minimal watchlist punya True PnL & hasil paper-copy per wallet.

### Sprint 4 — Notifikasi (opsional, Fase 3 — tetap public RPC, tanpa streaming)
- [ ] Alert Telegram/Discord berbasis polling terjadwal: leader watchlist membuka posisi baru
      (terdeteksi di scan berikutnya) / gagal filter / tidak aktif > 7 hari.
      Catatan: selama keputusan "public RPC saja" berlaku, TIDAK ada Webhooks/Yellowstone gRPC —
      alert bersifat near-time (sesuai interval scan), bukan real-time.

---

## 12. Biaya: Rencana $0 dan Titik Naik Kelasnya

| Komponen | Pilihan $0 | Batasnya | Naik kelas saat… |
|---|---|---|---|
| Meteora Data API | Gratis, tanpa key, 30 RPS | Tidak ada leaderboard global / swap feed | Tidak perlu — tetap gratis |
| RPC | **Public RPC Solana** (`api.mainnet-beta.solana.com`), tanpa key — keputusan user | ±100 req/10 dtk/IP, `getProgramAccounts` paling dibatasi, tanpa SLA, resmi "bukan untuk produksi" | Hanya bila user mengubah keputusan ini: provider berkunci (mis. Helius) — di luar rencana saat ini |
| Harga | Jupiter Lite (gratis) | Harga spot saja | Butuh OHLCV historis massal → Birdeye berbayar (opsional) |
| Database | Postgres lokal / Neon / Supabase free tier | Storage & koneksi terbatas | Data posisi > free tier |
| Redis/Queue | Lokal / Upstash free tier | Kuota command terbatas | Profiler > ribuan wallet/hari |
| Hosting | Lokal / VPS murah / free tier Vercel+Render* | *Worker long-running biasanya tidak cocok di serverless gratis | Butuh uptime 24/7 serius → VPS ±$5–10/bln |
| LP Agent API | **Tidak dipakai** | — | Hanya bila ingin shortcut discovery & rela Premium/Enterprise |

**Total MVP realistis: $0** (jalan lokal / free tier) — biaya pertama yang masuk akal bila serius
adalah RPC berbayar, bukan LP Agent.

---

## 13. Risiko, Limitasi & Mitigasi

| Risiko / limitasi | Dampak | Mitigasi di desain ini |
|---|---|---|
| Meteora API mengubah/menghapus endpoint | Profiler rusak diam-diam | Contract test harian per endpoint; simpan `raw_payload`; alert di `/jobs` bila error rate naik |
| PnL Meteora ≠ hasil follower | Leader terlihat profit, follower rugi | Label jujur di UI + True PnL (Fase 2) + paper-copy simulator sebelum copy beneran |
| Discovery bias ke pool besar | LP bagus di pool kecil terlewat | Input wallet manual + seed Dune/Flipside + naikkan Top pool bertahap sebatas yang public RPC sanggup (50 → 75 → 100) |
| Public RPC throttle / timeout / hasil `getProgramAccounts` tidak lengkap | Wallet discovery lambat atau sebagian pool terlewat di run itu | Limiter sopan (1 req/3 dtk, concurrency 1), `dataSlice` 72 byte, checkpoint per pool, scan adaptif (turun Top pool & interval), prioritas pool Fee/TVL tertinggi & pool watchlist, tandai pool yang gagal agar di-scan ulang di run berikutnya — jangan pernah menganggap hasil scan yang error sebagai "tidak ada posisi" |
| Wallet gaming statistik (posisi debu banyak, hidden loss) | Win Rate palsu | Filter min. size, epsilon flat, `HIDDEN_LOSS_FLAG`, median (bukan hanya mean), top-trade-share cap |
| Data basi dipakai untuk keputusan | Copy leader yang sudah tidak aktif | `last_active` gate 7 hari, banner data basi, timestamp snapshot selalu tampil di UI |
| Alamat wallet salah ketik / bukan LP | Antrean profiler sia-sia | Validasi base58 + cek `/portfolio/total` dulu (murah) sebelum profiling penuh |

---

## 14. Testing & Validasi

1. **Unit test scoring:** `wilson.ts` (kasus 3/0, 156/44, 0/0), `aggregateStats` (wallet buatan dengan
   posisi win/loss/flat campuran, posisi lintas batas window 7D), `filters.ts` (tiap filter punya kasus lolos & gagal).
2. **Golden wallet test:** pilih 10 wallet aktif secara manual dari UI Meteora, catat PnL & jumlah posisi
   closed mereka, bandingkan dengan hasil profiler — selisih PnL total harus < 1% (selisih timestamp snapshot wajar).
3. **Contract test API eksternal:** 1× sehari panggil tiap endpoint Meteora yang dipakai dengan parameter
   tetap, assert status 200 & field wajib ada. Gagal = job merah di `/jobs`.
4. **Load sanity:** profiling 100 wallet dari antrean kosong harus selesai < 15 menit di limiter default
   tanpa 1 pun error 429 dari Meteora API.
5. **UI test manual per rilis:** alur emas — buka leaderboard → filter → buka wallet rank 1 →
   telusur 1 posisi sampai ke link Solscan → tambah watchlist → export JSON → cocokkan isi file.

---

## 15. Integrasi ke Bot Copy-Trade User

Project ini adalah *otak riset*-nya; bot user yang sudah ada adalah *tangan eksekusi*-nya.
Kontrak datanya sengaja sederhana:

**Export JSON (`GET /api/export/leaderboard.json?top=20&mode=lexicographic`):**

```json
{
  "generatedAt": "2026-11-16T08:00:00Z",
  "mode": "lexicographic",
  "leaders": [
    { "rank": 1, "address": "7xKz...9dF", "winScore": 0.81,
      "winRate30": 0.85, "winRateAdj30": 0.77, "pnlSol30": 58.2,
      "medianPositionSol": 4.1, "medianHoldMinutes": 84, "flags": [] }
  ]
}
```

**Webhook (POST ke URL bot, ditandatangani `x-signature: HMAC-SHA256(secret, body)`):**
payload sama seperti export JSON, dikirim setiap snapshot ranking baru bila `BOT_WEBHOOK_URL` terisi.

**Aturan aman untuk bot penerima (cantumkan juga di README repo):**
bot WAJIB menerapkan filter terakhirnya sendiri (min. size, pool whitelist, max posisi bersamaan)
dan mulai dari **paper mode / size terkecil** untuk leader baru — leaderboard ini adalah daftar
kandidat hasil riset, bukan jaminan profit.

---

## 16. Referensi

- Meteora DLMM Data API — Overview & Swagger: https://docs.meteora.ag/developer-guides/dlmm/api-reference/overview · `https://dlmm.datapi.meteora.ag/swagger-ui/`
- Meteora DLMM TypeScript SDK Reference (`@meteora-ag/dlmm`): https://docs.meteora.ag/developer-guides/dlmm/typescript-sdk/reference
- Program ID DLMM: `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo`
- Solana Clusters & Public RPC Endpoints (batasan public endpoint): https://solana.com/docs/references/clusters
- LP Agent API — Get Top LPers for a Pool (pembanding berbayar, Premium/Enterprise): https://docs.lpagent.io/api-reference/pools/get-top-lpers-for-a-pool
- LP Army — Community Tools: https://www.lparmy.com/community-tools

---

*Dokumen ini adalah rencana implementasi — angka limit, harga tier, dan bentuk endpoint diverifikasi
pada 16 November 2026 dan bisa berubah. Sebelum Sprint 0 dimulai, jalankan contract test Bab 14.3
untuk memastikan semua endpoint di Bab 3.1 masih sesuai Swagger produksi.*
