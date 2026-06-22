"use strict";

const activityRepo = require("../repositories/userActivityRepository");

/**
 * Track user message activity
 */
async function trackMessage(guildId, userId, channelId) {
  try {
    await activityRepo.updateLastMessage(guildId, userId, channelId);
    await activityRepo.updateActivityStreak(guildId, userId);
  } catch (error) {
    console.error("[Activity] Error tracking message:", error);
  }
}

/**
 * Track user reaction activity
 */
async function trackReaction(guildId, userId, emoji) {
  try {
    await activityRepo.updateLastReaction(guildId, userId, emoji);
    await activityRepo.updateActivityStreak(guildId, userId);
  } catch (error) {
    console.error("[Activity] Error tracking reaction:", error);
  }
}

/**
 * Track user interaction activity
 */
async function trackInteraction(guildId, userId) {
  try {
    await activityRepo.updateLastInteraction(guildId, userId);
    await activityRepo.updateActivityStreak(guildId, userId);
  } catch (error) {
    console.error("[Activity] Error tracking interaction:", error);
  }
}

/**
 * Get user activity
 */
async function getUserActivity(guildId, userId) {
  return activityRepo.getUserActivity(guildId, userId);
}

module.exports = {
  trackMessage,
  trackReaction,
  trackInteraction,
  getUserActivity,
};
