"use strict";

const { PermissionFlagsBits } = require("discord.js");
const { canModerate, hasModPermissions } = require("../utils/permissions");
const caseService = require("./moderationCaseService");
const {
  createModerationDmEmbed,
  createModerationLogEmbed,
} = require("../embeds/moderationDmEmbed");
const prisma = require("../../../lib/prisma");

/**
 * Execute a moderation action with all checks and logging
 */
async function executeModAction(options) {
  const {
    guild,
    moderator,
    targetUser,
    targetMember,
    actionType,
    reason,
    durationSeconds,
    interaction,
  } = options;

  // Permission checks
  const dbGuild = await prisma.guild.findUnique({
    where: { id: guild.id },
  });

  if (!hasModPermissions(moderator, dbGuild)) {
    throw new Error("You don't have permission to perform moderation actions");
  }

  // Check if target can be moderated
  if (targetMember) {
    const check = canModerate(moderator, targetMember, guild);
    if (!check.canModerate) {
      throw new Error(check.reason);
    }
  }

  // Calculate expiration
  let expiresAt = null;
  if (durationSeconds) {
    expiresAt = new Date(Date.now() + durationSeconds * 1000);
  }

  // Create moderation case
  const moderationCase = await caseService.createCase({
    guildId: guild.id,
    userId: targetUser.id,
    moderatorId: moderator.id,
    actionType,
    reason,
    durationSeconds,
    expiresAt,
  });

  // Save role snapshot if needed (for certain actions)
  if (targetMember && ["MUTE", "BAN"].includes(actionType)) {
    const roleIds = targetMember.roles.cache
      .filter((r) => r.id !== guild.id) // Exclude @everyone
      .map((r) => r.id);

    if (roleIds.length > 0) {
      await caseService.saveRoleSnapshot(
        moderationCase.id,
        guild.id,
        targetUser.id,
        roleIds,
      );
    }
  }

  // Apply the action
  let actionSuccess = false;
  let actionError = null;

  try {
    actionSuccess = await applyModAction(
      actionType,
      targetUser,
      targetMember,
      guild,
      reason,
      durationSeconds,
      moderationCase.publicId,
      dbGuild,
    );
  } catch (error) {
    actionError = error.message;
    console.error(`[Mod Action ${actionType}]`, error);
  }

  // Try to DM the user
  let dmSent = false;
  if (targetUser && actionType !== "WARN") {
    try {
      const moderatorName =
        moderator.nickname ||
        moderator.user?.tag ||
        moderator.displayName ||
        "Unknown";
      const dmData = createModerationDmEmbed({
        guildName: guild.name,
        actionType,
        reason,
        caseId: moderationCase.publicId,
        durationSeconds,
        moderatorName,
        canAppeal: true,
      });

      await targetUser.send({
        embeds: [dmData.embed],
        components: dmData.components,
      });
      dmSent = true;
    } catch (error) {
      console.log(
        `[Mod DM] Could not DM user ${targetUser.id}:`,
        error.message,
      );
    }
  }

  // Log to Discore log channel
  if (dbGuild?.logChannelId) {
    try {
      const logChannel = await guild.channels.fetch(dbGuild.logChannelId);
      if (logChannel && logChannel.isTextBased()) {
        const logEmbed = createModerationLogEmbed({
          actionType,
          userId: targetUser.id,
          userName: targetUser.tag,
          moderatorId: moderator.id,
          moderatorName: moderator.user?.tag || moderator.displayName,
          reason,
          caseId: moderationCase.publicId,
          durationSeconds,
        });

        await logChannel.send({ embeds: [logEmbed] });
      }
    } catch (error) {
      console.error("[Mod Log]", error);
    }
  }

  return {
    case: moderationCase,
    actionSuccess,
    actionError,
    dmSent,
  };
}

/**
 * Apply the actual moderation action
 */
async function applyModAction(
  actionType,
  targetUser,
  targetMember,
  guild,
  reason,
  durationSeconds,
  caseId,
  dbGuild,
) {
  const fullReason = `${reason} [${caseId}]`;

  switch (actionType) {
    case "WARN":
      // Warnings don't require Discord action
      return true;

    case "MUTE":
      if (!targetMember) {
        throw new Error("User is not in the server");
      }

      // Try to use muted role if configured
      if (dbGuild?.discoreMutedRoleId) {
        const mutedRole = guild.roles.cache.get(dbGuild.discoreMutedRoleId);
        if (mutedRole) {
          await targetMember.roles.add(mutedRole, fullReason);
          return true;
        }
      }

      // Fallback to timeout
      if (durationSeconds) {
        const timeoutMs = Math.min(
          durationSeconds * 1000,
          28 * 24 * 60 * 60 * 1000,
        );
        await targetMember.timeout(timeoutMs, fullReason);
        return true;
      }

      throw new Error("Mute role not configured and no duration provided");

    case "TIMEOUT":
      if (!targetMember) {
        throw new Error("User is not in the server");
      }

      const timeoutMs = Math.min(
        durationSeconds * 1000,
        28 * 24 * 60 * 60 * 1000,
      );
      await targetMember.timeout(timeoutMs, fullReason);
      return true;

    case "BAN":
      // Calculate delete message days (default 0)
      const deleteMessageSeconds = 0;

      await guild.members.ban(targetUser.id, {
        reason: fullReason,
        deleteMessageSeconds,
      });
      return true;

    case "PROBATION":
      // Probation doesn't require Discord action, only DB record
      return true;

    default:
      throw new Error(`Unknown action type: ${actionType}`);
  }
}

module.exports = {
  executeModAction,
  applyModAction,
};
