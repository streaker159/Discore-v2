"use strict";

const appealService = require("../../../modules/moderation/services/appealService");
const {
  canHandleAppeals,
} = require("../../../modules/moderation/utils/permissions");
const prisma = require("../../../lib/prisma");

module.exports = {
  customId: "appeal_bring_member",

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

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

      const { appeal, channel } = await appealService.bringMemberToTicket(
        appealId,
        interaction.guild,
        interaction.user.id,
      );

      return interaction.editReply({
        content:
          `✅ **Member Added**\n\n` +
          `<@${appeal.userId}> has been added to ticket <#${channel.id}>.`,
      });
    } catch (error) {
      console.error("[Appeal Bring Member Error]", error);

      return interaction.editReply({
        content: `⚠️ ${error.message}`,
      });
    }
  },
};
