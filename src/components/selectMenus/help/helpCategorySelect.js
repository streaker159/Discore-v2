"use strict";

const { createDiscoreEmbed } = require("../../../lib/embedBuilder");
const { StringSelectMenuOptionBuilder } = require("discord.js");

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
      "",
      "### 🔗 Core Commands",
      "`/scoreboard` · `/archive` · `/event` · `/ask` · `/unit`",
      "`/player` · `/suggestion` · `/mod` · `/automod` · `/role`",
      "`/server` · `/premium` · `/safecrack` · `/ping` · `/help`",
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
      "`/scoreboard show` — Browse & view any active scoreboard with interactive controls",
      "`/scoreboard list` — Quick list of all active boards",
      "`/scoreboard scores` — Check a user or role's scores across all boards",
      "`/role score` — View a role's scoreboard standings & current members",
      "",
      "### 🎨 Customisation",
      "`/scoreboard set-theme` — Change embed colour (e.g. `#FF5733`)",
      "`/scoreboard set-title` — Change live embed title",
      "`/scoreboard set-description` — Update season/description info",
      "`/scoreboard set-image` — Add a team/role thumbnail image",
      "`/scoreboard rename` — Rename a scoreboard",
      "",
      "### 🔄 Category Views",
      "When a scoreboard has categories enabled (or receives merges), you can switch views:",
      "• **All Scores Combined** — Merges matching targets across categories for display only",
      "• **Show All Categories** — Lists each category separately in order",
      "• **Single Category** — View only one source board's scores",
      "",
      "Use the dropdown menu when viewing a category-enabled scoreboard.",
      "",
      "### 🔀 Merging & 🗄️ Archiving",
      "See the **Merging Scoreboards** and **Archives** sections in the dropdown for full guides on combining boards into totals boards and managing archived boards.",
    ].join("\n"),
  });
}

async function buildMergeEmbed(interaction) {
  return createDiscoreEmbed(interaction, {
    title: "🔀 Merging Scoreboards — Full Guide",
    description: [
      "> ⚠️ Merge is a **Premium feature**.",
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
      "### 🗜️ Merge Options",
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
      "### 📏 Score Combination Rules",
      "During merge:",
      "• **Same target in same category** → Scores combine (additive)",
      "• **Different targets** → New entries are created",
      '• **Same target in different categories** → Stored separately; only combined in "All Scores Combined" view',
    ].join("\n"),
  });
}

async function buildArchiveEmbed(interaction) {
  return createDiscoreEmbed(interaction, {
    title: "🗄️ Archives — Full Guide",
    description: [
      "> ⚠️ Archives are a **Premium feature**.",
      "",
      "### What Is Archiving?",
      "Archiving preserves a scoreboard's data without deleting it or leaving it live — archived boards don't count toward your live scoreboard limit.",
      "",
      "### 🗄️ Archive Commands",
      "All archive management is under `/archive`:",
      "",
      "**`/archive list`** — Browse archived scoreboards with pagination",
      "• Optional filter by month (`YYYY-MM`) or search query",
      "",
      "**`/archive search`** — Search archived scoreboards by name, ID, or text",
      "",
      "**`/archive view`** — View an archived scoreboard by its archive ID (e.g. `A-202606-001`)",
      "",
      "**`/archive restore`** — Restore an archive as a new live scoreboard",
      "• Optionally give the restored board a new name",
      "",
      "**`/archive add-result`** — Add a win, loss, or points to an archived scoreboard",
      "• Useful for late corrections without restoring the whole board",
      "",
      "### 🔀 Archiving via Merge",
      "Boards also get archived automatically when merged with the **Archive** option — see the **Merging Scoreboards** section for details.",
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
      "• Requires: **Moderate Members** permission",
      "• Creates a case record visible to the warned user",
      "",
      "**`/mod mute`** — Mute a user (Discore managed mute role)",
      "• Requires: **Moderate Members** permission",
      "• Optional duration: `30m`, `1 hour`, `7 days`, etc.",
      "• Auto-expires when duration ends",
      "",
      "**`/mod timeout`** — Discord native timeout",
      "• Requires: **Moderate Members** permission",
      "• Duration is required (up to 28 days Discord limit)",
      "",
      "**`/mod ban`** — Ban a user from the server",
      "• Requires: **Moderate Members** permission",
      "• Optional duration for temp bans",
      "• Optional message deletion: 0-7 days",
      "",
      "**`/mod unban`** — Unban a previously banned user",
      "• Provide user ID (not mention, since they're not in the server)",
      "",
      "**`/mod probation`** — Place a user on probation",
      "• Visible on their public player profile",
      "• Duration is required",
      "",
      "### 📋 Case Management",
      "**`/mod case MOD-XXXXX`** — View a specific moderation case by ID",
      "• Public command — anyone can look up a case",
      "• Shows action type, reason, moderator, duration, and status",
      "• Revoked/cleared cases are hidden from public view",
      "",
      "**`/mod cases @user`** — List all cases for a user",
      "• Shows case IDs, actions, and dates",
      "",
      "**`/mod revoke MOD-XXXXX`** — Revoke/overturn a moderation action",
      "• Requires: **Moderate Members** permission",
      "• Removes the case from public record",
      "",
      "### 🎫 Appeals System",
      "Appeals allow users to contest moderation actions:",
      "• Appeals are filed from cases and tracked in dedicated channels",
      "• Appeal channels and categories are configured in server setup",
      "• Staff can accept, reject, or reduce penalties through the appeal system",
      "• Appealed cases show their appeal status on the case embed",
      "",
      "### 🛡️ Automod",
      "Configure automatic phrase-based moderation with `/automod`:",
      "• Match types: Exact, Contains, Starts With, Regex",
      "• Actions: Delete message, send to review, mute, or timeout",
      "",
      "### 🔑 Required Permissions",
      "• Most mod actions require the **Moderate Members** Discord permission",
      "• Some features use the **Scoreboard Manager** role or **Manage Server** permission",
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
      "### 🤖 AI Strategy",
      "Get AI-powered strategy advice with `/ask` (uses AI credits, no Premium required):",
      "• Ask tactical questions about supported games",
      "• Get detailed analysis and recommendations",
      "• Powered by Discore AI — still learning and improving",
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
      "• Link your in-game profile to Discord",
      "• Track stats: K/D, rank, victories, ELO",
      "• Alliance history tracking across games",
      "• Performance scores and combat style",
      "• Public/private profile toggle",
      "• Screenshot and profile image uploads",
    ].join("\n"),
  });
}

async function buildPremiumEmbed(interaction) {
  return createDiscoreEmbed(interaction, {
    title: "⭐ Premium & Server Setup",
    description: [
      "> ⚠️ Features and limits are **subject to change** during development.",
      "",
      "### 🎖️ Plans",
      "",
      "**FREE** — Basic access",
      "• 5 live scoreboards maximum",
      "• 5 live events maximum",
      "• Basic game data lookups",
      "• Player & alliance profiles",
      "• Suggestions",
      "",
      "**Discore Premium** — one plan, everything included",
      "• 50 live scoreboards",
      "• 50 live events",
      "• Scoreboard archive & merge",
      "• Custom bot nickname & footer",
      "• 2,000 AI credits included monthly",
      "",
      "**LIFETIME** — special one-time grant (codes/giveaways, not directly purchasable)",
      "• 999 live scoreboards",
      "• 9,999 live events",
      "• All Premium features",
      "• 5,000 AI credits monthly",
      "",
      "### 🤖 AI Credits",
      "AI (`/ask`, translation, welcome messages) runs on **credits**, separate from Premium:",
      "• Any server can buy a 3,000-credit pack via `/premium` → **Buy AI Credits** — no Premium required",
      "• Premium servers get 2,000 credits/month automatically, on top of any purchased packs",
      "• Credits are consumed only on a successful AI response",
      "",
      "### 🛠️ Server Setup",
      "Configure your server with `/server`:",
      "• `/server setup` — Initial server configuration wizard",
      "• `/server branding` — Set alliance name, logo, theme colour",
      "• `/server timezone` — Set server timezone for event scheduling",
      "• `/server default-game` — Set the default game for commands",
      "• `/server channels` — Configure scoreboard, event, log, and moderation channels",
      "",
      "### 💳 Premium Management",
      "`/premium` — View status, plan, and AI credit balance, then use the buttons to:",
      "• Upgrade / Manage Premium (via Discord's Server Apps subscription)",
      "• Buy AI Credits (one-time 3,000-credit pack)",
      "• Refresh Status",
      "• AI Usage Limits & Feature Toggles (server daily limit, per-user limit, cooldown)",
      "• Usage Details",
      "",
      "### 📏 Free Limits — Quick Reference",
      "• **5 live scoreboards** maximum",
      "• Cannot use archive system",
      "• Cannot use merge system",
      "• Cannot use custom nickname/footer",
      "• AI still works if the server has purchased AI credits",
      "",
      "### ⚠️ Important Notes",
      "• Limits apply to the **entire server**, not per user",
      "• Free servers who try to create a 6th live scoreboard will be blocked",
      "• Premium is server-based: one activation covers the whole server",
      "• AI credits are also server-based, shared by everyone in the server",
      "",
      "### 💰 How to Upgrade",
      "Run `/premium` and click a button — both open Discord's built-in **Server Shop**, where our two packages are sold securely through Discord (no external site or card details needed):",
      "• **Upgrade / Manage Premium** — subscribe to Discore Premium",
      "• **Buy AI Credits** — buy a one-time 3,000-credit pack",
    ].join("\n"),
  });
}

// ─── Get embed builder ────────────────────────────────────────────────────────

async function getCategoryEmbed(interaction, category) {
  switch (category) {
    case "overview":
      return buildOverviewEmbed(interaction);
    case "scoreboards":
      return buildScoreboardsEmbed(interaction);
    case "merge":
      return buildMergeEmbed(interaction);
    case "archive":
      return buildArchiveEmbed(interaction);
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

// ─── Build updated select menu for the chosen category ───────────────────────

function buildHelpSelectMenu(currentCategory) {
  const { StringSelectMenuBuilder } = require("discord.js");

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

const { ActionRowBuilder } = require("discord.js");

// ─── Component handler ───────────────────────────────────────────────────────

module.exports = {
  customIdPrefix: "help:category:",
  async execute(interaction) {
    const category = interaction.values[0];
    const embed = await getCategoryEmbed(interaction, category);
    const selectRow = buildHelpSelectMenu(category);

    await interaction.update({
      embeds: [embed],
      components: [selectRow],
    });
  },
};
