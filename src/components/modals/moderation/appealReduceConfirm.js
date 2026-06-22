"use strict";

const appealService = require("../../../modules/moderation/services/appealService");
const {
  createAppealOutcomeEmbed,
  updateAppealChannelEmbed,
} = require("../../../modules/moderation/embeds/appealEmbed");
const {
  parseDuration,
  formatDuration,
} = require("../../../modules/moderation/utils/durationParser");

module.exports = {
  customId: "appeal_reduce_confirm",

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const appealId = interaction.customId.split(":")[1];
      const durationStr = interaction.fields.getTextInputValue("new_duration");
      const reason = interaction.fields.getTextInputValue("reduce_reason");

      // Parse duration
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

      // Reduce the punishment
      const appeal = await appealService.reducePunishment(
        appealId,
        interaction.user.id,
        seconds,
        interaction.guild,
      );

      // Update channel embed
      await updateAppealChannelEmbed(interaction.channel, appeal, appeal.case);

      // Try to DM user
      try {
        const user = await interaction.client.users.fetch(appeal.userId);
        const outcomeMessage = `Your punishment has been reduced to ${formatDuration(seconds)}.\n\n${reason}`;
        const outcomeEmbed = createAppealOutcomeEmbed(
          appeal,
          outcomeMessage,
          interaction.guild.name,
        );

        await user.send({ embeds: [outcomeEmbed] });
      } catch (error) {
        console.log("[Appeal Reduce] Could not DM user:", error.message);
      }

      return interaction.editReply({
        content: `✅ **Punishment Reduced**\n\nThe punishment has been reduced to **${formatDuration(seconds)}**.\n\nAppeal ID: ${appealId}\nCase ID: ${appeal.case?.publicId}`,
      });
    } catch (error) {
      console.error("[Appeal Reduce Confirm Error]", error);
      return interaction.editReply({
        content: `⚠️ Error: ${error.message}`,
      });
    }
  },
};
