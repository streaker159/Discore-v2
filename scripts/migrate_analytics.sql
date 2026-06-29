-- Discore Official: Analytics & Announcements migration
-- Safe additive migration — no destructive changes

-- 1. Add announcementChannelId column to Guild
ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "announcementChannelId" TEXT;

-- 2. Bot command usage tracking
CREATE TABLE IF NOT EXISTS "BotCommandUsage" (
  "id" TEXT NOT NULL,
  "guildId" TEXT,
  "userId" TEXT NOT NULL,
  "commandName" TEXT NOT NULL,
  "subcommand" TEXT,
  "success" BOOLEAN NOT NULL DEFAULT true,
  "durationMs" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "BotCommandUsage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BotCommandUsage_createdAt_idx" ON "BotCommandUsage" ("createdAt");
CREATE INDEX IF NOT EXISTS "BotCommandUsage_guildId_idx" ON "BotCommandUsage" ("guildId");
CREATE INDEX IF NOT EXISTS "BotCommandUsage_commandName_idx" ON "BotCommandUsage" ("commandName");

-- 3. Bot AI usage tracking
CREATE TABLE IF NOT EXISTS "BotAiUsage" (
  "id" TEXT NOT NULL,
  "guildId" TEXT,
  "userId" TEXT,
  "success" BOOLEAN NOT NULL DEFAULT true,
  "creditsUsed" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "BotAiUsage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BotAiUsage_createdAt_idx" ON "BotAiUsage" ("createdAt");
CREATE INDEX IF NOT EXISTS "BotAiUsage_guildId_idx" ON "BotAiUsage" ("guildId");

-- 4. Guild install/leave events
CREATE TABLE IF NOT EXISTS "BotGuildInstallEvent" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "guildName" TEXT NOT NULL,
  "memberCount" INTEGER NOT NULL DEFAULT 0,
  "ownerId" TEXT,
  "eventType" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "BotGuildInstallEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BotGuildInstallEvent_guildId_idx" ON "BotGuildInstallEvent" ("guildId");
CREATE INDEX IF NOT EXISTS "BotGuildInstallEvent_eventType_createdAt_idx" ON "BotGuildInstallEvent" ("eventType", "createdAt");

-- 5. Hourly status reports
CREATE TABLE IF NOT EXISTS "BotHourlyStatusReport" (
  "id" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "reportHour" TEXT NOT NULL,
  "sentAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "status" TEXT NOT NULL DEFAULT 'success',
  "payloadJson" TEXT,
  CONSTRAINT "BotHourlyStatusReport_pkey" PRIMARY KEY ("id")
);