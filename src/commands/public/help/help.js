"use strict";

const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { createDiscoreEmbed } = require("../../../lib/embedBuilder");

const CATEGORIES = [
  {
    value: "overview",
    emoji: "🏠",
    label: "General Overview",
    description: "What Discore is & basic navigation",
  },
  {
    value: "scoreboards",
    emoji: "📊",
    label: "Scoreboards",
    description: "How scoreboards work",
  },
  {
    value: "merge",
    emoji: "🔀",
    label: "Merging Scoreboards",
    description: "Combine boards into totals boards",
  },
  {
    value: "archive",
    emoji: "🗄️",
    label: "Archives",
    description: "Browse, restore & manage archived boards",
  },
  {
    value: "moderation",
    emoji: "🛡️",
    label: "Moderation",
    description: "Mod commands, cases & appeals",
  },
  {
    value: "events",
    emoji: "🎮",
    label: "Events & Battles",
    description: "Events, battle signups & AI strategy",
  },
  {
    value: "players",
    emoji: "👤",
    label: "Players & Alliances",
    description: "Player profiles & alliances",
  },
  {
    value: "premium",
    emoji: "⭐",
    label: "Premium & Server Setup",
    description: "Plans, AI credits & server config",
  },
  {
    value: "xp",
    emoji: "✨",
    label: "XP & Leveling",
    description: "XP system, levels & leaderboards",
  },
  {
    value: "autoposts",
    emoji: "📣",
    label: "Auto Posts & Welcome",
    description: "Automated posts, welcome messages & placeholders",
  },
];

// ─── Embed builders ───────────────────────────────────────────────────────────

async function buildOverviewEmbed(interaction) {
  return createDiscoreEmbed(interaction, {
    title: "🏠 Discore V2 — General Overview",
    description: [
      "**Discore** is your all-in-one strategy-game command network.",
      "It provides scoreboards, events, battle signups, AI strategy, and player profiles — all from Discord.",
      "",
      "### ⚠️ Development Notice",
      "Discore V2 is **still in active development**. Commands, features, and behaviour may change as improvements roll out. If something doesn't work as expected, please report it to your server admins.",
      "",
      "### 🧭 Quick Navigation",
      "Use the dropdown below to switch between help categories:",
      "> 📊 **Scoreboards** — Create & manage scoreboards",
      "> 🔀 **Merging Scoreboards** — Combine boards into totals boards",
      "> 🗄️ **Archives** — Browse, restore & manage archived boards",
      "> 🛡️ **Moderation** — Warn, mute, ban, timeout & appeals",
      "> 🎮 **Events & Battles** — Schedule events, battle signups & AI strategy",
      "> 👤 **Players & Alliances** — Profiles & alliance management",
      "> ⭐ **Premium & Server Setup** — Plans, AI credits & configuration",
      "> ✨ **XP & Leveling** — XP system, levels & leaderboards",
      "> 📣 **Auto Posts & Welcome** — Automated posts, welcome messages & placeholders",
      "",
      "### 🔗 Core Commands",
      "`/scoreboard` · `/archive` · `/event` · `/ask` · `/unit`",
      "`/player` · `/suggestion` · `/mod` · `/automod` · `/role`",
      "`/server` · `/premium` · `/safecrack` · `/ping` · `/help` · `/autopost`",
      "",
      "### 🎯 Supported Games",
      "Supremacy: WW3 • Conflict of Nations • Call of War • Supremacy 1914",
    ].join("\n"),
  });
}

// ─── Build select menu ────────────────────────────────────────────────────────

function buildHelpSelectMenu(currentCategory = "overview") {
  const options = CATEGORIES.map((cat) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(`${cat.emoji} ${cat.label}`)
      .setDescription(cat.description)
      .setValue(cat.value)
      .setDefault(cat.value === currentCategory),
  );

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("help:category:")
      .setPlaceholder("Select a help category...")
      .addOptions(options),
  );
}

function buildSupportButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("help:support")
      .setLabel("Need help? Have a suggestion or bug to report?")
      .setEmoji("🆘")
      .setStyle(ButtonStyle.Secondary),
  );
}

// ─── Main command ─────────────────────────────────────────────────────────────

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show Discore V2 help, guides, and documentation."),

  async execute(interaction) {
    const embed = await buildOverviewEmbed(interaction);
    const selectRow = buildHelpSelectMenu("overview");

    const reply = await interaction.reply({
      embeds: [embed],
      components: [selectRow, buildSupportButtonRow()],
      fetchReply: true,
    });

    // Auto-delete the help embed after 10 minutes
    setTimeout(
      async () => {
        try {
          await reply.delete();
        } catch {
          // Message may already be deleted
        }
      },
      10 * 60 * 1000,
    );
  },
};
