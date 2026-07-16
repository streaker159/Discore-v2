"use strict";

const {
  requireSniperAdmin,
} = require("../../../modules/sniper/sniperPermissions");
const wizardState = require("../../../modules/sniper/sniperWizardState");
const {
  buildWizardStepEmbed,
  WIZARD_STEPS,
  formatMs,
} = require("../../../modules/sniper/sniperEmbeds");
const {
  buildWizardNav,
} = require("../../buttons/sniper/sniperDashboardButtons");
const prisma = require("../../../lib/prisma");

/**
 * Parse a human-readable duration string into milliseconds.
 * Supports formats like: "3m", "30m", "1h", "2h", "6h"
 */
function parseDuration(input) {
  const trimmed = String(input).trim().toLowerCase();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d+)\s*(h|m|s)$/);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 3600 * 1000;
    default:
      return null;
  }
}

module.exports = [
  // ── Dashboard timing modal ──────────────────────────────────────────────
  {
    customId: "sniper:timing_modal",

    async execute(interaction) {
      if (!(await requireSniperAdmin(interaction))) return;

      const guildId = interaction.guildId;

      const minDelayRaw = interaction.fields.getTextInputValue("min_delay");
      const maxDelayRaw = interaction.fields.getTextInputValue("max_delay");
      const activeDurationRaw =
        interaction.fields.getTextInputValue("active_duration");

      const minDelayMs = parseDuration(minDelayRaw);
      const maxDelayMs = parseDuration(maxDelayRaw);
      const activeDurationMs = parseDuration(activeDurationRaw);

      if (!minDelayMs || !maxDelayMs || !activeDurationMs) {
        return interaction.reply({
          content:
            "Invalid duration format. Use formats like: `3m`, `30m`, `1h`, `2h`.",
          flags: 64,
        });
      }

      if (minDelayMs >= maxDelayMs) {
        return interaction.reply({
          content: "Min delay must be less than max delay.",
          flags: 64,
        });
      }

      if (minDelayMs < 60000) {
        return interaction.reply({
          content: "Min delay must be at least 1 minute.",
          flags: 64,
        });
      }

      if (activeDurationMs < 30000) {
        return interaction.reply({
          content: "Active duration must be at least 30 seconds.",
          flags: 64,
        });
      }

      if (activeDurationMs > 600000) {
        return interaction.reply({
          content: "Active duration must be at most 10 minutes.",
          flags: 64,
        });
      }

      await prisma.sniperChallengeConfig.update({
        where: { guildId },
        data: { minDelayMs, maxDelayMs, activeDurationMs },
      });

      const { getConfig } = require("../../../modules/sniper/sniperService");
      const {
        buildSettingsEmbed,
      } = require("../../../modules/sniper/sniperEmbeds");

      const config = await getConfig(guildId);
      const embed = buildSettingsEmbed(config);

      const {
        ActionRowBuilder,
        ButtonBuilder,
        ButtonStyle,
      } = require("discord.js");
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("sniper:dash:edit_timing")
          .setLabel("Edit Timing")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("⏱️"),
        new ButtonBuilder()
          .setCustomId("sniper:dash:back_to_dash")
          .setLabel("Back to Dashboard")
          .setStyle(ButtonStyle.Secondary),
      );

      return interaction.update({ embeds: [embed], components: [row] });
    },
  },

  // ── Wizard timing modal ─────────────────────────────────────────────────
  {
    customId: "sniper:wiz_timing_modal",

    async execute(interaction) {
      if (!(await requireSniperAdmin(interaction))) return;

      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const state = wizardState.get(userId, guildId);

      if (!state) {
        return interaction.reply({
          content: "Wizard session expired. Please start again.",
          flags: 64,
        });
      }

      const minDelayRaw = interaction.fields.getTextInputValue("min_delay");
      const maxDelayRaw = interaction.fields.getTextInputValue("max_delay");
      const activeDurationRaw =
        interaction.fields.getTextInputValue("active_duration");

      const minDelayMs = parseDuration(minDelayRaw);
      const maxDelayMs = parseDuration(maxDelayRaw);
      const activeDurationMs = parseDuration(activeDurationRaw);

      if (!minDelayMs || !maxDelayMs || !activeDurationMs) {
        return interaction.reply({
          content:
            "Invalid duration format. Use formats like: `3m`, `30m`, `1h`, `2h`.",
          flags: 64,
        });
      }

      if (minDelayMs >= maxDelayMs) {
        return interaction.reply({
          content: "Min delay must be less than max delay.",
          flags: 64,
        });
      }

      if (minDelayMs < 60000) {
        return interaction.reply({
          content: "Min delay must be at least 1 minute.",
          flags: 64,
        });
      }

      state.minDelayMs = minDelayMs;
      state.maxDelayMs = maxDelayMs;
      state.activeDurationMs = activeDurationMs;
      wizardState.set(userId, guildId, state);

      const embed = buildWizardStepEmbed(WIZARD_STEPS.TIMING, state);
      const components = buildWizardNav(WIZARD_STEPS.TIMING);

      return interaction.update({ embeds: [embed], components });
    },
  },
];
