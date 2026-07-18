"use strict";

/**
 * In-memory kill cooldown tracker for the Assassin game.
 *
 * Prevents players from spamming 🔪 reactions.
 * Cooldown: 2 minutes per kill attempt (configurable via game config).
 * Stale entries are cleaned every 60 seconds.
 */

const COOLDOWN_MS = 2 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

const cooldowns = new Map(); // key: `${guildId}:${userId}`, value: timestamp (ms)

/**
 * Check if a user is currently on cooldown.
 * @param {string} guildId
 * @param {string} userId
 * @returns {boolean}
 */
function isOnCooldown(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const lastAttempt = cooldowns.get(key);
  if (!lastAttempt) return false;
  return Date.now() - lastAttempt < COOLDOWN_MS;
}

/**
 * Set the cooldown for a user (called after a kill attempt).
 * @param {string} guildId
 * @param {string} userId
 */
function setCooldown(guildId, userId) {
  cooldowns.set(`${guildId}:${userId}`, Date.now());
}

/**
 * Get remaining cooldown time in ms.
 * Returns 0 if not on cooldown.
 * @param {string} guildId
 * @param {string} userId
 * @returns {number}
 */
function getRemainingCooldown(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const lastAttempt = cooldowns.get(key);
  if (!lastAttempt) return 0;
  const remaining = COOLDOWN_MS - (Date.now() - lastAttempt);
  return Math.max(0, remaining);
}

// Periodic cleanup: remove entries older than COOLDOWN_MS + buffer
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of cooldowns) {
    if (now - timestamp > COOLDOWN_MS + 60000) {
      cooldowns.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS).unref?.();

module.exports = { isOnCooldown, setCooldown, getRemainingCooldown };
