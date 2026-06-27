"use strict";

const appealService = require("../../../modules/moderation/services/appealService");

module.exports = {
  customId: "appeal_add_note_confirm",

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const appealId = interaction.customId.split(":")[1];
      const note = interaction.fields.getTextInputValue("staff_note");

      await appealService.addStaffNote(appealId, note, interaction.user.id);

      return interaction.editReply({
        content:
          `✅ **Staff Note Added**\n\n` +
          `Your internal note has been added to appeal **${appealId}** and the linked case.`,
      });
    } catch (error) {
      console.error("[Appeal Add Note Confirm Error]", error);

      return interaction.editReply({
        content: `⚠️ Error: ${error.message}`,
      });
    }
  },
};
