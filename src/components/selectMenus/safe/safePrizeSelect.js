"use strict";

const {
  buildPrizeConfirmationEmbed,
  getPrizeLabel,
  OFFICIAL_INVITE,
} = require("../../../modules/safe/safeVaultEmbeds");
const {
  selectPrize,
  finalizeAfterPrizeSelection,
} = require("../../../modules/safe/safeVaultService");

const logger = require("../../../lib/logger");

module.exports = {
  customIdPrefix: "safe:prize:",

  async execute(interaction, client) {
    const userId = interaction.user.id;

    // Parse round ID from customId: safe:prize:<roundId>
    const roundId = interaction.customId.split(":")[2];
    if (!roundId) {
      return interaction.reply({
        content: "Invalid prize selection identifier.",
        flags: 64,
      });
    }

    const selectedValue = interaction.values?.[0];
    if (!selectedValue) {
      return interaction.reply({
        content: "No prize was selected.",
        flags: 64,
      });
    }

    // Defer reply
    await interaction.deferReply({ flags: 64 }).catch(() => {});

    try {
      const result = await selectPrize(roundId, userId, selectedValue);

      if (result.message === "NOT_WINNER") {
        return interaction.editReply({
          content: "This vault was cracked by someone else, you loot gremlin.",
        });
      }

      if (
        result.message === "ALREADY_SELECTED" ||
        result.message === "PRIZE_ALREADY_SELECTED"
      ) {
        return interaction.editReply({
          content: "Prize already selected for this vault.",
        });
      }

      if (result.message === "ROUND_NOT_FOUND") {
        return interaction.editReply({
          content: "Vault round not found. It may have already been completed.",
        });
      }

      if (result.message === "INVALID_PRIZE") {
        return interaction.editReply({
          content: "That prize option is not valid.",
        });
      }

      if (!result.success) {
        return interaction.editReply({
          content: "Could not process prize selection. Please try again.",
        });
      }

      // Prize selected successfully
      const prizeLabel = result.prizeLabel;

      // 1. Send confirmation to winner
      const embed = buildPrizeConfirmationEmbed(prizeLabel);
      await interaction.editReply({ embeds: [embed] });

      // 2. Finalize: DM winner, admin log, global announcement, generate new round
      try {
        const finalizeResult = await finalizeAfterPrizeSelection(
          client,
          result.round,
        );

        // Edit the confirmation to include DM status if possible
        let extra = "";
        if (finalizeResult.dmSuccess) {
          extra = "\n\nI have also sent you the claim details by DM.";
        } else {
          extra =
            "\n\nI could not DM you, so make sure you save the official server link.";
        }

        const updatedEmbed = buildPrizeConfirmationEmbed(prizeLabel);
        updatedEmbed.setDescription(updatedEmbed.data.description + extra);

        await interaction.editReply({ embeds: [updatedEmbed] }).catch(() => {});

        // 3. Disable prize dropdown on original message if possible
        try {
          // The original cracked message is from the modal submit,
          // not from this interaction. We can't easily disable it here
          // since this is a different interaction.
          // The cracked embed will remain with the dropdown visible,
          // but the prize is already selected and further selections are rejected.
        } catch {}

        logger.info("SafeVault: Prize selection completed", {
          roundId,
          userId,
          prize: selectedValue,
        });
      } catch (finalizeError) {
        logger.error("SafeVault: finalizeAfterPrizeSelection failed", {
          error: finalizeError.message,
        });
        // Still tell user to claim in official server
        await interaction
          .followUp({
            content:
              "Your prize was logged but there was an issue with the announcement. Please join the official server to claim: " +
              OFFICIAL_INVITE,
            flags: 64,
          })
          .catch(() => {});
      }
    } catch (error) {
      logger.error("safe:prize select failed", { error: error.message });
      return interaction
        .editReply({
          content:
            "An error occurred while processing your prize. Please try again.",
        })
        .catch(() => {});
    }
  },
};
