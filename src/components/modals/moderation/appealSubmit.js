"use strict";

const appealService = require("../../../modules/moderation/services/appealService");

module.exports = {
  customId: "appeal_submit",

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      // Extract case ID from custom ID
      const caseId = interaction.customId.split(":")[1];

      if (!caseId) {
        return interaction.editReply({
          content: "⚠️ Invalid appeal submission. Case ID not found.",
        });
      }

      // Get modal inputs
      const reason = interaction.fields.getTextInputValue("appeal_reason");
      const context =
        interaction.fields.getTextInputValue("appeal_context") || "";
      const evidence =
        interaction.fields.getTextInputValue("appeal_evidence") || "";

      // Build full appeal text
      const appealText = [
        `**Why I'm appealing:**`,
        reason,
        context ? `\n**Additional context:**\n${context}` : "",
        evidence ? `\n**Evidence:**\n${evidence}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      // Create appeal
      const appeal = await appealService.createAppeal(
        caseId,
        interaction.user.id,
        appealText,
        interaction.guild,
      );

      return interaction.editReply({
        content: `✅ **Appeal Submitted**\n\nYour appeal (**${appeal.publicId}**) has been created and staff will review it shortly.\n\nYou will be notified when a decision is made.`,
      });
    } catch (error) {
      console.error("[Appeal Submit Error]", error);

      let errorMessage = "⚠️ Failed to submit appeal.";

      if (error.message.includes("already has an open appeal")) {
        errorMessage =
          "⚠️ This case already has an open appeal. Please wait for staff to review your existing appeal.";
      } else if (error.message.includes("not found")) {
        errorMessage = "⚠️ Case not found. It may have been deleted.";
      } else if (error.message.includes("already been revoked")) {
        errorMessage =
          "⚠️ This case has already been revoked. No appeal needed.";
      }

      return interaction.editReply({ content: errorMessage });
    }
  },
};
