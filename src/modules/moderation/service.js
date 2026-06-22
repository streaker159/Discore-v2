"use strict";

const prisma = require("../../lib/prisma");
const { generateModerationId } = require("../../lib/publicIdGenerator");

/**
 * Create a moderation case
 * @param {Object} data
 * @param {string} data.guildId
 * @param {string} data.userId
 * @param {string} data.moderatorId
 * @param {string} data.actionType - WARN, MUTE, TIMEOUT, BAN, PROBATION
 * @param {string} data.reason
 * @param {number} [data.durationSeconds]
 * @param {DateTime} [data.expiresAt]
 * @returns {Promise<Object>}
 */
async function createCase(data) {
  const publicId = await generateModerationId(async (id) => {
    const exists = await prisma.moderationCase.findUnique({
      where: { publicId: id },
    });
    return !!exists;
  });

  const moderationCase = await prisma.moderationCase.create({
    data: {
      publicId,
      guildId: data.guildId,
      userId: data.userId,
      moderatorId: data.moderatorId,
      actionType: data.actionType,
      reason: data.reason,
      durationSeconds: data.durationSeconds,
      expiresAt: data.expiresAt,
      status: "ACTIVE",
    },
  });

  return moderationCase;
}

/**
 * Get a moderation case by public ID
 * @param {string} publicId
 * @returns {Promise<Object|null>}
 */
async function getCase(publicId) {
  return prisma.moderationCase.findUnique({
    where: { publicId },
    include: {
      appeals: true,
      roleSnapshot: true,
    },
  });
}

/**
 * Get all cases for a user in a guild
 * @param {string} guildId
 * @param {string} userId
 * @returns {Promise<Array>}
 */
async function getUserCases(guildId, userId) {
  return prisma.moderationCase.findMany({
    where: { guildId, userId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get active cases for a user
 * @param {string} guildId
 * @param {string} userId
 * @returns {Promise<Array>}
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
 * Revoke a moderation case
 * @param {string} publicId
 * @param {string} revokedBy - Discord user ID
 * @returns {Promise<Object>}
 */
async function revokeCase(publicId, revokedBy) {
  return prisma.moderationCase.update({
    where: { publicId },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
      revokedBy,
    },
  });
}

/**
 * Mark case as expired
 * @param {string} caseId
 * @returns {Promise<Object>}
 */
async function expireCase(caseId) {
  return prisma.moderationCase.update({
    where: { id: caseId },
    data: { status: "EXPIRED" },
  });
}

/**
 * Get expired cases that need processing
 * @returns {Promise<Array>}
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
 * Save role snapshot before removing roles
 * @param {string} caseId
 * @param {string} guildId
 * @param {string} userId
 * @param {string[]} roleIds
 * @returns {Promise<Object>}
 */
async function saveRoleSnapshot(caseId, guildId, userId, roleIds) {
  const cleanupAfter = new Date();
  cleanupAfter.setDate(cleanupAfter.getDate() + 30); // Cleanup after 30 days

  return prisma.userRoleSnapshot.create({
    data: {
      caseId,
      guildId,
      userId,
      roleIds,
      cleanupAfter,
    },
  });
}

/**
 * Get role snapshot for a case
 * @param {string} caseId
 * @returns {Promise<Object|null>}
 */
async function getRoleSnapshot(caseId) {
  return prisma.userRoleSnapshot.findUnique({
    where: { caseId },
  });
}

module.exports = {
  createCase,
  getCase,
  getUserCases,
  getActiveCases,
  revokeCase,
  expireCase,
  getExpiredCases,
  saveRoleSnapshot,
  getRoleSnapshot,
};
