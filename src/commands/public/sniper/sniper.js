"use strict";

const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const prisma = require("../../../lib/prisma");
const { isSniperAdmin } = require("../../../modules/sniper/sniperPermissions");
const {
  buildDashboardEmbed,
  buildPublicEmbed,
} = require("../../../modules/sniper/sniperEmbeds");
const { getConfig } = require("../../../modules/sniper/sniperService");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("sniper")
    .setDescription("Open the Sniper Challenge Control Centre.")
    .setContexts([0]), // guild only

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "Sniper Challenge is only available inside servers.",
        flags: [MessageFlags.Ephemeral],
      });
    }

    const guildId = interaction.guildId;

    // Ensure config exists
    let config = await getConfig(guildId);
    if (!config) {
      config = await prisma.sniperChallengeConfig.create({
        data: { guildId },
      });
    }

    const admin = isSniperAdmin(interaction);

    if (admin) {
      // Admin dashboard
      const embed = buildDashboardEmbed(config, interaction.guild);
      const components = buildAdminDashboardButtons(config);

      return interaction.reply({
        embeds: [embed],
        components,
        flags: [MessageFlags.Ephemeral],
      });
    } else {
      // Public read-only view
      const embed = buildPublicEmbed(config);

      return interaction.reply({
        embeds: [embed],
        flags: [MessageFlags.Ephemeral],
      });
    }
  },
};

// ─── Admin dashboard buttons ────────────────────────────────────────────────────

function buildAdminDashboardButtons(config) {
  const rows = [];

  const enabled = config?.enabled ?? false;
  const paused = config?.paused ?? false;

  // Row 1: Main actions
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("sniper:dash:setup")
      .setLabel("Setup Wizard")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🧙"),
    new ButtonBuilder()
      .setCustomId("sniper:dash:pause")
      .setLabel(paused ? "▶️ Resume" : "⏸️ Pause")
      .setStyle(paused ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!enabled),
    new ButtonBuilder()
      .setCustomId("sniper:dash:force")
      .setLabel("Force Challenge Now")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("⚡")
      .setDisabled(!enabled || paused),
  );
  rows.push(row1);

  // Row 2: Info / settings
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("sniper:dash:leaderboard")
      .setLabel("Leaderboard")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("📊"),
    new ButtonBuilder()
      .setCustomId("sniper:dash:settings")
      .setLabel("Settings")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("⚙️"),
    new ButtonBuilder()
      .setCustomId("sniper:dash:reset")
      .setLabel("Reset / Advanced")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("⚠️"),
  );
  rows.push(row2);

  // Row 3: Close
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("sniper:dash:close")
      .setLabel("Close")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("✖️"),
  );
  rows.push(row3);

  return rows;
}

// Also export for the dashboard buttons component to use
module.exports.buildAdminDashboardButtons = buildAdminDashboardButtons;
