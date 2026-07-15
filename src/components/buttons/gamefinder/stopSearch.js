"use strict";

const gameSearchManager = require("../../../services/gameSearchManager");
const { buildStoppedEmbed } = require("../../../embeds/gameFinderEmbeds");

module.exports = {
  customIdPrefix: "findgame:stop:",

  async execute(interaction) {
    const userId = interaction.user.id;

    // ── Extract the target user ID from the custom ID ─────────────
    // Format: findgame:stop:{ownerUserId}
    const ownerId = interaction.customId.split(":").pop();

    // ── Ownership check ───────────────────────────────────────────
    if (userId !== ownerId) {
      return interaction.reply({
        content: "🔒 Only the user who started the search can stop it.",
        flags: 64,
      });
    }

    // ── Stop the search ───────────────────────────────────────────
    const stopped = gameSearchManager.stopSearch(userId);

    if (!stopped) {
      return interaction.reply({
        content: "⚠️ No active search was found. It may have already ended.",
        flags: 64,
      });
    }

    // ── Update the message ────────────────────────────────────────
    await interaction.update({
      embeds: [buildStoppedEmbed()],
      components: [],
    });
  },
};
