"use strict";

const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");

module.exports = {
  customId: "appeal_open",

  async execute(interaction) {
    // Extract case ID from custom ID
    const caseId = interaction.customId.split(":")[1];

    if (!caseId) {
      return interaction.reply({
        content: "⚠️ Invalid appeal request. Case ID not found.",
        flags: 64,
      });
    }

    // Create modal for appeal submission
    const modal = new ModalBuilder()
      .setCustomId(`appeal_submit:${caseId}`)
      .setTitle("Appeal Moderation Action");

    const reasonInput = new TextInputBuilder()
      .setCustomId("appeal_reason")
      .setLabel("Why are you appealing this action?")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder(
        "Explain why you believe this action should be reconsidered...",
      )
      .setRequired(true)
      .setMinLength(20)
      .setMaxLength(1000);

    const contextInput = new TextInputBuilder()
      .setCustomId("appeal_context")
      .setLabel("What should staff know?")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Provide any additional context or information...")
      .setRequired(false)
      .setMaxLength(1000);

    const evidenceInput = new TextInputBuilder()
      .setCustomId("appeal_evidence")
      .setLabel("Evidence/Links (optional)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Links to screenshots or other evidence...")
      .setRequired(false)
      .setMaxLength(500);

    modal.addComponents(
      new ActionRowBuilder().addComponents(reasonInput),
      new ActionRowBuilder().addComponents(contextInput),
      new ActionRowBuilder().addComponents(evidenceInput),
    );

    await interaction.showModal(modal);
  },
};
