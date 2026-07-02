"use strict";

const { EmbedBuilder } = require("discord.js");
const prisma = require("../lib/prisma");
const logger = require("../lib/logger");
const {
  findBestChannel,
  sendOnboarding,
} = require("../modules/onboarding/service");

module.exports = {
  name: "guildCreate",
  async execute(guild) {
    // Upsert the guild record first
    await prisma.guild.upsert({
      where: { id: guild.id },
      update: { allianceName: guild.name, allianceLogo: guild.iconURL() },
      create: {
        id: guild.id,
        allianceName: guild.name,
        allianceLogo: guild.iconURL(),
      },
    });

    // Grant 100 complimentary AI credits on first join (only on create, not update)
    await prisma.aiCredits.upsert({
      where: { guildId: guild.id },
      update: {}, // do nothing if record already exists
      create: {
        guildId: guild.id,
        balance: 100,
      },
    });

    // Log install event
    const memberCount = guild.memberCount ?? 0;
    const ownerId = guild.ownerId || null;
    try {
      await prisma.botGuildInstallEvent.create({
        data: {
          guildId: guild.id,
          guildName: guild.name,
          memberCount,
          ownerId,
          eventType: "JOIN",
        },
      });
    } catch {
      // non-critical
    }

    // Send join alert to official channel
    const OFFICIAL_CHANNEL = "1367326139109871738";
    try {
      const client = guild.client;
      const alertChannel = await client.channels
        .fetch(OFFICIAL_CHANNEL)
        .catch(() => null);
      if (alertChannel && alertChannel.isTextBased()) {
        const totalGuilds = client.guilds.cache.size;
        const alertEmbed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("📥 Server Joined")
          .addFields(
            { name: "Server", value: guild.name, inline: true },
            { name: "ID", value: guild.id, inline: true },
            {
              name: "Members",
              value: String(memberCount),
              inline: true,
            },
            {
              name: "Owner",
              value: ownerId ? `<@${ownerId}>` : "Unknown",
              inline: true,
            },
            {
              name: "Total Servers",
              value: String(totalGuilds),
              inline: true,
            },
          )
          .setTimestamp()
          .setFooter({ text: "Discore Official · Join Alert" });
        await alertChannel.send({ embeds: [alertEmbed] }).catch(() => {});
      }
    } catch {
      // non-critical
    }

    // Only send onboarding if it hasn't been sent before
    const record = await prisma.guild.findUnique({
      where: { id: guild.id },
      select: { onboardingSentAt: true },
    });
    if (record?.onboardingSentAt) {
      logger.info("guildCreate: onboarding already sent, skipping", {
        guildId: guild.id,
      });
      return;
    }

    const channel = findBestChannel(guild);
    if (!channel) {
      logger.warn("guildCreate: no suitable channel for onboarding", {
        guildId: guild.id,
      });
      return;
    }

    try {
      await sendOnboarding(guild, channel);
      logger.info("guildCreate: onboarding sent", {
        guildId: guild.id,
        channelId: channel.id,
      });
    } catch (err) {
      logger.warn("guildCreate: failed to send onboarding", {
        guildId: guild.id,
        error: err.message,
      });
    }
  },
};
