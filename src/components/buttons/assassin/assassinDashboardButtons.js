"use strict";

const {
  requireAssassinAdmin,
} = require("../../../modules/assassin/assassinPermissions");
const db = require("../../../modules/assassin/assassinDb");
const {
  getConfig,
  createSignup,
  beginHunt,
  cancelGame,
  resetConfig,
} = require("../../../modules/assassin/assassinService");
const {
  buildDashboardEmbed,
  buildSettingsEmbed,
  buildResetEmbed,
  buildLeaderboardEmbed,
} = require("../../../modules/assassin/assassinEmbeds");
const {
  updateLeaderboard,
} = require("../../../modules/assassin/assassinLeaderboard");
const wizard = require("../../../modules/assassin/assassinWizardState");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");

// ═══════════════════════════════════════════════════════════════════════════
// Main handler — prefix matches all assassin:dash:* buttons
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  customIdPrefix: "assassin:dash:",

  async execute(interaction, client) {
    if (!(await requireAssassinAdmin(interaction))) return;
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const action = interaction.customId.replace("assassin:dash:", "");
    db.ensureTables().catch(() => {});
    const config = await getConfig(guildId);
    const game = await db.findActiveGame(guildId);

    switch (action) {
      // ── Main dashboard ──
      case "open":
        return openDashboard(interaction, config, game, client);
      case "close":
        return interaction.message.delete().catch(() => {});

      // ── Games ──
      case "start_game":
        return handleStartGame(interaction, guildId, client);
      case "begin_hunt":
        return handleBeginHunt(interaction, guildId, client);
      case "cancel_game":
        return handleCancelGame(interaction, guildId, client);

      // ── Wizard ──
      case "wiz_start":
        return wizStart(interaction, guildId, userId, config);
      case "wiz_step":
        return wizGoStep(interaction, userId, guildId);
      case "wiz_back":
        return wizGoStep(interaction, userId, guildId, -1);
      case "wiz_enable":
        return wizEnable(interaction, guildId, userId);

      // ── Wizard actions ──
      case "wiz_channel":
        return wizShowChannelSelect(interaction);
      case "wiz_role":
        return wizShowRoleSelect(interaction);
      case "wiz_role_clear":
        return wizRoleClear(interaction, userId, guildId);
      case "wiz_lb_channel":
        return wizShowLbChannelSelect(interaction);
      case "wiz_lb_channel_clear":
        return wizLbChannelClear(interaction, userId, guildId);
      case "wiz_min_modal":
        return wizShowMinModal(interaction);
      case "wiz_cooldown_modal":
        return wizShowCooldownModal(interaction);
      case "wiz_time_modal":
        return wizShowTimeModal(interaction);
      case "wiz_dm_toggle":
        return wizDmToggle(interaction, userId, guildId);

      // ── Info ──
      case "leaderboard":
        return handleLeaderboard(interaction, guildId, client);
      case "settings":
        return handleSettings(interaction, config, game, client);
      case "reset":
        return handleReset(interaction, guildId);
      case "reset_confirm":
        return handleResetConfirm(interaction, guildId, client);

      default:
        return interaction.reply({
          content: "Unknown action.",
          flags: [MessageFlags.Ephemeral],
        });
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Dashboard helpers
// ═══════════════════════════════════════════════════════════════════════════

async function openDashboard(interaction, config, game, client) {
  const embed = buildDashboardEmbed(config, game, interaction.guild);
  const components = buildDashRows(config, game);
  return interaction.update({ embeds: [embed], components });
}

function buildDashRows(config, game) {
  const rows = [];
  const enabled = config?.enabled ?? false;

  if (!enabled) {
    rows.push(
      new ActionRowBuilder().addComponents(
        b("wiz_start", "🧙 Setup Wizard", ButtonStyle.Primary),
        b("close", "✖️ Close", ButtonStyle.Secondary),
      ),
    );
    return rows;
  }

  if (!game || game.status === "COMPLETED" || game.status === "CANCELLED") {
    rows.push(
      new ActionRowBuilder().addComponents(
        b("start_game", "🔪 Start New Game", ButtonStyle.Success),
        b("wiz_start", "🧙 Setup", ButtonStyle.Primary),
        b("leaderboard", "📊 Leaderboard", ButtonStyle.Primary),
      ),
    );
    rows.push(
      new ActionRowBuilder().addComponents(
        b("settings", "⚙️ Settings", ButtonStyle.Secondary),
        b("reset", "⚠️ Reset", ButtonStyle.Danger),
        b("close", "✖️ Close", ButtonStyle.Secondary),
      ),
    );
    return rows;
  }

  if (game.status === "SIGNUPS") {
    const can = game.totalPlayers >= (config.minPlayers ?? 4);
    rows.push(
      new ActionRowBuilder().addComponents(
        b("begin_hunt", "🔪 Begin Hunt", ButtonStyle.Danger, !can),
        b("cancel_game", "🚫 Cancel", ButtonStyle.Secondary),
      ),
    );
    rows.push(
      new ActionRowBuilder().addComponents(
        b("close", "✖️ Close", ButtonStyle.Secondary),
      ),
    );
    return rows;
  }

  // ACTIVE
  rows.push(
    new ActionRowBuilder().addComponents(
      b("cancel_game", "🚫 Cancel Game", ButtonStyle.Danger),
      b("close", "✖️ Close", ButtonStyle.Secondary),
    ),
  );
  return rows;
}

function b(id, label, style, disabled = false) {
  return new ButtonBuilder()
    .setCustomId(`assassin:dash:${id}`)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);
}

// ═══════════════════════════════════════════════════════════════════════════
// Game handlers
// ═══════════════════════════════════════════════════════════════════════════

async function handleStartGame(interaction, guildId, client) {
  const r = await createSignup(guildId, client);
  if (!r)
    return interaction.reply({
      content: "❌ Failed. Is the game channel set?",
      flags: [MessageFlags.Ephemeral],
    });
  const config = await getConfig(guildId);
  const game = await db.findActiveGame(guildId);
  const embed = buildDashboardEmbed(config, game, interaction.guild);
  const rows = buildDashRows(config, game);
  return interaction.update({ embeds: [embed], components: rows });
}

async function handleBeginHunt(interaction, guildId, client) {
  const r = await beginHunt(guildId, client);
  if (!r.success)
    return interaction.reply({
      content: `❌ ${r.reason}`,
      flags: [MessageFlags.Ephemeral],
    });
  const config = await getConfig(guildId);
  const game = await db.findActiveGame(guildId);
  const embed = buildDashboardEmbed(config, game, interaction.guild);
  const rows = buildDashRows(config, game);
  return interaction.update({ embeds: [embed], components: rows });
}

async function handleCancelGame(interaction, guildId, client) {
  await cancelGame(guildId, client);
  const config = await getConfig(guildId);
  return interaction.update({
    embeds: [buildDashboardEmbed(config, null, interaction.guild)],
    components: buildDashRows(config, null),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Wizard — single embed with live config preview
// ═══════════════════════════════════════════════════════════════════════════

function WIZARD_STEPS() {
  return [
    "📌 Game Channel",
    "🏅 Winner Role",
    "📊 Leaderboard Channel",
    "👥 Min Players",
    "⏱️ Cooldown",
    "⏰ Time Limit",
    "📨 DMs",
    "✅ Review",
  ];
}

async function wizStart(interaction, guildId, userId, config) {
  const state = {
    step: 0,
    gameChannelId: config?.gameChannelId ?? null,
    winnerRoleId: config?.winnerRoleId ?? null,
    leaderboardChannelId: config?.leaderboardChannelId ?? null,
    minPlayers: config?.minPlayers ?? 4,
    killCooldownSeconds: config?.killCooldownSeconds ?? 120,
    timeLimitHours: config?.timeLimitHours ?? null,
    dmEnabled: config?.dmEnabled ?? true,
    enabled: config?.enabled ?? false,
  };
  wizard.set(userId, guildId, state);
  return renderWizard(interaction, state);
}

async function wizGoStep(interaction, userId, guildId, delta = 1) {
  const state = wizard.get(userId, guildId);
  if (!state) return wizStart(interaction, guildId, userId, {});
  const steps = WIZARD_STEPS();
  state.step = Math.max(0, Math.min(steps.length - 1, state.step + delta));
  wizard.set(userId, guildId, state);
  return renderWizard(interaction, state);
}

function renderWizard(interaction, state) {
  const steps = WIZARD_STEPS();
  const idx = state.step;
  const embed = new EmbedBuilder()
    .setTitle(`🧙 Assassin Setup — ${steps[idx]}`)
    .setColor(0x8b0000)
    .setFooter({ text: `Step ${idx + 1}/${steps.length}` });

  // Show ALL settings inline
  embed.addFields(
    {
      name: "🎮 Game Channel",
      value: state.gameChannelId ? `<#${state.gameChannelId}>` : "❌ Not set",
      inline: true,
    },
    {
      name: "🏅 Winner Role",
      value: state.winnerRoleId
        ? `<@&${state.winnerRoleId}>`
        : "None (announce only)",
      inline: true,
    },
    {
      name: "📊 Leaderboard Ch.",
      value: state.leaderboardChannelId
        ? `<#${state.leaderboardChannelId}>`
        : "❌ Not set",
      inline: true,
    },
    { name: "👥 Min Players", value: `${state.minPlayers}`, inline: true },
    {
      name: "⏱️ Kill Cooldown",
      value: `${state.killCooldownSeconds}s`,
      inline: true,
    },
    {
      name: "⏰ Time Limit",
      value: state.timeLimitHours
        ? `${state.timeLimitHours}h`
        : "None (no timer)",
      inline: true,
    },
    {
      name: "📨 DM Notifications",
      value: state.dmEnabled ? "✅ ON" : "❌ OFF",
      inline: true,
    },
    {
      name: "⚡ Status",
      value: state.enabled ? "✅ Enabled" : "⚠️ Not enabled yet",
      inline: true,
    },
  );

  // Step description
  const descs = [
    "Select the channel where signups, kill announcements, and the live gameboard will be posted.",
    "Select a role to assign to winners. Leave empty for announce-only wins.",
    "Select a channel where the persistent leaderboard will be posted. Clears between games.",
    "How many players must join before the hunt can begin? (2–20)",
    "How long must assassins wait between kill attempts? (30–600 seconds)",
    "Optional time limit. If set, the target wins if they survive this duration. Leave 0 for no limit.",
    "Send role assignments via DM? If OFF, instructions are sent in the game channel.",
    "Review your configuration. Enable Assassin to start hosting games.",
  ];
  embed.setDescription(descs[idx] || "");

  const rows = buildWizardRows(state);
  return interaction.update({ embeds: [embed], components: rows });
}

// ═══════════════════════════════════════════════════════════════════════════
// Wizard rows
// ═══════════════════════════════════════════════════════════════════════════

function buildWizardRows(state) {
  const rows = [];
  const idx = state.step;
  const steps = WIZARD_STEPS();

  // Nav row
  const nav = new ActionRowBuilder();
  if (idx > 0)
    nav.addComponents(b("wiz_back", "◀ Back", ButtonStyle.Secondary));
  if (idx < steps.length - 1)
    nav.addComponents(b("wiz_step", "Next ▶", ButtonStyle.Primary));
  if (idx === steps.length - 1)
    nav.addComponents(
      b("wiz_enable", "✅ Enable Assassin", ButtonStyle.Success),
    );
  if (nav.components.length) rows.push(nav);

  // Action row — context-sensitive
  const act = new ActionRowBuilder();
  switch (idx) {
    case 0: // Game Channel
      act.addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId("assassin:select:game_channel")
          .setPlaceholder("Pick game channel...")
          .setMinValues(1)
          .setMaxValues(1),
      );
      break;
    case 1: // Winner Role
      act.addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId("assassin:select:winner_role")
          .setPlaceholder("Pick winner role...")
          .setMinValues(1)
          .setMaxValues(1),
      );
      break;
    case 2: // Leaderboard Channel
      act.addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId("assassin:select:lb_channel")
          .setPlaceholder("Pick leaderboard channel...")
          .setMinValues(1)
          .setMaxValues(1),
      );
      break;
    case 3: // Min Players
      act.addComponents(
        b(
          "wiz_min_modal",
          `🔢 Set (currently ${state.minPlayers})`,
          ButtonStyle.Primary,
        ),
      );
      break;
    case 4: // Cooldown
      act.addComponents(
        b(
          "wiz_cooldown_modal",
          `⏱️ Set (currently ${state.killCooldownSeconds}s)`,
          ButtonStyle.Primary,
        ),
      );
      break;
    case 5: // Time Limit
      act.addComponents(
        b(
          "wiz_time_modal",
          `⏰ Set (currently ${state.timeLimitHours ? state.timeLimitHours + "h" : "None"})`,
          ButtonStyle.Primary,
        ),
      );
      break;
    case 6: // DM Toggle
      act.addComponents(
        b(
          "wiz_dm_toggle",
          state.dmEnabled ? "📨 Turn OFF" : "📨 Turn ON",
          state.dmEnabled ? ButtonStyle.Danger : ButtonStyle.Success,
        ),
      );
      break;
    case 7: // Review — no action row
      break;
  }
  if (act.components.length) rows.push(act);

  // Close
  rows.push(
    new ActionRowBuilder().addComponents(
      b("close", "✖️ Close", ButtonStyle.Secondary),
    ),
  );
  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// Wizard action handlers
// ═══════════════════════════════════════════════════════════════════════════

async function wizShowChannelSelect(interaction) {
  // This is handled inline by the select menu component
  return interaction.deferUpdate().catch(() => {});
}

async function wizShowRoleSelect(interaction) {
  return interaction.deferUpdate().catch(() => {});
}

async function wizRoleClear(interaction, userId, guildId) {
  wizard.patch(userId, guildId, { winnerRoleId: null });
  await db.upsertConfig(guildId, { winnerRoleId: null });
  const state = wizard.get(userId, guildId);
  return renderWizard(interaction, state);
}

async function wizShowLbChannelSelect(interaction) {
  return interaction.deferUpdate().catch(() => {});
}

async function wizLbChannelClear(interaction, userId, guildId) {
  wizard.patch(userId, guildId, { leaderboardChannelId: null });
  await db.upsertConfig(guildId, { leaderboardChannelId: null });
  const state = wizard.get(userId, guildId);
  return renderWizard(interaction, state);
}

async function wizShowMinModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId("assassin:wiz_min_modal")
    .setTitle("Set Minimum Players")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("value")
          .setLabel("Minimum players (2-20)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("4")
          .setRequired(true),
      ),
    );
  return interaction.showModal(modal);
}

async function wizShowCooldownModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId("assassin:wiz_cooldown_modal")
    .setTitle("Set Kill Cooldown")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("value")
          .setLabel("Cooldown in seconds (30-600)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("120")
          .setRequired(true),
      ),
    );
  return interaction.showModal(modal);
}

async function wizShowTimeModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId("assassin:wiz_time_modal")
    .setTitle("Set Time Limit")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("value")
          .setLabel("Hours (0 = no limit, max 48)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("24")
          .setRequired(true),
      ),
    );
  return interaction.showModal(modal);
}

async function wizDmToggle(interaction, userId, guildId) {
  const state = wizard.get(userId, guildId);
  if (!state) return;
  state.dmEnabled = !state.dmEnabled;
  await db.upsertConfig(guildId, {
    dmEnabled: state.dmEnabled,
    enabled: state.enabled ?? false,
  });
  wizard.set(userId, guildId, state);
  return renderWizard(interaction, state);
}

async function wizEnable(interaction, guildId, userId) {
  const state = wizard.get(userId, guildId) || {};
  await db.upsertConfig(guildId, {
    enabled: true,
    gameChannelId: state.gameChannelId,
    winnerRoleId: state.winnerRoleId,
    leaderboardChannelId: state.leaderboardChannelId,
    minPlayers: state.minPlayers ?? 4,
    killCooldownSeconds: state.killCooldownSeconds ?? 120,
    dmEnabled: state.dmEnabled ?? true,
    timeLimitHours: state.timeLimitHours ?? null,
  });
  wizard.del(userId, guildId);
  const config = await getConfig(guildId);
  return interaction.update({
    embeds: [buildDashboardEmbed(config, null, interaction.guild)],
    components: buildDashRows(config, null),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Leaderboard, Settings, Reset
// ═══════════════════════════════════════════════════════════════════════════

async function handleLeaderboard(interaction, guildId, client) {
  const config = await getConfig(guildId);
  const top = await db.findTopPlayers(guildId, 10);
  return interaction.reply({
    embeds: [buildLeaderboardEmbed(config, top, interaction.guild)],
    flags: [MessageFlags.Ephemeral],
  });
}

async function handleSettings(interaction, config, game, client) {
  return interaction.update({
    embeds: [buildSettingsEmbed(config)],
    components: [
      new ActionRowBuilder().addComponents(
        b("wiz_start", "🧙 Edit Settings", ButtonStyle.Primary),
        b("open", "↩ Back", ButtonStyle.Secondary),
      ),
    ],
  });
}

async function handleReset(interaction, guildId) {
  return interaction.update({
    embeds: [buildResetEmbed()],
    components: [
      new ActionRowBuilder().addComponents(
        b("reset_confirm", "⚠️ Yes, Reset Everything", ButtonStyle.Danger),
        b("open", "Cancel", ButtonStyle.Secondary),
      ),
    ],
  });
}

async function handleResetConfirm(interaction, guildId, client) {
  await resetConfig(guildId);
  return interaction.update({
    embeds: [
      new EmbedBuilder()
        .setTitle("✅ Reset Complete")
        .setDescription("All Assassin data cleared.")
        .setColor(0x00ff00),
    ],
    components: [],
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Exports for select menus & modals
// ═══════════════════════════════════════════════════════════════════════════

module.exports.buildWizardButtons = buildWizardRows;
module.exports.buildWizardRows = buildWizardRows;
module.exports.renderWizard = renderWizard;
module.exports.buildDashRows = buildDashRows;
