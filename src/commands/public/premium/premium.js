"use strict";

const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const {
  getPremiumStatus,
  getPremiumSource,
  getAiCreditStatus,
  getAiAdminSettings,
} = require("../../../modules/premium/service");

function buildPremiumDashboard(status, aiCredits, aiSettings, guildName) {
  const premium = status.premium;
  const limits = status.limits;

  const fields = [
    {
      name: "Status",
      value: status.isActive ? "✅ Premium Active" : "Free",
      inline: true,
    },
    {
      name: "Current Package",
      value: status.isActive ? "Discore Premium" : "None",
      inline: true,
    },
    { name: "Source", value: getPremiumSource(premium), inline: true },
    {
      name: "Live Scoreboards",
      value: `${limits.liveScoreboards} limit`,
      inline: true,
    },
    {
      name: "Monthly AI Allowance",
      value: aiCredits.monthlyAllowance.toLocaleString(),
      inline: true,
    },
    {
      name: "AI Credits Used This Month",
      value: aiCredits.monthlyUsed.toLocaleString(),
      inline: true,
    },
  ];

  if (status.isActive) {
    fields.push(
      {
        name: "Monthly AI Remaining",
        value: aiCredits.monthlyRemaining.toLocaleString(),
        inline: true,
      },
      {
        name: "Extra Purchased AI Credits",
        value: aiCredits.extraCredits.toLocaleString(),
        inline: true,
      },
      {
        name: "Total AI Credits Available",
        value: aiCredits.totalAvailable.toLocaleString(),
        inline: true,
      },
    );
    if (aiCredits.monthlyPeriodEnd) {
      fields.push({
        name: "Next Monthly Refill",
        value: `<t:${Math.floor(new Date(aiCredits.monthlyPeriodEnd).getTime() / 1000)}:R>`,
        inline: true,
      });
    }
    if (status.isLifetime) {
      fields.push({ name: "Type", value: "🌟 Lifetime", inline: true });
    }
    fields.push({
      name: "Premium Features",
      value:
        "✅ Expanded scoreboards\n✅ Archives\n✅ Scoreboard merging\n✅ Premium branding\n✅ Advanced setup tools\n✅ Monthly AI starter credits",
      inline: false,
    });
  } else {
    fields.push({
      name: "Upgrade",
      value:
        "Upgrade to Discore Premium to unlock expanded scoreboards, archives, merging, premium branding, advanced setup tools, and 2,000 monthly AI credits.",
      inline: false,
    });
  }

  // ── AI Feature Status ────────────────────────────────────────────
  const aiStatusLines = [
    `AI Translation: ${aiSettings.aiTranslationEnabled ? "✅ Enabled" : "❌ Disabled"}`,
    `AI Welcome: ${aiSettings.aiWelcomeEnabled ? "✅ Enabled" : "❌ Disabled"}`,
    `AI Welcome Channel: ${aiSettings.aiWelcomeChannelId ? `<#${aiSettings.aiWelcomeChannelId}>` : "Not set"}`,
    `Welcome Instructions: ${aiSettings.aiWelcomeInstructions ? aiSettings.aiWelcomeInstructions.substring(0, 60) + "..." : "Not set"}`,
  ];
  if (aiSettings.aiWelcomeEnabled && !aiSettings.aiWelcomeChannelId) {
    aiStatusLines.push(
      "⚠️ AI Welcome is enabled, but no welcome channel is configured.",
    );
  }
  fields.push({
    name: "🧠 AI Feature Status",
    value: aiStatusLines.join("\n"),
    inline: false,
  });

  return new EmbedBuilder()
    .setTitle("💎 Discore Premium")
    .setColor(0x1a7a9e)
    .setFooter({ text: guildName || "Discore" })
    .setTimestamp()
    .addFields(fields);
}

function buildDashboardButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("premium:manage")
        .setLabel("Upgrade / Manage Premium")
        .setEmoji("💎")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("premium:buy_ai_credits")
        .setLabel("Buy 3,000 AI Credits")
        .setEmoji("🤖")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("premium:refresh")
        .setLabel("Refresh Status")
        .setEmoji("🔄")
        .setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("premium:ai_usage")
        .setLabel("AI Usage Limits")
        .setEmoji("⚙️")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("premium:ai_features")
        .setLabel("AI Feature Toggles")
        .setEmoji("🧠")
        .setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("premium:usage")
        .setLabel("Usage Details")
        .setEmoji("📊")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("premium:contact_dev")
        .setLabel("Contact Developer")
        .setEmoji("✉️")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("premium")
    .setDescription("View Discore premium status and manage subscription."),

  async execute(interaction) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const [status, aiCredits, aiSettings] = await Promise.all([
      getPremiumStatus(interaction.guildId),
      getAiCreditStatus(interaction.guildId),
      getAiAdminSettings(interaction.guildId),
    ]);
    const embed = buildPremiumDashboard(
      status,
      aiCredits,
      aiSettings,
      interaction.guild.name,
    );
    const buttons = buildDashboardButtons();
    return interaction.editReply({ embeds: [embed], components: buttons });
  },
};
