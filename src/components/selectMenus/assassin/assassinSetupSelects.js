"use strict";

const db = require("../../../modules/assassin/assassinDb");
const wizard = require("../../../modules/assassin/assassinWizardState");
const {
  buildWizardStepEmbed,
} = require("../../../modules/assassin/assassinEmbeds");
const { MessageFlags } = require("discord.js");

module.exports = {
  customId: "assassin:select:",
  match: "prefix",

  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const customId = interaction.customId;

    const state = wizard.get(userId, guildId) || { step: 1 };

    if (customId === "assassin:select:game_channel") {
      const channelId = interaction.values?.[0];
      if (!channelId) {
        return interaction.reply({
          content: "No channel selected.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      state.gameChannelId = channelId;
      await db.upsertConfig(guildId, { gameChannelId: channelId });
      wizard.set(userId, guildId, state);

      const embed = buildWizardStepEmbed(state.step, state);
      const {
        buildWizardButtons,
      } = require("../../buttons/assassin/assassinDashboardButtons");
      const components = buildWizardButtons(state.step, state);

      return interaction.update({ embeds: [embed], components });
    }

    if (customId === "assassin:select:winner_role") {
      const roleId = interaction.values?.[0];
      if (!roleId) {
        return interaction.reply({
          content: "No role selected.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      state.winnerRoleId = roleId;
      await db.upsertConfig(guildId, { winnerRoleId: roleId });
      wizard.set(userId, guildId, state);

      const embed = buildWizardStepEmbed(state.step, state);
      const {
        buildWizardButtons,
      } = require("../../buttons/assassin/assassinDashboardButtons");
      const components = buildWizardButtons(state.step, state);

      return interaction.update({ embeds: [embed], components });
    }

    return interaction.reply({
      content: "Unknown select menu.",
      flags: [MessageFlags.Ephemeral],
    });
  },
};
