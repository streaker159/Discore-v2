"use strict";

const { PermissionFlagsBits } = require("discord.js");
const appealService = require("../../../modules/moderation/services/appealService");
const {
  canHandleAppeals,
} = require("../../../modules/moderation/utils/permissions");
const prisma = require("../../../lib/prisma");

module.exports = {
  customId: "appeal_bring_member",

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const appealId = interaction.customId.split(":")[1];

      // Check permissions
      const dbGuild = await prisma.guild.findUnique({
        where: { id: interaction.guildId },
      });

      if (!canHandleAppeals(interaction.member, dbGuild)) {
        return interaction.editReply({
          content: "⚠️ You don't have permission to handle appeals.",
        });
      }

      // Get appeal
      const appeal = await appealService.getAppealByPublicId(appealId);
      if (!appeal) {
        return interaction.editReply({
          content: "⚠️ Appeal not found.",
        });
      }

      // Check if user is banned
      let isBanned = false;
      try {
        await interaction.guild.bans.fetch(appeal.userId);
        isBanned = true;
      } catch {
        // User is not banned
      }

      if (isBanned) {
        return interaction.editReply({
          content:
            "⚠️ **User is Banned**\n\n" +
            "This user is currently banned and cannot see server channels.\n" +
            "To include them in the appeal, you would need to:\n" +
            "1. Temporarily unban them\n" +
            "2. Grant them the Discore Appeal role\n" +
            "3. Restrict their access to only this channel\n" +
            "4. Re-ban after appeal is resolved (if needed)\n\n" +
            "This must be done manually for security reasons.",
        });
      }

      // Add user to channel permissions
      try {
        await interaction.channel.permissionOverwrites.create(appeal.userId, {
          [PermissionFlagsBits.ViewChannel]: true,
          [PermissionFlagsBits.SendMessages]: true,
          [PermissionFlagsBits.ReadMessageHistory]: true,
        });

        // Send notification in channel
        await interaction.channel.send({
          content: `<@${appeal.userId}>, you have been added to this appeal channel. You can now discuss your appeal with staff directly.`,
        });

        // Try to DM user
        try {
          const user = await interaction.client.users.fetch(appeal.userId);
          await user.send(
            `You have been added to your appeal channel in **${interaction.guild.name}**. You can now discuss your case with staff.`,
          );
        } catch {
          // Could not DM
        }

        return interaction.editReply({
          content: `✅ **Member Added**\n\n<@${appeal.userId}> has been added to this appeal channel.`,
        });
      } catch (error) {
        console.error("[Bring Member Error]", error);
        return interaction.editReply({
          content: `⚠️ Failed to add member: ${error.message}`,
        });
      }
    } catch (error) {
      console.error("[Appeal Bring Member Error]", error);
      return interaction.editReply({
        content: `⚠️ Error: ${error.message}`,
      });
    }
  },
};
