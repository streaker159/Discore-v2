"use strict";

const appealService = require("../../../modules/moderation/services/appealService");

module.exports = {
  customId: "appeal_reject_confirm",

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const appealId = interaction.customId.split(":")[1];
      const reason = interaction.fields.getTextInputValue("reject_reason");

      const appeal = await appealService.rejectAppeal(
        appealId,
        interaction.user.id,
        reason,
        interaction.guild,
      );

      return interaction.editReply({
        content:
          `❌ **Appeal Rejected**\n\n` +
          `Appeal **${appeal.publicId}** was rejected.\n` +
          `Case **${appeal.case?.publicId || "Unknown"}** remains upheld.\n` +
          `The ticket will delete automatically.`,
      });
    } catch (error) {
      console.error("[Appeal Reject Confirm Error]", error);

      return interaction.editReply({
        content: `⚠️ Error: ${error.message}`,
      });
    }
  },
};
