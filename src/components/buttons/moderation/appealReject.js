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
  customId: "appeal_reject",

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
          flags: 64,
        });
      }

      // Show modal to get rejection reason
      const modal = new ModalBuilder()
        .setCustomId(`appeal_reject_confirm:${appealId}`)
        .setTitle("Reject Appeal");

      const reasonInput = new TextInputBuilder()
        .setCustomId("reject_reason")
        .setLabel("Reason for rejection (shown to user)")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Explain why the appeal is being rejected...")
        .setRequired(true)
        .setMaxLength(500);

      modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));

      await interaction.showModal(modal);
    } catch (error) {
      console.error("[Appeal Reject Error]", error);
      return interaction.reply({
        content: `⚠️ Error: ${error.message}`,
        flags: 64,
      });
    }
  },
};
