"use strict";

/**
 * Safe Prisma access layer for Sniper Challenge models.
 *
 * If the Prisma client hasn't been regenerated after the schema change,
 * the model accessors (prisma.sniperChallengeConfig, etc.) will be undefined.
 * This module wraps every call to return sensible defaults instead of crashing.
 */

const prisma = require("../../lib/prisma");
const logger = require("../../lib/logger");

let _warned = false;

function warnOnce() {
  if (!_warned) {
    _warned = true;
    logger.warn(
      "[SniperChallenge] Sniper models not available in Prisma client. " +
        "Run `npx prisma generate` to enable the Sniper Challenge feature.",
    );
  }
}

function hasModels() {
  return !!(
    prisma.sniperChallengeConfig &&
    prisma.sniperChallengeRun &&
    prisma.sniperPlayerStats
  );
}

// ── Config ─────────────────────────────────────────────────────────────────

async function findConfig(guildId) {
  if (!hasModels()) {
    warnOnce();
    return null;
  }
  try {
    return await prisma.sniperChallengeConfig.findUnique({
      where: { guildId },
    });
  } catch {
    return null;
  }
}

async function findConfigs(where) {
  if (!hasModels()) {
    warnOnce();
    return [];
  }
  try {
    return await prisma.sniperChallengeConfig.findMany({ where });
  } catch {
    return [];
  }
}

async function upsertConfig(guildId, data) {
  if (!hasModels()) {
    warnOnce();
    return null;
  }
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
  if (!hasModels()) {
    warnOnce();
    return null;
  }
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
  if (!hasModels()) {
    warnOnce();
    return null;
  }
  try {
    return await prisma.sniperChallengeConfig.delete({ where: { guildId } });
  } catch {
    return null;
  }
}

// ── Runs ───────────────────────────────────────────────────────────────────

async function findRun(id) {
  if (!hasModels()) {
    warnOnce();
    return null;
  }
  try {
    return await prisma.sniperChallengeRun.findUnique({ where: { id } });
  } catch {
    return null;
  }
}

async function findActiveRun(guildId) {
  if (!hasModels()) {
    warnOnce();
    return null;
  }
  try {
    return await prisma.sniperChallengeRun.findFirst({
      where: { guildId, status: "ACTIVE" },
    });
  } catch {
    return null;
  }
}

async function createRun(data) {
  if (!hasModels()) {
    warnOnce();
    return null;
  }
  try {
    return await prisma.sniperChallengeRun.create({ data });
  } catch {
    return null;
  }
}

async function updateRun(id, data) {
  if (!hasModels()) {
    warnOnce();
    return null;
  }
  try {
    return await prisma.sniperChallengeRun.update({ where: { id }, data });
  } catch {
    return null;
  }
}

async function updateRunMany(where, data) {
  if (!hasModels()) {
    warnOnce();
    return { count: 0 };
  }
  try {
    return await prisma.sniperChallengeRun.updateMany({ where, data });
  } catch {
    return { count: 0 };
  }
}

async function findExpiredRuns() {
  if (!hasModels()) {
    warnOnce();
    return [];
  }
  try {
    const now = new Date();
    return await prisma.sniperChallengeRun.findMany({
      where: { status: "ACTIVE", expiresAt: { lte: now } },
    });
  } catch {
    return [];
  }
}

async function deleteRuns(where) {
  if (!hasModels()) {
    warnOnce();
    return { count: 0 };
  }
  try {
    return await prisma.sniperChallengeRun.deleteMany({ where });
  } catch {
    return { count: 0 };
  }
}

// ── Player Stats ───────────────────────────────────────────────────────────

async function findStats(guildId, userId) {
  if (!hasModels()) {
    warnOnce();
    return null;
  }
  try {
    return await prisma.sniperPlayerStats.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
  } catch {
    return null;
  }
}

async function upsertStats(guildId, userId, data) {
  if (!hasModels()) {
    warnOnce();
    return null;
  }
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
  if (!hasModels()) {
    warnOnce();
    return null;
  }
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
  if (!hasModels()) {
    warnOnce();
    return [];
  }
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
  if (!hasModels()) {
    warnOnce();
    return { count: 0 };
  }
  try {
    return await prisma.sniperPlayerStats.deleteMany({ where });
  } catch {
    return { count: 0 };
  }
}

// ─── Raw SQL fallback for table creation ────────────────────────────────────

/**
 * Ensure the sniper tables exist using raw SQL.
 * Called on startup so the feature works even without prisma db push.
 */
async function ensureTables() {
  try {
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SniperChallengeStatus') THEN
          CREATE TYPE "SniperChallengeStatus" AS ENUM ('ACTIVE', 'WON', 'EXPIRED', 'CANCELLED');
        END IF;
      END
      $$;
    `);
  } catch (e) {
    // Type may already exist or be unsupported — safe to ignore
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SniperChallengeConfig" (
        "id" TEXT PRIMARY KEY,
        "guildId" TEXT UNIQUE NOT NULL,
        "enabled" BOOLEAN NOT NULL DEFAULT false,
        "paused" BOOLEAN NOT NULL DEFAULT false,
        "challengeChannelIds" TEXT[] NOT NULL DEFAULT '{}',
        "leaderboardChannelId" TEXT,
        "notificationChannelId" TEXT,
        "rewardRoleId" TEXT,
        "currentChampionId" TEXT,
        "currentChampionSince" TIMESTAMPTZ,
        "minDelayMs" INTEGER NOT NULL DEFAULT 3600000,
        "maxDelayMs" INTEGER NOT NULL DEFAULT 10800000,
        "activeDurationMs" INTEGER NOT NULL DEFAULT 180000,
        "nextRunAt" TIMESTAMPTZ,
        "leaderboardMessageId" TEXT,
        "totalChallengesCompleted" INTEGER NOT NULL DEFAULT 0,
        "lastWinnerId" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "SniperChallengeConfig_guildId_idx" ON "SniperChallengeConfig"("guildId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "SniperChallengeConfig_nextRunAt_idx" ON "SniperChallengeConfig"("nextRunAt");
    `);
  } catch (e) {
    logger.warn(
      "[SniperChallenge] Could not ensure SniperChallengeConfig table",
      {
        error: e.message,
      },
    );
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SniperChallengeRun" (
        "id" TEXT PRIMARY KEY,
        "guildId" TEXT NOT NULL,
        "channelId" TEXT NOT NULL,
        "messageId" TEXT,
        "status" "SniperChallengeStatus" NOT NULL DEFAULT 'ACTIVE',
        "spawnedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "winnerId" TEXT,
        "wonAt" TIMESTAMPTZ,
        "reactionTimeMs" INTEGER,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "SniperChallengeRun_guildId_status_idx" ON "SniperChallengeRun"("guildId", "status");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "SniperChallengeRun_status_idx" ON "SniperChallengeRun"("status");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "SniperChallengeRun_createdAt_idx" ON "SniperChallengeRun"("createdAt");
    `);
  } catch (e) {
    logger.warn("[SniperChallenge] Could not ensure SniperChallengeRun table", {
      error: e.message,
    });
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SniperPlayerStats" (
        "id" TEXT PRIMARY KEY,
        "guildId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "totalWins" INTEGER NOT NULL DEFAULT 0,
        "currentStreak" INTEGER NOT NULL DEFAULT 0,
        "bestStreak" INTEGER NOT NULL DEFAULT 0,
        "lastWinAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE("guildId", "userId")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "SniperPlayerStats_guildId_totalWins_idx" ON "SniperPlayerStats"("guildId", "totalWins");
    `);
  } catch (e) {
    logger.warn("[SniperChallenge] Could not ensure SniperPlayerStats table", {
      error: e.message,
    });
  }

  logger.info("[SniperChallenge] Database tables ensured via raw SQL");
}

module.exports = {
  hasModels,
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
