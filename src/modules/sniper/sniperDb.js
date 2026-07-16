"use strict";

const prisma = require("../../lib/prisma");
const logger = require("../../lib/logger");
const crypto = require("crypto");

function cuid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

// ── All operations use raw SQL since Prisma model delegates are unavailable ──

// ── Config ─────────────────────────────────────────────────────────────────

async function findConfig(guildId) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "SniperChallengeConfig" WHERE "guildId" = $1`,
      guildId,
    );
    return rows?.[0] || null;
  } catch (e) {
    logger.error("[SniperChallenge] findConfig failed", {
      guildId,
      error: e.message,
    });
    return null;
  }
}

async function findConfigs(where) {
  try {
    let query = `SELECT * FROM "SniperChallengeConfig" WHERE 1=1`;
    const params = [];
    let i = 1;
    if (where.enabled !== undefined) {
      query += ` AND "enabled" = $${i++}`;
      params.push(where.enabled);
    }
    if (where.paused !== undefined) {
      query += ` AND "paused" = $${i++}`;
      params.push(where.paused);
    }
    if (where.nextRunAt && where.nextRunAt.lte) {
      query += ` AND "nextRunAt" <= $${i++}`;
      params.push(where.nextRunAt.lte);
    }
    return await prisma.$queryRawUnsafe(query, ...params);
  } catch (e) {
    logger.error("[SniperChallenge] findConfigs failed", { error: e.message });
    return [];
  }
}

async function upsertConfig(guildId, data) {
  try {
    const existing = await findConfig(guildId);
    if (!existing) {
      const id = cuid();
      const keys = Object.keys(data);
      const cols = ["id", "guildId", ...keys];
      const vals = [id, guildId, ...keys.map((k) => data[k])];
      const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(", ");
      const colList = cols.map((c) => `"${c}"`).join(", ");
      await prisma.$executeRawUnsafe(
        `INSERT INTO "SniperChallengeConfig" (${colList}) VALUES (${placeholders})`,
        ...vals,
      );
    } else {
      const keys = Object.keys(data);
      if (keys.length > 0) {
        const setClauses = keys
          .map((k, idx) => `"${k}" = $${idx + 1}`)
          .join(", ");
        const vals = keys.map((k) => data[k]);
        await prisma.$executeRawUnsafe(
          `UPDATE "SniperChallengeConfig" SET ${setClauses} WHERE "guildId" = $${keys.length + 1}`,
          ...vals,
          guildId,
        );
      }
    }
    return findConfig(guildId);
  } catch (e) {
    logger.error("[SniperChallenge] upsertConfig failed", {
      guildId,
      error: e.message,
    });
    return null;
  }
}

async function updateConfig(guildId, data) {
  try {
    const keys = Object.keys(data);
    if (keys.length === 0) return findConfig(guildId);
    const setClauses = keys.map((k, idx) => `"${k}" = $${idx + 1}`).join(", ");
    const vals = keys.map((k) => data[k]);
    await prisma.$executeRawUnsafe(
      `UPDATE "SniperChallengeConfig" SET ${setClauses} WHERE "guildId" = $${keys.length + 1}`,
      ...vals,
      guildId,
    );
    return findConfig(guildId);
  } catch (e) {
    logger.error("[SniperChallenge] updateConfig failed", {
      guildId,
      error: e.message,
    });
    return null;
  }
}

async function deleteConfig(guildId) {
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "SniperChallengeConfig" WHERE "guildId" = $1`,
      guildId,
    );
  } catch (e) {
    logger.error("[SniperChallenge] deleteConfig failed", {
      guildId,
      error: e.message,
    });
  }
}

// ── Runs ───────────────────────────────────────────────────────────────────

async function findRun(id) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "SniperChallengeRun" WHERE "id" = $1`,
      id,
    );
    return rows?.[0] || null;
  } catch (e) {
    logger.error("[SniperChallenge] findRun failed", { error: e.message });
    return null;
  }
}

async function findActiveRun(guildId) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "SniperChallengeRun" WHERE "guildId" = $1 AND "status" = 'ACTIVE' ORDER BY "spawnedAt" DESC LIMIT 1`,
      guildId,
    );
    return rows?.[0] || null;
  } catch (e) {
    logger.error("[SniperChallenge] findActiveRun failed", {
      error: e.message,
    });
    return null;
  }
}

async function createRun(data) {
  try {
    const id = cuid();
    const keys = Object.keys(data);
    const cols = ["id", ...keys];
    const vals = [id, ...keys.map((k) => data[k])];
    const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(", ");
    const colList = cols.map((c) => `"${c}"`).join(", ");
    await prisma.$executeRawUnsafe(
      `INSERT INTO "SniperChallengeRun" (${colList}) VALUES (${placeholders})`,
      ...vals,
    );
    return findRun(id);
  } catch (e) {
    logger.error("[SniperChallenge] createRun failed", { error: e.message });
    return null;
  }
}

async function updateRun(id, data) {
  try {
    const keys = Object.keys(data);
    if (keys.length === 0) return findRun(id);
    const setClauses = keys.map((k, idx) => `"${k}" = $${idx + 1}`).join(", ");
    const vals = keys.map((k) => data[k]);
    await prisma.$executeRawUnsafe(
      `UPDATE "SniperChallengeRun" SET ${setClauses} WHERE "id" = $${keys.length + 1}`,
      ...vals,
      id,
    );
    return findRun(id);
  } catch (e) {
    logger.error("[SniperChallenge] updateRun failed", { error: e.message });
    return null;
  }
}

async function updateRunMany(where, data) {
  try {
    const keys = Object.keys(data);
    const setClauses = keys.map((k, idx) => `"${k}" = $${idx + 1}`).join(", ");
    const vals = keys.map((k) => data[k]);
    let whereClause = "";
    const whereParams = [];
    let i = keys.length + 1;
    if (where.id && where.id.in) {
      whereClause = `"id" IN (${where.id.in.map((_, idx) => `$${i + idx}`).join(", ")})`;
      whereParams.push(...where.id.in);
      i += where.id.in.length;
    }
    if (where.status) {
      if (whereClause) whereClause += " AND ";
      whereClause += `"status" = $${i++}`;
      whereParams.push(where.status);
    }
    if (where.winnerId !== undefined) {
      if (whereClause) whereClause += " AND ";
      whereClause += `"winnerId" IS NULL`;
    }
    if (!whereClause) return { count: 0 };
    const result = await prisma.$executeRawUnsafe(
      `UPDATE "SniperChallengeRun" SET ${setClauses} WHERE ${whereClause}`,
      ...vals,
      ...whereParams,
    );
    return { count: result };
  } catch (e) {
    logger.error("[SniperChallenge] updateRunMany failed", {
      error: e.message,
    });
    return { count: 0 };
  }
}

async function findExpiredRuns() {
  try {
    return await prisma.$queryRawUnsafe(
      `SELECT * FROM "SniperChallengeRun" WHERE "status" = 'ACTIVE' AND "expiresAt" <= NOW()`,
    );
  } catch (e) {
    logger.error("[SniperChallenge] findExpiredRuns failed", {
      error: e.message,
    });
    return [];
  }
}

async function deleteRuns(where) {
  try {
    let query = `DELETE FROM "SniperChallengeRun" WHERE 1=1`;
    const params = [];
    let i = 1;
    if (where.guildId) {
      query += ` AND "guildId" = $${i++}`;
      params.push(where.guildId);
    }
    if (where.status && where.status.in) {
      query += ` AND "status" IN (${where.status.in.map((_, idx) => `$${i + idx}`).join(", ")})`;
      params.push(...where.status.in);
      i += where.status.in.length;
    }
    if (where.createdAt && where.createdAt.lte) {
      query += ` AND "createdAt" <= $${i++}`;
      params.push(where.createdAt.lte);
    }
    if (where.id && where.id.in) {
      query += ` AND "id" IN (${where.id.in.map((_, idx) => `$${i + idx}`).join(", ")})`;
      params.push(...where.id.in);
      i += where.id.in.length;
    }
    const result = await prisma.$executeRawUnsafe(query, ...params);
    return { count: result };
  } catch (e) {
    logger.error("[SniperChallenge] deleteRuns failed", { error: e.message });
    return { count: 0 };
  }
}

// ── Player Stats ───────────────────────────────────────────────────────────

async function findStats(guildId, userId) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "SniperPlayerStats" WHERE "guildId" = $1 AND "userId" = $2`,
      guildId,
      userId,
    );
    return rows?.[0] || null;
  } catch (e) {
    logger.error("[SniperChallenge] findStats failed", { error: e.message });
    return null;
  }
}

async function upsertStats(guildId, userId, data) {
  try {
    const existing = await findStats(guildId, userId);
    if (!existing) {
      const id = cuid();
      const keys = Object.keys(data);
      const cols = ["id", "guildId", "userId", ...keys];
      const vals = [id, guildId, userId, ...keys.map((k) => data[k])];
      const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(", ");
      const colList = cols.map((c) => `"${c}"`).join(", ");
      await prisma.$executeRawUnsafe(
        `INSERT INTO "SniperPlayerStats" (${colList}) VALUES (${placeholders})`,
        ...vals,
      );
    } else {
      const keys = Object.keys(data);
      if (keys.length > 0) {
        const setClauses = keys
          .map((k, idx) => `"${k}" = $${idx + 1}`)
          .join(", ");
        const vals = keys.map((k) => data[k]);
        await prisma.$executeRawUnsafe(
          `UPDATE "SniperPlayerStats" SET ${setClauses} WHERE "guildId" = $${keys.length + 1} AND "userId" = $${keys.length + 2}`,
          ...vals,
          guildId,
          userId,
        );
      }
    }
    return findStats(guildId, userId);
  } catch (e) {
    logger.error("[SniperChallenge] upsertStats failed", { error: e.message });
    return null;
  }
}

async function updateStats(guildId, userId, data) {
  try {
    const keys = Object.keys(data);
    if (keys.length === 0) return findStats(guildId, userId);
    const setClauses = keys.map((k, idx) => `"${k}" = $${idx + 1}`).join(", ");
    const vals = keys.map((k) => data[k]);
    await prisma.$executeRawUnsafe(
      `UPDATE "SniperPlayerStats" SET ${setClauses} WHERE "guildId" = $${keys.length + 1} AND "userId" = $${keys.length + 2}`,
      ...vals,
      guildId,
      userId,
    );
    return findStats(guildId, userId);
  } catch (e) {
    logger.error("[SniperChallenge] updateStats failed", { error: e.message });
    return null;
  }
}

async function findTopPlayers(guildId, limit = 10) {
  try {
    return await prisma.$queryRawUnsafe(
      `SELECT * FROM "SniperPlayerStats" WHERE "guildId" = $1 ORDER BY "totalWins" DESC LIMIT $2`,
      guildId,
      limit,
    );
  } catch (e) {
    logger.error("[SniperChallenge] findTopPlayers failed", {
      error: e.message,
    });
    return [];
  }
}

async function deleteStats(where) {
  try {
    let query = `DELETE FROM "SniperPlayerStats" WHERE 1=1`;
    const params = [];
    let i = 1;
    if (where.guildId) {
      query += ` AND "guildId" = $${i++}`;
      params.push(where.guildId);
    }
    const result = await prisma.$executeRawUnsafe(query, ...params);
    return { count: result };
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
        "guildId" TEXT NOT NULL, "channelId" TEXT NOT NULL,
        "messageId" TEXT,
        "status" "SniperChallengeStatus" NOT NULL DEFAULT 'ACTIVE',
        "spawnedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "winnerId" TEXT, "wonAt" TIMESTAMPTZ, "reactionTimeMs" INTEGER,
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
        "guildId" TEXT NOT NULL, "userId" TEXT NOT NULL,
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
