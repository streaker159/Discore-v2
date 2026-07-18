"use strict";

const prisma = require("../../lib/prisma");
const logger = require("../../lib/logger");
const crypto = require("crypto");

function cuid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function buildSetClauses(keys) {
  return keys
    .map((k, idx) => {
      if (k === "status")
        return `"status" = CAST($${idx + 1} AS "AssassinGameStatus")`;
      if (k === "role") return `"role" = CAST($${idx + 1} AS "AssassinRole")`;
      if (k === "playerStatus")
        return `"status" = CAST($${idx + 1} AS "AssassinPlayerStatus")`;
      return `"${k}" = $${idx + 1}`;
    })
    .join(", ");
}

// ── Config ─────────────────────────────────────────────────────────────────

async function findConfig(guildId) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "AssassinGameConfig" WHERE "guildId" = $1`,
      guildId,
    );
    return rows?.[0] || null;
  } catch (e) {
    logger.error("[Assassin] findConfig failed", {
      guildId,
      error: e.message,
    });
    return null;
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
        `INSERT INTO "AssassinGameConfig" (${colList}) VALUES (${placeholders})`,
        ...vals,
      );
    } else {
      const keys = Object.keys(data);
      if (keys.length > 0) {
        const setClauses = buildSetClauses(keys);
        const vals = keys.map((k) => data[k]);
        await prisma.$executeRawUnsafe(
          `UPDATE "AssassinGameConfig" SET ${setClauses} WHERE "guildId" = $${keys.length + 1}`,
          ...vals,
          guildId,
        );
      }
    }
    return findConfig(guildId);
  } catch (e) {
    logger.error("[Assassin] upsertConfig failed", {
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
    const setClauses = buildSetClauses(keys);
    const vals = keys.map((k) => data[k]);
    await prisma.$executeRawUnsafe(
      `UPDATE "AssassinGameConfig" SET ${setClauses} WHERE "guildId" = $${keys.length + 1}`,
      ...vals,
      guildId,
    );
    return findConfig(guildId);
  } catch (e) {
    logger.error("[Assassin] updateConfig failed", {
      guildId,
      error: e.message,
    });
    return null;
  }
}

async function deleteConfig(guildId) {
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "AssassinGameConfig" WHERE "guildId" = $1`,
      guildId,
    );
  } catch (e) {
    logger.error("[Assassin] deleteConfig failed", {
      guildId,
      error: e.message,
    });
  }
}

// ── Games ──────────────────────────────────────────────────────────────────

async function createGame(data) {
  try {
    const id = cuid();
    const keys = Object.keys(data);
    const cols = ["id", ...keys];
    const vals = [id];
    const phs = ["$1"];
    for (let idx = 0; idx < keys.length; idx++) {
      const k = keys[idx];
      vals.push(data[k]);
      if (k === "status") phs.push(`CAST($${idx + 2} AS "AssassinGameStatus")`);
      else phs.push(`$${idx + 2}`);
    }
    const colList = cols.map((c) => `"${c}"`).join(", ");
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AssassinGame" (${colList}) VALUES (${phs.join(", ")})`,
      ...vals,
    );
    return findGame(id);
  } catch (e) {
    logger.error("[Assassin] createGame failed", { error: e.message });
    return null;
  }
}

async function findGame(id) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "AssassinGame" WHERE "id" = $1`,
      id,
    );
    return rows?.[0] || null;
  } catch (e) {
    logger.error("[Assassin] findGame failed", { error: e.message });
    return null;
  }
}

async function findActiveGame(guildId) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "AssassinGame" WHERE "guildId" = $1 AND "status" IN ('SIGNUPS','ACTIVE') ORDER BY "createdAt" DESC LIMIT 1`,
      guildId,
    );
    return rows?.[0] || null;
  } catch (e) {
    logger.error("[Assassin] findActiveGame failed", { error: e.message });
    return null;
  }
}

async function updateGame(id, data) {
  try {
    const keys = Object.keys(data);
    if (keys.length === 0) return findGame(id);
    const setClauses = buildSetClauses(keys);
    const vals = keys.map((k) => data[k]);
    await prisma.$executeRawUnsafe(
      `UPDATE "AssassinGame" SET ${setClauses} WHERE "id" = $${keys.length + 1}`,
      ...vals,
      id,
    );
    return findGame(id);
  } catch (e) {
    logger.error("[Assassin] updateGame failed", { error: e.message });
    return null;
  }
}

// ── Players ────────────────────────────────────────────────────────────────

async function addPlayer(data) {
  try {
    const id = cuid();
    const keys = Object.keys(data);
    const cols = ["id", ...keys];
    const vals = [id, ...keys.map((k) => data[k])];
    const phs = cols.map((_, idx) => {
      const k = idx === 0 ? null : keys[idx - 1];
      if (k === "role") return `CAST($${idx + 1} AS "AssassinRole")`;
      if (k === "status") return `CAST($${idx + 1} AS "AssassinPlayerStatus")`;
      return `$${idx + 1}`;
    });
    const colList = cols.map((c) => `"${c}"`).join(", ");
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AssassinPlayer" (${colList}) VALUES (${phs.join(", ")})`,
      ...vals,
    );
    return findPlayer(data.gameId, data.userId);
  } catch (e) {
    logger.error("[Assassin] addPlayer failed", { error: e.message });
    return null;
  }
}

async function findPlayer(gameId, userId) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "AssassinPlayer" WHERE "gameId" = $1 AND "userId" = $2`,
      gameId,
      userId,
    );
    return rows?.[0] || null;
  } catch (e) {
    logger.error("[Assassin] findPlayer failed", { error: e.message });
    return null;
  }
}

async function findPlayersByGame(gameId) {
  try {
    return await prisma.$queryRawUnsafe(
      `SELECT * FROM "AssassinPlayer" WHERE "gameId" = $1 ORDER BY "joinedAt" ASC`,
      gameId,
    );
  } catch (e) {
    logger.error("[Assassin] findPlayersByGame failed", { error: e.message });
    return [];
  }
}

async function findAlivePlayers(gameId) {
  try {
    return await prisma.$queryRawUnsafe(
      `SELECT * FROM "AssassinPlayer" WHERE "gameId" = $1 AND "status" = 'ALIVE' ORDER BY "joinedAt" ASC`,
      gameId,
    );
  } catch (e) {
    logger.error("[Assassin] findAlivePlayers failed", { error: e.message });
    return [];
  }
}

/**
 * Atomically eliminate a player. Uses WHERE status='ALIVE' to prevent race conditions.
 * Returns the number of rows affected (1 = success, 0 = already dead).
 */
async function eliminatePlayer(gameId, userId, killedById) {
  try {
    const result = await prisma.$executeRawUnsafe(
      `UPDATE "AssassinPlayer" SET "status" = CAST('DEAD' AS "AssassinPlayerStatus"), "killedAt" = NOW(), "killedById" = $3 WHERE "gameId" = $1 AND "userId" = $2 AND "status" = CAST('ALIVE' AS "AssassinPlayerStatus")`,
      gameId,
      userId,
      killedById,
    );
    return result;
  } catch (e) {
    logger.error("[Assassin] eliminatePlayer failed", { error: e.message });
    return 0;
  }
}

/**
 * Atomically eliminate a killer (one-shot miss). Also sets their role to DEAD.
 */
async function eliminateKiller(gameId, userId) {
  try {
    const result = await prisma.$executeRawUnsafe(
      `UPDATE "AssassinPlayer" SET "status" = CAST('DEAD' AS "AssassinPlayerStatus"), "killedAt" = NOW() WHERE "gameId" = $1 AND "userId" = $2 AND "status" = CAST('ALIVE' AS "AssassinPlayerStatus")`,
      gameId,
      userId,
    );
    return result;
  } catch (e) {
    logger.error("[Assassin] eliminateKiller failed", { error: e.message });
    return 0;
  }
}

/**
 * Find which player has the given user as their role=ASSASSIN target (for game over checks).
 * In the new design there's no targetId — but we check role.
 */
async function findTargetInGame(gameId) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "AssassinPlayer" WHERE "gameId" = $1 AND "role" = CAST('TARGET' AS "AssassinRole") AND "status" = CAST('ALIVE' AS "AssassinPlayerStatus") LIMIT 1`,
      gameId,
    );
    return rows?.[0] || null;
  } catch (e) {
    logger.error("[Assassin] findTargetInGame failed", { error: e.message });
    return null;
  }
}

async function countAliveAssassins(gameId) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM "AssassinPlayer" WHERE "gameId" = $1 AND "role" = CAST('ASSASSIN' AS "AssassinRole") AND "status" = CAST('ALIVE' AS "AssassinPlayerStatus")`,
      gameId,
    );
    return rows?.[0]?.count || 0;
  } catch (e) {
    logger.error("[Assassin] countAliveAssassins failed", { error: e.message });
    return 0;
  }
}

async function incrementKill(gameId, userId) {
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "AssassinPlayer" SET "kills" = "kills" + 1 WHERE "gameId" = $1 AND "userId" = $2`,
      gameId,
      userId,
    );
  } catch (e) {
    logger.error("[Assassin] incrementKill failed", { error: e.message });
  }
}

// ── Stats ──────────────────────────────────────────────────────────────────

async function findStats(guildId, userId) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "AssassinPlayerStats" WHERE "guildId" = $1 AND "userId" = $2`,
      guildId,
      userId,
    );
    return rows?.[0] || null;
  } catch (e) {
    logger.error("[Assassin] findStats failed", { error: e.message });
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
        `INSERT INTO "AssassinPlayerStats" (${colList}) VALUES (${placeholders})`,
        ...vals,
      );
    } else {
      const keys = Object.keys(data);
      if (keys.length > 0) {
        const setClauses = buildSetClauses(keys);
        const vals = keys.map((k) => data[k]);
        await prisma.$executeRawUnsafe(
          `UPDATE "AssassinPlayerStats" SET ${setClauses} WHERE "guildId" = $${keys.length + 1} AND "userId" = $${keys.length + 2}`,
          ...vals,
          guildId,
          userId,
        );
      }
    }
    return findStats(guildId, userId);
  } catch (e) {
    logger.error("[Assassin] upsertStats failed", { error: e.message });
    return null;
  }
}

async function updateStats(guildId, userId, data) {
  try {
    const keys = Object.keys(data);
    if (keys.length === 0) return findStats(guildId, userId);
    const setClauses = buildSetClauses(keys);
    const vals = keys.map((k) => data[k]);
    await prisma.$executeRawUnsafe(
      `UPDATE "AssassinPlayerStats" SET ${setClauses} WHERE "guildId" = $${keys.length + 1} AND "userId" = $${keys.length + 2}`,
      ...vals,
      guildId,
      userId,
    );
    return findStats(guildId, userId);
  } catch (e) {
    logger.error("[Assassin] updateStats failed", { error: e.message });
    return null;
  }
}

async function findTopPlayers(guildId, limit = 10) {
  try {
    return await prisma.$queryRawUnsafe(
      `SELECT * FROM "AssassinPlayerStats" WHERE "guildId" = $1 ORDER BY "gamesWon" DESC, "totalKills" DESC LIMIT $2`,
      guildId,
      limit,
    );
  } catch (e) {
    logger.error("[Assassin] findTopPlayers failed", { error: e.message });
    return [];
  }
}

// ── Cleanup ────────────────────────────────────────────────────────────────

async function deleteOldGames(guildId, statuses, olderThan) {
  try {
    const statusList = statuses.map((s) => `'${s}'`).join(", ");
    return await prisma.$executeRawUnsafe(
      `DELETE FROM "AssassinGame" WHERE "guildId" = $1 AND "status"::text IN (${statusList}) AND "createdAt" <= $2`,
      guildId,
      olderThan,
    );
  } catch (e) {
    logger.error("[Assassin] deleteOldGames failed", { error: e.message });
    return 0;
  }
}

// ─── Table creation ─────────────────────────────────────────────────────────

async function ensureTables() {
  try {
    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssassinGameStatus') THEN CREATE TYPE "AssassinGameStatus" AS ENUM ('SIGNUPS','ACTIVE','COMPLETED','CANCELLED'); END IF; END $$;`,
    );
  } catch {}
  try {
    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssassinRole') THEN CREATE TYPE "AssassinRole" AS ENUM ('TARGET','ASSASSIN'); END IF; END $$;`,
    );
  } catch {}
  try {
    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssassinPlayerStatus') THEN CREATE TYPE "AssassinPlayerStatus" AS ENUM ('ALIVE','DEAD'); END IF; END $$;`,
    );
  } catch {}
  try {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "AssassinGameConfig" ("id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,"guildId" TEXT UNIQUE NOT NULL,"enabled" BOOLEAN NOT NULL DEFAULT false,"gameChannelId" TEXT,"winnerRoleId" TEXT,"minPlayers" INTEGER NOT NULL DEFAULT 4,"killCooldownSeconds" INTEGER NOT NULL DEFAULT 120,"dmEnabled" BOOLEAN NOT NULL DEFAULT true,"timeLimitHours" INTEGER,"leaderboardChannelId" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());`,
    );
  } catch (e) {
    logger.warn("[Assassin] Config table ensure", { error: e.message });
  }
  try {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "AssassinGame" ("id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,"guildId" TEXT NOT NULL,"status" "AssassinGameStatus" NOT NULL DEFAULT 'SIGNUPS',"startedBy" TEXT NOT NULL,"gameChannelId" TEXT NOT NULL,"signupMessageId" TEXT,"gameboardMessageId" TEXT,"totalPlayers" INTEGER NOT NULL DEFAULT 0,"playersAlive" INTEGER NOT NULL DEFAULT 0,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"startedAt" TIMESTAMPTZ,"endedAt" TIMESTAMPTZ,"winnerId" TEXT,"leaderboardMessageId" TEXT);`,
    );
  } catch (e) {
    logger.warn("[Assassin] Game table ensure", { error: e.message });
  }
  try {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "AssassinPlayer" ("id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,"gameId" TEXT NOT NULL,"userId" TEXT NOT NULL,"role" "AssassinRole" NOT NULL,"status" "AssassinPlayerStatus" NOT NULL DEFAULT 'ALIVE',"kills" INTEGER NOT NULL DEFAULT 0,"joinedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"killedAt" TIMESTAMPTZ,"killedById" TEXT,UNIQUE("gameId","userId"));`,
    );
  } catch (e) {
    logger.warn("[Assassin] Player table ensure", { error: e.message });
  }
  try {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "AssassinPlayerStats" ("id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,"guildId" TEXT NOT NULL,"userId" TEXT NOT NULL,"gamesPlayed" INTEGER NOT NULL DEFAULT 0,"gamesWon" INTEGER NOT NULL DEFAULT 0,"totalKills" INTEGER NOT NULL DEFAULT 0,"bestKillsInGame" INTEGER NOT NULL DEFAULT 0,"wrongKills" INTEGER NOT NULL DEFAULT 0,"survivedGames" INTEGER NOT NULL DEFAULT 0,"lastPlayedAt" TIMESTAMPTZ,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE("guildId","userId"));`,
    );
  } catch (e) {
    logger.warn("[Assassin] Stats table ensure", { error: e.message });
  }
  // Add missing columns safely
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "AssassinGameConfig" ADD COLUMN IF NOT EXISTS "leaderboardChannelId" TEXT`,
    );
  } catch {}
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "AssassinGame" ADD COLUMN IF NOT EXISTS "leaderboardMessageId" TEXT`,
    );
  } catch {}
  logger.info("[Assassin] Database tables ensured");
}

module.exports = {
  ensureTables,
  findConfig,
  upsertConfig,
  updateConfig,
  deleteConfig,
  createGame,
  findGame,
  findActiveGame,
  updateGame,
  addPlayer,
  findPlayer,
  findPlayersByGame,
  findAlivePlayers,
  eliminatePlayer,
  eliminateKiller,
  findTargetInGame,
  countAliveAssassins,
  incrementKill,
  findStats,
  upsertStats,
  updateStats,
  findTopPlayers,
  deleteOldGames,
  deletePlayersByGame,
};
