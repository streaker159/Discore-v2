"use strict";

const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");

const prisma = require("../../../lib/prisma");
const {
  canHandleAppeals,
} = require("../../../modules/moderation/utils/permissions");

module.exports = {
  customId: "appeal_accept",

  async execute(interaction) {
    try {
      const appealId = interaction.customId.split(":")[1];

      const dbGuild = await prisma.guild.findUnique({
        where: { id: interaction.guildId },
      });

      if (!canHandleAppeals(interaction.member, dbGuild)) {
        return interaction.reply({
          content: "⚠️ You don't have permission to handle appeals.",
          flags: 64,
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(`appeal_accept_confirm:${appealId}`)
        .setTitle(`Accept ${appealId}`);

      const noteInput = new TextInputBuilder()
        .setCustomId("accept_reason")
        .setLabel("Decision note shown to user and case view")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder(
          "Explain why the appeal is accepted and what is being removed.",
        )
        .setRequired(true)
        .setMaxLength(1000);

      modal.addComponents(new ActionRowBuilder().addComponents(noteInput));

      await interaction.showModal(modal);
    } catch (error) {
      console.error("[Appeal Accept Error]", error);

      if (interaction.replied || interaction.deferred) {
        return interaction.followUp({
          content: `⚠️ Error: ${error.message}`,
          flags: 64,
        });
      }

      return interaction.reply({
        content: `⚠️ Error: ${error.message}`,
        flags: 64,
      });
    }
  },
};
