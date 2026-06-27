"use strict";

const prisma = require("../../../lib/prisma");

let tablesReady = false;

async function ensureTables() {
  if (tablesReady) return;

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "TrackedRole" (
      "guildId" TEXT NOT NULL,
      "roleId" TEXT NOT NULL,
      "purpose" TEXT NOT NULL DEFAULT 'SCOREBOARD',
      "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TrackedRole_pkey" PRIMARY KEY ("guildId", "roleId")
    )
  `;

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "TrackedRoleMember" (
      "guildId" TEXT NOT NULL,
      "roleId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TrackedRoleMember_pkey" PRIMARY KEY ("guildId", "roleId", "userId")
    )
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "TrackedRoleMember_guild_role_idx"
    ON "TrackedRoleMember" ("guildId", "roleId")
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "TrackedRoleMember_guild_user_idx"
    ON "TrackedRoleMember" ("guildId", "userId")
  `;

  tablesReady = true;
}

async function trackRole(guildId, roleId, purpose = "SCOREBOARD") {
  await ensureTables();

  await prisma.$executeRaw`
    INSERT INTO "TrackedRole" ("guildId", "roleId", "purpose", "enabled", "createdAt", "updatedAt")
    VALUES (${guildId}, ${roleId}, ${purpose}, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("guildId", "roleId")
    DO UPDATE SET
      "purpose" = EXCLUDED."purpose",
      "enabled" = TRUE,
      "updatedAt" = CURRENT_TIMESTAMP
  `;
}

async function untrackRole(guildId, roleId) {
  await ensureTables();

  await prisma.$executeRaw`
    UPDATE "TrackedRole"
    SET "enabled" = FALSE, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "guildId" = ${guildId} AND "roleId" = ${roleId}
  `;
}

async function getTrackedRoles(guildId) {
  await ensureTables();

  return prisma.$queryRaw`
    SELECT "guildId", "roleId", "purpose", "enabled", "createdAt", "updatedAt"
    FROM "TrackedRole"
    WHERE "guildId" = ${guildId} AND "enabled" = TRUE
  `;
}

async function upsertRoleMember(guildId, roleId, userId) {
  await ensureTables();

  await prisma.$executeRaw`
    INSERT INTO "TrackedRoleMember" ("guildId", "roleId", "userId", "joinedAt", "updatedAt")
    VALUES (${guildId}, ${roleId}, ${userId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("guildId", "roleId", "userId")
    DO UPDATE SET "updatedAt" = CURRENT_TIMESTAMP
  `;
}

async function removeRoleMember(guildId, roleId, userId) {
  await ensureTables();

  await prisma.$executeRaw`
    DELETE FROM "TrackedRoleMember"
    WHERE "guildId" = ${guildId} AND "roleId" = ${roleId} AND "userId" = ${userId}
  `;
}

async function removeUserFromGuild(guildId, userId) {
  await ensureTables();

  await prisma.$executeRaw`
    DELETE FROM "TrackedRoleMember"
    WHERE "guildId" = ${guildId} AND "userId" = ${userId}
  `;
}

async function getRoleMembers(guildId, roleId) {
  await ensureTables();

  return prisma.$queryRaw`
    SELECT "guildId", "roleId", "userId", "joinedAt", "updatedAt"
    FROM "TrackedRoleMember"
    WHERE "guildId" = ${guildId} AND "roleId" = ${roleId}
    ORDER BY "joinedAt" ASC
  `;
}

module.exports = {
  ensureTables,
  trackRole,
  untrackRole,
  getTrackedRoles,
  upsertRoleMember,
  removeRoleMember,
  removeUserFromGuild,
  getRoleMembers,
};
