"use strict";

const prisma = require("../../lib/prisma");
const logger = require("../../lib/logger");
const crypto = require("crypto");

function cuid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

// ── Config ─────────────────────────────────────────────────────────────────

async function findConfig(guildId) {
  try {
    return await prisma.sniperChallengeConfig.findUnique({
      where: { guildId },
    });
  } catch (e) {
    logger.error("[SniperChallenge] findConfig Prisma failed, trying raw SQL", {
      guildId,
      error: e.message,
    });
    try {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT * FROM "SniperChallengeConfig" WHERE "guildId" = $1`,
        guildId,
      );
      return rows?.[0] || null;
    } catch {
      return null;
    }
  }
}

async function findConfigs(where) {
  try {
    return await prisma.sniperChallengeConfig.findMany({ where });
  } catch (e) {
    logger.error("[SniperChallenge] findConfigs failed", { error: e.message });
    return [];
  }
}

async function upsertConfig(guildId, data) {
  // Try Prisma first
  try {
    return await prisma.sniperChallengeConfig.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });
  } catch (e) {
    logger.error(
      "[SniperChallenge] upsertConfig Prisma failed, trying raw SQL",
      { guildId, error: e.message },
    );
  }

  // Raw SQL fallback: INSERT ... ON CONFLICT
  try {
    const keys = Object.keys(data);
    if (keys.length === 0) {
      // Just insert a bare record
      const id = cuid();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "SniperChallengeConfig" ("id", "guildId") VALUES ($1, $2) ON CONFLICT ("guildId") DO NOTHING`,
        id,
        guildId,
      );
      return findConfig(guildId);
    }

    // Check if record exists
    const existing = await findConfig(guildId);
    if (!existing) {
      // INSERT
      const id = cuid();
      const cols = ["id", "guildId", ...keys];
      const vals = [id, guildId, ...keys.map((k) => data[k])];
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      const colList = cols.map((c) => `"${c}"`).join(", ");
      await prisma.$executeRawUnsafe(
        `INSERT INTO "SniperChallengeConfig" (${colList}) VALUES (${placeholders})`,
        ...vals,
      );
    } else {
      // UPDATE
      const setClauses = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");
      const vals = keys.map((k) => data[k]);
      await prisma.$executeRawUnsafe(
        `UPDATE "SniperChallengeConfig" SET ${setClauses} WHERE "guildId" = $${keys.length + 1}`,
        ...vals,
        guildId,
      );
    }
    return findConfig(guildId);
  } catch (e2) {
    logger.error("[SniperChallenge] upsertConfig raw SQL also failed", {
      guildId,
      error: e2.message,
    });
    return null;
  }
}

async function updateConfig(guildId, data) {
  try {
    return await prisma.sniperChallengeConfig.update({
      where: { guildId },
      data,
    });
  } catch (e) {
    logger.error(
      "[SniperChallenge] updateConfig Prisma failed, trying raw SQL",
      { guildId, error: e.message },
    );

    try {
      const keys = Object.keys(data);
      const setClauses = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");
      const vals = keys.map((k) => data[k]);
      await prisma.$executeRawUnsafe(
        `UPDATE "SniperChallengeConfig" SET ${setClauses} WHERE "guildId" = $${keys.length + 1}`,
        ...vals,
        guildId,
      );
      return findConfig(guildId);
    } catch (e2) {
      logger.error("[SniperChallenge] updateConfig raw SQL also failed", {
        guildId,
        error: e2.message,
      });
      return null;
    }
  }
}

async function deleteConfig(guildId) {
  try {
    return await prisma.sniperChallengeConfig.delete({ where: { guildId } });
  } catch (e) {
    logger.error("[SniperChallenge] deleteConfig failed", {
      guildId,
      error: e.message,
    });
    return null;
  }
}

// ── Runs ───────────────────────────────────────────────────────────────────

async function findRun(id) {
  try {
    return await prisma.sniperChallengeRun.findUnique({ where: { id } });
  } catch (e) {
    logger.error("[SniperChallenge] findRun failed", { error: e.message });
    return null;
  }
}

async function findActiveRun(guildId) {
  try {
    return await prisma.sniperChallengeRun.findFirst({
      where: { guildId, status: "ACTIVE" },
    });
  } catch (e) {
    logger.error("[SniperChallenge] findActiveRun failed", {
      error: e.message,
    });
    return null;
  }
}

async function createRun(data) {
  try {
    return await prisma.sniperChallengeRun.create({ data });
  } catch (e) {
    logger.error("[SniperChallenge] createRun failed", { error: e.message });
    return null;
  }
}

async function updateRun(id, data) {
  try {
    return await prisma.sniperChallengeRun.update({ where: { id }, data });
  } catch (e) {
    logger.error("[SniperChallenge] updateRun failed", { error: e.message });
    return null;
  }
}

async function updateRunMany(where, data) {
  try {
    return await prisma.sniperChallengeRun.updateMany({ where, data });
  } catch (e) {
    logger.error("[SniperChallenge] updateRunMany failed", {
      error: e.message,
    });
    return { count: 0 };
  }
}

async function findExpiredRuns() {
  try {
    return await prisma.sniperChallengeRun.findMany({
      where: { status: "ACTIVE", expiresAt: { lte: new Date() } },
    });
  } catch (e) {
    logger.error("[SniperChallenge] findExpiredRuns failed", {
      error: e.message,
    });
    return [];
  }
}

async function deleteRuns(where) {
  try {
    return await prisma.sniperChallengeRun.deleteMany({ where });
  } catch (e) {
    logger.error("[SniperChallenge] deleteRuns failed", { error: e.message });
    return { count: 0 };
  }
}

// ── Player Stats ───────────────────────────────────────────────────────────

async function findStats(guildId, userId) {
  try {
    return await prisma.sniperPlayerStats.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
  } catch (e) {
    logger.error("[SniperChallenge] findStats failed", { error: e.message });
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
  } catch (e) {
    logger.error("[SniperChallenge] upsertStats failed", { error: e.message });
    return null;
  }
}

async function updateStats(guildId, userId, data) {
  try {
    return await prisma.sniperPlayerStats.update({
      where: { guildId_userId: { guildId, userId } },
      data,
    });
  } catch (e) {
    logger.error("[SniperChallenge] updateStats failed", { error: e.message });
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
  } catch (e) {
    logger.error("[SniperChallenge] findTopPlayers failed", {
      error: e.message,
    });
    return [];
  }
}

async function deleteStats(where) {
  try {
    return await prisma.sniperPlayerStats.deleteMany({ where });
  } catch (e) {
    logger.error("[SniperChallenge] deleteStats failed", { error: e.message });
    return { count: 0 };
  }
}

// ─── Raw SQL table creation ────────────────────────────────────────────────

async function ensureTables() {
  try {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SniperChallengeStatus') THEN
          CREATE TYPE "SniperChallengeStatus" AS ENUM ('ACTIVE', 'WON', 'EXPIRED', 'CANCELLED');
        END IF;
      END $$;
    `);
  } catch {}

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SniperChallengeConfig" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
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
  } catch (e) {
    logger.warn("[SniperChallenge] Config table ensure", { error: e.message });
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SniperChallengeRun" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
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
  } catch (e) {
    logger.warn("[SniperChallenge] Run table ensure", { error: e.message });
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SniperPlayerStats" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
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
  } catch (e) {
    logger.warn("[SniperChallenge] Stats table ensure", { error: e.message });
  }

  // Drop old tables if they lack proper defaults
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "SniperChallengeConfig" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text`,
    );
  } catch {}
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "SniperChallengeRun" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text`,
    );
  } catch {}
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "SniperPlayerStats" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text`,
    );
  } catch {}

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
