"use strict";

const {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const {
  buildActiveEmbed,
  buildNoAttemptsLeftEmbed,
  buildWrongEmbed,
} = require("../../../modules/safe/safeVaultEmbeds");
const {
  MAX_ATTEMPTS_PER_DAY,
  getNextResetTimestamp,
  getDailyLimits,
  getCurrentRound,
  getPendingPrizeRound,
  getGlobalAttemptCount,
} = require("../../../modules/safe/safeVaultService");

const logger = require("../../../lib/logger");

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("safecrack")
    .setDescription("Try to crack the Discore Vault.")
    .setContexts([0]), // guild only

  async execute(interaction) {
    // Block DMs
    if (!interaction.guild) {
      return interaction.reply({
        content: "🔐 The Discore Vault is only available inside servers.",
        flags: [MessageFlags.Ephemeral],
      });
    }

    const userId = interaction.user.id;

    try {
      // 1. Check if user has a pending prize round
      const pendingPrize = await getPendingPrizeRound(userId);
      if (pendingPrize) {
        return showCrackedEmbed(interaction, pendingPrize, userId);
      }

      // 2. Get daily limits for this user
      const limit = await getDailyLimits(userId);
      const attemptsUsed = limit.attemptsUsed;

      // 3. Get current active round
      const round = await getCurrentRound();

      if (!round) {
        return interaction.reply({
          content:
            "🔐 No active vault code is set. The bot owner has been notified. Please try again shortly.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      // 4. Get global attempt count for this round
      const globalAttemptCount = await getGlobalAttemptCount(round.id);

      // 5. Build the main vault embed (always shown publicly)
      const { embed, attachment } = buildActiveEmbed(globalAttemptCount);

      // Add a notice if user is out of attempts
      const attemptsLeft = Math.max(0, MAX_ATTEMPTS_PER_DAY - attemptsUsed);
      let footerExtra = "";
      if (attemptsLeft <= 0) {
        const nextReset = getNextResetTimestamp();
        footerExtra = ` · You have 0 attempts left (reset ${nextReset ? `<t:${nextReset}:R>` : "tomorrow"})`;
      }

      if (footerExtra && embed.data?.footer?.text) {
        embed.setFooter({ text: embed.data.footer.text + footerExtra });
      }

      const button = new ButtonBuilder()
        .setCustomId("safe:enter")
        .setLabel("🔐 Enter Code")
        .setStyle(ButtonStyle.Success);

      const row = new ActionRowBuilder().addComponents(button);

      const payload = {
        embeds: [embed],
        components: [row],
      };

      if (attachment) {
        payload.files = [attachment];
      }

      const reply = await interaction.reply({ ...payload, fetchReply: true });

      // 6. Track this vault message for auto-deletion after 5 minutes of inactivity
      const {
        trackVaultMessage,
      } = require("../../../modules/safe/safeVaultService");
      trackVaultMessage(reply.id, interaction.channelId, interaction.client);

      return;
    } catch (error) {
      logger.error("safecrack command failed", { error: error.message });
      return interaction
        .reply({
          content:
            "An error occurred while loading the vault. Please try again.",
          flags: [MessageFlags.Ephemeral],
        })
        .catch(() => {});
    }
  },
};

// ── Show cracked embed for pending prize recovery ──────────

async function showCrackedEmbed(interaction, round, userId) {
  const {
    buildCrackedEmbed,
    PRIZES,
  } = require("../../../modules/safe/safeVaultEmbeds");
  const {
    MAX_ATTEMPTS_PER_DAY,
    getDailyLimits,
  } = require("../../../modules/safe/safeVaultService");
  const { StringSelectMenuBuilder, ActionRowBuilder } = require("discord.js");

  // Ensure this user is the winner
  if (round.crackedByUserId !== userId) {
    return interaction.reply({
      content:
        "The vault is currently awaiting prize selection from the winner. Check back soon!",
      flags: [MessageFlags.Ephemeral],
    });
  }

  const limit = await getDailyLimits(userId);
  const attemptsUsed = limit.attemptsUsed;

  const { embed, attachment } = buildCrackedEmbed(
    `<@${round.crackedByUserId}>`,
    round.crackedInGuildName || "Unknown",
    attemptsUsed,
    MAX_ATTEMPTS_PER_DAY,
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId(`safe:prize:${round.id}`)
    .setPlaceholder("Select your prize...")
    .addOptions(
      PRIZES.map((p) => ({
        label: p.label,
        value: p.value,
      })),
    );

  const row = new ActionRowBuilder().addComponents(select);

  const payload = {
    embeds: [embed],
    components: [row],
  };

  if (attachment) {
    payload.files = [attachment];
  }

  return interaction.reply(payload);
}
