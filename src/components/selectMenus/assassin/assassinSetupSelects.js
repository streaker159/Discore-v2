"use strict";

const db = require("../../../modules/assassin/assassinDb");
const wizard = require("../../../modules/assassin/assassinWizardState");
const {
  renderWizard,
} = require("../../buttons/assassin/assassinDashboardButtons");
const { MessageFlags } = require("discord.js");

module.exports = {
  customIdPrefix: "assassin:select:",

  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const customId = interaction.customId;
    const value = interaction.values?.[0];
    const state = wizard.get(userId, guildId);

    if (!state) {
      return interaction.update({
        content: "Wizard session expired. Please start again.",
        components: [],
        embeds: [],
      });
    }

    if (customId === "assassin:select:game_channel") {
      if (!value)
        return interaction.reply({
          content: "No channel selected.",
          flags: [MessageFlags.Ephemeral],
        });
      state.gameChannelId = value;
      await db.upsertConfig(guildId, {
        gameChannelId: value,
        enabled: state.enabled ?? false,
      });
      wizard.set(userId, guildId, state);
      return renderWizard(interaction, state);
    }

    if (customId === "assassin:select:winner_role") {
      if (!value)
        return interaction.reply({
          content: "No role selected.",
          flags: [MessageFlags.Ephemeral],
        });
      state.winnerRoleId = value;
      await db.upsertConfig(guildId, {
        winnerRoleId: value,
        enabled: state.enabled ?? false,
      });
      wizard.set(userId, guildId, state);
      return renderWizard(interaction, state);
    }

    if (customId === "assassin:select:lb_channel") {
      if (!value)
        return interaction.reply({
          content: "No channel selected.",
          flags: [MessageFlags.Ephemeral],
        });
      state.leaderboardChannelId = value;
      await db.upsertConfig(guildId, {
        leaderboardChannelId: value,
        enabled: state.enabled ?? false,
      });
      wizard.set(userId, guildId, state);
      return renderWizard(interaction, state);
    }

    return interaction.reply({
      content: "Unknown select menu.",
      flags: [MessageFlags.Ephemeral],
    });
  },
};
