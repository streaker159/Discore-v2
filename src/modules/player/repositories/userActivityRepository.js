"use strict";

const prisma = require("../../../lib/prisma");
const { ensureGuild } = require("../../serverSettings/service");

async function ensureActivityGuild(guildId) {
  if (!guildId) return;
  await ensureGuild(guildId);
}

/**
 * Get or create user activity record
 */
async function getOrCreateUserActivity(guildId, userId) {
  await ensureActivityGuild(guildId);

  let activity = await prisma.userActivity.findUnique({
    where: {
      guildId_userId: {
        guildId,
        userId,
      },
    },
  });

  if (!activity) {
    activity = await prisma.userActivity.create({
      data: {
        guildId,
        userId,
        lastActiveAt: new Date(),
      },
    });
  }

  return activity;
}

/**
 * Update last message time
 */
async function updateLastMessage(guildId, userId, channelId) {
  const now = new Date();
  await ensureActivityGuild(guildId);

  return prisma.userActivity.upsert({
    where: {
      guildId_userId: {
        guildId,
        userId,
      },
    },
    update: {
      lastMessageAt: now,
      lastActiveAt: now,
      mostActiveChannelId: channelId,
      updatedAt: now,
    },
    create: {
      guildId,
      userId,
      lastMessageAt: now,
      lastActiveAt: now,
      mostActiveChannelId: channelId,
    },
  });
}

/**
 * Update last reaction time
 */
async function updateLastReaction(guildId, userId, reaction) {
  const now = new Date();
  await ensureActivityGuild(guildId);

  return prisma.userActivity.upsert({
    where: {
      guildId_userId: {
        guildId,
        userId,
      },
    },
    update: {
      lastReactionAt: now,
      lastActiveAt: now,
      mostUsedReaction: reaction,
      updatedAt: now,
    },
    create: {
      guildId,
      userId,
      lastReactionAt: now,
      lastActiveAt: now,
      mostUsedReaction: reaction,
    },
  });
}

/**
 * Update last interaction time
 */
async function updateLastInteraction(guildId, userId) {
  const now = new Date();
  await ensureActivityGuild(guildId);

  return prisma.userActivity.upsert({
    where: {
      guildId_userId: {
        guildId,
        userId,
      },
    },
    update: {
      lastInteractionAt: now,
      lastActiveAt: now,
      updatedAt: now,
    },
    create: {
      guildId,
      userId,
      lastInteractionAt: now,
      lastActiveAt: now,
    },
  });
}

/**
 * Get user activity
 */
async function getUserActivity(guildId, userId) {
  return prisma.userActivity.findUnique({
    where: {
      guildId_userId: {
        guildId,
        userId,
      },
    },
  });
}

/**
 * Calculate and update streak
 */
async function updateActivityStreak(guildId, userId) {
  const activity = await getUserActivity(guildId, userId);
  if (!activity) return;

  const now = new Date();
  const lastDate = activity.lastActiveDate;

  if (!lastDate) {
    // First time tracking
    await prisma.userActivity.update({
      where: {
        guildId_userId: {
          guildId,
          userId,
        },
      },
      data: {
        activeDayStreak: 1,
        lastActiveDate: now,
      },
    });
    return;
  }

  // Check if it's a new day
  const lastDay = new Date(lastDate).setHours(0, 0, 0, 0);
  const today = new Date().setHours(0, 0, 0, 0);
  const daysDiff = Math.floor((today - lastDay) / (1000 * 60 * 60 * 24));

  if (daysDiff === 0) {
    // Same day, no update needed
    return;
  } else if (daysDiff === 1) {
    // Consecutive day, increment streak
    await prisma.userActivity.update({
      where: {
        guildId_userId: {
          guildId,
          userId,
        },
      },
      data: {
        activeDayStreak: activity.activeDayStreak + 1,
        lastActiveDate: now,
      },
    });
  } else {
    // Streak broken, reset to 1
    await prisma.userActivity.update({
      where: {
        guildId_userId: {
          guildId,
          userId,
        },
      },
      data: {
        activeDayStreak: 1,
        lastActiveDate: now,
      },
    });
  }
}

module.exports = {
  getOrCreateUserActivity,
  updateLastMessage,
  updateLastReaction,
  updateLastInteraction,
  getUserActivity,
  updateActivityStreak,
};
