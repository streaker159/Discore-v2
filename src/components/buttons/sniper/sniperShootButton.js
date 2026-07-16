"use strict";

const { handleShoot } = require("../../../modules/sniper/sniperService");
const db = require("../../../modules/sniper/sniperDb");

module.exports = {
  customId: "sniper:shoot",

  async execute(interaction) {
    if (interaction.user.bot) return;

    const guildId = interaction.guildId;
    if (!guildId) {
      return interaction.reply({
        content: "This challenge is only available inside servers.",
        flags: 64,
      });
    }

    // Extract challenge ID from customId
    // Format: sniper:shoot or sniper:shoot:<challengeId>
    const parts = interaction.customId.split(":");
    const challengeId = parts.length >= 3 ? parts[2] : null;

    if (!challengeId) {
      // Fallback: find the active run for this guild and use its ID
      const active = await db.findActiveRun(guildId);
      if (!active) {
        return interaction.reply({
          content: "No active challenge found. This challenge may have ended.",
          flags: 64,
        });
      }
      const result = await handleShoot(interaction, active.id);
      return handleShootResponse(interaction, result);
    }

    const result = await handleShoot(interaction, challengeId);
    await handleShootResponse(interaction, result);
  },
};

async function handleShootResponse(interaction, result) {
  if (result.success) {
    const reactionStr =
      result.reactionTimeMs != null
        ? ` (${(result.reactionTimeMs / 1000).toFixed(1)}s)`
        : "";
    return interaction.reply({
      content: `🔫 **Direct hit!** You stole the top spot!${reactionStr}`,
      flags: 64,
    });
  }

  switch (result.reason) {
    case "bot":
      return interaction.reply({
        content: "Bots can't participate in the Sniper Challenge.",
        flags: 64,
      });
    case "unknown_challenge":
      return interaction.reply({
        content: "This challenge no longer exists.",
        flags: 64,
      });
    case "already_ended":
      return interaction.reply({
        content: "This challenge has already ended.",
        flags: 64,
      });
    case "expired":
      return interaction.reply({
        content: "Too late — the target has already escaped!",
        flags: 64,
      });
    case "too_slow":
      return interaction.reply({
        content: "💨 **Too slow!** Someone else took the shot first.",
        flags: 64,
      });
    default:
      return interaction.reply({
        content: "Something went wrong. Please try again.",
        flags: 64,
      });
  }
}
