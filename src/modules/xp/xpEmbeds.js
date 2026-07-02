"use strict";

const { EmbedBuilder } = require("discord.js");
const { formatXp, getXpForNextLevel } = require("./xpFormula");

/**
 * Create rank embed showing user XP/level/progress
 * @param {object} opts
 * @returns {EmbedBuilder}
 */
function createRankEmbed({
  member,
  xpStats,
  rank,
  dailyXp,
  weeklyXp,
  monthlyXp,
}) {
  const displayName = member
    ? member.displayName || member.user?.username
    : xpStats.displayName || "Unknown";
  const avatarUrl = member
    ? member.displayAvatarURL({ dynamic: true })
    : xpStats.avatarUrl || null;

  const nextLevelXp =
    xpStats.progress?.nextLevelXp || getXpForNextLevel(xpStats.level);
  const progressXp = xpStats.progress?.progressXp || 0;
  const progressPercent = xpStats.progress?.progressPercent || 0;

  const progressBar = buildProgressBar(progressPercent);

  const embed = new EmbedBuilder()
    .setTitle(`📊 XP Rank — ${displayName}`)
    .setColor(0x00cccc)
    .setThumbnail(avatarUrl)
    .addFields(
      {
        name: "🏆 Level",
        value: `**${xpStats.level}**`,
        inline: true,
      },
      {
        name: "⭐ Total XP",
        value: `**${formatXp(xpStats.totalXp)}**`,
        inline: true,
      },
      {
        name: "📈 Rank",
        value: rank > 0 ? `**#${rank}**` : "Unranked",
        inline: true,
      },
      {
        name: "📊 Progress",
        value: `${progressBar}\n${formatXp(progressXp)} / ${formatXp(nextLevelXp)} XP (${progressPercent}%)`,
        inline: false,
      },
    );

  // Period XP
  if (
    dailyXp !== undefined ||
    weeklyXp !== undefined ||
    monthlyXp !== undefined
  ) {
    const periodLines = [];
    if (dailyXp !== undefined)
      periodLines.push(`**Today:** ${formatXp(dailyXp)} XP`);
    if (weeklyXp !== undefined)
      periodLines.push(`**This Week:** ${formatXp(weeklyXp)} XP`);
    if (monthlyXp !== undefined)
      periodLines.push(`**This Month:** ${formatXp(monthlyXp)} XP`);

    if (periodLines.length) {
      embed.addFields({
        name: "📅 Period XP",
        value: periodLines.join("\n"),
        inline: false,
      });
    }
  }

  // Messages/reactions counted
  embed.addFields({
    name: "📨 Activity",
    value: `Messages: ${xpStats.messagesCounted || 0} • Reactions: ${xpStats.reactionsCounted || 0}`,
    inline: false,
  });

  embed.setFooter({ text: "Discore XP • Stay active!" });
  embed.setTimestamp();

  return embed;
}

/**
 * Create leaderboard embed
 * @param {object} opts
 * @returns {EmbedBuilder}
 */
function createLeaderboardEmbed({
  leaderboard,
  period,
  guildName,
  userRank,
  userXp,
  userLevel,
}) {
  const titles = {
    overall: "🏆 XP Leaderboard — Overall",
    daily: "📅 XP Leaderboard — Daily",
    weekly: "🗓️ XP Leaderboard — Weekly",
    monthly: "🌙 XP Leaderboard — Monthly",
  };

  const title = titles[period] || titles.overall;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0x00cccc)
    .setTimestamp();

  if (leaderboard.length === 0) {
    embed.setDescription("No XP earned yet in this period. Start chatting!");
  } else {
    const lines = leaderboard
      .map(
        (entry, index) =>
          `**#${index + 1}** ${entry.displayName || entry.userTag || entry.userId} — LVL ${entry.level} — **${formatXp(entry.totalXp)} XP**`,
      )
      .join("\n");

    embed.setDescription(lines);
  }

  // Show requesting user's rank if not in top 10
  if (userRank && userRank > 10) {
    embed.addFields({
      name: "📌 Your Rank",
      value: `**#${userRank}** — LVL ${userLevel || 1} — **${formatXp(userXp || 0)} XP**`,
      inline: false,
    });
  }

  if (guildName) {
    embed.setFooter({ text: `${guildName} • Discore XP` });
  } else {
    embed.setFooter({ text: "Discore XP • Keep the alliance active!" });
  }

  return embed;
}

/**
 * Build a text progress bar
 * @param {number} percent 0-100
 * @returns {string}
 */
function buildProgressBar(percent) {
  const filled = Math.floor(percent / 10);
  const empty = 10 - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

module.exports = {
  createRankEmbed,
  createLeaderboardEmbed,
  buildProgressBar,
};
