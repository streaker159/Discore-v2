"use strict";

const prisma = require("../../lib/prisma");
const { TTLCache } = require("../../lib/cache");

// Cache guild XP config for 5 minutes
const xpConfigCache = new TTLCache(5 * 60_000);

const DEFAULT_CONFIG = {
  enabled: true,
  levelUpChannelId: null,
  weeklyLeaderboardChannelId: null,
  messageXpEnabled: true,
  reactionXpEnabled: true,
  minMessageXp: 15,
  maxMessageXp: 40,
  messageCooldownSeconds: 60,
  minReactionXp: 5,
  maxReactionXp: 10,
  reactionCooldownSeconds: 300,
  announceLevelUps: true,
  weeklyTop10Enabled: false,
  profileColor: null,
  lastWeeklyLeaderboardPostAt: null,
};

/**
 * Get guild XP config, lazily creating defaults if none exist
 * @param {string} guildId
 * @returns {Promise<object>}
 */
async function getXpConfig(guildId) {
  const cacheKey = `xpconfig:${guildId}`;
  const cached = xpConfigCache.get(cacheKey);
  if (cached) return cached;

  let config = await prisma.guildXpConfig.findUnique({
    where: { guildId },
  });

  if (!config) {
    config = await prisma.guildXpConfig.create({
      data: { guildId },
    });
  }

  xpConfigCache.set(cacheKey, config);
  return config;
}

/**
 * Update guild XP config, only updating provided fields
 * @param {string} guildId
 * @param {object} data - partial config update
 * @returns {Promise<object>}
 */
async function updateXpConfig(guildId, data) {
  // Ensure a row exists first
  await getXpConfig(guildId);

  const config = await prisma.guildXpConfig.update({
    where: { guildId },
    data,
  });

  xpConfigCache.set(`xpconfig:${guildId}`, config);
  return config;
}

/**
 * Invalidate cached XP config for a guild
 * @param {string} guildId
 */
function invalidateXpConfigCache(guildId) {
  xpConfigCache.delete(`xpconfig:${guildId}`);
}

/**
 * Ensure guild XP config exists (call on guild join or first use)
 * @param {string} guildId
 * @returns {Promise<object>}
 */
async function ensureXpConfig(guildId) {
  return getXpConfig(guildId);
}

module.exports = {
  getXpConfig,
  updateXpConfig,
  invalidateXpConfigCache,
  ensureXpConfig,
  DEFAULT_CONFIG,
  xpConfigCache,
};
