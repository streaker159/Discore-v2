"use strict";

const { EmbedBuilder } = require("discord.js");
const prisma = require("../lib/prisma");
const logger = require("../lib/logger");

const OFFICIAL_CHANNEL = "1367326139109871738";

module.exports = {
  name: "guildDelete",
  async execute(guild) {
    // Log leave event
    try {
      await prisma.botGuildInstallEvent.create({
        data: {
          guildId: guild.id,
          guildName: guild.name,
          memberCount: guild.memberCount ?? 0,
          ownerId: guild.ownerId || null,
          eventType: "LEAVE",
        },
      });
    } catch {
      // non-critical
    }

    // Send leave alert to official channel
    try {
      const client = guild.client;
      const alertChannel = await client.channels
        .fetch(OFFICIAL_CHANNEL)
        .catch(() => null);
      if (alertChannel && alertChannel.isTextBased()) {
        const totalGuilds = client.guilds.cache.size;
        const alertEmbed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("📤 Bot Removed / Server Left")
          .addFields(
            { name: "Server", value: guild.name, inline: true },
            { name: "ID", value: guild.id, inline: true },
            {
              name: "Members",
              value: String(guild.memberCount ?? "?"),
              inline: true,
            },
            {
              name: "Total Servers Now",
              value: String(totalGuilds),
              inline: true,
            },
          )
          .setTimestamp()
          .setFooter({ text: "Discore Official · Leave Alert" });
        await alertChannel.send({ embeds: [alertEmbed] }).catch(() => {});
      }
    } catch {
      // non-critical
    }

    logger.info("guildDelete: processed", {
      guildId: guild.id,
      name: guild.name,
    });
  },
};
