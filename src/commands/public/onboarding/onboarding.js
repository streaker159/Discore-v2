"use strict";

const {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const db = require("../../../modules/onboarding/onboardingDb");
const {
  buildDashboardEmbed,
  formatAppNumber,
} = require("../../../modules/onboarding/onboardingEmbeds");
const {
  requireOnboardingPremium,
  isOnboardingPremiumActive,
} = require("../../../modules/onboarding/onboardingPremium");
const {
  canAccessDashboard,
  requirePermission,
  getMemberPermissions,
} = require("../../../modules/onboarding/onboardingPermissions");
const {
  getDashboardStats,
  publishPanel,
} = require("../../../modules/onboarding/onboardingService");
const logger = require("../../../lib/logger");

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("onboarding")
    .setDescription("Open the Discore Applications Centre dashboard.")
    .setContexts([0]),

  async execute(interaction, client) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "Onboarding Applications is only available inside servers.",
        flags: [MessageFlags.Ephemeral],
      });
    }

    const guildId = interaction.guildId;

    // Ensure config exists
    const config = await db.ensureConfig(guildId);
    if (!config) {
      return interaction.reply({
        content: "Failed to initialize onboarding system. Please try again.",
        flags: [MessageFlags.Ephemeral],
      });
    }

    // Permission check
    const canAccess = await canAccessDashboard(guildId, interaction.member);
    if (!canAccess) {
      return interaction.reply({
        content:
          "🔒 You don't have permission to access the Applications Centre.\n\n" +
          "Required: Server Owner, Administrator, Manage Guild, or a configured onboarding role.",
        flags: [MessageFlags.Ephemeral],
      });
    }

    // Premium check (allow viewing but show warning)
    const premiumActive = await isOnboardingPremiumActive(guildId);

    // Show dashboard
    await showDashboard(interaction, client, config, premiumActive);
  },
};

async function showDashboard(interaction, client, config, premiumActive) {
  const guildId = interaction.guildId;

  const appTypes = await db.getApplicationTypes(guildId);
  const stats = await getDashboardStats(guildId);

  const embed = buildDashboardEmbed(
    config,
    interaction.guild,
    appTypes,
    stats,
    premiumActive,
  );
  const components = buildDashboardButtons(config, premiumActive);

  // Use update if the interaction was already replied/deferred, otherwise reply
  if (interaction.deferred || interaction.replied) {
    await interaction
      .editReply({
        embeds: [embed],
        components,
      })
      .catch(async () => {
        await interaction.followUp({
          embeds: [embed],
          components,
          flags: [MessageFlags.Ephemeral],
        });
      });
  } else {
    await interaction.reply({
      embeds: [embed],
      components,
      flags: [MessageFlags.Ephemeral],
    });
  }
}

function buildDashboardButtons(config, premiumActive) {
  const rows = [];
  const enabled = config?.enabled ?? false;

  // Row 1: Main actions
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("onboarding:dash:setup")
      .setLabel("Setup Wizard")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🧙")
      .setDisabled(!premiumActive),
    new ButtonBuilder()
      .setCustomId("onboarding:dash:types")
      .setLabel("Application Types")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("📋")
      .setDisabled(!premiumActive),
    new ButtonBuilder()
      .setCustomId("onboarding:dash:publish")
      .setLabel("Publish Panel")
      .setStyle(ButtonStyle.Success)
      .setEmoji("📤")
      .setDisabled(!premiumActive || !enabled),
    new ButtonBuilder()
      .setCustomId("onboarding:dash:review")
      .setLabel("Review Queue")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("📝"),
  );
  rows.push(row1);

  // Row 2: View / Search / Settings
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("onboarding:dash:viewapp")
      .setLabel("View Applications")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🔍"),
    new ButtonBuilder()
      .setCustomId("onboarding:dash:settings")
      .setLabel("Settings")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("⚙️")
      .setDisabled(!premiumActive),
    new ButtonBuilder()
      .setCustomId("onboarding:dash:permissions")
      .setLabel("Permissions")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔑")
      .setDisabled(!premiumActive),
    new ButtonBuilder()
      .setCustomId("onboarding:dash:preview")
      .setLabel("Preview User Flow")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("👁️"),
  );
  rows.push(row2);

  // Row 3: Toggle / Cleanup / Close
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("onboarding:dash:toggle")
      .setLabel(enabled ? "⛔ Disable" : "✅ Enable")
      .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success)
      .setDisabled(!premiumActive),
    new ButtonBuilder()
      .setCustomId("onboarding:dash:repair")
      .setLabel("Repair Panel")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔧")
      .setDisabled(!premiumActive),
    new ButtonBuilder()
      .setCustomId("onboarding:dash:close")
      .setLabel("Close")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("✖️"),
  );
  rows.push(row3);

  return rows;
}

module.exports.showDashboard = showDashboard;
module.exports.buildDashboardButtons = buildDashboardButtons;
