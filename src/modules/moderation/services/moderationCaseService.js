"use strict";

const { generateModerationId } = require("../../../lib/publicIdGenerator");
const caseRepo = require("../repositories/moderationCaseRepository");
const roleSnapshotRepo = require("../repositories/roleSnapshotRepository");

/**
 * Create a new moderation case
 */
async function createCase(data) {
  // Get next sequential case number for this guild
  const caseNumber = await caseRepo.getNextCaseNumber(data.guildId);
  const publicId = generateModerationId(caseNumber);

  const caseData = {
    publicId,
    guildId: data.guildId,
    userId: data.userId,
    moderatorId: data.moderatorId,
    actionType: data.actionType,
    reason: data.reason,
    durationSeconds: data.durationSeconds || null,
    expiresAt: data.expiresAt || null,
    status: "ACTIVE",
    appealStatus: data.actionType === "WARN" ? "NONE" : null,
  };

  const moderationCase = await caseRepo.createModerationCase(caseData);
  return moderationCase;
}

/**
 * Get case by public ID
 */
async function getCaseByPublicId(publicId) {
  return caseRepo.getCaseByPublicId(publicId);
}

/**
 * Get user cases
 */
async function getUserCases(guildId, userId, options) {
  return caseRepo.getUserCases(guildId, userId, options);
}

/**
 * Get active cases for user
 */
async function getActiveCases(guildId, userId) {
  return caseRepo.getActiveCases(guildId, userId);
}

/**
 * Get active probation
 */
async function getActiveProbation(guildId, userId) {
  return caseRepo.getActiveProbation(guildId, userId);
}

/**
 * Revoke a case
 */
async function revokeCase(publicId, revokedBy, guild = null) {
  const moderationCase = await caseRepo.getCaseByPublicId(publicId);
  if (!moderationCase) {
    throw new Error("Case not found");
  }

  // Revoke the case
  const revokedCase = await caseRepo.revokeCase(publicId, revokedBy);

  // Send DM to user notifying them their case was revoked
  if (guild) {
    try {
      const user = await guild.client.users.fetch(moderationCase.userId);
      const { EmbedBuilder } = require("discord.js");

      const embed = new EmbedBuilder()
        .setColor("#2ecc71")
        .setTitle("✅ Moderation Case Revoked")
        .setDescription(
          `Your case **${moderationCase.publicId}** has been overturned`,
        )
        .addFields(
          { name: "Server", value: guild.name },
          { name: "Original Action", value: moderationCase.actionType },
          {
            name: "Original Reason",
            value: moderationCase.reason || "No reason provided",
          },
          {
            name: "Status",
            value: "This case has been removed from your record",
          },
        )
        .setFooter({ text: `Powered by Discore • Case deleted from database` })
        .setTimestamp();

      await user.send({ embeds: [embed] });
    } catch (error) {
      console.log("[Revoke] Could not DM user:", error.message);
    }
  }

  // Attempt to restore roles if snapshot exists
  if (guild && moderationCase.roleSnapshot) {
    try {
      const member = await guild.members.fetch(moderationCase.userId);
      const roleSnapshot = moderationCase.roleSnapshot;

      const rolesToRestore = roleSnapshot.roleIds.filter((roleId) => {
        return guild.roles.cache.has(roleId);
      });

      if (rolesToRestore.length > 0) {
        await member.roles.add(rolesToRestore);
      }
    } catch (error) {
      console.error("[Revoke] Could not restore roles:", error.message);
    }
  }

  // Remove active punishment if applicable
  if (guild) {
    try {
      const member = await guild.members.fetch(moderationCase.userId);

      switch (moderationCase.actionType) {
        case "TIMEOUT":
          if (member.communicationDisabledUntil) {
            await member.timeout(null, "Case revoked");
          }
          break;
        case "MUTE":
          // If using muted role, remove it
          const dbGuild = await require("../../../lib/prisma").guild.findUnique(
            {
              where: { id: guild.id },
            },
          );
          if (dbGuild?.discoreMutedRoleId) {
            await member.roles.remove(dbGuild.discoreMutedRoleId);
          }
          break;
        case "BAN":
          try {
            await guild.members.unban(moderationCase.userId, "Case revoked");
          } catch {
            // Already unbanned or not found
          }
          break;
      }
    } catch (error) {
      console.error("[Revoke] Could not remove punishment:", error.message);
    }
  }

  return revokedCase;
}

/**
 * Expire a case
 */
async function expireCase(caseId) {
  return caseRepo.updateCaseStatus(caseId, "EXPIRED");
}

/**
 * Get expired cases
 */
async function getExpiredCases() {
  return caseRepo.getExpiredCases();
}

/**
 * Save role snapshot
 */
async function saveRoleSnapshot(caseId, guildId, userId, roleIds) {
  return roleSnapshotRepo.createRoleSnapshot(caseId, guildId, userId, roleIds);
}

/**
 * Get moderation stats for user
 */
async function getUserModerationStats(guildId, userId) {
  return caseRepo.getUserModerationStats(guildId, userId);
}

/**
 * Update case appeal status
 */
async function updateCaseAppealStatus(caseId, appealStatus) {
  return caseRepo.updateCaseAppealStatus(caseId, appealStatus);
}

module.exports = {
  createCase,
  getCaseByPublicId,
  getUserCases,
  getActiveCases,
  getActiveProbation,
  revokeCase,
  expireCase,
  getExpiredCases,
  saveRoleSnapshot,
  getUserModerationStats,
  updateCaseAppealStatus,
};
