-- Migration: Add Discore XP system tables
-- GuildXpConfig: per-guild XP settings
CREATE TABLE IF NOT EXISTS "GuildXpConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "levelUpChannelId" TEXT,
    "weeklyLeaderboardChannelId" TEXT,
    "messageXpEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reactionXpEnabled" BOOLEAN NOT NULL DEFAULT true,
    "minMessageXp" INTEGER NOT NULL DEFAULT 15,
    "maxMessageXp" INTEGER NOT NULL DEFAULT 40,
    "messageCooldownSeconds" INTEGER NOT NULL DEFAULT 60,
    "minReactionXp" INTEGER NOT NULL DEFAULT 5,
    "maxReactionXp" INTEGER NOT NULL DEFAULT 10,
    "reactionCooldownSeconds" INTEGER NOT NULL DEFAULT 300,
    "announceLevelUps" BOOLEAN NOT NULL DEFAULT true,
    "weeklyTop10Enabled" BOOLEAN NOT NULL DEFAULT false,
    "profileColor" TEXT,
    "lastWeeklyLeaderboardPostAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildXpConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GuildXpConfig_guildId_key" ON "GuildXpConfig"("guildId");
CREATE INDEX IF NOT EXISTS "GuildXpConfig_guildId_idx" ON "GuildXpConfig"("guildId");

-- UserXp: per-user XP totals per guild
CREATE TABLE IF NOT EXISTS "UserXp" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "messagesCounted" INTEGER NOT NULL DEFAULT 0,
    "reactionsCounted" INTEGER NOT NULL DEFAULT 0,
    "lastMessageXpAt" TIMESTAMPTZ(6),
    "lastReactionXpAt" TIMESTAMPTZ(6),
    "userTag" TEXT,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserXp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserXp_guildId_userId_key" ON "UserXp"("guildId", "userId");
CREATE INDEX IF NOT EXISTS "UserXp_guildId_totalXp_idx" ON "UserXp"("guildId", "totalXp");
CREATE INDEX IF NOT EXISTS "UserXp_guildId_level_idx" ON "UserXp"("guildId", "level");
CREATE INDEX IF NOT EXISTS "UserXp_guildId_userId_idx" ON "UserXp"("guildId", "userId");

-- UserXpEvent: individual XP events for daily/weekly/monthly aggregation
CREATE TABLE IF NOT EXISTS "UserXpEvent" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserXpEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UserXpEvent_guildId_userId_idx" ON "UserXpEvent"("guildId", "userId");
CREATE INDEX IF NOT EXISTS "UserXpEvent_guildId_createdAt_idx" ON "UserXpEvent"("guildId", "createdAt");
CREATE INDEX IF NOT EXISTS "UserXpEvent_guildId_source_idx" ON "UserXpEvent"("guildId", "source");