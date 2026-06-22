"use strict";

const appealService = require("../../../modules/moderation/services/appealService");
const {
  canHandleAppeals,
} = require("../../../modules/moderation/utils/permissions");
const prisma = require("../../../lib/prisma");
const {
  createAppealOutcomeEmbed,
  updateAppealChannelEmbed,
} = require("../../../modules/moderation/embeds/appealEmbed");

module.exports = {
  customId: "appeal_accept",

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

      // Accept the appeal
      const appeal = await appealService.acceptAppeal(
        appealId,
        interaction.user.id,
        interaction.guild,
      );

      // Update channel embed
      await updateAppealChannelEmbed(interaction.channel, appeal, appeal.case);

      // Try to DM user
      try {
        const user = await interaction.client.users.fetch(appeal.userId);
        const outcomeEmbed = createAppealOutcomeEmbed(
          appeal,
          "Your appeal has been accepted. The moderation action has been revoked and any applicable punishments have been removed.",
          interaction.guild.name,
        );

        await user.send({ embeds: [outcomeEmbed] });
      } catch (error) {
        console.log("[Appeal Accept] Could not DM user:", error.message);
      }

      return interaction.editReply({
        content: `✅ **Appeal Accepted**\n\nThe appeal has been accepted and the case has been revoked.\n\nAppeal ID: ${appealId}\nCase ID: ${appeal.case?.publicId}`,
      });
    } catch (error) {
      console.error("[Appeal Accept Error]", error);
      return interaction.editReply({
        content: `⚠️ Error: ${error.message}`,
      });
    }
  },
};
