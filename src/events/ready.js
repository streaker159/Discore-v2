"use strict";

const logger = require("../lib/logger");
const prisma = require("../lib/prisma");
const {
  findBestChannel,
  sendOnboarding,
} = require("../modules/onboarding/service");

module.exports = {
  name: "ready",
  once: true,
  async execute(client) {
    logger.info(`Logged in as ${client.user.tag}`);
    client.user.setActivity("live scoreboards", { type: 3 });

    // Verify SKU configuration
    if (!process.env.DISCORD_PREMIUM_SKU_ID) {
      logger.warn(
        "DISCORD_PREMIUM_SKU_ID missing. Discord subscriptions will not unlock Premium automatically.",
      );
    } else {
      logger.info("Discord Premium SKU configured", {
        sku: process.env.DISCORD_PREMIUM_SKU_ID,
      });
    }
    if (!process.env.DISCORD_AI_CREDITS_SKU_ID) {
      logger.warn(
        "DISCORD_AI_CREDITS_SKU_ID missing. AI credit purchases will not be processed automatically.",
      );
    } else {
      logger.info("Discord AI Credits SKU configured", {
        sku: process.env.DISCORD_AI_CREDITS_SKU_ID,
      });
    }

    // Send onboarding to existing guilds that haven't received it yet
    setImmediate(async () => {
      try {
        // Wait a few seconds after ready to avoid rate limits
        await new Promise((r) => setTimeout(r, 5000));

        const guilds = [...client.guilds.cache.values()];
        logger.info(`Checking onboarding for ${guilds.length} guild(s)`);

        for (const guild of guilds) {
          try {
            // Ensure guild record exists
            await prisma.guild.upsert({
              where: { id: guild.id },
              update: {},
              create: {
                id: guild.id,
                allianceName: guild.name,
                allianceLogo: guild.iconURL(),
              },
            });

            const record = await prisma.guild.findUnique({
              where: { id: guild.id },
              select: { onboardingSentAt: true },
            });

            if (record?.onboardingSentAt) {
              continue; // Already sent
            }

            const channel = findBestChannel(guild);
            if (!channel) {
              logger.warn("ready: no suitable channel for onboarding", {
                guildId: guild.id,
                name: guild.name,
              });
              continue;
            }

            await sendOnboarding(guild, channel);
            logger.info("ready: onboarding sent to existing guild", {
              guildId: guild.id,
              name: guild.name,
            });

            // Stagger to avoid rate limits
            await new Promise((r) => setTimeout(r, 3000));
          } catch (err) {
            logger.warn("ready: failed to send onboarding to guild", {
              guildId: guild.id,
              error: err.message,
            });
          }
        }
      } catch (err) {
        logger.error("ready: onboarding sweep failed", { error: err.message });
      }
    });
  },
};
