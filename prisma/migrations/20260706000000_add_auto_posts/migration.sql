-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('SCHEDULED', 'MEMBER_JOIN', 'MENTION', 'KEYWORD');

-- CreateEnum
CREATE TYPE "MessageMode" AS ENUM ('PLAIN', 'EMBED', 'BOTH');

-- CreateEnum
CREATE TYPE "AutoPostStatus" AS ENUM ('ACTIVE', 'PAUSED', 'FAILED');

-- CreateTable
CREATE TABLE "AutoPost" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "AutoPostStatus" NOT NULL DEFAULT 'ACTIVE',

    "triggerType" "TriggerType" NOT NULL,
    "channelId" TEXT NOT NULL,

    "messageMode" "MessageMode" NOT NULL DEFAULT 'PLAIN',
    "content" TEXT,
    "embedTitle" TEXT,
    "embedDescription" TEXT,
    "embedColor" TEXT,
    "embedFooter" TEXT,
    "embedImageUrl" TEXT,

    "triggerConfig" JSONB,
    "scheduleConfig" JSONB,

    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),

    "cooldownSeconds" INTEGER NOT NULL DEFAULT 300,
    "lastTriggeredAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "pausedReason" TEXT,

    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoPost_guildId_idx" ON "AutoPost"("guildId");

-- CreateIndex
CREATE INDEX "AutoPost_guildId_status_idx" ON "AutoPost"("guildId", "status");

-- CreateIndex
CREATE INDEX "AutoPost_guildId_enabled_idx" ON "AutoPost"("guildId", "enabled");

-- CreateIndex
CREATE INDEX "AutoPost_triggerType_idx" ON "AutoPost"("triggerType");

-- CreateIndex
CREATE INDEX "AutoPost_nextRunAt_idx" ON "AutoPost"("nextRunAt");