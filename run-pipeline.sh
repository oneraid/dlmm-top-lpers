#!/usr/bin/env bash
# Resumable DLMM pipeline runner — System Improvement #4, siklus 12:58 WIB 18 Nov 2026.
#
# Masalah: VM workspace di-replace berkali-kali per hari (mis. 05:08 dan 13:02 WIB
# 18 Nov). Pipeline 4 job (pools -> wallets -> profile -> scoring, ~30-40 mnt)
# yang mati di tengah harus diulang manual dari awal; siklus 04:58 sempat
# terpotong di tengah job:profile dan baru selesai setelah resume manual.
#
# Solusi: script ini mencatat progres per job sebagai marker file persisten di
# $HOME (.dlmm-pipeline-<cycle>.<job>.done) dan melewati job yang sudah selesai
# untuk siklus yang sama. Jalankan ulang dengan ID siklus yang sama untuk resume:
#
#   ./run-pipeline.sh 2026-11-18-1258
#
# Tanpa argumen, ID siklus = UTC saat ini (YYYY-MM-DD-HHMM). Marker hanya berlaku
# untuk satu siklus; siklus berikutnya mulai dari nol. Setiap job tetap idempotent
# (upsert), jadi re-run penuh kapan pun aman.
set -e
cd "$(dirname "$0")"

CYCLE="${1:-$(date -u +%Y-%m-%d-%H%M)}"
LOG="$HOME/workspace/goals/ruang-pantau-terpadu/hidden_files/dlmm-pipeline-$CYCLE.log"
mkdir -p "$(dirname "$LOG")"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

run_job() {
  local name="$1" script="$2"
  local marker="$HOME/.dlmm-pipeline-$CYCLE.$name.done"
  if [ -f "$marker" ]; then
    log "SKIP $name (sudah selesai untuk siklus $CYCLE)"
    return 0
  fi
  log "START $name"
  if npm run "$script" -w workers >>"$LOG" 2>&1; then
    touch "$marker"
    log "DONE $name"
  else
    log "FAIL $name — jalankan lagi dengan ID siklus yang sama untuk resume"
    return 1
  fi
}

log "Pipeline siklus $CYCLE dimulai (resume-aware)"
run_job pools job:pools
run_job wallets job:wallets
run_job profile job:profile
run_job scoring job:scoring
# Notifikasi Telegram ringkasan snapshot (bot @mysmartlpbot) — kegagalan
# notifikasi tidak boleh menggagalkan pipeline.
node notify-telegram.mjs >>"$LOG" 2>&1 || log "WARN notifikasi Telegram gagal (diabaikan)"
log "PIPELINE_DONE siklus $CYCLE rc=0"
