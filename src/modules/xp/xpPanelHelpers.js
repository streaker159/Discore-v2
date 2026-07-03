"use strict";

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

function channelMention(id) {
  return id ? `<#${id}>` : "Not set";
}

function buildPanelEmbed(config) {
  return new EmbedBuilder()
    .setTitle("🎖️ Discore XP Control Panel")
    .setDescription(
      "Configure activity XP, rewards, cooldowns, channels, announcements, leaderboards, previews, and admin reset tools.",
    )
    .setColor(0xd4af37)
    .addFields(
      {
        name: "🟢 System Status",
        value: [
          `**XP System:** ${config.enabled ? "✅ Enabled" : "❌ Disabled"}`,
          `**Message XP:** ${config.messageXpEnabled ? "✅ Enabled" : "❌ Disabled"}`,
          `**Reaction XP:** ${config.reactionXpEnabled ? "✅ Enabled" : "❌ Disabled"}`,
          `**Level-up Announcements:** ${config.announceLevelUps ? "✅ Enabled" : "❌ Disabled"}`,
          `**Weekly Top 10:** ${config.weeklyTop10Enabled ? "✅ Enabled" : "❌ Disabled"}`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "📣 Channels",
        value: [
          `**Level-up:** ${channelMention(config.levelUpChannelId)}`,
          `**Weekly LB:** ${channelMention(config.weeklyLeaderboardChannelId)}`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "⚙️ Rewards",
        value: [
          `**Message:** ${config.minMessageXp}–${config.maxMessageXp} XP`,
          `**Reaction:** ${config.minReactionXp}–${config.maxReactionXp} XP`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "⏱️ Cooldowns",
        value: [
          `**Message:** ${config.messageCooldownSeconds}s`,
          `**Reaction:** ${config.reactionCooldownSeconds}s`,
        ].join("\n"),
        inline: true,
      },
    )
    .setFooter({ text: "Powered by Discore • XP System" })
    .setTimestamp();
}

function buildPanelRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("xp:panel:general")
        .setLabel("General")
        .setEmoji("⚙️")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("xp:panel:rewards")
        .setLabel("XP Rewards")
        .setEmoji("🎁")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("xp:panel:cooldowns")
        .setLabel("Cooldowns")
        .setEmoji("⏱️")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("xp:panel:channels")
        .setLabel("Channels")
        .setEmoji("📣")
        .setStyle(ButtonStyle.Primary),
    ),
  ];
}

function buildPanelRows2() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("xp:panel:preview")
        .setLabel("Preview")
        .setEmoji("🧪")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("xp:panel:admin")
        .setLabel("Admin Tools")
        .setEmoji("🛠️")
        .setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("xp:panel:refresh")
        .setLabel("Refresh")
        .setEmoji("🔄")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("xp:panel:close")
        .setLabel("Close")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

module.exports = {
  channelMention,
  buildPanelEmbed,
  buildPanelRows,
  buildPanelRows2,
};
