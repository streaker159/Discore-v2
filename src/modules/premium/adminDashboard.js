"use strict";

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const {
  getPremiumStatus,
  getPremiumSource,
  getAiCreditStatus,
} = require("./service");

function formatDate(date) {
  if (!date) return "Never / not set";
  return `<t:${Math.floor(new Date(date).getTime() / 1000)}:F>`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function resolveDashboardGuildId(interaction, guildId) {
  return String(guildId || interaction.guildId || "").trim();
}

async function buildPremiumAdminDashboard(interaction, guildId) {
  const targetGuildId = resolveDashboardGuildId(interaction, guildId);
  const guild = targetGuildId
    ? interaction.client.guilds.cache.get(targetGuildId)
    : null;

  const fields = [];
  let description =
    "Owner dashboard for grants, codes, revokes, and AI credit allowances.";

  if (targetGuildId) {
    const [status, aiCredits] = await Promise.all([
      getPremiumStatus(targetGuildId),
      getAiCreditStatus(targetGuildId),
    ]);
    const premium = status.premium;

    description = [
      `Managing: **${guild?.name || "Unknown guild"}**`,
      `Guild ID: \`${targetGuildId}\``,
    ].join("\n");

    fields.push(
      {
        name: "Premium",
        value: status.isActive ? `Active (${status.tier})` : "Free / inactive",
        inline: true,
      },
      {
        name: "Source",
        value: getPremiumSource(premium),
        inline: true,
      },
      {
        name: "Expires",
        value: premium?.expiresAt
          ? formatDate(premium.expiresAt)
          : "Never / not set",
        inline: false,
      },
      {
        name: "Monthly AI Allowance",
        value: formatNumber(aiCredits.monthlyAllowance),
        inline: true,
      },
      {
        name: "Monthly AI Remaining",
        value: formatNumber(aiCredits.monthlyRemaining),
        inline: true,
      },
      {
        name: "Extra AI Credits",
        value: formatNumber(aiCredits.extraCredits),
        inline: true,
      },
    );
  } else {
    fields.push({
      name: "Start Here",
      value:
        "Use **Set Guild** first, or run `/premium-admin guild_id:<id>` to open this dashboard for a specific server.",
      inline: false,
    });
  }

  fields.push({
    name: "Actions",
    value:
      "**Grant Premium** sets duration, monthly AI allowance, and bonus AI credits.\n" +
      "**Create Code** builds redeemable premium codes with uses and expiry.\n" +
      "**Revoke Premium** locks a server back to free.",
    inline: false,
  });

  const embed = new EmbedBuilder()
    .setTitle("Premium Admin Dashboard")
    .setColor(0x1a7a9e)
    .setDescription(description)
    .addFields(fields)
    .setFooter({ text: "Discore owner controls" })
    .setTimestamp();

  const idPart = targetGuildId || "none";
  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`premium_admin:setguild:${idPart}`)
        .setLabel("Set Guild")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`premium_admin:refresh:${idPart}`)
        .setLabel("Refresh")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!targetGuildId),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`premium_admin:grant:${idPart}`)
        .setLabel("Grant Premium")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`premium_admin:createcode:${idPart}`)
        .setLabel("Create Code")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`premium_admin:revoke:${idPart}`)
        .setLabel("Revoke Premium")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!targetGuildId),
    ),
  ];

  return { embeds: [embed], components, flags: 64 };
}

module.exports = {
  buildPremiumAdminDashboard,
  resolveDashboardGuildId,
};
