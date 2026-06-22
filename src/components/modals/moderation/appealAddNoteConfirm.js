"use strict";

const appealService = require("../../../modules/moderation/services/appealService");

module.exports = {
  customId: "appeal_add_note_confirm",

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const appealId = interaction.customId.split(":")[1];
      const note = interaction.fields.getTextInputValue("staff_note");

      // Add the note
      await appealService.addStaffNote(appealId, note);

      return interaction.editReply({
        content: `✅ **Staff Note Added**\n\nYour internal note has been added to appeal **${appealId}**.`,
      });
    } catch (error) {
      console.error("[Appeal Add Note Confirm Error]", error);
      return interaction.editReply({
        content: `⚠️ Error: ${error.message}`,
      });
    }
  },
};
