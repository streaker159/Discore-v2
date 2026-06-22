"use strict";

const prisma = require("../../../lib/prisma");

/**
 * Get next case number for a guild
 */
async function getNextCaseNumber(guildId) {
  const lastCase = await prisma.moderationCase.findFirst({
    where: { guildId },
    orderBy: { createdAt: "desc" },
  });

  if (!lastCase || !lastCase.publicId) {
    return 1;
  }

  // Extract number from publicId (e.g., "MOD123" -> 123)
  const match = lastCase.publicId.match(/\d+$/);
  if (match) {
    return parseInt(match[0]) + 1;
  }

  return 1;
}

/**
 * Create a moderation case
 */
async function createModerationCase(data) {
  return prisma.moderationCase.create({
    data,
    include: {
      appeals: true,
      roleSnapshot: true,
    },
  });
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
 * Get active probation for user (excludes revoked)
 */
async function getActiveProbation(guildId, userId) {
  return prisma.moderationCase.findFirst({
    where: {
      guildId,
      userId,
      actionType: "PROBATION",
      status: "ACTIVE", // Only ACTIVE, not REVOKED
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
 * Revoke a case (DELETES from database completely)
 */
async function revokeCase(publicId, revokedBy) {
  // Get the case first to return it
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

  // Delete associated appeals first (cascade)
  if (moderationCase.appeals && moderationCase.appeals.length > 0) {
    await prisma.appeal.deleteMany({
      where: { caseId: moderationCase.id },
    });
  }

  // Delete role snapshot if exists
  if (moderationCase.roleSnapshot) {
    await prisma.userRoleSnapshot
      .delete({
        where: { caseId: moderationCase.id },
      })
      .catch(() => {}); // Ignore if doesn't exist
  }

  // Delete the case itself
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
  });
}

/**
 * Get moderation stats for a user
 */
async function getUserModerationStats(guildId, userId) {
  const cases = await prisma.moderationCase.findMany({
    where: { guildId, userId },
  });

  const stats = {
    total: cases.length,
    warns: cases.filter((c) => c.actionType === "WARN").length,
    mutes: cases.filter((c) => c.actionType === "MUTE").length,
    timeouts: cases.filter((c) => c.actionType === "TIMEOUT").length,
    bans: cases.filter((c) => c.actionType === "BAN").length,
    probations: cases.filter((c) => c.actionType === "PROBATION").length,
    active: cases.filter((c) => c.status === "ACTIVE").length,
    revoked: cases.filter((c) => c.status === "REVOKED").length,
    latestCases: cases.slice(0, 5).map((c) => c.publicId),
  };

  return stats;
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
  getExpiredCases,
  getUserModerationStats,
  getNextCaseNumber,
};
