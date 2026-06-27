"use strict";

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
