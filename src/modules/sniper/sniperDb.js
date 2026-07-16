"use strict";

const prisma = require("../../lib/prisma");
const logger = require("../../lib/logger");

// All sniper operations go through try/catch — safe even if table doesn't exist.
// After `prisma generate` runs in postinstall, models are available.

// ── Config ─────────────────────────────────────────────────────────────────

async function findConfig(guildId) {
  try {
    return await prisma.sniperChallengeConfig.findUnique({
      where: { guildId },
    });
  } catch {
    return null;
  }
}

async function findConfigs(where) {
  try {
    return await prisma.sniperChallengeConfig.findMany({ where });
  } catch {
    return [];
  }
}

async function upsertConfig(guildId, data) {
  try {
    return await prisma.sniperChallengeConfig.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });
  } catch {
    return null;
  }
}

async function updateConfig(guildId, data) {
  try {
    return await prisma.sniperChallengeConfig.update({
      where: { guildId },
      data,
    });
  } catch {
    return null;
  }
}

async function deleteConfig(guildId) {
  try {
    return await prisma.sniperChallengeConfig.delete({ where: { guildId } });
  } catch {
    return null;
  }
}

// ── Runs ───────────────────────────────────────────────────────────────────

async function findRun(id) {
  try {
    return await prisma.sniperChallengeRun.findUnique({ where: { id } });
  } catch {
    return null;
  }
}

async function findActiveRun(guildId) {
  try {
    return await prisma.sniperChallengeRun.findFirst({
      where: { guildId, status: "ACTIVE" },
    });
  } catch {
    return null;
  }
}

async function createRun(data) {
  try {
    return await prisma.sniperChallengeRun.create({ data });
  } catch {
    return null;
  }
}

async function updateRun(id, data) {
  try {
    return await prisma.sniperChallengeRun.update({ where: { id }, data });
  } catch {
    return null;
  }
}

async function updateRunMany(where, data) {
  try {
    return await prisma.sniperChallengeRun.updateMany({ where, data });
  } catch {
    return { count: 0 };
  }
}

async function findExpiredRuns() {
  try {
    return await prisma.sniperChallengeRun.findMany({
      where: { status: "ACTIVE", expiresAt: { lte: new Date() } },
    });
  } catch {
    return [];
  }
}

async function deleteRuns(where) {
  try {
    return await prisma.sniperChallengeRun.deleteMany({ where });
  } catch {
    return { count: 0 };
  }
}

// ── Player Stats ───────────────────────────────────────────────────────────

async function findStats(guildId, userId) {
  try {
    return await prisma.sniperPlayerStats.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
  } catch {
    return null;
  }
}

async function upsertStats(guildId, userId, data) {
  try {
    return await prisma.sniperPlayerStats.upsert({
      where: { guildId_userId: { guildId, userId } },
      create: { guildId, userId, ...data },
      update: data,
    });
  } catch {
    return null;
  }
}

async function updateStats(guildId, userId, data) {
  try {
    return await prisma.sniperPlayerStats.update({
      where: { guildId_userId: { guildId, userId } },
      data,
    });
  } catch {
    return null;
  }
}

async function findTopPlayers(guildId, limit = 10) {
  try {
    return await prisma.sniperPlayerStats.findMany({
      where: { guildId },
      orderBy: { totalWins: "desc" },
      take: limit,
    });
  } catch {
    return [];
  }
}

async function deleteStats(where) {
  try {
    return await prisma.sniperPlayerStats.deleteMany({ where });
  } catch {
    return { count: 0 };
  }
}

// ─── Raw SQL fallback for table creation ────────────────────────────────────

async function ensureTables() {
  // Enum type
  try {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SniperChallengeStatus') THEN
          CREATE TYPE "SniperChallengeStatus" AS ENUM ('ACTIVE', 'WON', 'EXPIRED', 'CANCELLED');
        END IF;
      END $$;
    `);
  } catch {}

  // Config table
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SniperChallengeConfig" (
        "id" TEXT PRIMARY KEY, "guildId" TEXT UNIQUE NOT NULL,
        "enabled" BOOLEAN NOT NULL DEFAULT false, "paused" BOOLEAN NOT NULL DEFAULT false,
        "challengeChannelIds" TEXT[] NOT NULL DEFAULT '{}',
        "leaderboardChannelId" TEXT, "notificationChannelId" TEXT, "rewardRoleId" TEXT,
        "currentChampionId" TEXT, "currentChampionSince" TIMESTAMPTZ,
        "minDelayMs" INTEGER NOT NULL DEFAULT 3600000, "maxDelayMs" INTEGER NOT NULL DEFAULT 10800000,
        "activeDurationMs" INTEGER NOT NULL DEFAULT 180000, "nextRunAt" TIMESTAMPTZ,
        "leaderboardMessageId" TEXT, "totalChallengesCompleted" INTEGER NOT NULL DEFAULT 0,
        "lastWinnerId" TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  } catch (e) {
    logger.warn("[SniperChallenge] Config table ensure failed", {
      error: e.message,
    });
  }

  // Run table
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SniperChallengeRun" (
        "id" TEXT PRIMARY KEY, "guildId" TEXT NOT NULL, "channelId" TEXT NOT NULL,
        "messageId" TEXT, "status" "SniperChallengeStatus" NOT NULL DEFAULT 'ACTIVE',
        "spawnedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "expiresAt" TIMESTAMPTZ NOT NULL,
        "winnerId" TEXT, "wonAt" TIMESTAMPTZ, "reactionTimeMs" INTEGER,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  } catch (e) {
    logger.warn("[SniperChallenge] Run table ensure failed", {
      error: e.message,
    });
  }

  // Stats table
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SniperPlayerStats" (
        "id" TEXT PRIMARY KEY, "guildId" TEXT NOT NULL, "userId" TEXT NOT NULL,
        "totalWins" INTEGER NOT NULL DEFAULT 0, "currentStreak" INTEGER NOT NULL DEFAULT 0,
        "bestStreak" INTEGER NOT NULL DEFAULT 0, "lastWinAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE("guildId", "userId")
      );
    `);
  } catch (e) {
    logger.warn("[SniperChallenge] Stats table ensure failed", {
      error: e.message,
    });
  }

  logger.info("[SniperChallenge] Database tables ensured");
}

module.exports = {
  ensureTables,
  findConfig,
  findConfigs,
  upsertConfig,
  updateConfig,
  deleteConfig,
  findRun,
  findActiveRun,
  createRun,
  updateRun,
  updateRunMany,
  findExpiredRuns,
  deleteRuns,
  findStats,
  upsertStats,
  updateStats,
  findTopPlayers,
  deleteStats,
};
