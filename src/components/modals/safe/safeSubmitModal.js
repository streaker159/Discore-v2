"use strict";

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require("discord.js");
const {
  buildWrongEmbed,
  buildCrackedEmbed,
  buildPrizeConfirmationEmbed,
  PRIZES,
} = require("../../../modules/safe/safeVaultEmbeds");
const {
  submitGuess,
  MAX_ATTEMPTS_PER_DAY,
} = require("../../../modules/safe/safeVaultService");

const logger = require("../../../lib/logger");

module.exports = {
  customId: "safe:submit",

  async execute(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild?.id || "unknown";
    const guildName = interaction.guild?.name || "Unknown";
    const userTag = interaction.user.tag;
    const displayName =
      interaction.member?.displayName || interaction.user.username;
    const code = interaction.fields.getTextInputValue("code")?.trim() || "";

    // Validate code format
    if (!/^\d{4}$/.test(code)) {
      return interaction.reply({
        content: "Enter exactly 4 digits, like 0042 or 9876.",
        flags: 64,
      });
    }

    try {
      const result = await submitGuess(
        userId,
        userTag,
        displayName,
        guildId,
        guildName,
        code,
      );

      if (result.message === "INVALID_CODE") {
        return interaction.reply({
          content: "Enter exactly 4 digits, like 0042 or 9876.",
          flags: 64,
        });
      }

      if (result.message === "NO_ACTIVE_ROUND") {
        return interaction.reply({
          content: "No active vault round found. Please try again shortly.",
          flags: 64,
        });
      }

      if (result.message === "NO_ATTEMPTS_LEFT") {
        const {
          buildNoAttemptsLeftEmbed,
        } = require("../../../modules/safe/safeVaultEmbeds");
        return interaction.reply({
          embeds: [buildNoAttemptsLeftEmbed()],
          flags: 64,
        });
      }

      if (result.message === "WRONG_CODE") {
        const { embed, attachment, attemptsLeft } = buildWrongEmbed(
          result.attemptsUsed,
          MAX_ATTEMPTS_PER_DAY,
        );

        const payload = { embeds: [embed], flags: 64 };

        if (attachment) {
          payload.files = [attachment];
        }

        if (attemptsLeft > 0) {
          const button = new ButtonBuilder()
            .setCustomId("safe:enter")
            .setLabel("🔐 Try Again")
            .setStyle(ButtonStyle.Danger);

          const row = new ActionRowBuilder().addComponents(button);
          payload.components = [row];
        }

        return interaction.reply(payload);
      }

      if (result.message === "RACE_LOST") {
        return interaction.reply({
          content:
            "⚡ Your code was correct, but someone cracked the vault milliseconds before you! The prize goes to the fastest code gremlin. Try again next round.",
          flags: 64,
        });
      }

      if (result.message === "CRACKED") {
        // Show gold cracked embed with prize dropdown - public!
        const { embed, attachment } = buildCrackedEmbed(
          `<@${userId}>`,
          guildName,
          result.attemptsUsed,
          MAX_ATTEMPTS_PER_DAY,
        );

        const select = new StringSelectMenuBuilder()
          .setCustomId(`safe:prize:${result.roundId}`)
          .setPlaceholder("Select your prize...")
          .addOptions(
            PRIZES.map((p) => ({
              label: p.label,
              value: p.value,
            })),
          );

        const row = new ActionRowBuilder().addComponents(select);

        const payload = {
          content: `🎉 <@${userId}> has cracked the Discore Vault!`,
          embeds: [embed],
          components: [row],
        };

        if (attachment) {
          payload.files = [attachment];
        }

        // Make the cracked response public (exciting!)
        return interaction.reply(payload);
      }

      return interaction.reply({
        content: "Unexpected result. Please try again.",
        flags: 64,
      });
    } catch (error) {
      logger.error("safe:submit modal failed", { error: error.message });
      return interaction
        .reply({
          content:
            "An error occurred while processing your code. Please try again.",
          flags: 64,
        })
        .catch(() => {});
    }
  },
};
