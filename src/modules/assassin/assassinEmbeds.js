"use strict";

const { EmbedBuilder } = require("discord.js");

const THEME_COLOR = 0x8b0000; // Dark red

// ── Dashboard (Admin) ──────────────────────────────────────────────────────

function buildDashboardEmbed(config, game, guild) {
  const enabled = config?.enabled ?? false;
  const embed = new EmbedBuilder()
    .setTitle("⚡ Assassin Control Centre")
    .setColor(THEME_COLOR);

  if (!enabled) {
    embed.setDescription(
      "🔒 Assassin is not set up yet.\nRun the **Setup Wizard** to configure.",
    );
    embed.addFields({
      name: "📡 Status",
      value: "❌ Not Configured",
      inline: true,
    });
    return embed;
  }

  const channelMention = config.gameChannelId
    ? `<#${config.gameChannelId}>`
    : "Not set";
  const roleMention = config.winnerRoleId
    ? `<@&${config.winnerRoleId}>`
    : "Not set (announce only)";
  const timeLimitText = config.timeLimitHours
    ? `${config.timeLimitHours} hours`
    : "None";

  if (!game || game.status === "COMPLETED" || game.status === "CANCELLED") {
    embed.setDescription("📡 **Status:** No Active Game");
    embed.addFields(
      { name: "🎮 Game Channel", value: channelMention, inline: true },
      { name: "🏅 Winner Role", value: roleMention, inline: true },
      {
        name: "👥 Min Players",
        value: `${config.minPlayers ?? 4}`,
        inline: true,
      },
      {
        name: "⏱️ Kill Cooldown",
        value: `${config.killCooldownSeconds ?? 120}s`,
        inline: true,
      },
      { name: "⏰ Time Limit", value: timeLimitText, inline: true },
      {
        name: "📨 DM Notifications",
        value: config.dmEnabled ? "✅ ON" : "❌ OFF",
        inline: true,
      },
    );
    return embed;
  }

  if (game.status === "SIGNUPS") {
    embed.setDescription("📡 **Status:** 🔓 Signups Open");
    embed.addFields({
      name: "👥 Players Joined",
      value: `${game.totalPlayers} / ${config.minPlayers ?? 4} needed`,
      inline: false,
    });
    return embed;
  }

  if (game.status === "ACTIVE") {
    embed.setDescription("📡 **Status:** 🔪 Hunt Active");
    embed.addFields(
      { name: "👥 Alive", value: `${game.playersAlive ?? 0}`, inline: true },
      {
        name: "💀 Dead",
        value: `${(game.totalPlayers ?? 0) - (game.playersAlive ?? 0)}`,
        inline: true,
      },
      {
        name: "⏱️ Cooldown",
        value: `${config.killCooldownSeconds ?? 120}s`,
        inline: true,
      },
    );
    return embed;
  }

  return embed;
}

// ── Public Embed ───────────────────────────────────────────────────────────

function buildPublicEmbed(config, game) {
  const embed = new EmbedBuilder()
    .setTitle("🔪 Assassin")
    .setColor(THEME_COLOR);

  if (!config?.enabled) {
    embed.setDescription("Assassin is not set up in this server.");
    return embed;
  }

  if (!game || game.status === "COMPLETED" || game.status === "CANCELLED") {
    embed.setDescription("No active game right now. Check back later!");
    return embed;
  }

  if (game.status === "SIGNUPS") {
    embed.setDescription(
      `🔓 **Sign-ups are open!**\n${game.totalPlayers} player(s) have joined. Use the Join button in the signup channel.`,
    );
    return embed;
  }

  if (game.status === "ACTIVE") {
    embed.setDescription(
      `🔪 **Hunt in Progress**\n👥 ${game.playersAlive} assassins remain\n💀 ${game.totalPlayers - game.playersAlive} eliminated`,
    );
    return embed;
  }

  return embed;
}

// ── Signup Embed ───────────────────────────────────────────────────────────

function buildSignupEmbed(game, playerCount, minPlayers) {
  return new EmbedBuilder()
    .setTitle("🔪 An Assassin Contract Is Open!")
    .setDescription(
      `**${playerCount}/${minPlayers}** players have joined.\n\nClick **Join** below to enter the game.\nYou will be randomly assigned a role when the hunt begins.\n\n⚠️ One wrong move and you're eliminated.`,
    )
    .setColor(THEME_COLOR)
    .setFooter({ text: "Click Join to participate" });
}

// ── Gameboard Embed (Live) ─────────────────────────────────────────────────

function buildGameboardEmbed(game, alivePlayers, deadPlayers, guild) {
  const embed = new EmbedBuilder()
    .setTitle("🔪 ASSASSIN — LIVE")
    .setColor(THEME_COLOR);

  // Do NOT show player names — only counts. Players are anonymous.
  const total = game.totalPlayers ?? 0;
  const alive = alivePlayers.length;
  const dead = deadPlayers.length;

  embed.addFields(
    {
      name: "👥 Players",
      value: `${total} total`,
      inline: true,
    },
    {
      name: "🟢 Alive",
      value: `${alive} remaining`,
      inline: true,
    },
    {
      name: "💀 Eliminated",
      value: `${dead} out`,
      inline: true,
    },
  );

  // Stats footer
  const now = new Date();
  const startedAt = game.startedAt ? new Date(game.startedAt) : null;
  const elapsed = startedAt ? formatDuration(now - startedAt) : "Just now";

  embed.addFields({
    name: "━━━━━━━━━━━━━━━━━",
    value: `🕐 Started: ${elapsed} ago\n🔪 Total kills: ${total - alive}`,
    inline: false,
  });

  if (game.status === "COMPLETED") {
    embed.setTitle("🔪 ASSASSIN — GAME OVER");
    if (game.winnerId) {
      embed.setDescription(`🏆 Winner: <@${game.winnerId}>`);
    }
  }

  return embed;
}

// ── Kill Announcement ──────────────────────────────────────────────────────

function buildKillAnnouncementEmbed(killerId, targetId, remaining) {
  return new EmbedBuilder()
    .setTitle("❌ Wrong Target!")
    .setDescription(
      `<@${killerId}> tried to eliminate <@${targetId}>, but they were an assassin!\n\n💀 <@${killerId}> has been **eliminated**.\n\n👥 ${remaining} players remain.`,
    )
    .setColor(0xff0000)
    .setFooter({ text: "One shot, one miss — you're out." });
}

// ── Winner Embed (Assassin Victory) ────────────────────────────────────────

function buildAssassinWinnerEmbed(winnerId, targetId) {
  return new EmbedBuilder()
    .setTitle("🏆 Target Eliminated!")
    .setDescription(
      `<@${winnerId}> found and eliminated the hidden target <@${targetId}>!\n\n🎉 **<@${winnerId}> is the champion!**`,
    )
    .setColor(0xffd700);
}

// ── Winner Embed (Target Survived) ─────────────────────────────────────────

function buildTargetSurvivedEmbed(targetId) {
  return new EmbedBuilder()
    .setTitle("🎯 The Target Survived!")
    .setDescription(
      `<@${targetId}> outlasted all the assassins!\n\nAll assassins have been eliminated.\n🎉 **<@${targetId}> wins!**`,
    )
    .setColor(0x00ff00)
    .setFooter({ text: "The assassins picked the wrong targets." });
}

// ── DM Embeds ──────────────────────────────────────────────────────────────

function buildAssassinDmEmbed(playerNames) {
  return new EmbedBuilder()
    .setTitle("🔪 You are an ASSASSIN!")
    .setDescription(
      `There is 1 **Target** hiding among:\n${playerNames.join(", ")}\n\nReact with 🔪 on any message by the Target to win.\n\n⚠️ **If you 🔪 another assassin — YOU are eliminated.**\n\nChoose wisely. The Target wins if you all fall.`,
    )
    .setColor(THEME_COLOR)
    .setFooter({ text: "One shot only. Make it count." });
}

function buildTargetDmEmbed(playerNames) {
  return new EmbedBuilder()
    .setTitle("🎯 You are the TARGET!")
    .setDescription(
      `There are ${playerNames.length - 1} assassins hunting you.\n\nSurvive. If they attack each other, you win.\n\nDon't reveal yourself. Blend in.`,
    )
    .setColor(0x00ff00)
    .setFooter({ text: "Stay hidden. Stay alive." });
}

// ── Leaderboard Embed ──────────────────────────────────────────────────────

function buildLeaderboardEmbed(config, topPlayers, guild) {
  const embed = new EmbedBuilder()
    .setTitle("🔪 Assassin Leaderboard")
    .setColor(THEME_COLOR)
    .setTimestamp();

  if (!topPlayers || topPlayers.length === 0) {
    embed.setDescription("No winners yet. Be the first!");
    return embed;
  }

  const lines = topPlayers.map((p, i) => {
    const username =
      guild?.members?.cache?.get(p.userId)?.displayName || `<@${p.userId}>`;
    return `**${i + 1}.** ${username} — 🏆 ${p.gamesWon} wins | 🔪 ${p.totalKills} kills | 💀 ${p.wrongKills ?? 0} mistakes`;
  });

  embed.setDescription(lines.join("\n"));
  return embed;
}

// ── Wizard Step Embed ──────────────────────────────────────────────────────

function buildWizardStepEmbed(step, data) {
  const embed = new EmbedBuilder()
    .setTitle("🧙 Assassin Setup Wizard")
    .setColor(THEME_COLOR)
    .setFooter({ text: `Step ${step}/6` });

  switch (step) {
    case 1:
      embed.setDescription(
        "**Step 1: Game Channel**\nSelect the channel where signups and kill announcements will be posted.",
      );
      break;
    case 2:
      embed.setDescription(
        "**Step 2: Winner Role**\nSelect a role to give to winners (optional). Leave empty for announce-only.",
      );
      break;
    case 3:
      embed.setDescription(
        `**Step 3: Minimum Players**\nHow many players are needed before the hunt can begin?\n\nCurrent: **${data?.minPlayers ?? 4}**\n\nClick the button below to set a number (2–20).`,
      );
      break;
    case 4:
      embed.setDescription(
        `**Step 4: Kill Cooldown**\nHow long must assassins wait between kill attempts?\n\nCurrent: **${data?.killCooldownSeconds ?? 120} seconds**\n\nClick the button below to set a value (30–600).`,
      );
      break;
    case 5:
      embed.setDescription(
        `**Step 5: DM Notifications**\nSend role assignment via DM?\n\nCurrent: **${data?.dmEnabled ? "ON" : "OFF"}**\n\nToggle below.`,
      );
      break;
    case 6:
      embed.setDescription(
        "**Step 6: Preview & Enable**\nReady to activate Assassin?\n\nReview your settings below:",
      );
      embed.addFields(
        {
          name: "Channel",
          value: data?.gameChannelId ? `<#${data.gameChannelId}>` : "Not set",
          inline: true,
        },
        {
          name: "Winner Role",
          value: data?.winnerRoleId ? `<@&${data.winnerRoleId}>` : "None",
          inline: true,
        },
        {
          name: "Min Players",
          value: `${data?.minPlayers ?? 4}`,
          inline: true,
        },
        {
          name: "Kill Cooldown",
          value: `${data?.killCooldownSeconds ?? 120}s`,
          inline: true,
        },
        {
          name: "DM Notifications",
          value: data?.dmEnabled ? "ON" : "OFF",
          inline: true,
        },
        {
          name: "Time Limit",
          value: data?.timeLimitHours ? `${data.timeLimitHours}h` : "None",
          inline: true,
        },
      );
      break;
  }

  return embed;
}

// ── Settings Embed ─────────────────────────────────────────────────────────

function buildSettingsEmbed(config) {
  const embed = new EmbedBuilder()
    .setTitle("⚙️ Assassin Settings")
    .setColor(THEME_COLOR)
    .addFields(
      {
        name: "Game Channel",
        value: config.gameChannelId ? `<#${config.gameChannelId}>` : "Not set",
        inline: true,
      },
      {
        name: "Winner Role",
        value: config.winnerRoleId ? `<@&${config.winnerRoleId}>` : "None",
        inline: true,
      },
      { name: "Min Players", value: `${config.minPlayers ?? 4}`, inline: true },
      {
        name: "Kill Cooldown",
        value: `${config.killCooldownSeconds ?? 120}s`,
        inline: true,
      },
      {
        name: "DM Notifications",
        value: config.dmEnabled ? "ON" : "OFF",
        inline: true,
      },
      {
        name: "Time Limit",
        value: config.timeLimitHours ? `${config.timeLimitHours}h` : "None",
        inline: true,
      },
    );
  return embed;
}

// ── Reset Embed ────────────────────────────────────────────────────────────

function buildResetEmbed() {
  return new EmbedBuilder()
    .setTitle("⚠️ Reset Assassin?")
    .setDescription(
      "This will delete all configuration, stats, and game history for Assassin in this server.\n\n**This cannot be undone.**\n\nClick the button below to confirm.",
    )
    .setColor(0xff0000);
}

// ── Utility ────────────────────────────────────────────────────────────────

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

module.exports = {
  buildDashboardEmbed,
  buildPublicEmbed,
  buildSignupEmbed,
  buildGameboardEmbed,
  buildKillAnnouncementEmbed,
  buildAssassinWinnerEmbed,
  buildTargetSurvivedEmbed,
  buildAssassinDmEmbed,
  buildTargetDmEmbed,
  buildLeaderboardEmbed,
  buildWizardStepEmbed,
  buildSettingsEmbed,
  buildResetEmbed,
  formatDuration,
};
