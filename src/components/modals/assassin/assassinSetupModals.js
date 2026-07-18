"use strict";

const wizard = require("../../../modules/assassin/assassinWizardState");
const db = require("../../../modules/assassin/assassinDb");
const {
  renderWizard,
} = require("../../buttons/assassin/assassinDashboardButtons");
const { MessageFlags } = require("discord.js");

module.exports = [
  {
    customId: "assassin:wiz_min_modal",

    async execute(interaction) {
      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const state = wizard.get(userId, guildId);
      if (!state) {
        return interaction.reply({
          content: "Wizard expired.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      const val = parseInt(interaction.fields.getTextInputValue("value"), 10);
      if (isNaN(val) || val < 2 || val > 20) {
        return interaction.reply({
          content: "Enter a number between 2 and 20.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      state.minPlayers = val;
      await db.upsertConfig(guildId, {
        minPlayers: val,
        enabled: state.enabled ?? false,
      });
      wizard.set(userId, guildId, state);
      return renderWizard(interaction, state);
    },
  },

  {
    customId: "assassin:wiz_cooldown_modal",

    async execute(interaction) {
      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const state = wizard.get(userId, guildId);
      if (!state) {
        return interaction.reply({
          content: "Wizard expired.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      const val = parseInt(interaction.fields.getTextInputValue("value"), 10);
      if (isNaN(val) || val < 30 || val > 600) {
        return interaction.reply({
          content: "Enter a number between 30 and 600 seconds.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      state.killCooldownSeconds = val;
      await db.upsertConfig(guildId, {
        killCooldownSeconds: val,
        enabled: state.enabled ?? false,
      });
      wizard.set(userId, guildId, state);
      return renderWizard(interaction, state);
    },
  },

  {
    customId: "assassin:wiz_time_modal",

    async execute(interaction) {
      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const state = wizard.get(userId, guildId);
      if (!state) {
        return interaction.reply({
          content: "Wizard expired.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      const val = parseInt(interaction.fields.getTextInputValue("value"), 10);
      if (isNaN(val) || val < 0 || val > 48) {
        return interaction.reply({
          content: "Enter a number between 0 (no limit) and 48 hours.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      state.timeLimitHours = val === 0 ? null : val;
      await db.upsertConfig(guildId, {
        timeLimitHours: val === 0 ? null : val,
        enabled: state.enabled ?? false,
      });
      wizard.set(userId, guildId, state);
      return renderWizard(interaction, state);
    },
  },
];
