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
  customId: "appeal_reduce",

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

      // Show modal to get reduced duration
      const modal = new ModalBuilder()
        .setCustomId(`appeal_reduce_confirm:${appealId}`)
        .setTitle("Reduce Punishment");

      const durationInput = new TextInputBuilder()
        .setCustomId("new_duration")
        .setLabel("New duration (e.g., 30m, 2h, 7d)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("30m")
        .setRequired(true)
        .setMaxLength(20);

      const reasonInput = new TextInputBuilder()
        .setCustomId("reduce_reason")
        .setLabel("Reason for reduction (shown to user)")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Explain why the punishment is being reduced...")
        .setRequired(true)
        .setMaxLength(500);

      modal.addComponents(
        new ActionRowBuilder().addComponents(durationInput),
        new ActionRowBuilder().addComponents(reasonInput),
      );

      await interaction.showModal(modal);
    } catch (error) {
      console.error("[Appeal Reduce Error]", error);
      return interaction.reply({
        content: `⚠️ Error: ${error.message}`,
        flags: 64,
      });
    }
  },
};
