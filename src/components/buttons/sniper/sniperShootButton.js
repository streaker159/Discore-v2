"use strict";

const { handleShoot } = require("../../../modules/sniper/sniperService");
const db = require("../../../modules/sniper/sniperDb");
const {
  getRandomWinMessage,
  getRandomLossMessage,
} = require("../../../modules/sniper/sniperEmbeds");

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

    const parts = interaction.customId.split(":");
    const challengeId = parts.length >= 3 ? parts[2] : null;

    if (!challengeId) {
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
    const msg = getRandomWinMessage();
    return interaction.reply({ content: `${msg}${reactionStr}`, flags: 64 });
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
      return interaction.reply({ content: getRandomLossMessage(), flags: 64 });
    default:
      return interaction.reply({
        content: "Something went wrong. Please try again.",
        flags: 64,
      });
  }
}
