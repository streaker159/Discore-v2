"use strict";

const { EmbedBuilder } = require("discord.js");
const { getShootAttachment, getWinnerAttachment } = require("./sniperAssets");

const SNIPER_COLOR = 0xe74c3c;
const SNIPER_GOLD = 0xf1c40f;

// ─── Duration formatting ────────────────────────────────────────────────────────

function formatMs(ms) {
  if (ms >= 3600000) {
    const h = Math.round(ms / 3600000);
    return `${h}h`;
  }
  if (ms >= 60000) {
    const m = Math.round(ms / 60000);
    return `${m}m`;
  }
  const s = Math.round(ms / 1000);
  return `${s}s`;
}

// ─── Dashboard embed (admin view) ───────────────────────────────────────────────

function buildDashboardEmbed(config, guild) {
  const enabled = config?.enabled ?? false;
  const paused = config?.paused ?? false;
  const status = !enabled ? "🔴 Disabled" : paused ? "🟡 Paused" : "🟢 Running";

  const embed = new EmbedBuilder()
    .setColor(SNIPER_COLOR)
    .setTitle("⚡ Sniper Challenge Control Centre")
    .setDescription(
      "A server-wide reflex mini-game. The first to shoot wins the top spot.",
    )
    .addFields(
      {
        name: "📡 Status",
        value: `${status}`,
        inline: true,
      },
      {
        name: "👑 Current Champion",
        value: config?.currentChampionId
          ? `<@${config.currentChampionId}>`
          : "None",
        inline: true,
      },
      {
        name: "🏅 Reward Role",
        value: config?.rewardRoleId
          ? `<@&${config.rewardRoleId}>`
          : "⚠️ Not set",
        inline: true,
      },
    );

  // Challenge channels
  const channels =
    config?.challengeChannelIds?.length > 0
      ? config.challengeChannelIds.map((id) => `<#${id}>`).join(", ")
      : "⚠️ Not configured";
  embed.addFields({
    name: "📢 Challenge Channels",
    value: channels,
    inline: false,
  });

  // Leaderboard & notification
  embed.addFields(
    {
      name: "📊 Leaderboard Channel",
      value: config?.leaderboardChannelId
        ? `<#${config.leaderboardChannelId}>`
        : "⚠️ Not set",
      inline: true,
    },
    {
      name: "🔔 Notification Channel",
      value: config?.notificationChannelId
        ? `<#${config.notificationChannelId}>`
        : "⚠️ Not set",
      inline: true,
    },
  );

  // Timing
  embed.addFields(
    {
      name: "⏱️ Delay Range",
      value: `${formatMs(config?.minDelayMs ?? 3600000)} – ${formatMs(config?.maxDelayMs ?? 10800000)}`,
      inline: true,
    },
    {
      name: "🎯 Active Window",
      value: formatMs(config?.activeDurationMs ?? 180000),
      inline: true,
    },
  );

  // Stats
  const nextRun =
    config?.nextRunAt && config.enabled && !config.paused
      ? `<t:${Math.floor(new Date(config.nextRunAt).getTime() / 1000)}:R>`
      : "—";

  embed.addFields(
    {
      name: "⏳ Next Challenge",
      value: nextRun,
      inline: true,
    },
    {
      name: "🎯 Total Completed",
      value: `${config?.totalChallengesCompleted ?? 0}`,
      inline: true,
    },
    {
      name: "🔫 Last Winner",
      value: config?.lastWinnerId ? `<@${config.lastWinnerId}>` : "None",
      inline: true,
    },
  );

  embed.setFooter({ text: "Sniper Challenge • Discore" }).setTimestamp();

  return embed;
}

// ─── Public view (normal users) ─────────────────────────────────────────────────

function buildPublicEmbed(config) {
  const enabled = config?.enabled ?? false;
  const paused = config?.paused ?? false;
  const status = !enabled ? "🔴 Disabled" : paused ? "🟡 Paused" : "🟢 Running";

  const embed = new EmbedBuilder()
    .setColor(SNIPER_COLOR)
    .setTitle("⚡ Sniper Challenge")
    .setDescription(
      "Stay sharp — the top spot can change at any moment.\nA target can appear in any configured channel at any time. First to shoot wins!",
    )
    .addFields(
      {
        name: "📡 Status",
        value: status,
        inline: true,
      },
      {
        name: "👑 Current Champion",
        value: config?.currentChampionId
          ? `<@${config.currentChampionId}>`
          : "None",
        inline: true,
      },
      {
        name: "🎯 Total Completed",
        value: `${config?.totalChallengesCompleted ?? 0}`,
        inline: true,
      },
    );

  if (config?.currentChampionId) {
    embed.setThumbnail(
      `https://cdn.discordapp.com/avatars/${config.currentChampionId}/${config.currentChampionId}.png?size=128`,
    );
  }

  embed.setFooter({
    text: "Keep watching — your chance can appear at any time.",
  });

  return embed;
}

// ─── Setup wizard embeds ────────────────────────────────────────────────────────

const WIZARD_STEPS = {
  CHANNELS: 1,
  ROLE: 2,
  LEADERBOARD: 3,
  NOTIFICATION: 4,
  TIMING: 5,
  PREVIEW: 6,
};

function buildWizardStepEmbed(step, data = {}) {
  const color = SNIPER_COLOR;

  switch (step) {
    case WIZARD_STEPS.CHANNELS:
      return new EmbedBuilder()
        .setColor(color)
        .setTitle("⚡ Setup Wizard — Step 1/6: Challenge Channels")
        .setDescription(
          "Select up to **5 channels** where challenges may randomly appear.\n\n" +
            "The bot will randomly pick one each time a target appears.\n\n" +
            (data.challengeChannelIds?.length
              ? `✅ Selected: ${data.challengeChannelIds.map((id) => `<#${id}>`).join(", ")}`
              : "⚠️ No channels selected yet."),
        )
        .setFooter({ text: "Use the dropdown below to select channels." });

    case WIZARD_STEPS.ROLE:
      return new EmbedBuilder()
        .setColor(color)
        .setTitle("⚡ Setup Wizard — Step 2/6: Winner Role")
        .setDescription(
          "Select the role awarded to the current champion.\n\n" +
            "The role is removed from the previous champion when a new winner claims the top spot.\n\n" +
            (data.rewardRoleId
              ? `✅ Selected: <@&${data.rewardRoleId}>`
              : "⚠️ No role selected yet."),
        )
        .setFooter({ text: "Use the dropdown below to select a role." });

    case WIZARD_STEPS.LEADERBOARD:
      return new EmbedBuilder()
        .setColor(color)
        .setTitle("⚡ Setup Wizard — Step 3/6: Leaderboard Channel")
        .setDescription(
          "Select the channel where the **Sniper Challenge leaderboard** will be posted and updated.\n\n" +
            (data.leaderboardChannelId
              ? `✅ Selected: <#${data.leaderboardChannelId}>`
              : "⚠️ No channel selected yet."),
        )
        .setFooter({ text: "Use the dropdown below to select a channel." });

    case WIZARD_STEPS.NOTIFICATION:
      return new EmbedBuilder()
        .setColor(color)
        .setTitle("⚡ Setup Wizard — Step 4/6: Notification Channel")
        .setDescription(
          "Select the channel for winner announcements and system updates.\n" +
            "This can be the same as the leaderboard channel or different.\n\n" +
            (data.notificationChannelId
              ? `✅ Selected: <#${data.notificationChannelId}>`
              : "⚠️ No channel selected yet (will use challenge channel as fallback)."),
        )
        .setFooter({ text: "Use the dropdown below to select a channel." });

    case WIZARD_STEPS.TIMING:
      const minStr = formatMs(data.minDelayMs ?? 3600000);
      const maxStr = formatMs(data.maxDelayMs ?? 10800000);
      const activeStr = formatMs(data.activeDurationMs ?? 180000);
      return new EmbedBuilder()
        .setColor(color)
        .setTitle("⚡ Setup Wizard — Step 5/6: Timing Settings")
        .setDescription(
          "Configure when and how long challenges run.\n\n" +
            `**Random Delay Range:** ${minStr} – ${maxStr}\n` +
            `**Active Challenge Duration:** ${activeStr}\n\n` +
            "Click **Edit Timing** to change these values.",
        )
        .setFooter({ text: "Defaults: 1h–3h delay, 3m active window." });

    case WIZARD_STEPS.PREVIEW:
      const channelsStr = data.challengeChannelIds?.length
        ? data.challengeChannelIds.map((id) => `<#${id}>`).join(", ")
        : "⚠️ Not set";
      return new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("⚡ Setup Wizard — Step 6/6: Preview & Enable")
        .setDescription(
          "Review your configuration before enabling.\n\n" +
            `**Challenge Channels:** ${channelsStr}\n` +
            `**Winner Role:** ${data.rewardRoleId ? `<@&${data.rewardRoleId}>` : "⚠️ Not set"}\n` +
            `**Leaderboard Channel:** ${data.leaderboardChannelId ? `<#${data.leaderboardChannelId}>` : "⚠️ Not set"}\n` +
            `**Notification Channel:** ${data.notificationChannelId ? `<#${data.notificationChannelId}>` : "Using challenge channel as fallback"}\n` +
            `**Delay Range:** ${formatMs(data.minDelayMs ?? 3600000)} – ${formatMs(data.maxDelayMs ?? 10800000)}\n` +
            `**Active Window:** ${formatMs(data.activeDurationMs ?? 180000)}\n\n` +
            "Ready to go? Click **Enable Sniper Challenge** to start!",
        );
    default:
      return new EmbedBuilder().setDescription("Unknown step.");
  }
}

// ─── Challenge spawn embed ──────────────────────────────────────────────────────

function buildChallengeEmbed() {
  const embed = new EmbedBuilder()
    .setColor(SNIPER_GOLD)
    .setTitle("🎯 A Target Appeared!")
    .setDescription(
      "The first person to hit the button **steals the top spot**.\n" +
        "Stay sharp — the challenge can appear at any time.",
    )
    .setImage("attachment://shoot.png")
    .setFooter({ text: "Sniper Challenge • First click wins" })
    .setTimestamp();

  return embed;
}

function getChallengeAttachments() {
  return [getShootAttachment()];
}

// ─── Challenge expired embed (edit) ─────────────────────────────────────────────

function buildExpiredEmbed() {
  const embed = new EmbedBuilder()
    .setColor(0x95a5a6)
    .setTitle("🎯 Target Escaped!")
    .setDescription(
      "Nobody was fast enough — the target got away.\n" +
        "Stay sharp — another one will appear soon!",
    )
    .setFooter({ text: "Sniper Challenge • Target escaped" })
    .setTimestamp();

  return embed;
}

// ─── Challenge won embed (edit) ─────────────────────────────────────────────────

function buildWonEmbed(winnerId, reactionTimeMs) {
  const reactionTime =
    reactionTimeMs != null ? `${(reactionTimeMs / 1000).toFixed(1)}s` : "N/A";

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("🎯 Target Eliminated!")
    .setDescription(
      `**Winner:** <@${winnerId}>\n` +
        `**Reaction Time:** ${reactionTime}\n` +
        `**Top spot stolen!**`,
    )
    .setImage("attachment://winner.png")
    .setFooter({ text: "Sniper Challenge • Direct hit!" })
    .setTimestamp();

  return embed;
}

// ─── Winner announcement embed ──────────────────────────────────────────────────

function buildWinnerAnnouncementEmbed(winnerId, totalWins, currentStreak) {
  const embed = new EmbedBuilder()
    .setColor(SNIPER_GOLD)
    .setTitle("🏆 We Have a Winner!")
    .setDescription(
      `<@${winnerId}> has won the **Sniper Challenge** and taken the top spot!`,
    )
    .addFields(
      {
        name: "🔫 Total Wins",
        value: `${totalWins}`,
        inline: true,
      },
      {
        name: "🔥 Current Streak",
        value: `${currentStreak}`,
        inline: true,
      },
    )
    .setImage("attachment://winner.png")
    .setFooter({
      text: "Keep watching — your chance to steal the top spot can appear at any time.",
    })
    .setTimestamp();

  return embed;
}

function getWinnerAnnouncementAttachments() {
  return [getWinnerAttachment()];
}

// ─── Leaderboard embed ──────────────────────────────────────────────────────────

function buildLeaderboardEmbed(config, topPlayers, guild) {
  const embed = new EmbedBuilder()
    .setColor(SNIPER_GOLD)
    .setTitle("🏆 Sniper Challenge Leaderboard")
    .setDescription("Top marksmen — first click takes the crown.")
    .setTimestamp();

  // Champion
  if (config?.currentChampionId) {
    embed.addFields({
      name: "👑 Current Champion",
      value: `<@${config.currentChampionId}>`,
      inline: false,
    });
  }

  // Top 10
  if (topPlayers?.length) {
    const leaderboardLines = topPlayers
      .map(
        (p, i) =>
          `**${i + 1}.** <@${p.userId}> — ${p.totalWins} win${p.totalWins !== 1 ? "s" : ""} | 🔥 Streak: ${p.currentStreak}`,
      )
      .join("\n");

    embed.addFields({
      name: "📊 Top 10 Winners",
      value: leaderboardLines || "No winners yet.",
      inline: false,
    });

    // Best streak
    const bestStreak = Math.max(...topPlayers.map((p) => p.bestStreak), 0);
    if (bestStreak > 0) {
      embed.addFields({
        name: "🔥 Highest Streak",
        value: `${bestStreak}`,
        inline: true,
      });
    }
  } else {
    embed.addFields({
      name: "📊 Top 10 Winners",
      value: "No winners yet. Be the first!",
      inline: false,
    });
  }

  embed.addFields({
    name: "🎯 Total Challenges",
    value: `${config?.totalChallengesCompleted ?? 0}`,
    inline: true,
  });

  embed.setFooter({
    text: "Sniper Challenge Leaderboard • Automatically updated",
  });

  return embed;
}

// ─── Modal embed helpers ────────────────────────────────────────────────────────

function buildTimingModalEmbed(data = {}) {
  const embed = new EmbedBuilder()
    .setColor(SNIPER_COLOR)
    .setTitle("⏱️ Edit Timing")
    .setDescription(
      `Current settings:\n` +
        `**Min Delay:** ${formatMs(data.minDelayMs ?? 3600000)}\n` +
        `**Max Delay:** ${formatMs(data.maxDelayMs ?? 10800000)}\n` +
        `**Active Window:** ${formatMs(data.activeDurationMs ?? 180000)}\n\n` +
        "Click the button below to open the timing modal.",
    );
  return embed;
}

function buildSettingsEmbed(config) {
  const embed = new EmbedBuilder()
    .setColor(SNIPER_COLOR)
    .setTitle("⚙️ Sniper Challenge Settings")
    .setDescription("Configure timing, channels, role, and more.")
    .addFields(
      {
        name: "⏱️ Delay Range",
        value: `${formatMs(config?.minDelayMs ?? 3600000)} – ${formatMs(config?.maxDelayMs ?? 10800000)}`,
        inline: true,
      },
      {
        name: "🎯 Active Window",
        value: formatMs(config?.activeDurationMs ?? 180000),
        inline: true,
      },
    );
  return embed;
}

// ─── Reset/Advanced embed ──────────────────────────────────────────────────────

function buildResetEmbed(config) {
  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("⚠️ Reset & Advanced")
    .setDescription(
      "Danger zone — these actions cannot be undone.\n\n" +
        "• **Reset Stats** — Clear all player stats (wins, streaks).\n" +
        "• **Clear Champion** — Remove the current champion and their role.\n" +
        "• **Delete Config** — Completely remove the Sniper Challenge setup.\n\n" +
        "Use with caution.",
    );
  return embed;
}

module.exports = {
  SNIPER_COLOR,
  SNIPER_GOLD,
  formatMs,
  WIZARD_STEPS,
  buildDashboardEmbed,
  buildPublicEmbed,
  buildWizardStepEmbed,
  buildChallengeEmbed,
  getChallengeAttachments,
  buildExpiredEmbed,
  buildWonEmbed,
  buildWinnerAnnouncementEmbed,
  getWinnerAnnouncementAttachments,
  buildLeaderboardEmbed,
  buildTimingModalEmbed,
  buildSettingsEmbed,
  buildResetEmbed,
};
