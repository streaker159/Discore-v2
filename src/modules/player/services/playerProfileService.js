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

  // Calculate totals from direct USER entries
  const directUserStats = {
    wins: scoreboardEntries.reduce((sum, e) => sum + e.wins, 0),
    losses: scoreboardEntries.reduce((sum, e) => sum + e.losses, 0),
    points: scoreboardEntries.reduce((sum, e) => sum + e.points, 0),
  };

  // Fetch all ROLE-targeted active entries for roles the user holds (used
  // both for summary totals and per-role breakdown below — avoids duplicate queries).
  let activeRoleEntries = [];
  const userRoleIds = member ? member.roles.cache.map((r) => r.id) : [];
  if (userRoleIds.length > 0) {
    activeRoleEntries = await prisma.scoreboardEntry.findMany({
      where: {
        targetId: { in: userRoleIds },
        targetType: "ROLE",
        scoreboard: { guildId, isArchived: false },
      },
      include: { scoreboard: true },
    });
  }

  const activeStats = {
    wins:
      directUserStats.wins +
      activeRoleEntries.reduce((sum, e) => sum + e.wins, 0),
    losses:
      directUserStats.losses +
      activeRoleEntries.reduce((sum, e) => sum + e.losses, 0),
    points:
      directUserStats.points +
      activeRoleEntries.reduce((sum, e) => sum + e.points, 0),
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

  // Get user role-based scores — directly query ROLE-targeted entries
  // for roles the user currently holds, rather than relying on cached
  // UserRoleScore records (which may be missing due to member cache gaps).
  const activeRoleScores = [];
  const previousRoleScores = [];

  if (member) {
    const userRoleIds = member.roles.cache.map((r) => r.id);
    if (userRoleIds.length > 0) {
      // Fetch all ROLE-targeted scoreboard entries for roles the user has
      const roleEntries = await prisma.scoreboardEntry.findMany({
        where: {
          targetId: { in: userRoleIds },
          targetType: "ROLE",
          scoreboard: { guildId, isArchived: false },
        },
        include: { scoreboard: true },
      });

      for (const entry of roleEntries) {
        const finalScore = {
          wins: entry.wins,
          losses: entry.losses,
          points: entry.points,
        };
        activeRoleScores.push({
          roleId: entry.targetId,
          scoreboardName: entry.scoreboard.liveTitle || entry.scoreboard.name,
          metric: entry.scoreboard.metric,
          wins: finalScore.wins,
          losses: finalScore.losses,
          points: finalScore.points,
          ratio:
            finalScore.losses > 0
              ? (finalScore.wins / finalScore.losses).toFixed(2)
              : finalScore.wins > 0
                ? finalScore.wins.toFixed(2)
                : "0.00",
        });
      }
    }

    // Also check archived scoreboards
    const archivedRoleEntries = await prisma.scoreboardEntry.findMany({
      where: {
        targetId: { in: userRoleIds },
        targetType: "ROLE",
        scoreboard: { guildId, isArchived: true },
      },
      include: { scoreboard: true },
    });

    for (const entry of archivedRoleEntries) {
      previousRoleScores.push({
        roleId: entry.targetId,
        scoreboardName: entry.scoreboard.liveTitle || entry.scoreboard.name,
        metric: entry.scoreboard.metric,
        wins: entry.wins,
        losses: entry.losses,
        points: entry.points,
        ratio:
          entry.losses > 0
            ? (entry.wins / entry.losses).toFixed(2)
            : entry.wins > 0
              ? entry.wins.toFixed(2)
              : "0.00",
      });
    }
  }

  // Also merge in any UserRoleScore records for roles the user no longer has
  try {
    const legacyScores = await prisma.userRoleScore.findMany({
      where: { userId, scoreboard: { guildId } },
      include: { scoreboard: true },
    });
    for (const rs of legacyScores) {
      const stillHasRole = member && member.roles.cache.has(rs.roleId);
      if (!stillHasRole) {
        // Only add if not already captured above
        const alreadyInPrevious = previousRoleScores.some(
          (p) =>
            p.roleId === rs.roleId &&
            p.scoreboardName ===
              (rs.scoreboard.liveTitle || rs.scoreboard.name),
        );
        if (!alreadyInPrevious) {
          const liveEntry = await prisma.scoreboardEntry.findFirst({
            where: { scoreboardId: rs.scoreboardId, targetId: rs.roleId },
          });
          const finalScore = liveEntry
            ? {
                wins: liveEntry.wins,
                losses: liveEntry.losses,
                points: liveEntry.points,
              }
            : { wins: rs.wins, losses: rs.losses, points: rs.points };
          previousRoleScores.push({
            roleId: rs.roleId,
            scoreboardName: rs.scoreboard.liveTitle || rs.scoreboard.name,
            metric: rs.scoreboard.metric,
            wins: finalScore.wins,
            losses: finalScore.losses,
            points: finalScore.points,
            ratio:
              finalScore.losses > 0
                ? (finalScore.wins / finalScore.losses).toFixed(2)
                : finalScore.wins > 0
                  ? finalScore.wins.toFixed(2)
                  : "0.00",
          });
        }
      }
    }
  } catch {
    // Legacy scores optional
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

  // Get total link wins from sniper game API
  let totalLinkWins = 0;
  try {
    const apiUrl =
      process.env.SNIPER_GAME_API_URL ||
      "https://sniper-game.example.com/api/v1";
    const apiKey = process.env.SNIPER_GAME_API_KEY || "";
    if (apiKey) {
      const url = `${apiUrl}/users/links/${userId}`;
      const response = await fetch(url, {
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = await response.json();
        const links = data?.links ?? [];
        totalLinkWins = links.reduce((sum, link) => sum + (link.wins ?? 0), 0);
      }
    }
  } catch {
    // Sniper game API may not be available — safe to ignore
  }

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
    totalLinkWins,
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
