"use strict";

/**
 * Public ID generator for Discore.
 *
 * No Prisma schema changes required.
 *
 * Human-readable IDs:
 * MOD-001, MOD-002, MOD-003
 * APP-001, APP-002, APP-003
 *
 * IMPORTANT:
 * This file only formats IDs.
 * The repository layer checks/avoids collisions.
 */

const PREFIXES = {
  MODERATION: "MOD",
  APPEAL: "APP",
  AUTOMOD: "AMC",
  EVENT: "EVT",
  SCOREBOARD: "SCB",
  PLAYER: "PLY",
  SERVER: "SRV",
};

/**
 * Format a sequential public ID.
 * Example: MOD-001
 */
function formatSequentialId(prefix, number, padding = 3) {
  return `${prefix}-${String(number).padStart(padding, "0")}`;
}

/**
 * Generate moderation case ID.
 * Example: MOD-001
 */
function generateModerationId(caseNumber) {
  return formatSequentialId(PREFIXES.MODERATION, caseNumber, 3);
}

/**
 * Generate appeal ID.
 * Example: APP-001
 */
function generateAppealId(appealNumber) {
  return formatSequentialId(PREFIXES.APPEAL, appealNumber, 3);
}

/**
 * Generate a random alphanumeric string.
 */
function generateRandomId(length = 5) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < length; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}

/**
 * Generate a random public ID.
 * Kept for non-human-critical things like events/scoreboards if needed.
 */
async function generatePublicId(prefix, checkExists, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i += 1) {
    const id = `${prefix}-${generateRandomId()}`;

    if (checkExists) {
      const exists = await checkExists(id);
      if (!exists) return id;
    } else {
      return id;
    }
  }

  const timestamp = Date.now().toString(36).toUpperCase();
  const random = generateRandomId(3);

  return `${prefix}-${timestamp}${random}`;
}

async function generateAutoModId(checkExists) {
  return generatePublicId(PREFIXES.AUTOMOD, checkExists);
}

async function generateEventId(checkExists) {
  return generatePublicId(PREFIXES.EVENT, checkExists);
}

async function generateScoreboardId(checkExists) {
  return generatePublicId(PREFIXES.SCOREBOARD, checkExists);
}

async function generatePlayerId(checkExists) {
  return generatePublicId(PREFIXES.PLAYER, checkExists);
}

async function generateServerId(checkExists) {
  return generatePublicId(PREFIXES.SERVER, checkExists);
}

module.exports = {
  PREFIXES,
  formatSequentialId,
  generatePublicId,
  generateModerationId,
  generateAppealId,
  generateAutoModId,
  generateEventId,
  generateScoreboardId,
  generatePlayerId,
  generateServerId,
};
