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

    // ── Startup: run safe migrations and redeploy commands ───────────
    setImmediate(async () => {
      try {
        // 1. Apply database migration
        const fs = require("fs");
        const path = require("path");
        const migrationPath = path.join(
          __dirname,
          "..",
          "..",
          "scripts",
          "migrate_analytics.sql",
        );
        // Run each migration step individually (safe idempotent DDL)
        try {
          await prisma.$executeRawUnsafe(
            `ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "announcementChannelId" TEXT`,
          );
        } catch (e) {
          logger.info("Migration: announcementChannelId column", {
            error: e.message?.slice(0, 60),
          });
        }
        try {
          await prisma.$executeRawUnsafe(
            `CREATE TABLE IF NOT EXISTS "BotCommandUsage" ("id" TEXT NOT NULL, "guildId" TEXT, "userId" TEXT NOT NULL, "commandName" TEXT NOT NULL, "subcommand" TEXT, "success" BOOLEAN NOT NULL DEFAULT true, "durationMs" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT "BotCommandUsage_pkey" PRIMARY KEY ("id"))`,
          );
        } catch (e) {
          logger.info("Migration: BotCommandUsage table", {
            error: e.message?.slice(0, 60),
          });
        }
        try {
          await prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "BotCommandUsage_createdAt_idx" ON "BotCommandUsage" ("createdAt")`,
          );
        } catch (e) {}
        try {
          await prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "BotCommandUsage_guildId_idx" ON "BotCommandUsage" ("guildId")`,
          );
        } catch (e) {}
        try {
          await prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "BotCommandUsage_commandName_idx" ON "BotCommandUsage" ("commandName")`,
          );
        } catch (e) {}
        try {
          await prisma.$executeRawUnsafe(
            `CREATE TABLE IF NOT EXISTS "BotAiUsage" ("id" TEXT NOT NULL, "guildId" TEXT, "userId" TEXT, "success" BOOLEAN NOT NULL DEFAULT true, "creditsUsed" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT "BotAiUsage_pkey" PRIMARY KEY ("id"))`,
          );
        } catch (e) {
          logger.info("Migration: BotAiUsage table", {
            error: e.message?.slice(0, 60),
          });
        }
        try {
          await prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "BotAiUsage_createdAt_idx" ON "BotAiUsage" ("createdAt")`,
          );
        } catch (e) {}
        try {
          await prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "BotAiUsage_guildId_idx" ON "BotAiUsage" ("guildId")`,
          );
        } catch (e) {}
        try {
          await prisma.$executeRawUnsafe(
            `CREATE TABLE IF NOT EXISTS "BotGuildInstallEvent" ("id" TEXT NOT NULL, "guildId" TEXT NOT NULL, "guildName" TEXT NOT NULL, "memberCount" INTEGER NOT NULL DEFAULT 0, "ownerId" TEXT, "eventType" TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT "BotGuildInstallEvent_pkey" PRIMARY KEY ("id"))`,
          );
        } catch (e) {
          logger.info("Migration: BotGuildInstallEvent table", {
            error: e.message?.slice(0, 60),
          });
        }
        try {
          await prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "BotGuildInstallEvent_guildId_idx" ON "BotGuildInstallEvent" ("guildId")`,
          );
        } catch (e) {}
        try {
          await prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "BotGuildInstallEvent_eventType_createdAt_idx" ON "BotGuildInstallEvent" ("eventType", "createdAt")`,
          );
        } catch (e) {}
        try {
          await prisma.$executeRawUnsafe(
            `CREATE TABLE IF NOT EXISTS "BotHourlyStatusReport" ("id" TEXT NOT NULL, "channelId" TEXT NOT NULL, "reportHour" TEXT NOT NULL, "sentAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "status" TEXT NOT NULL DEFAULT 'success', "payloadJson" TEXT, CONSTRAINT "BotHourlyStatusReport_pkey" PRIMARY KEY ("id"))`,
          );
        } catch (e) {
          logger.info("Migration: BotHourlyStatusReport table", {
            error: e.message?.slice(0, 60),
          });
        }
        try {
          await prisma.$executeRawUnsafe(
            `CREATE TABLE IF NOT EXISTS "ModerationCaseTranscript" ("id" TEXT NOT NULL, "guildId" TEXT NOT NULL, "caseId" TEXT, "appealId" TEXT, "caseNumber" TEXT, "appealNumber" TEXT, "ticketChannelId" TEXT, "ticketChannelName" TEXT, "userId" TEXT, "handledById" TEXT, "outcome" TEXT, "openedAt" TIMESTAMPTZ, "closedAt" TIMESTAMPTZ, "messageCount" INTEGER NOT NULL DEFAULT 0, "transcriptJson" TEXT, "transcriptText" TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT "ModerationCaseTranscript_pkey" PRIMARY KEY ("id"))`,
          );
        } catch (e) {
          logger.info("Migration: ModerationCaseTranscript table", {
            error: e.message?.slice(0, 60),
          });
        }
        try {
          await prisma.$executeRawUnsafe(
            `ALTER TABLE "GuildPremium" ADD COLUMN IF NOT EXISTS "aiTranslationEnabled" BOOLEAN NOT NULL DEFAULT false`,
          );
        } catch (e) {}
        try {
          await prisma.$executeRawUnsafe(
            `ALTER TABLE "GuildPremium" ADD COLUMN IF NOT EXISTS "aiWelcomeEnabled" BOOLEAN NOT NULL DEFAULT false`,
          );
        } catch (e) {}
        try {
          await prisma.$executeRawUnsafe(
            `ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "aiWelcomeChannelId" TEXT`,
          );
        } catch (e) {}
        try {
          await prisma.$executeRawUnsafe(
            `ALTER TABLE "GuildPremium" ADD COLUMN IF NOT EXISTS "aiWelcomeInstructions" TEXT`,
          );
        } catch (e) {}
        try {
          await prisma.$executeRawUnsafe(
            `ALTER TABLE "BotAiUsage" ADD COLUMN IF NOT EXISTS "requestType" TEXT`,
          );
        } catch (e) {}

        // SafeVault tables
        try {
          await prisma.$executeRawUnsafe(
            `CREATE TABLE IF NOT EXISTS "SafeVaultRound" ("id" TEXT NOT NULL, "code" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'ACTIVE', "generatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "expiresAt" TIMESTAMPTZ, "crackedAt" TIMESTAMPTZ, "crackedByUserId" TEXT, "crackedByUserTag" TEXT, "crackedByDisplayName" TEXT, "crackedInGuildId" TEXT, "crackedInGuildName" TEXT, "selectedPrize" TEXT, "prizeStatus" TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL, CONSTRAINT "SafeVaultRound_pkey" PRIMARY KEY ("id"))`,
          );
        } catch (e) {
          logger.info("Migration: SafeVaultRound table", {
            error: e.message?.slice(0, 80),
          });
        }
        try {
          await prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "SafeVaultRound_status_idx" ON "SafeVaultRound" ("status")`,
          );
        } catch (e) {}
        try {
          await prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "SafeVaultRound_generatedAt_idx" ON "SafeVaultRound" ("generatedAt")`,
          );
        } catch (e) {}
        try {
          await prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "SafeVaultRound_crackedByUserId_idx" ON "SafeVaultRound" ("crackedByUserId")`,
          );
        } catch (e) {}
        try {
          await prisma.$executeRawUnsafe(
            `CREATE TABLE IF NOT EXISTS "SafeVaultAttempt" ("id" TEXT NOT NULL, "roundId" TEXT NOT NULL, "userId" TEXT NOT NULL, "userTag" TEXT, "displayName" TEXT, "guildId" TEXT NOT NULL, "guildName" TEXT, "guessedCode" TEXT NOT NULL, "correct" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT "SafeVaultAttempt_pkey" PRIMARY KEY ("id"))`,
          );
        } catch (e) {
          logger.info("Migration: SafeVaultAttempt table", {
            error: e.message?.slice(0, 80),
          });
        }
        try {
          await prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "SafeVaultAttempt_roundId_idx" ON "SafeVaultAttempt" ("roundId")`,
          );
        } catch (e) {}
        try {
          await prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "SafeVaultAttempt_userId_idx" ON "SafeVaultAttempt" ("userId")`,
          );
        } catch (e) {}
        try {
          await prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "SafeVaultAttempt_guildId_idx" ON "SafeVaultAttempt" ("guildId")`,
          );
        } catch (e) {}
        try {
          await prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "SafeVaultAttempt_createdAt_idx" ON "SafeVaultAttempt" ("createdAt")`,
          );
        } catch (e) {}
        try {
          await prisma.$executeRawUnsafe(
            `CREATE TABLE IF NOT EXISTS "SafeVaultDailyLimit" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "dateKey" TEXT NOT NULL, "attemptsUsed" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL, CONSTRAINT "SafeVaultDailyLimit_pkey" PRIMARY KEY ("id"))`,
          );
        } catch (e) {
          logger.info("Migration: SafeVaultDailyLimit table", {
            error: e.message?.slice(0, 80),
          });
        }
        try {
          await prisma.$executeRawUnsafe(
            `CREATE UNIQUE INDEX IF NOT EXISTS "SafeVaultDailyLimit_userId_dateKey_key" ON "SafeVaultDailyLimit" ("userId", "dateKey")`,
          );
        } catch (e) {}
        try {
          await prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "SafeVaultDailyLimit_dateKey_idx" ON "SafeVaultDailyLimit" ("dateKey")`,
          );
        } catch (e) {}
        // SafeVault FK — idempotent via DO block (ADD CONSTRAINT lacks IF NOT EXISTS)
        try {
          await prisma.$executeRawUnsafe(
            `DO $$
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'SafeVaultAttempt_roundId_fkey'
              ) THEN
                ALTER TABLE "SafeVaultAttempt" ADD CONSTRAINT "SafeVaultAttempt_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "SafeVaultRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
              END IF;
            END;
            $$`,
          );
        } catch (e) {
          logger.info("Migration: SafeVault FK", {
            error: e.message?.slice(0, 80),
          });
        }

        logger.info("Startup migration check complete");

        // 1b. Schedule hourly analytics job (runs at minute 1 past every hour)
        try {
          const { scheduleNextRun } = require("../jobs/analyticsJob");
          scheduleNextRun(client);
        } catch (e) {
          logger.warn("Analytics job scheduler failed", {
            error: e.message?.slice(0, 60),
          });
        }

        // 2. Safe redeploy: only send to Discord if commands were loaded
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
