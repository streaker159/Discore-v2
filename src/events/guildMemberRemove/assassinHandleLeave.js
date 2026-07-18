"use strict";

const db = require("../../modules/assassin/assassinDb");
const {
  updateGameboard,
  checkGameEnd,
} = require("../../modules/assassin/assassinService");
const logger = require("../../lib/logger");

module.exports = {
  name: "guildMemberRemove",

  async execute(member, client) {
    const guildId = member.guild.id;
    const userId = member.id;

    try {
      // Find active game in this guild
      const game = await db.findActiveGame(guildId);
      if (!game || game.status !== "ACTIVE") return;

      // Is this player in the current game?
      const player = await db.findPlayer(game.id, userId);
      if (!player || player.status !== "ALIVE") return;

      // Auto-eliminate the player who left
      await db.eliminateKiller(game.id, userId);
      const newAlive = game.playersAlive - 1;
      await db.updateGame(game.id, { playersAlive: newAlive });

      // Notify game channel
      try {
        const channel = client?.channels?.cache?.get(game.gameChannelId);
        if (channel) {
          const { EmbedBuilder } = require("discord.js");
          const embed = new EmbedBuilder()
            .setTitle("👋 Player Left Server")
            .setDescription(
              `<@${userId}> left the server and has been **eliminated** from the Assassin game.\n\n👥 ${newAlive} players remain.`,
            )
            .setColor(0xff8800);
          await channel.send({ embeds: [embed] }).catch(() => {});
        }
      } catch {}

      // Update stats
      const stats = await db.findStats(guildId, userId);
      await db.upsertStats(guildId, userId, {
        gamesPlayed: (stats?.gamesPlayed ?? 0) + 1,
        lastPlayedAt: new Date(),
      });

      // Check if game should end
      await checkGameEnd(game.id, guildId, client);

      // Update gameboard
      await updateGameboard(guildId, client);
    } catch (err) {
      logger.warn("[Assassin] guildMemberRemove handler failed", {
        error: err.message,
      });
    }
  },
};
