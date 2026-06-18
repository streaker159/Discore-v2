-- ============================================================
-- Discore V2b — ScoreboardEntry live channel/message columns
--            + Scoreboard metric enum update
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. Add per-entry live embed tracking columns
ALTER TABLE "ScoreboardEntry" ADD COLUMN IF NOT EXISTS "liveChannelId" TEXT;
ALTER TABLE "ScoreboardEntry" ADD COLUMN IF NOT EXISTS "liveMessageId" TEXT;

-- 2. Update ScoreMetric enum: rename old values to WIN_LOSS / POINTS
--    (keep POINTS value, update all legacy values to WIN_LOSS)
ALTER TYPE "ScoreMetric" ADD VALUE IF NOT EXISTS 'WIN_LOSS';

-- 3. Migrate existing boards to the two new modes
UPDATE "Scoreboard"
SET metric = 'WIN_LOSS'
WHERE metric IN ('WINS','LOSSES','RATIO','WIN_STREAK','LOSS_STREAK','SEASON','ALL_TIME');

-- Note: POINTS stays as-is.  WIN_LOSS covers everything else.
