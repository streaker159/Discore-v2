"use strict";

const { PermissionFlagsBits } = require("discord.js");
const appealService = require("../../../modules/moderation/services/appealService");
const {
  canHandleAppeals,
} = require("../../../modules/moderation/utils/permissions");
const prisma = require("../../../lib/prisma");
const {
  updateAppealChannelEmbed,
} = require("../../../modules/moderation/embeds/appealEmbed");

module.exports = {
  customId: "appeal_close",

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

      // Close the appeal
      const appeal = await appealService.closeAppeal(
        appealId,
        interaction.user.id,
      );

      // Update channel embed
      await updateAppealChannelEmbed(interaction.channel, appeal, appeal.case);

      // Lock the channel
      try {
        await interaction.channel.permissionOverwrites.edit(
          interaction.guild.id,
          {
            [PermissionFlagsBits.SendMessages]: false,
          },
        );

        // Also lock for the user if they were added
        if (appeal.userId) {
          const userOverwrite =
            interaction.channel.permissionOverwrites.cache.get(appeal.userId);
          if (userOverwrite) {
            await interaction.channel.permissionOverwrites.edit(appeal.userId, {
              [PermissionFlagsBits.SendMessages]: false,
            });
          }
        }

        await interaction.channel.send({
          content:
            "🔒 **This appeal has been closed and the channel has been locked.**",
        });
      } catch (error) {
        console.error("[Close Appeal] Could not lock channel:", error);
      }

      return interaction.editReply({
        content: `✅ **Appeal Closed**\n\nThe appeal has been closed and the channel has been locked.\n\nAppeal ID: ${appealId}`,
      });
    } catch (error) {
      console.error("[Appeal Close Error]", error);
      return interaction.editReply({
        content: `⚠️ Error: ${error.message}`,
      });
    }
  },
};
