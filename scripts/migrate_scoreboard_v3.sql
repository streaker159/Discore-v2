-- Discore V2 Scoreboard System v3 Migration
-- Adds: CUSTOM BoardType, hasCategories, targetName, sourceScoreboardId, sourceScoreboardName, merge history

-- Add new enum value for BoardType (PostgreSQL native enum requires ALTER TYPE)
ALTER TYPE "BoardType" ADD VALUE IF NOT EXISTS 'CUSTOM';

-- Add hasCategories to Scoreboard
ALTER TABLE "Scoreboard" ADD COLUMN IF NOT EXISTS "hasCategories" BOOLEAN NOT NULL DEFAULT FALSE;

-- Add targetName to ScoreboardEntry
ALTER TABLE "ScoreboardEntry" ADD COLUMN IF NOT EXISTS "targetName" TEXT;

-- Add source tracking to ScoreboardEntry
ALTER TABLE "ScoreboardEntry" ADD COLUMN IF NOT EXISTS "sourceScoreboardId" TEXT;
ALTER TABLE "ScoreboardEntry" ADD COLUMN IF NOT EXISTS "sourceScoreboardName" TEXT;

-- Index on sourceScoreboardId for merge lookups
CREATE INDEX IF NOT EXISTS "ScoreboardEntry_sourceScoreboardId_idx" ON "ScoreboardEntry" ("sourceScoreboardId");

-- Create ScoreboardMergeHistory table
CREATE TABLE IF NOT EXISTS "ScoreboardMergeHistory" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "targetScoreboardId" TEXT NOT NULL,
    "sourceScoreboardId" TEXT NOT NULL,
    "sourceScoreboardName" TEXT NOT NULL,
    "mergeOption" TEXT NOT NULL,
    "mergedBy" TEXT NOT NULL,
    "entriesMerged" INTEGER NOT NULL DEFAULT 0,
    "sourceAction" TEXT NOT NULL,
    "mergedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreboardMergeHistory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScoreboardMergeHistory_targetScoreboardId_fkey" FOREIGN KEY ("targetScoreboardId") REFERENCES "Scoreboard"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ScoreboardMergeHistory_guildId_idx" ON "ScoreboardMergeHistory" ("guildId");
CREATE INDEX IF NOT EXISTS "ScoreboardMergeHistory_targetScoreboardId_idx" ON "ScoreboardMergeHistory" ("targetScoreboardId");
CREATE INDEX IF NOT EXISTS "ScoreboardMergeHistory_sourceScoreboardId_idx" ON "ScoreboardMergeHistory" ("sourceScoreboardId");