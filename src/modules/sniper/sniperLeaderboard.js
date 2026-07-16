"use strict";

const prisma = require("../../lib/prisma");
const logger = require("../../lib/logger");
const { buildLeaderboardEmbed } = require("./sniperEmbeds");
const { getConfig, getTopPlayers } = require("./sniperService");

/**
 * Update (or create) the leaderboard message for a guild.
 * Edits the stored leaderboardMessageId if it exists and is valid,
 * otherwise posts a new one.
 */
async function updateLeaderboard(guildId, client) {
  const config = await getConfig(guildId);
  if (!config || !config.leaderboardChannelId) return null;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;

  const channel = guild.channels.cache.get(config.leaderboardChannelId);
  if (!channel) {
    logger.warn("[SniperChallenge] Leaderboard channel not found", {
      guildId,
      channelId: config.leaderboardChannelId,
    });
    return null;
  }

  const topPlayers = await getTopPlayers(guildId, 10);
  const embed = buildLeaderboardEmbed(config, topPlayers, guild);

  // Try to edit existing leaderboard message
  if (config.leaderboardMessageId) {
    try {
      const msg = await channel.messages
        .fetch(config.leaderboardMessageId)
        .catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [embed] }).catch(() => {});
        return config.leaderboardMessageId;
      }
    } catch {
      // Message deleted, post new
    }
  }

  // Post new leaderboard
  try {
    const msg = await channel.send({ embeds: [embed] });
    await prisma.sniperChallengeConfig.update({
      where: { guildId },
      data: { leaderboardMessageId: msg.id },
    });
    return msg.id;
  } catch (err) {
    logger.error("[SniperChallenge] Failed to post leaderboard", {
      guildId,
      error: err.message,
    });
    return null;
  }
}

/**
 * Post a fresh leaderboard (admin-triggered repair).
 */
async function postLeaderboard(guildId, client) {
  // Clear stored message ID to force a fresh post
  await prisma.sniperChallengeConfig.update({
    where: { guildId },
    data: { leaderboardMessageId: null },
  });
  return updateLeaderboard(guildId, client);
}

/**
 * Get a formatted leaderboard text for ephemeral display.
 */
async function getLeaderboardText(guildId) {
  const config = await getConfig(guildId);
  const topPlayers = await getTopPlayers(guildId, 10);

  if (!topPlayers?.length) {
    return "No winners yet. Be the first!";
  }

  return topPlayers
    .map(
      (p, i) =>
        `**${i + 1}.** <@${p.userId}> — ${p.totalWins} win${p.totalWins !== 1 ? "s" : ""} | 🔥 Streak: ${p.currentStreak} | Best: ${p.bestStreak}`,
    )
    .join("\n");
}

module.exports = {
  updateLeaderboard,
  postLeaderboard,
  getLeaderboardText,
};
