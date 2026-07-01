"use strict";

const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");

module.exports = {
  customId: "safe:enter",

  async execute(interaction) {
    // Refresh the vault message activity timer (interaction counts as activity)
    const {
      refreshVaultActivity,
    } = require("../../../modules/safe/safeVaultService");
    if (interaction.message?.id) {
      refreshVaultActivity(interaction.message.id);
    }

    // Check daily attempts before showing modal
    const {
      getDailyLimits,
      MAX_ATTEMPTS_PER_DAY,
      getCurrentRound,
    } = require("../../../modules/safe/safeVaultService");

    const userId = interaction.user.id;

    try {
      const {
        getNextResetTimestamp,
      } = require("../../../modules/safe/safeVaultService");

      const limit = await getDailyLimits(userId);
      if (limit.attemptsUsed >= MAX_ATTEMPTS_PER_DAY) {
        const nextReset = getNextResetTimestamp();
        const {
          buildNoAttemptsLeftEmbed,
        } = require("../../../modules/safe/safeVaultEmbeds");
        return interaction.reply({
          embeds: [
            buildNoAttemptsLeftEmbed(
              limit.attemptsUsed,
              MAX_ATTEMPTS_PER_DAY,
              nextReset,
            ),
          ],
          flags: 64,
        });
      }

      // Check there is an active round
      const round = await getCurrentRound();
      if (!round) {
        return interaction.reply({
          content:
            "🔐 No active vault code right now. Please try again shortly.",
          flags: 64,
        });
      }

      // Show the code entry modal
      const modal = new ModalBuilder()
        .setCustomId("safe:submit")
        .setTitle("Crack the Discore Vault");

      const input = new TextInputBuilder()
        .setCustomId("code")
        .setLabel("Enter 4-digit code")
        .setPlaceholder("0420")
        .setStyle(TextInputStyle.Short)
        .setMinLength(4)
        .setMaxLength(4)
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);

      return interaction.showModal(modal);
    } catch (error) {
      const logger = require("../../../lib/logger");
      logger.error("safe:enter button failed", { error: error.message });
      return interaction
        .reply({
          content: "Something went wrong. Try again.",
          flags: 64,
        })
        .catch(() => {});
    }
  },
};
