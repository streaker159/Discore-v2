"use strict";

const cron = require("node-cron");
const caseService = require("../modules/moderation/services/moderationCaseService");
const prisma = require("../lib/prisma");

let isRunning = false;

/**
 * Process expired moderation cases
 */
async function processExpiredCases(client) {
  if (isRunning) return;
  isRunning = true;

  try {
    const expiredCases = await caseService.getExpiredCases();

    console.log(
      `[Moderation Expiry] Found ${expiredCases.length} expired cases to process`,
    );

    for (const moderationCase of expiredCases) {
      try {
        // Mark case as expired
        await caseService.expireCase(moderationCase.id);

        // Try to remove active punishment
        const guild = client.guilds.cache.get(moderationCase.guildId);
        if (!guild) continue;

        const dbGuild = await prisma.guild.findUnique({
          where: { id: guild.id },
        });

        switch (moderationCase.actionType) {
          case "TIMEOUT":
            try {
              const member = await guild.members.fetch(moderationCase.userId);
              if (member.communicationDisabledUntil) {
                await member.timeout(null, "Timeout expired");
              }
            } catch {
              // User not in server or already removed
            }
            break;

          case "MUTE":
            try {
              const member = await guild.members.fetch(moderationCase.userId);
              if (dbGuild?.discoreMutedRoleId) {
                await member.roles.remove(dbGuild.discoreMutedRoleId);
              }
            } catch {
              // User not in server or role not found
            }
            break;

          case "BAN":
            // Auto-unban for temp bans
            try {
              await guild.members.unban(
                moderationCase.userId,
                "Temporary ban expired",
              );
            } catch {
              // Already unbanned or not found
            }
            break;

          case "PROBATION":
            // Probation just expires, no action needed
            break;
        }

        console.log(
          `[Moderation Expiry] Expired case ${moderationCase.publicId} (${moderationCase.actionType})`,
        );
      } catch (error) {
        console.error(
          `[Moderation Expiry] Error processing case ${moderationCase.publicId}:`,
          error,
        );
      }
    }
  } catch (error) {
    console.error("[Moderation Expiry Job] Error:", error);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the moderation expiry job
 */
function startModerationExpiryJob(client) {
  // Run every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    processExpiredCases(client);
  });

  console.log("[Moderation Expiry Job] Started (runs every 5 minutes)");

  // Run once on startup after a delay
  setTimeout(() => {
    processExpiredCases(client);
  }, 10000);
}

module.exports = { startModerationExpiryJob };
