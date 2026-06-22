"use strict";

/**
 * Generate public IDs for various entities
 * Format: PREFIX-XXXXX (e.g., MOD-A3B5C, EVT-12345)
 */

const PREFIXES = {
  MODERATION: "MOD",
  APPEAL: "APL",
  AUTOMOD: "AMC",
  EVENT: "EVT",
  SCOREBOARD: "SCB",
  AVA: "AVA",
  PLAYER: "PLY",
  SERVER: "SRV",
};

/**
 * Generate a random alphanumeric string
 * @param {number} length
 * @returns {string}
 */
function generateRandomId(length = 5) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a public ID with retry logic for collision handling
 * @param {string} prefix - The prefix (MOD, APL, etc.)
 * @param {Function} checkExists - Async function to check if ID exists
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<string>}
 */
async function generatePublicId(prefix, checkExists, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    const id = `${prefix}-${generateRandomId()}`;

    if (checkExists) {
      const exists = await checkExists(id);
      if (!exists) {
        return id;
      }
    } else {
      return id;
    }
  }

  // Fallback: use timestamp + random
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = generateRandomId(3);
  return `${prefix}-${timestamp}${random}`;
}

/**
 * Generate moderation case ID (sequential: MOD1, MOD2, MOD3...)
 * @param {number} caseNumber - The case number for this guild
 * @returns {string}
 */
function generateModerationId(caseNumber) {
  return `${PREFIXES.MODERATION}${caseNumber}`;
}

/**
 * Generate appeal ID (sequential: APL1, APL2, APL3...)
 * @param {number} appealNumber - The appeal number for this guild
 * @returns {string}
 */
function generateAppealId(appealNumber) {
  return `${PREFIXES.APPEAL}${appealNumber}`;
}

/**
 * Generate automod case ID
 * @param {Function} checkExists
 * @returns {Promise<string>}
 */
async function generateAutoModId(checkExists) {
  return generatePublicId(PREFIXES.AUTOMOD, checkExists);
}

/**
 * Generate event ID
 * @param {Function} checkExists
 * @returns {Promise<string>}
 */
async function generateEventId(checkExists) {
  return generatePublicId(PREFIXES.EVENT, checkExists);
}

/**
 * Generate scoreboard ID
 * @param {Function} checkExists
 * @returns {Promise<string>}
 */
async function generateScoreboardId(checkExists) {
  return generatePublicId(PREFIXES.SCOREBOARD, checkExists);
}

/**
 * Generate AvA match ID
 * @param {Function} checkExists
 * @returns {Promise<string>}
 */
async function generateAvaId(checkExists) {
  return generatePublicId(PREFIXES.AVA, checkExists);
}

/**
 * Generate player profile ID
 * @param {Function} checkExists
 * @returns {Promise<string>}
 */
async function generatePlayerId(checkExists) {
  return generatePublicId(PREFIXES.PLAYER, checkExists);
}

/**
 * Generate server ID
 * @param {Function} checkExists
 * @returns {Promise<string>}
 */
async function generateServerId(checkExists) {
  return generatePublicId(PREFIXES.SERVER, checkExists);
}

module.exports = {
  PREFIXES,
  generatePublicId,
  generateModerationId,
  generateAppealId,
  generateAutoModId,
  generateEventId,
  generateScoreboardId,
  generateAvaId,
  generatePlayerId,
  generateServerId,
};
