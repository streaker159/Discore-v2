"use strict";

const appealService = require("../../../modules/moderation/services/appealService");

module.exports = {
  customId: "appeal_accept_confirm",

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const appealId = interaction.customId.split(":")[1];
      const reason = interaction.fields.getTextInputValue("accept_reason");

      const appeal = await appealService.acceptAppeal(
        appealId,
        interaction.user.id,
        interaction.guild,
        reason,
      );

      return interaction.editReply({
        content:
          `✅ **Appeal Accepted**\n\n` +
          `Appeal **${appeal.publicId}** was accepted.\n` +
          `Case **${appeal.case?.publicId || "Unknown"}** was revoked and hidden from public case lists.\n` +
          `The ticket will delete automatically.`,
      });
    } catch (error) {
      console.error("[Appeal Accept Confirm Error]", error);

      return interaction.editReply({
        content: `⚠️ Error: ${error.message}`,
      });
    }
  },
};
