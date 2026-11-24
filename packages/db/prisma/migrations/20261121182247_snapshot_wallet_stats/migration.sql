-- CreateTable
CREATE TABLE "snapshot_wallet_stats" (
    "snapshot_id" BIGINT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "window_days" INTEGER NOT NULL,
    "closed_count" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "flats" INTEGER NOT NULL DEFAULT 0,
    "win_rate_raw" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "win_rate_adj" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pnl_sol" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pnl_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fees_earned_sol" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fee_share" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ev_per_position_sol" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profit_factor" DOUBLE PRECISION,
    "median_pnl_sol" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "top_trade_share" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avg_hold_minutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "median_hold_minutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "median_position_sol" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "distinct_pools" INTEGER NOT NULL DEFAULT 0,
    "open_count" INTEGER NOT NULL DEFAULT 0,
    "open_unrealized_sol" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "snapshot_wallet_stats_pkey" PRIMARY KEY ("snapshot_id","wallet_address","window_days")
);

-- AddForeignKey
ALTER TABLE "snapshot_wallet_stats" ADD CONSTRAINT "snapshot_wallet_stats_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "ranking_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
