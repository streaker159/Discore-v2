"use strict";

const db = require("../../../modules/assassin/assassinDb");
const wizard = require("../../../modules/assassin/assassinWizardState");
const {
  buildWizardStepEmbed,
} = require("../../../modules/assassin/assassinEmbeds");
const { MessageFlags } = require("discord.js");

module.exports = {
  customIdPrefix: "assassin:select:",

  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const customId = interaction.customId;
    const channelId = interaction.values?.[0];

    if (customId === "assassin:select:game_channel") {
      if (!channelId) {
        return interaction.reply({
          content: "No channel selected.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      await db.upsertConfig(guildId, {
        gameChannelId: channelId,
        enabled: true,
      });
      wizard.patch(userId, guildId, { gameChannelId: channelId });

      return interaction.update({
        content: `✅ Game channel set to <#${channelId}>. Use the wizard to continue.`,
        components: [],
      });
    }

    if (customId === "assassin:select:winner_role") {
      if (!channelId) {
        return interaction.reply({
          content: "No role selected.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      await db.upsertConfig(guildId, {
        winnerRoleId: channelId,
        enabled: true,
      });
      wizard.patch(userId, guildId, { winnerRoleId: channelId });

      return interaction.update({
        content: `✅ Winner role set to <@&${channelId}>. Use the wizard to continue.`,
        components: [],
      });
    }

    return interaction.reply({
      content: "Unknown select menu.",
      flags: [MessageFlags.Ephemeral],
    });
  },
};
