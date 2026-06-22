"use strict";

const prisma = require("../../../lib/prisma");

/**
 * Get next appeal number for a guild
 */
async function getNextAppealNumber(guildId) {
  const lastAppeal = await prisma.appeal.findFirst({
    where: { guildId },
    orderBy: { createdAt: "desc" },
  });

  if (!lastAppeal || !lastAppeal.publicId) {
    return 1;
  }

  // Extract number from publicId (e.g., "APL123" -> 123)
  const match = lastAppeal.publicId.match(/\d+$/);
  if (match) {
    return parseInt(match[0]) + 1;
  }

  return 1;
}

/**
 * Create an appeal
 */
async function createAppeal(data) {
  return prisma.appeal.create({
    data,
    include: {
      case: true,
    },
  });
}

/**
 * Get appeal by public ID
 */
async function getAppealByPublicId(publicId) {
  return prisma.appeal.findUnique({
    where: { publicId },
    include: {
      case: {
        include: {
          roleSnapshot: true,
        },
      },
    },
  });
}

/**
 * Get appeal by case ID
 */
async function getAppealByCaseId(caseId) {
  return prisma.appeal.findFirst({
    where: { caseId },
    orderBy: { createdAt: "desc" },
    include: {
      case: true,
    },
  });
}

/**
 * Check if case has open appeal
 */
async function hasOpenAppeal(caseId) {
  const appeal = await prisma.appeal.findFirst({
    where: {
      caseId,
      status: {
        in: ["OPEN", "PENDING"],
      },
    },
  });

  return !!appeal;
}

/**
 * Update appeal status
 */
async function updateAppealStatus(appealId, status, additionalData = {}) {
  return prisma.appeal.update({
    where: { id: appealId },
    data: {
      status,
      ...additionalData,
    },
  });
}

/**
 * Close appeal
 */
async function closeAppeal(appealId, closedBy, outcome = null) {
  return prisma.appeal.update({
    where: { id: appealId },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      closedBy,
      outcome,
    },
  });
}

/**
 * Add staff note to appeal
 */
async function addStaffNote(appealId, note) {
  const appeal = await prisma.appeal.findUnique({
    where: { id: appealId },
  });

  const existingNotes = appeal.staffNotes || "";
  const timestamp = new Date().toISOString();
  const newNote = `[${timestamp}] ${note}`;
  const updatedNotes = existingNotes ? `${existingNotes}\n${newNote}` : newNote;

  return prisma.appeal.update({
    where: { id: appealId },
    data: {
      staffNotes: updatedNotes,
    },
  });
}

/**
 * Get open appeals for a guild
 */
async function getOpenAppeals(guildId) {
  return prisma.appeal.findMany({
    where: {
      guildId,
      status: {
        in: ["OPEN", "PENDING"],
      },
    },
    include: {
      case: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get user's appeal history
 */
async function getUserAppeals(guildId, userId) {
  return prisma.appeal.findMany({
    where: {
      guildId,
      userId,
    },
    include: {
      case: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

module.exports = {
  createAppeal,
  getAppealByPublicId,
  getAppealByCaseId,
  hasOpenAppeal,
  updateAppealStatus,
  closeAppeal,
  addStaffNote,
  getOpenAppeals,
  getUserAppeals,
  getNextAppealNumber,
};
