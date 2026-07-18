"use strict";

const { EmbedBuilder } = require("discord.js");
const prisma = require("../lib/prisma");
const logger = require("../lib/logger");
const { handleGuildGone } = require("../lib/guildLifecycle");

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

    // If this guild was never actually set up (drive-by add), purge its DB
    // row entirely instead of leaving a permanent ghost record. Configured
    // guilds are kept so settings/premium survive a future re-invite.
    try {
      await handleGuildGone(guild.id, { guildName: guild.name });
    } catch (err) {
      logger.error("guildDelete: handleGuildGone failed", {
        guildId: guild.id,
        error: err.message,
      });
    }

    // Onboarding: delete all onboarding data for this guild
    try {
      const {
        deleteAllGuildData,
      } = require("../modules/onboarding/onboardingDb");
      await deleteAllGuildData(guild.id);
      logger.info("[Onboarding] Deleted all data for removed guild", {
        guildId: guild.id,
      });
    } catch (err) {
      logger.error("guildDelete: onboarding cleanup failed", {
        guildId: guild.id,
        error: err.message,
      });
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
