-- ============================================================
-- Discore V2 — Schema Migration (additive only, safe to re-run)
-- Run this in the Supabase SQL Editor
-- ============================================================

-- SCOREBOARD: new columns
ALTER TABLE "Scoreboard" ADD COLUMN IF NOT EXISTS "publicId"       TEXT UNIQUE;
ALTER TABLE "Scoreboard" ADD COLUMN IF NOT EXISTS "repairStatus"   TEXT NOT NULL DEFAULT 'OK';
ALTER TABLE "Scoreboard" ADD COLUMN IF NOT EXISTS "roleImageUrl"   TEXT;
ALTER TABLE "Scoreboard" ADD COLUMN IF NOT EXISTS "lastUpdatedAt"  TIMESTAMPTZ;
ALTER TABLE "Scoreboard" ADD COLUMN IF NOT EXISTS "archivedAt"     TIMESTAMPTZ;
ALTER TABLE "Scoreboard" ADD COLUMN IF NOT EXISTS "archivedBy"     TEXT;
ALTER TABLE "Scoreboard" ADD COLUMN IF NOT EXISTS "archiveNote"    TEXT;

-- SCOREBOARD: make channelId nullable (some boards have no live channel)
ALTER TABLE "Scoreboard" ALTER COLUMN "channelId" DROP NOT NULL;

-- EVENT: new columns
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "publicId"     TEXT UNIQUE;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "eventType"    TEXT NOT NULL DEFAULT 'EVENT';
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "cleanupAfter" TIMESTAMPTZ;

-- BATTLE SIGNUP: new columns
ALTER TABLE "BattleSignup" ADD COLUMN IF NOT EXISTS "publicId"     TEXT;
ALTER TABLE "BattleSignup" ADD COLUMN IF NOT EXISTS "cleanupAfter" TIMESTAMPTZ;

-- INDEXES for cleanup job performance
CREATE INDEX IF NOT EXISTS "Event_cleanupAfter_idx" ON "Event"("cleanupAfter");
CREATE INDEX IF NOT EXISTS "BattleSignup_cleanupAfter_idx" ON "BattleSignup"("cleanupAfter");
CREATE INDEX IF NOT EXISTS "Scoreboard_repairStatus_idx" ON "Scoreboard"("repairStatus");
