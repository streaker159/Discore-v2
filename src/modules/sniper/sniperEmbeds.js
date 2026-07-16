"use strict";

const { EmbedBuilder } = require("discord.js");
const { getShootAttachment, getWinnerAttachment } = require("./sniperAssets");

const SNIPER_COLOR = 0xe74c3c;
const SNIPER_GOLD = 0xf1c40f;

// ─── Duration formatting ────────────────────────────────────────────────────

function formatMs(ms) {
  if (ms >= 3600000) {
    const h = Math.round(ms / 3600000);
    return `${h}h`;
  }
  if (ms >= 60000) {
    const m = Math.round(ms / 60000);
    return `${m}m`;
  }
  return `${Math.round(ms / 1000)}s`;
}

// ─── Randomized hype/trash talk ──────────────────────────────────────────────

const WIN_MESSAGES = [
  "🔫 **HEADSHOT!** The crown is yours!",
  "🎯 **Bullseye!** You just stole the throne!",
  "⚡ **Lightning reflexes!** Nobody saw that coming.",
  "💀 **Eliminated the competition!** New champion crowned.",
  "🏆 **VICTORY!** The top spot belongs to you now.",
  "💥 **Crack shot!** That target never stood a chance.",
  "👑 **King maker!** You've claimed the sniper throne.",
  "🎪 **Showstopper!** The crowd goes wild for the new champion.",
];

const LOSS_MESSAGES = [
  "🐌 Too slow! Someone's already wearing the crown.",
  "💨 That shot was already taken, friend.",
  "😴 Were you napping? Target's already gone.",
  "👻 Ghost of the challenge — you're clicking on thin air.",
  "⏰ Tick tock... and the target is dust. Better luck next time!",
  "🎯 Missed by a heartbeat! Stay sharp for the next one.",
];

const DETHRONE_MESSAGES = [
  "👑 **THE CROWN HAS BEEN STOLEN!** {winner} dethrones {loser}!",
  "💔 The reign of {loser} has ended. All hail {winner}!",
  "⚔️ **USURPER!** {winner} has taken the throne from {loser}!",
  "🔪 Backstab complete! {winner} snipes the crown from {loser}.",
  "🏚️ The {loser} era is over. {winner} rises to power!",
  "🔥 **COUP D'ÉTAT!** {winner} seizes the sniper throne from {loser}!",
];

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function getRandomWinMessage() {
  return randomPick(WIN_MESSAGES);
}
function getRandomLossMessage() {
  return randomPick(LOSS_MESSAGES);
}
function getRandomDethroneMessage(winnerId, loserId) {
  return randomPick(DETHRONE_MESSAGES)
    .replace(/\{winner\}/g, `<@${winnerId}>`)
    .replace(/\{loser\}/g, `<@${loserId}>`);
}

// ─── Streak badges ───────────────────────────────────────────────────────────

function getStreakBadge(streak) {
  if (streak >= 10) return "⚡👑⚡ **GODLIKE**";
  if (streak >= 7) return "👑 **Legendary**";
  if (streak >= 5) return "💀 **Unstoppable**";
  if (streak >= 3) return "🔥🔥 **On Fire**";
  if (streak >= 2) return "🔥 **Getting Warm**";
  return null;
}

// ─── Dashboard embed (admin view) ───────────────────────────────────────────

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
      { name: "📡 Status", value: `${status}`, inline: true },
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
  const channels =
    config?.challengeChannelIds?.length > 0
      ? config.challengeChannelIds.map((id) => `<#${id}>`).join(", ")
      : "⚠️ Not configured";
  embed.addFields({
    name: "📢 Challenge Channels",
    value: channels,
    inline: false,
  });
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
  const nextRun =
    config?.nextRunAt && config.enabled && !config.paused
      ? `<t:${Math.floor(new Date(config.nextRunAt).getTime() / 1000)}:R>`
      : "—";
  embed.addFields(
    { name: "⏳ Next Challenge", value: nextRun, inline: true },
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

function buildPublicEmbed(config) {
  const enabled = config?.enabled ?? false;
  const paused = config?.paused ?? false;
  const status = !enabled ? "🔴 Disabled" : paused ? "🟡 Paused" : "🟢 Running";
  return new EmbedBuilder()
    .setColor(SNIPER_COLOR)
    .setTitle("⚡ Sniper Challenge")
    .setDescription(
      "Stay sharp — the top spot can change at any moment.\nA target can appear in any configured channel at any time. First to shoot wins!",
    )
    .addFields(
      { name: "📡 Status", value: status, inline: true },
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
    )
    .setFooter({ text: "Keep watching — your chance can appear at any time." });
}

// ─── Wizard embeds ───────────────────────────────────────────────────────────

const WIZARD_STEPS = {
  CHANNELS: 1,
  ROLE: 2,
  TEASER: 3,
  LEADERBOARD: 4,
  NOTIFICATION: 5,
  TIMING: 6,
  PREVIEW: 7,
};

function buildWizardStepEmbed(step, data = {}) {
  const color = SNIPER_COLOR;
  switch (step) {
    case WIZARD_STEPS.CHANNELS:
      return new EmbedBuilder()
        .setColor(color)
        .setTitle("⚡ Setup Wizard — Step 1/7: Challenge Channels")
        .setDescription(
          "Select up to **5 channels** where challenges may randomly appear.\n\nThe bot will randomly pick one each time a target appears.\n\n" +
            (data.challengeChannelIds?.length
              ? `✅ Selected: ${data.challengeChannelIds.map((id) => `<#${id}>`).join(", ")}`
              : "⚠️ No channels selected yet."),
        )
        .setFooter({ text: "Use the dropdown below to select channels." });
    case WIZARD_STEPS.ROLE:
      return new EmbedBuilder()
        .setColor(color)
        .setTitle("⚡ Setup Wizard — Step 2/7: Winner Role")
        .setDescription(
          "Select the role awarded to the current champion.\n\nThe role is removed from the previous champion when a new winner claims the top spot.\n\n" +
            (data.rewardRoleId
              ? `✅ Selected: <@&${data.rewardRoleId}>`
              : "⚠️ No role selected yet."),
        )
        .setFooter({ text: "Use the dropdown below to select a role." });
    case WIZARD_STEPS.TEASER:
      return new EmbedBuilder()
        .setColor(color)
        .setTitle("⚡ Setup Wizard — Step 3/7: Teaser Role (Optional)")
        .setDescription(
          "Select a role to ping **30 seconds before** a challenge spawns.\n\nThis builds hype — people know to get ready!\n\n" +
            (data.teaserRoleId
              ? `✅ Selected: <@&${data.teaserRoleId}>`
              : "⚠️ None (no teaser ping will be sent)"),
        )
        .setFooter({
          text: "Use the dropdown below to select a role, or click Skip.",
        });
    case WIZARD_STEPS.LEADERBOARD:
      return new EmbedBuilder()
        .setColor(color)
        .setTitle("⚡ Setup Wizard — Step 4/7: Leaderboard Channel")
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
        .setTitle("⚡ Setup Wizard — Step 5/7: Notification Channel")
        .setDescription(
          "Select the channel for winner announcements and system updates.\nThis can be the same as the leaderboard channel or different.\n\n" +
            (data.notificationChannelId
              ? `✅ Selected: <#${data.notificationChannelId}>`
              : "⚠️ No channel selected yet (will use challenge channel as fallback)."),
        )
        .setFooter({ text: "Use the dropdown below to select a channel." });
    case WIZARD_STEPS.TIMING: {
      const minStr = formatMs(data.minDelayMs ?? 3600000),
        maxStr = formatMs(data.maxDelayMs ?? 10800000),
        activeStr = formatMs(data.activeDurationMs ?? 180000);
      return new EmbedBuilder()
        .setColor(color)
        .setTitle("⚡ Setup Wizard — Step 6/7: Timing Settings")
        .setDescription(
          `Configure when and how long challenges run.\n\n**Random Delay Range:** ${minStr} – ${maxStr}\n**Active Challenge Duration:** ${activeStr}\n\nClick **Edit Timing** to change these values.`,
        )
        .setFooter({ text: "Defaults: 1h–3h delay, 3m active window." });
    }
    case WIZARD_STEPS.PREVIEW: {
      const channelsStr = data.challengeChannelIds?.length
        ? data.challengeChannelIds.map((id) => `<#${id}>`).join(", ")
        : "⚠️ Not set";
      return new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("⚡ Setup Wizard — Step 7/7: Preview & Enable")
        .setDescription(
          `Review your configuration before enabling.\n\n**Challenge Channels:** ${channelsStr}\n**Winner Role:** ${data.rewardRoleId ? `<@&${data.rewardRoleId}>` : "⚠️ Not set"}\n**Teaser Role:** ${data.teaserRoleId ? `<@&${data.teaserRoleId}>` : "None"}\n**Leaderboard Channel:** ${data.leaderboardChannelId ? `<#${data.leaderboardChannelId}>` : "⚠️ Not set"}\n**Notification Channel:** ${data.notificationChannelId ? `<#${data.notificationChannelId}>` : "Using challenge channel as fallback"}\n**Delay Range:** ${formatMs(data.minDelayMs ?? 3600000)} – ${formatMs(data.maxDelayMs ?? 10800000)}\n**Active Window:** ${formatMs(data.activeDurationMs ?? 180000)}\n\nReady to go? Click **Enable Sniper Challenge** to start!`,
        );
    }
    default:
      return new EmbedBuilder().setDescription("Unknown step.");
  }
}

// ─── Challenge spawn embed ──────────────────────────────────────────────────

function buildChallengeEmbed() {
  return new EmbedBuilder()
    .setColor(SNIPER_GOLD)
    .setTitle("🎯 A Target Appeared!")
    .setDescription(
      "The first person to hit the button **steals the top spot**.\nStay sharp — the challenge can appear at any time.",
    )
    .setImage("attachment://shoot.png")
    .setFooter({ text: "Sniper Challenge • First click wins" })
    .setTimestamp();
}

function getChallengeAttachments() {
  return [getShootAttachment()];
}

// ─── Teaser embed ───────────────────────────────────────────────────────────

function buildTeaserEmbed() {
  return new EmbedBuilder()
    .setColor(SNIPER_GOLD)
    .setTitle("👀 Incoming Target...")
    .setDescription(
      "A sniper challenge is about to spawn in a random channel.\n**Stay sharp — be ready to shoot!** 🔍",
    )
    .setThumbnail("attachment://shoot.png")
    .setFooter({ text: "Sniper Challenge • Teaser" })
    .setTimestamp();
}

// ─── Expired embed ──────────────────────────────────────────────────────────

function buildExpiredEmbed() {
  return new EmbedBuilder()
    .setColor(0x95a5a6)
    .setTitle("🎯 Target Escaped!")
    .setDescription(
      "Nobody was fast enough — the target got away.\nStay sharp — another one will appear soon!",
    )
    .setFooter({ text: "Sniper Challenge • Target escaped" })
    .setTimestamp();
}

// ─── Won embed ──────────────────────────────────────────────────────────────

function buildWonEmbed(winnerId, reactionTimeMs) {
  const rt =
    reactionTimeMs != null ? `${(reactionTimeMs / 1000).toFixed(1)}s` : "N/A";
  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("🎯 Target Eliminated!")
    .setDescription(
      `**Winner:** <@${winnerId}>\n**Reaction Time:** ${rt}\n**Top spot stolen!**`,
    )
    .setImage("attachment://winner.png")
    .setFooter({ text: "Sniper Challenge • Direct hit!" })
    .setTimestamp();
}

// ─── Winner announcement embed ──────────────────────────────────────────────

function buildWinnerAnnouncementEmbed(
  winnerId,
  totalWins,
  currentStreak,
  prevChampionId,
) {
  const badge = getStreakBadge(currentStreak);
  let desc = `<@${winnerId}> has won the **Sniper Challenge** and taken the top spot!`;
  if (prevChampionId && prevChampionId !== winnerId)
    desc = getRandomDethroneMessage(winnerId, prevChampionId);
  if (badge) desc += `\n\n${badge}`;
  return new EmbedBuilder()
    .setColor(SNIPER_GOLD)
    .setTitle("🏆 We Have a Winner!")
    .setDescription(desc)
    .addFields(
      { name: "🔫 Total Wins", value: `${totalWins}`, inline: true },
      { name: "🔥 Current Streak", value: `${currentStreak}`, inline: true },
    )
    .setImage("attachment://winner.png")
    .setFooter({
      text: "Keep watching — your chance to steal the top spot can appear at any time.",
    })
    .setTimestamp();
}

function getWinnerAnnouncementAttachments() {
  return [getWinnerAttachment()];
}

// ─── Leaderboard embed ──────────────────────────────────────────────────────

function buildLeaderboardEmbed(config, topPlayers, fastestReactions, guild) {
  const embed = new EmbedBuilder()
    .setColor(SNIPER_GOLD)
    .setTitle("🏆 Sniper Challenge Leaderboard")
    .setDescription("Top marksmen — first click takes the crown.")
    .setTimestamp();
  if (config?.currentChampionId)
    embed.addFields({
      name: "👑 Current Champion",
      value: `<@${config.currentChampionId}>`,
      inline: false,
    });

  if (topPlayers?.length) {
    const lines = topPlayers
      .map((p, i) => {
        const badge = getStreakBadge(p.currentStreak);
        return `**${i + 1}.** <@${p.userId}> — ${p.totalWins} wins | 🔥 ${p.currentStreak} streak${badge ? ` ${badge}` : ""}`;
      })
      .join("\n");
    embed.addFields({
      name: "📊 Top 10 Winners",
      value: lines || "No winners yet.",
      inline: false,
    });
    const bestStreak = Math.max(...topPlayers.map((p) => p.bestStreak), 0);
    if (bestStreak > 0)
      embed.addFields({
        name: "🔥 Highest Streak",
        value: `${bestStreak}`,
        inline: true,
      });
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

  if (fastestReactions?.length) {
    const rtLines = fastestReactions
      .map(
        (r, i) =>
          `**${i + 1}.** <@${r.winnerId}> — ${(r.reactionTimeMs / 1000).toFixed(2)}s`,
      )
      .join("\n");
    embed.addFields({
      name: "⚡ Fastest Shots",
      value: rtLines,
      inline: false,
    });
  }

  embed.setFooter({
    text: "Sniper Challenge Leaderboard • Automatically updated",
  });
  return embed;
}

// ─── Settings embed ─────────────────────────────────────────────────────────

function buildSettingsEmbed(config) {
  return new EmbedBuilder()
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
}

function buildResetEmbed() {
  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("⚠️ Reset & Advanced")
    .setDescription(
      "Danger zone — these actions cannot be undone.\n\n• **Reset Stats** — Clear all player stats (wins, streaks).\n• **Clear Champion** — Remove the current champion and their role.\n• **Delete Config** — Completely remove the Sniper Challenge setup.\n\nUse with caution.",
    );
}

module.exports = {
  SNIPER_COLOR,
  SNIPER_GOLD,
  formatMs,
  WIZARD_STEPS,
  getRandomWinMessage,
  getRandomLossMessage,
  getRandomDethroneMessage,
  getStreakBadge,
  buildDashboardEmbed,
  buildPublicEmbed,
  buildWizardStepEmbed,
  buildChallengeEmbed,
  getChallengeAttachments,
  buildTeaserEmbed,
  buildExpiredEmbed,
  buildWonEmbed,
  buildWinnerAnnouncementEmbed,
  getWinnerAnnouncementAttachments,
  buildLeaderboardEmbed,
  buildSettingsEmbed,
  buildResetEmbed,
};
