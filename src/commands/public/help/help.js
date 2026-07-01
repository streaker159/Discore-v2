"use strict";

const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  MessageFlags,
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
    description: "How scoreboards work, merge & archive",
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
    description: "Events, battle signups & reminders",
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
    description: "Premium tiers, limits & server config",
  },
];

// ─── Embed builders ───────────────────────────────────────────────────────────

async function buildOverviewEmbed(interaction) {
  return createDiscoreEmbed(interaction, {
    title: "🏠 Discore V2 — General Overview",
    description: [
      "**Discore** is your all-in-one strategy-game command network.",
      "It provides scoreboards, battle signups, game data, AI strategy, alliances, and players — all from Discord.",
      "",
      "### ⚠️ Development Notice",
      "Discore V2 is **still in active development**. Commands, features, and behaviour may change as improvements roll out. If something doesn't work as expected, please report it to your server admins.",
      "",
      "### 🧭 Quick Navigation",
      "Use the dropdown below to switch between help categories:",
      "> 📊 **Scoreboards** — Create, manage, merge & archive scoreboards",
      "> 🛡️ **Moderation** — Warn, mute, ban, timeout & appeals",
      "> 🎮 **Events & Battles** — Schedule events & manage battle signups",
      "> 👤 **Players & Alliances** — Profiles & alliance management",
      "> ⭐ **Premium & Server Setup** — Tiers, limits & configuration",
      "",
      "### 🔗 Core Commands",
      "`/scoreboard` · `/battle` · `/event` · `/game` · `/strategy`",
      "`/alliance` · `/player` · `/match` · `/suggestion`",
      "`/mod` · `/role` · `/help`",
      "",
      "### 🎯 Supported Games",
      "Supremacy: WW3 • Conflict of Nations • Call of War • Supremacy 1914",
    ].join("\n"),
  });
}

async function buildScoreboardsEmbed(interaction) {
  return createDiscoreEmbed(interaction, {
    title: "📊 Scoreboards — Complete Guide",
    description: [
      "> ⚠️ This system is **in active development**. Behaviour described below may evolve.",
      "",
      "### 🔰 What Are Scoreboards?",
      "Scoreboards track wins/losses or points for **teams, players, or custom targets** across your server.",
      "",
      "They can track three target types:",
      "• **Users** — Individual Discord members (`/scoreboard start type: Users`)",
      "• **Roles** — Entire Discord roles/teams (`/scoreboard start type: Roles`)",
      "• **Custom** — Any text name you want (`/scoreboard start type: Custom Text`)",
      "",
      "Scoreboards use one of two scoring systems:",
      "• **Win/Loss** — Tracks wins, losses, win streaks, and ratios",
      "• **Points** — Add or subtract point totals",
      "",
      "### 📋 Creating a Scoreboard",
      "Use `/scoreboard start` with these options:",
      "• **name** — A unique name for the scoreboard",
      "• **metric** — `Win/Loss` or `Points`",
      "• **type** — `Users`, `Roles`, or `Custom Text`",
      "• **description** — Optional season/game info",
      "• **channel** — Where the live embed posts (optional)",
      "• **categories** — Enable category support (for merge use)",
      "",
      "A live embed is automatically posted to the chosen channel.",
      "",
      "### ✏️ Adding Scores",
      "",
      "**Win/Loss boards:**",
      "`/scoreboard addwin` — Add a win to a target",
      "`/scoreboard addloss` — Add a loss to a target",
      "",
      "**Points boards:**",
      "`/scoreboard addpoints` — Add or subtract points (use negative for subtract)",
      "",
      "**Manual editing:**",
      "`/scoreboard edit` — Manually set scores for a target",
      "`/scoreboard delete-entry` — Remove a target's entry entirely",
      "",
      "### 📖 Viewing Scoreboards",
      "`/scoreboard show` — Browse & view any active scoreboard",
      "`/scoreboard list` — Quick list of all active boards",
      "`/scoreboard scores` — Check a user or role's scores across all boards",
      "`/role score` — View a role's scoreboard standings & current members",
      "",
      "### 🎨 Customisation",
      "`/scoreboard set-theme` — Change embed colour (hex)",
      "`/scoreboard set-title` — Change live embed title",
      "`/scoreboard set-description` — Update season/description info",
      "`/scoreboard set-image` — Add a team/role thumbnail image",
      "`/scoreboard rename` — Rename a scoreboard",
      "",
      "### 🔄 Category Views",
      "When a scoreboard has categories enabled (or receives merges), you can switch views:",
      "• **All Scores Combined** — Merges matching targets across categories for display",
      "• **Show All Categories** — Lists each category separately",
      "• **Single Category** — View only one source's scores",
      "",
      "Use the dropdown menu when viewing a category-enabled scoreboard.",
    ].join("\n"),
  });
}

async function buildMergeEmbed(interaction) {
  return createDiscoreEmbed(interaction, {
    title: "🔀 Scoreboard Merging — Full Guide",
    description: [
      "> ⚠️ Merge is a **Premium feature** (PRO tier or above).",
      "",
      "### What Is Merging?",
      "Merging copies scores from a **source** scoreboard into a **target** (totals) scoreboard.",
      "",
      "This lets you:",
      "• Combine seasonal boards into a permanent totals board",
      "• Track cumulative stats over time",
      "• Reuse the same live boards season after season",
      "• View everything together or by source",
      "",
      "### 🔀 Merge Command",
      "`/scoreboard merge` takes three options:",
      "• **merging_board** — The source board being merged (scores copied FROM here)",
      "• **base_board** — The target board receiving the scores",
      "• **after_merge** — What happens to the source after merge",
      "",
      "### 🗂️ Merge Options",
      "",
      "**1. 📦 Archive (Recommended)**  `merge_archive`",
      "• Scores are copied into the target",
      "• Source board is archived (removed from active list but preserved)",
      "• Can be restored later",
      "",
      "**2. 🧹 Clear & Keep Live**  `merge_clear_keep_live`",
      "• Scores are copied into the target",
      "• Source board is **cleared** (all entries removed)",
      "• Source board stays **live** and **reusable** for new scores",
      "• Live embed resets to empty — ready for the next season",
      "• ⏱️ Live embeds may take up to 10 minutes to fully update",
      "",
      "**3. 📋 Keep Live & Keep Scores**  `merge_keep_live_keep_scores`",
      "• Scores are copied into the target",
      "• Source board stays live with its scores unchanged",
      "• Useful for copying into a totals board without affecting the original",
      "",
      "**4. 🗑️ Delete**  `merge_delete`",
      "• Scores are copied into the target",
      "• Source board is **permanently deleted** from the database",
      "• ⚠️ This cannot be undone — prefer archive unless you're sure",
      "",
      "### 📂 How Categories Work in Totals",
      "When you merge source boards into a totals board:",
      "",
      "• **First merge** — Scores appear flat in the totals board (no visible categories yet)",
      "• **Second merge** — Totals switches to category mode. Each source becomes a category.",
      "• **Re-merging the same source later** — Scores add into the **existing** category (no duplicates)",
      "• **Each new source** — Creates its own category",
      "",
      "Example:",
      "```",
      "Season 1: Merge 'WW3 4x' into 'Totals' → Flat display",
      "Season 2: Merge 'WW3 1x' into 'Totals' → Now has 2 categories",
      "Season 3: Merge 'WW3 4x' again → Adds to existing 'WW3 4x' category",
      "```",
      "",
      "### 🗄️ Archive System",
      "Archive preserves scoreboards without deleting them:",
      "• `/archive` — Manage archived scoreboards (Premium)",
      "• Archive option: Show, Archive, Restore, or Delete archived boards",
      "• Archived boards don't count toward your live limit",
      "• Archived boards can be viewed but not modified until restored",
      "",
      "### 📏 Score Combination Rules",
      "During merge:",
      "• **Same target in same category** → Scores combine (additive)",
      "• **Different targets** → New entries are created",
      '• **Same target in different categories** → Stored separately; only combined in "All Scores Combined" view',
    ].join("\n"),
  });
}

async function buildModerationEmbed(interaction) {
  return createDiscoreEmbed(interaction, {
    title: "🛡️ Moderation — Command Guide",
    description: [
      "> ⚠️ This system is **in active development**. Behaviour may change.",
      "",
      "### 🔨 Mod Commands",
      "All mod actions are under `/mod`:",
      "",
      "**`/mod warn`** — Issue a formal warning",
      "• Requires: Moderate Members permission",
      "• Creates a case record visible to the warned user",
      "",
      "**`/mod mute`** — Mute a user (Discore managed mute role)",
      "• Requires: Moderate Members permission",
      "• Optional duration: `30m`, `1 hour`, `7 days`, etc.",
      "• Auto-expires when duration ends",
      "",
      "**`/mod timeout`** — Discord native timeout",
      "• Requires: Moderate Members permission",
      "• Duration is required (up to 28 days Discord limit)",
      "",
      "**`/mod ban`** — Ban a user from the server",
      "• Requires: Moderate Members permission",
      "• Optional duration for temp bans",
      "• Optional message deletion (0-7 days)",
      "",
      "**`/mod unban`** — Unban a previously banned user",
      "• Requires user ID (not mention, since they're not in server)",
      "",
      "**`/mod probation`** — Place user on probation",
      "• Visible on their public profile",
      "• Requires a duration",
      "",
      "### 📋 Case Management",
      "**`/mod case`** — View a specific moderation case by ID (e.g., MOD-00123)",
      "• Public command — anyone can look up a case",
      "• Shows action type, reason, moderator, duration, status",
      "",
      "**`/mod cases`** — List all cases for a user",
      "• Shows case IDs, actions, and dates",
      "• Revoked cases are hidden from public view",
      "",
      "**`/mod revoke`** — Revoke/overturn a moderation action",
      "• Requires: Moderate Members permission",
      "• Removes the case from public record",
      "",
      "### 🎫 Appeals",
      "Appeals allow users to contest moderation actions.",
      "Appeal channels and categories are configured in server setup.",
      "Appealed cases show their appeal status on the case embed.",
      "",
      "### 🛡️ Automod",
      "Configure automatic moderation with `/automod`.",
      "Supports phrase matching (exact, contains, starts with, regex).",
      "Actions: Delete message, send to review, mute, or timeout.",
      "",
      "### 🔑 Required Permissions",
      "Most mod actions require the **Moderate Members** Discord permission.",
      "Some features require the **Scoreboard Manager** role or **Manage Server**.",
    ].join("\n"),
  });
}

async function buildEventsEmbed(interaction) {
  return createDiscoreEmbed(interaction, {
    title: "🎮 Events & Battles — Command Guide",
    description: [
      "> ⚠️ This system is **in active development**. Behaviour may change.",
      "",
      "### 📅 Events",
      "Create and manage server events with `/event`:",
      "• Schedule events with date, time, and description",
      "• Multiple event types: Event, Battle, Team, Community, Training, Game Start, Custom",
      "• RSVP system: Going, Maybe, Not Going",
      "• Automatic reminders before event start",
      "• Role pings on creation and start",
      '• Personal reminders via the "Remind Me" button',
      "• Events auto-cleanup after completion",
      "",
      "### ⚔️ Battle Signups",
      "Manage battle rosters with `/battle`:",
      "• Create signups with team sizes",
      "• Join, reserve, or decline spots",
      "• Battle reminders for signed-up players",
      "• Thread-based discussion per battle",
      "• Status tracking: Open → Locked → Started → Completed",
      "",
      "### 🎯 Game Data",
      "Look up game information with `/game`:",
      "• Units, buildings, resources, and research data",
      "• Supported games: Supremacy WW3, Call of War, Conflict of Nations, Supremacy 1914",
      "• Data contributed and verified by the community",
      "",
      "### 🤖 AI Strategy",
      "Get AI-powered strategy advice with `/strategy` (Premium feature):",
      "• Ask tactical questions about supported games",
      "• Get detailed analysis and recommendations",
      "• Uses Gemini AI with credit-based usage",
    ].join("\n"),
  });
}

async function buildPlayersEmbed(interaction) {
  return createDiscoreEmbed(interaction, {
    title: "👤 Players & Alliances — Command Guide",
    description: [
      "> ⚠️ This system is **in active development**. Behaviour may change.",
      "",
      "### 👤 Player Profiles",
      "Manage your player identity with `/player`:",
      "• Link your in-game profile",
      "• Track stats: K/D, rank, victories, ELO",
      "• Alliance history tracking",
      "• Performance scores and combat style",
      "• Public/private profile toggle",
      "",
      "### 🏰 Alliance Profiles",
      "Manage your alliance with `/alliance`:",
      "• Official alliance registration with tags",
      "• Alliance stats, rankings, and records",
      "• Season performance tracking",
      "• Match history vs opponents",
      "• Logo and banner customisation",
      "• Discord invite links",
      "",
      "### 🏆 Leaderboards",
      "Automated leaderboard posts:",
      "• Top players by K/D, wins, or ELO",
      "• Top alliances by ELO, wins, or rank",
      "• Configurable posting schedule",
      "• Per-channel leaderboard setup",
    ].join("\n"),
  });
}

async function buildPremiumEmbed(interaction) {
  return createDiscoreEmbed(interaction, {
    title: "⭐ Premium & Server Setup",
    description: [
      "> ⚠️ Features and limits are **subject to change** during development.",
      "",
      "### 🎖️ Premium Tiers",
      "",
      "**FREE** — Basic access",
      "• 5 live scoreboards",
      "• 5 live events",
      "• Basic game lookups",
      "• Player & alliance profiles",
      "• Suggestions",
      "",
      "**PRO** — Extended features",
      "• 25 live scoreboards",
      "• 50 live events",
      "• Scoreboard archive & merge",
      "• AI strategy (300 credits/month)",
      "• Match finder",
      "• Custom bot nickname & footer",
      "• 300 AI credits monthly",
      "",
      "**ELITE** — Full power",
      "• 100 live scoreboards",
      "• 250 live events",
      "• Deep AI strategy reports",
      "• Full branding control",
      "• Advanced analytics",
      "• 2,000 AI credits monthly",
      "",
      "**LIFETIME** — Everything, forever",
      "• 999 live scoreboards",
      "• 9,999 live events",
      "• All PRO + ELITE features",
      "• 5,000 AI credits monthly",
      "",
      "### 🛠️ Server Setup",
      "Configure your server with `/server`:",
      "• `/server setup` — Initial server configuration wizard",
      "• `/server branding` — Set alliance name, logo, theme colour",
      "• `/server timezone` — Set server timezone for events",
      "• `/server default-game` — Set the default game",
      "• `/server channels` — Configure scoreboard, event, log channels",
      "",
      "### 💳 Premium Management",
      "`/premium status` — Check your server's current tier",
      "`/premium features` — See what each tier unlocks",
      "`/premium redeem` — Redeem a premium code",
      "",
      "### 📏 Free Limits — Quick Reference",
      "• **5 live scoreboards** maximum",
      "• Cannot use archive or merge",
      "• Cannot use AI strategy",
      "• Cannot use match finder",
      "",
      "Upgrade at the Discore website or contact your bot administrator.",
    ].join("\n"),
  });
}

// ─── Get embed for a category ─────────────────────────────────────────────────

async function getCategoryEmbed(interaction, category) {
  switch (category) {
    case "overview":
      return buildOverviewEmbed(interaction);
    case "scoreboards":
      return buildScoreboardsEmbed(interaction);
    case "merge":
      return buildMergeEmbed(interaction);
    case "moderation":
      return buildModerationEmbed(interaction);
    case "events":
      return buildEventsEmbed(interaction);
    case "players":
      return buildPlayersEmbed(interaction);
    case "premium":
      return buildPremiumEmbed(interaction);
    default:
      return buildOverviewEmbed(interaction);
  }
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

  // Add extra sub-categories that aren't in the main list
  if (currentCategory === "merge") {
    // If we're on merge page, still show the normal options but we need a way to get there
  }

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("help:category:")
      .setPlaceholder("Select a help category...")
      .addOptions(options),
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

    await interaction.reply({
      embeds: [embed],
      components: [selectRow],
      flags: [MessageFlags.Ephemeral],
    });
  },
};
