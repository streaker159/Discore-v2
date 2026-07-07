"use strict";

const prisma = require("../../../lib/prisma");
const { canModerate, hasModPermissions } = require("../utils/permissions");
const caseService = require("./moderationCaseService");
const {
  createModerationDmEmbed,
  createModerationLogEmbed,
} = require("../embeds/moderationDmEmbed");

/**
 * Get readable moderator name.
 */
function getModeratorDisplayName(moderator) {
  return (
    moderator?.nickname ||
    moderator?.displayName ||
    moderator?.user?.tag ||
    moderator?.user?.username ||
    "Unknown moderator"
  );
}

/**
 * Get readable target name.
 */
function getUserDisplayName(user) {
  return user?.tag || user?.username || user?.id || "Unknown user";
}

/**
 * Build moderation case expiry date.
 */
function buildExpiresAt(durationSeconds) {
  if (!durationSeconds) return null;
  return new Date(Date.now() + durationSeconds * 1000);
}

/**
 * Discord timeout maximum is 28 days.
 */
function clampTimeoutMs(durationSeconds) {
  const maxTimeoutMs = 28 * 24 * 60 * 60 * 1000;
  const requestedMs = Number(durationSeconds || 0) * 1000;

  if (!requestedMs || Number.isNaN(requestedMs)) {
    return null;
  }

  return Math.min(requestedMs, maxTimeoutMs);
}

/**
 * Try to DM a moderated user.
 *
 * For bans, this should be called before the ban where possible.
 */
async function sendModerationDm({
  guild,
  moderator,
  targetUser,
  moderationCase,
  actionType,
  reason,
  durationSeconds,
  canAppeal = true,
}) {
  if (!targetUser) {
    return false;
  }

  try {
    console.log(
      `[Mod DM] Attempting to DM user ${targetUser.id} for ${actionType}`,
    );

    const moderatorName = getModeratorDisplayName(moderator);

    const dmData = createModerationDmEmbed({
      guildName: guild.name,
      actionType,
      reason,
      caseId: moderationCase.publicId,
      durationSeconds,
      moderatorName,
      canAppeal,
    });

    await targetUser.send({
      embeds: [dmData.embed],
      components: dmData.components,
    });

    console.log(
      `[Mod DM] DM sent successfully to ${getUserDisplayName(targetUser)}`,
    );
    return true;
  } catch (error) {
    console.error(
      `[Mod DM] Could not DM user ${targetUser?.id || "unknown"}:`,
      error?.message || error,
    );
    return false;
  }
}

/**
 * Send moderation log embed to configured log channel.
 */
async function sendModerationLog({
  guild,
  dbGuild,
  moderator,
  targetUser,
  moderationCase,
  actionType,
  reason,
  durationSeconds,
  dmSent,
  actionSuccess,
  actionError,
}) {
  // Use dedicated moderation log channel first, fall back to general log channel
  const targetChannelId =
    dbGuild?.moderationLogChannelId || dbGuild?.logChannelId;
  if (!targetChannelId) {
    return;
  }

  try {
    const logChannel = await guild.channels.fetch(targetChannelId);

    if (!logChannel || !logChannel.isTextBased()) {
      return;
    }

    const logEmbed = createModerationLogEmbed({
      actionType,
      userId: targetUser.id,
      userName: getUserDisplayName(targetUser),
      moderatorId: moderator.id,
      moderatorName: getModeratorDisplayName(moderator),
      reason,
      caseId: moderationCase.publicId,
      durationSeconds,
      dmSent,
      actionSuccess,
      actionError,
    });

    await logChannel.send({ embeds: [logEmbed] });
  } catch (error) {
    console.error("[Mod Log]", error?.message || error);
  }
}

/**
 * Save a role snapshot before actions that may remove access.
 */
async function saveRoleSnapshotIfNeeded({
  guild,
  targetUser,
  targetMember,
  actionType,
  moderationCase,
}) {
  if (!targetMember) return;

  if (!["MUTE", "BAN", "TEMP_BAN"].includes(actionType)) {
    return;
  }

  const roleIds = targetMember.roles.cache
    .filter((role) => role.id !== guild.id)
    .map((role) => role.id);

  if (roleIds.length === 0) {
    return;
  }

  try {
    await caseService.saveRoleSnapshot(
      moderationCase.id,
      guild.id,
      targetUser.id,
      roleIds,
    );
  } catch (error) {
    console.error(
      "[Role Snapshot] Could not save role snapshot:",
      error?.message || error,
    );
  }
}

/**
 * Execute a moderation action with checks, case creation, DM, action, and logging.
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
    deleteMessageSeconds,
    probationChannelId,
    probationSlowmodeSeconds,
    probationRoleId,
    canAppeal = true,
  } = options;

  if (!guild) {
    throw new Error("Guild is required");
  }

  if (!actionType) {
    throw new Error("Action type is required");
  }

  // UNBAN does not need a moderator permission check in the same way,
  // but we still validate the caller has permission at the command level.
  if (actionType !== "UNBAN") {
    if (!moderator) {
      throw new Error("Moderator is required");
    }

    if (!targetUser) {
      throw new Error("Target user is required");
    }
  }

  const dbGuild = await prisma.guild.findUnique({
    where: { id: guild.id },
  });

  if (actionType !== "UNBAN" && !hasModPermissions(moderator, dbGuild)) {
    throw new Error("You don't have permission to perform moderation actions");
  }

  if (targetMember && actionType !== "UNBAN") {
    const check = canModerate(moderator, targetMember, guild);
    if (!check.canModerate) {
      throw new Error(check.reason);
    }
  }

  const expiresAt = buildExpiresAt(durationSeconds);

  const moderationCase = await caseService.createCase({
    guildId: guild.id,
    userId: targetUser?.id || options.targetUserId,
    moderatorId: moderator?.id || options.moderatorId,
    actionType,
    reason,
    durationSeconds,
    expiresAt,
  });

  await saveRoleSnapshotIfNeeded({
    guild,
    targetUser,
    targetMember,
    actionType,
    moderationCase,
  });

  let dmSent = false;
  let actionSuccess = false;
  let actionError = null;

  /**
   * For bans, DM before the ban.
   * After a ban, Discord DMs are less reliable depending mutual server state/privacy.
   */
  if (["BAN", "TEMP_BAN"].includes(actionType) && targetUser) {
    dmSent = await sendModerationDm({
      guild,
      moderator,
      targetUser,
      moderationCase,
      actionType,
      reason,
      durationSeconds,
      canAppeal,
    });
  }

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
      {
        deleteMessageSeconds,
        probationChannelId,
        probationSlowmodeSeconds,
        probationRoleId,
      },
    );
  } catch (error) {
    actionSuccess = false;
    actionError = error?.message || String(error);
    console.error(`[Mod Action ${actionType}]`, error);
  }

  /**
   * For non-ban actions, DM after the action attempt.
   */
  if (!["BAN", "TEMP_BAN"].includes(actionType) && targetUser) {
    dmSent = await sendModerationDm({
      guild,
      moderator,
      targetUser,
      moderationCase,
      actionType,
      reason,
      durationSeconds,
      canAppeal,
    });
  }

  await sendModerationLog({
    guild,
    dbGuild,
    moderator: moderator || {
      id: options.moderatorId || "SYSTEM",
      nickname: "Discore",
    },
    targetUser: targetUser || {
      id: options.targetUserId || "unknown",
      tag: "Unknown User",
    },
    moderationCase,
    actionType,
    reason,
    durationSeconds,
    dmSent,
    actionSuccess,
    actionError,
  });

  return {
    case: moderationCase,
    actionSuccess,
    actionError,
    dmSent,
  };
}

/**
 * Apply the actual Discord moderation action.
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
  extra = {},
) {
  const safeReason = reason || "No reason provided";
  const fullReason = `${safeReason} [${caseId}]`;

  switch (actionType) {
    case "WARN":
      return true;

    case "PROBATION": {
      // Apply probation role if configured
      const probRoleId = extra.probationRoleId;
      if (targetMember && probRoleId) {
        const role = guild.roles.cache.get(probRoleId);
        if (role) {
          await targetMember.roles.add(role, fullReason);
        }
      }

      // Apply channel slowmode if configured
      const slowChanId = extra.probationChannelId;
      const slowSeconds = extra.probationSlowmodeSeconds;
      if (slowChanId && slowSeconds && slowSeconds > 0) {
        const channel = guild.channels.cache.get(slowChanId);
        if (channel && channel.isTextBased() && !channel.isThread()) {
          await channel.setRateLimitPerUser(
            Math.min(slowSeconds, 21600), // Discord max is 6 hours
            `Probation slowmode [${caseId}]`,
          );
        }
      }

      return true;
    }

    case "MUTE": {
      if (!targetMember) {
        throw new Error("User is not in the server");
      }

      if (dbGuild?.discoreMutedRoleId) {
        const mutedRole = guild.roles.cache.get(dbGuild.discoreMutedRoleId);

        if (mutedRole) {
          await targetMember.roles.add(mutedRole, fullReason);
          return true;
        }
      }

      // Fallback: use Discord native timeout (clamped to 28 days)
      const timeoutMs = clampTimeoutMs(durationSeconds);

      if (timeoutMs) {
        await targetMember.timeout(timeoutMs, fullReason);
        return true;
      }

      throw new Error(
        "Mute role is not configured and no valid duration was provided",
      );
    }

    case "TIMEOUT": {
      if (!targetMember) {
        throw new Error("User is not in the server");
      }

      // Timeout is capped at 28 days by Discord
      const timeoutMs = clampTimeoutMs(durationSeconds);

      if (!timeoutMs) {
        throw new Error("Timeout requires a valid duration (max 28 days)");
      }

      await targetMember.timeout(timeoutMs, fullReason);
      return true;
    }

    case "BAN":
    case "TEMP_BAN": {
      const deleteSeconds = extra.deleteMessageSeconds || 0;

      await guild.members.ban(targetUser.id, {
        reason: fullReason,
        deleteMessageSeconds: Math.min(deleteSeconds, 604800), // Max 7 days
      });

      return true;
    }

    case "UNBAN": {
      // targetUser may not exist (banned users), so we use guild.members.unban by ID
      const userId = targetUser?.id || extra.targetUserId;
      if (!userId) throw new Error("User ID is required for unban");

      await guild.members.unban(userId, fullReason).catch((err) => {
        // If user is not banned, this is still a "success" for record-keeping
        if (err.code === 10026) {
          // Unknown Ban — already unbanned
          return;
        }
        throw err;
      });
      return true;
    }

    default:
      throw new Error(`Unknown action type: ${actionType}`);
  }
}

module.exports = {
  executeModAction,
  applyModAction,
};
