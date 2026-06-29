-- ScoreType V1: Per-scoreboard custom score categories (premium feature)
CREATE TABLE IF NOT EXISTS "ScoreboardScoreType" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "scoreboardId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ScoreboardScoreType_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScoreboardScoreType_scoreboardId_normalizedName_key" UNIQUE ("scoreboardId", "normalizedName")
);

CREATE TABLE IF NOT EXISTS "ScoreboardEntryTypeStats" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "scoreboardId" TEXT NOT NULL,
  "scoreboardEntryId" TEXT NOT NULL,
  "scoreTypeId" TEXT NOT NULL,
  "wins" INTEGER NOT NULL DEFAULT 0,
  "losses" INTEGER NOT NULL DEFAULT 0,
  "points" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ScoreboardEntryTypeStats_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScoreboardEntryTypeStats_entryId_typeId_key" UNIQUE ("scoreboardEntryId", "scoreTypeId")
);