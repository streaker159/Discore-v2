"use strict";

const appealService = require("../../../modules/moderation/services/appealService");
const {
  parseDuration,
  formatDuration,
} = require("../../../modules/moderation/utils/durationParser");

module.exports = {
  customId: "appeal_reduce_confirm",

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    try {
      const appealId = interaction.customId.split(":")[1];
      const durationStr = interaction.fields.getTextInputValue("new_duration");
      const reason = interaction.fields.getTextInputValue("reduce_reason");

      const { seconds, error } = parseDuration(durationStr);
      if (error) {
        return interaction.editReply({
          content: `⚠️ Invalid duration format: ${error}`,
        });
      }

      if (!seconds) {
        return interaction.editReply({
          content: "⚠️ Please provide a valid duration.",
        });
      }

      const appeal = await appealService.reducePunishment(
        appealId,
        interaction.user.id,
        seconds,
        interaction.guild,
        reason,
      );

      return interaction.editReply({
        content:
          `🔁 **Punishment Reduced**\n\n` +
          `Appeal **${appeal.publicId}** was partially accepted.\n` +
          `New duration: **${formatDuration(seconds)}**\n` +
          `The ticket will delete automatically.`,
      });
    } catch (error) {
      console.error("[Appeal Reduce Confirm Error]", error);

      return interaction.editReply({
        content: `⚠️ Error: ${error.message}`,
      });
    }
  },
};
