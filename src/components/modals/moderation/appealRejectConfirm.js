"use strict";

const appealService = require("../../../modules/moderation/services/appealService");
const {
  createAppealOutcomeEmbed,
  updateAppealChannelEmbed,
} = require("../../../modules/moderation/embeds/appealEmbed");

module.exports = {
  customId: "appeal_reject_confirm",

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const appealId = interaction.customId.split(":")[1];
      const reason = interaction.fields.getTextInputValue("reject_reason");

      // Reject the appeal
      const appeal = await appealService.rejectAppeal(
        appealId,
        interaction.user.id,
        reason,
      );

      // Update channel embed
      await updateAppealChannelEmbed(interaction.channel, appeal, appeal.case);

      // Try to DM user
      try {
        const user = await interaction.client.users.fetch(appeal.userId);
        const outcomeEmbed = createAppealOutcomeEmbed(
          appeal,
          reason,
          interaction.guild.name,
        );

        await user.send({ embeds: [outcomeEmbed] });
      } catch (error) {
        console.log("[Appeal Reject] Could not DM user:", error.message);
      }

      return interaction.editReply({
        content: `✅ **Appeal Rejected**\n\nThe appeal has been rejected and the case remains active.\n\nAppeal ID: ${appealId}\nCase ID: ${appeal.case?.publicId}`,
      });
    } catch (error) {
      console.error("[Appeal Reject Confirm Error]", error);
      return interaction.editReply({
        content: `⚠️ Error: ${error.message}`,
      });
    }
  },
};
