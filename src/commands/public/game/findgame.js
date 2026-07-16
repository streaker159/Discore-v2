"use strict";

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { requireFeature } = require("../../../lib/premiumGate");
const gameSearchManager = require("../../../services/gameSearchManager");
const {
  buildSearchingEmbed,
  buildErrorEmbed,
} = require("../../../embeds/gameFinderEmbeds");
const logger = require("../../../lib/logger");

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("findgame")
    .setDescription(
      "Scan for a newly created WORLD WAR 3 (4X SPEED) Conflict of Nations match.",
    )
    .addRoleOption((opt) =>
      opt
        .setName("ping")
        .setDescription("Role to mention when a game is found.")
        .setRequired(false),
    ),

  async execute(interaction) {
    const userId = interaction.user.id;

    // ── Premium gate ──────────────────────────────────────────────
    const hasAccess = await requireFeature(interaction, "match.finder");
    if (!hasAccess) return;

    // ── One active search per user ────────────────────────────────
    if (gameSearchManager.hasActiveSearch(userId)) {
      return interaction.reply({
        content:
          "⚠️ You already have an active game search. Use the **Stop Search** button on your existing search, or wait for it to complete.",
        flags: 64,
      });
    }

    // ── Extract optional ping role ────────────────────────────────
    const pingRole = interaction.options.getRole("ping");

    // ── Defer immediately ─────────────────────────────────────────
    await interaction.deferReply();

    // ── Start the search ──────────────────────────────────────────
    const result = await gameSearchManager.startSearch(
      interaction,
      pingRole?.id,
    );

    if (!result.ok) {
      if (result.reason === "baselineFailed") {
        return interaction.editReply({
          embeds: [
            buildErrorEmbed(
              `Failed to fetch the initial game list from Conflict of Nations: ${result.error}`,
            ),
          ],
        });
      }
      return interaction.editReply({
        content: "❌ Could not start the search. Please try again.",
      });
    }

    // ── Send the searching embed with stop button ─────────────────
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`findgame:stop:${userId}`)
        .setLabel("🔴 Stop Search")
        .setStyle(ButtonStyle.Danger),
    );

    const reply = await interaction.editReply({
      embeds: [buildSearchingEmbed()],
      components: [row],
    });

    // ── Store the reply message info so the search manager can edit
    //     the message via the bot's REST API even after the interaction
    //     webhook token expires (15 min limit, search lasts 30 min).
    gameSearchManager.setReplyMessage(
      userId,
      reply.channelId || interaction.channelId,
      reply.id,
    );
  },
};
