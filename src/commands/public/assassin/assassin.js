"use strict";

const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const {
  isAssassinAdmin,
} = require("../../../modules/assassin/assassinPermissions");
const {
  buildDashboardEmbed,
  buildPublicEmbed,
} = require("../../../modules/assassin/assassinEmbeds");
const {
  getConfig,
  ensureConfig,
} = require("../../../modules/assassin/assassinService");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("assassin")
    .setDescription("Open the Assassin Control Centre.")
    .setContexts([0]),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "Assassin is only available inside servers.",
        flags: [MessageFlags.Ephemeral],
      });
    }

    const guildId = interaction.guildId;

    // Ensure tables exist
    const db = require("../../../modules/assassin/assassinDb");
    db.ensureTables().catch(() => {});

    // Ensure config exists
    const config = await ensureConfig(guildId);

    // Fetch active game
    const game = await db.findActiveGame(guildId);

    const admin = isAssassinAdmin(interaction);

    if (admin) {
      const embed = buildDashboardEmbed(config, game, interaction.guild);
      const components = buildAdminDashboardButtons(config, game);

      return interaction.reply({
        embeds: [embed],
        components,
        flags: [MessageFlags.Ephemeral],
      });
    } else {
      const embed = buildPublicEmbed(config, game);

      return interaction.reply({
        embeds: [embed],
        flags: [MessageFlags.Ephemeral],
      });
    }
  },
};

function buildAdminDashboardButtons(config, game) {
  const rows = [];
  const enabled = config?.enabled ?? false;

  if (!enabled) {
    // Not set up yet
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("assassin:dash:setup")
        .setLabel("Setup Wizard")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🧙"),
      new ButtonBuilder()
        .setCustomId("assassin:dash:close")
        .setLabel("Close")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("✖️"),
    );
    rows.push(row1);
    return rows;
  }

  if (!game || game.status === "COMPLETED" || game.status === "CANCELLED") {
    // No active game — show Start button
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("assassin:dash:start_game")
        .setLabel("Start New Game")
        .setStyle(ButtonStyle.Success)
        .setEmoji("🔪"),
      new ButtonBuilder()
        .setCustomId("assassin:dash:setup")
        .setLabel("Setup Wizard")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🧙"),
      new ButtonBuilder()
        .setCustomId("assassin:dash:leaderboard")
        .setLabel("Leaderboard")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("📊"),
    );
    rows.push(row1);

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("assassin:dash:settings")
        .setLabel("Settings")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("⚙️"),
      new ButtonBuilder()
        .setCustomId("assassin:dash:reset")
        .setLabel("Reset / Advanced")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("⚠️"),
      new ButtonBuilder()
        .setCustomId("assassin:dash:close")
        .setLabel("Close")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("✖️"),
    );
    rows.push(row2);
    return rows;
  }

  if (game.status === "SIGNUPS") {
    // Signups active
    const canBegin = game.totalPlayers >= (config.minPlayers ?? 4);
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("assassin:dash:begin_hunt")
        .setLabel("Begin Hunt")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔪")
        .setDisabled(!canBegin),
      new ButtonBuilder()
        .setCustomId("assassin:dash:cancel_game")
        .setLabel("Cancel Game")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🚫"),
    );
    rows.push(row1);

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("assassin:dash:close")
        .setLabel("Close")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("✖️"),
    );
    rows.push(row2);
    return rows;
  }

  if (game.status === "ACTIVE") {
    // Hunt active
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("assassin:dash:cancel_game")
        .setLabel("Cancel Game")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🚫"),
    );
    rows.push(row1);

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("assassin:dash:close")
        .setLabel("Close")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("✖️"),
    );
    rows.push(row2);
    return rows;
  }

  return rows;
}

module.exports.buildAdminDashboardButtons = buildAdminDashboardButtons;
