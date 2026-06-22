"use strict";

const {
  PermissionFlagsBits,
  ChannelType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require("discord.js");
const { generateAppealId } = require("../../../lib/publicIdGenerator");
const appealRepo = require("../repositories/appealRepository");
const caseService = require("./moderationCaseService");
const { createAppealEmbed } = require("../embeds/appealEmbed");

/**
 * Create an appeal
 */
async function createAppeal(caseId, userId, appealText, guild) {
  const moderationCase = await caseService.getCaseByPublicId(caseId);
  if (!moderationCase) {
    throw new Error("Case not found");
  }

  // Check if already has open appeal
  const hasOpen = await appealRepo.hasOpenAppeal(moderationCase.id);
  if (hasOpen) {
    throw new Error("This case already has an open appeal");
  }

  // Check if case is appealable
  if (moderationCase.status === "REVOKED") {
    throw new Error("This case has already been revoked");
  }

  const appealNumber = await appealRepo.getNextAppealNumber(
    moderationCase.guildId,
  );
  const publicId = generateAppealId(appealNumber);

  const appealData = {
    publicId,
    caseId: moderationCase.id,
    guildId: moderationCase.guildId,
    userId,
    appealText,
    status: "OPEN",
  };

  const appeal = await appealRepo.createAppeal(appealData);

  // Update case appeal status
  await caseService.updateCaseAppealStatus(moderationCase.id, "OPEN");

  // Create appeal channel
  try {
    const channel = await createAppealChannel(guild, appeal, moderationCase);

    // Update appeal with channel ID
    await appealRepo.updateAppealStatus(appeal.id, "OPEN", {
      channelId: channel.id,
    });

    appeal.channelId = channel.id;
  } catch (error) {
    console.error("[Appeal] Could not create channel:", error);
    throw new Error("Failed to create appeal channel");
  }

  return appeal;
}

/**
 * Create appeal channel
 */
async function createAppealChannel(guild, appeal, moderationCase) {
  const dbGuild = await require("../../../lib/prisma").guild.findUnique({
    where: { id: guild.id },
  });

  // Find or create Appeals category
  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === "Appeals",
  );

  if (!category) {
    category = await guild.channels.create({
      name: "Appeals",
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
      ],
    });
  }

  // Create channel
  const permissionOverwrites = [
    {
      id: guild.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: guild.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
      ],
    },
  ];

  // Add Discore Manager role if exists
  if (dbGuild?.discoreManagerRoleId) {
    permissionOverwrites.push({
      id: dbGuild.discoreManagerRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
      ],
    });
  }

  const channel = await guild.channels.create({
    name: `appeal-${appeal.publicId.toLowerCase()}`,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites,
  });

  // Post appeal embed
  const embed = await createAppealEmbed(appeal, moderationCase, guild);
  const buttons = createAppealAdminButtons(appeal.publicId);

  await channel.send({
    embeds: [embed],
    components: buttons,
  });

  return channel;
}

/**
 * Create admin buttons for appeal channel
 */
function createAppealAdminButtons(appealId) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`appeal_accept:${appealId}`)
      .setLabel("✅ Accept Appeal")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`appeal_reject:${appealId}`)
      .setLabel("❌ Reject Appeal")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`appeal_reduce:${appealId}`)
      .setLabel("🔁 Reduce Punishment")
      .setStyle(ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`appeal_bring_member:${appealId}`)
      .setLabel("🎟️ Bring Member")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`appeal_add_note:${appealId}`)
      .setLabel("📝 Add Note")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`appeal_close:${appealId}`)
      .setLabel("🔒 Close")
      .setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2];
}

/**
 * Accept an appeal
 */
async function acceptAppeal(appealId, adminId, guild) {
  const appeal = await appealRepo.getAppealByPublicId(appealId);
  if (!appeal) {
    throw new Error("Appeal not found");
  }

  // Update appeal status
  await appealRepo.updateAppealStatus(appeal.id, "ACCEPTED", {
    closedAt: new Date(),
    closedBy: adminId,
    outcome: "Appeal accepted - case revoked",
  });

  // Revoke the case
  await caseService.revokeCase(appeal.case.publicId, adminId, guild);

  // Update case appeal status
  await caseService.updateCaseAppealStatus(appeal.caseId, "ACCEPTED");

  return appeal;
}

/**
 * Reject an appeal
 */
async function rejectAppeal(appealId, adminId, reason = null) {
  const appeal = await appealRepo.getAppealByPublicId(appealId);
  if (!appeal) {
    throw new Error("Appeal not found");
  }

  const outcome = reason || "Appeal rejected - case upheld";

  await appealRepo.updateAppealStatus(appeal.id, "REJECTED", {
    closedAt: new Date(),
    closedBy: adminId,
    outcome,
  });

  // Update case status
  await caseService.updateCaseAppealStatus(appeal.caseId, "REJECTED");
  await require("../repositories/moderationCaseRepository").updateCaseStatus(
    appeal.caseId,
    "UPHELD",
  );

  return appeal;
}

/**
 * Reduce punishment
 */
async function reducePunishment(appealId, adminId, newDurationSeconds, guild) {
  const appeal = await appealRepo.getAppealByPublicId(appealId);
  if (!appeal) {
    throw new Error("Appeal not found");
  }

  const moderationCase = appeal.case;
  const newExpiresAt = new Date(Date.now() + newDurationSeconds * 1000);

  // Update case
  await require("../repositories/moderationCaseRepository").updateCaseStatus(
    moderationCase.id,
    "ACTIVE",
    {
      durationSeconds: newDurationSeconds,
      expiresAt: newExpiresAt,
    },
  );

  // Update appeal
  await appealRepo.updateAppealStatus(appeal.id, "REDUCED", {
    closedAt: new Date(),
    closedBy: adminId,
    outcome: `Punishment reduced to ${newDurationSeconds} seconds`,
  });

  await caseService.updateCaseAppealStatus(moderationCase.id, "REDUCED");

  // Apply reduced timeout if applicable
  if (guild && moderationCase.actionType === "TIMEOUT") {
    try {
      const member = await guild.members.fetch(moderationCase.userId);
      await member.timeout(
        newDurationSeconds * 1000,
        "Punishment reduced via appeal",
      );
    } catch (error) {
      console.error("[Reduce] Could not apply reduced timeout:", error);
    }
  }

  return appeal;
}

/**
 * Close appeal
 */
async function closeAppeal(appealId, adminId) {
  return appealRepo.closeAppeal(appealId, adminId, "Appeal closed by staff");
}

/**
 * Add staff note
 */
async function addStaffNote(appealId, note) {
  return appealRepo.addStaffNote(appealId, note);
}

/**
 * Get appeal by public ID
 */
async function getAppealByPublicId(publicId) {
  return appealRepo.getAppealByPublicId(publicId);
}

module.exports = {
  createAppeal,
  acceptAppeal,
  rejectAppeal,
  reducePunishment,
  closeAppeal,
  addStaffNote,
  getAppealByPublicId,
  createAppealAdminButtons,
};
