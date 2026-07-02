"use strict";

const { EmbedBuilder } = require("discord.js");
const { formatDiscordTime } = require("../../../lib/embedBuilder");
const { formatXp, getXpForNextLevel } = require("../../xp/xpFormula");
const { buildProgressBar } = require("../../xp/xpEmbeds");

/**
 * Create player profile embed
 */
async function createPlayerProfileEmbed(member, profileStats) {
  const { scoreboardStats, activity, xpStats } = profileStats;

  const embed = new EmbedBuilder()
    .setTitle(`📊 Player Profile`)
    .setColor("#3498db")
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));

  // User info
  const displayName =
    member.nickname || member.user.displayName || member.user.username;
  embed.addFields({
    name: "User",
    value: `${displayName}\n${member.user.tag}`,
    inline: true,
  });

  // Server stats
  const joinedAt = member.joinedAt
    ? formatDiscordTime(member.joinedAt).full
    : "Unknown";
  const createdAt = formatDiscordTime(member.user.createdAt).full;

  embed.addFields(
    {
      name: "Joined Server",
      value: joinedAt,
      inline: true,
    },
    {
      name: "Account Created",
      value: createdAt,
      inline: true,
    },
  );

  // Roles
  const roles = member.roles.cache
    .filter((r) => r.id !== member.guild.id) // Exclude @everyone
    .sort((a, b) => b.position - a.position)
    .map((r) => r.name)
    .slice(0, 10)
    .join(", ");

  if (roles) {
    embed.addFields({
      name: `Roles (${member.roles.cache.size - 1})`,
      value: roles.length > 1024 ? roles.substring(0, 1021) + "..." : roles,
    });
  }

  // ── Discore XP Section ──────────────────────────────────────────────
  if (xpStats) {
    const nextLevelXp =
      xpStats.progress?.nextLevelXp || getXpForNextLevel(xpStats.level);
    const progressPercent = xpStats.progress?.progressPercent || 0;
    const progressBar = buildProgressBar(progressPercent);

    const xpLines = [
      `**Level:** ${xpStats.level}`,
      `**XP:** ${formatXp(xpStats.totalXp)}`,
      progressBar,
      `${formatXp(xpStats.progress?.progressXp || 0)} / ${formatXp(nextLevelXp)} (${progressPercent}%)`,
    ];

    if (xpStats.rank > 0) {
      xpLines.splice(1, 0, `**Rank:** #${xpStats.rank}`);
    }

    if (
      xpStats.dailyXp !== undefined ||
      xpStats.weeklyXp !== undefined ||
      xpStats.monthlyXp !== undefined
    ) {
      const periodParts = [];
      if (xpStats.dailyXp !== undefined)
        periodParts.push(`Today: ${formatXp(xpStats.dailyXp)} XP`);
      if (xpStats.weeklyXp !== undefined)
        periodParts.push(`This Week: ${formatXp(xpStats.weeklyXp)} XP`);
      if (xpStats.monthlyXp !== undefined)
        periodParts.push(`This Month: ${formatXp(xpStats.monthlyXp)} XP`);
      if (periodParts.length) xpLines.push(periodParts.join("\n"));
    }

    if (xpStats.messagesCounted > 0 || xpStats.reactionsCounted > 0) {
      xpLines.push(
        `Messages: ${xpStats.messagesCounted || 0} • Reactions: ${xpStats.reactionsCounted || 0}`,
      );
    }

    embed.addFields({
      name: "📊 Level & XP",
      value: xpLines.join("\n"),
      inline: false,
    });
  }

  // Scoreboard stats
  if (
    scoreboardStats.active.wins > 0 ||
    scoreboardStats.active.losses > 0 ||
    scoreboardStats.active.points > 0
  ) {
    const scoreValue = [
      `**Wins:** ${scoreboardStats.active.wins}`,
      `**Losses:** ${scoreboardStats.active.losses}`,
      `**Points:** ${scoreboardStats.active.points}`,
      `**Ratio:** ${scoreboardStats.ratio}`,
    ].join("\n");

    embed.addFields({
      name: "🏆 Scoreboard Stats",
      value: scoreValue,
      inline: true,
    });
  }

  if (
    scoreboardStats.archived.wins > 0 ||
    scoreboardStats.archived.losses > 0
  ) {
    const archivedValue = [
      `**Wins:** ${scoreboardStats.archived.wins}`,
      `**Losses:** ${scoreboardStats.archived.losses}`,
      `**Points:** ${scoreboardStats.archived.points}`,
    ].join("\n");

    embed.addFields({
      name: "📦 Archived Stats",
      value: archivedValue,
      inline: true,
    });
  }

  // Active Role Scores
  if (
    scoreboardStats.activeRoleScores &&
    scoreboardStats.activeRoleScores.length > 0
  ) {
    const activeRoleValues = scoreboardStats.activeRoleScores
      .map((rs) => {
        const details =
          rs.metric === "POINTS"
            ? `${rs.points} pts`
            : `${rs.wins}W / ${rs.losses}L`;
        return `• <@&${rs.roleId}> (${rs.scoreboardName}): **${details}**`;
      })
      .join("\n");

    embed.addFields({
      name: "👥 Active Role Scores",
      value: activeRoleValues,
      inline: false,
    });
  }

  // Previous Role Scores
  if (
    scoreboardStats.previousRoleScores &&
    scoreboardStats.previousRoleScores.length > 0
  ) {
    const previousRoleValues = scoreboardStats.previousRoleScores
      .map((rs) => {
        const details =
          rs.metric === "POINTS"
            ? `${rs.points} pts`
            : `${rs.wins}W / ${rs.losses}L`;
        return `• <@&${rs.roleId}> (${rs.scoreboardName}): **${details}**`;
      })
      .join("\n");

    embed.addFields({
      name: "📦 Previous Role Scores",
      value: previousRoleValues,
      inline: false,
    });
  }

  // Activity tracking
  if (activity) {
    const activityValues = [];

    if (activity.lastActiveAt) {
      activityValues.push(
        `**Last Active:** ${formatDiscordTime(activity.lastActiveAt).relative}`,
      );
    }

    if (activity.activeDayStreak > 0) {
      activityValues.push(
        `**Active Streak:** ${activity.activeDayStreak} day(s)`,
      );
    }

    if (activity.mostActiveChannelId) {
      activityValues.push(
        `**Most Active:** <#${activity.mostActiveChannelId}>`,
      );
    }

    if (activityValues.length > 0) {
      embed.addFields({
        name: "📈 Activity",
        value: activityValues.join("\n"),
        inline: false,
      });
    }
  }

  embed.setFooter({ text: `Powered by Discore • User ID: ${member.id}` });
  embed.setTimestamp();

  return embed;
}

module.exports = {
  createPlayerProfileEmbed,
};
