"use strict";

const appealService = require("../../../modules/moderation/services/appealService");
const {
  canHandleAppeals,
} = require("../../../modules/moderation/utils/permissions");
const prisma = require("../../../lib/prisma");

module.exports = {
  customId: "appeal_close",

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const appealId = interaction.customId.split(":")[1];

      const dbGuild = await prisma.guild.findUnique({
        where: { id: interaction.guildId },
      });

      if (!canHandleAppeals(interaction.member, dbGuild)) {
        return interaction.editReply({
          content: "⚠️ You don't have permission to handle appeals.",
        });
      }

      const appeal = await appealService.closeAppeal(
        appealId,
        interaction.user.id,
        interaction.guild,
        "Appeal closed by staff.",
      );

      return interaction.editReply({
        content:
          `🔒 **Appeal Closed**\n\n` +
          `Appeal **${appeal.publicId}** has been closed.\n` +
          `The ticket will delete automatically.`,
      });
    } catch (error) {
      console.error("[Appeal Close Error]", error);

      return interaction.editReply({
        content: `⚠️ Error: ${error.message}`,
      });
    }
  },
};
