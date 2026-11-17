-- CreateTable
CREATE TABLE "pools" (
    "address" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token_x" TEXT NOT NULL,
    "token_y" TEXT NOT NULL,
    "bin_step" INTEGER NOT NULL,
    "base_fee_pct" DOUBLE PRECISION NOT NULL,
    "tvl_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "volume_24h_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fees_24h_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fee_tvl_ratio_24h" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_blacklisted" BOOLEAN NOT NULL DEFAULT false,
    "is_tracked" BOOLEAN NOT NULL DEFAULT false,
    "last_scanned_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pools_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "wallets" (
    "address" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMP(3),
    "profiled_at" TIMESTAMP(3),
    "profile_status" TEXT NOT NULL DEFAULT 'queued',
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "positions" (
    "address" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "pool_address" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lower_bin_id" INTEGER NOT NULL,
    "upper_bin_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "hold_minutes" DOUBLE PRECISION,
    "deposited_sol" DOUBLE PRECISION,
    "withdrawn_sol" DOUBLE PRECISION,
    "fees_earned_sol" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pnl_sol" DOUBLE PRECISION,
    "pnl_usd" DOUBLE PRECISION,
    "pnl_pct" DOUBLE PRECISION,
    "true_pnl_sol" DOUBLE PRECISION,
    "is_win" BOOLEAN,
    "raw_payload" JSONB,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "wallet_window_stats" (
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
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_window_stats_pkey" PRIMARY KEY ("wallet_address","window_days")
);

-- CreateTable
CREATE TABLE "ranking_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "snapshot_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mode" TEXT NOT NULL,

    CONSTRAINT "ranking_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_entries" (
    "snapshot_id" BIGINT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "win_score" DOUBLE PRECISION NOT NULL,
    "composite_score" DOUBLE PRECISION,
    "passed_filters" BOOLEAN NOT NULL,
    "failed_filters" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "ranking_entries_pkey" PRIMARY KEY ("snapshot_id","wallet_address")
);

-- CreateTable
CREATE TABLE "watchlist" (
    "wallet_address" TEXT NOT NULL,
    "label" TEXT,
    "copy_ratio_hint" DOUBLE PRECISION,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_pkey" PRIMARY KEY ("wallet_address")
);

-- CreateTable
CREATE TABLE "price_snapshots" (
    "mint" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "price_usd" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "price_snapshots_pkey" PRIMARY KEY ("mint","at")
);

-- CreateTable
CREATE TABLE "scoring_config" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "scoring_config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" BIGSERIAL NOT NULL,
    "job_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "detail" JSONB,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_checkpoints" (
    "job_name" TEXT NOT NULL,
    "cursor" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scan_checkpoints_pkey" PRIMARY KEY ("job_name")
);

-- CreateIndex
CREATE INDEX "pools_fee_tvl_ratio_24h_idx" ON "pools"("fee_tvl_ratio_24h" DESC);

-- CreateIndex
CREATE INDEX "wallets_last_active_at_idx" ON "wallets"("last_active_at" DESC);

-- CreateIndex
CREATE INDEX "positions_wallet_address_closed_at_idx" ON "positions"("wallet_address", "closed_at" DESC);

-- CreateIndex
CREATE INDEX "positions_pool_address_status_idx" ON "positions"("pool_address", "status");

-- CreateIndex
CREATE INDEX "job_runs_job_name_started_at_idx" ON "job_runs"("job_name", "started_at" DESC);

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "wallets"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_pool_address_fkey" FOREIGN KEY ("pool_address") REFERENCES "pools"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_window_stats" ADD CONSTRAINT "wallet_window_stats_wallet_address_fkey" FOREIGN KEY ("wallet_address") REFERENCES "wallets"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_entries" ADD CONSTRAINT "ranking_entries_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "ranking_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
