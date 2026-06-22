"use strict";

const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");
const {
  canHandleAppeals,
} = require("../../../modules/moderation/utils/permissions");
const prisma = require("../../../lib/prisma");

module.exports = {
  customId: "appeal_add_note",

  async execute(interaction) {
    try {
      const appealId = interaction.customId.split(":")[1];

      // Check permissions
      const dbGuild = await prisma.guild.findUnique({
        where: { id: interaction.guildId },
      });

      if (!canHandleAppeals(interaction.member, dbGuild)) {
        return interaction.reply({
          content: "⚠️ You don't have permission to handle appeals.",
          ephemeral: true,
        });
      }

      // Show modal to get staff note
      const modal = new ModalBuilder()
        .setCustomId(`appeal_add_note_confirm:${appealId}`)
        .setTitle("Add Staff Note");

      const noteInput = new TextInputBuilder()
        .setCustomId("staff_note")
        .setLabel("Staff Note (internal only)")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Add internal notes about this appeal...")
        .setRequired(true)
        .setMaxLength(1000);

      modal.addComponents(new ActionRowBuilder().addComponents(noteInput));

      await interaction.showModal(modal);
    } catch (error) {
      console.error("[Appeal Add Note Error]", error);
      return interaction.reply({
        content: `⚠️ Error: ${error.message}`,
        ephemeral: true,
      });
    }
  },
};
