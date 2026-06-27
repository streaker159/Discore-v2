"use strict";

const activityRepo = require("../repositories/userActivityRepository");

let lastDbWarningAt = 0;
const DB_WARNING_COOLDOWN_MS = 60_000;

function isDatabaseConnectionError(error) {
  return (
    error?.code === "P1001" ||
    error?.code === "P1002" ||
    String(error?.message || "").includes("Can't reach database server")
  );
}

function logActivityError(type, error) {
  if (isDatabaseConnectionError(error)) {
    const now = Date.now();

    if (now - lastDbWarningAt > DB_WARNING_COOLDOWN_MS) {
      lastDbWarningAt = now;
      console.warn(
        `[Activity] Database unreachable while tracking ${type}. Activity tracking skipped for now.`,
      );
    }

    return;
  }

  console.error(`[Activity] Error tracking ${type}:`, error);
}

async function trackMessage(guildId, userId, channelId) {
  try {
    await activityRepo.updateLastMessage(guildId, userId, channelId);
    await activityRepo.updateActivityStreak(guildId, userId);
  } catch (error) {
    logActivityError("message", error);
  }
}

async function trackReaction(guildId, userId, emoji) {
  try {
    await activityRepo.updateLastReaction(guildId, userId, emoji);
    await activityRepo.updateActivityStreak(guildId, userId);
  } catch (error) {
    logActivityError("reaction", error);
  }
}

async function trackInteraction(guildId, userId) {
  try {
    await activityRepo.updateLastInteraction(guildId, userId);
    await activityRepo.updateActivityStreak(guildId, userId);
  } catch (error) {
    logActivityError("interaction", error);
  }
}

async function getUserActivity(guildId, userId) {
  try {
    return await activityRepo.getUserActivity(guildId, userId);
  } catch (error) {
    logActivityError("activity lookup", error);
    return null;
  }
}

module.exports = {
  trackMessage,
  trackReaction,
  trackInteraction,
  getUserActivity,
};
