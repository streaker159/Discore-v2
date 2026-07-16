"use strict";

const { SlashCommandBuilder } = require("discord.js");
const { fetchPlayer } = require("../../../services/conGamesApi");
const { buildPlayerEmbed } = require("../../../embeds/playerLookupEmbed");

const AUTO_DELETE_MS = 10 * 60 * 1000; // 10 minutes

function scheduleAutoDelete(interaction) {
  if (!interaction) return;
  setTimeout(() => {
    interaction.deleteReply().catch(() => {});
  }, AUTO_DELETE_MS);
}

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("findplayer")
    .setDescription("Look up a Conflict of Nations player by ID or username.")
    .addIntegerOption((o) =>
      o
        .setName("id")
        .setDescription("Player's numeric ID from Conflict of Nations")
        .setRequired(false),
    )
    .addStringOption((o) =>
      o
        .setName("username")
        .setDescription("Player's exact Conflict of Nations username")
        .setRequired(false),
    ),

  async execute(interaction) {
    const userId = interaction.options.getInteger("id");
    const username = interaction.options.getString("username");

    if (!userId && !username) {
      return interaction.reply({
        content: "⚠️ You must provide either a player **ID** or **username**.",
        flags: 64,
      });
    }

    await interaction.deferReply();

    try {
      const player = await fetchPlayer({
        userId: userId ? String(userId) : undefined,
        username: username || undefined,
      });

      const embed = buildPlayerEmbed(player);

      await interaction.editReply({ embeds: [embed] });
      scheduleAutoDelete(interaction);
    } catch (err) {
      // Determine if it's a "not found" vs generic error
      const message = err.message || "Unknown error";
      const content = message.includes("resultCode")
        ? `⚠️ Player not found or API error: ${message}`
        : `⚠️ Lookup failed: ${message}`;

      await interaction.editReply({ content });
      scheduleAutoDelete(interaction);
    }
  },
};
