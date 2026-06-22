"use strict";

const prisma = require("../../../lib/prisma");

/**
 * Create role snapshot
 */
async function createRoleSnapshot(caseId, guildId, userId, roleIds) {
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
 * Get role snapshot by case ID
 */
async function getRoleSnapshotByCaseId(caseId) {
  return prisma.userRoleSnapshot.findUnique({
    where: { caseId },
  });
}

/**
 * Delete role snapshot
 */
async function deleteRoleSnapshot(caseId) {
  return prisma.userRoleSnapshot.delete({
    where: { caseId },
  });
}

/**
 * Get expired snapshots for cleanup
 */
async function getExpiredSnapshots() {
  return prisma.userRoleSnapshot.findMany({
    where: {
      cleanupAfter: {
        lte: new Date(),
      },
    },
  });
}

module.exports = {
  createRoleSnapshot,
  getRoleSnapshotByCaseId,
  deleteRoleSnapshot,
  getExpiredSnapshots,
};
