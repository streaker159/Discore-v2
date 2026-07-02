"use strict";

const prisma = require("../../../lib/prisma");
const { generateModerationId } = require("../../../lib/publicIdGenerator");

/**
 * Prisma unique collision helper.
 */
function isPublicIdCollision(error) {
  const target = error?.meta?.target;

  return (
    error?.code === "P2002" &&
    (target === "publicId" ||
      (Array.isArray(target) && target.includes("publicId")) ||
      String(target || "").includes("publicId"))
  );
}

/**
 * Legacy helper.
 *
 * Keep this temporarily so old imports do not crash.
 * Do NOT use this for new moderation case creation.
 */
async function getNextCaseNumber(guildId) {
  const lastCase = await prisma.moderationCase.findFirst({
    where: { guildId },
    orderBy: { createdAt: "desc" },
  });

  if (!lastCase || !lastCase.publicId) {
    return 1;
  }

  const match = lastCase.publicId.match(/\d+$/);
  if (match) {
    return parseInt(match[0], 10) + 1;
  }

  return 1;
}

/**
 * Global count helper.
 *
 * We are NOT changing Prisma yet, so publicId remains globally unique.
 * This produces global MOD-001, MOD-002, etc.
 */
async function getNextGlobalCaseNumber() {
  const count = await prisma.moderationCase.count();
  return count + 1;
}

/**
 * Create a moderation case.
 *
 * No Prisma schema changes required.
 * Generates simple IDs like MOD-001, MOD-002.
 *
 * Important:
 * This ignores any publicId passed from old service code so MOD1 never sneaks back in.
 */
async function createModerationCase(data) {
  const maxAttempts = 50;
  const startNumber = await getNextGlobalCaseNumber();

  const cleanData = { ...data };
  delete cleanData.publicId;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const publicId = generateModerationId(startNumber + attempt);

    try {
      return await prisma.moderationCase.create({
        data: {
          ...cleanData,
          publicId,
        },
        include: {
          appeals: true,
          roleSnapshot: true,
        },
      });
    } catch (error) {
      if (isPublicIdCollision(error) && attempt < maxAttempts - 1) {
        console.warn(
          `[Moderation] publicId collision for ${publicId}. Trying next ID...`,
        );
        continue;
      }

      throw error;
    }
  }

  throw new Error("Failed to create moderation case after publicId retries.");
}

/**
 * Get case by public ID
 */
async function getCaseByPublicId(publicId) {
  return prisma.moderationCase.findUnique({
    where: { publicId },
    include: {
      appeals: true,
      roleSnapshot: true,
    },
  });
}

/**
 * Get case by internal ID
 */
async function getCaseById(id) {
  return prisma.moderationCase.findUnique({
    where: { id },
    include: {
      appeals: true,
      roleSnapshot: true,
    },
  });
}

/**
 * Get all cases for a user in a guild
 */
async function getUserCases(guildId, userId, options = {}) {
  const where = { guildId, userId };

  if (options.status) where.status = options.status;
  if (options.actionType) where.actionType = options.actionType;

  return prisma.moderationCase.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: options.limit,
    include: {
      appeals: true,
    },
  });
}

/**
 * Get active cases for a user
 */
async function getActiveCases(guildId, userId) {
  return prisma.moderationCase.findMany({
    where: {
      guildId,
      userId,
      status: "ACTIVE",
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get active probation for user.
 */
async function getActiveProbation(guildId, userId) {
  return prisma.moderationCase.findFirst({
    where: {
      guildId,
      userId,
      actionType: "PROBATION",
      status: "ACTIVE",
      expiresAt: {
        gt: new Date(),
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Update case status
 */
async function updateCaseStatus(caseId, status, additionalData = {}) {
  return prisma.moderationCase.update({
    where: { id: caseId },
    data: {
      status,
      ...additionalData,
    },
  });
}

/**
 * Update case appeal status
 */
async function updateCaseAppealStatus(caseId, appealStatus) {
  return prisma.moderationCase.update({
    where: { id: caseId },
    data: { appealStatus },
  });
}

/**
 * Revoke a case — marks it as REVOKED (soft-delete).
 *
 * Revoked cases remain in the database for audit purposes
 * but are hidden from public /mod cases listings.
 */
async function revokeCase(publicId, revokedBy, reason = null) {
  const moderationCase = await prisma.moderationCase.findUnique({
    where: { publicId },
    include: {
      appeals: true,
      roleSnapshot: true,
    },
  });

  if (!moderationCase) {
    throw new Error("Case not found");
  }

  // Append revocation note to staffNote for audit trail
  const when = new Date().toISOString();
  const revokeNote = reason
    ? `[${when}] REVOKED by ${revokedBy}: ${reason}`
    : `[${when}] REVOKED by ${revokedBy}`;

  const staffNote = moderationCase.staffNote
    ? `${moderationCase.staffNote}\n${revokeNote}`
    : revokeNote;

  // Soft-delete: mark as REVOKED, keep all data
  return prisma.moderationCase.update({
    where: { publicId },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
      revokedBy,
      staffNote,
    },
    include: {
      appeals: true,
      roleSnapshot: true,
    },
  });
}

/**
 * Hard delete a case.
 *
 * Owner/admin cleanup only. Normal revoke should not hard delete.
 */
async function hardDeleteCase(publicId) {
  const moderationCase = await prisma.moderationCase.findUnique({
    where: { publicId },
    include: {
      appeals: true,
      roleSnapshot: true,
    },
  });

  if (!moderationCase) {
    throw new Error("Case not found");
  }

  await prisma.appeal.deleteMany({
    where: { caseId: moderationCase.id },
  });

  await prisma.userRoleSnapshot
    .delete({
      where: { caseId: moderationCase.id },
    })
    .catch(() => {});

  await prisma.moderationCase.delete({
    where: { publicId },
  });

  return moderationCase;
}

/**
 * Get expired cases that need processing
 */
async function getExpiredCases() {
  return prisma.moderationCase.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: {
        lte: new Date(),
      },
    },
    orderBy: { expiresAt: "asc" },
  });
}

/**
 * Get moderation stats for a user
 */
async function getUserModerationStats(guildId, userId) {
  const cases = await prisma.moderationCase.findMany({
    where: { guildId, userId },
    orderBy: { createdAt: "desc" },
  });

  return {
    total: cases.length,
    warns: cases.filter((c) => c.actionType === "WARN").length,
    mutes: cases.filter((c) => c.actionType === "MUTE").length,
    timeouts: cases.filter((c) => c.actionType === "TIMEOUT").length,
    bans: cases.filter(
      (c) => c.actionType === "BAN" || c.actionType === "TEMP_BAN",
    ).length,
    probations: cases.filter((c) => c.actionType === "PROBATION").length,
    active: cases.filter((c) => c.status === "ACTIVE").length,
    revoked: cases.filter((c) => c.status === "REVOKED").length,
    latestCases: cases.slice(0, 5).map((c) => c.publicId),
  };
}

module.exports = {
  createModerationCase,
  getCaseByPublicId,
  getCaseById,
  getUserCases,
  getActiveCases,
  getActiveProbation,
  updateCaseStatus,
  updateCaseAppealStatus,
  revokeCase,
  hardDeleteCase,
  getExpiredCases,
  getUserModerationStats,
  getNextCaseNumber,
};
