"use strict";

const prisma = require("../../../lib/prisma");
const { getUserActivity } = require("./userActivityService");
const {
  getUserXpStats,
  getUserXpRank,
  getUserPeriodXp,
} = require("../../xp/xpService");

/**
 * Get player profile stats for a guild member
 */
async function getPlayerProfileStats(guildId, userId, member = null) {
  // Get XP stats (non-blocking, wrap in try to never break profile)
  let xpStats = null;
  try {
    const [xp, xpRank, dailyXp, weeklyXp, monthlyXp] = await Promise.all([
      getUserXpStats(guildId, userId),
      getUserXpRank(guildId, userId),
      getUserPeriodXp(guildId, userId, "daily"),
      getUserPeriodXp(guildId, userId, "weekly"),
      getUserPeriodXp(guildId, userId, "monthly"),
    ]);
    xpStats = { ...xp, rank: xpRank, dailyXp, weeklyXp, monthlyXp };
  } catch {
    // XP may not be set up yet - safe to ignore
  }

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

  // Get user role-based scores
  const userRoleScores = await prisma.userRoleScore.findMany({
    where: {
      userId,
      scoreboard: {
        guildId,
      },
    },
    include: {
      scoreboard: true,
    },
  });

  const activeRoleScores = [];
  const previousRoleScores = [];

  for (const rs of userRoleScores) {
    const stillHasRole = member && member.roles.cache.has(rs.roleId);
    let finalScore = { wins: rs.wins, losses: rs.losses, points: rs.points };

    if (stillHasRole) {
      const liveEntry = await prisma.scoreboardEntry.findFirst({
        where: { scoreboardId: rs.scoreboardId, targetId: rs.roleId },
      });
      if (liveEntry) {
        finalScore = {
          wins: liveEntry.wins,
          losses: liveEntry.losses,
          points: liveEntry.points,
        };
      }
    }

    const payload = {
      roleId: rs.roleId,
      scoreboardName: rs.scoreboard.liveTitle || rs.scoreboard.name,
      metric: rs.scoreboard.metric,
      wins: finalScore.wins,
      losses: finalScore.losses,
      points: finalScore.points,
    };

    if (stillHasRole) {
      activeRoleScores.push(payload);
    } else {
      previousRoleScores.push(payload);
    }
  }

  // Get sniper challenge stats
  let sniperStats = null;
  try {
    const { getPlayerStats } = require("../../sniper/sniperService");
    sniperStats = await getPlayerStats(guildId, userId);
  } catch {
    // Sniper may not be set up yet
  }

  // Get activity
  const activity = await getUserActivity(guildId, userId);

  return {
    scoreboardStats: {
      active: activeStats,
      archived: archivedStats,
      ratio,
      activeRoleScores,
      previousRoleScores,
    },
    activity,
    xpStats,
    sniperStats,
  };
}

async function getSniperPlayerStats(guildId, userId) {
  try {
    const { getPlayerStats } = require("../../sniper/sniperService");
    return await getPlayerStats(guildId, userId);
  } catch {
    return null;
  }
}

module.exports = {
  getPlayerProfileStats,
  getSniperPlayerStats,
};
