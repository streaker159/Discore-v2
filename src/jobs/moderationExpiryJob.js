"use strict";

const cron = require("node-cron");
const caseService = require("../modules/moderation/services/moderationCaseService");
const prisma = require("../lib/prisma");

let isRunning = false;
let lastDbWarningAt = 0;
const DB_WARNING_COOLDOWN_MS = 60_000;

function isDatabaseConnectionError(error) {
  return (
    error?.code === "P1001" ||
    error?.code === "P1002" ||
    String(error?.message || "").includes("Can't reach database server") ||
    String(error?.message || "").includes("Timed out fetching a new connection")
  );
}

function logJobError(context, error) {
  if (isDatabaseConnectionError(error)) {
    const now = Date.now();

    if (now - lastDbWarningAt > DB_WARNING_COOLDOWN_MS) {
      lastDbWarningAt = now;
      console.warn(
        `[Moderation Expiry] Database unreachable during ${context}. Skipping this run. Supabase/pooler may be waking up or temporarily unavailable.`,
      );
    }

    return;
  }

  console.error(`[Moderation Expiry] Error during ${context}:`, error);
}

async function safeFetchGuildSettings(guildId) {
  try {
    return await prisma.guild.findUnique({
      where: { id: guildId },
    });
  } catch (error) {
    logJobError(`guild settings lookup for ${guildId}`, error);
    return null;
  }
}

async function removeTimeout(guild, moderationCase) {
  try {
    const member = await guild.members.fetch(moderationCase.userId);

    if (member.communicationDisabledUntil) {
      await member.timeout(null, "Timeout expired");
    }
  } catch {
    // User not in server, already removed, or timeout already gone.
  }
}

async function removeMuteRole(guild, moderationCase, dbGuild) {
  try {
    if (!dbGuild?.discoreMutedRoleId) return;

    const member = await guild.members.fetch(moderationCase.userId);
    await member.roles.remove(dbGuild.discoreMutedRoleId, "Mute expired");
  } catch {
    // User not in server, role missing, hierarchy issue, or role already removed.
  }
}

async function removeTemporaryBan(guild, moderationCase) {
  try {
    await guild.members.unban(moderationCase.userId, "Temporary ban expired");
  } catch {
    // Already unbanned or not found.
  }
}

async function removeActivePunishment(client, moderationCase) {
  const guild = client.guilds.cache.get(moderationCase.guildId);

  if (!guild) {
    return;
  }

  const dbGuild = await safeFetchGuildSettings(guild.id);

  switch (moderationCase.actionType) {
    case "TIMEOUT":
      await removeTimeout(guild, moderationCase);
      break;

    case "MUTE":
      await removeMuteRole(guild, moderationCase, dbGuild);
      break;

    case "BAN":
    case "TEMP_BAN":
      await removeTemporaryBan(guild, moderationCase);
      break;

    case "PROBATION":
      // Probation only needs the database case expiry.
      break;

    case "WARN":
      // Warnings do not need active punishment cleanup.
      break;

    default:
      break;
  }
}

/**
 * Process expired moderation cases.
 */
async function processExpiredCases(client) {
  if (isRunning) return;

  isRunning = true;

  try {
    let expiredCases = [];

    try {
      expiredCases = await caseService.getExpiredCases();
    } catch (error) {
      logJobError("expired case lookup", error);
      return;
    }

    if (!expiredCases.length) {
      console.log("[Moderation Expiry] Found 0 expired cases to process");
      return;
    }

    console.log(
      `[Moderation Expiry] Found ${expiredCases.length} expired case(s) to process`,
    );

    for (const moderationCase of expiredCases) {
      try {
        await removeActivePunishment(client, moderationCase);
        await caseService.expireCase(moderationCase.id);
        // Clean up the role snapshot stored when punishment was applied
        await prisma.userRoleSnapshot.deleteMany({
          where: { caseId: moderationCase.id },
        });


        console.log(
          `[Moderation Expiry] Expired case ${moderationCase.publicId} (${moderationCase.actionType})`,
        );
      } catch (error) {
        logJobError(
          `processing case ${moderationCase.publicId || moderationCase.id}`,
          error,
        );
      }
    }
  } finally {
    isRunning = false;
  }
}

/**
 * Start the moderation expiry job.
 */
function startModerationExpiryJob(client) {
  cron.schedule("*/5 * * * *", () => {
    processExpiredCases(client).catch((error) => {
      logJobError("scheduled run", error);
    });
  });

  console.log("[Moderation Expiry Job] Started (runs every 5 minutes)");

  // Run once on startup, but wait longer so the bot can fully log in first.
  setTimeout(() => {
    processExpiredCases(client).catch((error) => {
      logJobError("startup run", error);
    });
  }, 30_000);
}

module.exports = {
  startModerationExpiryJob,
};
