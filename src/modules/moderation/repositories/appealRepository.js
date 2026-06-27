"use strict";

const prisma = require("../../../lib/prisma");
const { generateAppealId } = require("../../../lib/publicIdGenerator");

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
 * Do NOT use this for new appeal creation.
 */
async function getNextAppealNumber(guildId) {
  const lastAppeal = await prisma.appeal.findFirst({
    where: { guildId },
    orderBy: { createdAt: "desc" },
  });

  if (!lastAppeal || !lastAppeal.publicId) {
    return 1;
  }

  const match = lastAppeal.publicId.match(/\d+$/);
  if (match) {
    return parseInt(match[0], 10) + 1;
  }

  return 1;
}

/**
 * Global count helper.
 *
 * No Prisma schema change required.
 * Generates global APP-001, APP-002, etc.
 */
async function getNextGlobalAppealNumber() {
  const count = await prisma.appeal.count();
  return count + 1;
}

/**
 * Create an appeal.
 *
 * Ignores unsafe old publicIds passed from service code.
 */
async function createAppeal(data) {
  const maxAttempts = 50;
  const startNumber = await getNextGlobalAppealNumber();

  const cleanData = { ...data };
  delete cleanData.publicId;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const publicId = generateAppealId(startNumber + attempt);

    try {
      return await prisma.appeal.create({
        data: {
          ...cleanData,
          publicId,
        },
        include: {
          case: true,
        },
      });
    } catch (error) {
      if (isPublicIdCollision(error) && attempt < maxAttempts - 1) {
        console.warn(
          `[Appeal] publicId collision for ${publicId}. Trying next ID...`,
        );
        continue;
      }

      throw error;
    }
  }

  throw new Error("Failed to create appeal after publicId retries.");
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

  if (!appeal) {
    throw new Error("Appeal not found");
  }

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
