"use strict";

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require("discord.js");
const {
  getGuildSuggestionSettings,
  isAdminOrManager,
  buildSuggestionEmbed,
  buildSuggestionButtons,
  buildAdminButtons,
  CATEGORY_LABELS,
  STATUS_LABELS,
} = require("../../../modules/suggestions/service");
const wizardState = require("../../../modules/suggestions/wizardState");
const prisma = require("../../../lib/prisma");

// ─── Dashboard embeds ─────────────────────────────────────────────────────────

function buildDashboardEmbed(guildSettings, isAdmin, suggestionChannelSet) {
  const channelStatus = suggestionChannelSet
    ? `<#${guildSettings?.suggestionChannelId}>`
    : "⚠️ Not configured";

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("💡 Suggestion Centre")
    .setDescription("Submit and vote on server suggestions.")
    .addFields(
      { name: "📡 Suggestion Channel", value: channelStatus, inline: true },
      {
        name: "⏱️ Default Duration",
        value: `${guildSettings?.suggestionDefaultDuration ?? 7} days`,
        inline: true,
      },
      {
        name: "👥 Show Voters",
        value: guildSettings?.suggestionShowVoters ? "✅ Yes" : "🔒 No",
        inline: true,
      },
    )
    .setFooter({ text: "Powered by Discore" })
    .setTimestamp();

  if (!suggestionChannelSet) {
    embed.setDescription(
      "⚠️ **Suggestions are not set up yet.** A suggestion channel has not been configured.\n\n" +
        (isAdmin
          ? "Please set a suggestion channel using `/server channel`, or use the **Set Suggestion Channel** button below."
          : "Please ask an admin to set one up."),
    );
    embed.setColor(0xf1c40f);
  }

  return embed;
}

function buildDashboardButtons(guildSettings, isAdmin, suggestionChannelSet) {
  const rows = [];

  // Main actions
  const mainRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("sug:dashboard:submit")
      .setLabel("Submit Suggestion")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✏️")
      .setDisabled(!suggestionChannelSet),
    new ButtonBuilder()
      .setCustomId("sug:dashboard:view")
      .setLabel("View Suggestions")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("📋"),
    new ButtonBuilder()
      .setCustomId("sug:dashboard:my")
      .setLabel("My Suggestions")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("👤"),
  );
  rows.push(mainRow);

  // Secondary
  const secRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("sug:dashboard:admin_queue")
      .setLabel("Admin Queue")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔧"),
    new ButtonBuilder()
      .setCustomId("sug:dashboard:settings")
      .setLabel("Settings")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("⚙️"),
    new ButtonBuilder()
      .setCustomId("sug:dashboard:close")
      .setLabel("Close")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("✖️"),
  );
  rows.push(secRow);

  // Set suggestion channel (admin only, when not set)
  if (isAdmin && !suggestionChannelSet) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("sug:dashboard:set_channel")
          .setLabel("Set Suggestion Channel")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("📡"),
      ),
    );
  }

  return rows;
}

// ─── Wizard step embeds ───────────────────────────────────────────────────────

const WIZARD_STEPS = {
  CATEGORY: 1,
  DETAILS: 2,
  OPTIONS: 3,
  IMAGE: 4,
  PREVIEW: 5,
};

function buildWizardStepEmbed(step, data = {}) {
  const color = 0x5865f2;

  switch (step) {
    case WIZARD_STEPS.CATEGORY:
      return new EmbedBuilder()
        .setColor(color)
        .setTitle("💡 Submit Suggestion — Step 1/5: Category")
        .setDescription(
          "Choose a category for your suggestion using the dropdown below.",
        );
    case WIZARD_STEPS.DETAILS:
      return new EmbedBuilder()
        .setColor(color)
        .setTitle("💡 Submit Suggestion — Step 2/5: Details")
        .setDescription(
          `**Title:** ${data.title || "_Not set_"}\n**Description:** ${data.content ? data.content.slice(0, 200) + (data.content.length > 200 ? "..." : "") : "_Not set_"}\n\nClick **Fill Details** to enter your suggestion.`,
        );
    case WIZARD_STEPS.OPTIONS:
      return new EmbedBuilder()
        .setColor(color)
        .setTitle("💡 Submit Suggestion — Step 3/5: Options")
        .setDescription(
          `**Duration:** ${data.duration || "7 days (default)"}\n**Show Voters:** ${data.showVoters ? "✅ Yes" : "🔒 No"}`,
        );
    case WIZARD_STEPS.IMAGE:
      return new EmbedBuilder()
        .setColor(color)
        .setTitle("💡 Submit Suggestion — Step 4/5: Image")
        .setDescription(
          data.imageUrl
            ? "✅ Image uploaded. Click **Remove Image** to clear, or **Upload Image** to replace."
            : "Optional. Click **Upload Image** to attach an image to your suggestion.",
        );
    case WIZARD_STEPS.PREVIEW:
      return new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("💡 Submit Suggestion — Step 5/5: Preview & Submit")
        .setDescription(
          "Review your suggestion below. Click **Submit** to post it publicly, or **Back** to make changes.\n\n" +
            `**Category:** ${CATEGORY_LABELS[data.category] || "Not set"}\n` +
            `**Title:** ${data.title || "Not set"}\n` +
            `**Duration:** ${data.duration || "7 days (default)"}\n` +
            `**Show Voters:** ${data.showVoters ? "✅ Yes" : "🔒 No"}\n` +
            `**Image:** ${data.imageUrl ? "✅ Yes" : "❌ No"}`,
        );
    default:
      return new EmbedBuilder().setDescription("Unknown step.");
  }
}

function buildWizardStepComponents(step, data = {}) {
  const rows = [];

  switch (step) {
    case WIZARD_STEPS.CATEGORY: {
      const {
        StringSelectMenuBuilder,
        StringSelectMenuOptionBuilder,
      } = require("discord.js");
      const options = Object.entries(CATEGORY_LABELS).map(([value, label]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(label)
          .setValue(value)
          .setDefault(value === data.category),
      );
      rows.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("sug:wiz:category_select")
            .setPlaceholder("Choose a category...")
            .addOptions(options),
        ),
      );
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sug:wiz:next:2")
            .setLabel("Next")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!data.category),
          new ButtonBuilder()
            .setCustomId("sug:wiz:cancel")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger),
        ),
      );
      break;
    }
    case WIZARD_STEPS.DETAILS:
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sug:wiz:edit_details")
            .setLabel("Fill Details")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📝"),
          new ButtonBuilder()
            .setCustomId("sug:wiz:back:1")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("sug:wiz:next:3")
            .setLabel("Next")
            .setStyle(ButtonStyle.Success)
            .setDisabled(!data.title || !data.content),
          new ButtonBuilder()
            .setCustomId("sug:wiz:cancel")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger),
        ),
      );
      break;
    case WIZARD_STEPS.OPTIONS:
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sug:wiz:set_duration")
            .setLabel("Set Duration")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("⏱️"),
          new ButtonBuilder()
            .setCustomId("sug:wiz:toggle_voters")
            .setLabel(`Show Voters: ${data.showVoters ? "ON" : "OFF"}`)
            .setStyle(
              data.showVoters ? ButtonStyle.Success : ButtonStyle.Secondary,
            )
            .setEmoji("👥"),
        ),
      );
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sug:wiz:back:2")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("sug:wiz:next:4")
            .setLabel("Next")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("sug:wiz:cancel")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger),
        ),
      );
      break;
    case WIZARD_STEPS.IMAGE:
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sug:wiz:upload_image")
            .setLabel("Upload Image")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🖼️"),
          new ButtonBuilder()
            .setCustomId("sug:wiz:remove_image")
            .setLabel("Remove Image")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!data.imageUrl),
        ),
      );
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sug:wiz:back:3")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("sug:wiz:next:5")
            .setLabel("Next")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("sug:wiz:cancel")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger),
        ),
      );
      break;
    case WIZARD_STEPS.PREVIEW:
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sug:wiz:submit")
            .setLabel("Submit Suggestion")
            .setStyle(ButtonStyle.Success)
            .setEmoji("📢"),
        ),
      );
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sug:wiz:back:4")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("sug:wiz:cancel")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger),
        ),
      );
      break;
  }

  return rows.filter((r) => r.components?.length);
}

// ─── Command ──────────────────────────────────────────────────────────────────

module.exports = {
  scope: "PUBLIC",
  buildDashboardEmbed,
  buildDashboardButtons,
  buildWizardStepEmbed,
  buildWizardStepComponents,
  WIZARD_STEPS,
  data: new SlashCommandBuilder()
    .setName("suggestion")
    .setDescription(
      "Open the Suggestion Centre to create and manage suggestions.",
    ),

  async execute(interaction) {
    const guildSettings = await getGuildSuggestionSettings(interaction.guildId);

    if (!guildSettings) {
      // First-time setup: ensure guild exists
      await prisma.guild.upsert({
        where: { id: interaction.guildId },
        create: { id: interaction.guildId },
        update: {},
      });
    }

    const freshSettings = await getGuildSuggestionSettings(interaction.guildId);
    const suggestionChannelSet = !!freshSettings?.suggestionChannelId;

    const member = interaction.member;
    const admin = isAdminOrManager(member, freshSettings);

    const embed = buildDashboardEmbed(
      freshSettings,
      admin,
      suggestionChannelSet,
    );
    const components = buildDashboardButtons(
      freshSettings,
      admin,
      suggestionChannelSet,
    );

    return interaction.reply({ embeds: [embed], components, flags: 64 });
  },
};
