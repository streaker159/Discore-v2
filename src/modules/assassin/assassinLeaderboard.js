"use strict";

const db = require("./assassinDb");
const logger = require("../../lib/logger");
const { buildLeaderboardEmbed } = require("./assassinEmbeds");

async function updateLeaderboard(guildId, client) {
  const config = await db.findConfig(guildId);
  if (!config || !config.leaderboardChannelId) return null;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;

  const channel = guild.channels.cache.get(config.leaderboardChannelId);
  if (!channel) {
    logger.warn("[Assassin] Leaderboard channel not found", {
      guildId,
      channelId: config.leaderboardChannelId,
    });
    return null;
  }

  const topPlayers = await db.findTopPlayers(guildId, 10);
  const embed = buildLeaderboardEmbed(config, topPlayers, guild);

  if (config.leaderboardMessageId) {
    try {
      const msg = await channel.messages
        .fetch(config.leaderboardMessageId)
        .catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [embed] }).catch(() => {});
        return config.leaderboardMessageId;
      }
    } catch {}
  }

  try {
    const msg = await channel.send({ embeds: [embed] });
    await db.updateConfig(guildId, { leaderboardMessageId: msg.id });
    return msg.id;
  } catch (err) {
    logger.error("[Assassin] Failed to post leaderboard", {
      guildId,
      error: err.message,
    });
    return null;
  }
}

async function postLeaderboard(guildId, client) {
  await db.updateConfig(guildId, { leaderboardMessageId: null });
  return updateLeaderboard(guildId, client);
}

async function getLeaderboardText(guildId) {
  const topPlayers = await db.findTopPlayers(guildId, 10);
  if (!topPlayers?.length) return "No winners yet. Be the first!";
  return topPlayers
    .map(
      (p, i) =>
        `**${i + 1}.** <@${p.userId}> — 🏆 ${p.gamesWon} wins | 🔪 ${p.totalKills} kills`,
    )
    .join("\n");
}

module.exports = { updateLeaderboard, postLeaderboard, getLeaderboardText };
