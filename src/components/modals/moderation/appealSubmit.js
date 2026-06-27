"use strict";

const appealService = require("../../../modules/moderation/services/appealService");
const caseService = require("../../../modules/moderation/services/moderationCaseService");

function getCaseIdFromCustomId(customId) {
  return String(customId || "").split(":")[1] || null;
}

async function resolveGuildFromCase(interaction, caseId) {
  const moderationCase = await caseService.getCaseByPublicId(caseId);

  if (!moderationCase) {
    return {
      guild: null,
      error: "CASE_NOT_FOUND",
    };
  }

  if (moderationCase.userId !== interaction.user.id) {
    return {
      guild: null,
      error: "WRONG_USER",
    };
  }

  const guild = await interaction.client.guilds
    .fetch(moderationCase.guildId)
    .catch(() => null);

  if (!guild) {
    return {
      guild: null,
      error: "GUILD_NOT_FOUND",
    };
  }

  return {
    guild,
    error: null,
  };
}

module.exports = {
  customId: "appeal_submit",

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const caseId = getCaseIdFromCustomId(interaction.customId);

      if (!caseId) {
        return interaction.editReply({
          content: "⚠️ Invalid appeal submission. Case ID not found.",
        });
      }

      const { guild, error } = await resolveGuildFromCase(interaction, caseId);

      if (error === "CASE_NOT_FOUND") {
        return interaction.editReply({
          content: "⚠️ Case not found. It may have been deleted.",
        });
      }

      if (error === "WRONG_USER") {
        return interaction.editReply({
          content: "🚫 You can only appeal your own moderation case.",
        });
      }

      if (error === "GUILD_NOT_FOUND") {
        return interaction.editReply({
          content:
            "⚠️ I could not find the server for this appeal. Please contact an administrator.",
        });
      }

      const reason = interaction.fields.getTextInputValue("appeal_reason");
      const context =
        interaction.fields.getTextInputValue("appeal_context") || "";

      let evidence = "";
      try {
        evidence =
          interaction.fields.getTextInputValue("appeal_evidence") || "";
      } catch {
        evidence = "";
      }

      const appealText = [
        "**Why I'm appealing:**",
        reason,
        context ? `\n**Additional context:**\n${context}` : "",
        evidence ? `\n**Evidence:**\n${evidence}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const appeal = await appealService.createAppeal(
        caseId,
        interaction.user.id,
        appealText,
        guild,
      );

      return interaction.editReply({
        content:
          `✅ **Appeal Submitted**\n\n` +
          `Your appeal **${appeal.publicId}** has been created and staff will review it shortly.\n\n` +
          `You will be notified when a decision is made.`,
      });
    } catch (error) {
      console.error("[Appeal Submit Error]", error);

      let errorMessage = "⚠️ Failed to submit appeal.";

      if (error.message?.includes("already has an open appeal")) {
        errorMessage =
          "⚠️ This case already has an open appeal. Please wait for staff to review your existing appeal.";
      } else if (error.message?.includes("not found")) {
        errorMessage = "⚠️ Case not found. It may have been deleted.";
      } else if (error.message?.includes("already been revoked")) {
        errorMessage =
          "⚠️ This case has already been revoked. No appeal is needed.";
      } else if (error.message?.includes("Failed to create appeal channel")) {
        errorMessage =
          "⚠️ Your appeal was received, but I could not create the appeal ticket channel. Please ask an admin to check my channel permissions and configured appeal category.";
      }

      return interaction.editReply({ content: errorMessage });
    }
  },
};
