"use strict";

const prisma = require("../../../lib/prisma");
const { getUserActivity } = require("./userActivityService");
const caseRepo = require("../../moderation/repositories/moderationCaseRepository");

/**
 * Get player profile stats for a guild member
 */
async function getPlayerProfileStats(guildId, userId) {
  // Get scoreboard stats
  const scoreboardEntries = await prisma.scoreboardEntry.findMany({
    where: {
      targetId: userId,
      targetType: "USER",
      scoreboard: {
        guildId,
        isArchived: false,
      },
    },
    include: {
      scoreboard: true,
    },
  });

  // Get archived scoreboard stats
  const archivedEntries = await prisma.scoreboardEntry.findMany({
    where: {
      targetId: userId,
      targetType: "USER",
      scoreboard: {
        guildId,
        isArchived: true,
      },
    },
    include: {
      scoreboard: true,
    },
  });

  // Calculate totals
  const activeStats = {
    wins: scoreboardEntries.reduce((sum, e) => sum + e.wins, 0),
    losses: scoreboardEntries.reduce((sum, e) => sum + e.losses, 0),
    points: scoreboardEntries.reduce((sum, e) => sum + e.points, 0),
  };

  const archivedStats = {
    wins: archivedEntries.reduce((sum, e) => sum + e.wins, 0),
    losses: archivedEntries.reduce((sum, e) => sum + e.losses, 0),
    points: archivedEntries.reduce((sum, e) => sum + e.points, 0),
  };

  const ratio =
    activeStats.losses > 0
      ? (activeStats.wins / activeStats.losses).toFixed(2)
      : activeStats.wins > 0
        ? activeStats.wins.toFixed(2)
        : "0.00";

  // Get activity
  const activity = await getUserActivity(guildId, userId);

  // Get active probation
  const activeProbation = await caseRepo.getActiveProbation(guildId, userId);

  return {
    scoreboardStats: {
      active: activeStats,
      archived: archivedStats,
      ratio,
    },
    activity,
    activeProbation,
  };
}

/**
 * Get moderation stats for a user (admin only)
 */
async function getModerationStats(guildId, userId) {
  return caseRepo.getUserModerationStats(guildId, userId);
}

module.exports = {
  getPlayerProfileStats,
  getModerationStats,
};
