"use strict";

const { TTLCache } = require("../../lib/cache");

// In-memory cooldown cache keyed by guildId:userId:type
// Stores timestamps so we can skip DB checks when clearly still on cooldown
// TTL = max cooldown (5 min for reactions, 1 min for messages)
// We use a 5-min TTL as the upper bound since reaction cooldown defaults to 300s

const cooldownCache = new TTLCache(5 * 60_000);

/**
 * Check if a user is on cooldown (in-memory fast path)
 * @param {string} guildId
 * @param {string} userId
 * @param {'message'|'reaction'} type
 * @param {number} cooldownSeconds
 * @returns {boolean} true if cooldown is active
 */
function isCooldownActive(guildId, userId, type, cooldownSeconds) {
  const key = `${guildId}:${userId}:${type}`;
  const lastAt = cooldownCache.get(key);
  if (!lastAt) return false;

  const elapsed = (Date.now() - lastAt) / 1000;
  if (elapsed < cooldownSeconds) return true;

  // Expired - remove from cache
  cooldownCache.delete(key);
  return false;
}

/**
 * Set a cooldown timestamp for a user
 * @param {string} guildId
 * @param {string} userId
 * @param {'message'|'reaction'} type
 */
function setCooldown(guildId, userId, type) {
  const key = `${guildId}:${userId}:${type}`;
  cooldownCache.set(key, Date.now());
}

/**
 * Get remaining cooldown seconds
 * @param {string} guildId
 * @param {string} userId
 * @param {'message'|'reaction'} type
 * @param {number} cooldownSeconds
 * @returns {number} remaining seconds (0 if not on cooldown)
 */
function getRemainingCooldown(guildId, userId, type, cooldownSeconds) {
  const key = `${guildId}:${userId}:${type}`;
  const lastAt = cooldownCache.get(key);
  if (!lastAt) return 0;

  const elapsed = (Date.now() - lastAt) / 1000;
  const remaining = Math.ceil(cooldownSeconds - elapsed);
  return Math.max(0, remaining);
}

module.exports = {
  isCooldownActive,
  setCooldown,
  getRemainingCooldown,
  cooldownCache,
};
