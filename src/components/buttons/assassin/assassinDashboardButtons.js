"use strict";

const {
  isAssassinAdmin,
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
  buildWizardStepEmbed,
  buildSettingsEmbed,
  buildResetEmbed,
  buildLeaderboardEmbed,
} = require("../../../modules/assassin/assassinEmbeds");
const {
  getLeaderboardText,
  updateLeaderboard,
} = require("../../../modules/assassin/assassinLeaderboard");
const wizard = require("../../../modules/assassin/assassinWizardState");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");

module.exports = {
  customIdPrefix: "assassin:dash:",

  async execute(interaction, client) {
    if (!(await isAssassinAdmin(interaction))) {
      return interaction.reply({
        content: "🔒 Only server admins can manage the Assassin game.",
        flags: [MessageFlags.Ephemeral],
      });
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const action = interaction.customId.replace("assassin:dash:", "");

    // Ensure tables
    db.ensureTables().catch(() => {});

    const config = await getConfig(guildId);
    const game = await db.findActiveGame(guildId);

    switch (action) {
      case "setup":
        return handleSetupWizard(interaction, guildId, userId, config);

      case "start_game":
        return handleStartGame(interaction, guildId, client);

      case "begin_hunt":
        return handleBeginHunt(interaction, guildId, client);

      case "cancel_game":
        return handleCancelGame(interaction, guildId, client);

      case "leaderboard":
        return handleLeaderboard(interaction, guildId, client);

      case "settings":
        return handleSettings(interaction, guildId, config);

      case "reset":
        return handleReset(interaction, guildId);

      case "build_lb":
        return handleBuildLb(interaction, guildId, client);

      case "close":
        return interaction.message.delete().catch(() => {});

      // ── Wizard navigation ──
      case "wiz_1":
      case "wiz_2":
      case "wiz_3":
      case "wiz_4":
      case "wiz_5":
      case "wiz_6":
        return handleWizardNav(interaction, guildId, userId, action);

      // ── Wizard finish ──
      case "setup_finish":
        return handleSetupFinish(interaction, guildId, userId);

      // ── Settings quick-edit buttons ──
      case "edit_channel":
      case "edit_role":
      case "edit_min":
      case "edit_cooldown":
      case "edit_dm":
      case "edit_timer":
      case "edit_role_none":
        return handleQuickEdit(interaction, guildId, userId, action);

      // ── Reset confirm ──
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

// ── Setup Wizard ──────────────────────────────────────────────────────────

async function handleSetupWizard(interaction, guildId, userId, config) {
  const state = {
    step: 1,
    gameChannelId: config?.gameChannelId || null,
    winnerRoleId: config?.winnerRoleId || null,
    minPlayers: config?.minPlayers ?? 4,
    killCooldownSeconds: config?.killCooldownSeconds ?? 120,
    dmEnabled: config?.dmEnabled ?? true,
    timeLimitHours: config?.timeLimitHours ?? null,
  };
  wizard.set(userId, guildId, state);

  const embed = buildWizardStepEmbed(1, state);
  const components = buildWizardButtons(1, state);

  return interaction.update({ embeds: [embed], components });
}

function buildWizardButtons(step, state) {
  const rows = [];

  // Navigation buttons
  const navRow = new ActionRowBuilder();
  if (step > 1) {
    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`assassin:dash:wiz_${step - 1}`)
        .setLabel("◀ Back")
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (step < 6) {
    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`assassin:dash:wiz_${step + 1}`)
        .setLabel("Next ▶")
        .setStyle(ButtonStyle.Primary),
    );
  }
  if (step === 6) {
    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId("assassin:dash:setup_finish")
        .setLabel("✅ Enable Assassin")
        .setStyle(ButtonStyle.Success),
    );
  }
  if (navRow.components.length > 0) rows.push(navRow);

  // Action buttons per step
  const actionRow = new ActionRowBuilder();
  if (step === 1) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId("assassin:dash:edit_channel")
        .setLabel("Select Channel")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("📝"),
    );
  }
  if (step === 2) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId("assassin:dash:edit_role")
        .setLabel("Select Role")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🎭"),
      new ButtonBuilder()
        .setCustomId("assassin:dash:edit_role_none")
        .setLabel("No Role")
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (step === 3) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId("assassin:dash:edit_min")
        .setLabel("Set Min Players")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("👥"),
    );
  }
  if (step === 4) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId("assassin:dash:edit_cooldown")
        .setLabel("Set Cooldown")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("⏱️"),
    );
  }
  if (step === 5) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId("assassin:dash:edit_dm")
        .setLabel(state?.dmEnabled ? "Turn OFF" : "Turn ON")
        .setStyle(state?.dmEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
        .setEmoji("📨"),
    );
  }
  if (actionRow.components.length > 0) rows.push(actionRow);

  return rows;
}

async function handleWizardNav(interaction, guildId, userId, customId) {
  const step = parseInt(customId.replace("wiz_", ""));
  const state = wizard.get(userId, guildId) || {};
  state.step = step;
  wizard.set(userId, guildId, state);

  const embed = buildWizardStepEmbed(step, state);
  const components = buildWizardButtons(step, state);

  return interaction.update({ embeds: [embed], components });
}

// ── Start Game (Signups) ──────────────────────────────────────────────────

async function handleStartGame(interaction, guildId, client) {
  const result = await createSignup(guildId, client);
  if (!result) {
    return interaction.reply({
      content: "❌ Failed to start signups. Is the game channel set?",
      flags: [MessageFlags.Ephemeral],
    });
  }

  const config = await getConfig(guildId);
  const game = await db.findActiveGame(guildId);
  const embed = buildDashboardEmbed(config, game, interaction.guild);
  const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
  } = require("discord.js");

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("assassin:dash:begin_hunt")
        .setLabel("Begin Hunt")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔪")
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("assassin:dash:cancel_game")
        .setLabel("Cancel Game")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🚫"),
    ),
  ];

  return interaction.update({ embeds: [embed], components });
}

// ── Begin Hunt ─────────────────────────────────────────────────────────────

async function handleBeginHunt(interaction, guildId, client) {
  const result = await beginHunt(guildId, client);
  if (!result.success) {
    return interaction.reply({
      content: `❌ ${result.reason}`,
      flags: [MessageFlags.Ephemeral],
    });
  }

  const config = await getConfig(guildId);
  const game = await db.findActiveGame(guildId);
  const embed = buildDashboardEmbed(config, game, interaction.guild);

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("assassin:dash:cancel_game")
        .setLabel("Cancel Game")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🚫"),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("assassin:dash:close")
        .setLabel("Close")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("✖️"),
    ),
  ];

  return interaction.update({ embeds: [embed], components });
}

// ── Cancel Game ────────────────────────────────────────────────────────────

async function handleCancelGame(interaction, guildId, client) {
  await cancelGame(guildId, client);
  const config = await getConfig(guildId);
  const embed = buildDashboardEmbed(config, null, interaction.guild);

  return interaction.update({ embeds: [embed], components: [] });
}

// ── Leaderboard ────────────────────────────────────────────────────────────

async function handleLeaderboard(interaction, guildId, client) {
  const config = await getConfig(guildId);
  const topPlayers = await db.findTopPlayers(guildId, 10);
  const embed = buildLeaderboardEmbed(config, topPlayers, interaction.guild);

  return interaction.reply({
    embeds: [embed],
    flags: [MessageFlags.Ephemeral],
  });
}

// ── Settings ───────────────────────────────────────────────────────────────

async function handleSettings(interaction, guildId, config) {
  const embed = buildSettingsEmbed(config);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("assassin:dash:setup")
      .setLabel("Edit Settings")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🧙"),
    new ButtonBuilder()
      .setCustomId("assassin:dash:close")
      .setLabel("Close")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("✖️"),
  );

  return interaction.update({ embeds: [embed], components: [row] });
}

// ── Build Leaderboard ──────────────────────────────────────────────────────

async function handleBuildLb(interaction, guildId, client) {
  await updateLeaderboard(guildId, client);
  return interaction.reply({
    content: "✅ Leaderboard updated!",
    flags: [MessageFlags.Ephemeral],
  });
}

// ── Reset ──────────────────────────────────────────────────────────────────

async function handleReset(interaction, guildId) {
  const embed = buildResetEmbed();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("assassin:dash:reset_confirm")
      .setLabel("Yes, Reset Everything")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("⚠️"),
    new ButtonBuilder()
      .setCustomId("assassin:dash:close")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );

  return interaction.update({ embeds: [embed], components: [row] });
}

async function handleResetConfirm(interaction, guildId, client) {
  await resetConfig(guildId);
  const embed = new (require("discord.js").EmbedBuilder)()
    .setTitle("✅ Reset Complete")
    .setDescription("All Assassin data has been cleared.")
    .setColor(0x00ff00);

  return interaction.update({ embeds: [embed], components: [] });
}

// ── Setup Finish ───────────────────────────────────────────────────────────

async function handleSetupFinish(interaction, guildId, userId) {
  const state = wizard.get(userId, guildId) || {};
  await db.upsertConfig(guildId, {
    enabled: true,
    gameChannelId: state.gameChannelId,
    winnerRoleId: state.winnerRoleId,
    minPlayers: state.minPlayers ?? 4,
    killCooldownSeconds: state.killCooldownSeconds ?? 120,
    dmEnabled: state.dmEnabled ?? true,
    timeLimitHours: state.timeLimitHours ?? null,
  });

  wizard.del(userId, guildId);

  const { EmbedBuilder } = require("discord.js");
  const embed = new EmbedBuilder()
    .setTitle("✅ Assassin Enabled!")
    .setDescription("Assassin is now configured. You can now start a new game.")
    .setColor(0x00ff00);

  const config = await getConfig(guildId);
  const game = await db.findActiveGame(guildId);
  const dashEmbed = buildDashboardEmbed(config, game, interaction.guild);

  return interaction.update({ embeds: [dashEmbed], components: [] });
}

// ── Quick Edit Handlers ────────────────────────────────────────────────────

async function handleQuickEdit(interaction, guildId, userId, action) {
  const state = wizard.get(userId, guildId) || { step: 1 };

  switch (action) {
    case "edit_channel":
      return interaction.reply({
        content: "Select a channel below:",
        components: [
          new ActionRowBuilder().addComponents(
            new (require("discord.js").ChannelSelectMenuBuilder)()
              .setCustomId("assassin:select:game_channel")
              .setPlaceholder("Select game channel...")
              .setChannelTypes([0]), // Text channels
          ),
        ],
        flags: [MessageFlags.Ephemeral],
      });

    case "edit_role":
      return interaction.reply({
        content: "Select a winner role below:",
        components: [
          new ActionRowBuilder().addComponents(
            new (require("discord.js").RoleSelectMenuBuilder)()
              .setCustomId("assassin:select:winner_role")
              .setPlaceholder("Select winner role..."),
          ),
        ],
        flags: [MessageFlags.Ephemeral],
      });

    case "edit_role_none": {
      state.winnerRoleId = null;
      wizard.set(userId, guildId, state);
      const embed = buildWizardStepEmbed(state.step, state);
      const components = buildWizardButtons(state.step, state);
      return interaction.update({ embeds: [embed], components });
    }

    case "edit_min": {
      const embed = new (require("discord.js").EmbedBuilder)()
        .setTitle("Set Minimum Players")
        .setDescription(
          `Current: **${state.minPlayers ?? 4}**\n\nReply to this message with a number (2-20) to set the minimum players.`,
        )
        .setColor(0x8b0000);
      wizard.set(userId, guildId, { ...state, awaitingMinPlayers: true });
      return interaction.reply({
        embeds: [embed],
        flags: [MessageFlags.Ephemeral],
      });
    }

    case "edit_cooldown": {
      const embed = new (require("discord.js").EmbedBuilder)()
        .setTitle("Set Kill Cooldown")
        .setDescription(
          `Current: **${state.killCooldownSeconds ?? 120} seconds**\n\nReply to this message with a number (30-600) to set the cooldown in seconds.`,
        )
        .setColor(0x8b0000);
      wizard.set(userId, guildId, {
        ...state,
        awaitingCooldown: true,
      });
      return interaction.reply({
        embeds: [embed],
        flags: [MessageFlags.Ephemeral],
      });
    }

    case "edit_dm": {
      state.dmEnabled = !state.dmEnabled;
      wizard.set(userId, guildId, state);
      const embed = buildWizardStepEmbed(state.step, state);
      const components = buildWizardButtons(state.step, state);
      return interaction.update({ embeds: [embed], components });
    }

    default:
      return interaction.reply({
        content: "Unknown edit action.",
        flags: [MessageFlags.Ephemeral],
      });
  }
}
