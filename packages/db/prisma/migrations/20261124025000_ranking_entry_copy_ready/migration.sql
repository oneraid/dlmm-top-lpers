-- Copy-ready flag on ranking entries: single source of truth for the
-- copy-ready leaderboard. The scoring engine computes it (see
-- workers/src/scoring/filters.ts evaluateCopyReady); reports and the
-- Telegram notifier read this flag instead of re-deriving the criteria.
ALTER TABLE "ranking_entries" ADD COLUMN "copy_ready" BOOLEAN NOT NULL DEFAULT false;
