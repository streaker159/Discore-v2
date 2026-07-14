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

    logger.info("AI Translation system online");

    client.user.setActivity("🚧 still under dev", { type: 3 });

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

    // ── Startup: redeploy commands + schedule jobs ────────────────────
    // Schema changes are now handled exclusively via `prisma migrate deploy`
    // (run in CI/CD before the bot starts), NOT here. See prisma/migrations/.
    setImmediate(async () => {
      try {
        // Schedule hourly analytics job (runs at minute 1 past every hour)
        try {
          const { scheduleNextRun } = require("../jobs/analyticsJob");
          scheduleNextRun(client);
        } catch (e) {
          logger.warn("Analytics job scheduler failed", {
            error: e.message?.slice(0, 60),
          });
        }

        // Safe redeploy: only send to Discord if commands were loaded
        const { REST, Routes } = require("discord.js");
        const commands = [...client.commands.values()]
          .filter((c) => c.data)
          .map((c) => c.data.toJSON());
        if (commands.length > 0) {
          const rest = new REST({ version: "10" }).setToken(
            process.env.DISCORD_TOKEN,
          );
          logger.info(`Redeploying ${commands.length} commands...`);
          await rest.put(Routes.applicationCommands(client.user.id), {
            body: commands,
          });
          logger.info("Commands redeployed");
        } else {
          logger.warn(
            "No commands loaded — skipping deploy (retry on next restart)",
          );
        }
      } catch (err) {
        logger.warn("Startup migration/deploy skipped", {
          error: err.message?.slice(0, 100),
        });
      }
    });

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

    // ── Reconcile guilds removed while the bot was offline ──────
    // If the bot was kicked/left a guild while its process was down/restarting,
    // discord.js never fires guildDelete for it. Compare DB guild rows against
    // the live guild cache on every startup and clean up any that are gone.
    setImmediate(async () => {
      try {
        await new Promise((r) => setTimeout(r, 8000));

        const { handleGuildGone } = require("../lib/guildLifecycle");
        const liveIds = new Set(client.guilds.cache.keys());
        const dbGuilds = await prisma.guild.findMany({
          select: { id: true, allianceName: true },
        });
        const goneGuilds = dbGuilds.filter((g) => !liveIds.has(g.id));

        if (goneGuilds.length) {
          logger.info(
            `ready: found ${goneGuilds.length} DB guild(s) bot is no longer in, reconciling`,
          );
        }

        for (const g of goneGuilds) {
          try {
            await prisma.botGuildInstallEvent.create({
              data: {
                guildId: g.id,
                guildName: g.allianceName || "Unknown",
                eventType: "LEAVE",
              },
            });
          } catch {
            // non-critical
          }
          try {
            const result = await handleGuildGone(g.id, {
              guildName: g.allianceName,
            });
            logger.info("ready: reconciled gone guild", {
              guildId: g.id,
              purged: result.purged,
              kept: result.kept,
            });
          } catch (err) {
            logger.error("ready: reconcile gone guild failed", {
              guildId: g.id,
              error: err.message,
            });
          }
        }
      } catch (err) {
        logger.error("ready: guild reconciliation sweep failed", {
          error: err.message,
        });
      }
    });

    // ── Safe Vault: ensure one active safe exists on startup ────
    setImmediate(async () => {
      try {
        // Wait a bit for the client to be fully ready
        await new Promise((r) => setTimeout(r, 5000));

        const {
          ensureActiveSafe,
        } = require("../modules/safe/safeVaultService");
        await ensureActiveSafe(client);
        logger.info("SafeVault startup check completed");
      } catch (err) {
        logger.error("SafeVault: ensureActiveSafe failed", {
          error: err.message,
        });
      }
    });
  },
};
