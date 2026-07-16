"use strict";

const db = require("./sniperDb");
const logger = require("../../lib/logger");
const {
  buildChallengeEmbed,
  getChallengeAttachments,
  buildExpiredEmbed,
  buildWonEmbed,
  buildWinnerAnnouncementEmbed,
  getWinnerAnnouncementAttachments,
} = require("./sniperEmbeds");
const { updateLeaderboard } = require("./sniperLeaderboard");
const { randomDelay } = require("./sniperScheduler");

const DEBUG = process.env.DEBUG_SNIPER_CHALLENGE === "true";

async function getConfig(guildId) {
  return db.findConfig(guildId);
}

async function ensureConfig(guildId) {
  let config = await db.findConfig(guildId);
  if (!config) config = await db.upsertConfig(guildId, {});
  return config;
}

function validateSetup(config) {
  const issues = [];
  if (!config.challengeChannelIds || config.challengeChannelIds.length === 0)
    issues.push("No challenge channels selected.");
  if (config.challengeChannelIds && config.challengeChannelIds.length > 5)
    issues.push("Maximum 5 challenge channels allowed.");
  if (!config.rewardRoleId) issues.push("No reward role selected.");
  if (!config.leaderboardChannelId)
    issues.push("No leaderboard channel selected (recommended).");
  if (config.minDelayMs >= config.maxDelayMs)
    issues.push("Min delay must be less than max delay.");
  if (config.minDelayMs < 60000)
    issues.push("Min delay must be at least 1 minute.");
  if (config.activeDurationMs < 30000)
    issues.push("Active duration must be at least 30 seconds.");
  if (config.activeDurationMs > 600000)
    issues.push("Active duration must be at most 10 minutes.");
  return issues;
}

async function spawnChallenge(guildId, client, forceChannelId = null) {
  const config = await getConfig(guildId);
  if (!config || !config.enabled) return null;

  const existingActive = await db.findActiveRun(guildId);
  if (existingActive) {
    if (DEBUG) logger.info("[SniperChallenge] Already active, skipping spawn");
    return null;
  }

  const channelIds = config.challengeChannelIds || [];
  if (!channelIds.length) return null;

  const channelId =
    forceChannelId || channelIds[Math.floor(Math.random() * channelIds.length)];
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;

  const channel = guild.channels.cache.get(channelId);
  if (!channel) {
    logger.warn("[SniperChallenge] Challenge channel not found", {
      guildId,
      channelId,
    });
    return null;
  }

  const perms = channel.permissionsFor(guild.members.me);
  if (
    !perms?.has("ViewChannel") ||
    !perms?.has("SendMessages") ||
    !perms?.has("EmbedLinks") ||
    !perms?.has("AttachFiles")
  ) {
    logger.warn("[SniperChallenge] Missing permissions in challenge channel", {
      guildId,
      channelId,
    });
    return null;
  }

  const expiresAt = new Date(Date.now() + config.activeDurationMs);
  const embed = buildChallengeEmbed();
  const attachments = getChallengeAttachments();
  const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
  } = require("discord.js");

  const button = new ButtonBuilder()
    .setCustomId("sniper:shoot")
    .setLabel("SHOOT")
    .setStyle(ButtonStyle.Danger)
    .setEmoji("🔫");
  const row = new ActionRowBuilder().addComponents(button);

  let message;
  try {
    message = await channel.send({
      embeds: [embed],
      components: [row],
      files: attachments,
    });
  } catch (err) {
    logger.error("[SniperChallenge] Failed to send challenge message", {
      guildId,
      channelId,
      error: err.message,
    });
    return null;
  }

  const run = await db.createRun({
    guildId,
    channelId,
    messageId: message.id,
    status: "ACTIVE",
    spawnedAt: new Date(),
    expiresAt,
  });
  if (!run) return null;

  const nextDelay = randomDelay(config.minDelayMs, config.maxDelayMs);
  await db.updateConfig(guildId, {
    nextRunAt: new Date(Date.now() + nextDelay),
  });

  if (DEBUG)
    logger.info("[SniperChallenge] Challenge spawned", {
      guildId,
      channelId,
      runId: run.id,
      expiresAt,
    });
  return run;
}

async function handleShoot(interaction, challengeId) {
  const userId = interaction.user.id;
  const guildId = interaction.guildId;

  if (interaction.user.bot) return { success: false, reason: "bot" };

  const run = await db.findRun(challengeId);
  if (!run) return { success: false, reason: "unknown_challenge" };
  if (run.status !== "ACTIVE")
    return { success: false, reason: "already_ended" };
  if (new Date() > run.expiresAt) {
    await db.updateRun(challengeId, { status: "EXPIRED" });
    return { success: false, reason: "expired" };
  }

  const wonAt = new Date();
  const reactionTimeMs = run.spawnedAt
    ? wonAt.getTime() - run.spawnedAt.getTime()
    : null;

  // Atomic race-condition check — only one click succeeds
  const result = await db.updateRunMany(
    { id: challengeId, status: "ACTIVE", winnerId: null },
    { winnerId: userId, status: "WON", wonAt, reactionTimeMs },
  );

  if (result.count === 0) return { success: false, reason: "too_slow" };

  // Reply immediately (within Discord's 3s timeout), then process the win in background
  setImmediate(() => {
    processWin(
      guildId,
      userId,
      challengeId,
      reactionTimeMs,
      interaction.client,
    ).catch((err) => {
      logger.error("[SniperChallenge] Background win processing failed", {
        guildId,
        userId,
        error: err.message,
      });
    });
  });

  return { success: true, winnerId: userId, reactionTimeMs };
}

async function processWin(
  guildId,
  userId,
  challengeId,
  reactionTimeMs,
  client,
) {
  const config = await getConfig(guildId);
  if (!config) return;

  // 1. Player stats
  let stats = await db.findStats(guildId, userId);
  if (!stats) {
    stats = { totalWins: 0, currentStreak: 0, bestStreak: 0 };
    await db.upsertStats(guildId, userId, {
      totalWins: 0,
      currentStreak: 0,
      bestStreak: 0,
    });
  }

  const isStreak = config.currentChampionId === userId;
  const newStreak = isStreak && stats ? stats.currentStreak + 1 : 1;
  const newBestStreak = stats
    ? Math.max(stats.bestStreak ?? 0, newStreak)
    : newStreak;

  await db.updateStats(guildId, userId, {
    totalWins: Number(stats.totalWins ?? 0) + 1,
    currentStreak: newStreak,
    bestStreak: newBestStreak,
    lastWinAt: new Date(),
  });

  // 2. Champion role — remove from previous, give to new
  if (
    config.currentChampionId &&
    config.currentChampionId !== userId &&
    config.rewardRoleId
  ) {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        const prevMember = await guild.members
          .fetch(config.currentChampionId)
          .catch(() => null);
        if (prevMember)
          await prevMember.roles.remove(config.rewardRoleId).catch(() => {});
      }
    } catch (err) {
      logger.warn(
        "[SniperChallenge] Failed to remove role from previous champion",
        { prevChampion: config.currentChampionId, error: err.message },
      );
    }
  }

  if (config.rewardRoleId) {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) await member.roles.add(config.rewardRoleId).catch(() => {});
      }
    } catch (err) {
      logger.warn("[SniperChallenge] Failed to give role to winner", {
        userId,
        error: err.message,
      });
    }
  }

  // 3. Update config
  await db.updateConfig(guildId, {
    currentChampionId: userId,
    currentChampionSince: new Date(),
    lastWinnerId: userId,
    totalChallengesCompleted: (config.totalChallengesCompleted ?? 0) + 1,
  });

  // 4. Edit challenge message
  const run = await db.findRun(challengeId);
  if (run?.messageId && run?.channelId) {
    try {
      const channel = client.channels.cache.get(run.channelId);
      if (channel) {
        const message = await channel.messages
          .fetch(run.messageId)
          .catch(() => null);
        if (message) {
          const {
            ActionRowBuilder,
            ButtonBuilder,
            ButtonStyle,
          } = require("discord.js");
          const wonEmbed = buildWonEmbed(userId, reactionTimeMs);
          const disabledButton = new ButtonBuilder()
            .setCustomId("sniper:shoot")
            .setLabel("Claimed")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🔫")
            .setDisabled(true);
          await message
            .edit({
              embeds: [wonEmbed],
              components: [
                new ActionRowBuilder().addComponents(disabledButton),
              ],
              files: getWinnerAnnouncementAttachments(),
            })
            .catch(() => {});
        }
      }
    } catch (err) {
      logger.warn("[SniperChallenge] Failed to edit challenge message", {
        error: err.message,
      });
    }
  }

  // 5. Winner announcement
  const freshStats = await db.findStats(guildId, userId);
  const notifChannelId = config.notificationChannelId || run?.channelId;
  if (notifChannelId) {
    try {
      const notifChannel = client.channels.cache.get(notifChannelId);
      if (notifChannel) {
        await notifChannel
          .send({
            content: `🏆 <@${userId}> just stole the top spot!`,
            embeds: [
              buildWinnerAnnouncementEmbed(
                userId,
                freshStats?.totalWins ?? 1,
                freshStats?.currentStreak ?? 1,
              ),
            ],
            files: getWinnerAnnouncementAttachments(),
          })
          .catch(() => {});
      }
    } catch (err) {
      logger.warn("[SniperChallenge] Failed to send winner announcement", {
        error: err.message,
      });
    }
  }

  // 6. Leaderboard
  try {
    await updateLeaderboard(guildId, client);
  } catch (err) {
    logger.warn("[SniperChallenge] Failed to update leaderboard", {
      error: err.message,
    });
  }

  if (DEBUG)
    logger.info("[SniperChallenge] Winner processed", {
      guildId,
      userId,
      reactionTimeMs,
    });
}

async function handleExpiry(run, client) {
  if (!run.messageId || !run.channelId) return;
  try {
    const channel = client.channels.cache.get(run.channelId);
    if (!channel) return;
    const message = await channel.messages
      .fetch(run.messageId)
      .catch(() => null);
    if (!message) return;
    const {
      ActionRowBuilder,
      ButtonBuilder,
      ButtonStyle,
    } = require("discord.js");
    const expiredEmbed = buildExpiredEmbed();
    const disabledButton = new ButtonBuilder()
      .setCustomId("sniper:shoot")
      .setLabel("Expired")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔫")
      .setDisabled(true);
    await message
      .edit({
        embeds: [expiredEmbed],
        components: [new ActionRowBuilder().addComponents(disabledButton)],
      })
      .catch(() => {});
  } catch (err) {
    logger.warn("[SniperChallenge] Failed to edit expired message", {
      error: err.message,
    });
  }
  await db.updateRun(run.id, { status: "EXPIRED" });
}

async function pauseChallenges(guildId) {
  await db.updateConfig(guildId, { paused: true, nextRunAt: null });
}

async function resumeChallenges(guildId, client) {
  const config = await getConfig(guildId);
  if (!config || !config.enabled) return;
  await db.updateConfig(guildId, { paused: false });
  const nextRunAt = new Date(
    Date.now() + randomDelay(config.minDelayMs, config.maxDelayMs),
  );
  await db.updateConfig(guildId, { nextRunAt });
  if (DEBUG) logger.info("[SniperChallenge] Resumed", { guildId, nextRunAt });
}

async function forceChallenge(guildId, client) {
  const config = await getConfig(guildId);
  if (!config) return { success: false, reason: "no_config" };
  const issues = validateSetup(config);
  if (issues.length > 0)
    return { success: false, reason: "invalid_setup", issues };
  const active = await db.findActiveRun(guildId);
  if (active) await db.updateRun(active.id, { status: "CANCELLED" });
  const run = await spawnChallenge(guildId, client);
  if (!run) return { success: false, reason: "spawn_failed" };
  return { success: true, runId: run.id };
}

async function cancelActive(guildId) {
  const active = await db.findActiveRun(guildId);
  if (!active) return false;
  await db.updateRun(active.id, { status: "CANCELLED" });
  return true;
}

async function resetStats(guildId) {
  await db.deleteStats({ guildId });
  await db.deleteRuns({ guildId });
  await db.updateConfig(guildId, {
    currentChampionId: null,
    currentChampionSince: null,
    lastWinnerId: null,
    totalChallengesCompleted: 0,
  });
}

async function clearChampion(guildId, client) {
  const config = await getConfig(guildId);
  if (!config?.currentChampionId) return;
  if (config.rewardRoleId) {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        const member = await guild.members
          .fetch(config.currentChampionId)
          .catch(() => null);
        if (member)
          await member.roles.remove(config.rewardRoleId).catch(() => {});
      }
    } catch {}
  }
  await db.updateConfig(guildId, {
    currentChampionId: null,
    currentChampionSince: null,
  });
}

async function deleteConfig(guildId) {
  await db.deleteStats({ guildId });
  await db.deleteRuns({ guildId });
  await db.deleteConfig(guildId);
}

async function getPlayerStats(guildId, userId) {
  return db.findStats(guildId, userId);
}

async function getTopPlayers(guildId, limit = 10) {
  return db.findTopPlayers(guildId, limit);
}

async function markExpiredRuns() {
  const expiredRuns = await db.findExpiredRuns();
  if (expiredRuns.length > 0) {
    await db.updateRunMany(
      { id: { in: expiredRuns.map((r) => r.id) } },
      { status: "EXPIRED" },
    );
    if (DEBUG)
      logger.info("[SniperChallenge] Marked expired runs", {
        count: expiredRuns.length,
      });
  }
  return expiredRuns;
}

module.exports = {
  getConfig,
  ensureConfig,
  validateSetup,
  spawnChallenge,
  handleShoot,
  processWin,
  handleExpiry,
  pauseChallenges,
  resumeChallenges,
  forceChallenge,
  cancelActive,
  resetStats,
  clearChampion,
  deleteConfig,
  getPlayerStats,
  getTopPlayers,
  markExpiredRuns,
};
